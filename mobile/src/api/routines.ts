/**
 * Routines API — TICKET-055/056
 * User-saved single-session workout routines.
 * Each routine has an ordered exercises list with per-exercise targets.
 */

import { apiClient } from './client';

/**
 * SUBS-001: one user-preloaded substitute for a routine exercise (e.g. bench →
 * DB press). `exercise_id` is a library UUID when known, null for name-only
 * entries (same convention as RoutineExercise.exercise_id — name is the display
 * source of truth). Stored per-routine inside RoutineExercise.substitutes;
 * GLOBAL (all-routines) substitutes live in the on-device
 * `exercise_substitutes` table instead (src/data/substitutes.ts).
 */
export interface SubstituteRef {
  exercise_id?: string | null;
  name: string;
}

export interface RoutineExercise {
  // TICKET-088: optional — template/free-typed exercises have no library UUID.
  exercise_id?: string | null;
  name: string;
  target_sets?: number;
  target_reps?: string; // e.g. "8-12" or "5"
  // ── S2 supersets & dropsets (additive, optional) ─────────────────────────
  // Absent fields ⇒ exactly today's behaviour everywhere (back-compat).
  /**
   * Superset group id/letter. Members of the same group share this value and are
   * CONTIGUOUS in the exercises[] array; they are performed back-to-back with rest
   * only after each round. null/absent = ungrouped.
   */
  superset_group?: string | null;
  /**
   * Shared round count for the superset group, stored ON EACH member (same value)
   * for simplicity. While grouped this supersedes each member's target_sets.
   */
  superset_rounds?: number | null;
  /**
   * Dropset prescription for this exercise. `last_n` = which sets are dropset sets
   * (a number = the last N sets, or the literal 'all'); `drops` = drops per chain
   * (default 2); `drop_pct` = weight reduction per drop as a percentage (default 20).
   * null/absent = no dropsets prescribed.
   */
  dropset?: { last_n: number | 'all'; drops?: number; drop_pct?: number } | null;
  /**
   * SUBS-001: this slot's preloaded substitute exercises (max 10), shown first
   * in the swap sheet. Additive + optional — absent ⇒ exactly today's
   * behaviour. Routine-scoped; the merge with GLOBAL substitutes happens at
   * read time in the UI (never persisted merged).
   */
  substitutes?: SubstituteRef[] | null;
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
  return res.data?.routines ?? [];
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
