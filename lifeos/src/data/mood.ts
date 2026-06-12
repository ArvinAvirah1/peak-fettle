/**
 * Mood check-ins (TICKET-108) — one per day, local-only storage (Q30).
 * mood ≤ 2 triggers the CrisisResourcesBanner in the UI layer (TICKET-100).
 */

import { dayKey, genId, localDb } from '../db/localDb';

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

export async function upsertMood(input: {
  mood: 1 | 2 | 3 | 4 | 5;
  tags: MoodTag[];
  note?: string | null;
  date?: string;
}): Promise<void> {
  const day = input.date ?? dayKey();
  await localDb.execute(
    `INSERT INTO lo_mood_checkins (id, ts, date, mood, tags_json, note) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (date) DO UPDATE SET mood = excluded.mood, tags_json = excluded.tags_json,
       note = excluded.note, ts = excluded.ts`,
    [genId(), new Date().toISOString(), day, input.mood, JSON.stringify(input.tags), input.note ?? null],
    { tables: ['lo_mood_checkins'] }
  );
}

export async function moodForDay(date?: string): Promise<MoodRow | null> {
  return localDb.getFirst<MoodRow>(`SELECT * FROM lo_mood_checkins WHERE date = ?`, [date ?? dayKey()]);
}

export async function recentMoods(days = 14): Promise<MoodRow[]> {
  return localDb.getAll<MoodRow>(
    `SELECT * FROM lo_mood_checkins ORDER BY date DESC LIMIT ?`,
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
