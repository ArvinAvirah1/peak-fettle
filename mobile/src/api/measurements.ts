/**
 * Measurements API module — TICKET-130 body measurements (Pro sync).
 *
 * Server docs: peak-fettle-agents/server/routes/measurements.js
 *
 * Free tier NEVER calls this — measurements.ts (the tier-branched data layer)
 * branches on isLocalFirst() and only reaches this module on the Pro path.
 */

import { apiClient } from './client';

export interface ApiMeasurement {
  id: string;
  metric: string;
  value: number;
  unit: 'cm' | 'in' | 'pct';
  logged_at: string;
}

export interface UpsertMeasurementPayload {
  id: string;
  metric: string;
  value: number;
  unit: 'cm' | 'in' | 'pct';
  loggedAt: string;
}

/** Fetch measurement history, optionally filtered to one metric. */
export async function getMeasurements(metric?: string): Promise<ApiMeasurement[]> {
  const response = await apiClient.get<{ measurements: ApiMeasurement[] }>('/measurements', {
    params: metric ? { metric } : undefined,
  });
  return response.data?.measurements ?? [];
}

/** Upsert one logged measurement entry (idempotent on id). */
export async function upsertMeasurement(
  payload: UpsertMeasurementPayload,
): Promise<ApiMeasurement> {
  const response = await apiClient.post<ApiMeasurement>('/measurements', payload);
  return response.data;
}

/** Delete a measurement entry by id. */
export async function deleteMeasurement(id: string): Promise<void> {
  await apiClient.delete(`/measurements/${id}`);
}
