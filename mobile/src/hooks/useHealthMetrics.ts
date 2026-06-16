/**
 * useHealthMetrics — fetches recent health metrics and manages HealthKit sync.
 *
 * Tier branching (SPEC-094A Agent P):
 *   isLocalFirst(user) → reads from localDb `daily_health_log` table (Agent L
 *                         schema); HealthKit sync still writes locally; never
 *                         calls personal REST health-metrics endpoints.
 *   Pro (syncsToServer) → unchanged existing REST + HealthKit behaviour.
 *
 * Returns: (unchanged exported API)
 *   metrics        — DailyHealthMetric[] sorted descending by date
 *   summary        — 7-day averages (null while loading)
 *   isLoading      — true during initial fetch
 *   error          — error string or null
 *   refetch        — manual pull-to-refresh
 *   sync           — HealthKit sync trigger (iOS only; no-op on Android)
 *   isSyncing      — true while the HealthKit read + POST is in flight
 *   syncError      — error from last sync attempt or null
 *   isHealthKitAvailable — whether the device supports HealthKit
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { localDb } from '../db/localDb';
import {
  getHealthMetrics,
  getHealthMetricsSummary,
  logHealthMetric,
  DailyHealthMetric,
  HealthMetricsSummary,
} from '../api/healthMetrics';
import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
  fetchHealthKitData,
} from '../services/healthKit';

// ---------------------------------------------------------------------------
// Local DB row type for daily_health_metrics (wearable metrics; `id` is aliased
// from metric_id in the SELECT). NOT daily_health_log (the survey log).
// ---------------------------------------------------------------------------

interface HealthLogRow {
  id: string;
  user_id: string;
  date: string;
  resting_hr_bpm: number | null;
  hrv_ms: number | null;
  sleep_hours: number | null;
  active_kcal: number | null;
  source: string;
  created_at: string;
}

function rowToMetric(row: HealthLogRow): DailyHealthMetric {
  return {
    id:              row.id,
    user_id:         row.user_id,
    date:            row.date,
    resting_hr_bpm:  row.resting_hr_bpm,
    hrv_ms:          row.hrv_ms,
    sleep_hours:     row.sleep_hours,
    active_kcal:     row.active_kcal,
    source:          (row.source ?? 'manual') as DailyHealthMetric['source'],
    created_at:      row.created_at,
  };
}

/** Compute 7-day averages from a set of local rows. */
function computeSummary(
  metrics: DailyHealthMetric[],
  windowDays: number
): HealthMetricsSummary {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cut = cutoff.toISOString().slice(0, 10);
  const window = metrics.filter((m) => m.date >= cut);

  const avg = (vals: (number | null)[]): number | null => {
    const nums = vals.filter((v): v is number => v !== null);
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };

  return {
    avg_resting_hr_bpm: avg(window.map((m) => m.resting_hr_bpm)),
    avg_hrv_ms:         avg(window.map((m) => m.hrv_ms)),
    avg_sleep_hours:    avg(window.map((m) => m.sleep_hours)),
    avg_active_kcal:    avg(window.map((m) => m.active_kcal)),
    days_logged:        window.length,
    window_days:        windowDays,
  };
}

// ---------------------------------------------------------------------------
// Hook return shape (unchanged exported API)
// ---------------------------------------------------------------------------

export interface UseHealthMetricsResult {
  metrics:              DailyHealthMetric[];
  summary:              HealthMetricsSummary | null;
  isLoading:            boolean;
  error:                string | null;
  refetch:              () => Promise<void>;
  sync:                 () => Promise<void>;
  isSyncing:            boolean;
  syncError:            string | null;
  isHealthKitAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHealthMetrics(): UseHealthMetricsResult {
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);

  const [metrics,   setMetrics]   = useState<DailyHealthMetric[]>([]);
  const [summary,   setSummary]   = useState<HealthMetricsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const [isSyncing,  setIsSyncing]  = useState(false);
  const [syncError,  setSyncError]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (localFirst) {
        // ── Free path: localDb daily_health_log ────────────────────────────
        await localDb.init();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 14);
        const isoStr = cutoff.toISOString().slice(0, 10);

        // Wearable metrics (HRV / resting HR / sleep / active kcal / source) live
        // in daily_health_metrics — NOT daily_health_log (that table is the
        // survey log: log_date / mood / stress / habits, different columns). The
        // old query hit daily_health_log.date, which doesn't exist, so the read
        // always threw and was swallowed → free users saw zero metrics.
        const rows = await localDb.getAll<HealthLogRow>(
          `SELECT metric_id AS id, user_id, date, resting_hr_bpm, hrv_ms,
                  sleep_hours, active_kcal, source, created_at
             FROM daily_health_metrics WHERE date >= ? ORDER BY date DESC`,
          [isoStr]
        ).catch(() => [] as HealthLogRow[]); // defensive: pre-migration safety

        const fetchedMetrics = rows.map(rowToMetric);
        setMetrics(fetchedMetrics);
        setSummary(computeSummary(fetchedMetrics, 7));
      } else {
        // ── Pro path: REST (unchanged) ──────────────────────────────────────
        const [fetchedMetrics, fetchedSummary] = await Promise.all([
          getHealthMetrics(14),
          getHealthMetricsSummary(7),
        ]);
        setMetrics(fetchedMetrics);
        setSummary(fetchedSummary);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load health metrics'
      );
    } finally {
      setIsLoading(false);
    }
  }, [localFirst]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // HealthKit sync — writes locally for free users; calls REST for Pro
  // ---------------------------------------------------------------------------

  const sync = useCallback(async () => {
    if (!isHealthKitAvailable) return;

    setIsSyncing(true);
    setSyncError(null);

    try {
      const granted = await requestHealthKitPermissions();
      if (!granted) {
        setSyncError(
          'HealthKit access was denied. Please grant permission in Settings > Health > Peak Fettle.'
        );
        return;
      }

      const samples = await fetchHealthKitData(7);
      if (samples.length === 0) return;

      if (localFirst) {
        // ── Free: write into local daily_health_log ─────────────────────────
        await localDb.init();
        for (const sample of samples) {
          // Upsert by date. Use INSERT OR REPLACE keyed on a stable id.
          const id  = `hk-${user?.id ?? 'anon'}-${sample.date}`;
          const now = new Date().toISOString();
          await localDb.execute(
            // daily_health_metrics (PK metric_id), NOT daily_health_log — see
            // the read above. The old write targeted daily_health_log with
            // columns it doesn't have, so HealthKit data was never stored.
            `INSERT OR REPLACE INTO daily_health_metrics
               (metric_id, user_id, date, resting_hr_bpm, hrv_ms, sleep_hours, active_kcal,
                source, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'apple_healthkit', ?)`,
            [
              id, user?.id ?? '', sample.date,
              sample.restingHrBpm ?? null,
              sample.hrvMs ?? null,
              sample.sleepHours ?? null,
              sample.activeKcal ?? null,
              now,
            ],
            { tables: ['daily_health_metrics'] }
          ).catch(() => {}); // defensive: pre-migration safety
        }
        await load();
      } else {
        // ── Pro: POST to server (unchanged) ─────────────────────────────────
        await Promise.all(
          samples.map((sample) =>
            logHealthMetric({
              date:   sample.date,
              source: 'apple_healthkit',
              ...(sample.restingHrBpm !== null ? { restingHrBpm: sample.restingHrBpm } : {}),
              ...(sample.hrvMs        !== null ? { hrvMs:         sample.hrvMs }        : {}),
              ...(sample.sleepHours   !== null ? { sleepHours:    sample.sleepHours }   : {}),
              ...(sample.activeKcal   !== null ? { activeKcal:    sample.activeKcal }   : {}),
            })
          )
        );
        await load();
      }
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'HealthKit sync failed'
      );
    } finally {
      setIsSyncing(false);
    }
  }, [localFirst, load, user]);

  return {
    metrics,
    summary,
    isLoading,
    error,
    refetch: load,
    sync,
    isSyncing,
    syncError,
    isHealthKitAvailable,
  };
}
