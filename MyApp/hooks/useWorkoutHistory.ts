/**
 * useWorkoutHistory
 *
 * Reads completed workouts and their sets from local SQLite.
 * Works fully offline — data is reactive and re-renders whenever PowerSync
 * syncs new rows (e.g. from another device).
 *
 * Schema reference: migrations/20260430_initial_schema.sql
 */

import { useMemo } from 'react';
import { useQuery } from '@/lib/db/system';
import { Workout, WorkoutSet } from './useWorkoutSession';
import { estimateOneRepMax } from '@/lib/db/utils';

// ---------------------------------------------------------------------------
// Recent workout list
// ---------------------------------------------------------------------------

export function useWorkoutHistory(limit = 50) {
  const { data: workouts, isLoading } = useQuery<Workout>(
    `SELECT * FROM workouts
     ORDER BY day_key DESC
     LIMIT ?`,
    [limit]
  );

  return { workouts, isLoading };
}

// ---------------------------------------------------------------------------
// Single workout detail
// ---------------------------------------------------------------------------

interface SetWithExercise extends WorkoutSet {
  exercise_name: string;
  exercise_category: string;
}

export function useWorkoutDetail(workoutId: string) {
  const { data: workoutRows, isLoading: wLoading } = useQuery<Workout>(
    'SELECT * FROM workouts WHERE id = ? LIMIT 1',
    [workoutId]
  );

  const { data: sets, isLoading: sLoading } = useQuery<SetWithExercise>(
    `SELECT s.*, e.name AS exercise_name, e.category AS exercise_category
     FROM sets s
     JOIN exercises e ON s.exercise_id = e.id
     WHERE s.workout_id = ?
     ORDER BY s.set_index ASC`,
    [workoutId]
  );

  // Group sets by exercise for display
  const setsByExercise = useMemo(() => {
    const grouped: Record<string, SetWithExercise[]> = {};
    for (const s of sets) {
      if (!grouped[s.exercise_name]) grouped[s.exercise_name] = [];
      grouped[s.exercise_name].push(s);
    }
    return grouped;
  }, [sets]);

  return {
    workout: workoutRows[0] ?? null,
    sets,
    setsByExercise,
    isLoading: wLoading || sLoading,
  };
}

// ---------------------------------------------------------------------------
// Per-exercise history
// ---------------------------------------------------------------------------

export interface PersonalRecord {
  exerciseName: string;
  exerciseId: string;
  maxWeightKg: number;
  maxReps: number;
  estimatedOneRepMaxKg: number;
  achievedOn: string; // ISO date "YYYY-MM-DD"
}

interface SetWithDay extends WorkoutSet {
  day_key: string;
  exercise_name: string;
}

export function useExerciseHistory(exerciseId: string, limit = 60) {
  const { data: sets, isLoading } = useQuery<SetWithDay>(
    `SELECT s.*, w.day_key, e.name AS exercise_name
     FROM sets s
     JOIN workouts w ON s.workout_id = w.id
     JOIN exercises e ON s.exercise_id = e.id
     WHERE s.exercise_id = ?
       AND s.kind = 'lift'
     ORDER BY w.day_key DESC, s.set_index ASC
     LIMIT ?`,
    [exerciseId, limit]
  );

  const personalRecord = useMemo<PersonalRecord | null>(() => {
    if (sets.length === 0) return null;

    let best = sets[0];
    let bestE1RM = estimateOneRepMax(best.weight_kg ?? 0, best.reps ?? 1);

    for (const s of sets) {
      const e1rm = estimateOneRepMax(s.weight_kg ?? 0, s.reps ?? 1);
      if (e1rm > bestE1RM) {
        bestE1RM = e1rm;
        best = s;
      }
    }

    return {
      exerciseName: best.exercise_name,
      exerciseId: best.exercise_id,
      maxWeightKg: best.weight_kg ?? 0,
      maxReps: best.reps ?? 0,
      estimatedOneRepMaxKg: bestE1RM,
      achievedOn: best.day_key,
    };
  }, [sets]);

  return { sets, personalRecord, isLoading };
}

// ---------------------------------------------------------------------------
// Weekly volume (for progress chart)
// ---------------------------------------------------------------------------

interface WeeklyVolume {
  week: string;            // ISO date of Monday for that week
  totalSets: number;
  totalReps: number;
  totalVolumeKg: number;  // sum(weight_kg * reps) — working sets only
}

/**
 * @param exerciseId  Optional — if provided, scopes to one exercise.
 * @param weeks       How many past weeks to return.
 */
export function useWeeklyVolume(exerciseId?: string, weeks = 12) {
  const exerciseClause = exerciseId
    ? `AND s.exercise_id = '${exerciseId.replace(/'/g, "''")}'`
    : '';

  const { data, isLoading } = useQuery<WeeklyVolume>(
    `SELECT
       strftime('%Y-%m-%d', w.day_key, 'weekday 0', '-6 days') AS week,
       COUNT(*)                          AS totalSets,
       SUM(s.reps)                       AS totalReps,
       SUM(s.weight_kg * s.reps)         AS totalVolumeKg
     FROM sets s
     JOIN workouts w ON s.workout_id = w.id
     WHERE s.kind = 'lift'
       AND s.rir <> 0          -- exclude to-failure sets from volume calc
       ${exerciseClause}
     GROUP BY week
     ORDER BY week DESC
     LIMIT ?`,
    [weeks]
  );

  return { volumeByWeek: data, isLoading };
}
