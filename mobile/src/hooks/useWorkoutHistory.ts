/**
 * useWorkoutHistory — fetches the last 30 days of workouts + their sets,
 * computes PR flags (client-side, approximate), and derives the week streak.
 *
 * Returns:
 *   history  — array of { workout, sets (with is_pr), liftNames }
 *   streak   — consecutive-week count (see useStreak)
 *   isLoading
 *   error
 *   refetch
 *
 * PR detection note: a LiftSet is flagged is_pr = true if its weight_kg is
 * the highest seen for that (exercise_id, reps) pair within the 30-day
 * fetch window. This is approximate — sets before the window are not
 * considered.
 *
 * TODO: replace PR detection with GET /prs once backend endpoint ships
 *
 * All API call sites: TODO(TICKET-027): swap for PowerSync hook
 */

import { useState, useEffect, useCallback } from 'react';
import { getWorkouts } from '../api/workouts';
import { getSetsForWorkout } from '../api/sets';
import { getExercises } from '../api/exercises';
import { Workout, WorkoutSet, LiftSet, Exercise } from '../types/api';
import { computeStreak } from './useStreak';
import { toDateKey, daysAgo } from '../utils/dateHelpers';

// ---------------------------------------------------------------------------
// Extended types
// ---------------------------------------------------------------------------

export interface LiftSetWithPR extends LiftSet {
  is_pr: boolean;
}

export type WorkoutSetWithPR = LiftSetWithPR | Exclude<WorkoutSet, LiftSet>;

export interface WorkoutHistoryEntry {
  workout: Workout;
  sets: WorkoutSetWithPR[];
  /** Display names of exercises logged (lift sets only, unique, ordered). */
  liftNames: string[];
}

export interface UseWorkoutHistoryResult {
  history: WorkoutHistoryEntry[];
  streak: number;
  /** TICKET-091: exercise_id → display name, for callers that list lifts. */
  exerciseNames: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// PR computation
// ---------------------------------------------------------------------------

/**
 * Given a flat list of all lift sets, returns a Set of set IDs that are PRs.
 *
 * Algorithm: for each (exercise_id, reps) bucket, the set(s) with the
 * highest weight_kg are flagged. Ties both get the flag.
 *
 * TODO: replace with GET /prs once backend endpoint ships
 */
function computePRIds(allLiftSets: LiftSet[]): Set<string> {
  // Map: `${exercise_id}:${reps}` → best weight seen
  const bestWeight = new Map<string, number>();

  for (const s of allLiftSets) {
    const key = `${s.exercise_id}:${s.reps}`;
    const current = bestWeight.get(key) ?? -Infinity;
    if (s.weight_kg > current) bestWeight.set(key, s.weight_kg);
  }

  const prIds = new Set<string>();
  for (const s of allLiftSets) {
    const key = `${s.exercise_id}:${s.reps}`;
    if (s.weight_kg >= (bestWeight.get(key) ?? -Infinity)) {
      prIds.add(s.id);
    }
  }

  return prIds;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkoutHistory(): UseWorkoutHistoryResult {
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(new Map());
  const [streak, setStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // TODO(TICKET-027): swap for PowerSync hook
  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const today = new Date();
      const from = daysAgo(30, today);
      const to = toDateKey(today);

      // TODO(TICKET-027): swap for PowerSync hook
      const [workouts, exerciseLibrary] = await Promise.all([
        getWorkouts(from, to),
        getExercises(),
      ]);

      // Build a flat exercise name map keyed by exercise_id.
      const exerciseMap = new Map<string, string>();
      for (const category of Object.values(exerciseLibrary.exercises)) {
        for (const ex of category as Exercise[]) {
          exerciseMap.set(ex.id, ex.name);
        }
      }
      // TICKET-091: publish the id→name map so callers (Trends) can label lifts
      // by exercise_id instead of guessing from per-day liftNames ordering.
      setExerciseNames(exerciseMap);

      // Fetch sets for all workouts in parallel.
      // TODO(TICKET-027): swap for PowerSync hook
      const setsArrays = await Promise.all(
        workouts.map((w) => getSetsForWorkout(w.id))
      );

      // Collect all lift sets across the window for PR computation.
      const allLiftSets: LiftSet[] = [];
      for (const sets of setsArrays) {
        for (const s of sets) {
          if (s.kind === 'lift') allLiftSets.push(s as LiftSet);
        }
      }

      const prIds = computePRIds(allLiftSets);

      // Build history entries.
      const entries: WorkoutHistoryEntry[] = workouts.map((workout, idx) => {
        // Guard: a fetch that returned fewer arrays than workouts must not crash the map.
        const rawSets = setsArrays[idx] ?? [];
        const setsWithPR: WorkoutSetWithPR[] = rawSets.map((s) => {
          if (s.kind === 'lift') {
            return { ...(s as LiftSet), is_pr: prIds.has(s.id) };
          }
          return s;
        });

        // Unique lift names in logged order.
        const seen = new Set<string>();
        const liftNames: string[] = [];
        for (const s of rawSets) {
          if (s.kind === 'lift') {
            const liftSet = s as LiftSet;
            if (!liftSet.exercise_id) continue; // guard: skip sets with missing exercise_id
            const name = exerciseMap.get(liftSet.exercise_id) ?? liftSet.exercise_id;
            if (!seen.has(name)) {
              seen.add(name);
              liftNames.push(name);
            }
          }
        }

        return { workout, sets: setsWithPR, liftNames };
      });

      // Sort descending by day_key (most recent first).
      entries.sort((a, b) => b.workout.day_key.localeCompare(a.workout.day_key));

      setHistory(entries);
      setStreak(computeStreak(workouts));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load workout history';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { history, streak, exerciseNames, isLoading, error, refetch: load };
}
