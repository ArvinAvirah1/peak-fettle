/**
 * useSyncStatus — subscribes to PowerSync's sync status and returns a stable
 * snapshot that React components can render without polling.
 *
 * Status meanings:
 *   connected    — the WebSocket to the PowerSync sync service is open.
 *   syncing      — at least one upload or download pass is in flight.
 *   lastSyncedAt — wall-clock timestamp of the last completed sync cycle.
 *
 * PowerSync emits a "statusChanged" event whenever any of these values change,
 * so the hook stays current without any polling interval.
 *
 * Usage:
 *   const { connected, syncing, lastSyncedAt } = useSyncStatus();
 *
 * TICKET-027 — PowerSync offline sync integration.
 */

import { useEffect, useState } from 'react';
import { db } from '../db/powerSyncClient';

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface SyncStatusInfo {
  /** True when the WebSocket sync connection is open. */
  connected: boolean;
  /** True while an upload or download pass is actively running. */
  syncing: boolean;
  /** Timestamp of the last completed full sync, or null if never synced. */
  lastSyncedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Helper — read snapshot from db.currentStatus (may be undefined on first call)
// ---------------------------------------------------------------------------

function readStatus(): SyncStatusInfo {
  const s = db.currentStatus;
  return {
    connected: s?.connected ?? false,
    syncing: (s?.uploading ?? false) || (s?.downloading ?? false),
    lastSyncedAt: s?.lastSyncedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSyncStatus(): SyncStatusInfo {
  const [status, setStatus] = useState<SyncStatusInfo>(readStatus);

  useEffect(() => {
    // Re-read on subscribe in case the status changed between the useState
    // initialiser and this effect running.
    setStatus(readStatus());

    // registerListener returns a cleanup function in @powersync/react-native
    // ~1.4.x. We call it on unmount to avoid memory leaks.
    const removeListener = db.registerListener({
      statusChanged: () => {
        setStatus(readStatus());
      },
    });

    return () => {
      if (typeof removeListener === 'function') removeListener();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return status;
}
