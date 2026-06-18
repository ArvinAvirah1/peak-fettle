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
 *   8. BACKUP_SCHEMA_VERSION is 2.
 *   9. BACKUP_TABLES contains all 21 registered tables.
 *  10. makeExportDoc sets schemaVersion 2.
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
const { runMigrations } = migrations;
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
    eq(v1, 7, 'expected version 7:');
  });

  // 2. Fresh install reaches the latest version
  await test('fresh install reaches user_version 7', async () => {
    const db = makeStubDb();
    eq(db._pragmas.user_version, 0, 'starts at 0:');
    await runMigrations(db);
    eq(db._pragmas.user_version, 7, 'should be 7 after migration:');
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

  // 8. BACKUP_SCHEMA_VERSION is 2
  await test('BACKUP_SCHEMA_VERSION is 2', () => {
    eq(BACKUP_SCHEMA_VERSION, 2, 'BACKUP_SCHEMA_VERSION:');
  });

  // 9. BACKUP_TABLES contains all 21 tables
  await test('BACKUP_TABLES contains all 21 registered tables', () => {
    const expected = [
      'workouts', 'sets', 'schedule', 'avatar', 'bodyweight', 'exercise_prefs', 'exercise_goals',
      'plans', 'routines', 'streaks', 'streak_overrides', 'daily_health_log', 'daily_health_metrics',
      'habits', 'user_weekly_goals', 'user_constraints', 'exercise_prs', 'user_confirmed_1rm',
      'user_cosmetics', 'user_equipped_cosmetics', 'user_profile',
    ];
    eq(BACKUP_TABLES.length, expected.length,
      'BACKUP_TABLES.length ' + BACKUP_TABLES.length + ' expected ' + expected.length + ':');
    for (const t of expected) {
      assert(BACKUP_TABLES.includes(t), 'BACKUP_TABLES missing: ' + t);
    }
  });

  // 10. makeExportDoc sets schemaVersion 2
  await test('makeExportDoc produces schemaVersion 2', () => {
    const doc = makeExportDoc({});
    eq(doc.schemaVersion, 2, 'schemaVersion:');
    eq(doc.format, 'peak-fettle-backup', 'format:');
    assert(typeof doc.exportedAt === 'string', 'exportedAt should be string');
  });

  // ---------------------------------------------------------------------------
  console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) process.exit(1);
})();
