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

// ---------------------------------------------------------------------------
// DEV MOCK — seed exercises so the picker works without a backend.
// ---------------------------------------------------------------------------
const MOCK_EXERCISES: Exercise[] = [
  { id: 'ex-001', name: 'Bench Press', category: 'lift', muscle_groups: ['chest', 'triceps', 'shoulders'], is_compound: true },
  { id: 'ex-002', name: 'Squat', category: 'lift', muscle_groups: ['quads', 'glutes', 'hamstrings'], is_compound: true },
  { id: 'ex-003', name: 'Deadlift', category: 'lift', muscle_groups: ['back', 'glutes', 'hamstrings'], is_compound: true },
  { id: 'ex-004', name: 'Overhead Press', category: 'lift', muscle_groups: ['shoulders', 'triceps'], is_compound: true },
  { id: 'ex-005', name: 'Barbell Row', category: 'lift', muscle_groups: ['back', 'biceps'], is_compound: true },
  { id: 'ex-006', name: 'Pull Up', category: 'lift', muscle_groups: ['back', 'biceps'], is_compound: true },
  { id: 'ex-007', name: 'Dumbbell Curl', category: 'lift', muscle_groups: ['biceps'], is_compound: false },
  { id: 'ex-008', name: 'Tricep Pushdown', category: 'lift', muscle_groups: ['triceps'], is_compound: false },
  { id: 'ex-009', name: 'Running', category: 'cardio', muscle_groups: ['legs'], is_compound: true },
  { id: 'ex-010', name: 'Cycling', category: 'cardio', muscle_groups: ['legs'], is_compound: true },
];

const MOCK_LIBRARY: ExerciseLibrary = {
  exercises: {
    lift: MOCK_EXERCISES.filter(e => e.category === 'lift'),
    cardio: MOCK_EXERCISES.filter(e => e.category === 'cardio'),
    sport: [],
    mobility: [],
  },
};

export async function getExercises(kind?: ExerciseCategory): Promise<ExerciseLibrary> {
  try {
    const response = await apiClient.get<ExerciseLibrary>('/exercises', {
      params: kind ? { kind } : undefined,
    });
    return response.data;
  } catch {
    return MOCK_LIBRARY;
  }
}

export async function searchExercises(
  query: string,
  limit = 50,
  kind?: ExerciseCategory
): Promise<ExerciseSearchResult> {
  try {
    const response = await apiClient.get<ExerciseSearchResult>('/exercises/search', {
      params: { q: query, limit, ...(kind && { kind }) },
    });
    return response.data;
  } catch {
    const q = query.toLowerCase();
    const results = MOCK_EXERCISES.filter(
      e => e.name.toLowerCase().includes(q) && (!kind || e.category === kind)
    ).slice(0, limit);
    return { results, total: results.length };
  }
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

// Re-export Exercise for convenience so screens can import from one place