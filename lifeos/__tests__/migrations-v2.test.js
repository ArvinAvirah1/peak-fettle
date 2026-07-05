'use strict';

/**
 * Schema-v2 migration (LIFEOS TICKET-119 AC #1/#2): an existing v1 DB upgrades
 * once to v2 (picking up the four new tables) with NO data loss; re-running is
 * idempotent. Drives the REAL runMigrations() with a tiny in-memory fake db (no
 * native SQLite needed), asserting the version gate, the created tables,
 * idempotency, and the absence of any destructive DDL *from the v2 migration*.
 *
 * UPDATED for TICKET-151 (schema v3, SCHEMA_VERSION bumped 1 -> 3): a truly
 * fresh DB (no lo_meta row) now initialises `current` to SCHEMA_VERSION=3
 * directly (see runMigrations), so it runs NEITHER the v2 NOR the v3 migration
 * -- the v2 tables are created via SCHEMA_STATEMENTS instead (localSchema.ts),
 * which is out of scope for this file (see migrations-v3.test.js case (a)).
 * The former "fresh install" case here is replaced with a fresh-db-AT-v2 case
 * (seeded with schema_version '2' and no v2 tables yet -- an install that
 * stopped mid-upgrade, or simply a way to isolate the v2 migration in
 * isolation) so this file still exercises the v2 migration body on its own.
 * The v1 upgrade case now also runs the v3 migration (both `to > current`), so
 * the "no destructive DDL" assertions are scoped to DDL emitted by the v2
 * migration specifically (its statements are all CREATE TABLE IF NOT EXISTS --
 * the v3 migration legitimately uses ALTER/DROP for its mood-table recreate,
 * asserted separately in migrations-v3.test.js).
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

/** DDL emitted by the v2 migration body only (CREATE TABLE IF NOT EXISTS x4). */
function isV2MigrationDdl(sql) {
  return /CREATE TABLE IF NOT EXISTS\s+(lo_app_ratings|lo_share_events|lo_partner|lo_affirmations)\b/i.test(sql);
}

(async () => {
  // --- 1. DB already at v2 (no v2 tables yet -- e.g. an install that stopped
  // mid-upgrade): exercises the v2 migration's version gate in isolation. Since
  // TICKET-151 bumped SCHEMA_VERSION to 3, seeding schema_version '2' means the
  // v2 migration (`to: 2`) correctly does NOT re-run (2 > 2 is false) -- but the
  // v3 migration (`to: 3`) legitimately DOES run (3 > 2), taking the DB to '3'.
  // A truly fresh DB (no meta row at all) no longer runs either migration
  // post-TICKET-151 -- see migrations-v3.test.js case (a) for that path
  // (SCHEMA_STATEMENTS).
  const atV2 = makeFakeDb({ meta: { schema_version: '2' }, tables: ['lo_meta'] });
  await runMigrations(atV2);
  check('db already at v2 → schema_version advances to 3 (v3 runs, v2 does not)', atV2.meta.get('schema_version'), '3');
  for (const t of V2_TABLES) ok(`v2 (isolated): does NOT retroactively create ${t}`, !atV2.tables.has(t));
  ok('v2 (isolated): v3 migration DID run (habit_pauses created)', atV2.tables.has('lo_habit_pauses'));
  ok(
    'v2 (isolated): no DDL from the v2 migration body itself',
    !atV2.ddl.some(isV2MigrationDdl)
  );

  // --- 2. Upgrade from v1 with existing data (runs BOTH v2 and v3 -- v3 was
  // introduced by TICKET-151 and bumped SCHEMA_VERSION to 3) ---
  const v1 = makeFakeDb({
    meta: { schema_version: '1' },
    tables: ['lo_meta', 'lo_habits', 'lo_habit_logs', 'lo_goals', 'lo_mood_checkins'],
  });
  await runMigrations(v1);
  check('v1 → schema_version 3', v1.meta.get('schema_version'), '3');
  for (const t of V2_TABLES) ok(`upgrade creates ${t}`, v1.tables.has(t));
  ok('upgrade preserves lo_habits (no data loss)', v1.tables.has('lo_habits'));
  ok('upgrade preserves lo_habit_logs (no data loss)', v1.tables.has('lo_habit_logs'));
  ok('upgrade creates lo_habit_pauses (v3)', v1.tables.has('lo_habit_pauses'));
  ok(
    'v2 migration portion issued no destructive DDL',
    !v1.ddl.filter(isV2MigrationDdl).some((s) => /\b(DROP|DELETE|ALTER)\b/i.test(s))
  );
  // The v3 migration DOES use ALTER/DROP (mood-table recreate, ADD COLUMN) --
  // that's expected and covered in detail by migrations-v3.test.js. Just
  // sanity-check that some non-v2 DDL exists (proves v3 actually ran too).
  ok('v3 migration DDL also ran', v1.ddl.some((s) => /ALTER TABLE|DROP TABLE/i.test(s)));

  // --- 3. Idempotent re-run on the now-v3 DB ---
  const before = v1.ddl.length;
  await runMigrations(v1);
  check('re-run leaves schema_version at 3', v1.meta.get('schema_version'), '3');
  check('re-run issues no further migration DDL', v1.ddl.length, before);

  console.log(`\n${n}/${n} migration-v2 cases passed.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
