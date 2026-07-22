// params.mjs — Engine v2 prototype: all quantitative parameters + deriveParams()
// Every number here is sourced in RESEARCH.md (section refs inline). Pure data + logic.

// ── Per-muscle volume landmarks (weekly hard sets) — RESEARCH.md §1.2 ──
// [MV, MEV, MRV]. MAV is the ramp zone between MEV and MRV.
export const LANDMARKS = {
  chest:       { mv: 8, mev: 10, mrv: 22 },
  back:        { mv: 8, mev: 10, mrv: 25 },
  quads:       { mv: 6, mev: 8,  mrv: 20 },
  hamstrings:  { mv: 4, mev: 6,  mrv: 20 },
  glutes:      { mv: 0, mev: 4,  mrv: 16 },
  side_delts:  { mv: 6, mev: 8,  mrv: 26 },
  rear_delts:  { mv: 0, mev: 6,  mrv: 20 },
  front_delts: { mv: 6, mev: 6,  mrv: 16 },
  shoulders:   { mv: 6, mev: 8,  mrv: 22 },   // pressing "shoulders" bucket (front+overall)
  biceps:      { mv: 5, mev: 8,  mrv: 20 },
  triceps:     { mv: 5, mev: 8,  mrv: 18 },
  calves:      { mv: 6, mev: 8,  mrv: 20 },
  abs:         { mv: 0, mev: 6,  mrv: 25 },
  traps:       { mv: 4, mev: 8,  mrv: 26 },
  forearms:    { mv: 2, mev: 6,  mrv: 20 },
  full_body:   { mv: 4, mev: 6,  mrv: 16 },   // olympic/power fallback bucket
};

// Muscles that receive large indirect volume → count direct work at 0.6× (RESEARCH.md §1.2)
export const SMALL_MUSCLES = new Set(['biceps', 'triceps', 'rear_delts', 'abs', 'forearms']);

// ── Experience tier → base volume + per-session cap — RESEARCH.md §1.4, §4.2 ──
export const EXPERIENCE = {
  beginner:     { years: 1, volumeStart: 8,  volumeStep: 1,   perSessionCap: 5 },
  novice:       { years: 2, volumeStart: 10, volumeStep: 1,   perSessionCap: 6 },
  intermediate: { years: 4, volumeStart: 13, volumeStep: 1.5, perSessionCap: 8 },
  advanced:     { years: 6, volumeStart: 17, volumeStep: 2,   perSessionCap: 9 },
  elite:        { years: 9, volumeStart: 19, volumeStep: 2,   perSessionCap: 10 },
};

// Experience → RIR FLOOR (closest-to-failure ever allowed) — RESEARCH.md §2.5, §10.1
export const EXP_RIR_FLOOR = {
  beginner:     { compound: 2, isolation: 2 },
  novice:       { compound: 2, isolation: 2 },
  intermediate: { compound: 1, isolation: 1 },
  advanced:     { compound: 1, isolation: 0 },
  elite:        { compound: 1, isolation: 0 },
};

// ── Goal → volume multiplier, rep zones by role, base RIR band — RESEARCH.md §2.5, §3.1 ──
// repZones: [repLow, repHigh, pct1rm] per role. rirBand: [low, high] target reps-in-reserve.
export const GOALS = {
  hypertrophy: {
    volumeMult: 1.0,
    repZones: { primary: [5, 8, 0.80], secondary: [8, 12, 0.72], accessory: [12, 20, 0.65] },
    rirBand: [1, 3],
    model: { beginner: 'linear', novice: 'linear', intermediate: 'dup', advanced: 'undulating', elite: 'undulating' },
  },
  strength_powerlifting: {
    volumeMult: 0.85,
    repZones: { primary: [1, 5, 0.87], secondary: [4, 6, 0.82], accessory: [8, 12, 0.70] },
    rirBand: [1, 3],
    model: { beginner: 'linear', novice: 'linear', intermediate: 'dup', advanced: 'block', elite: 'block' },
  },
  general_fitness: {
    volumeMult: 0.8,
    repZones: { primary: [5, 10, 0.75], secondary: [8, 12, 0.70], accessory: [10, 15, 0.65] },
    rirBand: [2, 3],
    model: { beginner: 'linear', novice: 'linear', intermediate: 'undulating', advanced: 'undulating', elite: 'undulating' },
  },
  athletic_power: {
    volumeMult: 0.75,
    repZones: { primary: [3, 5, 0.85], secondary: [3, 6, 0.80], accessory: [8, 12, 0.65] },
    rirBand: [2, 3],
    model: { beginner: 'linear', novice: 'linear', intermediate: 'dup', advanced: 'block', elite: 'block' },
  },
  team_sport: {
    volumeMult: 0.85,
    repZones: { primary: [3, 6, 0.82], secondary: [5, 8, 0.78], accessory: [8, 12, 0.68] },
    rirBand: [2, 3],
    model: { beginner: 'linear', novice: 'linear', intermediate: 'dup', advanced: 'block', elite: 'block' },
  },
};

// ── Knob mappings — RESEARCH.md §10 / §D ──
export const KNOB_FAILURE = {
  cautious:   { rirShift: +1, floorCompound: 2, floorIsolation: 2 },
  balanced:   { rirShift: 0,  floorCompound: 1, floorIsolation: 1 },
  aggressive: { rirShift: -1, floorCompound: 1, floorIsolation: 0 },
};
export const KNOB_PROGRESSION = {
  conservative: { loadScale: 0.5, rampBonus: -0.5, deloadBias: -1 },
  balanced:     { loadScale: 1.0, rampBonus: 0,    deloadBias: 0 },
  aggressive:   { loadScale: 1.5, rampBonus: +0.5, deloadBias: +1 },
};
export const KNOB_DELOAD = { infrequent: 7, standard: 5, frequent: 3 }; // accumulation weeks before deload

// ── NSCA %1RM ↔ reps table — RESEARCH.md §3.2 ──
const NSCA = { 1:1.00, 2:0.95, 3:0.93, 4:0.90, 5:0.87, 6:0.85, 7:0.83, 8:0.80, 9:0.77, 10:0.75, 12:0.70, 15:0.65, 20:0.60 };
export function pctForReps(reps) {
  const r = Math.max(1, Math.min(20, Math.round(reps)));
  if (NSCA[r] != null) return NSCA[r];
  // linear interpolate between the two nearest tabled keys
  const keys = Object.keys(NSCA).map(Number).sort((a, b) => a - b);
  let lo = keys[0], hi = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) { if (keys[i] <= r && keys[i + 1] >= r) { lo = keys[i]; hi = keys[i + 1]; break; } }
  const t = (r - lo) / (hi - lo);
  return NSCA[lo] + t * (NSCA[hi] - NSCA[lo]);
}

// Prilepin optimal reps-per-set by %1RM (for strength/power set sizing) — RESEARCH.md §3.4
export function prilepinRepsPerSet(pct) {
  if (pct >= 0.90) return [1, 2];
  if (pct >= 0.80) return [2, 4];
  if (pct >= 0.70) return [3, 6];
  return [3, 6];
}

// Plyometric foot-contacts per session by experience — RESEARCH.md §7.3
export const PLYO_CONTACTS = { beginner: 90, novice: 100, intermediate: 110, advanced: 130, elite: 140 };

export function round2_5(kg) { return Math.round(kg / 2.5) * 2.5; }
export function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

// ── deriveParams: experience × goal × knobs → the numeric engine parameters ──
// RESEARCH.md §B.1 (DESIGN_SPEC). Returns a fully-resolved parameter block + a trace.
export function deriveParams(profile) {
  const trace = [];
  const expKey = (profile.experienceLevel || 'beginner');
  const exp = EXPERIENCE[expKey] || EXPERIENCE.beginner;
  const goalKey = profile.goal || 'general_fitness';
  const goal = GOALS[goalKey] || GOALS.general_fitness;

  const knobs = profile.knobs || {};
  const kFail = KNOB_FAILURE[knobs.failureProximity || 'balanced'];
  const kProg = KNOB_PROGRESSION[knobs.progressionSpeed || 'balanced'];
  let deloadName = knobs.deloadFrequency || 'standard';

  // Cross-knob safety coupling (RESEARCH.md §10.3): aggressive proximity + aggressive
  // progression → force deload at least one step more frequent + reactive on.
  let reactiveDeload = false;
  if ((knobs.failureProximity === 'aggressive') && (knobs.progressionSpeed === 'aggressive')) {
    if (deloadName === 'infrequent') deloadName = 'standard';
    else if (deloadName === 'standard') deloadName = 'frequent';
    reactiveDeload = true;
    trace.push('Knob safety: aggressive failure-proximity + aggressive progression → deloads made more frequent and reactive-deload enabled (faster fatigue accrual shortens time-to-MRV).');
  }

  // Accumulation length (weeks before a deload), bounded [3,8] and nudged by progression knob.
  let accumulationWeeks = clamp((KNOB_DELOAD[deloadName] || 5) + (kProg.deloadBias || 0), 3, 8);
  // Age raises deload frequency floor (older → more frequent) — RESEARCH.md §8.2
  if ((profile.ageYears || 0) >= 45) { accumulationWeeks = clamp(accumulationWeeks - 1, 3, 8); trace.push('Age ≥45: deloads made one step more frequent (recovery capacity declines with age).'); }

  // Effective RIR floors = max(experience floor, knob floor) — a novice on "aggressive"
  // is still clamped to the experience floor (RESEARCH.md §2.5, §10.1).
  const expFloor = EXP_RIR_FLOOR[expKey] || EXP_RIR_FLOOR.beginner;
  const rirFloor = {
    compound: Math.max(expFloor.compound, kFail.floorCompound),
    isolation: Math.max(expFloor.isolation, kFail.floorIsolation),
  };

  // Novices train further from failure AND get a +1 self-report calibration (RESEARCH.md §2.3).
  const noviceRirAdj = (expKey === 'beginner' || expKey === 'novice') ? 1 : 0;

  const volumeStep = Math.max(0.5, exp.volumeStep + (kProg.rampBonus || 0));

  const params = {
    experienceLevel: expKey,
    trainingAgeYears: profile.trainingAgeYears ?? exp.years,
    goal: goalKey,
    model: (goal.model[expKey] || 'linear'),
    volumeStart: exp.volumeStart,
    volumeStep,
    volumeMult: goal.volumeMult,
    perSessionCap: exp.perSessionCap,
    repZones: goal.repZones,
    rirBand: goal.rirBand,
    rirShift: kFail.rirShift,
    rirFloor,
    noviceRirAdj,
    loadScale: kProg.loadScale,
    accumulationWeeks,
    reactiveDeload,
    plyoContacts: PLYO_CONTACTS[expKey] || 100,
  };

  trace.push(`Experience "${expKey}" (~${params.trainingAgeYears}yr training age): base ${params.volumeStart} sets/muscle/wk, +${volumeStep}/wk ramp, ≤${params.perSessionCap} sets/muscle/session, periodization="${params.model}".`);
  trace.push(`Goal "${goalKey}": volume ×${goal.volumeMult}, RIR band ${goal.rirBand[0]}–${goal.rirBand[1]}; rep zones primary ${goal.repZones.primary[0]}–${goal.repZones.primary[1]} @ ${Math.round(goal.repZones.primary[2]*100)}%1RM, accessory ${goal.repZones.accessory[0]}–${goal.repZones.accessory[1]} @ ${Math.round(goal.repZones.accessory[2]*100)}%1RM.`);
  trace.push(`RIR floors (never trained closer than): compound ${rirFloor.compound}, isolation ${rirFloor.isolation}. Knob shift ${kFail.rirShift >= 0 ? '+' : ''}${kFail.rirShift}. Novice self-report calibration +${noviceRirAdj}.`);
  trace.push(`Deload cadence: every ${accumulationWeeks} weeks${reactiveDeload ? ' (+ reactive)' : ''}. Progression load ×${kProg.loadScale}.`);

  return { params, trace };
}
