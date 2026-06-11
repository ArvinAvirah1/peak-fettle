/**
 * exercisePrefs — per-exercise training preferences (founder spec 2026-06-10).
 *
 *   • warmup_enabled / warmup_sets — does the user want a warm-up ramp for this
 *     exercise, and how many sets (recommendations come from warmup.ts).
 *   • base_weight_kg — last-used bar/machine base weight (plate calculator
 *     defaults to it next time).
 *   • pulley_id — pulley configuration for cable machines ('1:1' | '2:1' |
 *     '1:2'), so switching gyms onto a different pulley still logs the correct
 *     effective load.
 *
 * Storage: on-device `exercise_prefs` table; in the backup registry.
 */

import { localDb } from '../db/localDb';

export interface ExercisePrefs {
  exercise_id: string;
  warmup_enabled: boolean;
  warmup_sets: number;
  base_weight_kg: number | null;
  pulley_id: string | null;
}

interface Row {
  exercise_id: string;
  warmup_enabled: number | null;
  warmup_sets: number | null;
  base_weight_kg: number | null;
  pulley_id: string | null;
}

export const DEFAULT_PREFS: Omit<ExercisePrefs, 'exercise_id'> = {
  warmup_enabled: false,
  warmup_sets: 3,
  base_weight_kg: null,
  pulley_id: null,
};

export async function getExercisePrefs(exerciseId: string): Promise<ExercisePrefs> {
  const row = await localDb.getFirst<Row>(
    `SELECT exercise_id, warmup_enabled, warmup_sets, base_weight_kg, pulley_id
       FROM exercise_prefs WHERE exercise_id = ?`,
    [exerciseId],
  );
  if (!row) return { exercise_id: exerciseId, ...DEFAULT_PREFS };
  return {
    exercise_id: row.exercise_id,
    warmup_enabled: (row.warmup_enabled ?? 0) === 1,
    warmup_sets: row.warmup_sets ?? DEFAULT_PREFS.warmup_sets,
    base_weight_kg: row.base_weight_kg,
    pulley_id: row.pulley_id,
  };
}

export async function setExercisePrefs(
  exerciseId: string,
  patch: Partial<Omit<ExercisePrefs, 'exercise_id'>>,
): Promise<void> {
  if (!exerciseId) return;
  const current = await getExercisePrefs(exerciseId);
  const next = { ...current, ...patch };
  await localDb.execute(
    `INSERT INTO exercise_prefs (exercise_id, warmup_enabled, warmup_sets, base_weight_kg, pulley_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET
       warmup_enabled = excluded.warmup_enabled,
       warmup_sets    = excluded.warmup_sets,
       base_weight_kg = excluded.base_weight_kg,
       pulley_id      = excluded.pulley_id,
       updated_at     = excluded.updated_at`,
    [
      exerciseId,
      next.warmup_enabled ? 1 : 0,
      next.warmup_sets,
      next.base_weight_kg,
      next.pulley_id,
      new Date().toISOString(),
    ],
    { tables: ['exercise_prefs'] },
  );
}
