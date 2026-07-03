/**
 * surveyTypes.ts — the deep plan-generation survey answer model (Stage 1).
 * =============================================================================
 * Pure, dependency-free types for the Pro-only "Generate plan" deep survey
 * (REQUIREMENTS_ADDENDUM_2026-07-02 §1/§6 + DESIGN_SPEC §A). `SurveyAnswers`
 * is the UI-facing shape the wizard collects; `generateFromSurvey.ts` maps it
 * onto the engine's `EngineInputsV2` and calls the on-device v2 engine.
 *
 * Design notes:
 *   • Every field carries a UI-natural type (Sets are the wizard's working
 *     model; the adapter narrows to the engine's closed vocabularies).
 *   • The five knob/config values default to the "balanced" safe midpoints so a
 *     user who skips the knobs step still gets a sound plan (DESIGN_SPEC §D).
 *   • Weight fields are EXACT kg (CLAUDE.md invariant #2). The UI enters lbs/kg
 *     and converts via src/constants/units.ts BEFORE populating these.
 *   • No network types here — generation is fully on-device (local-first).
 * =============================================================================
 */

import type {
  ExperienceLevel,
  GoalV2,
  SplitPreference,
  SessionMinutes,
  SportV2,
  SeasonPhase,
  FailureProximity,
  ProgressionSpeed,
  DeloadFrequency,
} from '../lib/trainingEngine/v2/types';

// Re-export the engine vocabularies the survey UI needs so screens import from
// one place (the survey), not deep into the engine.
export type {
  ExperienceLevel,
  GoalV2,
  SplitPreference,
  SessionMinutes,
  SportV2,
  SeasonPhase,
  FailureProximity,
  ProgressionSpeed,
  DeloadFrequency,
};

/** The five deep-survey goals (addendum §1 — the v2 taxonomy). */
export type SurveyGoal = GoalV2;

/**
 * Per-lift estimated 1RMs the user optionally supplies (EXACT kg). Any subset
 * may be present; the engine uses these for %1RM loading and (for powerlifting)
 * attempt suggestions.
 */
export interface SurveyLifts {
  squat?: number | null;
  bench?: number | null;
  deadlift?: number | null;
  ohp?: number | null;
}

/**
 * Powerlifting meet branch (goal === 'strength_powerlifting'). Optional; when
 * `weeksToMeet` is set the engine lays a peaking block backward from the meet.
 * `targetX` are goal third-attempt 1RMs in EXACT kg (optional).
 */
export interface SurveyMeet {
  weeksToMeet: number;
  targetSquatKg?: number | null;
  targetBenchKg?: number | null;
  targetDeadliftKg?: number | null;
}

/** Config knobs (safe-bounded; the adapter clamps via the engine). */
export interface SurveyKnobs {
  failureProximity: FailureProximity;
  progressionSpeed: ProgressionSpeed;
  deloadFrequency: DeloadFrequency;
}

/**
 * SurveyAnswers — everything the deep wizard collects. Only `goal`,
 * `experienceLevel`, `daysPerWeek`, `sessionMinutes`, and `splitPreference` are
 * conceptually required to generate; the rest have sane defaults (see
 * DEFAULT_SURVEY_ANSWERS + the adapter). Arrays default to empty.
 */
export interface SurveyAnswers {
  // ── Goal (+ branches) ──
  goal: SurveyGoal;
  /** general_fitness sub-flag: adds conditioning, keeps volume ~maintenance→MEV. */
  fatLossEmphasis: boolean;
  /** team_sport branch. */
  sport?: SportV2 | null;
  seasonPhase?: SeasonPhase | null;
  /** JS getDay() 0..6 of the weekly game (team_sport); anchors the MD± microcycle. */
  gameDay?: number | null;
  /** strength_powerlifting branch. */
  meet?: SurveyMeet | null;

  // ── Identity / recovery tuning ──
  experienceLevel: ExperienceLevel;
  sex?: 'M' | 'F' | null;
  /** Date of birth ISO yyyy-mm-dd; the adapter derives age for recovery tuning. */
  birthDate?: string | null;
  bodyweightKg?: number | null;

  // ── NEW required dimension (addendum §1) ──
  splitPreference: SplitPreference;

  // ── Schedule ──
  daysPerWeek: number; // 1..7
  sessionMinutes: SessionMinutes;
  /** JS getDay() 0..6 weekdays; maps sessions onto real days. Optional. */
  trainingDays: number[];

  // ── Equipment (closed vocabulary; engine falls back to full-gym if empty) ──
  equipment: string[];

  // ── Muscle priorities (canonical labels) ──
  musclePriorities: string[];

  // ── Injuries / contraindications (region tokens) ──
  injuries: string[];

  // ── Disliked / excluded exercises (Stage-2 meta-changes, addendum §3) ──
  // Exercise ids the user never wants prescribed. Additive + optional so plans
  // saved before Stage 2 (which lack the field) still load; the meta-change
  // sheet writes it and the engine adapter maps it onto the exclusion channel.
  excludedExerciseIds?: string[];

  // ── Per-lift strength (for %1RM loading) ──
  lifts?: SurveyLifts | null;

  // ── Config knobs (defaults = balanced) ──
  knobs: SurveyKnobs;
}

/** Balanced, safe defaults — a plan generated from these alone is sound. */
export const DEFAULT_KNOBS: SurveyKnobs = {
  failureProximity: 'balanced',
  progressionSpeed: 'balanced',
  deloadFrequency: 'standard',
};

/**
 * A complete default answer set. Screens spread this then overlay any values
 * pre-filled from the user's profile, so every field is always defined.
 */
export const DEFAULT_SURVEY_ANSWERS: SurveyAnswers = {
  goal: 'general_fitness',
  fatLossEmphasis: false,
  sport: null,
  seasonPhase: null,
  gameDay: null,
  meet: null,
  experienceLevel: 'beginner',
  sex: null,
  birthDate: null,
  bodyweightKg: null,
  splitPreference: 'unsure',
  daysPerWeek: 3,
  sessionMinutes: 60,
  trainingDays: [],
  equipment: [],
  musclePriorities: [],
  injuries: [],
  excludedExerciseIds: [],
  lifts: null,
  knobs: { ...DEFAULT_KNOBS },
};
