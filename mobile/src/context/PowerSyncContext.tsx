/**
 * PowerSyncProvider — wraps the app tree with a live PowerSync database connection.
 *
 * Placement in the tree (see app/_layout.tsx):
 *   <AuthProvider>          ← provides the Supabase JWT
 *     <PowerSyncProvider>   ← connects PowerSync using that JWT
 *       <RootNavigator />
 *     </PowerSyncProvider>
 *   </AuthProvider>
 *
 * Lifecycle:
 *   - On mount: opens the local SQLite DB and starts syncing via
 *     PeakFettleConnector (which reads the JWT from the module-level store).
 *   - On auth state change (login / logout / silent refresh): calls
 *     setAccessToken() on the connector so fetchCredentials() returns fresh
 *     credentials on the next sync heartbeat.
 *   - On unmount: disconnects from the sync service (releases the websocket).
 *
 * The `db` instance and PowerSync React context are provided via
 * @powersync/react-native's PowerSyncContext so that usePowerSyncQuery()
 * and related hooks work anywhere in the tree.
 */

import React, { useEffect, ReactNode } from 'react';
import { PowerSyncContext } from '@powersync/react-native';

import { db } from '../db/powerSyncClient';
import { PeakFettleConnector, setAccessToken } from '../db/connector';
import { useAuth } from '../hooks/useAuth';

// ---------------------------------------------------------------------------
// Module-level connector singleton — one connection per app session.
// ---------------------------------------------------------------------------

const connector = new PeakFettleConnector();

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface PowerSyncProviderProps {
  children: ReactNode;
}

export function PowerSyncProvider({ children }: PowerSyncProviderProps): React.ReactElement {
  const { accessToken } = useAuth();

  // Keep the connector's token in sync with the auth state.
  // This runs on every accessToken change (login, refresh, logout).
  useEffect(() => {
    setAccessToken(accessToken);
  }, [accessToken]);

  // Connect on mount, disconnect on unmount.
  useEffect(() => {
    db.connect(connector).catch((err: unknown) => {
      console.error('[PowerSync] Failed to connect:', err);
    });

    return () => {
      db.disconnect().catch((err: unknown) => {
        console.error('[PowerSync] Failed to disconnect cleanly:', err);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Empty deps: connect once. The connector itself reads the latest token
  // via setAccessToken(), so we do not need to reconnect on token rotation.

  return (
    <PowerSyncContext.Provider value={db}>
      {children}
    </PowerSyncContext.Provider>
  );
}
