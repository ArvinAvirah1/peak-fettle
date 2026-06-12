/**
 * Habits & stacks data layer (TICKET-103) — CRUD over localDb.
 * One shared model (Q22): a stack is an ordered habit group with a time or
 * event anchor; solo habits have stack_id = NULL.
 */

import { dayKey, genId, localDb } from '../db/localDb';
import { computeStreak, LogStatus, StreakResult } from '../engine/streaks';

export type AnchorType = 'time' | 'event';
export type AnchorEvent = 'wake' | 'workout_logged' | 'focus_session_end' | 'wind_down';

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
}

export interface HabitLogRow {
  id: string;
  habit_id: string;
  date: string;
  status: LogStatus;
  ts: string;
}

// --- stacks -------------------------------------------------------------------

export async function createStack(input: {
  name: string;
  anchorType: AnchorType;
  anchorValue: string;
}): Promise<string> {
  const id = genId();
  await localDb.execute(
    `INSERT INTO lo_stacks (id, name, anchor_type, anchor_value, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, input.name, input.anchorType, input.anchorValue, new Date().toISOString()]
  );
  return id;
}

export async function listStacks(): Promise<StackRow[]> {
  return localDb.getAll<StackRow>(
    `SELECT * FROM lo_stacks WHERE archived_at IS NULL ORDER BY created_at ASC`
  );
}

export async function archiveStack(id: string): Promise<void> {
  const now = new Date().toISOString();
  await localDb.execute(`UPDATE lo_stacks SET archived_at = ? WHERE id = ?`, [now, id]);
  await localDb.execute(`UPDATE lo_habits SET archived_at = ? WHERE stack_id = ?`, [now, id]);
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
}): Promise<string> {
  const id = genId();
  await localDb.execute(
    `INSERT INTO lo_habits (id, name, icon, cadence, stack_id, stack_position, est_duration_sec, trigger_event, source_protocol_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.icon ?? 'leaf-outline',
      input.cadence ?? 'daily',
      input.stackId ?? null,
      input.stackPosition ?? null,
      input.estDurationSec ?? null,
      input.triggerEvent ?? null,
      input.sourceProtocolId ?? null,
      new Date().toISOString(),
    ]
  );
  return id;
}

export async function updateHabit(
  id: string,
  patch: Partial<Pick<HabitRow, 'name' | 'icon' | 'cadence' | 'stack_id' | 'stack_position' | 'est_duration_sec'>>
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    sets.push(`${key} = ?`);
    params.push(value);
  }
  if (sets.length === 0) return;
  params.push(id);
  await localDb.execute(`UPDATE lo_habits SET ${sets.join(', ')} WHERE id = ?`, params, {
    tables: ['lo_habits'],
  });
}

/** Soft-delete: archived, never lost. */
export async function archiveHabit(id: string): Promise<void> {
  await localDb.execute(`UPDATE lo_habits SET archived_at = ? WHERE id = ?`, [
    new Date().toISOString(),
    id,
  ]);
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

export async function logHabit(habitId: string, status: LogStatus, date?: string): Promise<void> {
  const day = date ?? dayKey();
  await localDb.execute(
    `INSERT INTO lo_habit_logs (id, habit_id, date, status, ts) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (habit_id, date) DO UPDATE SET status = excluded.status, ts = excluded.ts`,
    [genId(), habitId, day, status, new Date().toISOString()],
    { tables: ['lo_habit_logs'] }
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
  await localDb.execute(`DELETE FROM lo_habit_logs WHERE habit_id = ? AND date = ?`, [habitId, date]);
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

export async function streakForHabit(habitId: string, today?: string): Promise<StreakResult> {
  const logs = await logsForHabit(habitId);
  return computeStreak(logs, today ?? dayKey());
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
