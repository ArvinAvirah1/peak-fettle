/**
 * Health metrics API module — daily health data (HealthKit / Garmin / manual).
 *
 * Server docs: peak-fettle-agents/server/routes/healthMetrics.js
 *
 * Data is fed to the AI plan generator (POST /plans/generate) to modulate
 * training intensity. Low HRV or elevated resting HR → the AI suggests a
 * lighter session.
 *
 * Sources:
 *   'apple_healthkit' — synced from Apple HealthKit (iOS)
 *   'garmin'          — synced from Garmin Connect IQ (TICKET-029)
 *   'manual'          — entered directly by the user
 */

import { apiClient } from './client';
import { localDb } from '../db/localDb';
import type { CardioMetrics } from '../data/cardioMetrics';
import { getExerciseNameMap, displayExerciseName } from '../data/exerciseNames';

export interface DailyHealthMetric {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  resting_hr_bpm: number | null;
  hrv_ms: number | null;
  sleep_hours: number | null;
  active_kcal: number | null;
  // Must match server Zod enum: 'apple_healthkit' | 'garmin' | 'wear_os' | 'manual'
  source: 'apple_healthkit' | 'garmin' | 'wear_os' | 'manual';
  created_at: string;
}

export interface LogHealthMetricPayload {
  date: string; // YYYY-MM-DD
  restingHrBpm?: number;
  hrvMs?: number;
  sleepHours?: number;
  activeKcal?: number;
  // Must match server Zod enum: 'apple_healthkit' | 'garmin' | 'wear_os' | 'manual'
  source: 'apple_healthkit' | 'garmin' | 'wear_os' | 'manual';
}

export interface HealthMetricsSummary {
  avg_resting_hr_bpm: number | null;
  avg_hrv_ms: number | null;
  avg_sleep_hours: number | null;
  avg_active_kcal: number | null;
  days_logged: number;
  window_days: number;
}

export interface HealthMetricsResponse {
  metrics: DailyHealthMetric[];
}

/**
 * Fetch recent health metrics. Defaults to the last 7 days.
 * @param days - Number of days to look back (1–90). Server reads this as `?days=N`.
 */
export async function getHealthMetrics(days = 7): Promise<DailyHealthMetric[]> {
  const response = await apiClient.get<HealthMetricsResponse>('/health-metrics', {
    params: { days },
  });
  return response.data.metrics;
}

/**
 * Fetch the 7-day summary (averages) for the dashboard.
 */
export async function getHealthMetricsSummary(
  windowDays = 7
): Promise<HealthMetricsSummary> {
  const response = await apiClient.get<HealthMetricsSummary>(
    '/health-metrics/summary',
    { params: { window_days: windowDays } }
  );
  return response.data;
}

/**
 * Log a single day's health metric.
 * The server upserts on (user_id, date) — safe to call again if data changes.
 */
export async function logHealthMetric(
  payload: LogHealthMetricPayload
): Promise<DailyHealthMetric> {
  const response = await apiClient.post<DailyHealthMetric>(
    '/health-metrics',
    payload
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Recent cardio sessions (P5) — ON-DEVICE read of logged cardio sets + their
// rich metrics (sets.metrics_json via cardioMetrics). LOCAL-FIRST BY
// CONSTRUCTION: this never hits the network, so it is identical for free and
// Pro and is safe to call on mount. It reads the same local SQLite `sets`
// table that the workout logger writes (the Pro server sync of metrics_json is
// a later Phase-6 task), so a Pro user sees their on-device sessions here too.
// ---------------------------------------------------------------------------

/**
 * One logged cardio effort with its fixed columns and rich metrics merged.
 * `metrics` is the canonical on-device CardioMetrics shape (the same one the
 * watch-ready adapter, importCardioMetrics, returns) — null when the set has no
 * metrics_json blob.
 */
export interface CardioSessionMetric {
  /** Local `sets.id` (also the key the rich metrics are stored under). */
  id: string;
  exercise_id: string;
  exercise_name: string;
  /** Day this set belongs to (workouts.day_key, YYYY-MM-DD). */
  day_key: string;
  logged_at: string;
  duration_sec: number | null;
  distance_m: number | null;
  avg_pace_sec_per_km: number | null;
  /** Rich metrics (HR / calories / cadence / elevation / RPE / splits) or null. */
  metrics: CardioMetrics | null;
}

interface CardioSetRow {
  id: string;
  exercise_id: string | null;
  day_key: string | null;
  logged_at: string | null;
  duration_sec: number | null;
  distance_m: number | null;
  avg_pace_sec_per_km: number | null;
  metrics_json: string | null;
}

function parseMetrics(raw: string | null): CardioMetrics | null {
  if (raw == null || raw === '') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object') return null;
    return parsed as CardioMetrics;
  } catch {
    return null;
  }
}

/**
 * Read the most recent cardio sessions logged on this device, newest first.
 * Best-effort: any SQLite/JSON failure (e.g. a pre-migration `metrics_json`
 * column) degrades to an empty list rather than throwing, so the health screen
 * never crashes on a cardio read.
 *
 * @param days  look-back window in days (default 30)
 * @param limit max rows to return (default 50)
 */
export async function getRecentCardioSessions(
  days = 30,
  limit = 50,
): Promise<CardioSessionMetric[]> {
  try {
    await localDb.init();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const fromKey = cutoff.toISOString().slice(0, 10);

    // metrics_json is a v6 column; SELECT it directly. The whole read is wrapped
    // so a pre-migration install (column absent) falls back to [] below.
    const rows = await localDb.getAll<CardioSetRow>(
      `SELECT s.id              AS id,
              s.exercise_id     AS exercise_id,
              w.day_key         AS day_key,
              s.logged_at       AS logged_at,
              s.duration_sec    AS duration_sec,
              s.distance_m      AS distance_m,
              s.avg_pace_sec_per_km AS avg_pace_sec_per_km,
              s.metrics_json    AS metrics_json
         FROM sets s
         LEFT JOIN workouts w ON w.id = s.workout_id
        WHERE s.kind = 'cardio'
          AND (w.day_key IS NULL OR w.day_key >= ?)
        ORDER BY COALESCE(s.logged_at, w.day_key) DESC
        LIMIT ?`,
      [fromKey, limit],
    );

    if (rows.length === 0) return [];

    const nameMap = await getExerciseNameMap().catch(() => new Map<string, string>());
    return rows.map((r) => ({
      id: r.id,
      exercise_id: r.exercise_id ?? '',
      exercise_name: displayExerciseName(r.exercise_id ?? '', nameMap),
      day_key: r.day_key ?? (r.logged_at ? r.logged_at.slice(0, 10) : ''),
      logged_at: r.logged_at ?? '',
      duration_sec: r.duration_sec,
      distance_m: r.distance_m,
      avg_pace_sec_per_km: r.avg_pace_sec_per_km,
      metrics: parseMetrics(r.metrics_json),
    }));
  } catch {
    // Defensive: missing column/table (pre-migration) or query error → no rows.
    return [];
  }
}
