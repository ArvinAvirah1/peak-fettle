/**
 * Weekly review data layer (TICKET-105, extended TICKET-160 "ritual 2.0").
 * One row per ISO week (Monday start).
 *
 * TICKET-160 additions: `wins` + `intentions` on Reflections (additive,
 * back-compat — nextWeekIntention is still derived/persisted for old
 * readers), and reviewStreak() — a forgiving count of consecutive completed
 * weekly reviews, celebratory-only (never loss-framed) for the ritual's
 * streak chip.
 */

import { dayKey, genId, localDb } from '../db/localDb';
import { addDays, weekStart } from '../engine/streaks';
import { safeWrite } from '../lib/feedback';

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
  /** TICKET-160: 1-3 short wins captured in step 1 ("Celebrate wins"). */
  wins?: string[];
  /** TICKET-160: 1-3 intentions captured in step 4 ("Set your intentions"). */
  intentions?: string[];
}

export async function currentWeekReview(): Promise<WeeklyReviewRow | null> {
  return localDb.getFirst<WeeklyReviewRow>(
    `SELECT * FROM lo_weekly_reviews WHERE week_start = ?`,
    [weekStart(dayKey())]
  );
}

export async function saveReview(reflections: Reflections, completed: boolean): Promise<void> {
  const ws = weekStart(dayKey());

  // Back-compat: old readers only know nextWeekIntention. If the new
  // intentions list is present and nextWeekIntention wasn't explicitly set,
  // derive it from the first intention.
  const toPersist: Reflections = { ...reflections };
  if (toPersist.intentions?.length && !toPersist.nextWeekIntention) {
    toPersist.nextWeekIntention = toPersist.intentions[0];
  }

  await safeWrite(
    () =>
      localDb.execute(
        `INSERT INTO lo_weekly_reviews (id, week_start, completed_at, reflections_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (week_start) DO UPDATE SET
           completed_at = excluded.completed_at,
           reflections_json = excluded.reflections_json`,
        [genId(), ws, completed ? new Date().toISOString() : null, JSON.stringify(toPersist)],
        { tables: ['lo_weekly_reviews'] }
      ),
    { context: 'reviews.saveReview', errorMessage: "That review didn't save. Please try again." }
  );
}

export async function reviewHistory(limit = 12): Promise<WeeklyReviewRow[]> {
  return localDb.getAll<WeeklyReviewRow>(
    `SELECT * FROM lo_weekly_reviews ORDER BY week_start DESC LIMIT ?`,
    [limit]
  );
}

/**
 * Count of CONSECUTIVE weeks with a COMPLETED review (completed_at != null),
 * walking backward one week at a time from `today`. Forgiving rule: if the
 * current week's review is already completed, start counting from it;
 * otherwise start from LAST week — an in-progress or not-yet-done current
 * week never breaks the streak (the week isn't over yet). Capped at 260
 * weeks (5 years) as a safety bound. Celebratory-only signal — never
 * surfaced as a loss/break in copy.
 */
export async function reviewStreak(today = dayKey()): Promise<number> {
  const rows = await localDb.getAll<{ week_start: string }>(
    `SELECT week_start FROM lo_weekly_reviews WHERE completed_at IS NOT NULL`
  );
  const completedWeeks = new Set(rows.map((r) => r.week_start));

  let cursor = weekStart(today);
  if (!completedWeeks.has(cursor)) {
    // Current week not completed yet — don't penalize; start from last week.
    cursor = addDays(cursor, -7);
  }

  let count = 0;
  for (let i = 0; i < 260; i++) {
    if (!completedWeeks.has(cursor)) break;
    count += 1;
    cursor = addDays(cursor, -7);
  }
  return count;
}
