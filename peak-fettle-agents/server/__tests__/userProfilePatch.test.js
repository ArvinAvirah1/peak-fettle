// userProfilePatch.test.js — unit tests for the PATCH /user/profile helpers
// added in Task 3 (2026-06-19). No DB or network: we set dummy env so the route
// module loads (supabaseAdmin throws without env; the pg pool connects lazily),
// then exercise the pure helpers exported under module.exports.__test.
//
// Run: node peak-fettle-agents/server/__tests__/userProfilePatch.test.js

'use strict';

// Must be set BEFORE requiring the route (supabaseAdmin.js fails loudly otherwise).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role';
process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || 'postgres://localhost:5432/dummy';

const path = require('path');
const userRoute = require(path.join(__dirname, '..', 'routes', 'user.js'));
const t = userRoute.__test;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.log('  FAIL  ' + name + ' — ' + e.message); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }
function deq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }

console.log('\nuserProfilePatch.test.js\n');

test('__test helpers are exported', () => {
  assert(t && typeof t.buildProfileUpdate === 'function', 'buildProfileUpdate missing');
  assert(typeof t.dropUpdateColumns === 'function', 'dropUpdateColumns missing');
  assert(typeof t.isShortStringArray === 'function', 'isShortStringArray missing');
  assert(typeof t.isIsoDate === 'function', 'isIsoDate missing');
  assert(t.DRIFTABLE_PROFILE_COLUMNS instanceof Set, 'DRIFTABLE set missing');
});

test('DRIFTABLE set = exactly the 5 new survey columns (birth_date NOT included — it already exists)', () => {
  const got = [...t.DRIFTABLE_PROFILE_COLUMNS].sort();
  deq(got, ['bodyweight_kg', 'injuries', 'muscle_priorities', 'primary_focus', 'training_days'], 'driftable cols:');
  assert(!t.DRIFTABLE_PROFILE_COLUMNS.has('birth_date'), 'birth_date must NOT be driftable (column already exists)');
});

test('buildProfileUpdate: RETURNING includes id + unit_pref + touched cols, deduped', () => {
  const { sql, params } = t.buildProfileUpdate(['unit_pref = $2', 'bodyweight_kg = $3'], ['uid', 'kg', 80]);
  assert(sql.startsWith('UPDATE users SET unit_pref = $2, bodyweight_kg = $3 WHERE id = $1 RETURNING '), 'sql head wrong: ' + sql);
  const ret = sql.split('RETURNING ')[1];
  deq(ret.split(', ').sort(), ['bodyweight_kg', 'id', 'unit_pref'], 'returning set:');
  deq(params, ['uid', 'kg', 80], 'params passthrough:');
});

test('buildProfileUpdate: unit_pref touched is not duplicated in RETURNING', () => {
  const { sql } = t.buildProfileUpdate(['unit_pref = $2'], ['uid', 'lbs']);
  const ret = sql.split('RETURNING ')[1];
  deq(ret.split(', ').sort(), ['id', 'unit_pref'], 'returning set:');
});

test('dropUpdateColumns: drops driftable, keeps + renumbers the rest', () => {
  const clauses = ['unit_pref = $2', 'bodyweight_kg = $3', 'training_days = $4'];
  const params = ['uid', 'kg', 80, [1, 3]];
  const out = t.dropUpdateColumns(clauses, params, t.DRIFTABLE_PROFILE_COLUMNS);
  deq(out.setClauses, ['unit_pref = $2'], 'kept clauses:');
  deq(out.params, ['uid', 'kg'], 'kept params:');
});

test('dropUpdateColumns: renumbers across interior gaps (order preserved)', () => {
  const clauses = ['display_name = $2', 'primary_focus = $3', 'sex = $4', 'injuries = $5'];
  const params = ['uid', 'Bob', 'strength', 'M', ['knee']];
  const out = t.dropUpdateColumns(clauses, params, t.DRIFTABLE_PROFILE_COLUMNS);
  deq(out.setClauses, ['display_name = $2', 'sex = $3'], 'kept clauses:');
  deq(out.params, ['uid', 'Bob', 'M'], 'kept params:');
});

test('dropUpdateColumns: all-driftable -> empty set (uid preserved)', () => {
  const clauses = ['bodyweight_kg = $2', 'training_days = $3'];
  const params = ['uid', 80, [1]];
  const out = t.dropUpdateColumns(clauses, params, t.DRIFTABLE_PROFILE_COLUMNS);
  deq(out.setClauses, [], 'empty clauses:');
  deq(out.params, ['uid'], 'uid only:');
});

test('isShortStringArray: accepts good arrays, rejects bad', () => {
  assert(t.isShortStringArray(['a', 'b'], 30, 50) === true, 'simple array');
  assert(t.isShortStringArray([], 30, 50) === true, 'empty array ok');
  assert(t.isShortStringArray('nope', 30, 50) === false, 'string is not array');
  assert(t.isShortStringArray([123], 30, 50) === false, 'numbers rejected');
  assert(t.isShortStringArray([''], 30, 50) === false, 'empty string rejected');
  assert(t.isShortStringArray(['x'.repeat(51)], 30, 50) === false, 'too long rejected');
  assert(t.isShortStringArray(new Array(31).fill('a'), 30, 50) === false, 'too many rejected');
});

test('isIsoDate: real dates only', () => {
  assert(t.isIsoDate('1990-05-20') === true, '1990-05-20');
  assert(t.isIsoDate('2024-02-29') === true, 'leap day 2024');
  assert(t.isIsoDate('2026-02-29') === false, 'non-leap 2026');
  assert(t.isIsoDate('1900-02-29') === false, '1900 not leap');
  assert(t.isIsoDate('2026-02-30') === false, 'feb 30');
  assert(t.isIsoDate('2026-13-01') === false, 'month 13');
  assert(t.isIsoDate('90-05-20') === false, 'two-digit year');
  assert(t.isIsoDate('1899-12-31') === false, 'before 1900');
  assert(t.isIsoDate('3000-01-01') === false, 'far future');
  assert(t.isIsoDate(null) === false, 'null');
  assert(t.isIsoDate('not-a-date') === false, 'garbage');
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
