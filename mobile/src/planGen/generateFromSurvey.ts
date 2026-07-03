/**
 * generateFromSurvey.ts — pure adapter: SurveyAnswers → EngineInputsV2 → plan.
 * =============================================================================
 * Bridges the Pro deep-survey UI to the on-device v2 engine
 * (REQUIREMENTS_ADDENDUM_2026-07-02 §1/§2/§6). It is pure and deterministic:
 *   • splitPreference === 'unsure'  → generateTrialSequence (three 3-week
 *     trial blocks: PPL → Upper/Lower → Body-part; addendum §2).
 *   • otherwise                     → generatePlanV2 (a single mesocycle on the
 *     chosen split).
 * `options.now` is passed straight through so the seed is caller-controlled
 * (no clock read here — DESIGN_SPEC determinism invariant). Zero network.
 * =============================================================================
 */

import {
  generatePlanV2,
  generateTrialSequence,
} from '../lib/trainingEngine/v2';
import type {
  EngineInputsV2,
  EngineOptionsV2,
  LiftsV2,
  MeetV2,
  PlanV2,
  TrialSequenceV2,
} from '../lib/trainingEngine/v2/types';
import type { SurveyAnswers } from './surveyTypes';

/** Result of generating from the survey — either a single plan or a trial sequence. */
export type SurveyGenerationResult =
  | { kind: 'plan'; plan: PlanV2 }
  | { kind: 'trial'; sequence: TrialSequenceV2 };

// ── Helpers ──────────────────────────────────────────────────────────────

/** Approximate whole years from an ISO yyyy-mm-dd birth date, relative to `now`. */
function ageYearsFrom(birthDate: string | null | undefined, now: Date): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const dob = new Date(birthDate + 'T00:00:00.000Z');
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

/** Build the engine's LiftsV2 from the survey's optional per-lift 1RMs. */
function toLifts(a: SurveyAnswers): LiftsV2 | null {
  const l = a.lifts;
  if (!l) return null;
  const out: LiftsV2 = {};
  if (l.squat != null && l.squat > 0) out.squat = l.squat;
  if (l.bench != null && l.bench > 0) out.bench = l.bench;
  if (l.deadlift != null && l.deadlift > 0) out.deadlift = l.deadlift;
  if (l.ohp != null && l.ohp > 0) out.ohp = l.ohp;
  return Object.keys(out).length > 0 ? out : null;
}

/** Build the engine's MeetV2 (powerlifting peaking branch) from the survey. */
function toMeet(a: SurveyAnswers): MeetV2 | null {
  if (a.goal !== 'strength_powerlifting') return null;
  const m = a.meet;
  if (!m || !(m.weeksToMeet > 0)) return null;
  const target1RM: NonNullable<MeetV2['target1RM']> = {};
  if (m.targetSquatKg != null && m.targetSquatKg > 0) target1RM.squat = m.targetSquatKg;
  if (m.targetBenchKg != null && m.targetBenchKg > 0) target1RM.bench = m.targetBenchKg;
  if (m.targetDeadliftKg != null && m.targetDeadliftKg > 0) target1RM.deadlift = m.targetDeadliftKg;
  return {
    weeksToMeet: Math.round(m.weeksToMeet),
    ...(Object.keys(target1RM).length > 0 ? { target1RM } : {}),
  };
}

// The engine falls back to a full-gym default when equipment is empty; we send
// exactly what the user picked (empty ⇒ engine default). This mirror keeps the
// closed vocabulary unchanged (barbell/dumbbell/machine/… — see catalog.ts).
const FULL_GYM_FALLBACK = [
  'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bench', 'rack', 'pullup_bar', 'bands',
];

/**
 * mapSurveyToInputs — the pure SurveyAnswers → EngineInputsV2 mapping.
 * Exported for testing / reuse (e.g. Stage-2 meta-change patches).
 * `userId` seeds the deterministic PRNG; `now` (when supplied) derives age.
 */
export function mapSurveyToInputs(
  answers: SurveyAnswers,
  userId?: string | number,
  now?: Date,
): EngineInputsV2 {
  const clock = now ?? new Date('2026-01-05T00:00:00.000Z'); // fixed epoch mirror (age only)
  const equipment = answers.equipment.length > 0 ? [...answers.equipment] : [...FULL_GYM_FALLBACK];

  const inputs: EngineInputsV2 = {
    experienceLevel: answers.experienceLevel,
    sex: answers.sex ?? null,
    ageYears: ageYearsFrom(answers.birthDate, clock),
    bodyweightKg: answers.bodyweightKg ?? null,

    goal: answers.goal,
    fatLossEmphasis: answers.goal === 'general_fitness' ? !!answers.fatLossEmphasis : false,

    splitPreference: answers.splitPreference,

    daysPerWeek: Math.max(1, Math.min(7, Math.round(answers.daysPerWeek))),
    sessionMinutes: answers.sessionMinutes,
    trainingDays: answers.trainingDays.length > 0 ? [...answers.trainingDays].sort((x, y) => x - y) : null,

    equipment,
    musclePriorities: answers.musclePriorities.length > 0 ? [...answers.musclePriorities] : null,
    injuries: answers.injuries.length > 0 ? [...answers.injuries] : null,
    excludeExerciseIds:
      answers.excludedExerciseIds && answers.excludedExerciseIds.length > 0
        ? [...answers.excludedExerciseIds]
        : null,

    lifts: toLifts(answers),
    meet: toMeet(answers),

    knobs: {
      failureProximity: answers.knobs.failureProximity,
      progressionSpeed: answers.knobs.progressionSpeed,
      deloadFrequency: answers.knobs.deloadFrequency,
    },
  };

  // Team-sport branch — only attach when the goal is team_sport.
  if (answers.goal === 'team_sport') {
    if (answers.sport) inputs.sport = answers.sport;
    if (answers.seasonPhase) inputs.seasonPhase = answers.seasonPhase;
    inputs.gameDay = answers.gameDay ?? null;
  }

  if (userId != null) inputs.userId = userId;

  return inputs;
}

/**
 * generateFromSurvey — the single entry point the survey screen calls after the
 * final "Generate" tap. Deterministic given (answers, userId, options.now).
 *
 *   splitPreference === 'unsure' → a TrialSequenceV2 (three 3-week blocks).
 *   otherwise                    → a single PlanV2 on the chosen split.
 */
export function generateFromSurvey(
  answers: SurveyAnswers,
  userId?: string | number,
  options?: EngineOptionsV2,
): SurveyGenerationResult {
  const inputs = mapSurveyToInputs(answers, userId, options?.now);

  if (answers.splitPreference === 'unsure') {
    return { kind: 'trial', sequence: generateTrialSequence(inputs, options) };
  }
  return { kind: 'plan', plan: generatePlanV2(inputs, options) };
}
