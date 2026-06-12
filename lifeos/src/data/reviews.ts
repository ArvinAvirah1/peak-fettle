/**
 * Weekly review data layer (TICKET-105). One row per ISO week (Monday start).
 */

import { dayKey, genId, localDb } from '../db/localDb';
import { weekStart } from '../engine/streaks';

export interface WeeklyReviewRow {
  id: string;
  week_start: string;
  completed_at: string | null;
  reflections_json: string;
}

export interface Reflections {
  milestoneDecisions?: Record<string, 'done' | 'push' | 'drop'>;
  domainNotes?: Record<string, string>;
  nextWeekIntention?: string;
}

export async function currentWeekReview(): Promise<WeeklyReviewRow | null> {
  return localDb.getFirst<WeeklyReviewRow>(
    `SELECT * FROM lo_weekly_reviews WHERE week_start = ?`,
    [weekStart(dayKey())]
  );
}

export async function saveReview(reflections: Reflections, completed: boolean): Promise<void> {
  const ws = weekStart(dayKey());
  await localDb.execute(
    `INSERT INTO lo_weekly_reviews (id, week_start, completed_at, reflections_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (week_start) DO UPDATE SET
       completed_at = excluded.completed_at,
       reflections_json = excluded.reflections_json`,
    [genId(), ws, completed ? new Date().toISOString() : null, JSON.stringify(reflections)],
    { tables: ['lo_weekly_reviews'] }
  );
}

export async function reviewHistory(limit = 12): Promise<WeeklyReviewRow[]> {
  return localDb.getAll<WeeklyReviewRow>(
    `SELECT * FROM lo_weekly_reviews ORDER BY week_start DESC LIMIT ?`,
    [limit]
  );
}
