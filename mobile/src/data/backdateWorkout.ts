/**
 * backdateWorkout — log a workout for a PAST date, both tiers (2026-07-14).
 *
 * Use case: the user trained without their phone (forgot it, or deliberately
 * stayed off it) and wants the session in their history after the fact.
 *
 * Tier policy (mirrors data/routines.ts):
 *   isLocalFirst(user) → everything on-device: the day's `workouts` row via the
 *                        user-scoped atomic ensureLocalWorkoutForDay(), then one
 *                        local `sets` INSERT per entry with logged_at set to the
 *                        chosen day (noon local — an unambiguous mid-day stamp).
 *                        NO network (local-first invariant).
 *   Pro (syncsToServer) → POST /workouts with the past dayKey (the server is
 *                        already idempotent on user_id+day_key and accepts any
 *                        YYYY-MM-DD), then POST /sets with `loggedAt` so weekly
 *                        volume / PR timestamps reflect the real training day.
 *                        Rows are also mirrored into local SQLite (synced=1),
 *                        matching how usePowerSyncLog mirrors live sessions.
 *
 * Partial-failure contract (Pro): sets upload sequentially; if any POST fails,
 * the successfully-uploaded sets stay on the server and a BackdateError is
 * thrown carrying the failure count so the screen can tell the user exactly
 * what happened (re-saving the same day is safe — the workout upserts, and
 * re-entered sets simply append with fresh ids, so the user retries only the
 * sets that were reported as failed).
 */

import { localDb, genId } from '../db/localDb';
import { isLocalFirst, TierUser } from './backup/tierPolicy';
import {
  ensureLocalWorkoutForDay,
  stampLocalRoutineName,
} from './localWorkouts';
import { rememberExerciseNames } from './exerciseNames';
import { createWorkout } from '../api/workouts';
import { logSet as apiLogSet } from '../api/sets';
import { LogLiftSetPayload } from '../types/api';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** One completed lift set as entered on the backdate screen (canonical kg). */
export interface BackdateSetEntry {
  exerciseId: string;
  exerciseName: string;
  reps: number;
  weightKg: number;
  /** Fixed-point exact entry: typed value × 100 in the typed unit (v18). */
  weightCenti?: number | null;
  /** Unit the weight was typed in ('kg' | 'lbs'). */
  weightUnit?: 'kg' | 'lbs' | null;
  rir?: number | null;
}

export interface BackdateResult {
  workoutId: string;
  savedSets: number;
}

/** Thrown when some (or all) Pro set uploads fail after the workout was made. */
export class BackdateError extends Error {
  savedSets: number;
  failedSets: number;
  constructor(message: string, savedSets: number, failedSets: number) {
    super(message);
    this.name = 'BackdateError';
    this.savedSets = savedSets;
    this.failedSets = failedSets;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Local kg → weight_raw (kg × 8) mirror encoding used across the local schema. */
function encodeWeightRaw(weightKg: number): number {
  return Math.round(weightKg * 8);
}

/**
 * Noon LOCAL time on the given day, as an ISO string. Noon (not midnight)
 * keeps the stamp inside the intended calendar day in every timezone the
 * device could reasonably sync/display in.
 */
export function noonIsoForDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0).toISOString();
}

const SET_COLS =
  `(id, server_id, workout_id, user_id, exercise_id, kind, set_index, ` +
  `reps, weight_raw, weight_kg, weight_centi, weight_unit, rir, duration_sec, distance_m, avg_pace_sec_per_km, ` +
  `logged_at, synced)`;

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Persist a backdated workout (dayKey strictly before today) with its sets.
 * Entries are written in array order; set_index is the running position so the
 * day view (ORDER BY set_index) replays the order the user entered.
 */
export async function logBackdatedWorkout(
  user: TierUser | null | undefined,
  userId: string,
  dayKey: string,
  routineName: string | null,
  entries: BackdateSetEntry[],
): Promise<BackdateResult> {
  if (entries.length === 0) throw new Error('No sets to save');
  const loggedAt = noonIsoForDayKey(dayKey);

  // Both tiers: remember id→name so history rows render real names.
  void rememberExerciseNames(
    entries.map((e) => ({ exerciseId: e.exerciseId, name: e.exerciseName })),
  ).catch(() => {});

  if (isLocalFirst(user)) {
    const workout = await ensureLocalWorkoutForDay(dayKey, userId);
    if (!workout) throw new Error('Could not create the local workout');
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      await localDb.execute(
        `INSERT INTO sets ${SET_COLS}
         VALUES (?, NULL, ?, ?, ?, 'lift', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 0)`,
        [
          genId(), workout.id, userId, e.exerciseId, i,
          e.reps, encodeWeightRaw(e.weightKg), e.weightKg,
          e.weightCenti ?? null, e.weightUnit ?? null,
          e.rir ?? null, loggedAt,
        ],
        { tables: ['sets'] },
      );
    }
    if (routineName) {
      await stampLocalRoutineName(dayKey, routineName, userId);
    }
    return { workoutId: workout.id, savedSets: entries.length };
  }

  // ── Pro: server is the source of truth ────────────────────────────────────
  const workout = await createWorkout(
    dayKey,
    undefined,
    routineName ? { routineName } : undefined,
  );

  let saved = 0;
  let failed = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const payload: LogLiftSetPayload = {
      kind: 'lift',
      workoutId: workout.id,
      exerciseId: e.exerciseId,
      setIndex: i,
      reps: e.reps,
      weightKg: e.weightKg,
      ...(e.weightCenti != null && e.weightUnit != null
        ? { weightCenti: e.weightCenti, weightUnit: e.weightUnit }
        : {}),
      ...(e.rir != null && { rir: e.rir }),
      loggedAt,
    };
    try {
      const serverSet = await apiLogSet(payload);
      saved += 1;
      // Mirror locally (synced=1) like the live logger does, so on-device
      // reads (streak, share card) see the session without a server refetch.
      try {
        await localDb.execute(
          `INSERT OR REPLACE INTO sets ${SET_COLS}
           VALUES (?, ?, ?, ?, ?, 'lift', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 1)`,
          [
            serverSet.id, serverSet.id, workout.id, userId, e.exerciseId, i,
            e.reps, encodeWeightRaw(e.weightKg), e.weightKg,
            e.weightCenti ?? null, e.weightUnit ?? null,
            e.rir ?? null, loggedAt,
          ],
          { tables: ['sets'] },
        );
      } catch { /* mirror is best-effort — the server row is saved */ }
    } catch {
      failed += 1;
    }
  }

  // Mirror the workout header locally (best-effort, synced=1).
  try {
    await localDb.execute(
      `INSERT OR REPLACE INTO workouts
         (id, user_id, day_key, notes, session_type, routine_name, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        workout.id, workout.user_id, workout.day_key, workout.notes ?? null,
        workout.session_type ?? null, routineName ?? null,
        workout.created_at, workout.updated_at,
      ],
      { tables: ['workouts'] },
    );
  } catch { /* best-effort */ }

  if (failed > 0) {
    throw new BackdateError(
      `Saved ${saved} of ${entries.length} sets — the rest failed to upload`,
      saved,
      failed,
    );
  }
  return { workoutId: workout.id, savedSets: saved };
}
