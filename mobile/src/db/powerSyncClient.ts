/**
 * PowerSync database client — the singleton SQLite database managed by PowerSync.
 *
 * Instantiate once at module load time. The actual connection to the PowerSync
 * sync service is established later by calling db.connect(connector) inside
 * PowerSyncProvider (see src/context/PowerSyncContext.tsx).
 *
 * Usage:
 *   import { db } from '../db/powerSyncClient';
 *   const rows = await db.getAll('SELECT * FROM workouts WHERE day_key = ?', [dayKey]);
 */

import { PowerSyncDatabase } from '@powersync/react-native';
import { AppSchema } from './schema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    // SQLite file stored in the app's private documents directory on device.
    dbFilename: 'peak_fettle.db',
  },
});
