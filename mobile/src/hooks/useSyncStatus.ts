/**
 * useSyncStatus — subscribes to the offline-queue sync engine and returns a
 * stable snapshot that React components can render without polling.
 *
 * Status meanings:
 *   connected    — the device is online and able to reach the sync backend.
 *   syncing      — at least one queued mutation is currently being flushed.
 *   lastSyncedAt — wall-clock timestamp of the last completed sync cycle.
 *
 * syncEngine notifies subscribers whenever any of these values change (and
 * fires once immediately on subscribe), so the hook stays current without any
 * polling interval.
 *
 * Usage:
 *   const { connected, syncing, lastSyncedAt } = useSyncStatus();
 *
 * TICKET-027 — offline-queue sync integration (replaces the PowerSync
 * websocket status source).
 */

import { useEffect, useState } from 'react';
import { syncEngine, SyncStatus } from '../db/syncEngine';

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface SyncStatusInfo {
  /** True when the device is online and reachable by the sync engine. */
  connected: boolean;
  /** True while queued mutations are actively being flushed. */
  syncing: boolean;
  /** Timestamp of the last completed full sync, or null if never synced. */
  lastSyncedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Helper — map a raw syncEngine status into the public shape
// ---------------------------------------------------------------------------

function fromStatus(s: SyncStatus): SyncStatusInfo {
  return {
    connected: s.online,
    syncing: s.syncing,
    lastSyncedAt: s.lastSyncedAt,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSyncStatus(): SyncStatusInfo {
  const [status, setStatus] = useState<SyncStatusInfo>(() =>
    fromStatus(syncEngine.getStatus())
  );

  useEffect(() => {
    // subscribe fires immediately with the current status, then on every
    // subsequent change. It returns an unsubscribe function for cleanup.
    const unsubscribe = syncEngine.subscribe((s) => {
      setStatus(fromStatus(s));
    });

    return unsubscribe;
  }, []);

  return status;
}
