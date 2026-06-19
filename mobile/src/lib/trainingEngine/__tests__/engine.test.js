/**
 * engine.test.js — Training Engine (mobile) survey-wiring + reasoning tests.
 *
 * Uses the same dependency-free transpile-and-eval harness as
 * mobile/src/db/__tests__/migrations.test.js (no jest / no expo). Run:
 *   node mobile/src/lib/trainingEngine/__tests__/engine.test.js
 *
 * Focus (the 2026-06-19 "plan based on nothing" fix + P0/P1/P2 work):
 *   1. A 6-day survey produces a real ~6-session plan, NOT the 3-day default.
 *   2. An empty profile falls back to the 3-session default (contrast).
 *   3. The user-facing rule_trace is plain-language: no engine jargon, no
 *      "AI"/Claude/Haiku, cites the user's real day count.
 *   4. Determinism: same ctx → byte-identical weeks.
 *   5. Survey injuries exclude contraindicated movements; muscle priorities and
 *      explicit training-days flow through (weekday labels, priority bias).
 *   6. Loading cites a concrete kg weight once history exists.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/lib/trainingEngine/__tests__  →  up 5 = <repo>
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

// ---------------------------------------------------------------------------
// TS loader — transpiles a .ts file and evals it, resolving relative imports.
// ---------------------------------------------------------------------------
function load(relPath, deps, cache) {
  cache = cache || {};
  if (cache[relPath]) return cache[relPath];
  deps = deps || {};
  const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  cache[relPath] = mod.exports;
  const dir = path.dirname(path.join(REPO, relPath));
  const requireStub = function (id) {
    if (deps[id]) return deps[id];
    if (id.charAt(0) === '.') {
      const base = path.resolve(dir, id);
      const cands = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')];
      for (const c of cands) {
        if (fs.existsSync(c)) {
          const rp = path.relative(REPO, c).split(path.sep).join('/');
          return load(rp, deps, cache);
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

// localContext.ts imports localDb (not used by generatePlan); stub it so the
// engine index module loads in node.
const engine = load('mobile/src/lib/trainingEngine/index.ts', {
  '../../db/localDb': { localDb: {} },
});
const { generatePlan, ENGINE_EXERCISE_CATALOG } = engine;

// ---------------------------------------------------------------------------
// Minimal harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' — ' + err.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}

const FULL_GYM = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bench', 'rack', 'pullup_bar'];
const TODAY = new Date('2026-06-19');

function baseCtx(overrides) {
  return Object.assign({
    profile: {},
    exercises: ENGINE_EXERCISE_CATALOG,
    history: [], pbs: [], metrics: [], constraints: [],
    userId: 'u1', today: TODAY,
  }, overrides || {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
console.log('\nTraining Engine — engine.test.js\n');

test('6 days/week survey produces a real ~6-session plan (not the 3-day default)', () => {
  const r = generatePlan(baseCtx({
    profile: {
      experience_level: 'intermediate', training_goal: 'hypertrophy',
      sessions_per_week: 6, session_minutes: 90,
      equipment_profile: FULL_GYM, primary_discipline: 'general_strength',
    },
  }));
  const sessions = r.weeks[0].sessions.length;
  assert(sessions >= 5, 'expected >=5 sessions for a 6-day request, got ' + sessions);
  eq(r.weeks.length, 3, '3 weeks expected:');
});

test('empty profile falls back to the 3-session default', () => {
  const r = generatePlan(baseCtx());
  eq(r.weeks[0].sessions.length, 3, 'default session count:');
});

test('rule_trace is plain-language: no engine jargon, no AI/Claude/Haiku, cites day count', () => {
  const r = generatePlan(baseCtx({
    profile: {
      experience_level: 'intermediate', training_goal: 'hypertrophy',
      sessions_per_week: 6, session_minutes: 90,
      equipment_profile: FULL_GYM, primary_discipline: 'general_strength',
    },
  }));
  const rt = r.rule_trace.join('\n');
  assert(r.rule_trace.length >= 3, 'rule_trace too short: ' + r.rule_trace.length);
  assert(!/Engine spec|tier=|sessions_per_week=|idealDays|progression\.model|"general_strength"/.test(rt),
    'rule_trace leaks engine jargon: ' + rt);
  assert(!/\bAI\b|Claude|Haiku/i.test(rt), 'rule_trace contains a banned AI string');
  assert(/6-day|6 day/i.test(rt), 'rule_trace should cite the 6-day frequency');
});

test('determinism: same ctx → identical weeks', () => {
  const mk = () => generatePlan(baseCtx({
    profile: {
      experience_level: 'beginner', training_goal: 'general_fitness',
      sessions_per_week: 4, session_minutes: 60,
      equipment_profile: FULL_GYM, primary_discipline: 'general_strength',
    },
  }));
  eq(JSON.stringify(mk().weeks), JSON.stringify(mk().weeks), 'plans differ across runs:');
});

test('survey injuries (knees) exclude knee-contraindicated movements', () => {
  const r = generatePlan(baseCtx({
    profile: {
      experience_level: 'beginner', training_goal: 'general_fitness',
      sessions_per_week: 3, session_minutes: 60,
      equipment_profile: FULL_GYM, primary_discipline: 'general_strength',
    },
    constraints: [{ constraint_type: 'knees' }],
  }));
  const names = r.weeks[0].sessions.reduce(
    (acc, s) => acc.concat((s.slots || []).map((sl) => sl.name)), []);
  const kneeBad = ['Back Squat', 'Leg Press', 'Goblet Squat', 'Walking Lunge',
    'Bulgarian Split Squat', 'Reverse Lunge', 'Leg Extension', 'Box Jump',
    'Broad Jump', 'Nordic Curl', 'Bodyweight Squat'];
  const leaked = names.filter((n) => kneeBad.indexOf(n) >= 0);
  eq(leaked.length, 0, 'knee-contraindicated lifts leaked: ' + leaked.join(','));
  assert(/knee/i.test(r.rule_trace.join('\n')), 'rule_trace should mention the knee exclusion');
});

test('explicit training days map onto weekday labels (Mon/Wed/Fri)', () => {
  const r = generatePlan(baseCtx({
    profile: {
      experience_level: 'beginner', training_goal: 'general_fitness',
      sessions_per_week: 3, session_minutes: 60,
      equipment_profile: FULL_GYM, primary_discipline: 'general_strength',
    },
    trainingDays: [1, 3, 5],
  }));
  const labels = r.weeks[0].sessions.map((s) => s.day_label).join(' ');
  assert(/Mon/.test(labels) && /Wed/.test(labels) && /Fri/.test(labels),
    'expected Mon/Wed/Fri labels, got: ' + labels);
});

test('muscle priorities bias selection and are explained', () => {
  const r = generatePlan(baseCtx({
    profile: {
      experience_level: 'beginner', training_goal: 'general_fitness',
      sessions_per_week: 3, session_minutes: 60,
      equipment_profile: FULL_GYM, primary_discipline: 'general_strength',
    },
    musclePriorities: ['chest', 'back'],
  }));
  assert(/chest|back/i.test(r.rule_trace.join('\n')), 'rule_trace should mention priorities');
});

test('loading cites a concrete kg weight once history exists', () => {
  const r = generatePlan(baseCtx({
    profile: {
      experience_level: 'intermediate', training_goal: 'strength',
      sessions_per_week: 4, session_minutes: 90,
      equipment_profile: FULL_GYM, primary_discipline: 'general_strength',
    },
    history: [{ exercise_name: 'Bench Press', weight_kg: 100, reps: 5, e1rm_kg: 100 * (1 + 5 / 30) }],
    pbs: [{ exercise_name: 'Bench Press', weight_kg: 100, reps: 5 }],
  }));
  assert(/\d+(\.\d+)?kg/.test(r.rule_trace.join('\n')), 'rule_trace should cite a kg weight when history exists');
});

// ---------------------------------------------------------------------------
console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
