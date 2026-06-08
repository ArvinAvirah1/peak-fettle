/**
 * backup-export.test.js — TICKET-094 export engine (pure parts).
 *
 * Runs the REAL src/data/backup/exportEngine.ts by transpiling it with the
 * installed TypeScript and exercising it. Plain node (no jest needed):
 *   node __tests__/backup-export.test.js
 *
 * Covers: deterministic canonical form, round-trip, and schema-version
 * forward/backward reconcile (AC7).
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019' },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
  return mod.exports;
}

const E = load('src/data/backup/exportEngine.ts');

let failures = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); } else { console.log('  ✗ ' + msg); failures++; }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg); }

const data = {
  workouts: [{ id: 'w1', user_id: 'u', day_key: '2026-06-06', synced: 1 }],
  sets: [
    { id: 's1', workout_id: 'w1', exercise_id: 'e1', reps: 8, weight_raw: 800 },
    { id: 's2', workout_id: 'w1', exercise_id: 'e1', reps: 6, weight_raw: 880 },
  ],
  schedule: [{ id: 'active', mode: 'cycle', data: '{"mode":"cycle"}', position: 1 }],
  avatar: [{ id: 'active', data: '{"v":1,"face":"round"}' }],
};

console.log('TICKET-094 export engine:');

// 1. round-trip through JSON
const doc = E.makeExportDoc(data);
const roundTripped = E.parseImport(JSON.parse(JSON.stringify(doc)));
ok(roundTripped.ok, 'round-trip parseImport succeeds');
eq(roundTripped.tables.sets, data.sets, 'round-trip preserves sets rows');
eq(roundTripped.tables.avatar, data.avatar, 'round-trip preserves avatar row');

// 2. determinism — different exportedAt + different key order → identical canonical
const docA = E.makeExportDoc(data, new Date('2026-06-06T10:00:00Z'));
const reordered = { sets: data.sets, avatar: data.avatar, workouts: data.workouts, schedule: data.schedule };
const docB = E.makeExportDoc(reordered, new Date('2030-01-01T00:00:00Z'));
ok(E.canonicalize(docA) === E.canonicalize(docB), 'canonical form is deterministic (ignores time + key order)');

// 3. schema-version reconcile (AC7)
const vNext = { ...doc, schemaVersion: E.BACKUP_SCHEMA_VERSION + 1 };
ok(E.parseImport(vNext).ok === false, 'a NEWER backup is rejected on this app');
const older = E.parseImport(JSON.parse(JSON.stringify({ ...doc, schemaVersion: 1 })), E.BACKUP_SCHEMA_VERSION + 1);
ok(older.ok === true && older.version === E.BACKUP_SCHEMA_VERSION + 1, 'an OLDER backup restores under a newer engine');

// 4. validation
ok(E.parseImport(null).ok === false, 'null is rejected');
ok(E.parseImport({ format: 'nope' }).ok === false, 'wrong format is rejected');

// 5. missing tables default to [], unknown ignored
const partial = E.parseImport({ format: 'peak-fettle-backup', schemaVersion: 1, exportedAt: 'x', tables: { sets: data.sets, bogus: [{ a: 1 }] } });
ok(partial.ok && Array.isArray(partial.tables.workouts) && partial.tables.workouts.length === 0, 'missing table → empty array');
ok(partial.ok && partial.tables.bogus === undefined, 'unknown table is dropped');

console.log(failures === 0 ? '\nALL EXPORT-ENGINE TESTS PASS' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
