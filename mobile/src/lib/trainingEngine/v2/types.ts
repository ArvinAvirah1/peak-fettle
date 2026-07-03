// types.ts — Engine v2 input/output types (pure TypeScript, dependency-free).
// -----------------------------------------------------------------------------
// Ported from engine-v2-testrun/{catalog,params,engine}.mjs + DESIGN_SPEC.md §A/§E
// and REQUIREMENTS_ADDENDUM_2026-07-02.md (split preference + trial sequence).
//
// All inputs derive from the on-device survey profile / history / PBs. The engine
// is Pro-only, deterministic, and makes ZERO network calls (CLAUDE.md invariant).
// The output shape is a SUPERSET of v1's GeneratePlanResult (DESIGN_SPEC §E): the
// v1-identical slot fields are present, v2 fields are additive/optional so existing
// consumers keep working. See index.ts for the full v1↔v2 mapping comment block.
// -----------------------------------------------------------------------------

// ── Closed vocabularies (match the app / v1 catalog) ──
export type ExperienceLevel =
  | 'beginner'
  | 'novice'
  | 'intermediate'
  | 'advanced'
  | 'elite';

export type GoalV2 =
  | 'hypertrophy'
  | 'strength_powerlifting'
  | 'general_fitness'
  | 'athletic_power'
  | 'team_sport';

// NEW required dimension (addendum §1). 'unsure' triggers the trial-splits flow.
export type SplitPreference = 'ppl' | 'upper_lower' | 'body_part' | 'unsure';

export type SessionMinutes = 15 | 30 | 45 | 60 | 75 | 90 | 120;

export type SportV2 =
  | 'soccer'
  | 'basketball'
  | 'football'
  | 'rugby'
  | 'volleyball'
  | 'handball'
  | 'hockey'
  | 'other';

export type SeasonPhase = 'off_season' | 'pre_season' | 'in_season';

export type FailureProximity = 'cautious' | 'balanced' | 'aggressive';
export type ProgressionSpeed = 'conservative' | 'balanced' | 'aggressive';
export type DeloadFrequency = 'infrequent' | 'standard' | 'frequent';

export type PeriodizationModel =
  | 'linear'
  | 'dup'
  | 'undulating'
  | 'block';

// Injury region tokens (closed set, DESIGN_SPEC §A.1).
export type InjuryRegion =
  | 'lower_back'
  | 'knees'
  | 'shoulders'
  | 'wrists'
  | 'elbows'
  | 'ankles'
  | 'neck'
  | 'hip'
  | 'upper_back';

// Slot role for strict primary/secondary/accessory tagging (TEST_RUN refinement b).
export type SlotRole = 'primary' | 'secondary' | 'accessory';

// Canonical muscle-bucket labels used by the volume model (align with LANDMARKS keys).
export type MuscleBucket =
  | 'chest'
  | 'back'
  | 'upper_back'
  | 'shoulders'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs'
  | 'traps'
  | 'forearms'
  | 'full_body';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'olympic'
  | 'plyometric'
  | 'carry'
  | 'core'
  | 'isolation_arms'
  | 'isolation_shoulders'
  | 'isolation_chest'
  | 'isolation_back'
  | 'isolation_legs'
  | 'isolation_calves';

// ── Per-lift estimated 1RMs (kg) for %1RM loading (DESIGN_SPEC §A.1) ──
export interface LiftsV2 {
  squat?: number;
  bench?: number;
  deadlift?: number;
  ohp?: number;
  [name: string]: number | undefined;
}

// ── Powerlifting meet branch ──
export interface MeetV2 {
  weeksToMeet: number;
  target1RM?: { squat?: number; bench?: number; deadlift?: number };
}

// ── Config knobs (safe-bounded, DESIGN_SPEC §D) ──
export interface KnobsV2 {
  failureProximity?: FailureProximity;
  progressionSpeed?: ProgressionSpeed;
  deloadFrequency?: DeloadFrequency;
}

// ── The engine input: a typed ProfileV2 (DESIGN_SPEC §A.1 + addendum §1) ──
export interface EngineInputsV2 {
  // Identity / recovery tuning
  experienceLevel: ExperienceLevel;
  trainingAgeYears?: number;
  sex?: 'M' | 'F' | null;
  ageYears?: number | null;
  bodyweightKg?: number | null;

  // Goal
  goal: GoalV2;
  fatLossEmphasis?: boolean;

  // NEW required dimension (addendum §1)
  splitPreference: SplitPreference;

  // Schedule
  daysPerWeek: number; // 1..7
  sessionMinutes: SessionMinutes;
  trainingDays?: number[] | null; // JS getDay() 0..6

  // Equipment (closed vocabulary)
  equipment: string[];

  // Muscle priorities (canonical labels)
  musclePriorities?: string[] | null;

  // Injuries / contraindications
  injuries?: string[] | null;

  // Disliked / excluded exercise ids (Stage-2 meta-changes, addendum §3). The
  // selector filters these out of every pool but never empties a slot (falls
  // back to the un-excluded pool if exclusion would leave nothing). Optional +
  // absent by default, so pre-Stage-2 callers are byte-identical (determinism).
  excludeExerciseIds?: string[] | null;

  // Per-lift strength (for %1RM loading)
  lifts?: LiftsV2 | null;

  // Powerlifting branch
  meet?: MeetV2 | null;

  // Team-sport branch
  sport?: SportV2;
  seasonPhase?: SeasonPhase;
  gameDay?: number | null; // JS getDay() 0..6

  // Config knobs
  knobs?: KnobsV2 | null;

  // Mesocycle length to generate
  weeksToGenerate?: number;

  // Determinism seed inputs (no clock/random inside the engine).
  userId?: string | number;
  // weekISO is derived from options.now when not supplied; used only for the seed.
  weekISO?: string;
}

// ── Catalog entry (typed port of catalog.mjs) ──
export interface CatalogExerciseV2 {
  id: string;
  name: string;
  movement_pattern: MovementPattern;
  is_compound: boolean;
  equipment: string[];
  primaryMuscle: MuscleBucket;
  muscles: string[];
  contraindications: string[];
  safeFor: string[];
  plyo: boolean;
  power: boolean;
}

// ── Volume landmarks per muscle (weekly hard sets) ──
export interface Landmark {
  mv: number;
  mev: number;
  mrv: number;
}

// ── Resolved numeric parameters (output of deriveParams) ──
export interface RepZone {
  // [repLow, repHigh, pct1rm]
  0: number;
  1: number;
  2: number;
}
export interface RepZones {
  primary: [number, number, number];
  secondary: [number, number, number];
  accessory: [number, number, number];
}
export interface RirFloor {
  compound: number;
  isolation: number;
}
export interface DerivedParamsV2 {
  experienceLevel: ExperienceLevel;
  trainingAgeYears: number;
  goal: GoalV2;
  model: PeriodizationModel;
  volumeStart: number;
  volumeStep: number;
  volumeMult: number;
  perSessionCap: number;
  repZones: RepZones;
  rirBand: [number, number];
  rirShift: number;
  rirFloor: RirFloor;
  noviceRirAdj: number;
  loadScale: number;
  accumulationWeeks: number;
  reactiveDeload: boolean;
  plyoContacts: number;
  // squat-pattern cap (TEST_RUN refinement a), tunable per experience.
  squatPatternCap: number;
}

// ── OUTPUT shape (DESIGN_SPEC §E superset of v1) ──
export interface CardioPrescription {
  kind: string;
  contacts?: number;
  zone?: string;
  minutes?: number;
  description?: string;
}

export interface PlanSlotV2 {
  // v1-identical fields
  exercise_id: string;
  name: string;
  muscle: string; // the muscle bucket this slot targets
  muscles: string[];
  pattern: MovementPattern;
  is_compound: boolean;
  priority: number; // 1 primary · 2 secondary · 3 accessory (maps to v1 priority)
  sets: number;
  reps: string; // e.g. "6-8" (unchanged from v1)
  rpe: number; // rpe = 10 − rirTarget (maps RIR onto v1's rpe field)
  rest_seconds: number;
  weight_kg: number | null;
  load_note: string; // v1 "coaching_note" equivalent for load prescription

  // v2-additive (optional)
  role: SlotRole;
  rir_target: number;
  pct_1rm: number | null;
  week_intent: string; // e.g. "dup accumulation wk2" / "Peak (2wk out)"
  peak_note?: string | null;
  main_lift_key?: 'squat' | 'bench' | 'deadlift' | null;
}

export interface PlanSessionV2 {
  day_label: string;
  mdOffset?: string | null; // team-sport MD± (new)
  warmup?: string | null;
  slots: PlanSlotV2[];
  cardio: CardioPrescription[];
}

export interface PlanWeekV2 {
  week_number: number;
  phase: string;
  isDeload: boolean;
  sessions: PlanSessionV2[];
}

export interface MesocycleReport {
  model: PeriodizationModel;
  accumulationWeeks: number;
  deloadWeek: number;
  totalWeeks: number;
}

export interface AttemptSet {
  opener: number;
  second: number;
  third: number;
}
export interface PeakingReport {
  weeksToMeet: number;
  phases: Array<[string, number]>;
  attempts: Partial<Record<'squat' | 'bench' | 'deadlift', AttemptSet>>;
}

export interface SportPlanReport {
  sport?: SportV2;
  seasonPhase: SeasonPhase;
  gameDay: number | null;
}

export interface PerMuscleVolume {
  freqPerWeek: number;
  week1Sets: number;
  peakWeekSets: number;
  mev: number;
  mrv: number;
}
export interface VolumeReport {
  perMuscleWeeklySets: Record<string, PerMuscleVolume>;
}

export interface PlanV2 {
  engine: 'pf-engine-v2';
  reasoning: string;
  rule_trace: string[];
  splitPreference: SplitPreference;
  weeks: PlanWeekV2[];
  mesocycle?: MesocycleReport;
  peaking?: PeakingReport;
  sportPlan?: SportPlanReport;
  volumeReport?: VolumeReport;
}

// ── Trial-sequence output (addendum §2): 3 sequential 3-week blocks ──
export interface TrialBlockV2 {
  blockIndex: number; // 0..2
  splitPreference: Exclude<SplitPreference, 'unsure'>;
  splitLabel: string; // human label, e.g. "Push / Pull / Legs"
  weeks: PlanWeekV2[]; // exactly 3 weeks
  reasoning: string;
  rule_trace: string[];
  volumeReport?: VolumeReport;
}

export interface TrialSequenceV2 {
  engine: 'pf-engine-v2-trial';
  blockOrder: Array<Exclude<SplitPreference, 'unsure'>>; // fixed: ppl → upper_lower → body_part
  blocks: TrialBlockV2[]; // 3 blocks × 3 weeks each
  reasoning: string;
}

// ── options bag (clock injected; NO Date.now() inside the engine) ──
export interface EngineOptionsV2 {
  now?: Date;
}
