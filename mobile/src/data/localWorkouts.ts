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
 *
 * 2026-07-14 (outage postmortem):
 *   • All day-row reads/writes are now scoped by user_id — the old day_key-only
 *     match attached one account's sets to another account's workout row after
 *     a sign-out/sign-in on the same device.
 *   • adoptServerWorkout() re-points sets + queued outbox uploads from a stale
 *     local-only workout id to the server's id for the same day. Needed because
 *     a Pro user who logs while the server is unreachable writes under a local
 *     id the server has never seen; without adoption those sets vanish from the
 *     day view (which filters by the server id) and their queued uploads 403
 *     forever.
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
 * Claim any legacy day rows written before user scoping existed (user_id NULL
 * or '') for the current user, so the scoped queries below can see them.
 * No-op when userId is empty.
 */
async function adoptLegacyRows(dayKey: string, userId: string): Promise<void> {
  if (!userId) return;
  await localDb.execute(
    `UPDATE workouts SET user_id = ?
      WHERE day_key = ? AND (user_id IS NULL OR user_id = '')`,
    [userId, dayKey],
    { tables: ['workouts'] },
  );
}

/**
 * Get (or atomically create) the single local workout row for a given day and
 * user. Safe to call concurrently from multiple hooks — the conditional INSERT
 * means at most one row per (day_key, user_id) is ever created.
 */
export async function ensureLocalWorkoutForDay(
  dayKey: string,
  userId: string,
): Promise<Workout | null> {
  await localDb.init();
  await adoptLegacyRows(dayKey, userId);
  const now = new Date().toISOString();
  // Atomic: only inserts when no row already exists for this day + user. Two
  // racing callers can both run this; the second sees the first's row and
  // inserts nothing. The id is generated unconditionally but discarded if unused.
  await localDb.execute(
    `INSERT INTO workouts (id, user_id, day_key, notes, session_type, routine_name, created_at, updated_at, synced)
     SELECT ?, ?, ?, NULL, NULL, NULL, ?, ?, 0
     WHERE NOT EXISTS (SELECT 1 FROM workouts WHERE day_key = ? AND user_id = ?)`,
    [genId(), userId, dayKey, now, now, dayKey, userId],
    { tables: ['workouts'] },
  );
  const row = await localDb.getFirst<WorkoutRow>(
    'SELECT * FROM workouts WHERE day_key = ? AND user_id = ? ORDER BY created_at ASC LIMIT 1',
    [dayKey, userId],
  );
  return row ? rowToWorkout(row) : null;
}

/**
 * Read (never create) the local workout row for a day + user. Used by the Pro
 * offline fallback so a failed REST init can reuse a cached day row without
 * minting a local-only id the server has never seen.
 */
export async function getLocalWorkoutForDay(
  dayKey: string,
  userId: string,
): Promise<Workout | null> {
  await localDb.init();
  await adoptLegacyRows(dayKey, userId);
  const row = await localDb.getFirst<WorkoutRow>(
    'SELECT * FROM workouts WHERE day_key = ? AND user_id = ? ORDER BY created_at ASC LIMIT 1',
    [dayKey, userId],
  );
  return row ? rowToWorkout(row) : null;
}

/**
 * Adopt a server workout in place of a stale LOCAL-ONLY workout row for the
 * same day (outage recovery):
 *   1. re-point every set from the local id to the server id (they were
 *      invisible to the day view and unsyncable while parked on the local id),
 *   2. rewrite queued outbox insert payloads that still reference the local id,
 *   3. mirror the server row into local SQLite,
 *   4. drop the stale local row.
 *
 * Idempotent — adopting an already-adopted id is a no-op. Callers: the Pro
 * workout init (usePowerSyncLog) for today, and syncEngine's flush recovery
 * for past days.
 */
export async function adoptServerWorkout(
  oldLocalId: string,
  server: Workout,
): Promise<void> {
  await localDb.init();

  if (oldLocalId !== server.id) {
    // 1. Re-point sets (synced or not — nothing should stay on the dead id).
    await localDb.execute(
      'UPDATE sets SET workout_id = ? WHERE workout_id = ?',
      [server.id, oldLocalId],
      { tables: ['sets'] },
    );

    // 2. Rewrite queued uploads that still carry the stale id. Rows whose
    // payload fails to parse are left untouched (flush() will surface them).
    const pending = await localDb.getAll<{ id: number; payload: string | null }>(
      "SELECT id, payload FROM outbox WHERE op = 'insert_set'",
    );
    for (const row of pending) {
      if (!row.payload) continue;
      try {
        const parsed = JSON.parse(row.payload) as { workoutId?: string };
        if (parsed.workoutId !== oldLocalId) continue;
        parsed.workoutId = server.id;
        await localDb.execute(
          'UPDATE outbox SET payload = ? WHERE id = ?',
          [JSON.stringify(parsed), row.id],
          { tables: ['outbox'] },
        );
      } catch {
        // unparseable payload — leave for flush() to report via last_error
      }
    }
  }

  // 3. Mirror the server row locally (synced=1) so offline reads work.
  await localDb.execute(
    `INSERT OR REPLACE INTO workouts
       (id, user_id, day_key, notes, session_type, routine_name, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      server.id,
      server.user_id,
      server.day_key,
      server.notes ?? null,
      server.session_type ?? null,
      server.routine_name ?? null,
      server.created_at,
      server.updated_at,
    ],
    { tables: ['workouts'] },
  );

  // 4. Drop the stale local row now that nothing references it.
  if (oldLocalId !== server.id) {
    await localDb.execute('DELETE FROM workouts WHERE id = ?', [oldLocalId], {
      tables: ['workouts'],
    });
  }
}

/**
 * Stamp a routine/template name onto the day's local workout so Recent Activity
 * can label it (e.g. "Leg Day 6/14/26"). Local-first equivalent of the Pro
 * server `createWorkout({ routineName })` link — no network. Best-effort.
 * Pass userId where available so multi-account devices stamp the right row.
 */
export async function stampLocalRoutineName(
  dayKey: string,
  routineName: string,
  userId?: string,
): Promise<void> {
  if (!routineName?.trim()) return;
  try {
    await localDb.init();
    const userClause = userId ? ' AND user_id = ?' : '';
    const params: unknown[] = [routineName.trim(), new Date().toISOString(), dayKey];
    if (userId) params.push(userId);
    await localDb.execute(
      `UPDATE workouts SET routine_name = ?, updated_at = ?
        WHERE day_key = ? AND (session_type IS NULL OR session_type != 'rest_day')${userClause}`,
      params,
      { tables: ['workouts'] },
    );
  } catch {
    // best-effort — a failed label just leaves the date label as before
  }
}
