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
// IMPORTANT: IDs below are stable, valid UUID v4 strings. They must be valid
// UUIDs because the server's Zod schema validates exerciseId with z.string().uuid().
// These are used only when the real /exercises API is unavailable (dev fallback).
// They do NOT correspond to real exercise IDs in the production DB — they are
// placeholders so a developer can log sets offline without UUID validation errors.
const MOCK_EXERCISES: Exercise[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Bench Press', category: 'lift', muscle_groups: ['chest', 'triceps', 'shoulders'], is_compound: true },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Squat', category: 'lift', muscle_groups: ['quads', 'glutes', 'hamstrings'], is_compound: true },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Deadlift', category: 'lift', muscle_groups: ['back', 'glutes', 'hamstrings'], is_compound: true },
  { id: '00000000-0000-0000-0000-000000000004', name: 'Overhead Press', category: 'lift', muscle_groups: ['shoulders', 'triceps'], is_compound: true },
  { id: '00000000-0000-0000-0000-000000000005', name: 'Barbell Row', category: 'lift', muscle_groups: ['back', 'biceps'], is_compound: true },
  { id: '00000000-0000-0000-0000-000000000006', name: 'Pull Up', category: 'lift', muscle_groups: ['back', 'biceps'], is_compound: true },
  { id: '00000000-0000-0000-0000-000000000007', name: 'Dumbbell Curl', category: 'lift', muscle_groups: ['biceps'], is_compound: false },
  { id: '00000000-0000-0000-0000-000000000008', name: 'Tricep Pushdown', category: 'lift', muscle_groups: ['triceps'], is_compound: false },
  { id: '00000000-0000-0000-0000-000000000009', name: 'Running', category: 'cardio', muscle_groups: ['legs'], is_compound: true },
  { id: '00000000-0000-0000-0000-000000000010', name: 'Cycling', category: 'cardio', muscle_groups: ['legs'], is_compound: true },
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
  // IMPORTANT: do NOT fall back to mock exercises on failure.
  // Mock IDs (00000000-…) are NOT rows in the production exercises table.
  // If a user picks a mock exercise and logs a set, the server returns a 500
  // FK violation and the set is lost silently. The same exercise names exist
  // in both mock and DB under *different* UUIDs, so the mock fallback looks
  // correct in the UI but breaks logging. Let the error propagate so the
  // ExercisePicker shows its "Try Again" UI — the user can retry when network
  // recovers. (Same rationale as the searchExercises catch block below.)
  const response = await apiClient.get<ExerciseLibrary>('/exercises', {
    params: kind ? { kind } : undefined,
  });
  return response.data;
}

export async function searchExercises(
  query: string,
  limit = 50,
  kind?: ExerciseCategory
): Promise<ExerciseSearchResult> {
  // TICKET-089: do NOT swallow errors here. Previously any failure returned an
  // empty result set, which is indistinguishable from "0 genuine matches" — a
  // backend 500 then presented as "No exercises found / add as custom", letting
  // users create duplicates of exercises that actually exist. Let the error
  // propagate so callers can show a distinct, retryable error state.
  //
  // IMPORTANT: do NOT fall back to mock exercises on failure. Mock IDs
  // (00000000-...) are valid UUIDs but are NOT rows in the production exercises
  // table, so logging a set against one causes a FK violation (500). (TICKET-067)
  const response = await apiClient.get<ExerciseSearchResult>('/exercises/search', {
    params: { q: query, limit, ...(kind && { kind }) },
  });
  return response.data;
}

/**
 * Create (or look up) a custom exercise by name.
 * Called when the user types an exercise name that isn't in the library.
 * Server uses INSERT ... ON CONFLICT DO NOTHING, so if the name already
 * exists the existing row's UUID is returned — safe to call redundantly.
 */
export async function createExercise(
  name: string,
  category: ExerciseCategory = 'lift'
): Promise<Exercise> {
  const response = await apiClient.post<{ exercise: Exercise }>('/exercises', {
    name: name.trim(),
    category,
    muscle_groups: [],
    is_compound: false,
  });
  return response.data.exercise;
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
