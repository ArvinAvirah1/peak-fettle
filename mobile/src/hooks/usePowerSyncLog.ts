/**
 * usePowerSyncLog — offline-first workout logging hook (TICKET-027).
 *
 * Replaces useWorkout in log.tsx. Combines:
 *   1. REST workout init  — POST /workouts (idempotent) on mount to obtain
 *                           the server-assigned workout UUID for today's session.
 *   2. PowerSync set reads — db.watch() on the local SQLite `sets` table,
 *                           filtered by the server workout UUID. Reacts
 *                           immediately to local writes AND to rows arriving
 *                           from the sync service.
 *   3. PowerSync set writes — db.execute() for INSERT/DELETE so that mutations
 *                             are queued in the PowerSync CRUD upload buffer.
 *                             The connector (src/db/connector.ts) drains the
 *                             buffer to the Express API when the device is online.
 *
 * Offline behaviour:
 *   - If REST fails at mount (no network), initError is set. The Add button is
 *     disabled and the error banner shows a Retry.
 *   - Once online, the user taps Retry → createWorkout() runs → workoutId is
 *     set → set logging is unblocked.
 *   - All set writes go to local SQLite regardless of connectivity.
 *     They are uploaded when the device reconnects (PowerSync handles retry
 *     with exponential backoff).
 *
 * Weight encoding:
 *   Local SQLite stores weight_raw (INTEGER = kg × 8) to mirror the Postgres
 *   column. This hook encodes on write and the connector decodes on upload.
 *   Callers always deal with weight_kg (float kg).
 *
 * Usage (in log.tsx):
 *   const { workout, sets, isLoading, error, logSet, deleteSet, refetch }
 *     = usePowerSyncLog();
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createWorkout } from '../api/workouts';
import {
  getSetsForWorkout,
  logSet as apiLogSet,
  deleteSet as apiDeleteSet,
} from '../api/sets';
import { db } from '../db/powerSyncClient';
import {
  Workout,
  WorkoutSet,
  LogSetPayload,
} from '../types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Raw DB row type for sets (mirrors local SQLite schema)
// ---------------------------------------------------------------------------

interface SetRow {
  id: string;
  workout_id: string;
  user_id: string;
  exercise_id: string;
  kind: string;
  set_index: number;
  // lift
  reps: number | null;
  weight_raw: number | null; // INTEGER = kg × 8; decode before returning
  rir: number | null;
  // TYPE-001 fix (2026-05-16): `e1rm_kg` removed — column dropped server-side
  // in 20260505_sets_weight_raw.sql; local SQLite column (if still present
  // from a pre-drop schema) is now unused dead storage.
  // cardio
  duration_sec: number | null;
  distance_m: number | null;
  avg_pace_sec_per_km: number | null;
  // shared
  logged_at: string;
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
      weight_kg: row.weight_raw != null ? row.weight_raw / 8 : 0,
      rir: row.rir,
      logged_at: row.logged_at,
    };
    return liftSet;
  }

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

export interface UsePowerSyncLogResult {
  workout: Workout | null;
  sets: WorkoutSet[];
  isLoading: boolean;
  error: string | null;
  logSet: (payload: LogSetPayload) => Promise<WorkoutSet>;
  deleteSet: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
  /**
   * Phase 1.5: true once (and only once) when the server returns
   * paywall_trigger=true on POST /workouts — indicates the user has hit the
   * free-tier session limit. Log screen should surface an upgrade prompt.
   */
  paywallTriggered: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePowerSyncLog(): UsePowerSyncLogResult {

  // Stable today key — doesn't change within a session.
  const todayKey = useMemo(() => getTodayKey(), []);

  // ── Workout state (from REST) ─────────────────────────────────────────────
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  // Phase 1.5: true once per app-session when the server signals paywall_trigger.
  const [paywallTriggered, setPaywallTriggered] = useState(false);

  // ── Sets state (from local PowerSync SQLite watch) ────────────────────────
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(true);

  // Ref so the watch loop can always read the latest workoutId without
  // requiring a dep-array change that would restart the watch.
  const workoutIdRef = useRef<string | null>(null);

  // ── REST: ensure workout exists and obtain its server UUID ─────────────────

  const initWorkout = useCallback(async () => {
    setInitLoading(true);
    setInitError(null);
    try {
      const w = await createWorkout(todayKey);
      // Set ref BEFORE triggering re-render so the watch effect always sees a
      // valid workoutId even on the first render triggered by setWorkout().
      workoutIdRef.current = w.id;
      setWorkout(w);
      const serverSets = await getSetsForWorkout(w.id);
      setSets(serverSets);
      // Phase 1.5: server fires paywall_trigger=true exactly once (the session
      // that crosses the free-tier limit). Surface it so the UI can prompt.
      if (w.paywall_trigger) {
        setPaywallTriggered(true);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not create workout';
      setInitError(msg);
    } finally {
      setInitLoading(false);
    }
  }, [todayKey]);

  useEffect(() => {
    void initWorkout();
  }, [initWorkout]);

  // ── PowerSync: reactive watch on sets for today's workout ──────────────────
  // We start watching once the workoutId is known. The watch re-fires on any
  // change to the `sets` table (local write OR sync from server).

  useEffect(() => {
    let aborted = false;

    async function loadAndWatch(): Promise<void> {
      // Poll until the workoutId is available (REST may still be in flight).
      // In practice this resolves in < 500 ms on first render.
      const getWorkoutId = (): string | null => workoutIdRef.current;
      let wid = getWorkoutId();

      // If workoutId isn't ready yet, wait for the next render cycle when
      // initWorkout resolves and workoutIdRef is set.
      if (!wid) {
        setSetsLoading(true);
        return;
      }

      // Initial fetch
      try {
        const rows = await db.getAll<SetRow>(
          'SELECT * FROM sets WHERE workout_id = ? ORDER BY set_index ASC',
          [wid]
        );
        if (!aborted) {
          setSets(rows.map(rowToSet));
          setSetsLoading(false);
        }
      } catch (err) {
        console.error('[usePowerSyncLog] Initial sets load failed:', err);
        if (!aborted) setSetsLoading(false);
      }

      // Reactive watch — re-runs the query on every write to `sets`.
      try {
        for await (const _ of db.watch(
          'SELECT 1 FROM sets WHERE workout_id = ?',
          [wid],
          { tables: new Set(['sets']) }
        )) {
          if (aborted) break;
          // workoutId may have changed if initWorkout re-ran (e.g. date flip).
          wid = workoutIdRef.current ?? wid;
          const rows = await db.getAll<SetRow>(
            'SELECT * FROM sets WHERE workout_id = ? ORDER BY set_index ASC',
            [wid]
          );
          if (!aborted) {
            setSets(rows.map(rowToSet));
          }
        }
      } catch (err) {
        // db.watch() throws when the async generator is cleaned up — expected.
        if (!aborted) {
          console.error('[usePowerSyncLog] Watch error:', err);
        }
      }
    }

    void loadAndWatch();

    return () => {
      aborted = true;
    };
  }, [workout]); // re-subscribe when workout changes (e.g. retry after offline)

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Write a new set to the local PowerSync SQLite DB.
   * PowerSync queues the INSERT and uploads it via connector.uploadData()
   * as soon as the device is online.
   *
   * Returns an optimistic WorkoutSet immediately so the UI can update
   * without waiting for server confirmation. The server-computed e1rm_kg
   * arrives after PowerSync re-syncs the server's inserted row.
   */
  const logSet = useCallback(
    async (payload: LogSetPayload): Promise<WorkoutSet> => {
      const wid = workoutIdRef.current;
      if (!wid) {
        // Workout hasn't been initialised yet (still loading or offline).
        throw new Error('Workout not ready — please wait or retry');
      }
      // Note: `user` is NOT checked here. The server authenticates via the
      // Bearer token (attached by the Axios interceptor). This allows logSet
      // to work even on a cold-start where user may not yet be hydrated.
      const serverSet = await apiLogSet({ ...payload, workoutId: wid });
      setSets((prev) => [...prev, serverSet]);
      return serverSet;
    },
    [] // no React-state deps — relies only on workoutIdRef (a ref) and apiLogSet (stable)
  );

  /**
   * Delete a set from the local SQLite DB. PowerSync queues the DELETE
   * and applies it server-side when online.
   */
  const deleteSet = useCallback(async (id: string): Promise<void> => {
    await apiDeleteSet(id);
    setSets((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // ── Refetch (retry after offline init failure) ──────────────────────────

  const refetch = useCallback(async (): Promise<void> => {
    await initWorkout();
  }, [initWorkout]);

  // ── Derived loading flag ───────────────────────────────────────────────

  // Consider loading until both the REST workout and the initial sets query
  // have resolved. After that, the watch keeps sets current reactively.
  const isLoading = initLoading || (workout !== null && setsLoading);

  return {
    workout,
    sets,
    isLoading,
    error: initError,
    logSet,
    deleteSet,
    refetch,
    paywallTriggered,
  };
}
