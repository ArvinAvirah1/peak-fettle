/**
 * syncEngine — offline outbox drain + sync-status tracker.
 *
 * Responsibilities:
 *   1. Queue write intents (set inserts / deletes) into the local `outbox`
 *      table so the user can log workouts entirely offline.
 *   2. Drain that outbox to the REST API (in strict id order) whenever the
 *      device is online, reconciling local set rows with their server ids.
 *   3. Expose a synchronous, subscribable SyncStatus snapshot for the UI.
 *
 * Connectivity:
 *   The engine is created outside of React, so it listens to NetInfo directly.
 *   On every offline→online transition it auto-flushes; callers may also fire
 *   a flush optimistically after enqueuing while online.
 *
 * Ordering / safety:
 *   flush() is single-flight (re-entrancy guarded) and drains rows oldest-first.
 *   flush() never rejects — a failure simply leaves the row queued.
 *
 *   Failure handling (2026-07-14, outage postmortem): the old behaviour halted
 *   the WHOLE loop on the first failing row and retried it forever. During the
 *   Railway outage that meant one permanently-rejected insert (a set queued
 *   under a local-only workout id the server had never seen → 403 forever)
 *   blocked every row behind it — sets silently stopped syncing. Now:
 *     • TRANSPORT failures (no HTTP response, 401/429, 5xx infra) still halt
 *       the loop — every later row would fail identically.
 *     • ROW-LEVEL rejections (400/403/404/409/422 …) record last_error and
 *       CONTINUE to the next row. This is safe: the only ordering constraint is
 *       "a delete never overtakes its own insert", and deletes for unsynced
 *       sets are cancelled at enqueue time, never queued.
 *     • An insert rejected 403/404 first attempts WORKOUT RECOVERY: the local
 *       day row tells us the day_key; POST /workouts is idempotent on
 *       (user_id, day_key), so we can mint/fetch the real server workout,
 *       re-point the local sets + queued payloads to it (adoptServerWorkout),
 *       and retry the insert once inline. Today's rows are left for the live
 *       logger's own init to adopt (it also owns the React ref that must move).
 */

import NetInfo from '@react-native-community/netinfo';
import axios from 'axios';

import { apiClient } from '../api/client';
import { createWorkout } from '../api/workouts';
import { adoptServerWorkout } from '../data/localWorkouts';
import { LogSetPayload, WorkoutSet } from '../types/api';
import { localDb } from './localDb';

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  pending: number; // count of outbox rows
  lastSyncedAt: Date | null;
}

interface OutboxRow {
  id: number;
  op: string;
  local_id: string | null;
  server_id: string | null;
  payload: string | null;
  created_at: string | null;
  attempts: number;
  last_error: string | null;
}

const status: SyncStatus = {
  online: false,
  syncing: false,
  pending: 0,
  lastSyncedAt: null,
};

const listeners = new Set<(s: SyncStatus) => void>();

let flushing = false;
let netUnsubscribe: (() => void) | null = null;

function emit(): void {
  const snapshot: SyncStatus = { ...status };
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function httpStatus(err: unknown): number | null {
  if (axios.isAxiosError(err)) {
    return err.response?.status ?? null;
  }
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return typeof status === 'number' ? status : null;
}

function isNotFound(err: unknown): boolean {
  return httpStatus(err) === 404;
}

/**
 * True when the failure is about the TRANSPORT/session, not this row: no HTTP
 * response at all (offline / DNS / timeout / server unreachable), auth that a
 * token refresh must fix first, rate limiting, or gateway-level 502/503/504.
 * Every row after this one would fail identically, so flush() halts and
 * retries later. A plain 500 is deliberately NOT transport: it can be a
 * row-specific rejection (e.g. an FK violation on this row's exercise id) and
 * must not block the rows behind it — the row stays queued either way.
 */
function isTransportFailure(err: unknown): boolean {
  const status = httpStatus(err);
  if (status === null) return true;
  return (
    status === 401 || status === 408 || status === 429 ||
    status === 502 || status === 503 || status === 504
  );
}

function getTodayKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function refreshPending(): Promise<void> {
  const row = await localDb.getFirst<{ c: number }>('SELECT COUNT(*) AS c FROM outbox');
  status.pending = row?.c ?? 0;
  emit();
}

/**
 * POST one queued set insert and reconcile the local row on success:
 * server id becomes the row id, and workout_id is normalised to the payload's
 * (possibly recovery-rewritten) server workout id.
 */
async function uploadInsertSet(row: OutboxRow, payload: LogSetPayload): Promise<void> {
  const server = (await apiClient.post<WorkoutSet>('/sets', payload)).data;
  await localDb.execute(
    'UPDATE sets SET id = ?, server_id = ?, workout_id = ?, synced = 1 WHERE id = ?',
    [server.id, server.id, payload.workoutId, row.local_id],
    { tables: ['sets'] },
  );
  await localDb.execute('DELETE FROM outbox WHERE id = ?', [row.id], {
    tables: ['outbox'],
  });
}

/**
 * Outage recovery for an insert rejected 403/404: the server has never seen
 * the payload's workoutId (it was minted locally while the API was
 * unreachable). Resolve the day via the local `workouts` row, mint/fetch the
 * real server workout (POST /workouts is idempotent on user_id+day_key), and
 * adopt it — re-pointing local sets and every queued payload for that day.
 *
 * Returns the server workout id, or null when recovery does not apply.
 * TODAY's rows are deliberately skipped: the live logger's initWorkout owns
 * today's adoption (it must also move its workoutIdRef, which this module
 * cannot reach — re-pointing under an open session would blank the set list).
 */
async function tryRecoverWorkout(staleWorkoutId: string): Promise<string | null> {
  const local = await localDb.getFirst<{ day_key: string | null }>(
    'SELECT day_key FROM workouts WHERE id = ?',
    [staleWorkoutId],
  );
  if (!local?.day_key || local.day_key >= getTodayKey()) return null;
  const server = await createWorkout(local.day_key);
  await adoptServerWorkout(staleWorkoutId, server);
  return server.id;
}

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  status.syncing = true;
  emit();

  let completedClean = true;
  try {
    const rows = await localDb.getAll<OutboxRow>('SELECT * FROM outbox ORDER BY id ASC');
    // Stale→server workout ids adopted DURING this pass. The `rows` snapshot
    // above predates adoptServerWorkout's payload rewrites, so later rows for
    // the same recovered day would otherwise re-fail once before healing.
    const adopted = new Map<string, string>();

    for (const row of rows) {
      try {
        if (row.op === 'insert_set') {
          const queued = JSON.parse(row.payload ?? '{}') as LogSetPayload;
          const mapped = adopted.get(queued.workoutId);
          const payload = mapped ? { ...queued, workoutId: mapped } : queued;
          try {
            await uploadInsertSet(row, payload);
          } catch (err) {
            const st = httpStatus(err);
            // 403/404 = server doesn't know this workout id → try recovery.
            if (st !== 403 && st !== 404) throw err;
            const serverWorkoutId = await tryRecoverWorkout(payload.workoutId);
            if (!serverWorkoutId) throw err;
            adopted.set(payload.workoutId, serverWorkoutId);
            await uploadInsertSet(row, { ...payload, workoutId: serverWorkoutId });
          }
        } else if (row.op === 'delete_set') {
          try {
            await apiClient.delete('/sets/' + row.server_id);
          } catch (err) {
            if (!isNotFound(err)) throw err;
            // 404 → already gone server-side; treat as success.
          }
          await localDb.execute('DELETE FROM outbox WHERE id = ?', [row.id], {
            tables: ['outbox'],
          });
        } else {
          // Unknown op — drop it so it never blocks the queue.
          await localDb.execute('DELETE FROM outbox WHERE id = ?', [row.id], {
            tables: ['outbox'],
          });
        }
      } catch (err) {
        completedClean = false;
        const message = err instanceof Error ? err.message : String(err);
        await localDb.execute(
          'UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
          [message, row.id],
          { tables: ['outbox'] },
        );
        // Transport/session failure: every later row fails the same way —
        // stop and retry on the next flush. A row-level rejection must NOT
        // block the rows behind it: record it and keep draining.
        if (isTransportFailure(err)) break;
      }
    }

    if (completedClean) {
      status.lastSyncedAt = new Date();
    }
  } catch {
    // Defensive: a read failure must not reject flush().
  } finally {
    status.syncing = false;
    flushing = false;
    await refreshPending();
    emit();
  }
}

async function enqueueInsertSet(localId: string, payload: LogSetPayload): Promise<void> {
  await localDb.execute(
    'INSERT INTO outbox (op, local_id, payload, created_at, attempts) VALUES (?, ?, ?, ?, 0)',
    ['insert_set', localId, JSON.stringify(payload), new Date().toISOString()],
    { tables: ['outbox'] },
  );
  await refreshPending();
  if (status.online) {
    void flush().catch(() => {});
  }
}

async function enqueueDeleteSet(localId: string, serverId: string | null): Promise<void> {
  if (serverId === null) {
    // Never synced: cancel a still-queued insert instead of sending anything.
    await localDb.execute(
      "DELETE FROM outbox WHERE op = 'insert_set' AND local_id = ?",
      [localId],
      { tables: ['outbox'] },
    );
    await refreshPending();
    return;
  }

  await localDb.execute(
    'INSERT INTO outbox (op, local_id, server_id, created_at, attempts) VALUES (?, ?, ?, ?, 0)',
    ['delete_set', localId, serverId, new Date().toISOString()],
    { tables: ['outbox'] },
  );
  await refreshPending();
  if (status.online) {
    void flush().catch(() => {});
  }
}

function start(): void {
  // Idempotent: only attach one NetInfo listener.
  if (netUnsubscribe) return;

  netUnsubscribe = NetInfo.addEventListener((state) => {
    const nowOnline = state.isConnected === true;
    const wasOnline = status.online;
    status.online = nowOnline;
    emit();
    if (!wasOnline && nowOnline) {
      void flush().catch(() => {});
    }
  });

  // Seed `online` from the current state.
  void NetInfo.fetch()
    .then((state) => {
      status.online = state.isConnected === true;
      emit();
      if (status.online) {
        void flush().catch(() => {});
      }
    })
    .catch(() => {});
}

function stop(): void {
  if (netUnsubscribe) {
    netUnsubscribe();
    netUnsubscribe = null;
  }
}

function getStatus(): SyncStatus {
  return { ...status };
}

function subscribe(cb: (s: SyncStatus) => void): () => void {
  listeners.add(cb);
  cb({ ...status });
  return () => {
    listeners.delete(cb);
  };
}

export const syncEngine = {
  start,
  stop,
  getStatus,
  subscribe,
  refreshPending,
  flush,
  enqueueInsertSet,
  enqueueDeleteSet,
};
