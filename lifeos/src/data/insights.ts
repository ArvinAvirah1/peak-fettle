/**
 * Insights (TICKET-109) — weekly recap + soft correlations, all computed
 * locally. Copy guardrails (spec §TICKET-109): correlation-not-causation,
 * dismissable, minimum data thresholds before anything is shown.
 */

import { dayKey, localDb } from '../db/localDb';
import { addDays, weekStart } from '../engine/streaks';
import type { LogStatus } from '../engine/streaks';

export interface WeeklyRecap {
  weekStartDay: string;
  habitsDone: number;
  habitsEligible: number;
  avgMoodThisWeek: number | null;
  avgMoodLastWeek: number | null;
  exercisesCompleted: number;
  blocksHeld: number;
  /** One non-judgmental highlight line, or null. */
  brightSpot: string | null;
}

export async function buildWeeklyRecap(today = dayKey()): Promise<WeeklyRecap> {
  const ws = weekStart(today);
  const lastWs = addDays(ws, -7);

  const habitRows = await localDb.getAll<{ date: string; status: LogStatus }>(
    `SELECT date, status FROM lo_habit_logs WHERE date >= ?`,
    [ws]
  );
  const habitsDone = habitRows.filter((r) => r.status === 'done').length;
  const habitsEligible = habitRows.length;

  const moodRow = async (from: string, to: string): Promise<number | null> => {
    const row = await localDb.getFirst<{ avg: number | null; n: number }>(
      `SELECT AVG(mood) AS avg, COUNT(*) AS n FROM lo_mood_checkins WHERE date >= ? AND date < ?`,
      [from, to]
    );
    return row && row.n >= 3 ? row.avg : null; // threshold: ≥3 check-ins
  };
  const avgMoodThisWeek = await moodRow(ws, addDays(ws, 7));
  const avgMoodLastWeek = await moodRow(lastWs, ws);

  const exRow = await localDb.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM lo_exercise_completions WHERE ts >= ?`,
    [`${ws}T00:00:00`]
  );
  const heldRow = await localDb.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM lo_focus_events WHERE kind = 'unlock_abandoned' AND ts >= ?`,
    [`${ws}T00:00:00`]
  );

  // Bright spot: best current habit streak this week, if any habit was done.
  let brightSpot: string | null = null;
  const topHabit = await localDb.getFirst<{ name: string; n: number }>(
    `SELECT h.name AS name, COUNT(*) AS n
     FROM lo_habit_logs l JOIN lo_habits h ON h.id = l.habit_id
     WHERE l.date >= ? AND l.status = 'done'
     GROUP BY h.id ORDER BY n DESC, h.name ASC LIMIT 1`,
    [ws]
  );
  if (topHabit && topHabit.n >= 3) {
    brightSpot = `“${topHabit.name}” showed up ${topHabit.n} times this week.`;
  }

  return {
    weekStartDay: ws,
    habitsDone,
    habitsEligible,
    avgMoodThisWeek,
    avgMoodLastWeek,
    exercisesCompleted: exRow?.n ?? 0,
    blocksHeld: heldRow?.n ?? 0,
    brightSpot,
  };
}

// ---------------------------------------------------------------------------

export interface CorrelationInsight {
  key: string;
  text: string;
}

/**
 * Mood × habit-consistency correlation over the last 90 days. Shown only
 * with ≥14 mood check-ins AND ≥14 habit-logged days (spec thresholds).
 * Framed softly: observed difference, never advice.
 */
export async function moodHabitCorrelation(today = dayKey()): Promise<CorrelationInsight | null> {
  const since = addDays(today, -90);

  const moods = await localDb.getAll<{ date: string; mood: number }>(
    `SELECT date, mood FROM lo_mood_checkins WHERE date >= ?`,
    [since]
  );
  if (moods.length < 14) return null;

  const habitDays = await localDb.getAll<{ date: string }>(
    `SELECT DISTINCT date FROM lo_habit_logs WHERE date >= ? AND status = 'done'`,
    [since]
  );
  if (habitDays.length < 14) return null;

  const habitSet = new Set(habitDays.map((r) => r.date));
  const onDays: number[] = [];
  const offDays: number[] = [];
  for (const m of moods) {
    (habitSet.has(m.date) ? onDays : offDays).push(m.mood);
  }
  if (onDays.length < 5 || offDays.length < 5) return null;

  const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  const onAvg = avg(onDays);
  const offAvg = avg(offDays);
  if (Math.abs(onAvg - offAvg) < 0.3) return null; // not worth surfacing

  return {
    key: 'mood-habit-90d',
    text: `Over the last 90 days, your average mood was ${onAvg.toFixed(1)} on days you completed a habit vs ${offAvg.toFixed(1)} on days you didn't. Just an observation — patterns, not prescriptions.`,
  };
}
