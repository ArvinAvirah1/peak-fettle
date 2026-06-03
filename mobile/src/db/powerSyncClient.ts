/**
 * db — the app's local database handle.
 *
 * Historically this exported a no-op PowerSync stub (every read returned []),
 * which silently disabled the entire Log tab. It now delegates to `localDb`
 * (src/db/localDb.ts) — a real expo-sqlite store with a reactive watch() — so
 * the existing hooks (usePowerSyncLog, usePowerSyncWorkout) work unchanged.
 *
 * Offline sync is handled separately by `syncEngine` (src/db/syncEngine.ts),
 * which drains the local `outbox` table to the REST API. Sync STATUS for UI is
 * read via the useSyncStatus hook (which subscribes to syncEngine) — not from
 * this object. The connect/disconnect/currentStatus/registerListener members
 * below are inert compatibility shims kept only so any legacy caller importing
 * them does not crash; they are no longer the source of truth for sync state.
 */

import { localDb } from './localDb';

export { genId } from './localDb';

export const db = {
  // ── Real local data surface (delegates to localDb) ──────────────────────
  init: localDb.init.bind(localDb),
  getAll: localDb.getAll.bind(localDb),
  getFirst: localDb.getFirst.bind(localDb),
  execute: localDb.execute.bind(localDb),
  watch: localDb.watch.bind(localDb),
  subscribe: localDb.subscribe.bind(localDb),
  notify: localDb.notify.bind(localDb),

  // ── Inert PowerSync-compat shims (see file header) ──────────────────────
  currentStatus: {
    connected: true,
    downloading: false,
    uploading: false,
    lastSyncedAt: null as Date | null,
  },
  registerListener: (_handlers: unknown): (() => void) => () => {},
  connect: async (_connector: unknown): Promise<void> => {},
  disconnect: async (): Promise<void> => {},
};
