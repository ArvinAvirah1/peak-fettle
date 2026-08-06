/**
 * migrations.test.js — Agent L test suite (SPEC-094A)
 *
 * Uses the proven typescript-transpile pattern from backup-export.test.js:
 *   require('typescript').transpileModule → eval in a fresh module context.
 * No jest, no Babel, no expo-sqlite needed. Run:
 *   node mobile/src/db/__tests__/migrations.test.js
 *
 * Tests:
 *   1. Runner idempotence: run twice → user_version unchanged.
 *   2. Fresh install reaches user_version 2.
 *   3. All v2 tables created on fresh install (10 spot-checked).
 *   4. SCHEMA_V2_STATEMENTS is non-empty array of strings (>= 17 entries).
 *   5. v1→v2 backup up-migration: missing v2 tables become empty arrays.
 *   6. parseImport rejects backup newer than app.
 *   7. parseImport accepts v2 doc and preserves rows.
 *   8. BACKUP_SCHEMA_VERSION is 3.
 *   9. BACKUP_TABLES contains all 21 registered tables.
 *  10. makeExportDoc sets schemaVersion 3.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Resolve the mobile/ root from this file's location so the suite runs on any
// machine and CI — not a long-gone agent sandbox mount.
// __dirname = <repo>/mobile/src/db/__tests__  →  up 3 = <repo>/mobile
const REPO = path.resolve(__dirname, '..', '..', '..');
const ts = require(path.join(REPO, 'node_modules', 'typescript'));

// ---------------------------------------------------------------------------
// TS loader — transpiles a .ts file and evals it in a module context.
// deps: map of module specifier → already-loaded exports object (for stubs).
// ---------------------------------------------------------------------------
function load(relPath, deps) {
  deps = deps || {};
  const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const requireStub = function (id) {
    // Strip relative prefixes to get the base name for stub lookup.
    const key = id.replace(/^\.\//, '').replace(/^\.\.\//, '');
    if (deps[key]) return deps[key];
    if (deps[id]) return deps[id];
    // Pass through real node requires.
    try { return require(id); } catch (_) { return {}; }
  };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', '__dirname', '__filename', js)(
    mod, mod.exports, requireStub,
    path.dirname(path.join(REPO, relPath)),
    path.join(REPO, relPath)
  );
  return mod.exports;
}

// ---------------------------------------------------------------------------
// Load modules in dependency order.
// localSchema has no deps beyond Node builtins.
// migrations depends on localSchema (via relative './localSchema').
// exportEngine is standalone.
// ---------------------------------------------------------------------------
const localSchema = load('src/db/localSchema.ts');
const migrations = load('src/db/migrations.ts', {
  // Provide localSchema as the relative dep migrations.ts imports.
  './localSchema': localSchema,
  localSchema: localSchema,
});
const exportEngine = load('src/data/backup/exportEngine.ts');

const { SCHEMA_V2_STATEMENTS } = localSchema;
const { runMigrations, MIGRATIONS } = migrations;

// Derived, NOT hardcoded: every added migration used to break 8 separate
// assertions that each spelled out the then-current version. The intent of
// those tests is "a baseline of vN reaches the LATEST version", so express
// exactly that and let the number follow the migration list.
const LATEST_VERSION = Math.max.apply(null, MIGRATIONS.map(function (m) { return m.v; }));
const {
  parseImport,
  makeExportDoc,
  BACKUP_SCHEMA_VERSION,
  BACKUP_TABLES,
} = exportEngine;

// ---------------------------------------------------------------------------
// In-memory stub DB
// ---------------------------------------------------------------------------
function makeStubDb() {
  const pragmas = { user_version: 0 };
  const createdTables = new Set();
  const executedSql = []; // every execute() statement, for index/DDL assertions (v10 test)
  // table name → Set of column names. Populated from CREATE TABLE column lists
  // and from guarded ALTER TABLE ADD COLUMN, so the migration runner's
  // pragma_table_info idempotency check (getAll below) returns truthfully.
  const tableColumns = {};

  function ensureCols(table) {
    if (!tableColumns[table]) tableColumns[table] = new Set();
    return tableColumns[table];
  }

  return {
    _pragmas: pragmas,
    _createdTables: createdTables,
    _tableColumns: tableColumns,
    _executedSql: executedSql,

    async getAll(sql, params) {
      // Emulate: SELECT name FROM pragma_table_info(?) WHERE name = ?
      // params = [table, column]; return a one-row array iff the column exists.
      if (/pragma_table_info/i.test(sql)) {
        const table = params && params[0];
        const column = params && params[1];
        const cols = tableColumns[table];
        return cols && cols.has(column) ? [{ name: column }] : [];
      }
      return [];
    },

    async getFirst(sql) {
      if (/PRAGMA user_version/.test(sql)) {
        return { user_version: pragmas.user_version };
      }
      return null;
    },

    async execute(sql) {
      executedSql.push(sql);
      const pragmaSet = sql.match(/PRAGMA\s+user_version\s*=\s*(\d+)/i);
      if (pragmaSet) {
        pragmas.user_version = parseInt(pragmaSet[1], 10);
        return;
      }
      const createMatch = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(([\s\S]*)\)/i);
      if (createMatch) {
        const table = createMatch[1];
        createdTables.add(table);
        // Record column names from the CREATE body so later guarded ALTERs see
        // the existing columns (each line's first token is the column name;
        // skip table-level CHECK/PRIMARY/UNIQUE/FOREIGN constraint clauses).
        const cols = ensureCols(table);
        for (const rawLine of createMatch[2].split(',')) {
          const tok = rawLine.trim().split(/\s+/)[0];
          if (!tok) continue;
          if (/^(CHECK|PRIMARY|UNIQUE|FOREIGN|CONSTRAINT)$/i.test(tok)) continue;
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) continue;
          cols.add(tok);
        }
        return;
      }
      const alterMatch = sql.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
      if (alterMatch) {
        ensureCols(alterMatch[1]).add(alterMatch[2]);
        return;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Minimal harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (err) {
    console.log('  FAIL  ' + name + ' — ' + err.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
(async () => {
  console.log('\nAgent L — migrations.test.js\n');

  // 1. Idempotence
  await test('runner idempotence: run twice = same version', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    const v1 = db._pragmas.user_version;
    await runMigrations(db);
    const v2 = db._pragmas.user_version;
    eq(v1, v2, 'version changed on second run:');
    eq(v1, LATEST_VERSION, 'expected latest version:');
  });

  // 2. Fresh install reaches the latest version
  await test('fresh install reaches the latest user_version', async () => {
    const db = makeStubDb();
    eq(db._pragmas.user_version, 0, 'starts at 0:');
    await runMigrations(db);
    eq(db._pragmas.user_version, LATEST_VERSION, 'should be at latest after migration:');
  });

  // 3. v2 tables created (10 spot-checked)
  await test('fresh install creates all v2 tables (10 spot-checked)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    const required = [
      'plans', 'routines', 'streaks', 'streak_overrides',
      'daily_health_log', 'daily_health_metrics', 'habits',
      'user_weekly_goals', 'user_constraints', 'user_profile',
    ];
    for (const t of required) {
      assert(db._createdTables.has(t), 'table not created: ' + t);
    }
    // v5 device-local KV table is created too.
    assert(db._createdTables.has('app_settings'), 'table not created: app_settings');
    // v7 Pro-upgrade migration ledger is created too.
    assert(db._createdTables.has('migration_state'), 'table not created: migration_state');
  });

  // 3b. v6 guarded ALTERs land their columns on a fresh install.
  await test('fresh install adds sets.metrics_json and user_profile.display_name (v6)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    assert(
      db._tableColumns['sets'] && db._tableColumns['sets'].has('metrics_json'),
      'sets.metrics_json column missing after migration',
    );
    assert(
      db._tableColumns['user_profile'] && db._tableColumns['user_profile'].has('display_name'),
      'user_profile.display_name column missing after migration',
    );
  });

  // 3c. v8 guarded ALTERs land the expanded survey columns on user_profile.
  await test('fresh install adds v8 expanded-survey columns on user_profile', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    const cols = db._tableColumns['user_profile'];
    assert(cols, 'user_profile has no recorded columns');
    for (const c of ['primary_focus', 'injuries', 'muscle_priorities', 'bodyweight_kg', 'training_days']) {
      assert(cols.has(c), 'user_profile.' + c + ' column missing after v8 migration');
    }
  });

  // 3d. v9 creates the engine-v2 generated_plans persistence table.
  await test('fresh install creates generated_plans table (v9)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    assert(db._createdTables.has('generated_plans'), 'table not created: generated_plans');
    // spot-check the lifecycle columns are recorded so the backup allowlist maps.
    const cols = db._tableColumns['generated_plans'];
    assert(cols, 'generated_plans has no recorded columns');
    for (const c of ['kind', 'status', 'payload', 'survey', 'block_start_day_key', 'adopted_split']) {
      assert(cols.has(c), 'generated_plans.' + c + ' column missing after v9 migration');
    }
  });

  // 3e. v10 creates the workouts(routine_name) perf index (2026-07-03 audit).
  await test('fresh install creates idx_workouts_routine_name (v10)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    assert(
      db._executedSql.some((s) => /idx_workouts_routine_name/i.test(s)),
      'v10 routine_name index statement never executed'
    );
  });

  // 3f. TICKET-129: v11 guarded ALTERs land sets.note + sets.flags on a fresh install.
  await test('fresh install adds sets.note and sets.flags (v11)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    const cols = db._tableColumns['sets'];
    assert(cols, 'sets has no recorded columns');
    assert(cols.has('note'), 'sets.note column missing after v11 migration');
    assert(cols.has('flags'), 'sets.flags column missing after v11 migration');
  });

  // 3g. TICKET-130: v12 creates the body_measurements table + its index.
  await test('fresh install creates body_measurements table + index (v12)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    assert(db._createdTables.has('body_measurements'), 'table not created: body_measurements');
    const cols = db._tableColumns['body_measurements'];
    assert(cols, 'body_measurements has no recorded columns');
    for (const c of ['id', 'metric', 'value', 'unit', 'logged_at', 'synced']) {
      assert(cols.has(c), 'body_measurements.' + c + ' column missing after v12 migration');
    }
    assert(
      db._executedSql.some((s) => /idx_body_measurements_metric/i.test(s)),
      'v12 body_measurements metric index statement never executed'
    );
  });

  // 3h. v3(exact-kg)->v10 upgrade path: a DB already at user_version 10 (the
  // pre-129/130 baseline) picks up ONLY v11+v12 on the next launch, and ends
  // at 12 — proves the upgrade path (not just fresh-install) for both new
  // migrations, per the ticket's "fresh-install AND vN->vN+1 upgrade" DoD.
  await test('v10 -> v11 -> v12 upgrade path applies only the new migrations', async () => {
    const db = makeStubDb();
    // Pre-seed a DB "already at v10": create the tables/columns v1..v10 would
    // have produced (sets base columns + weight_kg, workouts.routine_name,
    // app_settings, etc.) and set user_version = 10 directly, bypassing the
    // runner so this test simulates an existing installed app, not a fresh one.
    await db.execute(
      `CREATE TABLE IF NOT EXISTS sets (
        id TEXT PRIMARY KEY, workout_id TEXT, weight_raw INTEGER, weight_kg REAL,
        metrics_json TEXT
      )`,
    );
    db._pragmas.user_version = 10;
    db._executedSql.length = 0; // reset so this test's assertions only see the NEW work

    await runMigrations(db);

    eq(db._pragmas.user_version, LATEST_VERSION, 'should reach latest from a v10 baseline:');
    assert(db._tableColumns['sets'].has('note'), 'v10->v11 upgrade missing sets.note');
    assert(db._tableColumns['sets'].has('flags'), 'v10->v11 upgrade missing sets.flags');
    assert(db._createdTables.has('body_measurements'), 'v11->v12 upgrade missing body_measurements');
    assert(db._createdTables.has('progress_photos'), 'v12->v13 upgrade missing progress_photos');
    assert(db._createdTables.has('badges_earned'), 'v13->v14 upgrade missing badges_earned');
    // The pre-existing v3 columns must NOT have been touched/duplicated (additive-only).
    assert(db._tableColumns['sets'].has('weight_kg'), 'pre-existing weight_kg column lost on upgrade');
  });

  // 3i. TICKET-133: v13 creates the progress_photos table + its indexes.
  await test('fresh install creates progress_photos table + indexes (v13)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    assert(db._createdTables.has('progress_photos'), 'table not created: progress_photos');
    const cols = db._tableColumns['progress_photos'];
    assert(cols, 'progress_photos has no recorded columns');
    for (const c of ['id', 'file_name', 'taken_at', 'pose', 'note']) {
      assert(cols.has(c), 'progress_photos.' + c + ' column missing after v13 migration');
    }
    assert(
      db._executedSql.some((s) => /idx_progress_photos_taken_at/i.test(s)),
      'v13 progress_photos taken_at index statement never executed'
    );
    assert(
      db._executedSql.some((s) => /idx_progress_photos_pose/i.test(s)),
      'v13 progress_photos pose index statement never executed'
    );
  });

  // 3j. TICKET-143: v14 creates the badges_earned table.
  await test('fresh install creates badges_earned table (v14)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    assert(db._createdTables.has('badges_earned'), 'table not created: badges_earned');
    const cols = db._tableColumns['badges_earned'];
    assert(cols, 'badges_earned has no recorded columns');
    for (const c of ['badge_id', 'earned_at']) {
      assert(cols.has(c), 'badges_earned.' + c + ' column missing after v14 migration');
    }
  });

  // 3k. TICKET-141: v15 guarded ALTER lands exercise_prefs.autoreg_muted on a
  // fresh install (exercise_prefs itself is a v1 base table, not created by
  // runMigrations — same situation as v11's sets.note/sets.flags above; the
  // guarded ALTER still lands because the runner's pragma_table_info check
  // treats an untracked table as "column absent" and proceeds).
  await test('fresh install adds exercise_prefs.autoreg_muted (v15)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    const cols = db._tableColumns['exercise_prefs'];
    assert(cols, 'exercise_prefs has no recorded columns');
    assert(cols.has('autoreg_muted'), 'exercise_prefs.autoreg_muted column missing after v15 migration');
  });

  // 3l. v13(progress_photos)->v16 upgrade path: a DB already at user_version 13
  // (post-TICKET-133, pre-TICKET-143/141/health-metrics-activity) applies
  // v14 + v15 + v16, and all land correctly (badges_earned created,
  // autoreg_muted added, health-metrics activity columns added) without
  // re-running anything already applied.
  await test('v13->v16 upgrade path applies only the new migrations', async () => {
    const db = makeStubDb();
    db._pragmas.user_version = 13;
    await runMigrations(db);
    eq(db._pragmas.user_version, LATEST_VERSION, 'should reach latest from a v13 baseline:');
    assert(db._createdTables.has('badges_earned'), 'v13->v16 upgrade missing badges_earned');
    const cols = db._tableColumns['exercise_prefs'];
    assert(cols && cols.has('autoreg_muted'), 'v13->v16 upgrade missing exercise_prefs.autoreg_muted');
    const metricsCols = db._tableColumns['daily_health_metrics'];
    assert(metricsCols && metricsCols.has('steps'), 'v13->v16 upgrade missing daily_health_metrics.steps');
    assert(metricsCols && metricsCols.has('distance_m'), 'v13->v16 upgrade missing daily_health_metrics.distance_m');
    assert(metricsCols && metricsCols.has('exercise_minutes'), 'v13->v16 upgrade missing daily_health_metrics.exercise_minutes');
  });

  // 3m. TICKET (health-metrics activity fields): v16 guarded ALTERs land
  // steps/distance_m/exercise_minutes on daily_health_metrics on a fresh
  // install.
  await test('fresh install adds daily_health_metrics steps/distance_m/exercise_minutes (v16)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    const cols = db._tableColumns['daily_health_metrics'];
    assert(cols, 'daily_health_metrics has no recorded columns');
    assert(cols.has('steps'), 'daily_health_metrics.steps column missing after v16 migration');
    assert(cols.has('distance_m'), 'daily_health_metrics.distance_m column missing after v16 migration');
    assert(cols.has('exercise_minutes'), 'daily_health_metrics.exercise_minutes column missing after v16 migration');
  });

  // 3n. SUBS-001: v17 creates the exercise_substitutes table + its source_key
  // index on a fresh install.
  await test('fresh install creates exercise_substitutes table + index (v17)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    assert(db._createdTables.has('exercise_substitutes'), 'table not created: exercise_substitutes');
    assert(
      db._executedSql.some((s) => /idx_exercise_substitutes_source/i.test(s)),
      'v17 exercise_substitutes source_key index statement never executed'
    );
  });

  // 3o. SUBS-001: v16->v17 upgrade path — a DB already at user_version 16
  // applies ONLY v17 and lands the new table (fresh-install AND vN->vN+1
  // upgrade DoD, same pattern as 3h/3l).
  await test('v16->v17 upgrade path applies only the new migration', async () => {
    const db = makeStubDb();
    db._pragmas.user_version = 16;
    db._executedSql.length = 0;
    await runMigrations(db);
    eq(db._pragmas.user_version, LATEST_VERSION, 'should reach latest from a v16 baseline:');
    assert(db._createdTables.has('exercise_substitutes'), 'v16->v17 upgrade missing exercise_substitutes');
    assert(
      !db._executedSql.some((s) => /CREATE TABLE IF NOT EXISTS badges_earned/i.test(s)),
      'v16->v17 upgrade re-ran an already-applied migration (badges_earned)'
    );
  });

  // 3p. Fixed-point exact weight entry: v18 guarded ALTERs land
  // sets.weight_centi + sets.weight_unit on a fresh install.
  await test('fresh install adds sets.weight_centi and sets.weight_unit (v18)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    const cols = db._tableColumns['sets'];
    assert(cols, 'sets has no recorded columns');
    assert(cols.has('weight_centi'), 'sets.weight_centi column missing after v18 migration');
    assert(cols.has('weight_unit'), 'sets.weight_unit column missing after v18 migration');
  });

  // 3q. v17->v18 upgrade path — a DB already at user_version 17 applies ONLY
  // v18 and lands the two exact-weight columns (fresh-install AND vN->vN+1
  // upgrade DoD, same pattern as 3h/3l/3o).
  await test('v17->latest upgrade path applies only the new migrations', async () => {
    const db = makeStubDb();
    db._pragmas.user_version = 17;
    db._executedSql.length = 0;
    await runMigrations(db);
    eq(db._pragmas.user_version, LATEST_VERSION, 'should reach latest from a v17 baseline:');
    const cols = db._tableColumns['sets'];
    assert(cols && cols.has('weight_centi'), 'v17->v18 upgrade missing sets.weight_centi');
    assert(cols && cols.has('weight_unit'), 'v17->v18 upgrade missing sets.weight_unit');
    assert(
      !db._executedSql.some((s) => /CREATE TABLE IF NOT EXISTS exercise_substitutes/i.test(s)),
      'v17->v18 upgrade re-ran an already-applied migration (exercise_substitutes)'
    );
  });

  // 3r. Daily weight check-in + weigh-in reminder: v19 creates both tables on a
  // fresh install and lands the two guarded ALTERs on `bodyweight`.
  await test('fresh install creates bodyweight_daily + routine_reminders (v19)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    assert(db._createdTables.has('bodyweight_daily'), 'bodyweight_daily table missing after v19 migration');
    assert(db._createdTables.has('routine_reminders'), 'routine_reminders table missing after v19 migration');
    const cols = db._tableColumns['bodyweight'];
    assert(cols, 'bodyweight has no recorded columns');
    assert(cols.has('source'), 'bodyweight.source column missing after v19 migration');
    assert(cols.has('sample_count'), 'bodyweight.sample_count column missing after v19 migration');
  });

  // 3s. v18->v19 upgrade path — a DB already at user_version 18 applies ONLY
  // v19 (fresh-install AND vN->vN+1 upgrade DoD, same pattern as 3h/3l/3o/3q).
  await test('v18->latest upgrade path applies only the new migrations', async () => {
    const db = makeStubDb();
    db._pragmas.user_version = 18;
    db._executedSql.length = 0;
    await runMigrations(db);
    eq(db._pragmas.user_version, LATEST_VERSION, 'should reach latest from a v18 baseline:');
    assert(db._createdTables.has('bodyweight_daily'), 'v18->v19 upgrade missing bodyweight_daily');
    assert(db._createdTables.has('routine_reminders'), 'v18->v19 upgrade missing routine_reminders');
    const cols = db._tableColumns['bodyweight'];
    assert(cols && cols.has('source'), 'v18->v19 upgrade missing bodyweight.source');
    assert(cols && cols.has('sample_count'), 'v18->v19 upgrade missing bodyweight.sample_count');
    assert(
      !db._executedSql.some((sql) => /CREATE TABLE IF NOT EXISTS exercise_substitutes/i.test(sql)),
      'v18->v19 upgrade re-ran an already-applied migration (exercise_substitutes)'
    );
  });

  // 3t. Resumable sessions: v20 adds workouts.routine_id so Recent Activity can
  // map a logged session back to its routine.
  await test('fresh install adds workouts.routine_id (v20)', async () => {
    const db = makeStubDb();
    await runMigrations(db);
    const cols = db._tableColumns['workouts'];
    assert(cols, 'workouts has no recorded columns');
    assert(cols.has('routine_id'), 'workouts.routine_id column missing after v20 migration');
    assert(cols.has('routine_name'), 'v4 workouts.routine_name should still be present');
  });

  // 3u. v19->v20 upgrade path applies ONLY v20.
  await test('v19->v20 upgrade path applies only the new migration', async () => {
    const db = makeStubDb();
    db._pragmas.user_version = 19;
    db._executedSql.length = 0;
    await runMigrations(db);
    eq(db._pragmas.user_version, LATEST_VERSION, 'should reach latest from a v19 baseline:');
    const cols = db._tableColumns['workouts'];
    assert(cols && cols.has('routine_id'), 'v19->v20 upgrade missing workouts.routine_id');
    assert(
      !db._executedSql.some((sql) => /CREATE TABLE IF NOT EXISTS bodyweight_daily/i.test(sql)),
      'v19->v20 upgrade re-ran an already-applied migration (bodyweight_daily)'
    );
  });

  // 4. SCHEMA_V2_STATEMENTS shape
  await test('SCHEMA_V2_STATEMENTS is non-empty array of strings (>= 17)', () => {
    assert(Array.isArray(SCHEMA_V2_STATEMENTS), 'should be array');
    assert(SCHEMA_V2_STATEMENTS.length >= 17, 'expected >= 17, got ' + SCHEMA_V2_STATEMENTS.length);
    for (const s of SCHEMA_V2_STATEMENTS) {
      assert(typeof s === 'string', 'each entry should be string');
    }
  });

  // 5. v1→v2 backup up-migration
  await test('v1 backup up-migrates: missing v2 tables become empty arrays', () => {
    const v1Doc = {
      format: 'peak-fettle-backup',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      tables: {
        workouts: [{ id: 'w1' }],
        sets: [], schedule: [], avatar: [],
        bodyweight: [], exercise_prefs: [], exercise_goals: [],
      },
    };
    const result = parseImport(v1Doc, 2);
    assert(result.ok, 'parseImport failed: ' + (result.ok ? '' : result.error));
    eq(result.version, 2, 'version after up-migration:');
    eq(result.tables['workouts'].length, 1, 'workouts row should survive:');
    const v2Only = ['plans', 'routines', 'streaks', 'daily_health_log', 'user_profile'];
    for (const t of v2Only) {
      assert(Array.isArray(result.tables[t]), t + ' should be array after up-migration');
      eq(result.tables[t].length, 0, t + ' should be empty:');
    }
  });

  // 6. Reject newer backup
  await test('parseImport rejects backup newer than app version', () => {
    const futureDoc = {
      format: 'peak-fettle-backup',
      schemaVersion: 99,
      exportedAt: new Date().toISOString(),
      tables: {},
    };
    const result = parseImport(futureDoc, 2);
    assert(!result.ok, 'should reject future version');
    assert(!result.ok && result.error.includes('newer'),
      'error should mention newer, got: ' + (!result.ok ? result.error : ''));
  });

  // 7. Accept valid v2 doc
  await test('parseImport accepts valid v2 doc and preserves rows', () => {
    const v2Doc = {
      format: 'peak-fettle-backup',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      tables: {
        workouts: [{ id: 'abc' }],
        plans: [{ id: 'p1', name: 'My Plan' }],
        user_profile: [{ id: 'active', tier: 'free' }],
      },
    };
    const result = parseImport(v2Doc, 2);
    assert(result.ok, 'should accept v2 doc');
    eq(result.tables['workouts'].length, 1, 'workouts row preserved:');
    eq(result.tables['plans'].length, 1, 'plans row preserved:');
    eq(result.tables['user_profile'].length, 1, 'user_profile row preserved:');
    assert(!result.tables['not_a_real_table'], 'unknown tables should be stripped');
  });

  // 8. BACKUP_SCHEMA_VERSION is 3 (bumped for schema v21 qualifiers)
  await test('BACKUP_SCHEMA_VERSION is 3', () => {
    eq(BACKUP_SCHEMA_VERSION, 3, 'BACKUP_SCHEMA_VERSION:');
  });

  // 9. BACKUP_TABLES contains all 28 tables
  await test('BACKUP_TABLES contains all 28 registered tables', () => {
    const expected = [
      'workouts', 'sets', 'schedule', 'avatar', 'bodyweight', 'exercise_prefs', 'exercise_goals',
      'plans', 'routines', 'streaks', 'streak_overrides', 'daily_health_log', 'daily_health_metrics',
      'habits', 'user_weekly_goals', 'user_constraints', 'exercise_prs', 'user_confirmed_1rm',
      'user_cosmetics', 'user_equipped_cosmetics', 'user_profile',
      'generated_plans', // v9
      'body_measurements', // v12 (TICKET-130)
      'progress_photos', // v13 (TICKET-133)
      'badges_earned', // v14 (TICKET-143)
      'exercise_substitutes', // v17 (SUBS-001)
      'bodyweight_daily', // v19 (daily weight check-in)
      'routine_reminders', // v19 (per-routine weigh-in reminder)
      'custom_qualifier_values', // v21 (exercise qualifiers — user-authored options)
    ];
    eq(BACKUP_TABLES.length, expected.length,
      'BACKUP_TABLES.length ' + BACKUP_TABLES.length + ' expected ' + expected.length + ':');
    for (const t of expected) {
      assert(BACKUP_TABLES.includes(t), 'BACKUP_TABLES missing: ' + t);
    }
  });

  // 10. makeExportDoc sets schemaVersion 3 (bumped for schema v21 qualifiers)
  await test('makeExportDoc produces schemaVersion 3', () => {
    const doc = makeExportDoc({});
    eq(doc.schemaVersion, 3, 'schemaVersion:');
    eq(doc.format, 'peak-fettle-backup', 'format:');
    assert(typeof doc.exportedAt === 'string', 'exportedAt should be string');
  });

  // 11. TICKET-129/130: export -> import round-trip survives sets.note/flags
  // and a body_measurements row (AC5 / AC1 respectively — "confirm exportEngine
  // picks up the new columns ... prove they survive an export->import round-trip").
  await test('export->import round-trip preserves sets.note/flags + body_measurements', () => {
    const tables = {
      sets: [
        {
          id: 's1', workout_id: 'w1', user_id: 'u1', exercise_id: 'e1', kind: 'lift',
          set_index: 0, reps: 5, weight_kg: 100, rir: 2, note: 'felt pinchy',
          flags: 5, // paused (1) + belt (4)
          logged_at: '2026-07-03T00:00:00.000Z', synced: 0,
        },
      ],
      body_measurements: [
        { id: 'm1', metric: 'waist', value: 81.5, unit: 'cm', logged_at: '2026-07-03T00:00:00.000Z', synced: 0 },
      ],
    };
    const doc = makeExportDoc(tables);
    // Round-trip through JSON, exactly as the real export/import (file) path does.
    const roundTripped = JSON.parse(JSON.stringify(doc));
    const result = parseImport(roundTripped, BACKUP_SCHEMA_VERSION);
    assert(result.ok, 'round-trip parseImport failed');
    eq(result.tables['sets'].length, 1, 'sets row survives round-trip:');
    eq(result.tables['sets'][0].note, 'felt pinchy', 'sets.note survives round-trip:');
    eq(result.tables['sets'][0].flags, 5, 'sets.flags survives round-trip:');
    eq(result.tables['body_measurements'].length, 1, 'body_measurements row survives round-trip:');
    eq(result.tables['body_measurements'][0].metric, 'waist', 'body_measurements.metric survives round-trip:');
    eq(result.tables['body_measurements'][0].value, 81.5, 'body_measurements.value survives round-trip:');
  });

  // 12. TICKET-133/143: export -> import round-trip survives progress_photos
  // METADATA (not the image file — that's a separate opt-in bundle) and a
  // badges_earned row.
  await test('export->import round-trip preserves progress_photos metadata + badges_earned', () => {
    const tables = {
      progress_photos: [
        { id: 'p1', file_name: 'pf_photo_1.jpg', taken_at: '2026-07-03T00:00:00.000Z', pose: 'front', note: 'week 1' },
      ],
      badges_earned: [
        { badge_id: 'workouts_10', earned_at: '2026-07-03T00:00:00.000Z' },
      ],
    };
    const doc = makeExportDoc(tables);
    const roundTripped = JSON.parse(JSON.stringify(doc));
    const result = parseImport(roundTripped, BACKUP_SCHEMA_VERSION);
    assert(result.ok, 'round-trip parseImport failed');
    eq(result.tables['progress_photos'].length, 1, 'progress_photos row survives round-trip:');
    eq(result.tables['progress_photos'][0].file_name, 'pf_photo_1.jpg', 'progress_photos.file_name survives round-trip:');
    eq(result.tables['progress_photos'][0].pose, 'front', 'progress_photos.pose survives round-trip:');
    eq(result.tables['badges_earned'].length, 1, 'badges_earned row survives round-trip:');
    eq(result.tables['badges_earned'][0].badge_id, 'workouts_10', 'badges_earned.badge_id survives round-trip:');
  });

  // 13. v21 (exercise qualifiers): the three new `sets` columns and the new
  // custom_qualifier_values table must survive an export->import round trip.
  //
  // This is THE regression test for the silent-data-loss path that review found:
  // sanitizeRowColumns drops any column missing from COLUMN_ALLOWLIST fail-safe
  // (DATA-01), so shipping schema v21 without the exportEngine registry entries
  // would delete every set's qualifiers on restore with no error at all. Worse,
  // stripped qualifiers would let percentile-EXCLUDED sets silently rejoin the
  // strength model. If someone adds a v22 column and forgets the registry, this
  // test is what should fail.
  await test('v21: export->import round-trip preserves set qualifiers + custom options', () => {
    const tables = {
      sets: [
        {
          id: 's-q1', workout_id: 'w1', user_id: 'u1', exercise_id: 'e-pulldown', kind: 'lift',
          set_index: 0, reps: 10, weight_kg: 60, weight_centi: 6000, weight_unit: 'kg',
          qualifiers_json: '{"attachment":"rope","grip_width":"close"}',
          qualifier_key: 'attachment=rope|grip_width=close',
          load_effective_kg: 30, // 2:1 pulley — felt load is half the pin weight
          logged_at: '2026-08-05T00:00:00.000Z', synced: 0,
        },
      ],
      custom_qualifier_values: [
        {
          id: 'cq1', axis_id: 'attachment', exercise_id: null, label: 'angled tricep bar',
          created_at: '2026-08-05T00:00:00.000Z', updated_at: '2026-08-05T00:00:00.000Z',
        },
      ],
    };
    const doc = makeExportDoc(tables);
    const roundTripped = JSON.parse(JSON.stringify(doc));
    const result = parseImport(roundTripped, BACKUP_SCHEMA_VERSION);
    assert(result.ok, 'round-trip parseImport failed');

    const s = result.tables['sets'][0];
    eq(result.tables['sets'].length, 1, 'qualifier set survives round-trip:');
    eq(s.qualifiers_json, '{"attachment":"rope","grip_width":"close"}', 'sets.qualifiers_json survives:');
    eq(s.qualifier_key, 'attachment=rope|grip_width=close', 'sets.qualifier_key survives:');
    eq(s.load_effective_kg, 30, 'sets.load_effective_kg survives:');
    // The typed entry must be untouched by any of this (v18 invariant).
    eq(s.weight_centi, 6000, 'sets.weight_centi still exact:');
    eq(s.weight_unit, 'kg', 'sets.weight_unit still exact:');

    const c = result.tables['custom_qualifier_values'][0];
    eq(result.tables['custom_qualifier_values'].length, 1, 'custom option survives round-trip:');
    eq(c.label, 'angled tricep bar', 'custom_qualifier_values.label survives:');
    eq(c.axis_id, 'attachment', 'custom_qualifier_values.axis_id survives:');
  });

  // 14. A v2 backup (pre-qualifiers) must still restore on a v3 app. The 2->3
  // up-migration fills in custom_qualifier_values as empty; the new `sets`
  // columns need no migration because NULL legitimately means "legacy / not
  // recorded" — and the percentile filter treats NULL as passthrough, so
  // restoring an old backup never drops sets out of the strength model.
  await test('v21: a v2 backup restores cleanly on a v3 app', () => {
    const legacyDoc = {
      format: 'peak-fettle-backup',
      schemaVersion: 2,
      exportedAt: '2026-07-01T00:00:00.000Z',
      tables: {
        sets: [
          {
            id: 's-old', workout_id: 'w0', user_id: 'u1', exercise_id: 'e1', kind: 'lift',
            set_index: 0, reps: 5, weight_kg: 100,
            logged_at: '2026-07-01T00:00:00.000Z', synced: 1,
          },
        ],
      },
    };
    const result = parseImport(legacyDoc, BACKUP_SCHEMA_VERSION);
    assert(result.ok, 'v2 backup should restore on a v3 app: ' + (result.error || ''));
    eq(result.tables['sets'].length, 1, 'legacy set survives the 2->3 migration:');
    assert(
      Array.isArray(result.tables['custom_qualifier_values']),
      'custom_qualifier_values should be initialized as an array by the 2->3 migration',
    );
    eq(result.tables['custom_qualifier_values'].length, 0, 'custom options start empty:');
    // Legacy sets carry no qualifiers — NULL/undefined, never a fabricated default.
    assert(
      result.tables['sets'][0].qualifiers_json == null,
      'a legacy set must NOT gain a fabricated qualifiers_json',
    );
  });

  // 15. v21 migration statement shape: the ALTERs must precede the index that
  // depends on the new column, or the CREATE INDEX fails on a real device.
  await test('v21: statements order ALTERs before the dependent index', () => {
    const v21 = MIGRATIONS.find((m) => m.v === 21);
    assert(v21, 'MIGRATION_V21 should be registered');
    const stmts = v21.statements;
    const keyColIdx = stmts.findIndex(
      (s) => typeof s === 'object' && s.column === 'qualifier_key',
    );
    const idxIdx = stmts.findIndex(
      (s) => typeof s === 'string' && s.includes('idx_sets_ex_qualkey'),
    );
    assert(keyColIdx >= 0, 'qualifier_key ALTER should be present');
    assert(idxIdx >= 0, 'idx_sets_ex_qualkey CREATE INDEX should be present');
    assert(
      keyColIdx < idxIdx,
      'ALTER adding qualifier_key must come BEFORE the index that uses it',
    );
    // Every ALTER in v21 must be additive (nullable, no NOT NULL/DEFAULT rewrite).
    for (const s of stmts) {
      if (typeof s === 'object' && s.type === 'alter_add_column') {
        assert(
          !/NOT NULL/i.test(s.definition),
          'v21 is forward-only and must not add a NOT NULL column: ' + s.column,
        );
      }
    }
  });

  // ---------------------------------------------------------------------------
  console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) process.exit(1);
})();
