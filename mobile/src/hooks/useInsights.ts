/**
 * useInsights — unified insights hook with free / Pro tier branching.
 *
 * Pro  → existing server endpoints (api/insights.ts: getRecovery, getReadiness,
 *          getDeload, ackDeload) — unchanged current behaviour.
 * Free → on-device computation via insightsLocal.ts (Agent M contract:
 *          computeRecovery, computeReadiness, computeDeload) with localDb
 *          queries providing the input arrays.
 *
 * Spec §Agent P:
 *   "add mobile/src/hooks/useInsights.ts wrapping the branch: free ⇒
 *    insightsLocal + localDb queries, Pro ⇒ existing endpoints"
 *
 * Exported API is a strict superset of what callers need from the individual
 * getRecovery / getReadiness / getDeload functions — always stable shape.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { isLocalFirst } from '../data/backup/tierPolicy';
import {
  getRecovery,
  getReadiness,
  getDeload,
  ackDeload,
  RecoveryResponse,
  ReadinessResponse,
  DeloadResponse,
} from '../api/insights';
import { localDb } from '../db/localDb';

// ---------------------------------------------------------------------------
// Lazy require of Agent M's insightsLocal (not yet on disk at parse time).
// Guard with try/catch so the hook is safe even before M ships.
// ---------------------------------------------------------------------------

type InsightsLocalModule = {
  computeRecovery: (sets14d: unknown[], now: Date) => RecoveryResponse;
  computeReadiness: (
    metrics28d: unknown[],
    tonnage7d: number,
    tonnage28d: number
  ) => ReadinessResponse;
  computeDeload: (history: unknown[], lastDeloadAt: string | null) => DeloadResponse;
};

function tryLoadInsightsLocal(): InsightsLocalModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../lib/insightsLocal') as InsightsLocalModule;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Local helpers — query localDb for the data arrays insightsLocal needs.
// ---------------------------------------------------------------------------

/** Fetch last 14 days of sets (for recovery). */
async function fetchSets14d(): Promise<unknown[]> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const isoStr = cutoff.toISOString().slice(0, 10);
    return await localDb.getAll(
      `SELECT s.*, w.day_key FROM sets s
       JOIN workouts w ON s.workout_id = w.id
       WHERE w.day_key >= ?
       ORDER BY s.logged_at ASC`,
      [isoStr]
    );
  } catch {
    return [];
  }
}

/** Fetch last 28 days of health metrics. */
async function fetchMetrics28d(): Promise<unknown[]> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);
    const isoStr = cutoff.toISOString().slice(0, 10);
    return await localDb.getAll(
      `SELECT * FROM daily_health_log WHERE date >= ? ORDER BY date ASC`,
      [isoStr]
    );
  } catch {
    return [];
  }
}

/**
 * Compute total tonnage (sum of weight_kg * reps) over a rolling window.
 * Reads from the sets + workouts join in localDb.
 */
async function fetchTonnage(days: number): Promise<number> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const isoStr = cutoff.toISOString().slice(0, 10);
    const row = await localDb.getFirst<{ t: number }>(
      `SELECT COALESCE(SUM(CAST(s.reps AS REAL) * (CAST(s.weight_raw AS REAL) / 8.0)), 0) AS t
       FROM sets s
       JOIN workouts w ON s.workout_id = w.id
       WHERE s.kind = 'lift' AND w.day_key >= ?`,
      [isoStr]
    );
    return row?.t ?? 0;
  } catch {
    return 0;
  }
}

/** Last deload acknowledgement timestamp from localDb workout notes (best-effort). */
async function fetchLastDeloadAt(): Promise<string | null> {
  try {
    const row = await localDb.getFirst<{ created_at: string }>(
      `SELECT created_at FROM workouts
       WHERE session_type = 'rest_day'
       ORDER BY created_at DESC LIMIT 1`
    );
    return row?.created_at ?? null;
  } catch {
    return null;
  }
}

/** Fetch recent workout history for deload check. */
async function fetchWorkoutHistory(): Promise<unknown[]> {
  try {
    return await localDb.getAll(
      `SELECT w.*, COUNT(s.id) AS set_count
       FROM workouts w
       LEFT JOIN sets s ON s.workout_id = w.id
       GROUP BY w.id
       ORDER BY w.day_key DESC
       LIMIT 20`
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Hook return shape
// ---------------------------------------------------------------------------

export interface UseInsightsResult {
  recovery:   RecoveryResponse  | null;
  readiness:  ReadinessResponse | null;
  deload:     DeloadResponse    | null;
  isLoading:  boolean;
  error:      string | null;
  refetch:    () => Promise<void>;
  /** ACK deload — only meaningful for Pro; no-op on free path (returns true). */
  acknowledgeDeload: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useInsights(): UseInsightsResult {
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);

  const [recovery,  setRecovery]  = useState<RecoveryResponse  | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [deload,    setDeload]    = useState<DeloadResponse    | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (localFirst) {
        // ── Free path: on-device computation ───────────────────────────────
        const lib = tryLoadInsightsLocal();
        if (!lib) {
          // insightsLocal not yet available (Agent M pending) — return nulls.
          setRecovery(null);
          setReadiness(null);
          setDeload(null);
          return;
        }

        const [sets14d, metrics28d, tonnage7d, tonnage28d, history, lastDeloadAt] =
          await Promise.all([
            fetchSets14d(),
            fetchMetrics28d(),
            fetchTonnage(7),
            fetchTonnage(28),
            fetchWorkoutHistory(),
            fetchLastDeloadAt(),
          ]);

        setRecovery(lib.computeRecovery(sets14d, new Date()));
        setReadiness(lib.computeReadiness(metrics28d, tonnage7d, tonnage28d));
        setDeload(lib.computeDeload(history, lastDeloadAt));
      } else {
        // ── Pro path: server endpoints (unchanged) ──────────────────────────
        const [r, rn, d] = await Promise.all([
          getRecovery(),
          getReadiness(),
          getDeload(),
        ]);
        setRecovery(r);
        setReadiness(rn);
        setDeload(d);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insights');
    } finally {
      setIsLoading(false);
    }
  }, [localFirst]);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledgeDeload = useCallback(async (): Promise<boolean> => {
    if (localFirst) {
      // Free path: no server ack needed; just re-fetch locally.
      await load();
      return true;
    }
    const ok = await ackDeload();
    if (ok) await load();
    return ok;
  }, [localFirst, load]);

  return {
    recovery,
    readiness,
    deload,
    isLoading,
    error,
    refetch: load,
    acknowledgeDeload,
  };
}
