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
 *   'healthkit'  — synced from Apple HealthKit (iOS)
 *   'garmin'     — synced from Garmin Connect IQ (TICKET-029)
 *   'manual'     — entered directly by the user
 */

import { apiClient } from './client';

export interface DailyHealthMetric {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  resting_hr_bpm: number | null;
  hrv_ms: number | null;
  sleep_hours: number | null;
  active_kcal: number | null;
  source: 'healthkit' | 'garmin' | 'manual';
  created_at: string;
}

export interface LogHealthMetricPayload {
  date: string; // YYYY-MM-DD
  restingHrBpm?: number;
  hrvMs?: number;
  sleepHours?: number;
  activeKcal?: number;
  source: 'healthkit' | 'garmin' | 'manual';
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
 * @param limit - Maximum number of records to return (1–90).
 */
export async function getHealthMetrics(limit = 7): Promise<DailyHealthMetric[]> {
  const response = await apiClient.get<HealthMetricsResponse>('/health-metrics', {
    params: { limit },
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
