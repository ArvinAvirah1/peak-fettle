/**
 * engineV2.test.js — Engine v2 (parametric training generator) tests.
 *
 * Uses the SAME dependency-free transpile-and-eval harness as the v1
 * engine.test.js / migrations.test.js (no jest / no expo). Run:
 *   node mobile/src/lib/trainingEngine/v2/__tests__/engineV2.test.js
 *
 * Coverage (per the port brief):
 *   1. Determinism — identical inputs (+ same options.now) → byte-identical output.
 *   2. Experience-based RIR — novice ≥3–4 RIR vs advanced 1–2 on primary compounds.
 *   3. Split preference respected in day structure (ppl / upper_lower / body_part).
 *   4. Trial sequence = 3 blocks × 3 weeks with the fixed split order.
 *   5. Days/week + session-minutes respected (exercise count scales).
 *   6. Powerlifting meet-date peaking present (phases + attempts).
 *   7. Squat-pattern cap enforced (≤2/wk novices, ≤3 otherwise).
 *   8. Role-tag distribution (≤40% of weekly lifts tagged primary).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/lib/trainingEngine/v2/__tests__  → up 6 = <repo>
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

// ---------------------------------------------------------------------------
// TS loader — transpiles a .ts file and evals it, resolving relative imports.
// ---------------------------------------------------------------------------
function load(relPath, cache) {
  cache = cache || {};
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
      for (const c of cands) {
        if (fs.existsSync(c)) {
          const rp = path.relative(REPO, c).split(path.sep).join('/');
          return load(rp, cache);
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

const engine = load('mobile/src/lib/trainingEngine/v2/index.ts');
const { generatePlanV2, generateTrialSequence, CATALOG_V2 } = engine;

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

const FULL_GYM = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bench', 'rack', 'pullup_bar', 'bands'];
const NOW = new Date('2026-07-02T00:00:00.000Z');

function baseInputs(overrides) {
  return Object.assign({
    userId: 'u1',
    experienceLevel: 'intermediate',
    goal: 'hypertrophy',
    splitPreference: 'ppl',
    daysPerWeek: 4,
    sessionMinutes: 60,
    equipment: FULL_GYM,
    knobs: {},
  }, overrides || {});
}

// Collect all slots across every week.
function allSlots(plan) {
  const out = [];
  for (const w of plan.weeks) for (const s of w.sessions) for (const sl of s.slots) out.push({ w, s, sl });
  return out;
}

// ---------------------------------------------------------------------------
console.log('\nEngine v2 — engineV2.test.js\n');

test('catalog is a non-empty typed set with deterministic ids', () => {
  assert(Array.isArray(CATALOG_V2) && CATALOG_V2.length >= 40, 'catalog too small: ' + (CATALOG_V2 || []).length);
  const backSquat = CATALOG_V2.find((e) => e.name === 'Back Squat');
  assert(backSquat && /^ex_[0-9a-f]{8}$/.test(backSquat.id), 'Back Squat id malformed');
  assert(backSquat.movement_pattern === 'squat' && backSquat.is_compound === true, 'Back Squat tags wrong');
});

test('determinism: identical inputs + same options.now → byte-identical output', () => {
  const mk = () => generatePlanV2(baseInputs({ experienceLevel: 'beginner', goal: 'general_fitness', splitPreference: 'upper_lower' }), { now: NOW });
  eq(JSON.stringify(mk().weeks), JSON.stringify(mk().weeks), 'plans differ across runs:');
});

test('determinism holds with the default (no options.now) — no live clock read', () => {
  const mk = () => generatePlanV2(baseInputs({ userId: 'det2' }));
  eq(JSON.stringify(mk().weeks), JSON.stringify(mk().weeks), 'default-clock plans differ:');
});

test('experience-based RIR: novice primary compound RIR is 3–4; advanced reaches 1–2', () => {
  const nov = generatePlanV2(baseInputs({ userId: 'nov', experienceLevel: 'novice', goal: 'hypertrophy', lifts: { bench: 80 } }), { now: NOW });
  const adv = generatePlanV2(baseInputs({ userId: 'adv', experienceLevel: 'advanced', goal: 'strength_powerlifting', sessionMinutes: 75, lifts: { squat: 200, bench: 140, deadlift: 250 } }), { now: NOW });

  const novPrim = allSlots(nov).filter((x) => x.sl.role === 'primary' && x.sl.is_compound && !x.w.isDeload).map((x) => x.sl.rir_target);
  const advPrim = allSlots(adv).filter((x) => x.sl.role === 'primary' && x.sl.is_compound && !x.w.isDeload && !/Peak/.test(x.w.phase)).map((x) => x.sl.rir_target);

  assert(novPrim.length > 0 && advPrim.length > 0, 'no primary compound slots found');
  const novMin = Math.min(...novPrim), novMax = Math.max(...novPrim);
  const advMin = Math.min(...advPrim);
  assert(novMin >= 3 && novMax <= 4, 'novice primary RIR out of [3,4]: ' + novMin + '-' + novMax);
  assert(advMin <= 2, 'advanced primary RIR never reached ≤2: min ' + advMin);
  assert(novMin > advMin, 'novice should train further from failure than advanced (novMin ' + novMin + ' vs advMin ' + advMin + ')');
});

test('novice compound RIR floor is never breached even on aggressive failure-proximity', () => {
  const p = generatePlanV2(baseInputs({ userId: 'clamp', experienceLevel: 'novice', goal: 'hypertrophy', daysPerWeek: 3, knobs: { failureProximity: 'aggressive' }, lifts: { bench: 80 } }), { now: NOW });
  const bad = allSlots(p).filter((x) => x.sl.is_compound && x.sl.rir_target < 2);
  eq(bad.length, 0, 'novice compound dropped below RIR 2 (' + bad.length + ' slots):');
});

test('split preference respected in day structure — upper_lower', () => {
  const p = generatePlanV2(baseInputs({ userId: 'ul', splitPreference: 'upper_lower', daysPerWeek: 4 }), { now: NOW });
  const labels = p.weeks[0].sessions.map((s) => s.day_label).join(' | ');
  assert(/Upper/.test(labels) && /Lower/.test(labels), 'expected Upper/Lower labels: ' + labels);
  assert(!/Push|Pull|Legs|Chest Day/.test(labels), 'upper_lower plan leaked a PPL/body-part day: ' + labels);
  eq(p.splitPreference, 'upper_lower', 'splitPreference echoed:');
});

test('split preference respected in day structure — ppl and body_part', () => {
  const ppl = generatePlanV2(baseInputs({ userId: 'ppl', splitPreference: 'ppl', daysPerWeek: 3 }), { now: NOW });
  const pplLabels = ppl.weeks[0].sessions.map((s) => s.day_label).join(' | ');
  assert(/Push/.test(pplLabels) && /Pull/.test(pplLabels) && /Legs/.test(pplLabels), 'expected PPL days: ' + pplLabels);

  const bp = generatePlanV2(baseInputs({ userId: 'bp', splitPreference: 'body_part', daysPerWeek: 5 }), { now: NOW });
  const bpLabels = bp.weeks[0].sessions.map((s) => s.day_label).join(' | ');
  assert(/Chest Day/.test(bpLabels) && /Back Day/.test(bpLabels) && /Arms Day/.test(bpLabels), 'expected body-part days: ' + bpLabels);
});

test('trial sequence = 3 blocks × 3 weeks with the fixed split order (ppl → upper_lower → body_part)', () => {
  const seq = generateTrialSequence(baseInputs({ userId: 'trial', splitPreference: 'unsure', daysPerWeek: 4 }), { now: NOW });
  eq(seq.blocks.length, 3, 'block count:');
  eq(JSON.stringify(seq.blockOrder), JSON.stringify(['ppl', 'upper_lower', 'body_part']), 'block order:');
  for (const b of seq.blocks) eq(b.weeks.length, 3, 'weeks in block ' + b.splitPreference + ':');
  eq(seq.blocks[0].splitPreference, 'ppl', 'block0 split:');
  eq(seq.blocks[1].splitPreference, 'upper_lower', 'block1 split:');
  eq(seq.blocks[2].splitPreference, 'body_part', 'block2 split:');
  // each block's day structure matches its split
  const b0 = seq.blocks[0].weeks[0].sessions.map((s) => s.day_label).join(' ');
  assert(/Push/.test(b0) && /Legs/.test(b0), 'trial block0 not PPL: ' + b0);
});

test('trial sequence is deterministic', () => {
  const mk = () => generateTrialSequence(baseInputs({ userId: 'trialdet', splitPreference: 'unsure' }), { now: NOW });
  eq(JSON.stringify(mk().blocks), JSON.stringify(mk().blocks), 'trial sequence differs across runs:');
});

test('days/week respected — session count matches requested days (bounded splits)', () => {
  for (const d of [2, 3, 4, 5]) {
    const p = generatePlanV2(baseInputs({ userId: 'days' + d, splitPreference: 'ppl', daysPerWeek: d }), { now: NOW });
    eq(p.weeks[0].sessions.length, d, d + '-day session count:');
  }
});

test('session-minutes respected — exercise count scales with duration', () => {
  const short = generatePlanV2(baseInputs({ userId: 'sm', sessionMinutes: 30, daysPerWeek: 3, splitPreference: 'ppl' }), { now: NOW });
  const long = generatePlanV2(baseInputs({ userId: 'sm', sessionMinutes: 90, daysPerWeek: 3, splitPreference: 'ppl' }), { now: NOW });
  const shortMax = Math.max(...short.weeks[0].sessions.map((s) => s.slots.length));
  const longMax = Math.max(...long.weeks[0].sessions.map((s) => s.slots.length));
  assert(shortMax <= 5, '30-min session exceeded 5 exercises: ' + shortMax);
  assert(longMax > shortMax, '90-min session should have more exercises than 30-min (' + longMax + ' vs ' + shortMax + ')');
});

test('powerlifting meet-date peaking present — phases + attempts + week count', () => {
  const p = generatePlanV2(baseInputs({
    userId: 'pl', experienceLevel: 'advanced', goal: 'strength_powerlifting', sessionMinutes: 90, daysPerWeek: 4,
    equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'rack'],
    lifts: { squat: 220, bench: 150, deadlift: 260 },
    meet: { weeksToMeet: 10, target1RM: { squat: 230, bench: 157.5, deadlift: 270 } },
  }), { now: NOW });
  assert(p.peaking, 'peaking report missing');
  eq(p.weeks.length, 10, 'PL plan should span weeks-to-meet:');
  assert(p.peaking.phases.some(([n]) => /Peak/.test(n)), 'no Peak phase in peaking.phases');
  assert(p.weeks.some((w) => /Peak/.test(w.phase)), 'no week labelled Peak');
  const a = p.peaking.attempts.squat;
  assert(a && a.third === 230 && a.opener === 210 && a.second === 220, 'squat attempts wrong: ' + JSON.stringify(a));
  // a Peak-week main lift shows a heavy top single/double
  const peakMain = allSlots(p).find((x) => /Peak/.test(x.w.phase) && x.sl.main_lift_key && x.sl.role === 'primary');
  assert(peakMain && peakMain.sl.peak_note, 'peak-week main lift lacks a peak note');
});

test('squat-pattern cap enforced — ≤2/session for novices/beginners, ≤3 otherwise', () => {
  function maxSquatPatternPerSession(plan) {
    let mx = 0;
    for (const w of plan.weeks) for (const s of w.sessions) {
      const names = new Set(s.slots.filter((sl) => sl.pattern === 'squat').map((sl) => sl.name));
      mx = Math.max(mx, names.size);
    }
    return mx;
  }
  const beg = generatePlanV2(baseInputs({ userId: 'sqB', experienceLevel: 'beginner', goal: 'general_fitness', splitPreference: 'unsure', daysPerWeek: 3, sessionMinutes: 90 }), { now: NOW });
  assert(maxSquatPatternPerSession(beg) <= 2, 'beginner exceeded squat-pattern cap of 2: ' + maxSquatPatternPerSession(beg));

  const nov = generatePlanV2(baseInputs({ userId: 'sqN', experienceLevel: 'novice', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 6, sessionMinutes: 90 }), { now: NOW });
  assert(maxSquatPatternPerSession(nov) <= 2, 'novice exceeded squat-pattern cap of 2: ' + maxSquatPatternPerSession(nov));

  const int = generatePlanV2(baseInputs({ userId: 'sqI', experienceLevel: 'intermediate', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 6, sessionMinutes: 90 }), { now: NOW });
  assert(maxSquatPatternPerSession(int) <= 3, 'intermediate exceeded squat-pattern cap of 3: ' + maxSquatPatternPerSession(int));
});

test('role tagging distribution — ≤40% of a week\'s lifts tagged primary', () => {
  const profiles = [
    baseInputs({ userId: 'rd1', experienceLevel: 'novice', goal: 'general_fitness', splitPreference: 'unsure', daysPerWeek: 3, sessionMinutes: 60 }),
    baseInputs({ userId: 'rd2', experienceLevel: 'intermediate', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 5, sessionMinutes: 75 }),
    baseInputs({ userId: 'rd3', experienceLevel: 'beginner', goal: 'general_fitness', splitPreference: 'unsure', daysPerWeek: 3, sessionMinutes: 45 }),
  ];
  for (const prof of profiles) {
    const p = generatePlanV2(prof, { now: NOW });
    const w1 = p.weeks[0];
    let total = 0, prim = 0;
    for (const s of w1.sessions) for (const sl of s.slots) { total++; if (sl.role === 'primary') prim++; }
    const ratio = prim / total;
    assert(ratio <= 0.4, prof.userId + ' primary-tag ratio ' + ratio.toFixed(2) + ' exceeds 0.40 (' + prim + '/' + total + ')');
    // all three roles should actually appear (differentiation is visible)
    const roles = new Set();
    for (const s of w1.sessions) for (const sl of s.slots) roles.add(sl.role);
    assert(roles.has('primary') && roles.has('accessory'), prof.userId + ' missing role variety: ' + [...roles].join(','));
  }
});

test('role-based rep/RIR differentiation is visible — primary vs accessory rep ranges differ', () => {
  const p = generatePlanV2(baseInputs({ userId: 'diff', experienceLevel: 'intermediate', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 5, sessionMinutes: 75 }), { now: NOW });
  const primaries = allSlots(p).filter((x) => x.sl.role === 'primary').map((x) => x.sl.reps);
  const accessories = allSlots(p).filter((x) => x.sl.role === 'accessory').map((x) => x.sl.reps);
  assert(primaries.length && accessories.length, 'need both primary and accessory slots');
  // at least one accessory uses a higher rep range than a primary (hypertrophy: 5-8 vs 12-20)
  const primHiMin = Math.min(...primaries.map((r) => parseInt(String(r).split('-').pop(), 10)));
  const accHiMax = Math.max(...accessories.map((r) => parseInt(String(r).split('-').pop(), 10)));
  assert(accHiMax > primHiMin, 'accessory rep ceiling should exceed primary (' + accHiMax + ' vs ' + primHiMin + ')');
});

test('injury constraint (knees) excludes knee-contraindicated lifts + notes a swap', () => {
  const p = generatePlanV2(baseInputs({ userId: 'inj', experienceLevel: 'intermediate', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 4, sessionMinutes: 75, injuries: ['knees'] }), { now: NOW });
  const kneeBad = ['Back Squat', 'Bulgarian Split Squat', 'Walking Lunge', 'Leg Extension', 'Box Jump', 'Broad Jump', 'Nordic Curl'];
  const leaked = allSlots(p).map((x) => x.sl.name).filter((n) => kneeBad.indexOf(n) >= 0);
  eq(leaked.length, 0, 'knee-contraindicated lifts leaked: ' + [...new Set(leaked)].join(','));
});

test('output shape is a v1 superset — required slot fields present', () => {
  const p = generatePlanV2(baseInputs({ userId: 'shape', lifts: { bench: 100 } }), { now: NOW });
  const sl = p.weeks[0].sessions[0].slots[0];
  for (const f of ['exercise_id', 'name', 'is_compound', 'pattern', 'priority', 'sets', 'reps', 'rpe', 'rest_seconds', 'weight_kg', 'role', 'rir_target']) {
    assert(Object.prototype.hasOwnProperty.call(sl, f), 'slot missing field ' + f);
  }
  eq(sl.rpe, 10 - sl.rir_target, 'rpe must equal 10 − rir_target:');
  eq(p.engine, 'pf-engine-v2', 'engine tag:');
});

// ===========================================================================
// S3 — engine prescribes supersets (time-pressure) + dropsets (isolation),
// and planAdoption.mapWeekToRoutines carries both into adopted routines.
// ===========================================================================

// Helper: collect every superset group in a plan as {session, group, members[]}.
function supersetGroups(plan) {
  const out = [];
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      const byG = {};
      s.slots.forEach((sl, idx) => {
        if (sl.superset_group) (byG[sl.superset_group] = byG[sl.superset_group] || []).push({ idx, sl });
      });
      for (const g of Object.keys(byG)) out.push({ w, s, group: g, members: byG[g] });
    }
  }
  return out;
}
function countDropsets(plan) {
  let n = 0;
  for (const w of plan.weeks) for (const s of w.sessions) for (const sl of s.slots) if (sl.dropset) n++;
  return n;
}
function maxDropsetsPerSession(plan) {
  let mx = 0;
  for (const w of plan.weeks) for (const s of w.sessions) mx = Math.max(mx, s.slots.filter((sl) => sl.dropset).length);
  return mx;
}

test('S3 supersets: time-pressured hypertrophy session yields ≥1 valid superset group (2 members, contiguous, same group, equal sets, accessories, diff muscle+pattern)', () => {
  // 45-min sessions force the duration cap to bite → pairing triggers.
  const p = generatePlanV2(baseInputs({ userId: 's3ss', experienceLevel: 'intermediate', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 4, sessionMinutes: 45 }), { now: NOW });
  const groups = supersetGroups(p);
  assert(groups.length >= 1, 'expected at least one superset group under time pressure');
  for (const gr of groups) {
    eq(gr.members.length, 2, 'S3 groups are exactly 2 members (conservative): group ' + gr.group);
    const [a, b] = gr.members;
    eq(b.idx, a.idx + 1, 'members must be contiguous in slots[]: group ' + gr.group);
    eq(a.sl.superset_group, b.sl.superset_group, 'members share the group id:');
    eq(a.sl.sets, b.sl.sets, 'members share equal (equalized) rounds:');
    assert(a.sl.priority >= 2 && b.sl.priority >= 2, 'only accessory/secondary paired (never primary=priority 1): group ' + gr.group);
    assert(a.sl.role !== 'primary' && b.sl.role !== 'primary', 'never a primary role in a superset:');
    assert(!a.sl.main_lift_key && !b.sl.main_lift_key, 'never a main-lift slot in a superset:');
    assert(a.sl.muscle !== b.sl.muscle, 'antagonist pairing → different muscle: ' + a.sl.muscle + ' vs ' + b.sl.muscle);
    assert(a.sl.pattern !== b.sl.pattern, 'antagonist pairing → different pattern: ' + a.sl.pattern + ' vs ' + b.sl.pattern);
  }
});

test('S3 supersets: a genuinely relaxed WEEK-1 session (not time-capped, minutes > 60) produces NONE', () => {
  // general_fitness (no dropsets) + 120 min → week 1 fits comfortably; the duration
  // cap never bites and minutes > 60, so no session is time-pressured. (Later weeks
  // ramp volume and MAY cap — legitimate; we assert the ADOPTED microcycle = week 1,
  // which is what planAdoption carries into routines, is superset-free.)
  const p = generatePlanV2(baseInputs({ userId: 's3relax', experienceLevel: 'intermediate', goal: 'general_fitness', splitPreference: 'upper_lower', daysPerWeek: 4, sessionMinutes: 120 }), { now: NOW });
  const w1Trimmed = p.rule_trace.some((t) => /Session-length recipe/.test(t)); // capByDuration traces week-1 trims only
  assert(!w1Trimmed, 'test premise: relaxed week-1 must not be duration-trimmed');
  const w1Groups = supersetGroups(p).filter((gr) => gr.w.week_number === 1);
  eq(w1Groups.length, 0, 'relaxed week-1 session should produce no supersets:');
});

test('S3 supersets: powerlifting + peaking never paired (byte-identical to pre-S3)', () => {
  const p = generatePlanV2(baseInputs({
    userId: 's3pl', experienceLevel: 'advanced', goal: 'strength_powerlifting', sessionMinutes: 45, daysPerWeek: 4,
    equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'rack'],
    lifts: { squat: 220, bench: 150, deadlift: 260 },
    meet: { weeksToMeet: 10, target1RM: { squat: 230, bench: 157.5, deadlift: 270 } },
  }), { now: NOW });
  eq(supersetGroups(p).length, 0, 'powerlifting/peaking must never get supersets:');
  eq(countDropsets(p), 0, 'powerlifting must never get dropsets:');
});

test('S3 supersets: novice qualifies (novice+), beginner does not', () => {
  const nov = generatePlanV2(baseInputs({ userId: 's3nov', experienceLevel: 'novice', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 4, sessionMinutes: 45 }), { now: NOW });
  const beg = generatePlanV2(baseInputs({ userId: 's3beg', experienceLevel: 'beginner', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 4, sessionMinutes: 45 }), { now: NOW });
  assert(supersetGroups(nov).length >= 1, 'novice (≥ novice line) should get supersets under time pressure');
  eq(supersetGroups(beg).length, 0, 'absolute beginner should NOT get supersets:');
});

test('S3 dropsets: appear on ≤1 isolation accessory for intermediate hypertrophy; absent for beginner', () => {
  const intr = generatePlanV2(baseInputs({ userId: 's3ds', experienceLevel: 'intermediate', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 4, sessionMinutes: 60 }), { now: NOW });
  assert(countDropsets(intr) >= 1, 'intermediate hypertrophy should prescribe at least one dropset');
  eq(maxDropsetsPerSession(intr), 1, 'at most ONE dropset exercise per session:');
  // every dropset must sit on an isolation accessory, shape { last_n:1, drops:2, drop_pct:20 }
  for (const w of intr.weeks) for (const s of w.sessions) for (const sl of s.slots) {
    if (!sl.dropset) continue;
    eq(sl.is_compound, false, 'dropset must be on an ISOLATION lift (is_compound false): ' + sl.name);
    eq(sl.role, 'accessory', 'dropset must be on an accessory: ' + sl.name);
    eq(sl.dropset.last_n, 1, 'conservative dropset last_n=1:');
    eq(sl.dropset.drops, 2, 'dropset drops=2:');
    eq(sl.dropset.drop_pct, 20, 'dropset drop_pct=20:');
    assert(!sl.superset_group, 'a superset member is never also a dropset:');
  }
  const beg = generatePlanV2(baseInputs({ userId: 's3dsbeg', experienceLevel: 'beginner', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 4, sessionMinutes: 60 }), { now: NOW });
  eq(countDropsets(beg), 0, 'beginner should get no dropsets:');
});

test('S3 dropsets: gated off entirely on the most-cautious failure-proximity knob', () => {
  const cautious = generatePlanV2(baseInputs({ userId: 's3cau', experienceLevel: 'intermediate', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 4, sessionMinutes: 60, knobs: { failureProximity: 'cautious' } }), { now: NOW });
  eq(countDropsets(cautious), 0, 'cautious knob must suppress all dropsets:');
  // supersets still allowed under time pressure (knob only gates dropsets).
  const cautiousTP = generatePlanV2(baseInputs({ userId: 's3cauTP', experienceLevel: 'intermediate', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 4, sessionMinutes: 45, knobs: { failureProximity: 'cautious' } }), { now: NOW });
  assert(supersetGroups(cautiousTP).length >= 1, 'cautious knob should NOT suppress time-pressure supersets');
  eq(countDropsets(cautiousTP), 0, 'cautious knob still suppresses dropsets even under time pressure:');
});

test('S3 dropsets: only hypertrophy (general_fitness gets none even when intermediate)', () => {
  const gf = generatePlanV2(baseInputs({ userId: 's3gf', experienceLevel: 'intermediate', goal: 'general_fitness', splitPreference: 'ppl', daysPerWeek: 4, sessionMinutes: 60 }), { now: NOW });
  eq(countDropsets(gf), 0, 'general_fitness must get no dropsets (hypertrophy-only):');
});

test('S3 determinism: identical inputs → identical superset groups + dropsets', () => {
  const mk = () => generatePlanV2(baseInputs({ userId: 's3det', experienceLevel: 'intermediate', goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 5, sessionMinutes: 45 }), { now: NOW });
  eq(JSON.stringify(mk().weeks), JSON.stringify(mk().weeks), 'S3 prescription must be deterministic:');
});

test('S3 adoption: mapWeekToRoutines carries superset_group/superset_rounds/dropset, preserves contiguity, and passes S2 allowlistExercise', () => {
  // Load the PURE mapper + allowlist with stubs for planAdoption's impure imports
  // (createRoutine → axios chain), mirroring planLifecycle.test.js's stub loader.
  const stubbedCache = {};
  function stubLoad(relPath) {
    if (stubbedCache[relPath]) return stubbedCache[relPath];
    const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
    const js = ts.transpileModule(src, { compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true } }).outputText;
    const mod = { exports: {} };
    stubbedCache[relPath] = mod.exports;
    const dir = path.dirname(path.join(REPO, relPath));
    const STUBS = {
      'mobile/src/data/routines': { createRoutine: () => { throw new Error('createRoutine stubbed'); } },
      'mobile/src/data/schedule': {
        emptySchedule: () => ({ mode: 'cycle', weekly: [], cycle: [] }),
        saveSchedule: async () => {}, loadSchedule: async () => null,
        normalizeSchedule: (x) => x,
      },
      'mobile/src/data/backup/tierPolicy': {},
    };
    const req = function (id) {
      if (id.charAt(0) === '.') {
        const base = path.resolve(dir, id);
        const rel = path.relative(REPO, base).split(path.sep).join('/');
        if (STUBS[rel]) return STUBS[rel];
        const cands = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')];
        for (const c of cands) if (fs.existsSync(c)) return stubLoad(path.relative(REPO, c).split(path.sep).join('/'));
      }
      try { return require(id); } catch (_) { return {}; }
    };
    new Function('module', 'exports', 'require', '__dirname', '__filename', js)(mod, mod.exports, req, dir, path.join(REPO, relPath));
    stubbedCache[relPath] = mod.exports;
    return mod.exports;
  }
  const { mapWeekToRoutines } = stubLoad('mobile/src/planGen/planAdoption.ts');
  const { allowlistExercise } = stubLoad('mobile/src/data/routineExerciseFields.ts');

  // body_part 5-day / 60-min: baseline time pressure (≤60) triggers supersets, and
  // body-part days leave same-muscle isolation accessories UNPAIRED (a curl can't
  // antagonist-pair another curl) so a dropset survives too — both fields present.
  const p = generatePlanV2(baseInputs({ userId: 's3adopt', experienceLevel: 'intermediate', goal: 'hypertrophy', splitPreference: 'body_part', daysPerWeek: 5, sessionMinutes: 60 }), { now: NOW });
  const mapped = mapWeekToRoutines(p.splitPreference, p.weeks[0].sessions);
  assert(mapped.length > 0, 'adoption produced at least one routine');

  let carriedSS = 0, carriedDS = 0;
  for (const r of mapped) {
    const groups = {};
    r.exercises.forEach((e, idx) => {
      if (e.superset_group) {
        carriedSS++;
        (groups[e.superset_group] = groups[e.superset_group] || []).push(idx);
        assert(typeof e.superset_rounds === 'number' && e.superset_rounds === e.target_sets,
          'superset_rounds carried = equalized target_sets: ' + e.name);
      }
      if (e.dropset) carriedDS++;
      // Every mapped exercise must survive S2's allowlist UNCHANGED (bounds pass).
      const al = allowlistExercise(e);
      if (e.superset_group) {
        eq(al.superset_group, e.superset_group, 'allowlist keeps superset_group:');
        eq(al.superset_rounds, e.superset_rounds, 'allowlist keeps superset_rounds:');
      }
      if (e.dropset) eq(JSON.stringify(al.dropset), JSON.stringify(e.dropset), 'allowlist keeps dropset:');
    });
    // contiguity preserved by construction
    for (const g of Object.keys(groups)) {
      const ix = groups[g];
      eq(ix.length, 2, 'mapped group has 2 members:');
      eq(ix[1], ix[0] + 1, 'mapped group members contiguous: group ' + g + ' in ' + r.name);
    }
  }
  assert(carriedSS > 0, 'adoption carried at least one superset member');
  assert(carriedDS > 0, 'adoption carried at least one dropset');
});

// ---------------------------------------------------------------------------
console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
