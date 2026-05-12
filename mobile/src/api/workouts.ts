/**
 * Workouts API module — the per-day container for sets.
 *
 * Server docs: peak-fettle-agents/server/routes/workouts.js
 *
 * POST /workouts is idempotent on (user_id, day_key) — calling it twice for
 * the same day returns the existing workout (200) rather than creating a
 * duplicate (201). Clients can safely call createWorkout() on app open to
 * ensure a workout exists for today.
 */

import { apiClient } from './client';
import { Workout, CreateWorkoutPayload } from '../types/api';

/**
 * Fetch workouts for a date range. Both params are optional; omitting
 * both returns up to 90 recent workouts.
 * @param from - YYYY-MM-DD (inclusive)
 * @param to   - YYYY-MM-DD (inclusive)
 */
export async function getWorkouts(from?: string, to?: string): Promise<Workout[]> {
  const response = await apiClient.get<Workout[]>('/workouts', {
    params: {
      ...(from && { from }),
      ...(to && { to }),
    },
  });
  return response.data;
}

/**
 * Fetch a single workout by UUID.
 */
export async function getWorkout(id: string): Promise<Workout> {
  const response = await apiClient.get<Workout>(`/workouts/${id}`);
  return response.data;
}

/**
 * Create (or upsert) a workout for a given day.
 * Server returns 201 on create, 200 on existing-day upsert.
 * @param dayKey - YYYY-MM-DD e.g. "2026-05-04"
 */
export async function createWorkout(dayKey: string, notes?: string): Promise<Workout> {
  const payload: CreateWorkoutPayload = { dayKey, ...(notes && { notes }) };
  const response = await apiClient.post<Workout>('/workouts', payload);
  return response.data;
}

/**
 * Delete a workout by ID (ownership checked server-side).
 * Note: this does NOT cascade-delete sets on the client — refetch if needed.
 */
export async function deleteWorkout(id: string): Promise<void> {
  await apiClient.delete(`/workouts/${id}`);
}
