/**
 * starterSplits — on-device "starter splits" served as WorkoutTemplate[].
 *
 * Why this exists (perf / local-first): the Routines page and the Home
 * RoutineStrip used to fetch the starter splits from the server (GET /templates,
 * axios 15s timeout). On the free/local-first path that cold Railway round-trip
 * was the #1 startup-lag complaint — the whole Routines page blocked on it even
 * though the user's own routines come from on-device SQLite instantly.
 *
 * The splits are static, curated content (the same PPL / Upper-Lower programs
 * already bundled in beginnerTemplates.ts for the Home quick-start), so there is
 * no reason to pay a network round-trip for them. This module adapts the bundled
 * BEGINNER_PROGRAMS into the exact WorkoutTemplate shape the UI already renders,
 * so the screens swap `await getTemplates()` for a synchronous, offline-safe call
 * with no other UI changes. Personal data stays local; this is global content.
 */

import {
  BEGINNER_PROGRAMS,
  bundledExerciseName,
  BundledProgram,
} from './beginnerTemplates';
import type {
  WorkoutTemplate,
  TemplateSession,
  TemplateExercise,
} from '../api/templates';

/** Convert one bundled program into the server-shaped WorkoutTemplate. */
function programToTemplate(p: BundledProgram): WorkoutTemplate {
  const sessions: TemplateSession[] = p.days.map((day, dayIdx) => {
    const sessionId = `${p.id}:${day.slug}`;
    const exercises: TemplateExercise[] = day.exercises.map((ref, exIdx) => ({
      id: `${sessionId}:${exIdx}`,
      session_id: sessionId,
      exercise_name: bundledExerciseName(ref.slug),
      sets: ref.sets,
      reps: ref.reps,
      order_index: exIdx,
    }));
    return {
      id: sessionId,
      day_number: dayIdx + 1,
      session_name: day.name,
      exercises,
    };
  });

  return {
    id: p.id,
    name: p.name,
    description: p.subtitle,
    // discipline drives the goal-filter chips on the Routines page; these splits
    // are hypertrophy-style PPL / Upper-Lower. The name-based heuristic in
    // routines.tsx (templateGoals) also tags PPL splits as 'ppl'.
    discipline: 'hypertrophy',
    experience_level: 'beginner',
    days_per_week: p.daysPerWeek,
    is_featured: true,
    created_at: '',
    sessions,
  };
}

// Built once on first access; the bundled programs never change at runtime.
let cache: WorkoutTemplate[] | null = null;

/** All starter splits, fully populated with sessions/exercises. No network. */
export function getStarterSplits(): WorkoutTemplate[] {
  if (!cache) cache = BEGINNER_PROGRAMS.map(programToTemplate);
  return cache;
}

/** Look up a single starter split by id (program id, e.g. 'ppl-3'). */
export function getStarterSplit(id: string): WorkoutTemplate | undefined {
  return getStarterSplits().find((t) => t.id === id);
}
