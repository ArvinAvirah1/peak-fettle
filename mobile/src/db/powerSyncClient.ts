/**
 * DEV STUB: PowerSync database client.
 *
 * @powersync/react-native requires a native build and cannot run in Expo Go or web.
 * This stub replaces the real PowerSyncDatabase with a no-op implementation so the
 * app loads for UI development. All queries return empty results.
 *
 * To restore the real implementation, replace this file with:
 *   import { PowerSyncDatabase } from '@powersync/react-native';
 *   import { AppSchema } from './schema';
 *   export const db = new PowerSyncDatabase({ schema: AppSchema, database: { dbFilename: 'peak_fettle.db' } });
 */

async function* emptyWatch(): AsyncGenerator<void> {
  // Never emits — keeps the watch loop alive without crashing.
  await new Promise(() => {});
  yield;
}

export const db = {
  currentStatus: {
    connected: true,
    downloading: false,
    uploading: false,
    lastSyncedAt: null as Date | null,
  },
  registerListener: (_handlers: unknown) => () => {},
  connect: async (_connector: unknown) => {},
  disconnect: async () => {},
  getAll: async <T>(_sql: string, _params?: unknown[]): Promise<T[]> => [],
  execute: async (_sql: string, _params?: unknown[]) => {},
  watch: (_sql: string, _params?: unknown[], _opts?: unknown) => emptyWatch(),
};
