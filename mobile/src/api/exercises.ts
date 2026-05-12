/**
 * Exercises API module — browse and search the global exercise library.
 *
 * Server docs: peak-fettle-agents/server/routes/exercises.js
 *
 * The server search engine scores results by:
 *   3 — exact match (name or alias)
 *   2 — prefix match
 *   1 — substring match
 * It also searches the exercise_aliases table so "bench", "benchpress",
 * "chest press" all resolve to Bench Press.
 */

import { apiClient } from './client';
import { Exercise, ExerciseCategory, ExerciseLibrary, ExerciseSearchResult } from '../types/api';

/**
 * Browse the full exercise library, grouped by category.
 * @param kind - Optional filter by category.
 */
export async function getExercises(kind?: ExerciseCategory): Promise<ExerciseLibrary> {
  const response = await apiClient.get<ExerciseLibrary>('/exercises', {
    params: kind ? { kind } : undefined,
  });
  return response.data;
}

/**
 * Search exercises by name or alias.
 * @param query - The search string (min 1 char).
 * @param limit - Max results to return (1–200, default 50).
 * @param kind  - Optional category filter.
 */
export async function searchExercises(
  query: string,
  limit = 50,
  kind?: ExerciseCategory
): Promise<ExerciseSearchResult> {
  const response = await apiClient.get<ExerciseSearchResult>('/exercises/search', {
    params: {
      q: query,
      limit,
      ...(kind && { kind }),
    },
  });
  return response.data;
}

/**
 * Fetch all known aliases for an exercise (used by admin/edit screens).
 */
export async function getExerciseAliases(exerciseId: string): Promise<{ id: string; alias: string }[]> {
  const response = await apiClient.get<{ aliases: { id: string; alias: string }[] }>(
    `/exercises/${exerciseId}/aliases`
  );
  return response.data.aliases;
}

// Re-export Exercise for convenience so screens can import from one place.
export type { Exercise };
