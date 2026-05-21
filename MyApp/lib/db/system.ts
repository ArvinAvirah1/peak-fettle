/**
 * Peak Fettle — PowerSync System Singleton + React Context
 *
 * Usage in app/_layout.tsx:
 *
 *   import { PowerSyncProvider } from '@/lib/db/system';
 *
 *   export default function RootLayout() {
 *     return (
 *       <PowerSyncProvider>
 *         <Stack />
 *       </PowerSyncProvider>
 *     );
 *   }
 *
 * Usage anywhere in the tree:
 *
 *   import { useDB, useQuery } from '@/lib/db/system';
 *   const db = useDB();
 *   const { data } = useQuery('SELECT * FROM workout_sessions ORDER BY started_at DESC LIMIT 20');
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  PropsWithChildren,
} from 'react';
import { PowerSyncDatabase, usePowerSync, PowerSyncContext } from '@powersync/react-native';
import { AppSchema } from './schema';
import { SupabaseConnector } from './connector';

// ---------------------------------------------------------------------------
// Singleton DB instance — one per app process
// ---------------------------------------------------------------------------
let _db: PowerSyncDatabase | null = null;

export function getDB(): PowerSyncDatabase {
  if (!_db) {
    _db = new PowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: 'peak_fettle.db',
      },
    });
  }
  return _db;
}

// ---------------------------------------------------------------------------
// Auth state helper (wraps Supabase session changes → PowerSync connect/disconnect)
// ---------------------------------------------------------------------------
export function PowerSyncProvider({ children }: PropsWithChildren) {
  const db = getDB();
  const connector = useRef(new SupabaseConnector());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Connect PowerSync — this starts the local SQLite engine and
    // attempts to open the sync stream if the user is logged in.
    db.connect(connector.current).then(() => {
      setReady(true);
    });

    // Mirror Supabase auth changes into PowerSync connect/disconnect
    const { data: sub } = connector.current.supabase.auth.onAuthStateChange(
      async (event) => {
        if (event === 'SIGNED_OUT') {
          await db.disconnect();
          // Clear all synced data so the next user starts clean
          await db.disconnectAndClear();
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await db.connect(connector.current);
        }
      }
    );

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [db]);

  // Render nothing until the local DB engine is ready — avoids flash of
  // empty state on first paint. Swap for a splash screen if preferred.
  if (!ready) return null;

  return (
    <PowerSyncContext.Provider value={db}>
      {children}
    </PowerSyncContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Re-export convenience hooks so callers import from one place
// ---------------------------------------------------------------------------
export { usePowerSync as useDB };

/**
 * Reactive query hook — re-renders automatically when any referenced row changes.
 *
 * @example
 *   const { data, isLoading } = useQuery<WorkoutSet>(
 *     'SELECT * FROM workout_sets WHERE session_id = ? ORDER BY set_number',
 *     [sessionId]
 *   );
 */
export function useQuery<T = Record<string, unknown>>(
  sql: string,
  parameters: unknown[] = []
): { data: T[]; isLoading: boolean; error: Error | null } {
  const db = usePowerSync();
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const subscription = db.watch(sql, parameters, {
      onResult(results) {
        setData(results.rows._array as T[]);
        setIsLoading(false);
      },
      onError(err) {
        setError(err);
        setIsLoading(false);
      },
    });

    return () => {
      subscription.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, sql, JSON.stringify(parameters)]);

  return { data, isLoading, error };
}
