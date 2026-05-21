/**
 * useWorkoutSession
 *
 * Manages today's workout — creating it, logging sets, and reading back what
 * has been logged so far.  All writes go directly to local SQLite via
 * PowerSync and are queued for upload; everything works fully offline.
 *
 * Schema reference: migrations/20260430_initial_schema.sql
 *
 * Design notes:
 *  - One `workouts` row per calendar day per user (UNIQUE user_id, day_key).
 *  - Sets always carry an `exercise_id` (required by server constraint).
 *    The UI must let the user search and pick from the local `exercises` table.
 *  - Weight is always stored in kg; the UI layer handles unit conversion.
 *  - Effort is stored as RIR (Reps In Reserve). RPE is legacy / read-only.
 */

import { useCallback } from 'react';
import { useDB, useQuery } from '@/lib/db/system';
import { generateId } from '@/lib/db/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Workout {
  id: string;
  user_id: string;
  day_key: string;        // "YYYY-MM-DD"
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkoutSet {
  id: string;
  workout_id: string;
  user_id: string;
  exercise_id: string;
  kind: 'lift' | 'cardio';
  set_index: number;

  // Lift (null for cardio)
  reps: number | null;
  weight_kg: number | null;
  rir: number | null;      // -1 = not recorded, 0 = to failure

  // Cardio (null for lift)
  duration_sec: number | null;
  distance_m: number | null;
  avg_pace_sec_per_km: number | null;

  logged_at: string;
}

export interface ExerciseRow {
  id: string;
  name: string;
  category: string;
  muscle_groups: string;   // JSON string, parse with JSON.parse()
  is_compound: number;
  contraindications: string; // JSON string
}

export type LogLiftInput = {
  exercise_id: string;
  reps: number;
  weight_kg: number;       // 0 for bodyweight
  rir?: number;            // defaults to -1 (not recorded)
};

export type LogCardioInput = {
  exercise_id: string;
  duration_sec: number;
  distance_m?: number;
  avg_pace_sec_per_km?: number;
};

// ---------------------------------------------------------------------------
// Today's key
// ---------------------------------------------------------------------------

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param dayKey  ISO date string — defaults to today.
 *                Pass a past date to review a previous session read-only.
 */
export function useWorkoutSession(dayKey: string = todayKey()) {
  const db = useDB();

  // -----------------------------------------------------------------------
  // Reactive queries
  // -----------------------------------------------------------------------

  const { data: workoutRows, isLoading: workoutLoading } = useQuery<Workout>(
    'SELECT * FROM workouts WHERE day_key = ? LIMIT 1',
    [dayKey]
  );
  const workout = workoutRows[0] ?? null;

  const { data: sets, isLoading: setsLoading } = useQuery<WorkoutSet>(
    workout
      ? 'SELECT * FROM sets WHERE workout_id = ? ORDER BY set_index ASC'
      : 'SELECT * FROM sets WHERE 1=0',
    workout ? [workout.id] : []
  );

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  /**
   * Ensure a workout row exists for this day. Idempotent — calling twice is safe.
   * Returns the workout id.
   */
  const ensureWorkout = useCallback(async (): Promise<string> => {
    if (workout) return workout.id;

    const id = generateId();
    const now = new Date().toISOString();

    // PowerSync will route this INSERT to Supabase via uploadData().
    // The server has UNIQUE(user_id, day_key) so a race between two devices
    // for the same day produces a conflict which Supabase resolves to a
    // single row; PowerSync merges it back down on next sync.
    await db.execute(
      `INSERT OR IGNORE INTO workouts (id, user_id, day_key, notes, created_at, updated_at)
       VALUES (?, (SELECT current_setting('request.jwt.claim.sub', true)), ?, NULL, ?, ?)`,
      [id, dayKey, now, now]
    );

    return id;
  }, [db, workout, dayKey]);

  /**
   * Log a lift set.
   * Automatically assigns set_index = max existing + 1.
   */
  const logLift = useCallback(
    async (input: LogLiftInput): Promise<string> => {
      const workoutId = await ensureWorkout();
      const setId = generateId();
      const now = new Date().toISOString();

      const res = await db.execute(
        'SELECT COALESCE(MAX(set_index), -1) + 1 AS next_idx FROM sets WHERE workout_id = ?',
        [workoutId]
      );
      const nextIdx: number = res.rows._array[0]?.next_idx ?? 0;

      await db.execute(
        `INSERT INTO sets
           (id, workout_id, user_id, exercise_id, kind, set_index,
            reps, weight_kg, rir, rpe, logged_at)
         VALUES (?, ?, (SELECT current_setting('request.jwt.claim.sub', true)),
                 ?, 'lift', ?, ?, ?, ?, -1, ?)`,
        [
          setId,
          workoutId,
          input.exercise_id,
          nextIdx,
          input.reps,
          input.weight_kg,
          input.rir ?? -1,
          now,
        ]
      );

      return setId;
    },
    [db, ensureWorkout]
  );

  /**
   * Log a cardio set (run, cycle, swim, etc.).
   */
  const logCardio = useCallback(
    async (input: LogCardioInput): Promise<string> => {
      const workoutId = await ensureWorkout();
      const setId = generateId();
      const now = new Date().toISOString();

      const res = await db.execute(
        'SELECT COALESCE(MAX(set_index), -1) + 1 AS next_idx FROM sets WHERE workout_id = ?',
        [workoutId]
      );
      const nextIdx: number = res.rows._array[0]?.next_idx ?? 0;

      await db.execute(
        `INSERT INTO sets
           (id, workout_id, user_id, exercise_id, kind, set_index,
            duration_sec, distance_m, avg_pace_sec_per_km, logged_at)
         VALUES (?, ?, (SELECT current_setting('request.jwt.claim.sub', true)),
                 ?, 'cardio', ?, ?, ?, ?, ?)`,
        [
          setId,
          workoutId,
          input.exercise_id,
          nextIdx,
          input.duration_sec,
          input.distance_m ?? null,
          input.avg_pace_sec_per_km ?? null,
          now,
        ]
      );

      return setId;
    },
    [db, ensureWorkout]
  );

  /**
   * Edit a set that has already been logged (e.g. user corrects reps).
   */
  const updateSet = useCallback(
    async (
      setId: string,
      patch: Partial<Pick<WorkoutSet, 'reps' | 'weight_kg' | 'rir' | 'duration_sec' | 'distance_m'>>
    ): Promise<void> => {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (patch.reps !== undefined)         { fields.push('reps = ?');         values.push(patch.reps); }
      if (patch.weight_kg !== undefined)    { fields.push('weight_kg = ?');    values.push(patch.weight_kg); }
      if (patch.rir !== undefined)          { fields.push('rir = ?');          values.push(patch.rir); }
      if (patch.duration_sec !== undefined) { fields.push('duration_sec = ?'); values.push(patch.duration_sec); }
      if (patch.distance_m !== undefined)   { fields.push('distance_m = ?');   values.push(patch.distance_m); }

      if (fields.length === 0) return;
      values.push(setId);

      await db.execute(
        `UPDATE sets SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    },
    [db]
  );

  /**
   * Delete a set and re-index the remaining sets for the same workout.
   */
  const deleteSet = useCallback(
    async (setId: string): Promise<void> => {
      if (!workout) return;

      const res = await db.execute(
        'SELECT set_index FROM sets WHERE id = ?',
        [setId]
      );
      const deletedIdx: number = res.rows._array[0]?.set_index;
      if (deletedIdx === undefined) return;

      await db.execute('DELETE FROM sets WHERE id = ?', [setId]);

      // Shift later indices down by 1
      await db.execute(
        'UPDATE sets SET set_index = set_index - 1 WHERE workout_id = ? AND set_index > ?',
        [workout.id, deletedIdx]
      );
    },
    [db, workout]
  );

  /**
   * Save notes for the day's workout.
   */
  const saveNotes = useCallback(
    async (notes: string): Promise<void> => {
      const workoutId = await ensureWorkout();
      const now = new Date().toISOString();
      await db.execute(
        'UPDATE workouts SET notes = ?, updated_at = ? WHERE id = ?',
        [notes, now, workoutId]
      );
    },
    [db, ensureWorkout]
  );

  // -----------------------------------------------------------------------
  // Exercise search (searches local SQLite — works offline)
  // -----------------------------------------------------------------------
  const searchExercises = useCallback(
    async (query: string): Promise<ExerciseRow[]> => {
      const like = `%${query}%`;
      const res = await db.execute(
        `SELECT e.* FROM exercises e
         WHERE e.name LIKE ?
         UNION
         SELECT e.* FROM exercises e
         JOIN exercise_aliases ea ON ea.exercise_id = e.id
         WHERE ea.alias LIKE ?
         ORDER BY name
         LIMIT 30`,
        [like, like]
      );
      return res.rows._array as ExerciseRow[];
    },
    [db]
  );

  return {
    workout,
    sets,
    isLoading: workoutLoading || setsLoading,
    // Mutations
    logLift,
    logCardio,
    updateSet,
    deleteSet,
    saveNotes,
    // Utilities
    searchExercises,
  };
}
