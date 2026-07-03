/**
 * metaChanges.ts — pure meta-adjustment of SurveyAnswers (Stage 2).
 * =============================================================================
 * REQUIREMENTS_ADDENDUM_2026-07-02 §3. After a plan exists, "Request changes"
 * lets the user tweak a handful of parameters WITHOUT redoing the whole survey.
 * A MetaChangePatch is applied to the saved SurveyAnswers → the plan is
 * regenerated deterministically from the patched answers → a diff-style summary
 * of what changed is shown.
 *
 * This module is PURE and dependency-free (only survey types). It does NOT call
 * the engine, read the clock, or touch the DB — the caller does regeneration and
 * persistence. Determinism: applyMetaChange is a plain object transform.
 *
 * Supported dimensions (addendum §3): days/week, session length, split,
 * emphasis (muscle priorities), disliked/excluded exercises, progression
 * aggressiveness, deload cadence. "Disliked exercises" maps onto the survey's
 * injuries/exclusions channel via `excludedExerciseIds` (a NEW additive survey
 * field, backward-compatible — old answers simply lack it).
 * =============================================================================
 */

import type {
  SurveyAnswers,
  SessionMinutes,
  SplitPreference,
  ProgressionSpeed,
  DeloadFrequency,
  FailureProximity,
} from './surveyTypes';

/**
 * A structured, partial meta-change. Every field is optional — only the ones the
 * user actually changed are set. Applying an empty patch is a no-op.
 */
export interface MetaChangePatch {
  daysPerWeek?: number;
  sessionMinutes?: SessionMinutes;
  splitPreference?: SplitPreference;
  /** Replaces the muscle-priority set outright (the emphasis picker is absolute). */
  musclePriorities?: string[];
  /** Replaces the disliked/excluded-exercise id set outright. */
  excludedExerciseIds?: string[];
  progressionSpeed?: ProgressionSpeed;
  deloadFrequency?: DeloadFrequency;
  failureProximity?: FailureProximity;
}

/** One human-readable diff line. */
export interface MetaChangeLine {
  field: string;
  before: string;
  after: string;
  text: string; // e.g. "Days per week: 4 → 5"
}

// ---------------------------------------------------------------------------
// Labels (shared with the sheet UI copy)
// ---------------------------------------------------------------------------

const SPLIT_LABELS: Record<SplitPreference, string> = {
  ppl: 'Push / Pull / Legs',
  upper_lower: 'Upper / Lower',
  body_part: 'Body-part split',
  unsure: 'Trial three splits',
};

const PROGRESSION_LABELS: Record<ProgressionSpeed, string> = {
  conservative: 'Conservative',
  balanced: 'Balanced',
  aggressive: 'Aggressive',
};

const DELOAD_LABELS: Record<DeloadFrequency, string> = {
  infrequent: 'Infrequent',
  standard: 'Standard',
  frequent: 'Frequent',
};

const FAILURE_LABELS: Record<FailureProximity, string> = {
  cautious: 'Further from failure',
  balanced: 'Balanced',
  aggressive: 'Closer to failure',
};

function listLabel(items: string[] | null | undefined): string {
  if (!items || items.length === 0) return 'none';
  return items.join(', ');
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * clampDays — days/week is bounded 1..7 (the engine also clamps, but we keep the
 * stored answers honest so the diff summary shows the effective value).
 */
function clampDays(n: number): number {
  return Math.max(1, Math.min(7, Math.round(n)));
}

/**
 * applyMetaChange — return a NEW SurveyAnswers with the patch folded in. Pure:
 * the input `answers` is never mutated (knobs are cloned). Only fields present on
 * the patch change; everything else is preserved so regeneration stays faithful
 * to the original survey.
 */
export function applyMetaChange(answers: SurveyAnswers, patch: MetaChangePatch): SurveyAnswers {
  const next: SurveyAnswers = {
    ...answers,
    // Clone nested objects/arrays we may touch so the original is untouched.
    knobs: { ...answers.knobs },
    musclePriorities: [...answers.musclePriorities],
    excludedExerciseIds: answers.excludedExerciseIds ? [...answers.excludedExerciseIds] : [],
  };

  if (patch.daysPerWeek != null) next.daysPerWeek = clampDays(patch.daysPerWeek);
  if (patch.sessionMinutes != null) next.sessionMinutes = patch.sessionMinutes;
  if (patch.splitPreference != null) next.splitPreference = patch.splitPreference;
  if (patch.musclePriorities != null) next.musclePriorities = [...patch.musclePriorities];
  if (patch.excludedExerciseIds != null) next.excludedExerciseIds = [...patch.excludedExerciseIds];
  if (patch.progressionSpeed != null) next.knobs.progressionSpeed = patch.progressionSpeed;
  if (patch.deloadFrequency != null) next.knobs.deloadFrequency = patch.deloadFrequency;
  if (patch.failureProximity != null) next.knobs.failureProximity = patch.failureProximity;

  return next;
}

// ---------------------------------------------------------------------------
// Diff summary
// ---------------------------------------------------------------------------

/**
 * diffSummary — human-readable lines describing what changed between two
 * SurveyAnswers. Pure; used to show the user a "here's what we adjusted" list
 * after regeneration (addendum §3 "diff-style summary of what changed").
 * Returns an empty array when nothing changed.
 */
export function diffSummary(before: SurveyAnswers, after: SurveyAnswers): MetaChangeLine[] {
  const lines: MetaChangeLine[] = [];

  const push = (field: string, b: string, a: string): void => {
    if (b !== a) lines.push({ field, before: b, after: a, text: `${field}: ${b} → ${a}` });
  };

  push('Days per week', String(before.daysPerWeek), String(after.daysPerWeek));
  push('Session length', `${before.sessionMinutes} min`, `${after.sessionMinutes} min`);
  push('Split', SPLIT_LABELS[before.splitPreference], SPLIT_LABELS[after.splitPreference]);
  push('Muscle emphasis', listLabel(before.musclePriorities), listLabel(after.musclePriorities));
  push(
    'Excluded exercises',
    listLabel(before.excludedExerciseIds),
    listLabel(after.excludedExerciseIds),
  );
  push(
    'Progression',
    PROGRESSION_LABELS[before.knobs.progressionSpeed],
    PROGRESSION_LABELS[after.knobs.progressionSpeed],
  );
  push(
    'Deload cadence',
    DELOAD_LABELS[before.knobs.deloadFrequency],
    DELOAD_LABELS[after.knobs.deloadFrequency],
  );
  push(
    'Effort',
    FAILURE_LABELS[before.knobs.failureProximity],
    FAILURE_LABELS[after.knobs.failureProximity],
  );

  return lines;
}

/**
 * hasAnyChange — true when the patch would actually alter the answers. Lets the
 * UI disable "Apply" until the user changes something.
 */
export function hasAnyChange(before: SurveyAnswers, patch: MetaChangePatch): boolean {
  return diffSummary(before, applyMetaChange(before, patch)).length > 0;
}
