/**
 * PowerSyncProvider — boots the local offline store and the sync engine.
 *
 * Placement in the tree (see app/_layout.tsx):
 *   <AuthProvider>          ← provides the access token
 *     <PowerSyncProvider>   ← opens local SQLite + starts outbox sync
 *       <RootNavigator />
 *     </PowerSyncProvider>
 *   </AuthProvider>
 *
 * Lifecycle:
 *   - On mount: initialise the local SQLite database (creates tables if needed)
 *     and start the sync engine, which subscribes to network changes and drains
 *     the local `outbox` to the REST API whenever the device is online.
 *   - On unmount: stop the sync engine (removes the NetInfo listener).
 *
 * NOTE: this replaced the heavy @powersync/react-native provider. The lightweight
 * offline queue (localDb + syncEngine) needs no React context value — hooks
 * import the `db` / `syncEngine` singletons directly — so this provider only
 * owns boot/teardown and renders its children straight through.
 */

import React, { useEffect, ReactNode } from 'react';
import { localDb } from '../db/localDb';
import { syncEngine } from '../db/syncEngine';

interface PowerSyncProviderProps {
  children: ReactNode;
}

export function PowerSyncProvider({ children }: PowerSyncProviderProps): React.ReactElement {
  useEffect(() => {
    let cancelled = false;
    void localDb
      .init()
      .then(() => {
        if (!cancelled) syncEngine.start();
      })
      .catch((err: unknown) => {
        console.error('[PowerSyncProvider] local DB init failed:', err);
      });
    return () => {
      cancelled = true;
      syncEngine.stop();
    };
  }, []);

  return <>{children}</>;
}
