/**
 * Templates API — thin wrapper around GET /templates (public, no auth).
 * Templates are the built-in global workout programs (PPL, Upper-Lower, etc.)
 * seeded in migrations/20260517_template_library.sql.
 *
 * The templates.tsx screen fetches these inline; this module centralises
 * the fetch for reuse in the Log tab RoutineStrip (TICKET-055).
 */

import { apiClient } from './client';

export interface TemplateExercise {
  id: string;
  session_id: string;
  exercise_name: string;
  sets: number;
  reps: string;        // e.g. "8-12"
  rest_seconds?: number;
  form_cue?: string;
  order_index: number;
}

export interface TemplateSession {
  id: string;
  day_number: number;
  session_name: string;
  notes?: string;
  exercises: TemplateExercise[];
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  description: string;
  discipline: string;
  experience_level: 'beginner' | 'intermediate' | 'advanced' | 'elite';
  days_per_week: number;
  is_featured: boolean;
  created_at: string;
  sessions?: TemplateSession[];
}

/** List all templates. Optionally filter by discipline or experience_level. */
export async function getTemplates(opts?: {
  discipline?: string;
  experience_level?: string;
}): Promise<WorkoutTemplate[]> {
  const res = await apiClient.get<{ templates: WorkoutTemplate[] }>('/templates', {
    params: opts,
  });
  return res.data.templates;
}

/** Fetch a single template with its full session + exercise list. */
export async function getTemplate(id: string): Promise<WorkoutTemplate> {
  const res = await apiClient.get<WorkoutTemplate>(`/templates/${id}`);
  return res.data;
}
