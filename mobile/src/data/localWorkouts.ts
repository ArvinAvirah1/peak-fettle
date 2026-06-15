/**
 * localWorkouts — single source of truth for the on-device `workouts` row.
 *
 * Why this exists: Home mounts both useWorkout AND usePowerSyncLog (inside the
 * always-mounted WorkoutLoggerHost). Both used to "SELECT today's workout, INSERT
 * if missing" independently. With no UNIQUE constraint on day_key that is a
 * classic check-then-act race — on a cold start both SELECTs return empty and
 * both INSERT, producing TWO workout rows for the same day. Sets land in one; the
 * other shows up in Recent Activity as a duplicate "Today / 0 sets / No lifts
 * recorded". Routing both hooks through ensureLocalWorkoutForDay() — which uses a
 * single atomic `INSERT … WHERE NOT EXISTS` — collapses the race to one row.
 */

import { localDb, genId } from '../db/localDb';
import { Workout } from '../types/api';

interface WorkoutRow {
  id: string;
  user_id: string;
  day_key: string;
  notes: string | null;
  session_type: string | null;
  routine_name: string | null;
  created_at: string;
  updated_at: string;
}

function rowToWorkout(row: WorkoutRow): Workout {
  return {
    id: row.id,
    user_id: row.user_id,
    day_key: row.day_key,
    notes: row.notes,
    session_type: (row.session_type ?? null) as Workout['session_type'],
    routine_name: row.routine_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Get (or atomically create) the single local workout row for a given day.
 * Safe to call concurrently from multiple hooks — the conditional INSERT means
 * at most one row per day_key is ever created.
 */
export async function ensureLocalWorkoutForDay(
  dayKey: string,
  userId: string,
): Promise<Workout | null> {
  await localDb.init();
  const now = new Date().toISOString();
  // Atomic: only inserts when no row already exists for this day. Two racing
  // callers can both run this; the second sees the first's row and inserts
  // nothing. The id is generated unconditionally but discarded if unused.
  await localDb.execute(
    `INSERT INTO workouts (id, user_id, day_key, notes, session_type, routine_name, created_at, updated_at, synced)
     SELECT ?, ?, ?, NULL, NULL, NULL, ?, ?, 0
     WHERE NOT EXISTS (SELECT 1 FROM workouts WHERE day_key = ?)`,
    [genId(), userId, dayKey, now, now, dayKey],
    { tables: ['workouts'] },
  );
  const row = await localDb.getFirst<WorkoutRow>(
    'SELECT * FROM workouts WHERE day_key = ? ORDER BY created_at ASC LIMIT 1',
    [dayKey],
  );
  return row ? rowToWorkout(row) : null;
}

/**
 * Stamp a routine/template name onto the day's local workout so Recent Activity
 * can label it (e.g. "Leg Day 6/14/26"). Local-first equivalent of the Pro
 * server `createWorkout({ routineName })` link — no network. Best-effort.
 */
export async function stampLocalRoutineName(
  dayKey: string,
  routineName: string,
): Promise<void> {
  if (!routineName?.trim()) return;
  try {
    await localDb.init();
    await localDb.execute(
      `UPDATE workouts SET routine_name = ?, updated_at = ?
        WHERE day_key = ? AND (session_type IS NULL OR session_type != 'rest_day')`,
      [routineName.trim(), new Date().toISOString(), dayKey],
      { tables: ['workouts'] },
    );
  } catch {
    // best-effort — a failed label just leaves the date label as before
  }
}
