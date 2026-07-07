/**
 * useHealthDashboard — local-first health dashboard data for ALL tiers.
 *
 * Unlike useHealthMetrics.ts (which tier-branches between localDb and REST),
 * this hook has NO tier branch: every user, free or Pro, reads/writes
 * on-device SQLite (`daily_health_metrics`) and HealthKit/Health Connect only.
 * It never imports from src/api/* for personal data and makes no REST call.
 *
 * Mirrors useHealthMetrics.ts's local-read + local-sync patterns (date-key
 * computation, localDb.init, INSERT OR REPLACE, defensive .catch), extended
 * with the three new daily_health_metrics columns added in schema v16:
 * steps, distance_m (meters), exercise_minutes (minutes).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import { localDb } from '../db/localDb';
import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
  fetchHealthKitData,
} from '../services/healthKit';
import {
  getHealthGoals,
  setHealthGoals,
  HealthGoals,
} from '../data/healthGoals';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthDayPoint {
  date: string;
  steps: number | null;
  activeKcal: number | null;
  exerciseMinutes: number | null;
  distanceM: number | null;
  restingHrBpm: number | null;
  hrvMs: number | null;
  sleepHours: number | null;
}

export interface GoalProgress {
  value: number;
  goal: number;
  /** value / goal, clamped to [0, 1]. */
  pct: number;
  /** true when value >= goal. */
  met: boolean;
}

export interface UseHealthDashboardResult {
  today: HealthDayPoint | null;
  /** Last 14 days, newest first. */
  days: HealthDayPoint[];
  goals: HealthGoals;
  dailyProgress: {
    steps: GoalProgress;
    activeKcal: GoalProgress;
    exerciseMinutes: GoalProgress;
  };
  /** Last-7-days SUM vs (dailyGoal * 7). */
  weeklyProgress: {
    steps: GoalProgress;
    activeKcal: GoalProgress;
    exerciseMinutes: GoalProgress;
  };
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  sync: () => Promise<void>;
  isSyncing: boolean;
  syncError: string | null;
  isHealthKitAvailable: boolean;
  updateGoals: (patch: Partial<HealthGoals>) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Local DB row shape
// ---------------------------------------------------------------------------

interface HealthDayRow {
  id: string;
  date: string;
  resting_hr_bpm: number | null;
  hrv_ms: number | null;
  sleep_hours: number | null;
  active_kcal: number | null;
  steps: number | null;
  distance_m: number | null;
  exercise_minutes: number | null;
}

function rowToDayPoint(row: HealthDayRow): HealthDayPoint {
  return {
    date: row.date,
    steps: row.steps,
    activeKcal: row.active_kcal,
    exerciseMinutes: row.exercise_minutes,
    distanceM: row.distance_m,
    restingHrBpm: row.resting_hr_bpm,
    hrvMs: row.hrv_ms,
    sleepHours: row.sleep_hours,
  };
}

function makeProgress(value: number | null, goal: number): GoalProgress {
  const v = value ?? 0;
  const g = goal > 0 ? goal : 1;
  const pct = Math.min(1, Math.max(0, v / g));
  return { value: v, goal, pct, met: v >= goal };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHealthDashboard(): UseHealthDashboardResult {
  const { user } = useAuth();

  const [days, setDays] = useState<HealthDayPoint[]>([]);
  const [goals, setGoals] = useState<HealthGoals>({
    stepsDaily: 10000,
    activeKcalDaily: 500,
    exerciseMinutesDaily: 30,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await localDb.init();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const isoStr = cutoff.toISOString().slice(0, 10);

      const rows = await localDb
        .getAll<HealthDayRow>(
          `SELECT metric_id AS id, date, resting_hr_bpm, hrv_ms, sleep_hours,
                  active_kcal, steps, distance_m, exercise_minutes
             FROM daily_health_metrics WHERE date >= ? ORDER BY date DESC`,
          [isoStr],
        )
        .catch(() => [] as HealthDayRow[]); // defensive: pre-migration safety

      const fetchedGoals = await getHealthGoals();

      setDays(rows.map(rowToDayPoint));
      setGoals(fetchedGoals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // HealthKit sync — always writes locally (no tier branch)
  // ---------------------------------------------------------------------------

  const sync = useCallback(async () => {
    if (!isHealthKitAvailable) return;

    setIsSyncing(true);
    setSyncError(null);

    try {
      const granted = await requestHealthKitPermissions();
      if (!granted) {
        setSyncError(
          'HealthKit access was denied. Please grant permission in Settings > Health > Peak Fettle.',
        );
        return;
      }

      const samples = await fetchHealthKitData(7);
      if (samples.length === 0) return;

      await localDb.init();
      for (const sample of samples) {
        const id = `hk-${user?.id ?? 'anon'}-${sample.date}`;
        const now = new Date().toISOString();
        await localDb
          .execute(
            `INSERT OR REPLACE INTO daily_health_metrics
               (metric_id, user_id, date, resting_hr_bpm, hrv_ms, sleep_hours, active_kcal,
                steps, distance_m, exercise_minutes, source, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'apple_healthkit', ?)`,
            [
              id,
              user?.id ?? '',
              sample.date,
              sample.restingHrBpm ?? null,
              sample.hrvMs ?? null,
              sample.sleepHours ?? null,
              sample.activeKcal ?? null,
              sample.steps ?? null,
              sample.distanceM ?? null,
              sample.exerciseMinutes ?? null,
              now,
            ],
            { tables: ['daily_health_metrics'] },
          )
          .catch(() => {}); // defensive: pre-migration safety
      }
      await load();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'HealthKit sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [load, user]);

  // ---------------------------------------------------------------------------
  // Goals
  // ---------------------------------------------------------------------------

  const updateGoals = useCallback(async (patch: Partial<HealthGoals>) => {
    await setHealthGoals(patch);
    const fetchedGoals = await getHealthGoals();
    setGoals(fetchedGoals);
  }, []);

  // ---------------------------------------------------------------------------
  // Derived: today, daily/weekly progress
  // ---------------------------------------------------------------------------

  // Local YYYY-MM-DD (NOT toISOString, which is UTC) — matches the date-key
  // convention health-metrics.tsx's formatDate() uses for todayKey/yesterdayKey,
  // so "today" here lines up with the date rows are stored under on-device.
  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const today = useMemo(
    () => days.find((d) => d.date === todayKey) ?? null,
    [days, todayKey],
  );

  const dailyProgress = useMemo(
    () => ({
      steps: makeProgress(today?.steps ?? null, goals.stepsDaily),
      activeKcal: makeProgress(today?.activeKcal ?? null, goals.activeKcalDaily),
      exerciseMinutes: makeProgress(today?.exerciseMinutes ?? null, goals.exerciseMinutesDaily),
    }),
    [today, goals],
  );

  const weeklyProgress = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    const window = days.filter((d) => d.date >= cutoffKey);

    const sum = (vals: (number | null)[]): number =>
      vals.reduce((acc: number, v) => acc + (v ?? 0), 0);

    return {
      steps: makeProgress(sum(window.map((d) => d.steps)), goals.stepsDaily * 7),
      activeKcal: makeProgress(sum(window.map((d) => d.activeKcal)), goals.activeKcalDaily * 7),
      exerciseMinutes: makeProgress(
        sum(window.map((d) => d.exerciseMinutes)),
        goals.exerciseMinutesDaily * 7,
      ),
    };
  }, [days, goals]);

  return {
    today,
    days,
    goals,
    dailyProgress,
    weeklyProgress,
    isLoading,
    error,
    refetch: load,
    sync,
    isSyncing,
    syncError,
    isHealthKitAvailable,
    updateGoals,
  };
}
