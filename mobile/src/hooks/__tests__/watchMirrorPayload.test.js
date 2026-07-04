/**
 * watchMirrorPayload.test.js -- TICKET-140 Stage A payload-builder tests.
 *
 * Same dependency-free transpile-and-eval harness as
 * src/lib/trainingEngine/v2/__tests__/fatigue.test.js.
 * Run: node mobile/src/hooks/__tests__/watchMirrorPayload.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function load(relPath, cache) {
  cache = cache || {};
  const norm = path.normalize(relPath);
  if (cache[norm]) return cache[norm];
  const abs = path.join(REPO, norm);
  let file = abs;
  if (!fs.existsSync(file)) file = abs + '.ts';
  if (!fs.existsSync(file)) file = abs + '.tsx';
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  cache[norm] = mod.exports;
  const dir = path.dirname(file);
  const localRequire = (spec) => {
    if (spec.startsWith('.')) {
      const rel = path.relative(REPO, path.resolve(dir, spec));
      return load(rel, cache);
    }
    return require(spec);
  };
  new Function('require', 'module', 'exports', js)(localRequire, mod, mod.exports);
  return mod.exports;
}

const WM = load('mobile/src/hooks/watchMirrorPayload.ts');

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ', name); }
  else { failed++; console.log('  FAIL ', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// Fixed "now" -- determinism (no clock reads in the pure builder).
const NOW = new Date('2026-07-04T12:00:00.000Z');

// ---------------------------------------------------------------------------
// Case 1: normal training day -- mixed done/not-done, weight label present.
// ---------------------------------------------------------------------------
{
  const input = {
    unitPref: 'kg',
    today: {
      workoutName: 'Push A',
      exercises: [
        { name: 'Bench Press', targetSets: 4, targetReps: '8-12', targetWeightKg: 60, loggedSetCount: 4 },
        { name: 'Overhead Press', targetSets: 3, targetReps: '10', targetWeightKg: 30, loggedSetCount: 1 },
      ],
    },
  };
  const out = WM.buildWatchMirrorPayload(input, NOW);
  check('v1 envelope version', out.v === 1);
  check('generatedAt is the injected now (no clock read)', out.generatedAt === NOW.toISOString(), out.generatedAt);
  check('today is present', out.today !== null);
  check('workoutName passthrough', out.today.workoutName === 'Push A');
  check('exercise count', out.today.exercises.length === 2);
  check('bench: done true at target', out.today.exercises[0].done === true);
  check('bench: sets = target', out.today.exercises[0].sets === 4);
  check('bench: repsLabel passthrough', out.today.exercises[0].repsLabel === '8-12');
  check('bench: weightLabel via formatWeight (kg)', out.today.exercises[0].weightLabel === '60.0 kg', out.today.exercises[0].weightLabel);
  check('ohp: done false below target', out.today.exercises[1].done === false);
  check('ohp: weightLabel (kg)', out.today.exercises[1].weightLabel === '30.0 kg', out.today.exercises[1].weightLabel);
}

// ---------------------------------------------------------------------------
// Case 2: rest day (null today) -- caller resolves this before the pure fn.
// ---------------------------------------------------------------------------
{
  const input = { unitPref: 'kg', today: null };
  const out = WM.buildWatchMirrorPayload(input, NOW);
  check('rest day: today is null', out.today === null);
  check('rest day: still versioned + timestamped', out.v === 1 && out.generatedAt === NOW.toISOString());
}

// ---------------------------------------------------------------------------
// Case 3: done-flag mapping edge cases -- zero target, over-target, exact.
// ---------------------------------------------------------------------------
{
  const input = {
    unitPref: 'kg',
    today: {
      workoutName: 'Legs',
      exercises: [
        { name: 'Zero-target ghost row', targetSets: 0, targetReps: '10', targetWeightKg: null, loggedSetCount: 0 },
        { name: 'Over-logged', targetSets: 3, targetReps: '10', targetWeightKg: 100, loggedSetCount: 5 },
        { name: 'Exact match', targetSets: 3, targetReps: '10', targetWeightKg: 100, loggedSetCount: 3 },
        { name: 'Not started', targetSets: 3, targetReps: '10', targetWeightKg: 100, loggedSetCount: 0 },
      ],
    },
  };
  const out = WM.buildWatchMirrorPayload(input, NOW);
  check('zero-target: done false (never a false positive)', out.today.exercises[0].done === false);
  check('zero-target: no weight label when targetWeightKg is null', out.today.exercises[0].weightLabel === null);
  check('over-logged: done true', out.today.exercises[1].done === true);
  check('exact match: done true', out.today.exercises[2].done === true);
  check('not started: done false', out.today.exercises[3].done === false);
}

// ---------------------------------------------------------------------------
// Case 4: weight label conversion via formatWeight -- lbs unit pref.
// ---------------------------------------------------------------------------
{
  const input = {
    unitPref: 'lbs',
    today: {
      workoutName: 'Pull A',
      exercises: [
        // 100kg -> 220.462 lbs, formatWeight rounds to nearest quarter lb.
        { name: 'Deadlift', targetSets: 1, targetReps: '5', targetWeightKg: 100, loggedSetCount: 0 },
      ],
    },
  };
  const out = WM.buildWatchMirrorPayload(input, NOW);
  check('lbs conversion happens on the phone (formatWeight)', out.today.exercises[0].weightLabel === '220.5 lbs', out.today.exercises[0].weightLabel);
}

// ---------------------------------------------------------------------------
// Case 5: missing/blank target_reps falls back to a placeholder, never blank.
// ---------------------------------------------------------------------------
{
  const input = {
    unitPref: 'kg',
    today: {
      workoutName: 'Full Body',
      exercises: [
        { name: 'Plank', targetSets: 3, targetReps: null, targetWeightKg: null, loggedSetCount: 0 },
        { name: 'Farmer Carry', targetSets: 3, targetReps: '   ', targetWeightKg: null, loggedSetCount: 0 },
      ],
    },
  };
  const out = WM.buildWatchMirrorPayload(input, NOW);
  check('null target_reps -> placeholder', out.today.exercises[0].repsLabel === '-');
  check('blank target_reps -> placeholder', out.today.exercises[1].repsLabel === '-');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
