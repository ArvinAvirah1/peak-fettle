/**
 * intentHandlers.test.js — TICKET-145 pure App-Intents handler tests.
 *
 * Mirrors the proven typescript-transpile pattern from
 * mobile/src/lib/importers/__tests__/importEngine.test.js and
 * mobile/src/db/__tests__/migrations.test.js:
 *   require('typescript').transpileModule → eval in a fresh module context.
 * No jest, no Babel, no expo-sqlite/React Native needed — intentHandlers.ts
 * only imports the REAL '../../constants/units' (pure, no RN dependency), so
 * no stubbing is required at all for this suite.
 *
 * Run:  node mobile/src/lib/intents/__tests__/intentHandlers.test.js
 *
 * Coverage (per the ticket brief):
 *   - lb-mode "one hundred" → 45.36 kg (the 185-lb lesson, voice edition;
 *     CLAUDE.md §2 acceptance: a spoken "one hundred" in lb-mode must store
 *     45.36 kg).
 *   - kg-mode passthrough (no conversion).
 *   - LogSetIntent: missing exercise (no in-progress + no spoken name) →
 *     graceful failure copy, never a throw.
 *   - LogSetIntent: spoken exercise name with no resolver match → graceful
 *     failure copy.
 *   - Bad/missing reps and weight payloads → graceful failure copy.
 *   - StartWorkoutIntent: named routine resolves; unnamed falls back to
 *     "next up"; neither present → graceful failure copy.
 *   - StartRestIntent: default duration, spoken duration, clamping to
 *     min/max, bad payload → graceful failure copy.
 *   - No handler ever throws — every invalid input path returns
 *     `{ ok: false, message }`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/lib/intents/__tests__ → up 5 = <repo>
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function load(relPath, deps) {
  deps = deps || {};
  const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const requireStub = function (id) {
    const key = id.replace(/^\.\//, '').replace(/^(\.\.\/)+/, '');
    if (deps[id]) return deps[id];
    if (deps[key]) return deps[key];
    try { return require(id); } catch (_) { return {}; }
  };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', '__dirname', '__filename', js)(
    mod, mod.exports, requireStub,
    path.dirname(path.join(REPO, relPath)),
    path.join(REPO, relPath)
  );
  return mod.exports;
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (err) {
    console.log('  FAIL  ' + name + ' — ' + (err && err.message ? err.message : String(err)));
    failed++;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}
function close(a, b, eps, msg) {
  if (Math.abs(a - b) > eps) throw new Error(msg || `expected ${a} ~= ${b}`);
}

// intentHandlers.ts imports the REAL constants/units.ts — pure module, no
// stubbing needed. Loaded here only so we can sanity-check the conversion
// constant independently of the handler (belt-and-braces).
const units = load('mobile/src/constants/units.ts');

function freshHandlers() {
  return load('mobile/src/lib/intents/intentHandlers.ts', {
    '../../constants/units': units,
  });
}

const NOW = new Date('2026-07-03T12:00:00.000Z');

async function main() {
  console.log('\nintents — intentHandlers.test.js\n');

  // ── LogSetIntent: unit conversion (the 185-lb lesson, voice edition) ──────

  await test('LogSetIntent: lb-mode "one hundred" -> 45.36 kg, not 100', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 8, weight: 100, exercise: null },
      {
        unitPref: 'lbs',
        currentExercise: { id: 'ex-1', name: 'Bench Press' },
        now: NOW,
      },
    );
    assert(result.ok, 'expected ok result, got: ' + JSON.stringify(result));
    close(result.plan.weightKg, 45.36, 0.01, 'weightKg:');
    assert(result.plan.weightKg !== 100, 'must not store the raw lb number as kg');
  });

  await test('LogSetIntent: kg-mode passes weight through unchanged', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 5, weight: 60, exercise: null },
      {
        unitPref: 'kg',
        currentExercise: { id: 'ex-1', name: 'Squat' },
        now: NOW,
      },
    );
    assert(result.ok, 'expected ok result');
    eq(result.plan.weightKg, 60, 'weightKg (kg-mode, no conversion):');
  });

  await test('LogSetIntent: lb-mode 185 lb -> 83.91 kg (matches the units.ts fixture used elsewhere)', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 1, weight: 185, exercise: null },
      {
        unitPref: 'lbs',
        currentExercise: { id: 'ex-1', name: 'Deadlift' },
        now: NOW,
      },
    );
    assert(result.ok, 'expected ok result');
    close(result.plan.weightKg, 83.91, 0.01, 'weightKg:');
  });

  // ── LogSetIntent: reps/weight rounding + numeric-string tolerance ─────────

  await test('LogSetIntent: rounds fractional reps to an integer', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 8.0, weight: 20, exercise: null },
      { unitPref: 'kg', currentExercise: { id: 'ex-1', name: 'Curl' }, now: NOW },
    );
    assert(result.ok, 'expected ok result');
    eq(result.plan.reps, 8, 'reps:');
  });

  await test('LogSetIntent: accepts a numeric string weight (Siri may hand over a string)', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 10, weight: '22.5', exercise: null },
      { unitPref: 'kg', currentExercise: { id: 'ex-1', name: 'Curl' }, now: NOW },
    );
    assert(result.ok, 'expected ok result: ' + JSON.stringify(result));
    eq(result.plan.weightKg, 22.5, 'weightKg:');
  });

  // ── LogSetIntent: missing exercise -> graceful failure copy ───────────────

  await test('LogSetIntent: no in-progress exercise + no spoken name -> graceful failure, no throw', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 8, weight: 50, exercise: null },
      { unitPref: 'kg', currentExercise: null, now: NOW },
    );
    assert(!result.ok, 'expected a graceful failure');
    assert(typeof result.message === 'string' && result.message.length > 0, 'expected user-facing copy');
    eq(result.message, h.INTENT_MESSAGES.noActiveWorkout);
  });

  await test('LogSetIntent: spoken exercise name with no resolver match -> graceful failure', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 8, weight: 50, exercise: 'Nonexistent Exercise' },
      {
        unitPref: 'kg',
        currentExercise: { id: 'ex-1', name: 'Bench Press' },
        resolveExerciseByName: () => null,
        now: NOW,
      },
    );
    assert(!result.ok, 'expected a graceful failure');
    eq(result.message, h.INTENT_MESSAGES.noExerciseMatch);
  });

  await test('LogSetIntent: spoken exercise name WITH a resolver match overrides currentExercise', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 8, weight: 50, exercise: 'Overhead Press' },
      {
        unitPref: 'kg',
        currentExercise: { id: 'ex-1', name: 'Bench Press' },
        resolveExerciseByName: (name) => (name === 'Overhead Press' ? { id: 'ex-2', name: 'Overhead Press' } : null),
        now: NOW,
      },
    );
    assert(result.ok, 'expected ok result');
    eq(result.plan.exerciseId, 'ex-2');
    eq(result.plan.exerciseName, 'Overhead Press');
  });

  // ── LogSetIntent: bad payloads -> graceful failure, never a throw ─────────

  await test('LogSetIntent: missing reps -> graceful failure', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: null, weight: 50, exercise: null },
      { unitPref: 'kg', currentExercise: { id: 'ex-1', name: 'Bench' }, now: NOW },
    );
    assert(!result.ok, 'expected a graceful failure');
    eq(result.message, h.INTENT_MESSAGES.badReps);
  });

  await test('LogSetIntent: zero/negative reps -> graceful failure', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 0, weight: 50, exercise: null },
      { unitPref: 'kg', currentExercise: { id: 'ex-1', name: 'Bench' }, now: NOW },
    );
    assert(!result.ok, 'expected a graceful failure for reps=0');
  });

  await test('LogSetIntent: non-numeric reps string -> graceful failure', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 'a lot', weight: 50, exercise: null },
      { unitPref: 'kg', currentExercise: { id: 'ex-1', name: 'Bench' }, now: NOW },
    );
    assert(!result.ok, 'expected a graceful failure');
    eq(result.message, h.INTENT_MESSAGES.badReps);
  });

  await test('LogSetIntent: missing weight -> graceful failure', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 8, weight: undefined, exercise: null },
      { unitPref: 'kg', currentExercise: { id: 'ex-1', name: 'Bench' }, now: NOW },
    );
    assert(!result.ok, 'expected a graceful failure');
    eq(result.message, h.INTENT_MESSAGES.badWeight);
  });

  await test('LogSetIntent: negative weight -> graceful failure', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 8, weight: -10, exercise: null },
      { unitPref: 'kg', currentExercise: { id: 'ex-1', name: 'Bench' }, now: NOW },
    );
    assert(!result.ok, 'expected a graceful failure for negative weight');
  });

  await test('LogSetIntent: bodyweight (0 kg/lb) is a valid weight', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 12, weight: 0, exercise: null },
      { unitPref: 'kg', currentExercise: { id: 'ex-1', name: 'Pull-up' }, now: NOW },
    );
    assert(result.ok, 'expected ok result for 0 weight (bodyweight): ' + JSON.stringify(result));
    eq(result.plan.weightKg, 0);
  });

  // ── LogSetIntent: loggedAt derives from the injected clock, never Date.now() directly ──

  await test('LogSetIntent: loggedAt uses the injected `now`, not the live clock', () => {
    const h = freshHandlers();
    const result = h.handleLogSetIntent(
      { reps: 8, weight: 50, exercise: null },
      { unitPref: 'kg', currentExercise: { id: 'ex-1', name: 'Bench' }, now: NOW },
    );
    assert(result.ok, 'expected ok result');
    eq(result.plan.loggedAt, NOW.toISOString());
  });

  // ── StartWorkoutIntent ─────────────────────────────────────────────────────

  await test('StartWorkoutIntent: named routine resolves via resolveRoutineByName', () => {
    const h = freshHandlers();
    const result = h.handleStartWorkoutIntent(
      { routine: 'Push Day' },
      {
        resolveRoutineByName: (name) => (name === 'Push Day' ? { id: 'r-1', name: 'Push Day' } : null),
        nextUp: null,
        now: NOW,
      },
    );
    assert(result.ok, 'expected ok result');
    eq(result.plan.routineId, 'r-1');
    eq(result.plan.routineName, 'Push Day');
  });

  await test('StartWorkoutIntent: unnamed falls back to schedule "next up"', () => {
    const h = freshHandlers();
    const result = h.handleStartWorkoutIntent(
      { routine: null },
      { nextUp: { routineId: 'r-2', routineName: 'Leg Day' }, now: NOW },
    );
    assert(result.ok, 'expected ok result');
    eq(result.plan.routineId, 'r-2');
    eq(result.plan.routineName, 'Leg Day');
  });

  await test('StartWorkoutIntent: named routine with no match -> graceful failure', () => {
    const h = freshHandlers();
    const result = h.handleStartWorkoutIntent(
      { routine: 'Nonexistent Routine' },
      { resolveRoutineByName: () => null, nextUp: { routineId: 'r-2', routineName: 'Leg Day' }, now: NOW },
    );
    assert(!result.ok, 'expected a graceful failure');
    eq(result.message, h.INTENT_MESSAGES.noRoutineMatch);
  });

  await test('StartWorkoutIntent: nothing named + nothing scheduled -> graceful failure', () => {
    const h = freshHandlers();
    const result = h.handleStartWorkoutIntent({ routine: null }, { nextUp: null, now: NOW });
    assert(!result.ok, 'expected a graceful failure');
    eq(result.message, h.INTENT_MESSAGES.nothingScheduled);
  });

  // ── StartRestIntent ────────────────────────────────────────────────────────

  await test('StartRestIntent: no seconds specified -> uses defaultSeconds', () => {
    const h = freshHandlers();
    const result = h.handleStartRestIntent(
      { seconds: null },
      { defaultSeconds: 120, minSeconds: 15, maxSeconds: 600, now: NOW },
    );
    assert(result.ok, 'expected ok result');
    eq(result.plan.seconds, 120);
  });

  await test('StartRestIntent: spoken duration ("90 seconds") is used verbatim within bounds', () => {
    const h = freshHandlers();
    const result = h.handleStartRestIntent(
      { seconds: 90 },
      { defaultSeconds: 120, minSeconds: 15, maxSeconds: 600, now: NOW },
    );
    assert(result.ok, 'expected ok result');
    eq(result.plan.seconds, 90);
  });

  await test('StartRestIntent: clamps a too-large spoken duration to maxSeconds', () => {
    const h = freshHandlers();
    const result = h.handleStartRestIntent(
      { seconds: 9999 },
      { defaultSeconds: 120, minSeconds: 15, maxSeconds: 600, now: NOW },
    );
    assert(result.ok, 'expected ok result');
    eq(result.plan.seconds, 600);
  });

  await test('StartRestIntent: clamps a too-small spoken duration to minSeconds', () => {
    const h = freshHandlers();
    const result = h.handleStartRestIntent(
      { seconds: 1 },
      { defaultSeconds: 120, minSeconds: 15, maxSeconds: 600, now: NOW },
    );
    assert(result.ok, 'expected ok result');
    eq(result.plan.seconds, 15);
  });

  await test('StartRestIntent: bad (non-numeric) duration -> graceful failure', () => {
    const h = freshHandlers();
    const result = h.handleStartRestIntent(
      { seconds: 'a while' },
      { defaultSeconds: 120, minSeconds: 15, maxSeconds: 600, now: NOW },
    );
    assert(!result.ok, 'expected a graceful failure');
    eq(result.message, h.INTENT_MESSAGES.badRestSeconds);
  });

  await test('StartRestIntent: zero/negative duration -> graceful failure', () => {
    const h = freshHandlers();
    const result = h.handleStartRestIntent(
      { seconds: 0 },
      { defaultSeconds: 120, minSeconds: 15, maxSeconds: 600, now: NOW },
    );
    assert(!result.ok, 'expected a graceful failure for seconds=0');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main();
