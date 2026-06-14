// TODO(TICKET-017): wire usePowerSyncWorkout into log.tsx once TICKET-027 merges.

/**
 * usePowerSyncWorkout — reactive hook for today's (or any day's) workout + sets
 * read from the local PowerSync SQLite database.
 *
 * Data flow:
 *   PowerSync sync service → local SQLite (peak_fettle.db)
 *     → this hook (db.watch reactive query)
 *       → log.tsx UI (TICKET-017)
 *
 * The hook uses db.watch() which re-runs the query automatically whenever
 * the underlying table rows change — including when a new set is written
 * locally via the write path (Express API → PowerSync re-sync), giving
 * instant optimistic-style feedback once sync propagates.
 *
 * Returns:
 *   workout    — the Workout for dayKey belonging to the current user, or null
 *                if none exists yet.
 *   sets       — all WorkoutSet rows for that workout, ordered by set_index ASC.
 *   isLoading  — true on the initial query run before first results arrive.
 *   error      — any SQLite/PowerSync error that aborted the watch.
 *
 * Usage (in log.tsx after TICKET-017 adopts this hook):
 *   const { workout, sets, isLoading, error } = usePowerSyncWorkout('2026-05-04');
 */

import { useState, useEffect, useCallback } from 'react';

import { db } from '../db/powerSyncClient';
import { Workout, WorkoutSet, LiftSet, CardioSet } from '../types/api';
import { useAuth } from './useAuth';

// ---------------------------------------------------------------------------
// Raw DB row types — what SQLite returns before we cast to domain types.
// ---------------------------------------------------------------------------

interface WorkoutRow {
  id: string;
  user_id: string;
  day_key: string;
  notes: string | null;
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
  // lift columns
  reps: number | null;
  // TICKET-027: local SQLite stores weight_raw (INTEGER = kg × 8) to match
  // the Postgres sets.weight_raw SMALLINT column synced by PowerSync.
  // Decode: weight_raw / 8 → weight_kg (float) before returning to callers.
  weight_raw: number | null;
  weight_kg: number | null;  // REAL exact kg (v3); preferred over weight_raw
  rir: number | null;
  // TYPE-001 fix (2026-05-16): e1rm_kg dropped — column gone server-side.
  // cardio columns
  duration_sec: number | null;
  distance_m: number | null;
  avg_pace_sec_per_km: number | null;
  // shared
  logged_at: string;
}

// ---------------------------------------------------------------------------
// Row → domain type helpers
// ---------------------------------------------------------------------------

function rowToWorkout(row: WorkoutRow): Workout {
  return {
    id: row.id,
    user_id: row.user_id,
    day_key: row.day_key,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToSet(row: SetRow): WorkoutSet {
  if (row.kind === 'lift') {
    const liftSet: LiftSet = {
      id: row.id,
      workout_id: row.workout_id,
      user_id: row.user_id,
      exercise_id: row.exercise_id,
      kind: 'lift',
      set_index: row.set_index,
      reps: row.reps ?? 0,
      // Prefer the exact weight_kg (v3); fall back to legacy weight_raw/8.
      weight_kg: row.weight_kg != null ? row.weight_kg : (row.weight_raw != null ? row.weight_raw / 8 : 0),
      rir: row.rir,
      logged_at: row.logged_at,
    };
    return liftSet;
  }

  // Default to cardio for any non-lift kind.
  const cardioSet: CardioSet = {
    id: row.id,
    workout_id: row.workout_id,
    user_id: row.user_id,
    exercise_id: row.exercise_id,
    kind: 'cardio',
    set_index: row.set_index,
    duration_sec: row.duration_sec ?? 0,
    distance_m: row.distance_m,
    avg_pace_sec_per_km: row.avg_pace_sec_per_km,
    logged_at: row.logged_at,
  };
  return cardioSet;
}

// ---------------------------------------------------------------------------
// Hook return shape
// ---------------------------------------------------------------------------

export interface UsePowerSyncWorkoutResult {
  workout: Workout | null;
  sets: WorkoutSet[];
  isLoading: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePowerSyncWorkout(dayKey: string): UsePowerSyncWorkoutResult {
  const { user } = useAuth();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Stable userId reference so the effect deps stay clean.
  const userId = user?.id ?? null;

  const runQuery = useCallback(async () => {
    if (!userId) {
      // Not authenticated — clear state and wait.
      setWorkout(null);
      setSets([]);
      setIsLoading(false);
      return;
    }

    try {
      // Step 1: fetch the workout for this day + user.
      const workoutRows = await db.getAll<WorkoutRow>(
        'SELECT * FROM workouts WHERE day_key = ? AND user_id = ? LIMIT 1',
        [dayKey, userId]
      );

      const currentWorkout = workoutRows.length > 0 ? rowToWorkout(workoutRows[0]) : null;
      setWorkout(currentWorkout);

      // Step 2: fetch sets if a workout exists.
      if (currentWorkout) {
        const setRows = await db.getAll<SetRow>(
          'SELECT * FROM sets WHERE workout_id = ? ORDER BY set_index ASC',
          [currentWorkout.id]
        );
        setSets(setRows.map(rowToSet));
      } else {
        setSets([]);
      }

      setError(null);
    } catch (err: unknown) {
      const queryError = err instanceof Error ? err : new Error(String(err));
      console.error('[usePowerSyncWorkout] Query failed:', queryError);
      setError(queryError);
    } finally {
      setIsLoading(false);
    }
  }, [dayKey, userId]);

  useEffect(() => {
    // Set loading on key changes (new day or user switch).
    setIsLoading(true);

    // Initial fetch.
    void runQuery();

    // Watch both tables so any change to workouts or sets re-runs the query.
    // db.watch() returns an AsyncIterable that emits whenever the watched
    // tables are written to (by PowerSync sync or by a local write).
    const watchedTables = new Set(['workouts', 'sets']);
    let aborted = false;

    async function watchLoop(): Promise<void> {
      // db.watch returns an AsyncGenerator; we iterate it until cleanup.
      for await (const _update of db.watch(
        // We watch with a stable query that touches both tables.
        // The actual data is re-fetched via runQuery() for full control.
        'SELECT 1 FROM workouts UNION ALL SELECT 1 FROM sets',
        [],
        { tables: watchedTables }
      )) {
        if (aborted) break;
        void runQuery();
      }
    }

    void watchLoop();

    return () => {
      aborted = true;
    };
  }, [dayKey, userId, runQuery]);

  return { workout, sets, isLoading, error };
}
