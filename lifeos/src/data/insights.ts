/**
 * Insights (TICKET-109 + TICKET-159) — weekly recap + soft correlations, all
 * computed locally. Copy guardrails (spec §TICKET-109): correlation-not-
 * causation, dismissable, minimum data thresholds before anything is shown.
 *
 * TICKET-159 "Year-in-pixels + insights presentation" adds:
 *   - moodYear(): a per-day mood aggregate for the year-in-pixels grid.
 *   - checkinsOnDay(): raw check-in rows for the day-detail list (schema v3
 *     allows MULTIPLE check-ins per day — no UNIQUE(date) anymore).
 *   - tagCorrelations(): per-tag mood correlation over the last 90 days.
 *
 * Threshold summary (kept intentionally conservative — sparse data produces
 * noisy, misleading "insights"):
 *   - buildWeeklyRecap: a week's avg mood only shown with ≥3 check-ins.
 *   - moodHabitCorrelation: ≥14 mood-days AND ≥14 distinct done-habit days
 *     over 90 days, ≥5 on-days AND ≥5 off-days, |diff| ≥ 0.3.
 *   - tagCorrelations: ≥14 total mood-days over 90 days, each tag needs ≥7
 *     days present AND ≥7 days absent, |diff| ≥ 0.4; top 3 by |diff|.
 * All framing is observational, never advice ("Just an observation —
 * patterns, not prescriptions.").
 */

import { dayKey, localDb } from '../db/localDb';
import { addDays, weekStart } from '../engine/streaks';
import type { LogStatus } from '../engine/streaks';
import { MOOD_TAGS, TAG_LABELS, type MoodTag } from './mood';

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
 * with ≥14 mood-DAYS AND ≥14 habit-logged days (spec thresholds).
 * Framed softly: observed difference, never advice.
 *
 * TICKET-159: schema v3 allows multiple check-ins per day, so moods are
 * first collapsed to one avg-per-day value (GROUP BY date) before the
 * on-day/off-day split — a day with 3 check-ins should count once, not 3x.
 */
export async function moodHabitCorrelation(today = dayKey()): Promise<CorrelationInsight | null> {
  const since = addDays(today, -90);

  const moodDays = await localDb.getAll<{ date: string; avg: number }>(
    `SELECT date, AVG(mood) AS avg FROM lo_mood_checkins WHERE date >= ? GROUP BY date`,
    [since]
  );
  if (moodDays.length < 14) return null;

  const habitDays = await localDb.getAll<{ date: string }>(
    `SELECT DISTINCT date FROM lo_habit_logs WHERE date >= ? AND status = 'done'`,
    [since]
  );
  if (habitDays.length < 14) return null;

  const habitSet = new Set(habitDays.map((r) => r.date));
  const onDays: number[] = [];
  const offDays: number[] = [];
  for (const m of moodDays) {
    (habitSet.has(m.date) ? onDays : offDays).push(m.avg);
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

// ---------------------------------------------------------------------------
// TICKET-159 — year-in-pixels + day detail + tag correlations
// ---------------------------------------------------------------------------

export interface DayMood {
  date: string;
  avg: number;
  count: number;
}

/**
 * Per-day mood aggregate for the year-in-pixels grid. One row per day that
 * has at least one check-in (days with none are simply absent — callers
 * build a Map keyed by date and treat missing keys as "no data").
 */
export async function moodYear(days = 366, endDay: string = dayKey()): Promise<DayMood[]> {
  const start = addDays(endDay, -(days - 1));
  return localDb.getAll<DayMood>(
    `SELECT date, AVG(mood) AS avg, COUNT(*) AS count
     FROM lo_mood_checkins
     WHERE date >= ? AND date <= ?
     GROUP BY date`,
    [start, endDay]
  );
}

export interface CheckinRow {
  id: string;
  ts: string;
  mood: number;
  tags_json: string;
  note: string | null;
}

/** All check-ins for one calendar day, oldest first (schema v3: no UNIQUE(date)). */
export async function checkinsOnDay(date: string): Promise<CheckinRow[]> {
  return localDb.getAll<CheckinRow>(
    `SELECT id, ts, mood, tags_json, note FROM lo_mood_checkins WHERE date = ? ORDER BY ts ASC`,
    [date]
  );
}

/**
 * Per-tag mood correlation over the last 90 days. For each of the 10 mood
 * tags: a day "has" the tag if ANY check-in that day carries it. Requires
 * ≥14 total mood-days, the tag present on ≥7 days AND absent on ≥7 days,
 * and |avgWith − avgWithout| ≥ 0.4. Returns up to 3 insights, largest
 * |diff| first. Same observational framing as moodHabitCorrelation — never
 * clinical, never advice.
 */
export async function tagCorrelations(today = dayKey()): Promise<CorrelationInsight[]> {
  const since = addDays(today, -90);

  const rows = await localDb.getAll<{ date: string; mood: number; tags_json: string }>(
    `SELECT date, mood, tags_json FROM lo_mood_checkins WHERE date >= ?`,
    [since]
  );
  if (rows.length === 0) return [];

  // Per-day avg mood.
  const moodByDay = new Map<string, { sum: number; n: number }>();
  // Per-day tag presence.
  const tagsByDay = new Map<string, Set<MoodTag>>();

  for (const row of rows) {
    const cur = moodByDay.get(row.date) ?? { sum: 0, n: 0 };
    cur.sum += row.mood;
    cur.n += 1;
    moodByDay.set(row.date, cur);

    let parsed: unknown = [];
    try {
      parsed = JSON.parse(row.tags_json);
    } catch {
      parsed = [];
    }
    if (Array.isArray(parsed)) {
      const set = tagsByDay.get(row.date) ?? new Set<MoodTag>();
      for (const t of parsed) {
        if (typeof t === 'string' && (MOOD_TAGS as readonly string[]).includes(t)) {
          set.add(t as MoodTag);
        }
      }
      tagsByDay.set(row.date, set);
    }
  }

  const totalMoodDays = moodByDay.size;
  if (totalMoodDays < 14) return [];

  const dayAvg = (date: string): number => {
    const m = moodByDay.get(date);
    return m ? m.sum / m.n : 0;
  };

  const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

  const candidates: { tag: MoodTag; diff: number; withAvg: number; withoutAvg: number }[] = [];

  for (const tag of MOOD_TAGS) {
    const withDays: number[] = [];
    const withoutDays: number[] = [];
    for (const date of moodByDay.keys()) {
      const hasTag = tagsByDay.get(date)?.has(tag) ?? false;
      (hasTag ? withDays : withoutDays).push(dayAvg(date));
    }
    if (withDays.length < 7 || withoutDays.length < 7) continue;

    const withAvg = avg(withDays);
    const withoutAvg = avg(withoutDays);
    const diff = Math.abs(withAvg - withoutAvg);
    if (diff < 0.4) continue;

    candidates.push({ tag, diff, withAvg, withoutAvg });
  }

  candidates.sort((a, b) => b.diff - a.diff);

  return candidates.slice(0, 3).map(({ tag, withAvg, withoutAvg }) => ({
    key: `tag-${tag}-90d`,
    text: `On days tagged “${TAG_LABELS[tag]}”, your average mood was ${withAvg.toFixed(1)} — vs ${withoutAvg.toFixed(1)} on days without it. An observation from your own entries, not advice.`,
  }));
}
