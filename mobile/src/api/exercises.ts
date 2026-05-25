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
      params: { q: query, limit, ...(kind && { kin