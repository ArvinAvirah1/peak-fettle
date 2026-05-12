/**
 * Sets API module — log, list, and delete workout sets.
 *
 * Server docs: peak-fettle-agents/server/routes/sets.js
 *
 * GET /sets accepts either:
 *   - ?workoutId=<uuid>  — all sets for a specific workout (no cursor)
 *   - ?cursor=<ISO>&limit=<n>  — cursor-paginated scan across all user sets
 */

import { apiClient } from './client';
import { WorkoutSet, LogSetPayload, SetsPage } from '../types/api';

/**
 * Fetch sets for a specific workout (no pagination).
 */
export async function getSetsForWorkout(workoutId: string): Promise<WorkoutSet[]> {
  const response = await apiClient.get<SetsPage>('/sets', {
    params: { workoutId },
  });
  return response.data.sets;
}

/**
 * Fetch a paginated page of sets across all workouts.
 * @param cursor - ISO timestamp from the previous page's nextCursor. Omit for first page.
 * @param limit  - Page size (1–200, default 50).
 */
export async function getSets(cursor?: string, limit = 50): Promise<SetsPage> {
  const response = await apiClient.get<SetsPage>('/sets', {
    params: {
      ...(cursor && { cursor }),
      limit,
    },
  });
  return response.data;
}

/**
 * Log a new lift or cardio set.
 * The server verifies workout ownership before inserting (T-03).
 */
export async function logSet(payload: LogSetPayload): Promise<WorkoutSet> {
  const response = await apiClient.post<WorkoutSet>('/sets', payload);
  return response.data;
}

/**
 * Delete a set by ID (ownership checked server-side).
 */
export async function deleteSet(id: string): Promise<void> {
  await apiClient.delete(`/sets/${id}`);
}
