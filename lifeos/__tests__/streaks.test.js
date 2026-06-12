'use strict';

/**
 * Forgiving streak engine — unit table (LIFEOS TICKET-103 DoD: 30 cases of
 * miss/rest/skip permutations). Run: node __tests__/streaks.test.js
 */

const path = require('path');
const assert = require('assert');
const { loadTs } = require('./tsLoader');

const streaks = loadTs(path.join(__dirname, '..', 'src', 'engine', 'streaks.ts'));
const { computeStreak, consistency, addDays, daysBetween, weekStart } = streaks;

const TODAY = '2026-06-12'; // a Friday

/** Build a log map from offsets-before-today → status. */
function logs(entries) {
  const map = new Map();
  for (const [offset, status] of entries) {
    map.set(addDays(TODAY, -offset), status);
  }
  return map;
}

let n = 0;
function check(name, actual, expected) {
  n += 1;
  assert.deepStrictEqual(actual, expected, `case ${n} (${name}): got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`  ok ${n} — ${name}`);
}

// --- date helpers (cases 1–5) -----------------------------------------------
check('addDays forward', addDays('2026-06-12', 1), '2026-06-13');
check('addDays month boundary', addDays('2026-05-31', 1), '2026-06-01');
check('addDays backward across month', addDays('2026-06-01', -1), '2026-05-31');
check('daysBetween', daysBetween('2026-06-01', '2026-06-12'), 11);
check('weekStart is Monday', weekStart('2026-06-12'), '2026-06-08');

// --- current streak basics (6–13) --------------------------------------------
check('empty logs → 0', computeStreak(new Map(), TODAY).current, 0);
check('today done → 1', computeStreak(logs([[0, 'done']]), TODAY).current, 1);
check('today rest counts → 1', computeStreak(logs([[0, 'rest']]), TODAY).current, 1);
check('today + yesterday done → 2', computeStreak(logs([[0, 'done'], [1, 'done']]), TODAY).current, 2);
check('today unlogged is pending, yesterday done → 1', computeStreak(logs([[1, 'done']]), TODAY).current, 1);
check('5 consecutive done → 5', computeStreak(logs([[0, 'done'], [1, 'done'], [2, 'done'], [3, 'done'], [4, 'done']]), TODAY).current, 5);
check('done+rest mix → 4', computeStreak(logs([[0, 'done'], [1, 'rest'], [2, 'done'], [3, 'rest']]), TODAY).current, 4);
check('today skip only → 0', computeStreak(logs([[0, 'skip']]), TODAY).current, 0);

// --- one-miss forgiveness (14–19) ----------------------------------------------
check('miss redeemed by done after it', computeStreak(logs([[0, 'done'], [1, 'done'], /* day2 miss */ [3, 'done']]), TODAY).current, 3);
check('miss NOT redeemed by rest after it', computeStreak(logs([[0, 'done'], [1, 'rest'], /* day2 miss */ [3, 'done']]), TODAY).current, 2);
check('miss NOT redeemed by skip after it', computeStreak(logs([[0, 'skip'], /* day1 miss */ [2, 'done']]), TODAY).current, 0);
check('two-day gap breaks', computeStreak(logs([[0, 'done'], /* 1,2 miss */ [3, 'done'], [4, 'done']]), TODAY).current, 1);
check('two separate forgiven misses both crossed', computeStreak(logs([[0, 'done'], /* 1 miss */ [2, 'done'], /* 3 miss */ [4, 'done']]), TODAY).current, 3);
check('gap then rest older side still counts the rest', computeStreak(logs([[0, 'done'], /* 1 miss */ [2, 'rest'], [3, 'done']]), TODAY).current, 3);

// --- skip neutrality (20–23) ------------------------------------------------------
check('skip pauses without breaking', computeStreak(logs([[0, 'done'], [1, 'skip'], [2, 'done']]), TODAY).current, 2);
check('skip run of 2 still pauses', computeStreak(logs([[0, 'done'], [1, 'skip'], [2, 'skip'], [3, 'done']]), TODAY).current, 2);
check('skip then miss breaks (skip cannot redeem)', computeStreak(logs([[0, 'done'], [1, 'skip'], /* 2 miss */ [3, 'done']]), TODAY).current, 1);
check('pending today + skip yesterday + done day2', computeStreak(logs([[1, 'skip'], [2, 'done']]), TODAY).current, 1);

// --- longest & milestones (24–27) ----------------------------------------------------
{
  const r = computeStreak(logs([[0, 'done'], [1, 'done'], /* gap 2,3 */ [4, 'done'], [5, 'done'], [6, 'done'], [7, 'done'], [8, 'done']]), TODAY);
  check('current 2 after hard gap', r.current, 2);
  check('longest finds the old 5-chain', r.longest, 5);
}
{
  const seven = logs(Array.from({ length: 7 }, (_, i) => [i, 'done']));
  check('milestone 7', computeStreak(seven, TODAY).milestone, 7);
}
{
  const thirty = logs(Array.from({ length: 30 }, (_, i) => [i, 'done']));
  check('milestone 30', computeStreak(thirty, TODAY).milestone, 30);
}

// --- consistency (28–30) ---------------------------------------------------------------
{
  const c1 = consistency(logs([[0, 'done'], [1, 'done'], [2, 'rest']]), TODAY, 7);
  check('consistency counts done+rest', { active: c1.active, eligible: c1.eligible }, { active: 3, eligible: 7 });
}
{
  const c2 = consistency(logs([[0, 'done'], [1, 'skip']]), TODAY, 7);
  check('skip excluded from both sides', { active: c2.active, eligible: c2.eligible }, { active: 1, eligible: 6 });
}
{
  const c3 = consistency(new Map(), TODAY, 7);
  check('empty consistency ratio 0', c3.ratio, 0);
}

console.log(`\nstreaks.test.js — all ${n} cases passed`);
