/**
 * exerciseGoals — WIDGET-002 (founder 2026-06-11): per-exercise weight x rep
 * goals the user can set for ANY exercise.
 *
 * Model (founder decision): ONE active goal per exercise, a single combined
 * target — e.g. "Bench 100 kg x 5". The goal is achieved when a single logged
 * lift set meets BOTH targets (weight_kg >= target AND reps >= target).
 *
 * Storage: on-device `exercise_goals` table (local-first, like exercise_prefs);
 * registered in the TICKET-094 backup so goals round-trip through manual
 * export/import. Weights use the same kg convention as sets.weight_kg.
 *
 * "Goals achieved this week" (Home/widget stat) = goals whose achieved_at is
 * within the last 7 days — the same window the PRs-this-week stat uses.
 */

import { localDb } from '../db/localDb';

export interface ExerciseGoal {
  exercise_id: string;
  /** Denormalized display name (exercise library is server-side). */
  exercise_name: string | null;
  target_weight_kg: number;
  target_reps: number;
  created_at: string | null;
  achieved_at: string | null;
  achieved_set_id: string | null;
}

const COLS =
  'exercise_id, exercise_name, target_weight_kg, target_reps, created_at, achieved_at, achieved_set_id';

export async function getExerciseGoal(exerciseId: string): Promise<ExerciseGoal | null> {
  if (!exerciseId) return null;
  const row = await localDb.getFirst<ExerciseGoal>(
    `SELECT ${COLS} FROM exercise_goals WHERE exercise_id = ?`,
    [exerciseId],
  );
  return row ?? null;
}

export async function getAllExerciseGoals(): Promise<ExerciseGoal[]> {
  return localDb.getAll<ExerciseGoal>(
    `SELECT ${COLS} FROM exercise_goals ORDER BY created_at DESC`,
  );
}

/**
 * Create or replace the goal for an exercise. Setting a new target clears any
 * previous achievement (it's a fresh goal).
 */
export async function setExerciseGoal(
  exerciseId: string,
  targetWeightKg: number,
  targetReps: number,
  exerciseName?: string | null,
): Promise<void> {
  if (!exerciseId) return;
  if (!Number.isFinite(targetWeightKg) || targetWeightKg <= 0) return;
  if (!Number.isInteger(targetReps) || targetReps <= 0) return;
  await localDb.execute(
    `INSERT INTO exercise_goals (${COLS})
     VALUES (?, ?, ?, ?, ?, NULL, NULL)
     ON CONFLICT(exercise_id) DO UPDATE SET
       exercise_name    = excluded.exercise_name,
       target_weight_kg = excluded.target_weight_kg,
       target_reps      = excluded.target_reps,
       created_at       = excluded.created_at,
       achieved_at      = NULL,
       achieved_set_id  = NULL`,
    [exerciseId, exerciseName ?? null, targetWeightKg, targetReps, new Date().toISOString()],
    { tables: ['exercise_goals'] },
  );
}

export async function clearExerciseGoal(exerciseId: string): Promise<void> {
  if (!exerciseId) return;
  await localDb.execute(
    'DELETE FROM exercise_goals WHERE exercise_id = ?',
    [exerciseId],
    { tables: ['exercise_goals'] },
  );
}

/**
 * Called after a lift set is logged. If the exercise has an unachieved goal
 * and this set meets BOTH targets, mark it achieved and return the goal
 * (so the caller can celebrate). Returns null otherwise. Never throws.
 */
export async function checkGoalAchieved(
  exerciseId: string,
  weightKg: number,
  reps: number,
  setId: string | null = null,
): Promise<ExerciseGoal | null> {
  try {
    const goal = await getExerciseGoal(exerciseId);
    if (!goal || goal.achieved_at) return null;
    if (weightKg < goal.target_weight_kg || reps < goal.target_reps) return null;
    const achievedAt = new Date().toISOString();
    await localDb.execute(
      `UPDATE exercise_goals SET achieved_at = ?, achieved_set_id = ?
       WHERE exercise_id = ? AND achieved_at IS NULL`,
      [achievedAt, setId, exerciseId],
      { tables: ['exercise_goals'] },
    );
    return { ...goal, achieved_at: achievedAt, achieved_set_id: setId };
  } catch {
    return null;
  }
}

/** Count of goals achieved in the trailing 7 days (the "this week" stat). */
export async function countGoalsAchievedThisWeek(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const row = await localDb.getFirst<{ n: number }>(
    'SELECT COUNT(*) AS n FROM exercise_goals WHERE achieved_at IS NOT NULL AND achieved_at >= ?',
    [cutoff],
  );
  return row?.n ?? 0;
}

/** Count of goals not yet achieved (for "active goals" displays). */
export async function countActiveGoals(): Promise<number> {
  const row = await localDb.getFirst<{ n: number }>(
    'SELECT COUNT(*) AS n FROM exercise_goals WHERE achieved_at IS NULL',
  );
  return row?.n ?? 0;
}
