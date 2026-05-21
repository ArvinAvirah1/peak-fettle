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

// DEV STUB: PowerSync requires a native build — not available in Expo Go / web.
// The real implementation is preserved below in comments.
// Restore when running a development build.
import React, { ReactNode } from 'react';

interface PowerSyncProviderProps {
  children: ReactNode;
}

export function PowerSyncProvider({ children }: PowerSyncProviderProps): React.ReactElement {
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// REAL IMPLEMENTATION (restore for native dev/prod builds)
// ---------------------------------------------------------------------------
// import React, { useEffect, ReactNode } from 'react';
// import { PowerSyncContext } from '@powersync/react-native';
// import { db } from '../db/powerSyncClient';
// import { PeakFettleConnector, setAccessToken } from '../db/connector';
// import { useAuth } from '../hooks/useAuth';
// const connector = new PeakFettleConnector();
// export function PowerSyncProvider({ children }: { children: ReactNode }): React.ReactElement {
//   const { accessToken } = useAuth();
//   useEffect(() => { setAccessToken(accessToken); }, [accessToken]);
//   useEffect(() => {
//     db.connect(connector).catch((err: unknown) => console.error('[PowerSync] Failed to connect:', err));
//     return () => { db.disconnect().catch((err: unknown) => console.error('[PowerSync] Failed to disconnect cleanly:', err)); };
//   }, []);
//   return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>;
// }
