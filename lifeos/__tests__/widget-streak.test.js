'use strict';

/**
 * Widget streak parity (LIFEOS TICKET-116 AC #2): the streak the widget shows
 * MUST equal computeStreak(...).current over the same data. The bridge computes
 * it as computeStreak(aggregateDailyStatus(rows), today).current — this asserts
 * that pipeline (both pure engine fns) against hand-verified expectations, so the
 * widget ring and the in-app streak can never silently diverge.
 *
 * Run: node __tests__/widget-streak.test.js
 */

const path = require('path');
const assert = require('assert');
const { loadTs } = require('./tsLoader');

const streaks = loadTs(path.join(__dirname, '..', 'src', 'engine', 'streaks.ts'));
const { aggregateDailyStatus, computeStreak, addDays } = streaks;

const TODAY = '2026-06-12'; // a Friday, matching streaks.test.js

/** Build per-habit log rows (shape of `SELECT date, status FROM lo_habit_logs`). */
function row(offset, status) {
  return { date: addDays(TODAY, -offset), status };
}

/** Exactly what widgetBridge.buildWidgetPayload does for the ring. */
function widgetStreak(rows) {
  return computeStreak(aggregateDailyStatus(rows), TODAY).current;
}

let n = 0;
function check(name, actual, expected) {
  n += 1;
  assert.deepStrictEqual(actual, expected, `case ${n} (${name}): got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`  ok ${n} — ${name}`);
}

// --- aggregation collapse (any done => done; else any rest => rest; else skip) ---
const mixed = [
  row(0, 'done'), row(0, 'skip'),  // today: done wins over skip
  row(1, 'rest'), row(1, 'skip'),  // rest wins over skip
  row(2, 'skip'), row(2, 'skip'),  // skip
  row(3, 'done'),
  // offset 4 missing (a miss, forgiven by the done at offset 3)
  row(5, 'done'),
  row(6, 'rest'),
];
const agg = aggregateDailyStatus(mixed);
check('aggregate: done beats skip', agg.get(addDays(TODAY, 0)), 'done');
check('aggregate: rest beats skip', agg.get(addDays(TODAY, -1)), 'rest');
check('aggregate: all skip => skip', agg.get(addDays(TODAY, -2)), 'skip');
check('aggregate: single done', agg.get(addDays(TODAY, -3)), 'done');

// --- PARITY: widget value == computeStreak over the aggregated map ---
check('widget streak == direct computeStreak', widgetStreak(mixed), computeStreak(agg, TODAY).current);
// hand-verified: 06-12 done, 06-11 rest, 06-10 skip(neutral), 06-09 done,
// 06-08 miss (forgiven by 06-09 done), 06-07 done, 06-06 rest; then 2 misses break.
check('widget streak forgiving chain = 5', widgetStreak(mixed), 5);

// --- empty data => 0, no milestone crash ---
check('no logs => streak 0', widgetStreak([]), 0);
check('no logs milestone null', computeStreak(aggregateDailyStatus([]), TODAY).milestone, null);

// --- milestone parity: 7 consecutive done days across two habits => milestone 7 ---
const sevenDone = [];
for (let i = 0; i < 7; i++) {
  sevenDone.push(row(i, 'done'));
  sevenDone.push(row(i, i % 2 === 0 ? 'skip' : 'done')); // 2nd habit varies; aggregation => done
}
const sevenAgg = aggregateDailyStatus(sevenDone);
check('7-day streak current', widgetStreak(sevenDone), 7);
check('7-day milestone reached', computeStreak(sevenAgg, TODAY).milestone, 7);

// --- two missed days break the chain (today + far gap) ---
const broken = [row(0, 'done'), row(3, 'done'), row(4, 'done')]; // 06-11 & 06-10 both missing
check('two-day gap breaks: only today counts', widgetStreak(broken), 1);

console.log(`\n${n}/${n} widget-streak parity cases passed.`);
