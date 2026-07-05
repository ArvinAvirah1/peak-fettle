/**
 * Mood check-ins (TICKET-158 "Mood 2.0") — multiple check-ins per day are
 * legal at the schema level (schema v3 dropped UNIQUE(date) on
 * lo_mood_checkins), local-only storage (Q30). mood <= 2 still triggers the
 * CrisisResourcesBanner in the UI layer (TICKET-100) — that behavior is
 * unchanged, it just now applies per check-in rather than per day.
 */

import { dayKey, genId, localDb } from '../db/localDb';
import { safeWrite } from '../lib/feedback';

export const MOOD_TAGS = [
  'sleep_good',
  'sleep_bad',
  'stressed',
  'calm',
  'social',
  'lonely',
  'active',
  'tired',
  'focused',
  'anxious',
] as const;

export type MoodTag = (typeof MOOD_TAGS)[number];

export const TAG_LABELS: Record<MoodTag, string> = {
  sleep_good: 'Slept well',
  sleep_bad: 'Slept badly',
  stressed: 'Stressed',
  calm: 'Calm',
  social: 'Social',
  lonely: 'Lonely',
  active: 'Active',
  tired: 'Tired',
  focused: 'Focused',
  anxious: 'Anxious',
};

export interface MoodRow {
  id: string;
  ts: string;
  date: string;
  mood: number;
  tags_json: string;
  note: string | null;
}

/**
 * Always a plain INSERT — multiple check-ins per day are legal (schema v3
 * dropped UNIQUE(date)). Replaces the old upsertMood; there is no ON
 * CONFLICT path anymore.
 */
export async function addMood(input: {
  mood: 1 | 2 | 3 | 4 | 5;
  tags: MoodTag[];
  note?: string | null;
  date?: string;
}): Promise<void> {
  const day = input.date ?? dayKey();
  await safeWrite(
    () =>
      localDb.execute(
        `INSERT INTO lo_mood_checkins (id, ts, date, mood, tags_json, note) VALUES (?, ?, ?, ?, ?, ?)`,
        [genId(), new Date().toISOString(), day, input.mood, JSON.stringify(input.tags), input.note ?? null],
        { tables: ['lo_mood_checkins'] }
      ),
    { context: 'mood.addMood', errorMessage: "That check-in didn't save. Please try again." }
  );
}

/** Latest check-in of the given day (or today), if any. */
export async function moodForDay(date?: string): Promise<MoodRow | null> {
  return localDb.getFirst<MoodRow>(
    `SELECT * FROM lo_mood_checkins WHERE date = ? ORDER BY ts DESC LIMIT 1`,
    [date ?? dayKey()]
  );
}

/** All check-ins for the given day (or today), earliest first. */
export async function moodsForDay(date?: string): Promise<MoodRow[]> {
  return localDb.getAll<MoodRow>(
    `SELECT * FROM lo_mood_checkins WHERE date = ? ORDER BY ts ASC`,
    [date ?? dayKey()]
  );
}

/**
 * At most one row per day (the latest of each day), ordered date DESC,
 * limited to `days` rows — the Today sparkline consumes this and expects
 * one point per day regardless of how many check-ins happened that day.
 */
export async function recentMoods(days = 14): Promise<MoodRow[]> {
  return localDb.getAll<MoodRow>(
    `SELECT m.* FROM lo_mood_checkins m
     JOIN (SELECT date, MAX(ts) AS mts FROM lo_mood_checkins GROUP BY date) g
       ON m.date = g.date AND m.ts = g.mts
     ORDER BY m.date DESC LIMIT ?`,
    [days]
  );
}

export async function moodCount(): Promise<number> {
  const row = await localDb.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM lo_mood_checkins`);
  return row?.n ?? 0;
}

// --- exercises -------------------------------------------------------------------

export interface ExerciseRow {
  id: string;
  slug: string;
  type: string;
  pack: string | null;
  title: string;
  body: string;
  duration_sec: number;
}

export async function listExercises(): Promise<ExerciseRow[]> {
  return localDb.getAll<ExerciseRow>(`SELECT * FROM lo_exercises ORDER BY type, title`);
}

export async function getExercise(slug: string): Promise<ExerciseRow | null> {
  return localDb.getFirst<ExerciseRow>(`SELECT * FROM lo_exercises WHERE slug = ?`, [slug]);
}

export async function logExerciseCompletion(exerciseId: string): Promise<void> {
  await localDb.execute(
    `INSERT INTO lo_exercise_completions (id, exercise_id, ts) VALUES (?, ?, ?)`,
    [genId(), exerciseId, new Date().toISOString()]
  );
}

export async function completionsThisWeek(weekStartDay: string): Promise<number> {
  const row = await localDb.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM lo_exercise_completions WHERE ts >= ?`,
    [`${weekStartDay}T00:00:00`]
  );
  return row?.n ?? 0;
}
