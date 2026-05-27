/**
 * Routines API — TICKET-055/056
 * User-saved single-session workout routines.
 * Each routine has an ordered exercises list with per-exercise targets.
 */

import { apiClient } from './client';

export interface RoutineExercise {
  exercise_id: string;
  name: string;
  target_sets?: number;
  target_reps?: string; // e.g. "8-12" or "5"
}

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  exercises: RoutineExercise[];
  created_at: string;
  updated_at: string;
}

export interface CreateRoutinePayload {
  name: string;
  exercises: RoutineExercise[];
}

/** Fetch all routines for the current user (ordered by last updated). */
export async function getRoutines(): Promise<Routine[]> {
  const res = await apiClient.get<{ routines: Routine[] }>('/routines');
  return res.data.routines;
}

/** Fetch a single routine by ID. */
export async function getRoutine(id: string): Promise<Routine> {
  const res = await apiClient.get<Routine>(`/routines/${id}`);
  return res.data;
}

/** Create a new routine. */
export async function createRoutine(payload: CreateRoutinePayload): Promise<Routine> {
  const res = await apiClient.post<Routine>('/routines', payload);
  return res.data;
}

/** Replace a routine (full update). */
export async function updateRoutine(id: string, payload: CreateRoutinePayload): Promise<Routine> {
  const res = await apiClient.put<Routine>(`/routines/${id}`, payload);
  return res.data;
}

/** Partially update a routine (name or exercises). */
export async function patchRoutine(
  id: string,
  patch: Partial<CreateRoutinePayload>
): Promise<Routine> {
  const res = await apiClient.patch<Routine>(`/routines/${id}`, patch);
  return res.data;
}

/** Delete a routine. */
export async function deleteRoutine(id: string): Promise<void> {
  await apiClient.delete(`/routines/${id}`);
}
