'use strict';

/**
 * Schema-v3 migration (LIFEOS TICKET-151): habit_type/target_value/target_unit/
 * weekly_quota on lo_habits, value/note on lo_habit_logs, metric_type/
 * metric_target/metric_current on lo_goals, lo_mood_checkins recreated WITHOUT
 * UNIQUE(date) (multi-check-in/day, T158) with rows preserved, and a new
 * lo_habit_pauses table. Since SCHEMA_VERSION is now 3, a FRESH db must get the
 * complete v3 shape (including the v2 feature tables) straight from
 * SCHEMA_STATEMENTS with ZERO migration DDL — only v1/v2 DBs upgrade via
 * runMigrations(). Drives the REAL migrations.ts + localSchema.ts with a small
 * in-memory fake db (no native SQLite needed) that additionally tracks rows so
 * the mood-table recreate (INSERT ... SELECT / DROP / RENAME) can be verified
 * for data preservation, not just table existence.
 *
 * Run: node __tests__/migrations-v3.test.js
 */

const path = require('path');
const assert = require('assert');
const { loadTs } = require('./tsLoader');

const { runMigrations } = loadTs(path.join(__dirname, '..', 'src', 'db', 'migrations.ts'));
const schema = loadTs(path.join(__dirname, '..', 'src', 'db', 'localSchema.ts'));
const { SCHEMA_STATEMENTS, CREATE_HABITS, CREATE_GOALS, CREATE_MOOD_CHECKINS, BACKUP_TABLES } = schema;

const V2_TABLES = ['lo_app_ratings', 'lo_share_events', 'lo_partner', 'lo_affirmations'];

/**
 * Minimal fake of the localDb surface runMigrations/SCHEMA_STATEMENTS use
 * (getFirst/execute), extended to track per-table ROWS and columns so we can
 * simulate the mood-checkins recreate (CREATE / INSERT..SELECT / DROP / RENAME)
 * and plain ALTER TABLE ADD COLUMN.
 */
function makeFakeDb(seed = {}) {
  const meta = new Map(Object.entries(seed.meta || {}));
  // tableName -> { columns: string[], rows: object[] }
  const tableDefs = new Map();
  for (const [name, def] of Object.entries(seed.tables || {})) {
    tableDefs.set(name, { columns: [...(def.columns || [])], rows: (def.rows || []).map((r) => ({ ...r })) });
  }
  const ddl = [];

  function ensureTable(name) {
    if (!tableDefs.has(name)) tableDefs.set(name, { columns: [], rows: [] });
    return tableDefs.get(name);
  }

  function parseColumnsFromCreate(sql) {
    // Pull the parenthesised column-def block, split on top-level commas, take the
    // leading identifier of each column definition (skips PRIMARY KEY/UNIQUE-only lines).
    const open = sql.indexOf('(');
    const close = sql.lastIndexOf(')');
    if (open === -1 || close === -1) return [];
    const body = sql.slice(open + 1, close);
    const parts = [];
    let depth = 0;
    let cur = '';
    for (const ch of body) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) parts.push(cur);
    const cols = [];
    for (const raw of parts) {
      const trimmed = raw.trim();
      const upper = trimmed.toUpperCase();
      if (upper.startsWith('PRIMARY KEY') || upper.startsWith('UNIQUE') || upper.startsWith('FOREIGN KEY') || upper.startsWith('CHECK')) {
        continue;
      }
      const m = /^["'`\[]?([A-Za-z_][A-Za-z0-9_]*)/.exec(trimmed);
      if (m) cols.push(m[1]);
    }
    return cols;
  }

  return {
    meta,
    tableDefs,
    ddl,
    tables: {
      has: (name) => tableDefs.has(name),
    },
    async getFirst(sql) {
      if (/FROM\s+lo_meta/i.test(sql)) {
        const m = /key\s*=\s*'([^']+)'/i.exec(sql);
        const key = m ? m[1] : null;
        return key && meta.has(key) ? { value: meta.get(key) } : null;
      }
      return null;
    },
    async execute(sql, params = []) {
      ddl.push(sql);

      // INSERT OR REPLACE INTO lo_meta (...) VALUES (...)
      if (/INSERT OR REPLACE INTO\s+lo_meta/i.test(sql)) {
        const km = /VALUES\s*\(\s*'([^']+)'/i.exec(sql);
        if (km) meta.set(km[1], params[0]);
        return;
      }

      // CREATE TABLE IF NOT EXISTS <name> (...)
      const cre = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(/i.exec(sql);
      if (cre) {
        const name = cre[1];
        const cols = parseColumnsFromCreate(sql);
        if (!tableDefs.has(name)) {
          tableDefs.set(name, { columns: cols, rows: [] });
        } else {
          // IF NOT EXISTS semantics: leave existing rows/columns untouched.
        }
        return;
      }

      // CREATE INDEX ... — no table-state change needed for these tests.
      if (/CREATE INDEX/i.test(sql)) {
        return;
      }

      // ALTER TABLE <name> ADD COLUMN <col> ...
      const alterAdd = /ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i.exec(sql);
      if (alterAdd) {
        const [, name, col] = alterAdd;
        const t = ensureTable(name);
        if (!t.columns.includes(col)) t.columns.push(col);
        // Extract a DEFAULT literal if present so seeded rows can pick it up on read.
        for (const row of t.rows) {
          if (!(col in row)) row[col] = null;
        }
        return;
      }

      // ALTER TABLE <old> RENAME TO <new>
      const rename = /ALTER TABLE\s+(\w+)\s+RENAME TO\s+(\w+)/i.exec(sql);
      if (rename) {
        const [, oldName, newName] = rename;
        const def = tableDefs.get(oldName);
        tableDefs.delete(oldName);
        tableDefs.set(newName, def || { columns: [], rows: [] });
        return;
      }

      // DROP TABLE <name>
      const drop = /DROP TABLE\s+(?:IF EXISTS\s+)?(\w+)/i.exec(sql);
      if (drop) {
        tableDefs.delete(drop[1]);
        return;
      }

      // INSERT INTO <dest> (<cols>) SELECT <cols> FROM <src>
      const insertSelect = /INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*SELECT\s+([^]+?)\s*FROM\s+(\w+)/i.exec(sql);
      if (insertSelect) {
        const [, dest, destColsRaw, selectColsRaw, src] = insertSelect;
        const destCols = destColsRaw.split(',').map((c) => c.trim());
        const selectCols = selectColsRaw.split(',').map((c) => c.trim());
        const destTable = ensureTable(dest);
        const srcTable = ensureTable(src);
        for (const col of destCols) if (!destTable.columns.includes(col)) destTable.columns.push(col);
        for (const row of srcTable.rows) {
          const newRow = {};
          destCols.forEach((dcol, i) => {
            const scol = selectCols[i];
            newRow[dcol] = row[scol];
          });
          destTable.rows.push(newRow);
        }
        return;
      }

      // Unrecognised statement kind — fail loudly so the test suite catches drift
      // between this fake and whatever migrations.ts starts emitting.
      throw new Error(`[fakeDb] unrecognised statement, extend the test fake: ${sql}`);
    },
    /** Test helper: insert a seed row directly (bypasses execute's SQL parsing). */
    seedRow(tableName, row) {
      const t = ensureTable(tableName);
      for (const k of Object.keys(row)) if (!t.columns.includes(k)) t.columns.push(k);
      t.rows.push({ ...row });
    },
  };
}

/** Apply SCHEMA_STATEMENTS the same way ensureInit() does (idempotent, in order). */
async function applySchemaStatements(db) {
  for (const stmt of SCHEMA_STATEMENTS) {
    await db.execute(stmt);
  }
}

let n = 0;
function check(name, actual, expected) {
  n += 1;
  assert.deepStrictEqual(actual, expected, `case ${n} (${name}): got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`  ok ${n} — ${name}`);
}
function ok(name, cond) {
  n += 1;
  assert.ok(cond, `case ${n} (${name})`);
  console.log(`  ok ${n} — ${name}`);
}

(async () => {
  // === a) FRESH path: SCHEMA_STATEMENTS applied (as ensureInit does), then runMigrations ===
  const fresh = makeFakeDb();
  await applySchemaStatements(fresh);
  const ddlAfterSchema = fresh.ddl.length;
  await runMigrations(fresh);

  check('fresh → schema_version 3', fresh.meta.get('schema_version'), '3');
  check('fresh: zero migration DDL ran (schema already at v3)', fresh.ddl.length, ddlAfterSchema + 1 /* the initial INSERT OR REPLACE lo_meta from runMigrations' fresh-row branch */);
  ok('fresh: lo_habit_pauses exists', fresh.tables.has('lo_habit_pauses'));
  for (const t of V2_TABLES) ok(`fresh: v2 table ${t} exists`, fresh.tables.has(t));
  ok(
    'fresh: CREATE_MOOD_CHECKINS has no UNIQUE (date)',
    !/UNIQUE\s*\(\s*date\s*\)/i.test(CREATE_MOOD_CHECKINS)
  );

  // === b) v2 → v3 UPGRADE path: seed a v2-shaped db with data ===
  const v2 = makeFakeDb({
    meta: { schema_version: '2' },
    tables: {
      lo_meta: { columns: ['key', 'value'], rows: [] },
      lo_habits: { columns: ['id', 'name', 'icon', 'cadence', 'created_at'], rows: [{ id: 'h1', name: 'Read', icon: 'leaf-outline', cadence: 'daily', created_at: '2026-01-01T00:00:00.000Z' }] },
      lo_habit_logs: { columns: ['id', 'habit_id', 'date', 'status', 'ts'], rows: [{ id: 'l1', habit_id: 'h1', date: '2026-06-01', status: 'done', ts: '2026-06-01T08:00:00.000Z' }] },
      lo_goals: { columns: ['id', 'domain', 'title', 'status', 'created_at'], rows: [{ id: 'g1', domain: 'health', title: 'Run a 10k', status: 'active', created_at: '2026-01-01T00:00:00.000Z' }] },
      lo_mood_checkins: {
        columns: ['id', 'ts', 'date', 'mood', 'tags_json', 'note'],
        rows: [
          { id: 'm1', ts: '2026-06-01T09:00:00.000Z', date: '2026-06-01', mood: 4, tags_json: '["calm"]', note: 'good morning' },
          { id: 'm2', ts: '2026-06-02T09:00:00.000Z', date: '2026-06-02', mood: 2, tags_json: '[]', note: null },
        ],
      },
      lo_app_ratings: { columns: ['token_label', 'rating', 'updated_at'], rows: [] },
      lo_share_events: { columns: ['id', 'kind', 'ref', 'ts'], rows: [] },
      lo_partner: { columns: ['id', 'partner_label', 'invite_code', 'paused', 'created_at'], rows: [] },
      lo_affirmations: { columns: ['id', 'text', 'identity_tag', 'enabled', 'source'], rows: [] },
    },
  });
  const moodBefore = v2.tableDefs.get('lo_mood_checkins').rows.map((r) => ({ ...r }));

  await runMigrations(v2);

  check('v2 → schema_version 3', v2.meta.get('schema_version'), '3');

  const habitsCols = v2.tableDefs.get('lo_habits').columns;
  for (const c of ['habit_type', 'target_value', 'target_unit', 'weekly_quota']) {
    ok(`v2 upgrade: lo_habits gained ${c}`, habitsCols.includes(c));
  }
  const logsCols = v2.tableDefs.get('lo_habit_logs').columns;
  for (const c of ['value', 'note']) {
    ok(`v2 upgrade: lo_habit_logs gained ${c}`, logsCols.includes(c));
  }
  const goalsCols = v2.tableDefs.get('lo_goals').columns;
  for (const c of ['metric_type', 'metric_target', 'metric_current']) {
    ok(`v2 upgrade: lo_goals gained ${c}`, goalsCols.includes(c));
  }

  ok('v2 upgrade: lo_mood_checkins exists post-rename', v2.tables.has('lo_mood_checkins'));
  ok('v2 upgrade: lo_mood_checkins_v3 (temp) no longer exists', !v2.tables.has('lo_mood_checkins_v3'));
  const moodAfter = v2.tableDefs.get('lo_mood_checkins').rows;
  check('v2 upgrade: mood row count preserved', moodAfter.length, moodBefore.length);
  const sortById = (arr) => [...arr].sort((a, b) => a.id.localeCompare(b.id));
  check(
    'v2 upgrade: mood rows preserved field-by-field (incl. note/tags)',
    sortById(moodAfter).map((r) => ({ id: r.id, ts: r.ts, date: r.date, mood: r.mood, tags_json: r.tags_json, note: r.note })),
    sortById(moodBefore).map((r) => ({ id: r.id, ts: r.ts, date: r.date, mood: r.mood, tags_json: r.tags_json, note: r.note }))
  );
  ok('v2 upgrade: lo_habit_pauses exists', v2.tables.has('lo_habit_pauses'));

  // === c) v1 → v3 path: both v2 and v3 migrations run ===
  const v1 = makeFakeDb({
    meta: { schema_version: '1' },
    tables: {
      lo_meta: { columns: ['key', 'value'], rows: [] },
      lo_habits: { columns: ['id', 'name', 'icon', 'cadence', 'created_at'], rows: [] },
      lo_habit_logs: { columns: ['id', 'habit_id', 'date', 'status', 'ts'], rows: [] },
      lo_goals: { columns: ['id', 'domain', 'title', 'status', 'created_at'], rows: [] },
      lo_mood_checkins: { columns: ['id', 'ts', 'date', 'mood', 'tags_json', 'note'], rows: [] },
    },
  });
  await runMigrations(v1);
  check('v1 → schema_version 3', v1.meta.get('schema_version'), '3');
  for (const t of V2_TABLES) ok(`v1→v3: v2 table ${t} created`, v1.tables.has(t));
  ok('v1→v3: lo_habit_pauses created', v1.tables.has('lo_habit_pauses'));
  const v1HabitsCols = v1.tableDefs.get('lo_habits').columns;
  for (const c of ['habit_type', 'target_value', 'target_unit', 'weekly_quota']) {
    ok(`v1→v3: lo_habits gained ${c}`, v1HabitsCols.includes(c));
  }
  ok('v1→v3: lo_mood_checkins exists post-recreate', v1.tables.has('lo_mood_checkins'));

  // === d) Idempotency: re-run on the already-migrated v2 db ===
  const beforeLen = v2.ddl.length;
  await runMigrations(v2);
  check('re-run leaves schema_version at 3', v2.meta.get('schema_version'), '3');
  check('re-run issues no further migration DDL', v2.ddl.length, beforeLen);

  // === e) CHECK constraints + BACKUP_TABLES membership ===
  ok(
    'CREATE_HABITS has habit_type CHECK with exact enum + default',
    /habit_type\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'boolean'\s+CHECK\s*\(\s*habit_type\s+IN\s*\(\s*'boolean'\s*,\s*'quantity'\s*,\s*'timer'\s*\)\s*\)/i.test(
      CREATE_HABITS
    )
  );
  ok(
    'CREATE_GOALS has metric_type CHECK with exact enum + default',
    /metric_type\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'milestone'\s+CHECK\s*\(\s*metric_type\s+IN\s*\(\s*'milestone'\s*,\s*'numeric'\s*,\s*'habit_linked'\s*\)\s*\)/i.test(
      CREATE_GOALS
    )
  );
  ok(
    'CREATE_MOOD_CHECKINS retains mood CHECK (mood BETWEEN 1 AND 5)',
    /mood\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*mood\s+BETWEEN\s+1\s+AND\s+5\s*\)/i.test(CREATE_MOOD_CHECKINS)
  );
  ok('BACKUP_TABLES includes lo_habit_pauses', BACKUP_TABLES.includes('lo_habit_pauses'));
  ok('BACKUP_TABLES still excludes lo_focus_configs', !BACKUP_TABLES.includes('lo_focus_configs'));
  ok('BACKUP_TABLES still excludes lo_focus_events', !BACKUP_TABLES.includes('lo_focus_events'));
  ok('BACKUP_TABLES still excludes lo_app_ratings', !BACKUP_TABLES.includes('lo_app_ratings'));

  console.log(`\n${n}/${n} migration-v3 cases passed.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
