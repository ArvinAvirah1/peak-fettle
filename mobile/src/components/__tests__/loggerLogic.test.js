/**
 * loggerLogic.test.js — pure logger-helper tests (plain node).
 *
 * Mirrors the transpile-and-eval harness used by
 * mobile/src/planGen/__tests__/quickSwap.test.js (no jest / no expo / no Babel
 * runtime): require('typescript').transpileModule → eval in a module context.
 * loggerLogic.ts is PURE (imports nothing), so the loader needs no stubs.
 * Run:  node mobile/src/components/__tests__/loggerLogic.test.js
 *
 * Coverage (the four founder bugs, pure parts):
 *   Fix #1 rest drift  — restRemainingMs / restRemainingSec derive from an
 *                        ABSOLUTE deadline; clamp at 0; past deadline → 0; null → 0.
 *   Fix #3 up-next      — nextPendingExerciseIndex skips completed exercises,
 *                        wraps around, returns null when nothing else is pending.
 *                        Includes the founder's EXACT jump-ahead edge case.
 *   Fix #4 button swap  — isPlannedComplete / postFinalSetState after the last
 *                        planned set: primary → "Next exercise" / "Finish",
 *                        extra-set label demoted.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/components/__tests__  → up 4 = <repo>
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function makeLoader() {
  const cache = {};
  function load(relPath) {
    if (cache[relPath]) return cache[relPath];
    const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
    const js = ts.transpileModule(src, {
      compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
    }).outputText;
    const mod = { exports: {} };
    cache[relPath] = mod.exports;
    const dir = path.dirname(path.join(REPO, relPath));
    const requireStub = function (id) {
      if (id.charAt(0) === '.') {
        const base = path.resolve(dir, id);
        const cands = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')];
        for (const cand of cands) {
          if (fs.existsSync(cand)) {
            return load(path.relative(REPO, cand).split(path.sep).join('/'));
          }
        }
      }
      try { return require(id); } catch (_) { return {}; }
    };
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'require', '__dirname', '__filename', js)(
      mod, mod.exports, requireStub, dir, path.join(REPO, relPath)
    );
    cache[relPath] = mod.exports;
    return mod.exports;
  }
  return load;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' — ' + err.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}

const load = makeLoader();
const L = load('mobile/src/components/loggerLogic.ts');

console.log('\ncomponents — loggerLogic.test.js\n');

// helper to build a session
function sess(exercises, currentIndex) {
  return { exercises, currentIndex };
}
// exercise factory: logged of target, optional name/done
function ex(loggedSetCount, targetSets, extra) {
  return Object.assign({ loggedSetCount, targetSets }, extra || {});
}

// ── Fix #1: rest remaining from an absolute deadline ─────────────────────────
test('restRemainingMs: derives from endAt - now (mid-countdown)', () => {
  const now = 1_000_000;
  eq(L.restRemainingMs(now + 90_000, now), 90_000, '90s left:');
  eq(L.restRemainingMs(now + 1_500, now), 1_500, '1.5s left:');
});

test('restRemainingMs: clamps at 0 when the deadline is in the PAST', () => {
  const now = 5_000_000;
  eq(L.restRemainingMs(now - 1, now), 0, 'just passed:');
  eq(L.restRemainingMs(now - 60_000, now), 0, 'long passed:');
  eq(L.restRemainingMs(now, now), 0, 'exactly now:');
});

test('restRemainingMs: null / undefined endAt → 0 (idle timer)', () => {
  eq(L.restRemainingMs(null, 123), 0, 'null:');
  eq(L.restRemainingMs(undefined, 123), 0, 'undefined:');
});

test('restRemainingMs is stable across "ticks": same endAt, advancing now, monotonic decrease (no drift)', () => {
  const endAt = 2_000_000 + 120_000; // 120s deadline
  const base = 2_000_000;
  // Simulate the timer screen being CLOSED for 40s then reopened: derivation from
  // the deadline is correct regardless of how many ticks were "missed".
  eq(L.restRemainingMs(endAt, base + 0), 120_000, 't=0:');
  eq(L.restRemainingMs(endAt, base + 40_000), 80_000, 't=40 (screen was closed):');
  eq(L.restRemainingMs(endAt, base + 119_500), 500, 't=119.5:');
  eq(L.restRemainingMs(endAt, base + 130_000), 0, 't=130 past → clamp:');
});

test('restRemainingSec: rounds UP and clamps', () => {
  const now = 0;
  eq(L.restRemainingSec(3_400, now), 4, '3.4s → 4:');
  eq(L.restRemainingSec(1, now), 1, '1ms → 1:');
  eq(L.restRemainingSec(0, now), 0, '0 → 0:');
  eq(L.restRemainingSec(now - 10, now), 0, 'past → 0:'); // now-10 is negative endAt vs now
});

// ── Fix #3: completed detection + next-pending index ─────────────────────────
test('isExerciseCompleted: target-based (logged >= target), extra sets still complete', () => {
  eq(L.isExerciseCompleted(ex(3, 3)), true, '3/3:');
  eq(L.isExerciseCompleted(ex(4, 3)), true, '4/3 (extra set):');
  eq(L.isExerciseCompleted(ex(2, 3)), false, '2/3:');
  eq(L.isExerciseCompleted(ex(0, 3)), false, '0/3:');
});

test('isExerciseCompleted: no target → falls back to done flag, else has-logged-sets', () => {
  eq(L.isExerciseCompleted({ loggedSetCount: 0, done: true }), true, 'done flag true:');
  eq(L.isExerciseCompleted({ loggedSetCount: 5, done: false }), false, 'done flag false wins:');
  eq(L.isExerciseCompleted({ loggedSetCount: 2 }), true, 'no target/done, 2 logged:');
  eq(L.isExerciseCompleted({ loggedSetCount: 0 }), false, 'no target/done, 0 logged:');
  eq(L.isExerciseCompleted(undefined), false, 'undefined:');
});

test('nextPendingExerciseIndex: normal forward advance to the next pending', () => {
  // 0 done, on 1 (done), 2 pending → from 1 should pick 2
  const s = sess([ex(3, 3), ex(3, 3), ex(0, 3), ex(0, 3)], 1);
  eq(L.nextPendingExerciseIndex(s, 1), 2, 'from 1 → 2:');
});

test('nextPendingExerciseIndex: FOUNDER edge case — jumped ahead, came back, skips the completed one', () => {
  // Founder's scenario: gym busy, so the user did a LATER exercise (index 3)
  // first — it is now complete. Exercises 1 and 2 are still pending. The user is
  // back at exercise 0 (just finished it → complete). "Up next" must NOT point at
  // the already-completed exercise 3; it must select the next PENDING one (1).
  const s = sess(
    [
      ex(3, 3),            // 0: current, just completed
      ex(0, 3),            // 1: pending
      ex(0, 3),            // 2: pending
      ex(3, 3),            // 3: already done out of order (jumped ahead)
    ],
    0,
  );
  eq(L.nextPendingExerciseIndex(s, 0), 1, 'must skip nothing yet, next pending is 1:');

  // Now the user is sitting ON the jumped-ahead completed exercise (index 3) and
  // returns to normal order: forward-from-3 wraps past the end back to 1 (pending),
  // NOT the completed 0. This is the exact "up next shows the completed exercise" bug.
  const s2 = sess(
    [
      ex(3, 3),            // 0: done
      ex(0, 3),            // 1: pending
      ex(0, 3),            // 2: pending
      ex(3, 3),            // 3: current (done, jumped ahead)
    ],
    3,
  );
  eq(L.nextPendingExerciseIndex(s2, 3), 1, 'from completed 3, wrap → first pending 1 (not done 0):');
});

test('nextPendingExerciseIndex: wrap-around when tail is complete but head is pending', () => {
  // on index 2 (last, done); 0 pending → wrap to 0
  const s = sess([ex(0, 3), ex(3, 3), ex(3, 3)], 2);
  eq(L.nextPendingExerciseIndex(s, 2), 0, 'wrap to 0:');
});

test('nextPendingExerciseIndex: all OTHERS complete but current pending → returns current (last resort)', () => {
  const s = sess([ex(3, 3), ex(1, 3), ex(3, 3)], 1); // only 1 (current) pending
  eq(L.nextPendingExerciseIndex(s, 1), 1, 'only current pending → current:');
});

test('nextPendingExerciseIndex: everything complete → null (finish state)', () => {
  const s = sess([ex(3, 3), ex(3, 3), ex(3, 3)], 0);
  eq(L.nextPendingExerciseIndex(s, 0), null, 'all done → null:');
});

test('nextPendingExerciseIndex: empty session → null', () => {
  eq(L.nextPendingExerciseIndex(sess([], 0), 0), null, 'empty → null:');
});

// ── Fix #4: post-final-set button emphasis ───────────────────────────────────
test('isPlannedComplete: true only once logged >= target (and target present)', () => {
  eq(L.isPlannedComplete(3, 3), true, '3/3:');
  eq(L.isPlannedComplete(4, 3), true, '4/3:');
  eq(L.isPlannedComplete(2, 3), false, '2/3:');
  eq(L.isPlannedComplete(1, null), false, 'no target:');
  eq(L.isPlannedComplete(1, undefined), false, 'undefined target:');
  eq(L.isPlannedComplete(1, 0), false, 'zero target:');
});

test('postFinalSetState: BEFORE final set → primary stays null, extra label is next set', () => {
  // 2 of 3 logged on current (index 0); next pending is 1.
  const s = sess(
    [Object.assign(ex(2, 3), { name: 'Bench' }), Object.assign(ex(0, 3), { name: 'Row' })],
    0,
  );
  const r = L.postFinalSetState(s);
  eq(r.plannedComplete, false, 'not complete yet:');
  eq(r.primaryLabel, null, 'primary label null pre-completion:');
  eq(r.extraSetLabel, 'Log set 3', 'next set is 3:');
});

test('postFinalSetState: AFTER final set with a pending next → primary "Next exercise: <name>", extra demoted', () => {
  const s = sess(
    [Object.assign(ex(3, 3), { name: 'Bench Press' }), Object.assign(ex(0, 3), { name: 'Barbell Row' })],
    0,
  );
  const r = L.postFinalSetState(s);
  eq(r.plannedComplete, true, 'complete:');
  eq(r.nextIndex, 1, 'next pending is 1:');
  eq(r.primaryLabel, 'Next exercise: Barbell Row', 'primary points at next pending name:');
  eq(r.extraSetLabel, 'Log set 4', 'extra set (demoted) is set 4:');
});

test('postFinalSetState: AFTER final set, jump-ahead → next skips the completed exercise', () => {
  // Current (0) just completed; 1 pending; 2 already done out of order.
  const s = sess(
    [
      Object.assign(ex(3, 3), { name: 'Squat' }),
      Object.assign(ex(0, 3), { name: 'Leg Press' }),
      Object.assign(ex(3, 3), { name: 'Leg Curl' }),
    ],
    0,
  );
  const r = L.postFinalSetState(s);
  eq(r.primaryLabel, 'Next exercise: Leg Press', 'skips the done Leg Curl, targets pending Leg Press:');
  eq(r.nextIndex, 1, 'next index 1:');
});

test('postFinalSetState: AFTER final set with NOTHING pending → "Finish workout"', () => {
  const s = sess(
    [Object.assign(ex(3, 3), { name: 'Bench' }), Object.assign(ex(3, 3), { name: 'Row' })],
    0,
  );
  const r = L.postFinalSetState(s);
  eq(r.plannedComplete, true, 'complete:');
  eq(r.nextIndex, null, 'nothing pending:');
  eq(r.primaryLabel, 'Finish workout', 'primary is finish:');
});

test('postFinalSetState: nextName override is used when provided', () => {
  const s = sess(
    [Object.assign(ex(3, 3), { name: 'Bench' }), Object.assign(ex(0, 3), { name: 'Row' })],
    0,
  );
  const r = L.postFinalSetState(s, { nextName: 'Incline DB Press' });
  eq(r.primaryLabel, 'Next exercise: Incline DB Press', 'override name used:');
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
