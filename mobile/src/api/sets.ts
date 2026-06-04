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

// ---------------------------------------------------------------------------
// Personal Best
// ---------------------------------------------------------------------------

export interface PersonalBestEntry {
  weight_kg: number;
  reps: number;
  logged_at: string;
  day_key: string; // YYYY-MM-DD
}

export interface PersonalBest {
  /** Best set by estimated 1RM across all time. Null if no sets logged. */
  all_time_best: PersonalBestEntry | null;
  /** Best set (by weight) from the most recent session. Null if no sets logged. */
  last_session: PersonalBestEntry | null;
}

/**
 * Fetch all-time best and last-session best for a lift exercise.
 * Calls GET /sets/personal-best/:exerciseId (auth required).
 * Returns { all_time_best: null, last_session: null } on network failure so
 * the caller can treat missing PB as "no history yet" rather than an error.
 */
export async function getPersonalBest(exerciseId: string): Promise<PersonalBest> {
  try {
    const response = await apiClient.get<PersonalBest>(
      `/sets/personal-best/${exerciseId}`
    );
    return response.data;
  } catch (err) {
    console.warn('[PF] sets/getPersonalBest:', err instanceof Error ? err.message : String(err));
    return { all_time_best: null, last_session: null };
  }
}

/**
 * Batch all-time best lookup for a list of exercises (PRO smart-suggest).
 * Calls POST /sets/personal-best/batch (auth required).
 * Returns a map of exerciseId → best {weight_kg, reps} or null. Returns {} on
 * network failure so the caller can treat missing PBs as "no history yet".
 */
export async function getPersonalBests(
  exerciseIds: string[],
): Promise<Record<string, { weight_kg: number; reps: number } | null>> {
  if (exerciseIds.length === 0) return {};
  try {
    const response = await apiClient.post<Record<string, { weight_kg: number; reps: number } | null>>(
      '/sets/personal-best/batch',
      { exerciseIds },
    );
    return response.data;
  } catch (err) {
    console.warn('[PF] sets/getPersonalBests:', err instanceof Error ? err.message : String(err));
    return {};
  }
}
