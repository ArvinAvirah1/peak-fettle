/**
 * Peak Fettle — PowerSync ↔ Supabase Connector
 *
 * Responsibilities:
 *  1. Provide a JWT to PowerSync so it can authenticate with the PowerSync
 *     cloud service (which then proxies reads from Supabase).
 *  2. Upload local write queue entries to Supabase via the REST API.
 *
 * Environment variables expected in app.config.ts / .env:
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 *   EXPO_PUBLIC_POWERSYNC_URL
 */

import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
} from '@powersync/react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL   = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Tables the client is allowed to mutate. Read-only tables (exercises,
// percentile_vectors) are NOT listed — writes to those are rejected.
// Tables the client is allowed to mutate. Read-only tables (exercises,
// exercise_aliases, percentile_vectors) are NOT listed.
const MUTABLE_TABLES = new Set([
  'workouts',
  'sets',
  'plans',
  'user_constraints',
  'streaks',
  'streak_overrides',
]);

export class SupabaseConnector implements PowerSyncBackendConnector {
  readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // not a browser
      },
    });
  }

  // -------------------------------------------------------------------------
  // fetchCredentials — called by PowerSync to authenticate the sync stream
  // -------------------------------------------------------------------------
  async fetchCredentials() {
    const { data, error } = await this.supabase.auth.getSession();

    if (error || !data.session) {
      // No session yet — return null so PowerSync pauses sync until login
      return null;
    }

    return {
      endpoint: process.env.EXPO_PUBLIC_POWERSYNC_URL!,
      token: data.session.access_token,
      expiresAt: new Date(data.session.expires_at! * 1000),
    };
  }

  // -------------------------------------------------------------------------
  // uploadData — flush the local write queue to Supabase
  // Called by PowerSync whenever there are pending local mutations.
  // -------------------------------------------------------------------------
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    let lastEntry: CrudEntry | null = null;

    try {
      for (const entry of transaction.crud) {
        lastEntry = entry;

        // Silently drop writes to read-only tables (shouldn't happen, but be safe)
        if (!MUTABLE_TABLES.has(entry.table)) {
          console.warn(`[PowerSync] Skipping write to read-only table: ${entry.table}`);
          continue;
        }

        const table = this.supabase.from(entry.table);

        switch (entry.op) {
          case UpdateType.PUT: {
            // PowerSync PUT = upsert (handles both INSERT and full UPDATE)
            const { error } = await table.upsert({
              ...entry.opData,
              id: entry.id,
            });
            if (error) throw error;
            break;
          }

          case UpdateType.PATCH: {
            const { error } = await table
              .update(entry.opData!)
              .eq('id', entry.id);
            if (error) throw error;
            break;
          }

          case UpdateType.DELETE: {
            const { error } = await table.delete().eq('id', entry.id);
            if (error) throw error;
            break;
          }
        }
      }

      await transaction.complete();
    } catch (ex: any) {
      console.error(
        `[PowerSync] Upload failed on table "${lastEntry?.table}" id="${lastEntry?.id}":`,
        ex
      );
      // Don't mark complete — PowerSync will retry on next cycle
      throw ex;
    }
  }
}
