/**
 * PeakFettleConnector — PowerSync backend connector.
 *
 * Responsibilities:
 *   1. fetchCredentials: provide PowerSync with the endpoint URL and a valid
 *      Supabase JWT so it can authenticate the sync websocket connection.
 *   2. uploadData: flush locally-queued CRUD operations through the Express API
 *      (Peak Fettle's write path). PowerSync then re-syncs the server state
 *      back to the local SQLite DB, keeping everything consistent.
 *
 * Token injection:
 *   PowerSync is initialised outside of React, so it cannot call useAuth().
 *   Instead, AuthContext calls setAccessToken() after every login / silent
 *   refresh, keeping a module-level reference up to date. This is the same
 *   pattern used by src/api/client.ts (setAuthHandlers).
 *
 * Write path:
 *   - workouts INSERT → POST /workouts
 *   - workouts DELETE → DELETE /workouts/:id
 *   - sets INSERT     → POST /sets
 *   - sets DELETE     → DELETE /sets/:id
 *   - exercises       → read-only, skip all uploads
 *   - UPDATE operations are not modelled in the current API layer; they are
 *     ignored here and left as a TODO for when PATCH endpoints are added.
 */

import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
  UpdateType,
  CrudBatch,
} from '@powersync/common';

import { apiClient } from '../api/client';
import { LogSetPayload } from '../types/api';

// ---------------------------------------------------------------------------
// Module-level token store — populated by AuthContext after every auth event.
// ---------------------------------------------------------------------------

let _accessToken: string | null = null;

/**
 * Called by AuthContext immediately after login, silent refresh, and logout.
 * Keeps the connector's token in sync without requiring a React hook.
 */
export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

// ---------------------------------------------------------------------------
// Connector implementation
// ---------------------------------------------------------------------------

const POWERSYNC_URL =
  process.env.EXPO_PUBLIC_POWERSYNC_URL ?? '';

export class PeakFettleConnector implements PowerSyncBackendConnector {
  /**
   * fetchCredentials — called by PowerSync whenever it needs to (re)authenticate
   * the sync connection. Returns null if the user is not logged in, which causes
   * PowerSync to pause sync until credentials become available.
   */
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    if (!_accessToken) {
      // Not authenticated yet — sync will be paused.
      return null;
    }

    if (!POWERSYNC_URL) {
      console.warn(
        '[PowerSync] EXPO_PUBLIC_POWERSYNC_URL is not set. ' +
          'Add it to your .env.local file. Sync is disabled.'
      );
      return null;
    }

    return {
      endpoint: POWERSYNC_URL,
      token: _accessToken,
    };
  }

  /**
   * uploadData — flush locally-queued mutations to the Express API.
   *
   * PowerSync guarantees this is called with a batch of pending CRUD entries
   * in the order they were created locally. We must call batch.complete()
   * after all operations succeed so PowerSync removes them from the queue.
   *
   * If any operation throws, we let the error propagate — PowerSync will retry
   * the batch on the next sync cycle (exponential backoff).
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const batch: CrudBatch | null = await database.getCrudBatch();
    if (!batch) return;

    for (const entry of batch.crud) {
      const { table, op, id, opData } = entry;

      if (table === 'exercises') {
        // exercises is a server-seeded read-only table — never upload.
        continue;
      }

      if (table === 'workouts') {
        if (op === UpdateType.PUT) {
          // PUT covers both INSERT and UPSERT in PowerSync's CRUD model.
          await apiClient.post('/workouts', {
            dayKey: opData?.day_key,
            notes: opData?.notes ?? undefined,
          });
        } else if (op === UpdateType.DELETE) {
          await apiClient.delete(`/workouts/${id}`);
        }
        // PATCH (UpdateType.PATCH) not yet supported by the API layer — skip.
        continue;
      }

      if (table === 'sets') {
        if (op === UpdateType.PUT) {
          const kind = opData?.kind as 'lift' | 'cardio' | undefined;

          if (kind === 'lift') {
            // Decode weight_raw (INTEGER = kg × 8) back to kg float for the API.
            // The local SQLite schema stores weight_raw to mirror Postgres;
            // the Express API always receives and returns weight_kg (float).
            const weightRaw = opData?.weight_raw as number | null | undefined;
            const payload: LogSetPayload = {
              kind: 'lift',
              workoutId: opData?.workout_id as string,
              exerciseId: opData?.exercise_id as string,
              setIndex: opData?.set_index as number,
              reps: opData?.reps as number,
              weightKg: weightRaw != null ? weightRaw / 8 : 0,
              ...(opData?.rir != null && { rir: opData.rir as number }),
            };
            await apiClient.post('/sets', payload);
          } else if (kind === 'cardio') {
            const payload: LogSetPayload = {
              kind: 'cardio',
              workoutId: opData?.workout_id as string,
              exerciseId: opData?.exercise_id as string,
              setIndex: opData?.set_index as number,
              durationSec: opData?.duration_sec as number,
              ...(opData?.distance_m != null && { distanceM: opData.distance_m as number }),
              ...(opData?.avg_pace_sec_per_km != null && {
                avgPaceSecPerKm: opData.avg_pace_sec_per_km as number,
              }),
            };
            await apiClient.post('/sets', payload);
          } else {
            console.warn(`[PowerSync] uploadData: unknown set kind "${kind}" for id=${id}`);
          }
        } else if (op === UpdateType.DELETE) {
          await apiClient.delete(`/sets/${id}`);
        }
        continue;
      }

      // Unknown table — log and skip rather than crashing the batch.
      console.warn(`[PowerSync] uploadData: unhandled table "${table}" op="${op}" id="${id}"`);
    }

    await batch.complete();
  }
}
