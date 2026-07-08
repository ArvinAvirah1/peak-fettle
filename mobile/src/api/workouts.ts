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
 * Normalise a server workout row in place of trusting its wire types.
 * Older server builds serialise day_key (a Postgres DATE) as a full ISO
 * timestamp ("2026-07-05T00:00:00.000Z") and the aggregate totals
 * (COUNT/SUM) as strings — both break downstream consumers (date headers,
 * i18next plural `count`, volume math). Safe no-op on already-clean rows.
 */
export function normalizeWorkout<T extends Workout>(w: T): T {
  const raw = w as T & { total_sets?: unknown; total_volume_kg?: unknown };
  return {
    ...w,
    day_key: String(w.day_key).slice(0, 10),
    ...(raw.total_sets !== undefined && { total_sets: Number(raw.total_sets) }),
    ...(raw.total_volume_kg !== undefined && { total_volume_kg: Number(raw.total_volume_kg) }),
  };
}

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
  return (Array.isArray(response.data) ? response.data : []).map(normalizeWorkout);
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
export async function createWorkout(
  dayKey: string,
  notes?: string,
  opts?: { routineId?: string; routineName?: string }
): Promise<Workout> {
  const payload: CreateWorkoutPayload = {
    dayKey,
    ...(notes && { notes }),
    ...(opts?.routineId && { routineId: opts.routineId }),
    ...(opts?.routineName && { routineName: opts.routineName }),
  };
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

/**
 * TICKET-054: Log an intentional rest day for today.
 * Server upserts workouts(user_id, today, session_type='rest_day').
 * Returns 409 if a rest_day row already exists (idempotent guard).
 * The weekly streak cron counts rest_day rows as active days so the
 * streak is preserved without requiring a lift session.
 */
export async function logRestDay(): Promise<{ id: string; day_key: string; session_type: string }> {
  const response = await apiClient.post<{ id: string; day_key: string; session_type: string }>(
    '/workouts/rest-day'
  );
  return response.data;
}

/**
 * TICKET-054: Undo a rest day log for today.
 * Calls DELETE /workouts/rest-day/today (server checks user ownership).
 * Returns 404 if no rest_day row exists for today (safe to ignore).
 */
export async function undoRestDay(): Promise<void> {
  await apiClient.delete('/workouts/rest-day/today');
}
