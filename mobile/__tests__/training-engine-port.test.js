/**
 * training-engine-port.test.js
 * Tests for the mobile TypeScript port of the Training Engine.
 * Run: node __tests__/training-engine-port.test.js (from mobile/)
 *
 * Harness: transpile TS via the 'typescript' package (same as strength-model-v3.test.js),
 * plain assertions — no jest required.
 * NODE_PATH set to mobile/node_modules so typescript resolves.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const ts   = require('typescript');

// ---------------------------------------------------------------------------
// TS loader — transpiles a file + its relative imports recursively
// ---------------------------------------------------------------------------
const moduleCache = new Map();

function loadTs(relPath) {
  const absPath = path.resolve(__dirname, '..', relPath);
  if (moduleCache.has(absPath)) return moduleCache.get(absPath);

  const src = fs.readFileSync(absPath, 'utf8');
  const js  = ts.transpileModule(src, {
    compilerOptions: {
      module:         ts.ModuleKind.CommonJS,
      target:         ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: false,
    },
  }).outputText;

  const mod = { exports: {} };
  moduleCache.set(absPath, mod.exports); // pre-register to handle circular refs

  const dir  = path.dirname(absPath);
  const req  = (id) => {
    if (id.startsWith('.')) {
      // Resolve relative import — try .ts, /index.ts
      let resolved = path.resolve(dir, id);
      if (fs.existsSync(resolved + '.ts')) return loadTs(path.relative(path.resolve(__dirname,'..'), resolved + '.ts'));
      if (fs.existsSync(path.join(resolved, 'index.ts'))) return loadTs(path.relative(path.resolve(__dirname,'..'), path.join(resolved, 'index.ts')));
      if (fs.existsSync(resolved + '.js')) return require(resolved + '.js');
      return require(resolved);
    }
    return require(id);
  };

  new Function('module', 'exports', 'require', '__dirname', '__filename', js)(
    mod, mod.exports, req, dir, absPath
  );

  moduleCache.set(absPath, mod.exports);
  return mod.exports;
}

// ---------------------------------------------------------------------------
// Load the engine and sub-modules
// ---------------------------------------------------------------------------
const Engine       = loadTs('src/lib/trainingEngine/index.ts');
const ScaleDown    = loadTs('src/lib/trainingEngine/scaleDown.ts');
const Loading      = loadTs('src/lib/trainingEngine/loading.ts');
const ExFill       = loadTs('src/lib/trainingEngine/exerciseFill.ts');
const Templates    = loadTs('src/lib/trainingEngine/templates.ts');

const { generatePlan }                     = Engine;
const { scaleDown }                        = ScaleDown;
const { epley1RM, roundTo2_5, warmupLadder } = Loading;
const { buildSeed, seededShuffle }         = ExFill;
const { getTemplate }                      = Templates;

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------
let pass = 0, fail = 0;
function ok(condition, msg) {
  if (condition) { console.log('  ✓', msg); pass++; }
  else           { console.error('  ✗', msg); fail++; }
}
function near(a, b, tol, msg) {
  ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected ${b} ±${tol})`);
}

// ---------------------------------------------------------------------------
// Shared fixture data (mirrors server test)
// ---------------------------------------------------------------------------
const EXERCISES = [
  { id:'e-squat-bb',  name:'Barbell Back Squat',  muscle_groups:['quads','glutes'],          is_compound:true,  movement_pattern:'squat',            equipment:['barbell','rack'],          contraindications:[] },
  { id:'e-hinge-dl',  name:'Barbell Deadlift',     muscle_groups:['hamstrings','glutes'],      is_compound:true,  movement_pattern:'hinge',            equipment:['barbell'],                contraindications:[] },
  { id:'e-hpush-bp',  name:'Barbell Bench Press',  muscle_groups:['chest','triceps'],         is_compound:true,  movement_pattern:'horizontal_push',  equipment:['barbell','bench','rack'],  contraindications:[] },
  { id:'e-vpush-ohp', name:'Overhead Press',       muscle_groups:['shoulders','triceps'],     is_compound:true,  movement_pattern:'vertical_push',    equipment:['barbell'],                contraindications:[] },
  { id:'e-vpull-pu',  name:'Pull-Up',              muscle_groups:['lats','biceps'],           is_compound:true,  movement_pattern:'vertical_pull',    equipment:['pullup_bar','bodyweight'], contraindications:[] },
  { id:'e-hpull-row', name:'Barbell Row',          muscle_groups:['upper_back','lats'],       is_compound:true,  movement_pattern:'horizontal_pull',  equipment:['barbell'],                contraindications:[] },
  { id:'e-lunge-sl',  name:'Dumbbell Lunges',      muscle_groups:['quads','glutes'],          is_compound:true,  movement_pattern:'lunge',            equipment:['dumbbell'],               contraindications:[] },
  { id:'e-core-pl',   name:'Plank',                muscle_groups:['core'],                    is_compound:false, movement_pattern:'core',             equipment:['bodyweight'],             contraindications:[] },
  { id:'e-carry-fc',  name:"Farmer's Carry",       muscle_groups:['forearms','core'],         is_compound:true,  movement_pattern:'carry',            equipment:['dumbbell'],               contraindications:[] },
  { id:'e-iso-curl',  name:'Dumbbell Bicep Curl',  muscle_groups:['biceps'],                  is_compound:false, movement_pattern:'isolation_arms',   equipment:['dumbbell'],               contraindications:[] },
  { id:'e-iso-cal',   name:'Calf Raise',           muscle_groups:['calves'],                  is_compound:false, movement_pattern:'isolation_calves', equipment:['machine','bodyweight'],   contraindications:[] },
  { id:'e-iso-leg',   name:'Leg Extension',        muscle_groups:['quads'],                   is_compound:false, movement_pattern:'isolation_legs',   equipment:['machine'],                contraindications:[] },
  { id:'e-iso-sho',   name:'Lateral Raise',        muscle_groups:['shoulders'],               is_compound:false, movement_pattern:'isolation_shoulders', equipment:['dumbbell'],           contraindications:[] },
  { id:'e-iso-ch',    name:'Dumbbell Fly',         muscle_groups:['chest'],                   is_compound:false, movement_pattern:'isolation_chest',  equipment:['dumbbell'],               contraindications:[] },
  { id:'e-iso-bk',    name:'Cable Row',            muscle_groups:['mid_back'],                is_compound:false, movement_pattern:'isolation_back',   equipment:['cable'],                  contraindications:[] },
  { id:'e-oly-cl',    name:'Power Clean',          muscle_groups:['quads','traps','shoulders'],is_compound:true, movement_pattern:'olympic',          equipment:['barbell'],                contraindications:[] },
  { id:'e-plyo-bj',   name:'Box Jump',             muscle_groups:['quads','glutes'],          is_compound:true,  movement_pattern:'plyometric',       equipment:['bodyweight'],             contraindications:[] },
  { id:'e-squat-bw',  name:'Bodyweight Squat',     muscle_groups:['quads','glutes'],          is_compound:true,  movement_pattern:'squat',            equipment:['bodyweight'],             contraindications:[] },
  { id:'e-hinge-bw',  name:'Hip Hinge Drill',      muscle_groups:['hamstrings'],              is_compound:false, movement_pattern:'hinge',            equipment:['bodyweight'],             contraindications:[] },
  { id:'e-hpush-pu',  name:'Push-Up',              muscle_groups:['chest','triceps'],         is_compound:true,  movement_pattern:'horizontal_push',  equipment:['bodyweight'],             contraindications:[] },
  { id:'e-vpush-pp',  name:'Pike Push-Up',         muscle_groups:['shoulders'],               is_compound:true,  movement_pattern:'vertical_push',    equipment:['bodyweight'],             contraindications:[] },
];
const FULL_EQUIP = ['barbell','dumbbell','machine','cable','bodyweight','bench','rack','pullup_bar'];
const BW_ONLY    = ['bodyweight'];

function makePlan(profileOverrides = {}, opts = {}) {
  return generatePlan({
    profile: {
      experience_level:   'beginner',
      primary_discipline: 'general_strength',
      training_goal:      'general_fitness',
      sessions_per_week:  3,
      session_minutes:    60,
      equipment_profile:  FULL_EQUIP,
      ...profileOverrides,
    },
    exercises:   opts.exercises   ?? EXERCISES,
    history:     opts.history     ?? [],
    pbs:         opts.pbs         ?? [],
    metrics:     opts.metrics     ?? [],
    constraints: opts.constraints ?? [],
    userId:      opts.userId      ?? 'user-123',
    today:       opts.today       ?? new Date('2026-06-09'),
  });
}

// ---------------------------------------------------------------------------
// Test cases (≥6 from server test suite)
// ---------------------------------------------------------------------------

console.log('\n── Training Engine Port Tests ──\n');

// 1. Schema validity
{
  const r = makePlan();
  ok(Array.isArray(r.weeks), '1a. weeks is array');
  ok(typeof r.reasoning === 'string' && r.reasoning.length > 10, '1b. reasoning string');
  ok(Array.isArray(r.rule_trace), '1c. rule_trace array');
  ok(r.engine === 'pf-engine-v1', '1d. engine tag');
}

// 2. All 7 disciplines generate
{
  const discs = ['general_strength','powerlifting','weightlifting','running','cycling','swimming','other_mixed'];
  for (const d of discs) {
    const r = makePlan({ primary_discipline: d });
    ok(r.weeks.length === 3, `2. discipline "${d}" → 3 weeks`);
  }
}

// 3. Constraint exclusion — squat contraindicated
{
  const constrained = EXERCISES.map(ex =>
    ex.movement_pattern === 'squat'
      ? { ...ex, contraindications: ['knee_injury'] }
      : ex
  );
  const r = makePlan({}, {
    exercises:   constrained,
    constraints: [{ constraint_type: 'knee_injury' }],
  });
  const allSlots = r.weeks.flatMap(w => w.sessions.flatMap(s => s.slots || []));
  const squatSlots = allSlots.filter(s => s.pattern === 'squat' && s.exercise_id);
  let noBlocked = true;
  for (const slot of squatSlots) {
    const ex = constrained.find(e => e.id === slot.exercise_id);
    if (ex && ex.contraindications.includes('knee_injury')) { noBlocked = false; }
  }
  ok(noBlocked, '3. constraint exclusion: no knee_injury squat exercise selected');
}

// 4. Determinism — same userId+today → same plan
{
  const opts = { exercises: EXERCISES, userId: 'user-det', today: new Date('2026-06-09') };
  const p1 = makePlan({}, opts);
  const p2 = makePlan({}, opts);
  const ids1 = p1.weeks.flatMap(w => w.sessions.flatMap(s => (s.slots||[]).map(sl=>sl.exercise_id)));
  const ids2 = p2.weeks.flatMap(w => w.sessions.flatMap(s => (s.slots||[]).map(sl=>sl.exercise_id)));
  ok(JSON.stringify(ids1) === JSON.stringify(ids2), '4. determinism: same seed → same exercise selection');
}

// 5. 15-min session = single quality slot
{
  const r = makePlan({ session_minutes: 15, sessions_per_week: 3 });
  const week1 = r.weeks[0];
  let allSingle = true;
  for (const s of week1.sessions) {
    if (!s.isRecovery && (s.slots||[]).length > 1) allSingle = false;
    for (const slot of s.slots||[]) {
      if (slot.priority !== 1 || slot.sets > 2) allSingle = false;
    }
  }
  ok(allSingle, '5. 15-min: max 1 priority-1 slot, ≤2 sets per session');
}

// 6. Bodyweight-only equipment filter
{
  const r = makePlan({ equipment_profile: BW_ONLY }, { exercises: EXERCISES });
  const filledSlots = r.weeks[0].sessions.flatMap(s => s.slots||[]).filter(s => s.exercise_id);
  let allBW = true;
  for (const slot of filledSlots) {
    const ex = EXERCISES.find(e => e.id === slot.exercise_id);
    if (ex && !(ex.equipment||[]).includes('bodyweight')) allBW = false;
  }
  ok(allBW, '6. bodyweight-only: all filled slots use bodyweight exercises');
}

// 7. Epley e1RM formula
near(epley1RM(100, 5), 100*(1+5/30), 0.01, '7a. Epley e1RM(100,5)');
near(epley1RM(100, 15), epley1RM(100, 12), 0.0001, '7b. Epley reps capped at 12');

// 8. roundTo2_5
ok(roundTo2_5(101.3) === 102.5, '8a. roundTo2_5(101.3)=102.5');
ok(roundTo2_5(103.7) === 102.5, '8b. roundTo2_5(103.7)=102.5');
ok(roundTo2_5(106.3) === 107.5, '8c. roundTo2_5(106.3)=107.5');

// 9. Loading produces weight_kg from PB
{
  const r = makePlan({ sessions_per_week: 3 }, {
    pbs: [{ exercise_name: 'Barbell Back Squat', weight_kg: 100, reps: 5 }],
    exercises: EXERCISES,
  });
  const allSlots = r.weeks.flatMap(w => w.sessions.flatMap(s => s.slots||[]));
  const squatWithW = allSlots.filter(s => s.name === 'Barbell Back Squat' && s.weight_kg != null);
  ok(squatWithW.length > 0, '9. loading: PB produces non-null weight_kg');
  if (squatWithW.length > 0) {
    ok(squatWithW[0].weight_kg % 2.5 < 0.001, '9b. weight_kg is multiple of 2.5');
  }
}

// 10. Warm-up ladder rungs
{
  const ladder = warmupLadder(100);
  ok(ladder.length === 3, '10a. warmupLadder(100): 3 rungs (40kg skipped)');
  ok(ladder[0].weight_kg === 55, '10b. first rung = 55kg (55% of 100)');
  ok(ladder[2].weight_kg === 85, '10c. last rung = 85kg');
}

// 11. scaleDown: user > idealDays adds recovery sessions
{
  const tpl = getTemplate('general_strength', 'beginner', 'general_fitness');
  const trace = [];
  const scaled = scaleDown(tpl, 7, 60, trace);
  const recovery = scaled.sessions.filter(s => s.isRecovery);
  ok(recovery.length === 7 - (tpl.idealDays || 3), '11. scaleDown: adds correct recovery sessions');
}

// 12. Running plan includes cardio
{
  const r = makePlan({ primary_discipline: 'running', sessions_per_week: 3 });
  const allCardio = r.weeks.flatMap(w => w.sessions.flatMap(s => s.cardio||[]));
  ok(allCardio.length > 0, '12. running plan has cardio slots');
  ok(allCardio.every(c => typeof c.zone === 'string' && c.minutes > 0), '12b. cardio slots have zone and minutes');
}

// 13. rule_trace non-empty, discipline + tier in trace
{
  const r = makePlan({ primary_discipline: 'powerlifting', experience_level: 'intermediate' });
  const traceStr = r.rule_trace.join(' ');
  ok(r.rule_trace.length > 3, '13a. rule_trace has >3 entries');
  ok(/powerlifting/i.test(traceStr), '13b. rule_trace mentions powerlifting');
  ok(/intermediate/i.test(traceStr), '13c. rule_trace mentions intermediate');
}

// 14. seededShuffle different seeds → different orders
{
  const s1 = seededShuffle(['a','b','c','d','e','f'], buildSeed('user-A', '2026-W24'));
  const s2 = seededShuffle(['a','b','c','d','e','f'], buildSeed('user-B', '2026-W24'));
  ok(s1.join('') !== s2.join(''), '14. different seeds → different shuffles');
}

// ---------------------------------------------------------------------------
console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
