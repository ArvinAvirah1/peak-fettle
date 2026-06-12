/**
 * Goals data layer (TICKET-105) — 6 fixed domains (Q24), outcome goal →
 * milestones → linked process habits. Progress is two honest signals
 * (milestones done, linked-habit consistency), never one blended score.
 */

import { dayKey, genId, localDb } from '../db/localDb';
import { consistency, LogStatus } from '../engine/streaks';

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

export interface GoalRow {
  id: string;
  domain: Domain;
  title: string;
  why: string | null;
  target_date: string | null;
  status: 'active' | 'achieved' | 'archived';
  source_protocol_id: string | null;
  created_at: string;
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
}): Promise<string> {
  const id = genId();
  await localDb.execute(
    `INSERT INTO lo_goals (id, domain, title, why, target_date, source_protocol_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.domain, input.title, input.why ?? null, input.targetDate ?? null, input.sourceProtocolId ?? null, new Date().toISOString()]
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
