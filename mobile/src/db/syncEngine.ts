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
 *   A failing row halts the loop (so a delete never overtakes its own insert)
 *   and is retried on the next flush. flush() never rejects — a network error
 *   simply breaks the loop and leaves the row queued.
 */

import NetInfo from '@react-native-community/netinfo';
import axios from 'axios';

import { apiClient } from '../api/client';
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

function isNotFound(err: unknown): boolean {
  if (axios.isAxiosError(err)) {
    return err.response?.status === 404;
  }
  return (err as { response?: { status?: number } } | null)?.response?.status === 404;
}

async function refreshPending(): Promise<void> {
  const row = await localDb.getFirst<{ c: number }>('SELECT COUNT(*) AS c FROM outbox');
  status.pending = row?.c ?? 0;
  emit();
}

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  status.syncing = true;
  emit();

  let completedClean = true;
  try {
    const rows = await localDb.getAll<OutboxRow>('SELECT * FROM outbox ORDER BY id ASC');

    for (const row of rows) {
      try {
        if (row.op === 'insert_set') {
          const payload = JSON.parse(row.payload ?? '{}') as LogSetPayload;
          const server = (await apiClient.post<WorkoutSet>('/sets', payload)).data;
          await localDb.execute(
            'UPDATE sets SET id = ?, server_id = ?, synced = 1 WHERE id = ?',
            [server.id, server.id, row.local_id],
            { tables: ['sets'] },
          );
          await localDb.execute('DELETE FROM outbox WHERE id = ?', [row.id], {
            tables: ['outbox'],
          });
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
        // Ordering matters: stop here and retry on the next flush.
        break;
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
