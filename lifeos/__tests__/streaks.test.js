'use strict';

/**
 * Forgiving streak engine — unit table (LIFEOS TICKET-103 DoD: 30 cases of
 * miss/rest/skip permutations). Run: node __tests__/streaks.test.js
 *
 * Extended (TICKET-154/156) with pause semantics, grace-day reporting,
 * at-risk detection, weekly-quota streaks, and quantity/timer status —
 * cases 31+ below. Original 30 cases are untouched (same numbering/output).
 */

const path = require('path');
const assert = require('assert');
const { loadTs } = require('./tsLoader');

const streaks = loadTs(path.join(__dirname, '..', 'src', 'engine', 'streaks.ts'));
const {
  computeStreak,
  consistency,
  addDays,
  daysBetween,
  weekStart,
  isPausedOn,
  weekProgress,
  computeWeeklyQuotaStreak,
  quantityStatus,
} = streaks;

const TODAY = '2026-06-12'; // a Friday

/** Build a log map from offsets-before-today → status. */
function logs(entries) {
  const map = new Map();
  for (const [offset, status] of entries) {
    map.set(addDays(TODAY, -offset), status);
  }
  return map;
}

/** Build a pause range from offsets-before-today (inclusive). endOffset null = open-ended. */
function pauseRange(startOffset, endOffset) {
  return {
    start_date: addDays(TODAY, -startOffset),
    end_date: endOffset === null ? null : addDays(TODAY, -endOffset),
  };
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

console.log(`\n--- original 30 cases passed; extending with pause/grace/at-risk/weekly-quota/quantity (TICKET-154/156) ---\n`);

// --- isPausedOn (31–33) -----------------------------------------------------------------
check('isPausedOn: open-ended pause covers day', isPausedOn(addDays(TODAY, -2), [pauseRange(5, null)]), true);
check('isPausedOn: closed pause covers day inside range', isPausedOn(addDays(TODAY, -3), [{ start_date: addDays(TODAY, -5), end_date: addDays(TODAY, -1) }]), true);
check('isPausedOn: day outside range is not paused', isPausedOn(TODAY, [{ start_date: addDays(TODAY, -5), end_date: addDays(TODAY, -1) }]), false);

// --- pause bridging (34–36) --------------------------------------------------------------
{
  // done today, multi-day pause gap (days 1-4 all paused, no logs), done at day5 → current should
  // be 2 (today + day5), the pause bridges the whole gap transparently.
  const l = logs([[0, 'done'], [5, 'done']]);
  const pauses = [pauseRange(4, 1)];
  const r = computeStreak(l, TODAY, { pauses });
  check('pause bridges multi-day gap: current 2', r.current, 2);
}
{
  // Pause covers only part of a gap; a genuine unpaused 2-day miss elsewhere still breaks.
  const l = logs([[0, 'done'], [5, 'done']]);
  const pauses = [pauseRange(3, 2)]; // pauses days 2-3 only; day1 and day4 remain real misses
  const r = computeStreak(l, TODAY, { pauses });
  check('partial pause does not bridge a real 2-day miss elsewhere: current 1', r.current, 1);
}
{
  // done, single paused day, done → current 2 (pause of length 1 never breaks).
  const l = logs([[0, 'done'], [2, 'done']]);
  const pauses = [pauseRange(1, 1)];
  const r = computeStreak(l, TODAY, { pauses });
  check('single paused day bridges: current 2', r.current, 2);
}

// --- pause transparency preserves grace across the bridge (37) ----------------------------
{
  // today done, yesterday paused (no log), day2 an unpaired miss, day3 done.
  // The pause does not reset "last seen done" memory, so day2's miss is still
  // forgiven by day3's done — walk: today(done,count1) -> yesterday bridged
  // (transparent, no count) -> day2 miss (pendingGap 1) -> day3 done, crosses
  // because lastSeenDone is still true from today -> count 2, grace=[day2].
  const l = logs([[0, 'done'], [3, 'done']]);
  const pauses = [pauseRange(1, 1)];
  const r = computeStreak(l, TODAY, { pauses });
  check('grace survives across a transparent pause bridge: current 2', r.current, 2);
  check('grace day recorded is the unpaired miss day', r.graceDaysUsed, [addDays(TODAY, -2)]);
}

// --- unlogged paused day suppressed as a miss (38) -----------------------------------------
{
  // yesterday paused+unlogged should not count as "the miss" that would need
  // forgiving — chain should read as if yesterday didn't exist at all.
  const l = logs([[0, 'done'], [2, 'done']]);
  const pauses = [pauseRange(1, 1)];
  const r = computeStreak(l, TODAY, { pauses });
  check('paused unlogged day is not treated as a miss at all: current 2', r.current, 2);
}

// --- two unpaused misses still break even when a pause exists elsewhere (39) ---------------
{
  // Pause is far in the past (days 10-12); the real gap at days 1-2 (both
  // unlogged, unpaused) still breaks the chain down to just today.
  const l = logs([[0, 'done'], [3, 'done'], [13, 'done']]);
  const pauses = [pauseRange(12, 10)];
  const r = computeStreak(l, TODAY, { pauses });
  check('an unrelated pause does not save a genuine 2-day miss: current 1', r.current, 1);
}

// --- graceDaysUsed reporting (40–41) --------------------------------------------------------
check('graceDaysUsed is [] with no forgiven miss', computeStreak(logs([[0, 'done'], [1, 'done']]), TODAY).graceDaysUsed, []);
{
  const r = computeStreak(logs([[0, 'done'], [1, 'done'], /* day2 miss */ [3, 'done']]), TODAY);
  check('graceDaysUsed lists the forgiven day key, most recent first', r.graceDaysUsed, [addDays(TODAY, -2)]);
}

// --- atRisk (42–44) --------------------------------------------------------------------------
{
  // yesterday unforgiven miss (unlogged, not paused) + a chain of >=1 before that gap.
  const l = logs([[2, 'done'], [3, 'done']]); // day2,day3 done; today(0) and yesterday(1) unlogged
  const r = computeStreak(l, TODAY);
  check('atRisk true: unlogged today + unforgiven miss yesterday + prior chain', r.atRisk, true);
}
{
  // yesterday logged (done) — no gap at all, so not at risk.
  const l = logs([[1, 'done']]);
  const r = computeStreak(l, TODAY);
  check('atRisk false: yesterday logged', r.atRisk, false);
}
{
  // yesterday paused — bridged away, never "at risk".
  const l = logs([[3, 'done'], [4, 'done']]);
  const pauses = [pauseRange(1, 1)];
  const r = computeStreak(l, TODAY, { pauses });
  check('atRisk false: yesterday paused', r.atRisk, false);
}

// --- weekProgress (45–46) ---------------------------------------------------------------------
{
  // Week of TODAY (2026-06-12, Fri) starts Monday 2026-06-08. 'done' on Mon,
  // Tue, and a 'rest' on Wed (rest must NOT count toward quota).
  const l = logs([[4, 'done'], [3, 'done'], [2, 'rest']]); // Mon(-4), Tue(-3), Wed(-2)
  const wp = weekProgress(l, TODAY, 3);
  check('weekProgress: Monday window, only done counts, not met', wp, { weekStart: '2026-06-08', done: 2, quota: 3, met: false });
}
{
  const l = logs([[4, 'done'], [3, 'done'], [2, 'done']]);
  const wp = weekProgress(l, TODAY, 3);
  check('weekProgress: quota met', wp, { weekStart: '2026-06-08', done: 3, quota: 3, met: true });
}

// --- computeWeeklyQuotaStreak (47–53) -----------------------------------------------------------
{
  // Current week already met (3 done, quota 3) → counts, pendingThisWeek false.
  const l = logs([[0, 'done'], [1, 'done'], [2, 'done']]);
  const r = computeWeeklyQuotaStreak(l, TODAY, 3);
  check('weekly quota: current-week-met counts, pendingThisWeek false', { current: r.current, pendingThisWeek: r.pendingThisWeek }, { current: 1, pendingThisWeek: false });
}
{
  // Current week unmet (only today done, quota 3) but last week met (3 done)
  // → the prior streak is preserved and pendingThisWeek is true.
  const entries = [[0, 'done']];
  for (let i = 7; i < 10; i++) entries.push([i, 'done']); // last week's Mon/Tue/Wed
  const l = logs(entries);
  const r = computeWeeklyQuotaStreak(l, TODAY, 3);
  check('weekly quota: current-week-unmet is pending, prior streak preserved', { current: r.current, pendingThisWeek: r.pendingThisWeek }, { current: 1, pendingThisWeek: true });
}
{
  // Current week met; last week (a real, closed week) unmet → breaks after current.
  const l = logs([[0, 'done'], [1, 'done'], [2, 'done'], [8, 'done']]); // last week only 1 done
  const r = computeWeeklyQuotaStreak(l, TODAY, 3);
  check('weekly quota: past unmet week breaks the chain', r.current, 1);
}
{
  // Last week is fully paused (no logs, pause covers the whole week) → bridged,
  // does not break; the week before it (also met) still counts.
  const lastWeekStart = addDays(weekStart(TODAY), -7);
  const pauses = [{ start_date: lastWeekStart, end_date: addDays(lastWeekStart, 6) }];
  const entries = [[0, 'done'], [1, 'done'], [2, 'done']]; // this week met
  for (let i = 0; i < 3; i++) entries.push([14 + i, 'done']); // week-before-last met
  const l = logs(entries);
  const r = computeWeeklyQuotaStreak(l, TODAY, 3, { pauses });
  check('weekly quota: fully-paused week bridges, does not break', r.current, 2);
}
{
  // Last week partially paused: pause covers Mon-Fri (5 days), leaving only
  // Sat+Sun (2 unpaused days). effectiveQuota = min(3, 2) = 2; both done → met.
  const lastWeekStart = addDays(weekStart(TODAY), -7);
  const pauses = [{ start_date: lastWeekStart, end_date: addDays(lastWeekStart, 4) }];
  const entries = [[0, 'done'], [1, 'done'], [2, 'done']]; // this week met
  entries.push([6, 'done'], [5, 'done']); // last week's Sat(-6)/Sun(-5), the 2 unpaused days
  const l = logs(entries);
  const r = computeWeeklyQuotaStreak(l, TODAY, 3, { pauses });
  check('weekly quota: partially-paused week uses effectiveQuota = min(quota, unpaused days)', r.current, 2);
}
{
  // Longest across a broken history: a 4-week chain, then a break, then the
  // current (short) chain — longest must find the older, longer run.
  const entries = [];
  for (let w = 0; w < 4; w++) {
    for (let i = 0; i < 3; i++) entries.push([28 + w * 7 + i, 'done']); // weeks 4..7 ago, all met
  }
  entries.push([0, 'done'], [1, 'done'], [2, 'done']); // current week met (chain of 1 after the break)
  const l = logs(entries);
  const r = computeWeeklyQuotaStreak(l, TODAY, 3);
  check('weekly quota: longest finds the older 4-week chain across a break', r.longest, 4);
}
{
  const entries = [];
  for (let w = 0; w < 7; w++) for (let i = 0; i < 3; i++) entries.push([w * 7 + i, 'done']);
  const l = logs(entries);
  const r = computeWeeklyQuotaStreak(l, TODAY, 3);
  check('weekly quota: milestone at 7 weeks', r.milestone, 7);
}

// --- quantityStatus (54–57) ---------------------------------------------------------------------
check('quantityStatus: met (accumulated >= target)', quantityStatus(10, 10), 'done');
check('quantityStatus: partial (below target)', quantityStatus(5, 10), 'skip');
check('quantityStatus: null target, any positive counts as done', quantityStatus(1, null), 'done');
check('quantityStatus: null target, zero is neutral skip', quantityStatus(0, null), 'skip');

// --- consistency excludes paused days from both sides (58) ---------------------------------------
{
  // 7-day window: today+yesterday done (active), day2 paused+unlogged (excluded
  // from both sides, same as skip), remaining 4 days unlogged (miss, eligible
  // but not active).
  const l = logs([[0, 'done'], [1, 'done']]);
  const pauses = [pauseRange(2, 2)];
  const c = consistency(l, TODAY, 7, pauses);
  check('consistency excludes paused days from numerator and denominator', { active: c.active, eligible: c.eligible }, { active: 2, eligible: 6 });
}

// --- 2-arg computeStreak back-compat (59) ---------------------------------------------------------
{
  const r = computeStreak(logs([[0, 'done'], [1, 'done']]), TODAY);
  check('2-arg computeStreak still returns graceDaysUsed [] and atRisk false shape', { graceDaysUsed: r.graceDaysUsed, atRisk: r.atRisk }, { graceDaysUsed: [], atRisk: false });
}

console.log(`\nstreaks.test.js — all ${n} cases passed`);
