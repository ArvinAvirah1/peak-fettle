/**
 * quickSwapPersist.ts — the optional "never suggest <X> again" bridge (Stage 3).
 * =============================================================================
 * REQUIREMENTS_ADDENDUM_2026-07-02 §4: a mid-workout quick-swap applies to TODAY's
 * session only, UNLESS the user opts to make it permanent — which is a Stage-2
 * meta-change (add the exercise to the plan's `excludedExerciseIds` and regenerate).
 *
 * This is deliberately SAFE + ADDITIVE:
 *   • Only acts when a SINGLE generated plan exists (kind === 'plan'); a trial
 *     sequence or no plan → returns 'no-plan' and the UI hides the action.
 *   • Reuses the exact Stage-2 path: applyMetaChange → generateFromSurvey →
 *     saveActivePlan, preserving the plan's lifecycle status. No new engine logic.
 *   • Local-first: planStore + the engine are on-device; NO network call.
 *   • Idempotent: excluding an already-excluded id is a no-op ('already-excluded').
 *
 * Determinism: the caller injects `now` (the plan seed + created/updated stamps);
 * this module reads no clock of its own.
 * =============================================================================
 */

import { loadActivePlan, saveActivePlan } from './planStore';
import { applyMetaChange } from './metaChanges';
import { generateFromSurvey } from './generateFromSurvey';

export type ExcludeResult =
  | 'excluded' // added + plan regenerated
  | 'already-excluded' // id was already in the set — nothing to do
  | 'no-plan' // no single active plan (trial / none) — action should be hidden
  | 'error'; // best-effort failure — the today-only swap still stands

/**
 * excludeExercisePermanently — append `exerciseId` to the active plan's excluded
 * list and regenerate the plan deterministically from the (patched) survey.
 * Returns a status the UI can surface. Never throws.
 *
 * @param exerciseId  catalog id to exclude (the ORIGINAL exercise being swapped away)
 * @param now         clock injected at the call site (plan seed + stamps)
 */
export async function excludeExercisePermanently(
  exerciseId: string,
  now: Date = new Date(),
): Promise<ExcludeResult> {
  if (!exerciseId) return 'error';
  try {
    const stored = await loadActivePlan();
    // Only a single saved/adopted plan can carry a meta-change. Trials adopt first.
    if (!stored || stored.kind !== 'plan' || !stored.plan) return 'no-plan';

    const already = stored.survey.excludedExerciseIds ?? [];
    if (already.includes(exerciseId)) return 'already-excluded';

    const patchedSurvey = applyMetaChange(stored.survey, {
      excludedExerciseIds: [...already, exerciseId],
    });

    const gen = generateFromSurvey(patchedSurvey, stored.userId ?? undefined, { now });
    // The active plan is a single-split plan, so regeneration yields a plan (not a
    // trial) unless the survey split is 'unsure' — guard defensively.
    if (gen.kind !== 'plan') return 'no-plan';

    // Preserve the lifecycle status (saved vs adopted) across the regenerate.
    const status = stored.status === 'plan_adopted' ? 'plan_adopted' : 'plan_saved';
    await saveActivePlan(
      { userId: stored.userId, plan: gen.plan, survey: patchedSurvey, status },
      now,
    );
    return 'excluded';
  } catch {
    return 'error';
  }
}
