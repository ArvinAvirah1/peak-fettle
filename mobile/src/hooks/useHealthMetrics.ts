/**
 * useHealthMetrics — fetches recent health metrics and manages HealthKit sync.
 *
 * On mount: loads the last 7 days from the server.
 * sync():   reads HealthKit (iOS), POSTs each day to the server, then refetches.
 *
 * Returns:
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

export interface UseHealthMetricsResult {
  metrics: DailyHealthMetric[];
  summary: HealthMetricsSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  sync: () => Promise<void>;
  isSyncing: boolean;
  syncError: string | null;
  isHealthKitAvailable: boolean;
}

export function useHealthMetrics(): UseHealthMetricsResult {
  const [metrics, setMetrics] = useState<DailyHealthMetric[]>([]);
  const [summary, setSummary] = useState<HealthMetricsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedMetrics, fetchedSummary] = await Promise.all([
        getHealthMetrics(14),
        getHealthMetricsSummary(7),
      ]);
      setMetrics(fetchedMetrics);
      setSummary(fetchedSummary);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load health metrics'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      if (samples.length === 0) {
        // No data returned (stub or no HealthKit data available)
        return;
      }

      // POST each day's data to the server (server upserts on user_id + date).
      await Promise.all(
        samples.map((sample) =>
          logHealthMetric({
            date: sample.date,
            source: 'healthkit',
            ...(sample.restingHrBpm !== null
              ? { restingHrBpm: sample.restingHrBpm }
              : {}),
            ...(sample.hrvMs !== null ? { hrvMs: sample.hrvMs } : {}),
            ...(sample.sleepHours !== null
              ? { sleepHours: sample.sleepHours }
              : {}),
            ...(sample.activeKcal !== null
              ? { activeKcal: sample.activeKcal }
              : {}),
          })
        )
      );

      await load();
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'HealthKit sync failed'
      );
    } finally {
      setIsSyncing(false);
    }
  }, [load]);

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
