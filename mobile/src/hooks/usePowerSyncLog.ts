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
import { getSetsForWorkout } from '../api/sets';
import { db, genId } from '../db/powerSyncClient';
import { makeWatchToken } from '../db/localDb';
import { syncEngine } from '../db/syncEngine';
import { useAuth } from './useAuth';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { maybeSendWeeklySignals, getActiveGroupIds, VolumeSetRow } from '../data/groupSignals';
import { computeStreak } from './useStreak';
import { ensureLocalWorkoutForDay } from '../data/localWorkouts';
import { localDb } from '../db/localDb';
import {
  Workout,
  WorkoutSet,
  LiftSet,
  CardioSet,
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
  weight_raw: number | null; // INTEGER = kg × 8; legacy, decode before returning
  weight_kg: number | null;  // REAL exact kg (v3); preferred over weight_raw
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
      weight_kg: row.weight_kg != null ? row.weight_kg : (row.weight_raw != null ? row.weight_raw / 8 : 0),
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

// Local SQLite mirrors Postgres: weight stored as INTEGER kg × 8.
function encodeWeightRaw(weightKg: number): number {
  return Math.round(weightKg * 8);
}

/**
 * Replace the SYNCED local rows for a workout with the server's set list.
 * Unsynced (offline-queued) rows are intentionally preserved so a pending
 * write is never wiped by a background hydrate.
 */
async function hydrateLocalSets(
  workoutId: string,
  serverSets: WorkoutSet[]
): Promise<void> {
  await db.execute(
    'DELETE FROM sets WHERE workout_id = ? AND synced = 1',
    [workoutId],
    { tables: ['sets'] }
  );
  const COLS =
    `(id, server_id, workout_id, user_id, exercise_id, kind, set_index, ` +
    `reps, weight_raw, weight_kg, rir, duration_sec, distance_m, avg_pace_sec_per_km, ` +
    `logged_at, synced)`;
  for (const s of serverSets) {
    if (s.kind === 'lift') {
      await db.execute(
        `INSERT OR REPLACE INTO sets ${COLS}
         VALUES (?, ?, ?, ?, ?, 'lift', ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 1)`,
        [
          s.id, s.id, s.workout_id, s.user_id, s.exercise_id, s.set_index,
          s.reps, encodeWeightRaw(s.weight_kg), s.weight_kg, s.rir, s.logged_at,
        ],
        { tables: ['sets'] }
      );
    } else {
      await db.execute(
        `INSERT OR REPLACE INTO sets ${COLS}
         VALUES (?, ?, ?, ?, ?, 'cardio', ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, 1)`,
        [
          s.id, s.id, s.workout_id, s.user_id, s.exercise_id, s.set_index,
          s.duration_sec, s.distance_m, s.avg_pace_sec_per_km, s.logged_at,
        ],
        { tables: ['sets'] }
      );
    }
  }
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
  const { user } = useAuth();
  const userId = user?.id ?? '';
  // Tier gate: free users are local-first — skip personal REST endpoints.
  const localFirst = isLocalFirst(user);

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
      // ── Online path (Pro): create/upsert the server workout, hydrate local DB ─
      // Free users are local-first: skip the REST call entirely; workout was
      // already created locally by useWorkout or a prior session.
      if (localFirst) {
        // For free users, read or create today's workout from localDb only.
        // Atomic get-or-create (shared with useWorkout) — prevents the
        // cold-start race that produced duplicate "Today" workout rows.
        const localWorkout = await ensureLocalWorkoutForDay(todayKey, userId);
        if (localWorkout) {
          workoutIdRef.current = localWorkout.id;
          setWorkout(localWorkout);
        }
        return;
      }
      const w = await createWorkout(todayKey);
      // Set ref BEFORE triggering re-render so the watch effect always sees a
      // valid workoutId even on the first render triggered by setWorkout().
      workoutIdRef.current = w.id;

      // Mirror the workout into local SQLite so offline reads work next time.
      await db.execute(
        `INSERT OR REPLACE INTO workouts
           (id, user_id, day_key, notes, session_type, created_at, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          w.id,
          w.user_id,
          w.day_key,
          w.notes ?? null,
          w.session_type ?? null,
          w.created_at,
          w.updated_at,
        ],
        { tables: ['workouts'] }
      );

      setWorkout(w);

      // Pull server sets and replace the SYNCED local rows for this workout.
      // Unsynced (queued offline) rows are left untouched so nothing pending
      // is lost. The reactive watch effect re-reads local SQLite after this.
      const serverSets = await getSetsForWorkout(w.id);
      await hydrateLocalSets(w.id, serverSets);

      // Phase 1.5: server fires paywall_trigger=true exactly once (the session
      // that crosses the free-tier limit). Surface it so the UI can prompt.
      if (w.paywall_trigger) {
        setPaywallTriggered(true);
      }
    } catch (err) {
      // ── Offline fallback: reuse today's locally-cached workout if present ───
      // so the user can keep logging (sets queue in the outbox until online).
      try {
        const local = await db.getFirst<{ id: string }>(
          'SELECT id FROM workouts WHERE day_key = ? ORDER BY updated_at DESC LIMIT 1',
          [todayKey]
        );
        if (local?.id) {
          workoutIdRef.current = local.id;
          const localWorkout = await db.getFirst<Workout>(
            'SELECT * FROM workouts WHERE id = ? LIMIT 1',
            [local.id]
          );
          if (localWorkout) setWorkout(localWorkout);
        } else {
          const msg =
            err instanceof Error ? err.message : 'Could not create workout';
          setInitError(
            `${msg}. You appear to be offline and today's workout hasn't been started yet — connect once to begin.`
          );
        }
      } catch {
        const msg =
          err instanceof Error ? err.message : 'Could not create workout';
        setInitError(msg);
      }
    } finally {
      setInitLoading(false);
    }
  }, [todayKey, localFirst, userId]);

  useEffect(() => {
    void initWorkout();
  }, [initWorkout]);

  // ── PowerSync: reactive watch on sets for today's workout ──────────────────
  // We start watching once the workoutId is known. The watch re-fires on any
  // change to the `sets` table (local write OR sync from server).

  useEffect(() => {
    let aborted = false;
    // (2026-07-03 leak fix) Explicit cancellation for the watcher below. The
    // old cleanup only set `aborted = true`, which the loop could not observe
    // until the NEXT sets-table write woke it - until then the subscription
    // stayed registered (a leak). Worse, this effect used to re-run on every
    // `workout` OBJECT identity change (initWorkout mints a fresh object per
    // run), so stale watchers accumulated and every logged set fanned out a
    // redundant re-query per zombie. token.cancel() wakes the parked watcher
    // immediately so it unsubscribes deterministically on cleanup.
    const watchToken = makeWatchToken();

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
          { tables: new Set(['sets']), token: watchToken }
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
      watchToken.cancel();
    };
    // Identity-stable dep (2026-07-03): keyed on the workout ID, not the object
    // - initWorkout returns a NEW object each run even for the same row, which
    // previously tore down + re-subscribed this watcher on every auth settle /
    // retry / day-flip and left the old one leaked until the next sets write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id]);

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
      // Local-first write: insert into SQLite immediately (synced=0) so the set
      // appears instantly and survives offline, then queue it for upload. The
      // reactive watch effect re-reads local SQLite and re-renders the list.
      const localId = genId();
      const loggedAt = new Date().toISOString();
      const COLS =
        `(id, server_id, workout_id, user_id, exercise_id, kind, set_index, ` +
        `reps, weight_raw, weight_kg, rir, duration_sec, distance_m, avg_pace_sec_per_km, ` +
        `logged_at, synced)`;

      let optimistic: WorkoutSet;
      if (payload.kind === 'lift') {
        await db.execute(
          // weight_kg stores the EXACT kilograms entered (full precision) — this
          // is the source of truth for display/edit. weight_raw (kg×8) is kept
          // derived for backward-compat and the on-device percentile path.
          `INSERT INTO sets ${COLS}
           VALUES (?, NULL, ?, ?, ?, 'lift', ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 0)`,
          [
            localId, wid, userId, payload.exerciseId, payload.setIndex,
            payload.reps, encodeWeightRaw(payload.weightKg), payload.weightKg,
            payload.rir ?? null, loggedAt,
          ],
          { tables: ['sets'] }
        );
        optimistic = {
          id: localId, workout_id: wid, user_id: userId,
          exercise_id: payload.exerciseId, kind: 'lift',
          set_index: payload.setIndex, reps: payload.reps,
          weight_kg: payload.weightKg, rir: payload.rir ?? null,
          logged_at: loggedAt,
        };
      } else {
        await db.execute(
          `INSERT INTO sets ${COLS}
           VALUES (?, NULL, ?, ?, ?, 'cardio', ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, 0)`,
          [
            localId, wid, userId, payload.exerciseId, payload.setIndex,
            payload.durationSec, payload.distanceM ?? null,
            payload.avgPaceSecPerKm ?? null, loggedAt,
          ],
          { tables: ['sets'] }
        );
        optimistic = {
          id: localId, workout_id: wid, user_id: userId,
          exercise_id: payload.exerciseId, kind: 'cardio',
          set_index: payload.setIndex, duration_sec: payload.durationSec,
          distance_m: payload.distanceM ?? null,
          avg_pace_sec_per_km: payload.avgPaceSecPerKm ?? null,
          logged_at: loggedAt,
        };
      }

      // Queue the upload; syncEngine drains the outbox to the API when online.
      // FREE users are local-first: the local write above is the source of truth,
      // and `wid` is a local-only id the server never saw — enqueuing it would
      // 400 on every flush and permanently jam the outbox. Skip the server path.
      if (!localFirst) {
        await syncEngine.enqueueInsertSet(localId, { ...payload, workoutId: wid });
      }

      // ── Group weekly signal (free + pro, fire-and-forget) ─────────────────
      // Count workouts logged in this ISO week (including today) so the signal
      // reflects accurate progress. Errors are fully swallowed in the helper.
      //
      // TICKET-139: also gather the inputs for the OPT-IN leaderboard aggregates
      // (this-week `sets` rows for volume, and the user's week-streak). Both are
      // best-effort local reads — a failure here must never block logSet, and
      // groupSignals.ts itself only forwards the aggregates for groups where the
      // per-group opt-in flag is on. This rides the SAME weekly-signal POST —
      // no new network call is introduced.
      void (async () => {
        try {
          const weekMonday = (() => {
            const d = new Date();
            const dow = (d.getDay() + 6) % 7;
            d.setDate(d.getDate() - dow);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          })();
          const row = await localDb.getFirst<{ cnt: number }>(
            `SELECT COUNT(*) as cnt FROM workouts WHERE day_key >= ?`,
            [weekMonday]
          );

          let volumeRows: VolumeSetRow[] | undefined;
          let streakWeeks: number | undefined;
          try {
            volumeRows = await localDb.getAll<VolumeSetRow>(
              `SELECT kind, weight_kg, weight_raw, reps, logged_at
                 FROM sets
                WHERE logged_at >= ?`,
              [weekMonday]
            );
          } catch { /* best-effort — omit volume aggregate on failure */ }
          try {
            const workoutRows = await localDb.getAll<{ id: string; day_key: string }>(
              `SELECT id, day_key FROM workouts`
            );
            // computeStreak only reads day_key; the remaining Workout fields are
            // stubbed since this is a local, throwaway shape for streak counting.
            streakWeeks = computeStreak(
              workoutRows.map((w) => ({
                id: w.id,
                user_id: userId ?? '',
                day_key: w.day_key,
                notes: null,
                created_at: '',
                updated_at: '',
              }))
            );
          } catch { /* best-effort — omit streak aggregate on failure */ }

          await maybeSendWeeklySignals(
            getActiveGroupIds(),
            row?.cnt ?? 1,
            3,
            volumeRows,
            streakWeeks,
          );
        } catch { /* swallow — never block logSet */ }
      })();

      return optimistic;
    },
    [userId, localFirst]
  );

  /**
   * Delete a set: remove it from local SQLite immediately, then queue the
   * server delete. If the set was never synced, enqueueDeleteSet cancels its
   * still-pending insert instead of sending a delete for a non-existent row.
   */
  const deleteSet = useCallback(async (id: string): Promise<void> => {
    const row = await db.getFirst<{ server_id: string | null; synced: number }>(
      'SELECT server_id, synced FROM sets WHERE id = ? LIMIT 1',
      [id]
    );
    await db.execute('DELETE FROM sets WHERE id = ?', [id], { tables: ['sets'] });
    // Free users are local-first — the local DELETE above is sufficient; no
    // server delete to enqueue (the row never went to the server).
    if (!localFirst) {
      await syncEngine.enqueueDeleteSet(id, row?.server_id ?? null);
    }
  }, [localFirst]);

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
