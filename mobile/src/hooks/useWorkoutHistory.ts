/**
 * useWorkoutHistory — fetches the last 30 days of workouts + their sets,
 * computes PR flags (client-side, approximate), and derives the week streak.
 *
 * Tier branching (SPEC-094A Agent P):
 *   isLocalFirst(user) → reads from localDb (on-device SQLite); no REST calls.
 *   Pro (syncsToServer) → unchanged existing REST behaviour.
 *
 * Returns:
 *   history  — array of { workout, sets (with is_pr), liftNames }
 *   streak   — consecutive-week count (see useStreak)
 *   isLoading
 *   error
 *   refetch
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { localDb } from '../db/localDb';
import { getWorkouts } from '../api/workouts';
import { getSetsForWorkout } from '../api/sets';
import { getExercises } from '../api/exercises';
import { Workout, WorkoutSet, LiftSet, CardioSet, Exercise } from '../types/api';
import { computeStreak } from './useStreak';
import { toDateKey, daysAgo } from '../utils/dateHelpers';

// ---------------------------------------------------------------------------
// Extended types (unchanged public API)
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
// PR computation (unchanged)
// ---------------------------------------------------------------------------

function computePRIds(allLiftSets: LiftSet[]): Set<string> {
  const bestWeight = new Map<string, number>();
  for (const s of allLiftSets) {
    const key = `${s.exercise_id}:${s.reps}`;
    const current = bestWeight.get(key) ?? -Infinity;
    if (s.weight_kg > current) bestWeight.set(key, s.weight_kg);
  }
  const prIds = new Set<string>();
  for (const s of allLiftSets) {
    const key = `${s.exercise_id}:${s.reps}`;
    if (s.weight_kg >= (bestWeight.get(key) ?? -Infinity)) prIds.add(s.id);
  }
  return prIds;
}

// ---------------------------------------------------------------------------
// Local DB row types
// ---------------------------------------------------------------------------

interface WorkoutRow {
  id: string;
  user_id: string;
  day_key: string;
  notes: string | null;
  session_type: string | null;
  created_at: string;
  updated_at: string;
}

interface SetRow {
  id: string;
  workout_id: string;
  user_id: string;
  exercise_id: string;
  kind: string;
  set_index: number;
  reps: number | null;
  weight_raw: number | null;
  weight_kg: number | null;  // REAL exact kg (v3); preferred over weight_raw
  rir: number | null;
  duration_sec: number | null;
  distance_m: number | null;
  avg_pace_sec_per_km: number | null;
  logged_at: string;
}

function rowToSet(row: SetRow): WorkoutSet {
  if (row.kind === 'lift') {
    return {
      id: row.id, workout_id: row.workout_id, user_id: row.user_id,
      exercise_id: row.exercise_id, kind: 'lift',
      set_index: row.set_index, reps: row.reps ?? 0,
      weight_kg: row.weight_kg != null ? row.weight_kg : (row.weight_raw != null ? row.weight_raw / 8 : 0),
      rir: row.rir, logged_at: row.logged_at,
    } as LiftSet;
  }
  return {
    id: row.id, workout_id: row.workout_id, user_id: row.user_id,
    exercise_id: row.exercise_id, kind: 'cardio',
    set_index: row.set_index, duration_sec: row.duration_sec ?? 0,
    distance_m: row.distance_m, avg_pace_sec_per_km: row.avg_pace_sec_per_km,
    logged_at: row.logged_at,
  } as CardioSet;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkoutHistory(): UseWorkoutHistoryResult {
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);

  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(new Map());
  const [streak, setStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const today = new Date();
      const from  = daysAgo(30, today);
      const to    = toDateKey(today);

      if (localFirst) {
        // ── Free path: localDb ──────────────────────────────────────────────
        await localDb.init();

        const localWorkouts = await localDb.getAll<WorkoutRow>(
          `SELECT * FROM workouts WHERE day_key >= ? AND day_key <= ?
           ORDER BY day_key DESC`,
          [from, to]
        );

        const domainWorkouts: Workout[] = localWorkouts.map((w) => ({
          id: w.id, user_id: w.user_id, day_key: w.day_key, notes: w.notes,
          session_type: (w.session_type ?? null) as Workout['session_type'],
          created_at: w.created_at, updated_at: w.updated_at,
        }));

        // Best-effort exercise name map from exercise_prefs (id→id fallback).
        const prefRows = await localDb.getAll<{ exercise_id: string }>(
          'SELECT exercise_id FROM exercise_prefs'
        );
        const exerciseMap = new Map<string, string>();
        prefRows.forEach((r) => exerciseMap.set(r.exercise_id, r.exercise_id));

        // Fetch sets per workout.
        const setsArrays: WorkoutSet[][] = await Promise.all(
          domainWorkouts.map(async (w) => {
            const rows = await localDb.getAll<SetRow>(
              'SELECT * FROM sets WHERE workout_id = ? ORDER BY set_index ASC',
              [w.id]
            );
            return rows.map(rowToSet);
          })
        );

        const allLiftSets: LiftSet[] = [];
        for (const sets of setsArrays) {
          for (const s of sets) {
            if (s.kind === 'lift') allLiftSets.push(s as LiftSet);
          }
        }
        const prIds = computePRIds(allLiftSets);

        const entries: WorkoutHistoryEntry[] = domainWorkouts.map((workout, idx) => {
          const rawSets = setsArrays[idx] ?? [];
          const setsWithPR: WorkoutSetWithPR[] = rawSets.map((s) => {
            if (s.kind === 'lift') {
              return { ...(s as LiftSet), is_pr: prIds.has(s.id) };
            }
            return s;
          });
          const seen = new Set<string>();
          const liftNames: string[] = [];
          for (const s of rawSets) {
            if (s.kind === 'lift') {
              const liftSet = s as LiftSet;
              if (!liftSet.exercise_id) continue;
              const name = exerciseMap.get(liftSet.exercise_id) ?? liftSet.exercise_id;
              if (!seen.has(name)) { seen.add(name); liftNames.push(name); }
            }
          }
          return { workout, sets: setsWithPR, liftNames };
        });

        setExerciseNames(exerciseMap);
        setHistory(entries);
        setStreak(computeStreak(domainWorkouts));
        return;
      }

      // ── Pro path: REST (unchanged) ────────────────────────────────────────
      const [workouts, exerciseLibrary] = await Promise.all([
        getWorkouts(from, to),
        getExercises(),
      ]);

      const exerciseMap = new Map<string, string>();
      for (const category of Object.values(exerciseLibrary.exercises)) {
        for (const ex of category as Exercise[]) {
          exerciseMap.set(ex.id, ex.name);
        }
      }
      setExerciseNames(exerciseMap);

      const setsArrays = await Promise.all(
        workouts.map((w) => getSetsForWorkout(w.id))
      );

      const allLiftSets: LiftSet[] = [];
      for (const sets of setsArrays) {
        for (const s of sets) {
          if (s.kind === 'lift') allLiftSets.push(s as LiftSet);
        }
      }

      const prIds = computePRIds(allLiftSets);

      const entries: WorkoutHistoryEntry[] = workouts.map((workout, idx) => {
        const rawSets = setsArrays[idx] ?? [];
        const setsWithPR: WorkoutSetWithPR[] = rawSets.map((s) => {
          if (s.kind === 'lift') {
            return { ...(s as LiftSet), is_pr: prIds.has(s.id) };
          }
          return s;
        });
        const seen = new Set<string>();
        const liftNames: string[] = [];
        for (const s of rawSets) {
          if (s.kind === 'lift') {
            const liftSet = s as LiftSet;
            if (!liftSet.exercise_id) continue;
            const name = exerciseMap.get(liftSet.exercise_id) ?? liftSet.exercise_id;
            if (!seen.has(name)) {
              seen.add(name);
              liftNames.push(name);
            }
          }
        }
        return { workout, sets: setsWithPR, liftNames };
      });

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
  }, [localFirst]);

  useEffect(() => {
    load();
  }, [load]);

  return { history, streak, exerciseNames, isLoading, error, refetch: load };
}
