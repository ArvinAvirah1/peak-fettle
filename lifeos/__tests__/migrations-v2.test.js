'use strict';

/**
 * Schema-v2 migration (LIFEOS TICKET-119 AC #1/#2): fresh install lands at
 * version 2 with the four new tables; an existing v1 DB upgrades once to 2 with
 * NO data loss; re-running is idempotent. Drives the REAL runMigrations() with a
 * tiny in-memory fake db (no native SQLite needed), asserting the version gate,
 * the created tables, idempotency, and the absence of any destructive DDL.
 *
 * Run: node __tests__/migrations-v2.test.js
 */

const path = require('path');
const assert = require('assert');
const { loadTs } = require('./tsLoader');

const { runMigrations } = loadTs(path.join(__dirname, '..', 'src', 'db', 'migrations.ts'));

const V2_TABLES = ['lo_app_ratings', 'lo_share_events', 'lo_partner', 'lo_affirmations'];

/** Minimal fake of the localDb surface runMigrations uses (getFirst/execute). */
function makeFakeDb(seed = {}) {
  const meta = new Map(Object.entries(seed.meta || {}));
  const tables = new Set(seed.tables || []);
  const ddl = [];
  return {
    meta,
    tables,
    ddl,
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
      const cre = /CREATE TABLE IF NOT EXISTS\s+(\w+)/i.exec(sql);
      if (cre) tables.add(cre[1]);
      if (/INSERT OR REPLACE INTO\s+lo_meta/i.test(sql)) {
        const km = /VALUES\s*\(\s*'([^']+)'/i.exec(sql);
        if (km) meta.set(km[1], params[0]);
      }
    },
  };
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
  // --- 1. Fresh install: no meta, no tables ---
  const fresh = makeFakeDb();
  await runMigrations(fresh);
  check('fresh → schema_version 2', fresh.meta.get('schema_version'), '2');
  for (const t of V2_TABLES) ok(`fresh creates ${t}`, fresh.tables.has(t));
  ok('fresh issued no destructive DDL', !fresh.ddl.some((s) => /\b(DROP|DELETE|ALTER)\b/i.test(s)));

  // --- 2. Upgrade from v1 with existing data ---
  const v1 = makeFakeDb({
    meta: { schema_version: '1' },
    tables: ['lo_meta', 'lo_habits', 'lo_habit_logs', 'lo_goals'],
  });
  await runMigrations(v1);
  check('v1 → schema_version 2', v1.meta.get('schema_version'), '2');
  for (const t of V2_TABLES) ok(`upgrade creates ${t}`, v1.tables.has(t));
  ok('upgrade preserves lo_habits (no data loss)', v1.tables.has('lo_habits'));
  ok('upgrade preserves lo_habit_logs (no data loss)', v1.tables.has('lo_habit_logs'));
  ok('upgrade issued no destructive DDL', !v1.ddl.some((s) => /\b(DROP|DELETE|ALTER)\b/i.test(s)));

  // --- 3. Idempotent re-run on the now-v2 DB ---
  const before = v1.ddl.length;
  await runMigrations(v1);
  check('re-run leaves schema_version at 2', v1.meta.get('schema_version'), '2');
  check('re-run issues no further migration DDL', v1.ddl.length, before);

  console.log(`\n${n}/${n} migration-v2 cases passed.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
