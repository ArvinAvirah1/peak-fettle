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
 *   • autoreg_muted (TICKET-141) — per-exercise opt-out for the in-session
 *     autoregulation suggestion strip. The global `autoreg_suggestions_enabled`
 *     flag (appSettings.ts) gates the feature entirely; this column lets a
 *     user additionally silence it for ONE exercise (e.g. a movement they
 *     always want to freestyle) without turning the feature off everywhere.
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
  /** TICKET-141: true = suggestion strip is hidden for this exercise. */
  autoreg_muted: boolean;
}

interface Row {
  exercise_id: string;
  warmup_enabled: number | null;
  warmup_sets: number | null;
  base_weight_kg: number | null;
  pulley_id: string | null;
  autoreg_muted: number | null;
}

export const DEFAULT_PREFS: Omit<ExercisePrefs, 'exercise_id'> = {
  warmup_enabled: false,
  warmup_sets: 3,
  base_weight_kg: null,
  pulley_id: null,
  autoreg_muted: false,
};

export async function getExercisePrefs(exerciseId: string): Promise<ExercisePrefs> {
  const row = await localDb.getFirst<Row>(
    `SELECT exercise_id, warmup_enabled, warmup_sets, base_weight_kg, pulley_id, autoreg_muted
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
    autoreg_muted: (row.autoreg_muted ?? 0) === 1,
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
    `INSERT INTO exercise_prefs (exercise_id, warmup_enabled, warmup_sets, base_weight_kg, pulley_id, autoreg_muted, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET
       warmup_enabled = excluded.warmup_enabled,
       warmup_sets    = excluded.warmup_sets,
       base_weight_kg = excluded.base_weight_kg,
       pulley_id      = excluded.pulley_id,
       autoreg_muted  = excluded.autoreg_muted,
       updated_at     = excluded.updated_at`,
    [
      exerciseId,
      next.warmup_enabled ? 1 : 0,
      next.warmup_sets,
      next.base_weight_kg,
      next.pulley_id,
      next.autoreg_muted ? 1 : 0,
      new Date().toISOString(),
    ],
    { tables: ['exercise_prefs'] },
  );
}

/**
 * TICKET-141 convenience: read just the mute flag for one exercise without
 * pulling the whole prefs row's shape into the caller. Defaults to false
 * (not muted) on any read failure — the strip should show unless explicitly
 * silenced by the user.
 */
export async function isAutoregMuted(exerciseId: string): Promise<boolean> {
  if (!exerciseId) return false;
  try {
    const prefs = await getExercisePrefs(exerciseId);
    return prefs.autoreg_muted;
  } catch {
    return false;
  }
}

/** TICKET-141 convenience: mute/unmute autoregulation suggestions for one exercise. */
export async function setAutoregMuted(exerciseId: string, muted: boolean): Promise<void> {
  if (!exerciseId) return;
  await setExercisePrefs(exerciseId, { autoreg_muted: muted });
}
