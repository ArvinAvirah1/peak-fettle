// params.ts — Engine v2 quantitative parameters + deriveParams() (typed port).
// Every number here is sourced in RESEARCH.md (section refs inline). Pure data + logic.

import type {
  DerivedParamsV2,
  EngineInputsV2,
  ExperienceLevel,
  GoalV2,
  Landmark,
  PeriodizationModel,
  RepZones,
} from './types';

// ── Per-muscle volume landmarks (weekly hard sets) — RESEARCH.md §1.2 ──
// [MV, MEV, MRV]. MAV is the ramp zone between MEV and MRV.
export const LANDMARKS: Record<string, Landmark> = {
  chest: { mv: 8, mev: 10, mrv: 22 },
  back: { mv: 8, mev: 10, mrv: 25 },
  quads: { mv: 6, mev: 8, mrv: 20 },
  hamstrings: { mv: 4, mev: 6, mrv: 20 },
  glutes: { mv: 0, mev: 4, mrv: 16 },
  side_delts: { mv: 6, mev: 8, mrv: 26 },
  rear_delts: { mv: 0, mev: 6, mrv: 20 },
  front_delts: { mv: 6, mev: 6, mrv: 16 },
  shoulders: { mv: 6, mev: 8, mrv: 22 },
  biceps: { mv: 5, mev: 8, mrv: 20 },
  triceps: { mv: 5, mev: 8, mrv: 18 },
  calves: { mv: 6, mev: 8, mrv: 20 },
  abs: { mv: 0, mev: 6, mrv: 25 },
  traps: { mv: 4, mev: 8, mrv: 26 },
  forearms: { mv: 2, mev: 6, mrv: 20 },
  full_body: { mv: 4, mev: 6, mrv: 16 },
};

// A guaranteed-present fallback landmark (noUncheckedIndexedAccess-safe).
export const FULL_BODY_LANDMARK: Landmark = { mv: 4, mev: 6, mrv: 16 };
export function landmarkFor(muscle: string): Landmark {
  return LANDMARKS[muscle] ?? FULL_BODY_LANDMARK;
}

// Muscles that receive large indirect volume → count direct work at 0.6× (RESEARCH.md §1.2)
export const SMALL_MUSCLES = new Set<string>(['biceps', 'triceps', 'rear_delts', 'abs', 'forearms']);

interface ExperienceTier {
  years: number;
  volumeStart: number;
  volumeStep: number;
  perSessionCap: number;
}

// ── Experience tier → base volume + per-session cap — RESEARCH.md §1.4, §4.2 ──
export const EXPERIENCE: Record<ExperienceLevel, ExperienceTier> = {
  beginner: { years: 1, volumeStart: 8, volumeStep: 1, perSessionCap: 5 },
  novice: { years: 2, volumeStart: 10, volumeStep: 1, perSessionCap: 6 },
  intermediate: { years: 4, volumeStart: 13, volumeStep: 1.5, perSessionCap: 8 },
  advanced: { years: 6, volumeStart: 17, volumeStep: 2, perSessionCap: 9 },
  elite: { years: 9, volumeStart: 19, volumeStep: 2, perSessionCap: 10 },
};

// TEST_RUN refinement (a): cap squat-PATTERN variants per week (novices stacked too
// many squat variations). Tunable per experience — DESIGN_SPEC / TEST_RUN.md.
export const SQUAT_PATTERN_CAP: Record<ExperienceLevel, number> = {
  beginner: 2,
  novice: 2,
  intermediate: 3,
  advanced: 3,
  elite: 3,
};

interface RirFloorTier {
  compound: number;
  isolation: number;
}
// Experience → RIR FLOOR (closest-to-failure ever allowed) — RESEARCH.md §2.5, §10.1
export const EXP_RIR_FLOOR: Record<ExperienceLevel, RirFloorTier> = {
  beginner: { compound: 2, isolation: 2 },
  novice: { compound: 2, isolation: 2 },
  intermediate: { compound: 1, isolation: 1 },
  advanced: { compound: 1, isolation: 0 },
  elite: { compound: 1, isolation: 0 },
};

interface GoalSpec {
  volumeMult: number;
  repZones: RepZones;
  rirBand: [number, number];
  model: Record<ExperienceLevel, PeriodizationModel>;
}

// ── Goal → volume multiplier, rep zones by role, base RIR band — RESEARCH.md §2.5, §3.1 ──
export const GOALS: Record<GoalV2, GoalSpec> = {
  hypertrophy: {
    volumeMult: 1.0,
    repZones: { primary: [5, 8, 0.8], secondary: [8, 12, 0.72], accessory: [12, 20, 0.65] },
    rirBand: [1, 3],
    model: { beginner: 'linear', novice: 'linear', intermediate: 'dup', advanced: 'undulating', elite: 'undulating' },
  },
  strength_powerlifting: {
    volumeMult: 0.85,
    repZones: { primary: [1, 5, 0.87], secondary: [4, 6, 0.82], accessory: [8, 12, 0.7] },
    rirBand: [1, 3],
    model: { beginner: 'linear', novice: 'linear', intermediate: 'dup', advanced: 'block', elite: 'block' },
  },
  general_fitness: {
    volumeMult: 0.8,
    repZones: { primary: [5, 10, 0.75], secondary: [8, 12, 0.7], accessory: [10, 15, 0.65] },
    rirBand: [2, 3],
    model: { beginner: 'linear', novice: 'linear', intermediate: 'undulating', advanced: 'undulating', elite: 'undulating' },
  },
  athletic_power: {
    volumeMult: 0.75,
    repZones: { primary: [3, 5, 0.85], secondary: [3, 6, 0.8], accessory: [8, 12, 0.65] },
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

// ── Knob mappings — RESEARCH.md §10 / DESIGN_SPEC §D ──
interface FailureKnob { rirShift: number; floorCompound: number; floorIsolation: number }
export const KNOB_FAILURE: Record<string, FailureKnob> = {
  cautious: { rirShift: +1, floorCompound: 2, floorIsolation: 2 },
  balanced: { rirShift: 0, floorCompound: 1, floorIsolation: 1 },
  aggressive: { rirShift: -1, floorCompound: 1, floorIsolation: 0 },
};
interface ProgressionKnob { loadScale: number; rampBonus: number; deloadBias: number }
export const KNOB_PROGRESSION: Record<string, ProgressionKnob> = {
  conservative: { loadScale: 0.5, rampBonus: -0.5, deloadBias: -1 },
  balanced: { loadScale: 1.0, rampBonus: 0, deloadBias: 0 },
  aggressive: { loadScale: 1.5, rampBonus: +0.5, deloadBias: +1 },
};
export const KNOB_DELOAD: Record<string, number> = { infrequent: 7, standard: 5, frequent: 3 };

// ── NSCA %1RM ↔ reps table — RESEARCH.md §3.2 ──
const NSCA: Record<number, number> = {
  1: 1.0, 2: 0.95, 3: 0.93, 4: 0.9, 5: 0.87, 6: 0.85, 7: 0.83, 8: 0.8,
  9: 0.77, 10: 0.75, 12: 0.7, 15: 0.65, 20: 0.6,
};
export function pctForReps(reps: number): number {
  const r = Math.max(1, Math.min(20, Math.round(reps)));
  const exact = NSCA[r];
  if (exact != null) return exact;
  const keys = Object.keys(NSCA).map(Number).sort((a, b) => a - b);
  let lo = keys[0] ?? 1;
  let hi = keys[keys.length - 1] ?? 20;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const kNext = keys[i + 1];
    if (k != null && kNext != null && k <= r && kNext >= r) { lo = k; hi = kNext; break; }
  }
  const loVal = NSCA[lo] ?? 1.0;
  const hiVal = NSCA[hi] ?? 0.6;
  const t = hi === lo ? 0 : (r - lo) / (hi - lo);
  return loVal + t * (hiVal - loVal);
}

// Prilepin optimal reps-per-set by %1RM — RESEARCH.md §3.4
export function prilepinRepsPerSet(pct: number): [number, number] {
  if (pct >= 0.9) return [1, 2];
  if (pct >= 0.8) return [2, 4];
  if (pct >= 0.7) return [3, 6];
  return [3, 6];
}

// Plyometric foot-contacts per session by experience — RESEARCH.md §7.3
export const PLYO_CONTACTS: Record<ExperienceLevel, number> = {
  beginner: 90, novice: 100, intermediate: 110, advanced: 130, elite: 140,
};

export function round2_5(kg: number): number { return Math.round(kg / 2.5) * 2.5; }
export function clamp(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, x)); }

export interface DeriveResult {
  params: DerivedParamsV2;
  trace: string[];
}

// ── deriveParams: experience × goal × knobs → the numeric engine parameters ──
// DESIGN_SPEC §B.1. Returns a fully-resolved parameter block + a trace.
export function deriveParams(profile: EngineInputsV2): DeriveResult {
  const trace: string[] = [];
  const expKey: ExperienceLevel = profile.experienceLevel || 'beginner';
  const exp = EXPERIENCE[expKey];
  const goalKey: GoalV2 = profile.goal || 'general_fitness';
  const goal = GOALS[goalKey];

  const knobs = profile.knobs || {};
  const kFail = KNOB_FAILURE[knobs.failureProximity || 'balanced'] ?? KNOB_FAILURE['balanced']!;
  const kProg = KNOB_PROGRESSION[knobs.progressionSpeed || 'balanced'] ?? KNOB_PROGRESSION['balanced']!;
  let deloadName = knobs.deloadFrequency || 'standard';

  // Cross-knob safety coupling (DESIGN_SPEC §10.3): aggressive proximity + aggressive
  // progression → force deload at least one step more frequent + reactive on.
  let reactiveDeload = false;
  if (knobs.failureProximity === 'aggressive' && knobs.progressionSpeed === 'aggressive') {
    if (deloadName === 'infrequent') deloadName = 'standard';
    else if (deloadName === 'standard') deloadName = 'frequent';
    reactiveDeload = true;
    trace.push(
      'Knob safety: aggressive failure-proximity + aggressive progression -> deloads made more frequent and reactive-deload enabled (faster fatigue accrual shortens time-to-MRV).'
    );
  }

  // Accumulation length (weeks before a deload), bounded [3,8] and nudged by progression knob.
  let accumulationWeeks = clamp((KNOB_DELOAD[deloadName] ?? 5) + kProg.deloadBias, 3, 8);
  // Age raises deload frequency floor (older → more frequent) — RESEARCH.md §8.2
  if ((profile.ageYears || 0) >= 45) {
    accumulationWeeks = clamp(accumulationWeeks - 1, 3, 8);
    trace.push('Age >=45: deloads made one step more frequent (recovery capacity declines with age).');
  }

  // Effective RIR floors = max(experience floor, knob floor).
  const expFloor = EXP_RIR_FLOOR[expKey];
  const rirFloor = {
    compound: Math.max(expFloor.compound, kFail.floorCompound),
    isolation: Math.max(expFloor.isolation, kFail.floorIsolation),
  };

  // Novices train further from failure AND get a +1 self-report calibration (RESEARCH.md §2.3).
  const noviceRirAdj = expKey === 'beginner' || expKey === 'novice' ? 1 : 0;

  const volumeStep = Math.max(0.5, exp.volumeStep + kProg.rampBonus);

  const params: DerivedParamsV2 = {
    experienceLevel: expKey,
    trainingAgeYears: profile.trainingAgeYears ?? exp.years,
    goal: goalKey,
    model: goal.model[expKey],
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
    plyoContacts: PLYO_CONTACTS[expKey],
    squatPatternCap: SQUAT_PATTERN_CAP[expKey],
  };

  trace.push(
    `Experience "${expKey}" (~${params.trainingAgeYears}yr training age): base ${params.volumeStart} sets/muscle/wk, +${volumeStep}/wk ramp, <=${params.perSessionCap} sets/muscle/session, periodization="${params.model}".`
  );
  trace.push(
    `Goal "${goalKey}": volume x${goal.volumeMult}, RIR band ${goal.rirBand[0]}-${goal.rirBand[1]}; rep zones primary ${goal.repZones.primary[0]}-${goal.repZones.primary[1]} @ ${Math.round(goal.repZones.primary[2] * 100)}%1RM, accessory ${goal.repZones.accessory[0]}-${goal.repZones.accessory[1]} @ ${Math.round(goal.repZones.accessory[2] * 100)}%1RM.`
  );
  trace.push(
    `RIR floors (never trained closer than): compound ${rirFloor.compound}, isolation ${rirFloor.isolation}. Knob shift ${kFail.rirShift >= 0 ? '+' : ''}${kFail.rirShift}. Novice self-report calibration +${noviceRirAdj}.`
  );
  trace.push(
    `Deload cadence: every ${accumulationWeeks} weeks${reactiveDeload ? ' (+ reactive)' : ''}. Progression load x${kProg.loadScale}.`
  );
  trace.push(
    `Squat-pattern variety cap: <=${params.squatPatternCap} distinct squat-pattern lifts/week (avoids redundant squat stacking for this experience level).`
  );

  return { params, trace };
}
