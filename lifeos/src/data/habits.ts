/**
 * Habits & stacks data layer (TICKET-103) — CRUD over localDb.
 * One shared model (Q22): a stack is an ordered habit group with a time or
 * event anchor; solo habits have stack_id = NULL.
 *
 * v3 additions (TICKET-151/153/154/156/157): habit_type/target_value/
 * target_unit/weekly_quota on habits (quantity/timer tracking + weekly
 * quota cadence); value/note on logs (quantity accumulation + check-off
 * notes); lo_habit_pauses (forgiving pause windows, bridged transparently
 * by the engine). Every write function is wrapped in safeWrite (frozen
 * contract, src/lib/feedback.ts) so failures toast instead of throwing.
 */

import { dayKey, genId, localDb } from '../db/localDb';
import {
  computeStreak,
  computeWeeklyQuotaStreak,
  isPausedOn,
  LogStatus,
  PauseRange,
  quantityStatus,
  StreakResult,
  weekProgress,
  WeekProgress,
  WeeklyStreakResult,
} from '../engine/streaks';
import { safeWrite } from '../lib/feedback';

export type AnchorType = 'time' | 'event';
export type AnchorEvent = 'wake' | 'workout_logged' | 'focus_session_end' | 'wind_down';
export type HabitType = 'boolean' | 'quantity' | 'timer';

export interface StackRow {
  id: string;
  name: string;
  anchor_type: AnchorType;
  anchor_value: string;
  archived_at: string | null;
  created_at: string;
}

export interface HabitRow {
  id: string;
  name: string;
  icon: string;
  cadence: string;
  stack_id: string | null;
  stack_position: number | null;
  est_duration_sec: number | null;
  forgiving_rules_json: string;
  trigger_event: string | null;
  source_protocol_id: string | null;
  archived_at: string | null;
  created_at: string;
  habit_type: HabitType;
  target_value: number | null;
  target_unit: string | null;
  weekly_quota: number | null;
}

export interface HabitLogRow {
  id: string;
  habit_id: string;
  date: string;
  status: LogStatus;
  ts: string;
  value: number | null;
  note: string | null;
}

export interface HabitPauseRow {
  id: string;
  habit_id: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
}

// --- stacks -------------------------------------------------------------------

export async function createStack(input: {
  name: string;
  anchorType: AnchorType;
  anchorValue: string;
}): Promise<string> {
  const id = genId();
  // safeWrite already toasts on failure; the id is still returned so callers
  // (e.g. navigation to the new stack) don't need to special-case failure —
  // a follow-up read will simply find nothing if the insert didn't happen.
  await safeWrite(
    () =>
      localDb.execute(
        `INSERT INTO lo_stacks (id, name, anchor_type, anchor_value, created_at) VALUES (?, ?, ?, ?, ?)`,
        [id, input.name, input.anchorType, input.anchorValue, new Date().toISOString()]
      ),
    { context: 'habits.createStack' }
  );
  return id;
}

export async function listStacks(): Promise<StackRow[]> {
  return localDb.getAll<StackRow>(
    `SELECT * FROM lo_stacks WHERE archived_at IS NULL ORDER BY created_at ASC`
  );
}

export async function archiveStack(id: string): Promise<void> {
  await safeWrite(
    async () => {
      const now = new Date().toISOString();
      await localDb.execute(`UPDATE lo_stacks SET archived_at = ? WHERE id = ?`, [now, id]);
      await localDb.execute(`UPDATE lo_habits SET archived_at = ? WHERE stack_id = ?`, [now, id]);
    },
    { context: 'habits.archiveStack' }
  );
}

// --- habits -------------------------------------------------------------------

export async function createHabit(input: {
  name: string;
  icon?: string;
  cadence?: string;
  stackId?: string | null;
  stackPosition?: number | null;
  estDurationSec?: number | null;
  triggerEvent?: string | null;
  sourceProtocolId?: string | null;
  habitType?: HabitType;
  targetValue?: number | null;
  targetUnit?: string | null;
  weeklyQuota?: number | null;
}): Promise<string> {
  const id = genId();
  const cadence = input.weeklyQuota != null ? 'weekly' : input.cadence ?? 'daily';
  // id generated up front so a Promise<string> can always be returned, even
  // if safeWrite swallows a failure below (it has already toasted by then).
  await safeWrite(
    () =>
      localDb.execute(
        `INSERT INTO lo_habits (id, name, icon, cadence, stack_id, stack_position, est_duration_sec, trigger_event, source_protocol_id, created_at, habit_type, target_value, target_unit, weekly_quota)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.name,
          input.icon ?? 'leaf-outline',
          cadence,
          input.stackId ?? null,
          input.stackPosition ?? null,
          input.estDurationSec ?? null,
          input.triggerEvent ?? null,
          input.sourceProtocolId ?? null,
          new Date().toISOString(),
          input.habitType ?? 'boolean',
          input.targetValue ?? null,
          input.targetUnit ?? null,
          input.weeklyQuota ?? null,
        ]
      ),
    { context: 'habits.createHabit' }
  );
  return id;
}

export async function updateHabit(
  id: string,
  patch: Partial<
    Pick<
      HabitRow,
      | 'name'
      | 'icon'
      | 'cadence'
      | 'stack_id'
      | 'stack_position'
      | 'est_duration_sec'
      | 'habit_type'
      | 'target_value'
      | 'target_unit'
      | 'weekly_quota'
    >
  >
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    sets.push(`${key} = ?`);
    params.push(value);
  }
  if (sets.length === 0) return;
  params.push(id);
  await safeWrite(
    () =>
      localDb.execute(`UPDATE lo_habits SET ${sets.join(', ')} WHERE id = ?`, params, {
        tables: ['lo_habits'],
      }),
    { context: 'habits.updateHabit' }
  );
}

/** Soft-delete: archived, never lost. */
export async function archiveHabit(id: string): Promise<void> {
  await safeWrite(
    () =>
      localDb.execute(`UPDATE lo_habits SET archived_at = ? WHERE id = ?`, [
        new Date().toISOString(),
        id,
      ]),
    { context: 'habits.archiveHabit' }
  );
}

export async function listHabits(): Promise<HabitRow[]> {
  return localDb.getAll<HabitRow>(
    `SELECT * FROM lo_habits WHERE archived_at IS NULL
     ORDER BY stack_id IS NULL, stack_id, stack_position, created_at`
  );
}

export async function habitsInStack(stackId: string): Promise<HabitRow[]> {
  return localDb.getAll<HabitRow>(
    `SELECT * FROM lo_habits WHERE stack_id = ? AND archived_at IS NULL ORDER BY stack_position ASC`,
    [stackId]
  );
}

// --- logs -----------------------------------------------------------------------

export async function logHabit(
  habitId: string,
  status: LogStatus,
  date?: string,
  note?: string
): Promise<void> {
  const day = date ?? dayKey();
  await safeWrite(
    () =>
      localDb.execute(
        `INSERT INTO lo_habit_logs (id, habit_id, date, status, ts, note) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (habit_id, date) DO UPDATE SET status = excluded.status, ts = excluded.ts, note = COALESCE(excluded.note, lo_habit_logs.note)`,
        [genId(), habitId, day, status, new Date().toISOString(), note ?? null],
        { tables: ['lo_habit_logs'] }
      ),
    { context: 'habits.logHabit' }
  );
  if (status === 'done') {
    // Cross-app whole-person streak (TICKET-111): fire-and-forget presence
    // marker — a date and nothing else. Offline/free-tier failures are fine;
    // the local-first app never depends on this call.
    void import('../api/lifeos')
      .then(({ pingActivity }) => pingActivity(day))
      .catch(() => undefined);
  }
}

export async function clearLog(habitId: string, date: string): Promise<void> {
  await safeWrite(
    () =>
      localDb.execute(`DELETE FROM lo_habit_logs WHERE habit_id = ? AND date = ?`, [habitId, date]),
    { context: 'habits.clearLog' }
  );
}

export async function logsForHabit(habitId: string): Promise<Map<string, LogStatus>> {
  const rows = await localDb.getAll<HabitLogRow>(
    `SELECT * FROM lo_habit_logs WHERE habit_id = ?`,
    [habitId]
  );
  return new Map(rows.map((r) => [r.date, r.status]));
}

export async function todayLogs(date?: string): Promise<Map<string, LogStatus>> {
  const day = date ?? dayKey();
  const rows = await localDb.getAll<HabitLogRow>(`SELECT * FROM lo_habit_logs WHERE date = ?`, [day]);
  return new Map(rows.map((r) => [r.habit_id, r.status]));
}

/** Full log rows for one habit, most recent first. */
export async function historyForHabit(habitId: string, limit = 400): Promise<HabitLogRow[]> {
  return localDb.getAll<HabitLogRow>(
    `SELECT * FROM lo_habit_logs WHERE habit_id = ? ORDER BY date DESC LIMIT ?`,
    [habitId, limit]
  );
}

/**
 * Accumulate a quantity/timer value for one day (quantity steppers, timer
 * stop — for timers both `delta` and the habit's target_value are MINUTES).
 * Reads the habit's target + the existing day row, adds `delta`, derives the
 * new status via quantityStatus, and upserts the single (habit_id, date) row
 * — preserving any existing note. Fires the same pingActivity side effect as
 * logHabit when the day flips to 'done'.
 *
 * On safeWrite failure, returns the PRIOR value/status (not the optimistic
 * new one) so the UI doesn't lie forward about an accumulation that didn't
 * actually persist.
 */
export async function addQuantity(
  habitId: string,
  delta: number,
  date?: string
): Promise<{ value: number; status: LogStatus }> {
  const day = date ?? dayKey();
  const habit = await localDb.getFirst<HabitRow>(`SELECT * FROM lo_habits WHERE id = ?`, [habitId]);
  const existing = await localDb.getFirst<HabitLogRow>(
    `SELECT * FROM lo_habit_logs WHERE habit_id = ? AND date = ?`,
    [habitId, day]
  );
  const priorValue = existing?.value ?? 0;
  const priorStatus: LogStatus = existing?.status ?? quantityStatus(priorValue, habit?.target_value ?? null);
  const newValue = priorValue + delta;
  const newStatus = quantityStatus(newValue, habit?.target_value ?? null);

  const result = await safeWrite(
    async () => {
      await localDb.execute(
        `INSERT INTO lo_habit_logs (id, habit_id, date, status, ts, value) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (habit_id, date) DO UPDATE SET status = excluded.status, ts = excluded.ts, value = excluded.value`,
        [genId(), habitId, day, newStatus, new Date().toISOString(), newValue],
        { tables: ['lo_habit_logs'] }
      );
      // `note` is intentionally absent from the UPDATE SET list above: SQLite's
      // upsert only touches listed columns, so an existing note survives
      // untouched (same preservation contract as logHabit's COALESCE).
      return { value: newValue, status: newStatus };
    },
    { context: 'habits.addQuantity' }
  );

  if (result === undefined) {
    // Write failed (already toasted) — report the prior, unpersisted-change
    // state so the caller's UI doesn't show progress that didn't save.
    return { value: priorValue, status: priorStatus };
  }

  if (newStatus === 'done' && priorStatus !== 'done') {
    void import('../api/lifeos')
      .then(({ pingActivity }) => pingActivity(day))
      .catch(() => undefined);
  }

  return result;
}

/**
 * Set/replace the note on a day's log row (T157 check-off-with-note flow).
 * If no row exists yet for (habitId, date), inserts one with status 'done'.
 */
export async function setLogNote(habitId: string, date: string, note: string): Promise<void> {
  await safeWrite(
    () =>
      localDb.execute(
        `INSERT INTO lo_habit_logs (id, habit_id, date, status, ts, note) VALUES (?, ?, ?, 'done', ?, ?)
         ON CONFLICT (habit_id, date) DO UPDATE SET note = excluded.note`,
        [genId(), habitId, date, new Date().toISOString(), note],
        { tables: ['lo_habit_logs'] }
      ),
    { context: 'habits.setLogNote' }
  );
}

export async function streakForHabit(habitId: string, today?: string): Promise<StreakResult> {
  const logs = await logsForHabit(habitId);
  const pauses = await pausesForHabit(habitId);
  return computeStreak(logs, today ?? dayKey(), { pauses });
}

/** Pause-aware weekly quota streak for one habit. */
export async function weeklyStreakForHabit(
  habitId: string,
  quota: number,
  today?: string
): Promise<WeeklyStreakResult> {
  const logs = await logsForHabit(habitId);
  const pauses = await pausesForHabit(habitId);
  return computeWeeklyQuotaStreak(logs, today ?? dayKey(), quota, { pauses });
}

/** This-week progress for a weekly-quota habit; null when it has no quota. */
export async function weekProgressForHabit(
  habit: HabitRow,
  today?: string
): Promise<WeekProgress | null> {
  if (habit.weekly_quota == null) return null;
  const logs = await logsForHabit(habit.id);
  return weekProgress(logs, today ?? dayKey(), habit.weekly_quota);
}

/**
 * Unified streak summary for a habit card, regardless of cadence: weekly
 * quota habits report a week-unit chain (no daily grace/at-risk semantics —
 * those are meaningless at week granularity), everything else reports the
 * standard pause-aware daily chain.
 */
export async function streakSummaryForHabit(
  habit: HabitRow,
  today?: string
): Promise<{
  current: number;
  longest: number;
  milestone: 7 | 30 | 100 | 365 | null;
  unit: 'day' | 'week';
  atRisk: boolean;
  graceDaysUsed: string[];
}> {
  if (habit.weekly_quota != null) {
    const weekly = await weeklyStreakForHabit(habit.id, habit.weekly_quota, today);
    return {
      current: weekly.current,
      longest: weekly.longest,
      milestone: weekly.milestone,
      unit: 'week',
      atRisk: false,
      graceDaysUsed: [],
    };
  }
  const daily = await streakForHabit(habit.id, today);
  return {
    current: daily.current,
    longest: daily.longest,
    milestone: daily.milestone,
    unit: 'day',
    atRisk: daily.atRisk,
    graceDaysUsed: daily.graceDaysUsed,
  };
}

/**
 * Whole-person-style "any habit active" merged log map — used by Today and
 * the cross-app streak (TICKET-111): a day is 'done' if any habit was done,
 * else 'rest' if any rest, else 'skip' if any skip.
 */
export async function mergedDailyLogs(): Promise<Map<string, LogStatus>> {
  const rows = await localDb.getAll<{ date: string; status: LogStatus }>(
    `SELECT date, status FROM lo_habit_logs`
  );
  const rank: Record<LogStatus, number> = { done: 3, rest: 2, skip: 1 };
  const merged = new Map<string, LogStatus>();
  for (const r of rows) {
    const existing = merged.get(r.date);
    if (!existing || rank[r.status] > rank[existing]) merged.set(r.date, r.status);
  }
  return merged;
}

// --- pauses (TICKET-156) --------------------------------------------------------

export async function listPauses(habitId: string): Promise<HabitPauseRow[]> {
  return localDb.getAll<HabitPauseRow>(
    `SELECT * FROM lo_habit_pauses WHERE habit_id = ? ORDER BY start_date DESC`,
    [habitId]
  );
}

/** The pause covering `day` (default today), or null if the habit isn't paused then. */
export async function activePause(habitId: string, day?: string): Promise<HabitPauseRow | null> {
  const target = day ?? dayKey();
  const rows = await listPauses(habitId);
  for (const p of rows) {
    if (isPausedOn(target, [p])) return p;
  }
  return null;
}

/** habit_id → covering pause for `day` (default today), one query, for list rendering. */
export async function activePauses(day?: string): Promise<Map<string, HabitPauseRow>> {
  const target = day ?? dayKey();
  const rows = await localDb.getAll<HabitPauseRow>(
    `SELECT * FROM lo_habit_pauses WHERE start_date <= ? AND (end_date IS NULL OR end_date >= ?)`,
    [target, target]
  );
  const map = new Map<string, HabitPauseRow>();
  for (const p of rows) {
    // A habit could theoretically have overlapping pause rows; first match
    // wins (list order is DB-returned, not significant here).
    if (!map.has(p.habit_id)) map.set(p.habit_id, p);
  }
  return map;
}

export async function createPause(
  habitId: string,
  startDate: string,
  endDate: string | null,
  reason?: string | null
): Promise<string> {
  const id = genId();
  await safeWrite(
    () =>
      localDb.execute(
        `INSERT INTO lo_habit_pauses (id, habit_id, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)`,
        [id, habitId, startDate, endDate, reason ?? null],
        { tables: ['lo_habit_pauses'] }
      ),
    { context: 'habits.createPause' }
  );
  return id;
}

export async function endPause(pauseId: string, endDate: string): Promise<void> {
  await safeWrite(
    () =>
      localDb.execute(`UPDATE lo_habit_pauses SET end_date = ? WHERE id = ?`, [endDate, pauseId], {
        tables: ['lo_habit_pauses'],
      }),
    { context: 'habits.endPause' }
  );
}

/** Lean pause ranges for the engine (no id/reason baggage). */
export async function pausesForHabit(habitId: string): Promise<PauseRange[]> {
  const rows = await listPauses(habitId);
  return rows.map((r) => ({ start_date: r.start_date, end_date: r.end_date }));
}

/**
 * Full day rows keyed by habit_id for one date (status + value + note) —
 * the Habits screen needs value/note per row, not just status (T153/T157).
 */
export async function todayLogRows(date?: string): Promise<Map<string, HabitLogRow>> {
  const day = date ?? dayKey();
  const rows = await localDb.getAll<HabitLogRow>(`SELECT * FROM lo_habit_logs WHERE date = ?`, [day]);
  return new Map(rows.map((r) => [r.habit_id, r]));
}
