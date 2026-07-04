/**
 * conditioningTimerLogic.test.js — pure conditioning-timer math tests (plain node).
 *
 * Mirrors the transpile-and-eval harness used by loggerLogic.test.js / routineFields.test.js
 * (no jest / no expo / no Babel runtime): require('typescript').transpileModule → eval in a
 * module context. conditioningTimerLogic.ts is PURE (imports nothing), so the loader needs no
 * stubs.
 * Run:  node mobile/src/components/__tests__/conditioningTimerLogic.test.js
 *
 * Coverage (TICKET-144 acceptance criterion 3 + 5 — table-driven, no Date.now/setInterval):
 *   EMOM     — round/secLeftInRound derivation across round boundaries, done clamp.
 *   AMRAP    — countdown clamp, round-tap increment/decrement, result rounds passthrough.
 *   INTERVAL — work/rest phase alternation, trailing-rest total-duration option.
 *   buildConditioningResult — abandon mid-plan, finish-exact, over-run clamp, per mode.
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
function deepEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
  }
}

const load = makeLoader();
const T = load('mobile/src/components/logger/conditioningTimerLogic.ts');

console.log('\ncomponents/logger — conditioningTimerLogic.test.js\n');

// ── normalizeConfig / totalDurationSec ──────────────────────────────────────
test('normalizeConfig: clamps out-of-bounds rounds/seconds', () => {
  const c = T.normalizeConfig({ mode: 'emom', rounds: 999, intervalSec: -5 });
  eq(c.rounds, 50, 'rounds clamps to max 50:');
  eq(c.intervalSec, 1, 'intervalSec clamps to min 1:');
});

test('totalDurationSec: EMOM = rounds * intervalSec', () => {
  eq(T.totalDurationSec({ mode: 'emom', rounds: 10, intervalSec: 60 }), 600, '10x60=600:');
});

test('totalDurationSec: AMRAP = capSec', () => {
  eq(T.totalDurationSec({ mode: 'amrap', capSec: 900 }), 900, 'cap passthrough:');
});

test('totalDurationSec: INTERVAL default (no trailing rest) subtracts the final rest', () => {
  // 8 rounds x (30 work + 15 rest) = 360, minus one trailing rest (15) = 345
  eq(T.totalDurationSec({ mode: 'interval', rounds: 8, workSec: 30, restSec: 15 }), 345, 'trailing rest excluded by default:');
});

test('totalDurationSec: INTERVAL with trailingRest:true includes the final rest', () => {
  eq(T.totalDurationSec({ mode: 'interval', rounds: 8, workSec: 30, restSec: 15, trailingRest: true }), 360, 'trailing rest included:');
});

test('totalDurationSec: INTERVAL with restSec 0 is just rounds*workSec (no rest ever)', () => {
  eq(T.totalDurationSec({ mode: 'interval', rounds: 5, workSec: 20, restSec: 0 }), 100, '5x20, no rest:');
});

// ── EMOM phase derivation ────────────────────────────────────────────────────
test('emomPhaseAt: round 1, mid-interval', () => {
  const cfg = { mode: 'emom', rounds: 10, intervalSec: 60 };
  const p = T.emomPhaseAt(cfg, 25_000); // 25s into round 1
  eq(p.round, 1, 'round 1:');
  eq(p.secLeftInRound, 35, '35s left in round:');
  eq(p.done, false, 'not done:');
});

test('emomPhaseAt: exact round boundary rolls to the next round', () => {
  const cfg = { mode: 'emom', rounds: 10, intervalSec: 60 };
  // exactly 60s elapsed -> round 2 just started, full interval left
  const p = T.emomPhaseAt(cfg, 60_000);
  eq(p.round, 2, 'round 2 at t=60s:');
  eq(p.secLeftInRound, 60, 'full interval left:');
});

test('emomPhaseAt: mid-way through round 3 (e.g. a 3-round EMOM)', () => {
  const cfg = { mode: 'emom', rounds: 3, intervalSec: 60 };
  const p = T.emomPhaseAt(cfg, 150_000); // 150s = 2*60 + 30 -> round 3, 30s left
  eq(p.round, 3, 'round 3:');
  eq(p.secLeftInRound, 30, '30s left:');
});

test('emomPhaseAt: at/after the plan total -> done, clamped to the last round', () => {
  const cfg = { mode: 'emom', rounds: 5, intervalSec: 60 };
  const atEnd = T.emomPhaseAt(cfg, 300_000); // exactly rounds*interval
  eq(atEnd.done, true, 'exactly at total -> done:');
  eq(atEnd.round, 5, 'clamped to last round:');
  eq(atEnd.secLeftInRound, 0, 'no time left:');
  const wayOver = T.emomPhaseAt(cfg, 999_000);
  eq(wayOver.done, true, 'way over -> still done:');
  eq(wayOver.round, 5, 'still clamped to 5:');
});

test('emomPhaseAt: negative elapsed (not yet started) reads as round 1, full interval', () => {
  const cfg = { mode: 'emom', rounds: 5, intervalSec: 45 };
  const p = T.emomPhaseAt(cfg, -500);
  eq(p.round, 1, 'round 1:');
  eq(p.secLeftInRound, 45, 'full interval:');
  eq(p.done, false, 'not done:');
});

// ── AMRAP phase derivation ────────────────────────────────────────────────────
test('amrapPhaseAt: counts down from the cap', () => {
  const cfg = { mode: 'amrap', capSec: 600 };
  eq(T.amrapPhaseAt(cfg, 0).secLeft, 600, 't=0 -> full cap:');
  eq(T.amrapPhaseAt(cfg, 100_000).secLeft, 500, 't=100s -> 500 left:');
});

test('amrapPhaseAt: rounds UP a partial-second remainder (matches restRemainingSec convention)', () => {
  const cfg = { mode: 'amrap', capSec: 60 };
  // 59.6s elapsed -> 0.4s left -> ceil to 1
  const p = T.amrapPhaseAt(cfg, 59_600);
  eq(p.secLeft, 1, 'rounds up to 1:');
  eq(p.done, false, 'not done while > 0:');
});

test('amrapPhaseAt: clamps at 0 / done once the cap is reached or exceeded', () => {
  const cfg = { mode: 'amrap', capSec: 300 };
  eq(T.amrapPhaseAt(cfg, 300_000).done, true, 'exactly at cap -> done:');
  eq(T.amrapPhaseAt(cfg, 300_000).secLeft, 0, 'secLeft 0:');
  eq(T.amrapPhaseAt(cfg, 999_000).done, true, 'way over -> done:');
});

// ── INTERVAL phase derivation ────────────────────────────────────────────────
test('intervalPhaseAt: round 1 work phase, then rolls into rest', () => {
  const cfg = { mode: 'interval', rounds: 4, workSec: 30, restSec: 15 };
  const midWork = T.intervalPhaseAt(cfg, 10_000);
  eq(midWork.round, 1, 'round 1:');
  eq(midWork.phase, 'work', 'work phase:');
  eq(midWork.secLeftInPhase, 20, '20s left of work:');

  const midRest = T.intervalPhaseAt(cfg, 35_000); // 5s into the rest (30 work + 5)
  eq(midRest.round, 1, 'still round 1 (rest belongs to round 1):');
  eq(midRest.phase, 'rest', 'rest phase:');
  eq(midRest.secLeftInPhase, 10, '10s left of rest:');
});

test('intervalPhaseAt: rolls into round 2 work after round 1 completes (work+rest cycle)', () => {
  const cfg = { mode: 'interval', rounds: 4, workSec: 30, restSec: 15 };
  const p = T.intervalPhaseAt(cfg, 45_000); // exactly one full cycle (30+15)
  eq(p.round, 2, 'round 2:');
  eq(p.phase, 'work', 'fresh work phase:');
  eq(p.secLeftInPhase, 30, 'full work interval:');
});

test('intervalPhaseAt: restSec 0 -> every round is 100% work, never reports rest', () => {
  const cfg = { mode: 'interval', rounds: 3, workSec: 20, restSec: 0 };
  const p1 = T.intervalPhaseAt(cfg, 19_000);
  eq(p1.phase, 'work', 'work near round end:');
  const p2 = T.intervalPhaseAt(cfg, 20_000); // exactly at boundary -> round 2 work
  eq(p2.round, 2, 'round 2 immediately (no rest gap):');
  eq(p2.phase, 'work', 'still work (no rest phase exists):');
});

test('intervalPhaseAt: at/after the full plan -> done, clamped to the last round', () => {
  const cfg = { mode: 'interval', rounds: 4, workSec: 30, restSec: 15 };
  const total = 4 * (30 + 15);
  const atEnd = T.intervalPhaseAt(cfg, total * 1000);
  eq(atEnd.done, true, 'done at total:');
  eq(atEnd.round, 4, 'clamped to last round:');
  const over = T.intervalPhaseAt(cfg, (total + 500) * 1000);
  eq(over.done, true, 'still done:');
  eq(over.round, 4, 'still clamped:');
});

// ── AMRAP round-tap counters ─────────────────────────────────────────────────
test('incrementRounds / decrementRounds: basic tap tracking, never negative', () => {
  eq(T.incrementRounds(0), 1, '0 -> 1:');
  eq(T.incrementRounds(7), 8, '7 -> 8:');
  eq(T.decrementRounds(1), 0, '1 -> 0:');
  eq(T.decrementRounds(0), 0, '0 -> 0 (floor):');
  eq(T.incrementRounds(NaN), 1, 'NaN treated as 0 -> 1:');
  eq(T.decrementRounds(-5), 0, 'negative input clamps to 0 before decrement:');
});

// ── buildConditioningResult ──────────────────────────────────────────────────
test('buildConditioningResult: EMOM abandoned mid-plan reports actual elapsed + round reached', () => {
  const cfg = { mode: 'emom', rounds: 10, intervalSec: 60 };
  // Abandoned at 3.5 rounds in (210s)
  const r = T.buildConditioningResult(cfg, 210_000);
  eq(r.durationSec, 210, 'elapsed 210s stored:');
  eq(r.rounds, 4, 'round 4 (0-based round 3 + 1) reached:');
});

test('buildConditioningResult: EMOM finished exactly -> durationSec clamps to the plan total', () => {
  const cfg = { mode: 'emom', rounds: 5, intervalSec: 60 };
  const r = T.buildConditioningResult(cfg, 305_000); // 5s over due to UI lag
  eq(r.durationSec, 300, 'clamped to 300 (5*60), never logs more than prescribed:');
  eq(r.rounds, 5, 'rounds clamped to 5:');
});

test('buildConditioningResult: AMRAP uses the passed-in roundsCompleted tap count, duration clamped to cap', () => {
  const cfg = { mode: 'amrap', capSec: 600 };
  const finished = T.buildConditioningResult(cfg, 600_000, 12);
  eq(finished.durationSec, 600, 'duration = cap:');
  eq(finished.rounds, 12, 'user-tapped rounds passthrough:');

  const abandoned = T.buildConditioningResult(cfg, 240_000, 5);
  eq(abandoned.durationSec, 240, 'abandoned early -> actual elapsed:');
  eq(abandoned.rounds, 5, 'rounds so far:');
});

test('buildConditioningResult: AMRAP with no roundsCompleted passed -> rounds null (not a false 0)', () => {
  const cfg = { mode: 'amrap', capSec: 300 };
  const r = T.buildConditioningResult(cfg, 100_000);
  eq(r.rounds, null, 'no tap count provided -> null, not 0:');
});

test('buildConditioningResult: INTERVAL reports the round reached, duration clamped to plan total (no trailing rest)', () => {
  const cfg = { mode: 'interval', rounds: 8, workSec: 30, restSec: 15 };
  const plannedTotal = T.totalDurationSec(cfg); // 345
  // abandon mid round 5 work phase: 4 full cycles (180) + 10s into round 5 work
  const r = T.buildConditioningResult(cfg, (4 * 45 + 10) * 1000);
  eq(r.durationSec, 190, 'elapsed 190s:');
  eq(r.rounds, 5, 'round 5 reached:');

  const finished = T.buildConditioningResult(cfg, (plannedTotal + 999) * 1000);
  eq(finished.durationSec, plannedTotal, 'clamped to planned total (345), never over-logs:');
  eq(finished.rounds, 8, 'all 8 rounds:');
});

test('buildConditioningResult: negative/zero elapsed never produces a negative duration', () => {
  const cfg = { mode: 'emom', rounds: 3, intervalSec: 30 };
  const r = T.buildConditioningResult(cfg, -1000);
  eq(r.durationSec, 0, 'clamps to 0:');
});

// ── Display helpers ──────────────────────────────────────────────────────────
test('formatClock: m:ss formatting, zero-pads seconds, never negative', () => {
  eq(T.formatClock(0), '0:00', 'zero:');
  eq(T.formatClock(5), '0:05', 'single digit seconds:');
  eq(T.formatClock(65), '1:05', '65s -> 1:05:');
  eq(T.formatClock(600), '10:00', '600s -> 10:00:');
  eq(T.formatClock(-10), '0:00', 'negative clamps to 0:');
});

test('modeLabel: display labels for each mode', () => {
  eq(T.modeLabel('emom'), 'EMOM', 'emom:');
  eq(T.modeLabel('amrap'), 'AMRAP', 'amrap:');
  eq(T.modeLabel('interval'), 'Intervals', 'interval:');
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
