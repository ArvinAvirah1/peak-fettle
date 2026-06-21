'use strict';

/**
 * Reminder planner (LIFEOS TICKET-124 AC #2/#3): the ≤2/day cap holds on EVERY
 * weekday (incl. the weekly-review day), quiet-hours items are dropped, defaults
 * schedule nothing, and priority order is respected. Drives the PURE planWeek()
 * (engine/reminderPlan.ts) — the same function the native scheduler renders — so
 * the cap can't silently regress (it did once: daily triggers fired on the
 * review day too, making 3/day).
 *
 * Run: node __tests__/reminder-plan.test.js
 */

const path = require('path');
const assert = require('assert');
const { loadTs } = require('./tsLoader');

const rp = loadTs(path.join(__dirname, '..', 'src', 'engine', 'reminderPlan.ts'));
const { planWeek, isWithinQuietHours, summarizeSchedule, DEFAULT_REMINDER_CONFIG } = rp;

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

function cfg(over) {
  return { quietStart: '22:00', quietEnd: '07:00', ...over };
}
/** Count planned reminders per weekday (0..6). */
function perDay(plan) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const r of plan) counts[r.weekday] += 1;
  return counts;
}

// --- quiet hours (wrap-around + normal) -------------------------------------
check('quiet wrap: 23:00 in 22-07', isWithinQuietHours('23:00', '22:00', '07:00'), true);
check('quiet wrap: 06:00 in 22-07', isWithinQuietHours('06:00', '22:00', '07:00'), true);
check('quiet wrap: 12:00 not in 22-07', isWithinQuietHours('12:00', '22:00', '07:00'), false);
check('quiet normal: 10:00 in 09-17', isWithinQuietHours('10:00', '09:00', '17:00'), true);
check('quiet normal: 18:00 not in 09-17', isWithinQuietHours('18:00', '09:00', '17:00'), false);

// --- defaults (all OFF) schedule nothing ------------------------------------
check('defaults → empty plan', planWeek(DEFAULT_REMINDER_CONFIG).length, 0);
check('defaults summary', summarizeSchedule(DEFAULT_REMINDER_CONFIG), 'No reminders scheduled');

// --- THE CAP: enable everything → no weekday exceeds 2 ----------------------
const all = cfg({
  dailyHabit: { enabled: true, time: '08:00' },
  moodPrompt: { enabled: true, time: '12:00' },
  affirmationMorning: { enabled: true, time: '07:30' },
  affirmationEvening: { enabled: true, time: '21:00' },
  weeklyReview: { enabled: true, weekday: 0, time: '18:00' },
});
const allPlan = planWeek(all);
const allCounts = perDay(allPlan);
ok('every weekday ≤ 2 with all types enabled', allCounts.every((c) => c <= 2));
check('Sunday (review day) has exactly 2', allCounts[0], 2);
ok('Sunday includes the weekly review', allPlan.some((r) => r.weekday === 0 && /reflect on your week/.test(r.title)));
check('total planned = 6 days*2 + review day 2', allPlan.length, 14);

// --- priority: with 4 dailies + no weekly, top-2 by priority win ------------
const fourDaily = cfg({
  dailyHabit: { enabled: true, time: '08:00' },        // priority 1
  moodPrompt: { enabled: true, time: '12:00' },        // priority 2
  affirmationMorning: { enabled: true, time: '07:30' },// priority 3
  affirmationEvening: { enabled: true, time: '21:00' },// priority 4
});
const fourPlan = planWeek(fourDaily);
ok('4 dailies → every weekday ≤ 2', perDay(fourPlan).every((c) => c === 2));
ok('top-2 kept = daily habit + mood (not affirmations)', (() => {
  const mon = fourPlan.filter((r) => r.weekday === 1);
  const titles = mon.map((r) => r.title).sort();
  return titles.includes('A moment for your habits') && titles.includes('How are you arriving today?')
    && !titles.includes('Good morning');
})());

// --- quiet-hours exclusion --------------------------------------------------
const inQuiet = cfg({
  dailyHabit: { enabled: true, time: '23:30' }, // inside 22-07 → dropped
  moodPrompt: { enabled: true, time: '12:00' }, // kept
});
const quietPlan = planWeek(inQuiet);
ok('quiet-hours reminder dropped, the other kept', perDay(quietPlan).every((c) => c === 1));
ok('dropped one is the 23:30 habit', quietPlan.every((r) => !/A moment for your habits/.test(r.title)));

// --- weekly review on its day claims a slot (1 daily that day) ---------------
const reviewWed = cfg({
  dailyHabit: { enabled: true, time: '08:00' },
  moodPrompt: { enabled: true, time: '12:00' },
  weeklyReview: { enabled: true, weekday: 3, time: '18:00' }, // Wednesday
});
const rwPlan = planWeek(reviewWed);
check('Wednesday capped at 2 (review + 1 daily)', perDay(rwPlan)[3], 2);
ok('Wednesday has the review', rwPlan.some((r) => r.weekday === 3 && /reflect on your week/.test(r.title)));
ok('other days have 2 dailies', [0, 1, 2, 4, 5, 6].every((d) => perDay(rwPlan)[d] === 2));

console.log(`\n${n}/${n} reminder-plan cases passed.`);
