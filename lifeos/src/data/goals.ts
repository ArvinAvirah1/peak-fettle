/**
 * Goals data layer (TICKET-105, extended TICKET-161) — 6 fixed domains (Q24),
 * outcome goal -> milestones -> linked process habits. Progress stays two
 * honest signals (milestones done, linked-habit consistency); a numeric
 * metric (TICKET-161) is a third, explicit, separately-labeled signal — it is
 * never blended into the other two.
 */

import { dayKey, genId, localDb } from '../db/localDb';
import { addDays, consistency, LogStatus, weekStart } from '../engine/streaks';
import { safeWrite } from '../lib/feedback';

export type Domain = 'health' | 'professional' | 'growth' | 'interpersonal' | 'financial' | 'mind';

export const DOMAINS: { key: Domain; label: string; icon: string }[] = [
  { key: 'health', label: 'Health & Fitness', icon: 'fitness-outline' },
  { key: 'professional', label: 'Professional', icon: 'briefcase-outline' },
  { key: 'growth', label: 'Growth & Learning', icon: 'school-outline' },
  { key: 'interpersonal', label: 'Interpersonal', icon: 'people-outline' },
  { key: 'financial', label: 'Financial', icon: 'wallet-outline' },
  { key: 'mind', label: 'Mind & Wellbeing', icon: 'leaf-outline' },
];

export function domainLabel(key: Domain): string {
  return DOMAINS.find((d) => d.key === key)?.label ?? key;
}

export type GoalMetricType = 'milestone' | 'numeric' | 'habit_linked';

export interface GoalRow {
  id: string;
  domain: Domain;
  title: string;
  why: string | null;
  target_date: string | null;
  status: 'active' | 'achieved' | 'archived';
  source_protocol_id: string | null;
  created_at: string;
  metric_type: GoalMetricType;
  metric_target: number | null;
  metric_current: number | null;
}

export interface MilestoneRow {
  id: string;
  goal_id: string;
  title: string;
  due: string | null;
  position: number;
  completed_at: string | null;
}

export async function createGoal(input: {
  domain: Domain;
  title: string;
  why?: string;
  targetDate?: string | null;
  sourceProtocolId?: string | null;
  metricType?: 'milestone' | 'numeric';
  metricTarget?: number | null;
  metricCurrent?: number | null;
}): Promise<string> {
  const id = genId();
  await localDb.execute(
    `INSERT INTO lo_goals (id, domain, title, why, target_date, source_protocol_id, created_at, metric_type, metric_target, metric_current)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.domain,
      input.title,
      input.why ?? null,
      input.targetDate ?? null,
      input.sourceProtocolId ?? null,
      new Date().toISOString(),
      input.metricType ?? 'milestone',
      input.metricTarget ?? null,
      input.metricCurrent ?? null,
    ]
  );
  return id;
}

export async function listGoals(domain?: Domain): Promise<GoalRow[]> {
  if (domain) {
    return localDb.getAll<GoalRow>(
      `SELECT * FROM lo_goals WHERE status = 'active' AND domain = ? ORDER BY created_at ASC`,
      [domain]
    );
  }
  return localDb.getAll<GoalRow>(`SELECT * FROM lo_goals WHERE status = 'active' ORDER BY created_at ASC`);
}

export async function getGoal(id: string): Promise<GoalRow | null> {
  return localDb.getFirst<GoalRow>(`SELECT * FROM lo_goals WHERE id = ?`, [id]);
}

export async function setGoalStatus(id: string, status: GoalRow['status']): Promise<void> {
  await localDb.execute(`UPDATE lo_goals SET status = ? WHERE id = ?`, [status, id]);
}

// --- metric (TICKET-161) ---------------------------------------------------------

/** Patch the target and/or current value of a numeric-metric goal. */
export async function setGoalMetric(id: string, patch: { target?: number | null; current?: number | null }): Promise<void> {
  await safeWrite(
    async () => {
      const fields: string[] = [];
      const params: unknown[] = [];
      if ('target' in patch) {
        fields.push('metric_target = ?');
        params.push(patch.target ?? null);
      }
      if ('current' in patch) {
        fields.push('metric_current = ?');
        params.push(patch.current ?? null);
      }
      if (fields.length === 0) return;
      params.push(id);
      await localDb.execute(`UPDATE lo_goals SET ${fields.join(', ')} WHERE id = ?`, params);
    },
    { context: 'goals.setGoalMetric', errorMessage: "That didn't save. Please try again." }
  );
}

/**
 * Add `delta` (may be negative) to a goal's metric_current, floored at 0.
 * Returns the new value, or null if the goal doesn't exist or the write failed.
 */
export async function incrementGoalMetric(id: string, delta: number): Promise<number | null> {
  const row = await localDb.getFirst<{ metric_current: number | null }>(
    `SELECT metric_current FROM lo_goals WHERE id = ?`,
    [id]
  );
  if (!row) return null;
  const current = row.metric_current ?? 0;
  const newValue = Math.max(0, current + delta);
  const result = await safeWrite(
    async () => {
      await localDb.execute(`UPDATE lo_goals SET metric_current = ? WHERE id = ?`, [newValue, id]);
      return newValue;
    },
    { context: 'goals.incrementGoalMetric', errorMessage: "That didn't save. Please try again." }
  );
  return result ?? null;
}

// --- milestones ---------------------------------------------------------------

export async function addMilestone(goalId: string, title: string, due?: string | null): Promise<string> {
  const id = genId();
  const row = await localDb.getFirst<{ maxPos: number | null }>(
    `SELECT MAX(position) AS maxPos FROM lo_milestones WHERE goal_id = ?`,
    [goalId]
  );
  await localDb.execute(
    `INSERT INTO lo_milestones (id, goal_id, title, due, position) VALUES (?, ?, ?, ?, ?)`,
    [id, goalId, title, due ?? null, (row?.maxPos ?? -1) + 1]
  );
  return id;
}

export async function milestonesForGoal(goalId: string): Promise<MilestoneRow[]> {
  return localDb.getAll<MilestoneRow>(
    `SELECT * FROM lo_milestones WHERE goal_id = ? ORDER BY position ASC`,
    [goalId]
  );
}

export async function setMilestoneDone(id: string, done: boolean): Promise<void> {
  await localDb.execute(`UPDATE lo_milestones SET completed_at = ? WHERE id = ?`, [
    done ? new Date().toISOString() : null,
    id,
  ]);
}

export async function deleteMilestone(id: string): Promise<void> {
  await localDb.execute(`DELETE FROM lo_milestones WHERE id = ?`, [id]);
}

// --- habit linkage ---------------------------------------------------------------

export async function linkHabit(goalId: string, habitId: string): Promise<void> {
  await localDb.execute(
    `INSERT OR IGNORE INTO lo_goal_links (goal_id, habit_id) VALUES (?, ?)`,
    [goalId, habitId]
  );
}

export async function unlinkHabit(goalId: string, habitId: string): Promise<void> {
  await localDb.execute(`DELETE FROM lo_goal_links WHERE goal_id = ? AND habit_id = ?`, [goalId, habitId]);
}

export async function linkedHabitIds(goalId: string): Promise<string[]> {
  const rows = await localDb.getAll<{ habit_id: string }>(
    `SELECT habit_id FROM lo_goal_links WHERE goal_id = ?`,
    [goalId]
  );
  return rows.map((r) => r.habit_id);
}

// --- progress (two honest signals) ------------------------------------------------

export interface GoalProgress {
  milestonesDone: number;
  milestonesTotal: number;
  /** 28-day consistency of linked habits, merged. */
  habitConsistency: { active: number; eligible: number; ratio: number } | null;
}

export async function goalProgress(goalId: string, today?: string): Promise<GoalProgress> {
  const milestones = await milestonesForGoal(goalId);
  const habitIds = await linkedHabitIds(goalId);

  let habitConsistency: GoalProgress['habitConsistency'] = null;
  if (habitIds.length > 0) {
    const placeholders = habitIds.map(() => '?').join(',');
    const rows = await localDb.getAll<{ date: string; status: LogStatus }>(
      `SELECT date, status FROM lo_habit_logs WHERE habit_id IN (${placeholders})`,
      habitIds
    );
    const rank: Record<LogStatus, number> = { done: 3, rest: 2, skip: 1 };
    const merged = new Map<string, LogStatus>();
    for (const r of rows) {
      const existing = merged.get(r.date);
      if (!existing || rank[r.status] > rank[existing]) merged.set(r.date, r.status);
    }
    habitConsistency = consistency(merged, today ?? dayKey());
  }

  return {
    milestonesDone: milestones.filter((m) => m.completed_at != null).length,
    milestonesTotal: milestones.length,
    habitConsistency,
  };
}

// --- progress over time (TICKET-161) ----------------------------------------------

/**
 * Weekly cumulative milestone-completion series for a mini progress chart.
 * Fetches milestones once, then walks the last `weeks` week-buckets
 * (oldest -> newest); each bucket's cumulativeDone counts milestones whose
 * completed_at date falls on or before that week's END day (Sunday, when
 * weeks start Monday via `weekStart`/`addDays`).
 */
export async function milestoneWeeklySeries(
  goalId: string,
  weeks = 12,
  today = dayKey()
): Promise<Array<{ weekStart: string; cumulativeDone: number }>> {
  const milestones = await milestonesForGoal(goalId);
  const completedDates = milestones
    .map((m) => (m.completed_at ? m.completed_at.slice(0, 10) : null))
    .filter((d): d is string => d != null)
    .sort();

  const currentWeekStart = weekStart(today);
  const series: Array<{ weekStart: string; cumulativeDone: number }> = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(currentWeekStart, -7 * i);
    const weekEnd = addDays(ws, 6);
    let cumulativeDone = 0;
    for (const d of completedDates) {
      if (d <= weekEnd) cumulativeDone += 1;
      else break;
    }
    series.push({ weekStart: ws, cumulativeDone });
  }

  return series;
}
