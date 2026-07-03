/**
 * routines — tier-branched data module for user-saved workout routines.
 *
 * Mirrors the pattern in src/hooks/useWorkout.ts:
 *   isLocalFirst(user) → CRUD the on-device SQLite `routines` table (localDb).
 *                        ids via genId(); `exercises` JSON.stringify'd into a
 *                        TEXT column; ISO-8601 dates.
 *   Pro (syncsToServer) → delegate to the existing REST module (src/api/routines).
 *
 * The exported Routine / RoutineExercise / CreateRoutinePayload shapes are
 * re-exported from src/api/routines so callers see an IDENTICAL type whichever
 * tier they're on (a free user's local routine is shape-compatible with a Pro
 * user's server routine — this is what lets the Routines UI be tier-agnostic).
 *
 * TICKET-094 / SPEC-094A: free users never touch personal REST endpoints.
 */

import { localDb, genId } from '../db/localDb';
import { isLocalFirst, TierUser } from '../data/backup/tierPolicy';
import {
  Routine,
  RoutineExercise,
  CreateRoutinePayload,
  getRoutines as apiGetRoutines,
  getRoutine as apiGetRoutine,
  createRoutine as apiCreateRoutine,
  updateRoutine as apiUpdateRoutine,
  patchRoutine as apiPatchRoutine,
  deleteRoutine as apiDeleteRoutine,
} from '../api/routines';
import { allowlistExercise } from './routineExerciseFields';

// Re-export the shared shapes so callers can import them from one place.
export type { Routine, RoutineExercise, CreateRoutinePayload };

// ---------------------------------------------------------------------------
// Local DB row type (mirrors CREATE_ROUTINES in localSchema.ts)
// ---------------------------------------------------------------------------

interface RoutineRow {
  id: string;
  user_id: string;
  name: string;
  exercises: string; // JSON TEXT
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Defensive parse of the JSON `exercises` TEXT column → RoutineExercise[].
 *
 * ALLOWLIST read (spec §0.1 choke point): every field — including the S2
 * superset/dropset fields — is explicitly picked, type/bounds-checked, and
 * dropped when garbage, via the pure `allowlistExercise` in routineExerciseFields.
 * NOT a blind passthrough (the DATA-01 import-injection guard depends on this).
 */
function parseExercises(raw: string | null | undefined): RoutineExercise[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e === 'object')
      .map((e) => allowlistExercise(e as Record<string, unknown>));
  } catch {
    return [];
  }
}

function rowToRoutine(row: RoutineRow): Routine {
  const now = new Date().toISOString();
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    exercises: parseExercises(row.exercises),
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  };
}

// ---------------------------------------------------------------------------
// CRUD — tier-branched
// ---------------------------------------------------------------------------

/** List all routines for the current user, newest-updated first. */
export async function listRoutines(user: TierUser | null | undefined): Promise<Routine[]> {
  if (isLocalFirst(user)) {
    await localDb.init();
    const rows = await localDb.getAll<RoutineRow>(
      'SELECT * FROM routines ORDER BY updated_at DESC, created_at DESC',
    );
    return rows.map(rowToRoutine);
  }
  return apiGetRoutines();
}

/** Fetch a single routine by id. */
export async function getRoutine(
  user: TierUser | null | undefined,
  id: string,
): Promise<Routine> {
  if (isLocalFirst(user)) {
    await localDb.init();
    const row = await localDb.getFirst<RoutineRow>(
      'SELECT * FROM routines WHERE id = ?',
      [id],
    );
    if (!row) throw new Error('Routine not found');
    return rowToRoutine(row);
  }
  return apiGetRoutine(id);
}

/** Create a new routine. */
export async function createRoutine(
  user: TierUser | null | undefined,
  payload: CreateRoutinePayload,
  userId: string,
): Promise<Routine> {
  if (isLocalFirst(user)) {
    await localDb.init();
    const id = genId();
    const now = new Date().toISOString();
    const exercisesJson = JSON.stringify(payload.exercises ?? []);
    await localDb.execute(
      `INSERT INTO routines (id, user_id, name, exercises, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, payload.name, exercisesJson, now, now],
      { tables: ['routines'] },
    );
    return {
      id,
      user_id: userId,
      name: payload.name,
      exercises: payload.exercises ?? [],
      created_at: now,
      updated_at: now,
    };
  }
  return apiCreateRoutine(payload);
}

/** Replace a routine (full update of name + exercises). */
export async function updateRoutine(
  user: TierUser | null | undefined,
  id: string,
  payload: CreateRoutinePayload,
): Promise<Routine> {
  if (isLocalFirst(user)) {
    await localDb.init();
    const now = new Date().toISOString();
    const exercisesJson = JSON.stringify(payload.exercises ?? []);
    await localDb.execute(
      `UPDATE routines SET name = ?, exercises = ?, updated_at = ? WHERE id = ?`,
      [payload.name, exercisesJson, now, id],
      { tables: ['routines'] },
    );
    const row = await localDb.getFirst<RoutineRow>(
      'SELECT * FROM routines WHERE id = ?',
      [id],
    );
    if (!row) throw new Error('Routine not found after update');
    return rowToRoutine(row);
  }
  return apiUpdateRoutine(id, payload);
}

/** Partially update a routine (name only, exercises only, or both). */
export async function patchRoutine(
  user: TierUser | null | undefined,
  id: string,
  patch: Partial<CreateRoutinePayload>,
): Promise<Routine> {
  if (isLocalFirst(user)) {
    await localDb.init();
    const existing = await localDb.getFirst<RoutineRow>(
      'SELECT * FROM routines WHERE id = ?',
      [id],
    );
    if (!existing) throw new Error('Routine not found');
    const merged = rowToRoutine(existing);
    const name = patch.name ?? merged.name;
    const exercises = patch.exercises ?? merged.exercises;
    return updateRoutine(user, id, { name, exercises });
  }
  return apiPatchRoutine(id, patch);
}

/** Delete a routine. */
export async function deleteRoutine(
  user: TierUser | null | undefined,
  id: string,
): Promise<void> {
  if (isLocalFirst(user)) {
    await localDb.init();
    await localDb.execute('DELETE FROM routines WHERE id = ?', [id], {
      tables: ['routines'],
    });
    return;
  }
  return apiDeleteRoutine(id);
}

/**
 * Duplicate a routine (option 6: one-tap copy). Appends " (Copy)" to the name
 * and writes a brand-new routine; the source is left untouched. Works for both
 * tiers via createRoutine().
 */
export async function duplicateRoutine(
  user: TierUser | null | undefined,
  source: Pick<Routine, 'name' | 'exercises'>,
  userId: string,
): Promise<Routine> {
  return createRoutine(
    user,
    { name: `${source.name} (Copy)`, exercises: source.exercises ?? [] },
    userId,
  );
}

// ---------------------------------------------------------------------------
// Last-performed — best-effort (option 5)
// ---------------------------------------------------------------------------

/**
 * Best-effort "last performed" date per routine, for the card subtitle.
 *
 * There is no hard routine_id → workout link in the local schema (workouts only
 * carry `session_type` / `routine_name` / `notes`). So for local-first users we
 * match a routine by its name appearing in a workout's `session_type` — the
 * value the stepper stamps when a routine workout is started. Anything we can't
 * match is simply omitted (the card hides the line). Pro users get an empty map
 * here because the server routine list does not return last-performed; the UI
 * degrades the same way (line hidden) rather than issuing extra REST calls.
 *
 * Performance: this runs ONE grouped query — `SELECT session_type,
 * MAX(created_at) … GROUP BY session_type`, backed by `idx_workouts_session_type`
 * — producing at most one row per distinct session_type. The previous version
 * pulled every workout row and did an O(routines × workouts) JS `find` scan; this
 * is O(distinctSessionTypes) to build a name→date lookup, then O(routines) to map.
 *
 * @returns Map of routineId → ISO date string of the most recent session.
 */
export async function getLastPerformedMap(
  user: TierUser | null | undefined,
  routines: Routine[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!isLocalFirst(user) || routines.length === 0) return out;
  try {
    await localDb.init();
    // One grouped pass: the most-recent session per session_type. The GROUP BY
    // is served by idx_workouts_session_type, and we get at most one row per
    // distinct label rather than the whole workouts table.
    const rows = await localDb.getAll<{ session_type: string | null; last_at: string | null }>(
      `SELECT session_type, MAX(created_at) AS last_at
         FROM workouts
        WHERE session_type IS NOT NULL AND session_type != ''
        GROUP BY session_type`,
    );
    // name (lower-cased) → newest ISO date, keeping the max if two labels collide
    // after normalisation.
    const byName = new Map<string, string>();
    for (const r of rows) {
      const key = (r.session_type ?? '').trim().toLowerCase();
      const at = r.last_at;
      if (!key || !at) continue;
      const prev = byName.get(key);
      if (!prev || at > prev) byName.set(key, at);
    }
    for (const r of routines) {
      const at = byName.get(r.name.trim().toLowerCase());
      if (at) out.set(r.id, at);
    }
  } catch {
    // best-effort — never throw to the UI
  }
  return out;
}
