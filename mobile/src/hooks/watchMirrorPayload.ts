/**
 * watchMirrorPayload -- TICKET-140 Stage A: the PURE payload builder consumed
 * by useWatchMirror.ts.
 *
 * Split into its own dependency-light module (imports ONLY constants/units.ts,
 * itself import-free) so it can be required directly by a bare-node transpile
 * harness the same way src/lib/trainingEngine/v2/fatigue.ts is -- useWatchMirror.ts
 * itself imports react-native/expo-modules-core and can't be `require()`d
 * outside the app runtime.
 *
 * No clock reads inside the pure function -- `now` is always a parameter
 * (Workflow lint: no literal Date.now()/new Date() inside pure logic).
 *
 * See useWatchMirror.ts for the full architecture/data-source doc comment.
 */

import { formatWeight, type UnitSystem } from '../constants/units';

// ---------------------------------------------------------------------------
// Payload v1 (versioned envelope -- mirrors
// audits/TICKET-140-watch-sync-architecture-2026-07-04.md verbatim)
// ---------------------------------------------------------------------------

export interface WatchExerciseMirror {
  name: string;
  /** Target set count. */
  sets: number;
  /** "8-12" or "5" -- routines already store this as a display-ready string. */
  repsLabel: string;
  /** Formatted via constants/units.ts formatWeight (e.g. "60.0 kg" / "135 lbs"), or null when there's no weight target (e.g. bodyweight / never logged). */
  weightLabel: string | null;
  /** True once logged sets for this exercise (today) meet/exceed its target. */
  done: boolean;
}

export interface WatchTodayMirror {
  workoutName: string;
  exercises: WatchExerciseMirror[];
}

export interface WatchMirrorPayload {
  v: 1;
  generatedAt: string;
  today: WatchTodayMirror | null;
}

/** One exercise's raw inputs, already resolved from the routine + today's sets. */
export interface WatchExerciseInput {
  name: string;
  targetSets: number;
  /** Routine's target_reps string ("8-12", "5", ...), or null/empty if unset. */
  targetReps: string | null | undefined;
  /** Target weight in EXACT kg (routines don't currently store a per-exercise
   *  weight target; this is sourced from the caller's best-effort resolution,
   *  e.g. the exercise's last-logged weight today -- null renders no weight label). */
  targetWeightKg: number | null;
  /** Count of sets already logged today for this exercise (0 if none). */
  loggedSetCount: number;
}

export interface BuildWatchMirrorInput {
  /** Null when nothing is scheduled or today is a rest day -- the caller has
   *  already resolved rest-day-ness via schedule.resolveNextUp(). */
  today: {
    workoutName: string;
    exercises: WatchExerciseInput[];
  } | null;
  unitPref: UnitSystem;
}

/** Pure: given resolved inputs, builds the exact v1 payload shipped to the watch. */
export function buildWatchMirrorPayload(input: BuildWatchMirrorInput, now: Date): WatchMirrorPayload {
  if (!input.today) {
    return { v: 1, generatedAt: now.toISOString(), today: null };
  }

  const exercises: WatchExerciseMirror[] = input.today.exercises.map((ex) => {
    const repsLabel = ex.targetReps && ex.targetReps.trim() !== '' ? ex.targetReps.trim() : '-';
    const weightLabel =
      ex.targetWeightKg != null && Number.isFinite(ex.targetWeightKg)
        ? formatWeight(ex.targetWeightKg, input.unitPref)
        : null;
    const targetSets = Math.max(0, ex.targetSets || 0);
    const done = targetSets > 0 && ex.loggedSetCount >= targetSets;
    return {
      name: ex.name,
      sets: targetSets,
      repsLabel,
      weightLabel,
      done,
    };
  });

  return {
    v: 1,
    generatedAt: now.toISOString(),
    today: { workoutName: input.today.workoutName, exercises },
  };
}
