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

// ── S1: superset group sequencing ───────────────────────────────────────────
// exercise factory allowing groupId/groupRounds
function gex(loggedSetCount, extra) {
  return Object.assign({ loggedSetCount }, extra || {});
}

test('roundOf: group round derivation from logged count, clamped to groupRounds', () => {
  const a = gex(0, { groupId: 'A', groupRounds: 4 });
  eq(L.roundOf(a, 0), 1, '0 logged → round 1:');
  eq(L.roundOf(a, 1), 2, '1 logged → round 2:');
  eq(L.roundOf(a, 3), 4, '3 logged → round 4:');
  eq(L.roundOf(a, 4), 4, '4 logged (all done) → clamps to 4:');
  eq(L.roundOf(a, 9), 4, 'way over → still clamps to 4:');
  // ungrouped falls back to targetSets
  eq(L.roundOf(ex(1, 3), 1), 2, 'ungrouped uses targetSets:');
  eq(L.roundOf(undefined, 0), 1, 'undefined → 1:');
});

test('isExerciseCompleted: grouped uses groupRounds, NOT targetSets (unequal targets)', () => {
  // A member whose own targetSets is 3 but the group has 4 rounds is NOT complete
  // at 3 — shared rounds supersede the per-exercise target while grouped.
  eq(L.isExerciseCompleted(gex(3, { targetSets: 3, groupId: 'A', groupRounds: 4 })), false,
    '3/4 rounds grouped (own target 3) → not complete:');
  eq(L.isExerciseCompleted(gex(4, { targetSets: 3, groupId: 'A', groupRounds: 4 })), true,
    '4/4 rounds grouped → complete:');
  // ungrouped still uses its own target
  eq(L.isExerciseCompleted(gex(3, { targetSets: 3 })), true, 'ungrouped 3/3 → complete:');
});

test('groupMembers: returns matching members with indices; empty for null groupId', () => {
  const exs = [
    gex(0, { groupId: 'A', name: 'A1' }),
    gex(0, { groupId: 'A', name: 'A2' }),
    gex(0, { name: 'solo' }),
    gex(0, { groupId: 'A', name: 'A3' }),
  ];
  const m = L.groupMembers(exs, 'A');
  eq(m.length, 3, '3 members of A:');
  eq(m[0].index, 0, 'first index 0:');
  eq(m[2].index, 3, 'third index 3 (non-contiguous tolerated):');
  eq(L.groupMembers(exs, null).length, 0, 'null groupId → empty:');
  eq(L.groupMembers(exs, '').length, 0, 'empty groupId → empty:');
});

test('isGroupRoundComplete: true only when every member logged that round', () => {
  const exs = [
    gex(2, { groupId: 'A' }),
    gex(1, { groupId: 'A' }),
    gex(2, { groupId: 'A' }),
  ];
  eq(L.isGroupRoundComplete(exs, 'A', 1), true, 'round 1 done (all >=1):');
  eq(L.isGroupRoundComplete(exs, 'A', 2), false, 'round 2 not done (member 2 has 1):');
});

test('nextInGroupIndex: interior advance A1→A2→A3 then null at round end (3-member circuit)', () => {
  // Simulate logging round 1 across a 3-member circuit. The caller increments the
  // logged member's count BEFORE calling nextInGroupIndex.
  // After A1 logs (A1=1, A2=0, A3=0): next should be A2 (index 1).
  let exs = [gex(1, { groupId: 'A' }), gex(0, { groupId: 'A' }), gex(0, { groupId: 'A' })];
  eq(L.nextInGroupIndex(sess(exs, 0), 0), 1, 'after A1 → A2:');
  // After A2 logs (A1=1, A2=1, A3=0): next should be A3 (index 2).
  exs = [gex(1, { groupId: 'A' }), gex(1, { groupId: 'A' }), gex(0, { groupId: 'A' })];
  eq(L.nextInGroupIndex(sess(exs, 1), 1), 2, 'after A2 → A3:');
  // After A3 logs (A1=1, A2=1, A3=1): round complete → null.
  exs = [gex(1, { groupId: 'A' }), gex(1, { groupId: 'A' }), gex(1, { groupId: 'A' })];
  eq(L.nextInGroupIndex(sess(exs, 2), 2), null, 'after A3 → null (round end):');
});

test('nextInGroupIndex: null for an ungrouped exercise', () => {
  const exs = [ex(1, 3), ex(0, 3)];
  eq(L.nextInGroupIndex(sess(exs, 0), 0), null, 'ungrouped → null:');
});

test('restAfterSet: suppressed mid-round in a 3-member circuit, fires at round end', () => {
  // A1 just logged, A2 & A3 pending this round → suppress rest.
  let exs = [gex(1, { groupId: 'A' }), gex(0, { groupId: 'A' }), gex(0, { groupId: 'A' })];
  eq(L.restAfterSet(sess(exs, 0), 0), false, 'after A1: suppress (A2/A3 pending):');
  // A2 just logged, A3 still pending → suppress.
  exs = [gex(1, { groupId: 'A' }), gex(1, { groupId: 'A' }), gex(0, { groupId: 'A' })];
  eq(L.restAfterSet(sess(exs, 1), 1), false, 'after A2: suppress (A3 pending):');
  // A3 just logged, round complete → rest fires.
  exs = [gex(1, { groupId: 'A' }), gex(1, { groupId: 'A' }), gex(1, { groupId: 'A' })];
  eq(L.restAfterSet(sess(exs, 2), 2), true, 'after A3: rest fires (round end):');
});

test('restAfterSet: ungrouped always fires', () => {
  const exs = [ex(1, 3), ex(0, 3)];
  eq(L.restAfterSet(sess(exs, 0), 0), true, 'ungrouped → always true:');
});

test('nextPendingExerciseIndex: skips ALL members of a fully-completed group', () => {
  // Group A (idx 0,1) fully done at 3/3 rounds; solo C (idx 2) pending. From the
  // last group member (1), next-pending must land on C, skipping done A members.
  const exs = [
    gex(3, { groupId: 'A', groupRounds: 3 }),
    gex(3, { groupId: 'A', groupRounds: 3 }),
    ex(0, 3),
  ];
  eq(L.nextPendingExerciseIndex(sess(exs, 1), 1), 2, 'from done group → solo pending 2:');
  // From solo C wrapping around: whole group A is complete → returns C itself (2)
  // as the last-resort pending, never a completed group member.
  const exs2 = [
    gex(3, { groupId: 'A', groupRounds: 3 }),
    gex(3, { groupId: 'A', groupRounds: 3 }),
    ex(1, 3),
  ];
  eq(L.nextPendingExerciseIndex(sess(exs2, 2), 2), 2, 'wrap past done group → self (2):');
});

test('nextPendingExerciseIndex: entering a partially-done group lands on its first pending member', () => {
  // solo (0, done) → group A (idx 1 done this round has more rounds, idx 2 pending).
  // A1 has logged 1/3, A2 has logged 0/3. From solo 0, next pending is A1 (1).
  const exs = [
    ex(3, 3),
    gex(1, { groupId: 'A', groupRounds: 3 }),
    gex(0, { groupId: 'A', groupRounds: 3 }),
  ];
  eq(L.nextPendingExerciseIndex(sess(exs, 0), 0), 1, 'enter group → first pending member 1:');
});

// ── S1: dropset helpers ──────────────────────────────────────────────────────
test('dropPrefillKg: −20% compounding, rounded to 0.5 kg', () => {
  eq(L.dropPrefillKg(100, 1), 80, '100 → 1 drop → 80:');
  eq(L.dropPrefillKg(100, 2), 64, '100 → 2 drops → 64:');
  eq(L.dropPrefillKg(85, 1), 68, '85 → 1 drop → 68:');
  // 82.5 * 0.8 = 66.0
  eq(L.dropPrefillKg(82.5, 1), 66, '82.5 → 66:');
  // rounding to nearest 0.5: 70*0.8=56, 55*0.8=44
  eq(L.dropPrefillKg(55, 1), 44, '55 → 44:');
  // odd value: 62.5*0.8 = 50.0
  eq(L.dropPrefillKg(62.5, 1), 50, '62.5 → 50:');
  // 47.5 * 0.8 = 38.0
  eq(L.dropPrefillKg(47.5, 1), 38, '47.5 → 38:');
  eq(L.dropPrefillKg(100, 0), 100, 'dropIndex 0 → top weight:');
  eq(L.dropPrefillKg(0, 1), 0, 'zero base → 0:');
});

test('dropPrefillKg: configurable pct + never negative', () => {
  eq(L.dropPrefillKg(100, 1, 0.5), 50, '−50% → 50:');
  eq(L.dropPrefillKg(100, 1, 0.1), 90, '−10% → 90:');
  eq(L.dropPrefillKg(-20, 1), 0, 'negative base clamps to 0:');
});

test('isDropRow: cheap string check without JSON.parse', () => {
  eq(L.isDropRow('{"drop":{"chainId":"c1","index":1}}'), true, 'drop tagged → true:');
  eq(L.isDropRow('{"superset":{"group":"A","round":2}}'), false, 'superset only → false:');
  eq(L.isDropRow('{"drop":{"chainId":"c1","index":0},"superset":{}}'), true, 'drop+superset → true:');
  eq(L.isDropRow(null), false, 'null → false:');
  eq(L.isDropRow(''), false, 'empty → false:');
  eq(L.isDropRow('{"hrAvgBpm":140}'), false, 'cardio metrics → false:');
});

// -- S2: dropset PLAN — which sets a persisted routine marks as dropset sets ---
test('isDropsetPlannedSet: last_n 1 → only the final set of totalSets', () => {
  const plan = { lastN: 1, drops: 2, dropPct: 20 };
  eq(L.isDropsetPlannedSet(1, 4, plan), false, 'set 1 of 4 → no:');
  eq(L.isDropsetPlannedSet(3, 4, plan), false, 'set 3 of 4 → no:');
  eq(L.isDropsetPlannedSet(4, 4, plan), true, 'set 4 of 4 (last) → yes:');
  eq(L.isDropsetPlannedSet(5, 4, plan), true, 'set 5 (beyond target) → yes:');
});

test('isDropsetPlannedSet: last_n 2 → the final TWO sets', () => {
  const plan = { lastN: 2, drops: 2, dropPct: 20 };
  eq(L.isDropsetPlannedSet(2, 4, plan), false, 'set 2 of 4 → no:');
  eq(L.isDropsetPlannedSet(3, 4, plan), true, 'set 3 of 4 → yes (boundary):');
  eq(L.isDropsetPlannedSet(4, 4, plan), true, 'set 4 of 4 → yes:');
  // total 3: last 2 are sets 2,3
  eq(L.isDropsetPlannedSet(1, 3, plan), false, 'set 1 of 3 → no:');
  eq(L.isDropsetPlannedSet(2, 3, plan), true, 'set 2 of 3 → yes:');
});

test("isDropsetPlannedSet: last_n 'all' → every set (totalSets irrelevant)", () => {
  const plan = { lastN: 'all', drops: 2, dropPct: 20 };
  eq(L.isDropsetPlannedSet(1, 4, plan), true, 'set 1 → yes:');
  eq(L.isDropsetPlannedSet(4, 4, plan), true, 'set 4 → yes:');
  // 'all' still fires with an unknown total (locates nothing to skip).
  eq(L.isDropsetPlannedSet(2, null, plan), true, "'all' with null total → yes:");
  eq(L.isDropsetPlannedSet(1, 0, plan), true, "'all' with 0 total → yes:");
});

test('isDropsetPlannedSet: null/absent plan → never a dropset set (back-compat)', () => {
  eq(L.isDropsetPlannedSet(4, 4, null), false, 'null plan → false:');
  eq(L.isDropsetPlannedSet(4, 4, undefined), false, 'undefined plan → false:');
});

test('isDropsetPlannedSet: numeric last_n needs a known total (no false auto-offer)', () => {
  const plan = { lastN: 2, drops: 2, dropPct: 20 };
  eq(L.isDropsetPlannedSet(3, null, plan), false, 'numeric last_n + null total → false:');
  eq(L.isDropsetPlannedSet(3, 0, plan), false, 'numeric last_n + 0 total → false:');
  eq(L.isDropsetPlannedSet(0, 4, plan), false, 'ordinal < 1 → false:');
});

// ── TICKET-128: effort display (RIR ⇄ RPE) ──────────────────────────────────
// RIR stays the ONLY stored value; these are pure display-layer conversions.

test('rirToRpe: standard band (rir 0..5 -> rpe 10..5)', () => {
  eq(L.rirToRpe(0), 10, 'rir 0 -> rpe 10 (to failure):');
  eq(L.rirToRpe(1), 9, 'rir 1 -> rpe 9:');
  eq(L.rirToRpe(2), 8, 'rir 2 -> rpe 8:');
  eq(L.rirToRpe(3), 7, 'rir 3 -> rpe 7:');
  eq(L.rirToRpe(4), 6, 'rir 4 -> rpe 6:');
  eq(L.rirToRpe(5), 5, 'rir 5 -> rpe 5:');
});

test('rirToRpe: clamps RIR > 5 to rpe 5 (band floor)', () => {
  eq(L.rirToRpe(6), 5, 'rir 6 -> clamped 5:');
  eq(L.rirToRpe(7), 5, 'rir 7 -> clamped 5:');
  eq(L.rirToRpe(10), 5, 'rir 10 -> clamped 5:');
  eq(L.rirToRpe(100), 5, 'rir 100 -> clamped 5:');
});

test('rirToRpe: null/undefined/negative/non-finite -> null', () => {
  eq(L.rirToRpe(null), null, 'null:');
  eq(L.rirToRpe(undefined), null, 'undefined:');
  eq(L.rirToRpe(-1), null, 'negative:');
  eq(L.rirToRpe(NaN), null, 'NaN:');
});

test('isRpeClamped: true only when RIR > 5', () => {
  eq(L.isRpeClamped(5), false, 'rir 5 (boundary) -> not clamped:');
  eq(L.isRpeClamped(6), true, 'rir 6 -> clamped:');
  eq(L.isRpeClamped(0), false, 'rir 0 -> not clamped:');
  eq(L.isRpeClamped(null), false, 'null -> false:');
  eq(L.isRpeClamped(undefined), false, 'undefined -> false:');
});

test('rpeToRir: standard band (rpe 10..5 -> rir 0..5), the value that gets STORED', () => {
  eq(L.rpeToRir(10), 0, 'rpe 10 -> rir 0:');
  eq(L.rpeToRir(9), 1, 'rpe 9 -> rir 1:');
  eq(L.rpeToRir(8), 2, 'rpe 8 -> rir 2:');
  eq(L.rpeToRir(7), 3, 'rpe 7 -> rir 3:');
  eq(L.rpeToRir(6), 4, 'rpe 6 -> rir 4:');
  eq(L.rpeToRir(5), 5, 'rpe 5 -> rir 5:');
});

test('rpeToRir: clamps out-of-band typed input (0-10) before converting', () => {
  eq(L.rpeToRir(11), 0, 'rpe 11 (over) clamps to 10 -> rir 0:');
  eq(L.rpeToRir(4), 6, 'rpe 4 (under band) clamps to... still converts (4 in 0-10 range) -> rir 6:');
  eq(L.rpeToRir(-5), 10, 'rpe -5 clamps to 0 -> rir 10:');
  eq(L.rpeToRir(1000), 0, 'rpe way over clamps to 10 -> rir 0:');
});

test('rpeToRir: null/undefined/non-finite -> null (nothing typed)', () => {
  eq(L.rpeToRir(null), null, 'null:');
  eq(L.rpeToRir(undefined), null, 'undefined:');
  eq(L.rpeToRir(NaN), null, 'NaN:');
});

test('rirToRpe / rpeToRir round-trip within the 0-5 band', () => {
  for (let rir = 0; rir <= 5; rir++) {
    const rpe = L.rirToRpe(rir);
    eq(L.rpeToRir(rpe), rir, 'round-trip rir ' + rir + ' -> rpe ' + rpe + ' -> rir:');
  }
});

test('formatEffort: mode "rir" — unchanged existing copy ("to failure" / "RIR N")', () => {
  eq(L.formatEffort(0, 'rir'), 'to failure', 'rir 0:');
  eq(L.formatEffort(2, 'rir'), 'RIR 2', 'rir 2:');
  eq(L.formatEffort(5, 'rir'), 'RIR 5', 'rir 5:');
  eq(L.formatEffort(8, 'rir'), 'RIR 8', 'rir 8 (no clamp in rir mode):');
});

test('formatEffort: mode "rpe" — converts, clamps to "RPE <= 5" band label', () => {
  eq(L.formatEffort(0, 'rpe'), 'RPE 10', 'rir 0 -> RPE 10:');
  eq(L.formatEffort(2, 'rpe'), 'RPE 8', 'rir 2 -> RPE 8:');
  eq(L.formatEffort(5, 'rpe'), 'RPE 5', 'rir 5 -> RPE 5 (boundary, not clamped label):');
  eq(L.formatEffort(6, 'rpe'), 'RPE ≤ 5', 'rir 6 -> clamped label:');
  eq(L.formatEffort(10, 'rpe'), 'RPE ≤ 5', 'rir 10 -> clamped label:');
});

test('formatEffort: null/undefined/negative RIR -> null in EITHER mode (no chip to render)', () => {
  eq(L.formatEffort(null, 'rir'), null, 'null, rir mode:');
  eq(L.formatEffort(undefined, 'rir'), null, 'undefined, rir mode:');
  eq(L.formatEffort(null, 'rpe'), null, 'null, rpe mode:');
  eq(L.formatEffort(undefined, 'rpe'), null, 'undefined, rpe mode:');
  eq(L.formatEffort(-1, 'rir'), null, 'negative, rir mode:');
  eq(L.formatEffort(-1, 'rpe'), null, 'negative, rpe mode:');
});

test('DB-write invariant: whatever the display mode, the value handed to storage is always RIR', () => {
  // Simulates the StepperLogger flow: user types a value while effort_display
  // is 'rpe'; the UI must convert RPE -> RIR before calling onLogSet, so the
  // persisted sets.rir is identical to what would have been stored in 'rir'
  // mode for the same underlying effort level.
  function simulateStoredRir(typedValue, mode) {
    if (mode === 'rpe') return L.rpeToRir(typedValue);
    return typedValue; // 'rir' mode: typed value IS the RIR, stored as-is
  }
  // User perceives "RPE 8" effort in both modes:
  eq(simulateStoredRir(2, 'rir'), 2, 'rir mode: typed 2 -> stored rir 2:');
  eq(simulateStoredRir(8, 'rpe'), 2, 'rpe mode: typed RPE 8 -> stored rir 2 (SAME as rir-mode):');
  // "to failure":
  eq(simulateStoredRir(0, 'rir'), 0, 'rir mode: typed 0 -> stored rir 0:');
  eq(simulateStoredRir(10, 'rpe'), 0, 'rpe mode: typed RPE 10 -> stored rir 0 (SAME):');
  // Round-trip through formatEffort back to the same stored rir renders consistently:
  eq(L.formatEffort(simulateStoredRir(8, 'rpe'), 'rpe'), 'RPE 8', 'display after store still reads RPE 8:');
  eq(L.formatEffort(simulateStoredRir(8, 'rpe'), 'rir'), 'RIR 2', 'same stored row reads RIR 2 in rir mode:');
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
