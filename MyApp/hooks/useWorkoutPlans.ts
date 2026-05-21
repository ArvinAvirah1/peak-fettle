/**
 * useWorkoutPlans
 *
 * Reads workout plans from local SQLite — both AI-generated (paid tier) and
 * static templates (free tier).  Plans are synced down by PowerSync after
 * generation or seeding; once on-device they are available 100% offline.
 *
 * Schema reference: migrations/20260430_initial_schema.sql
 * `structure` column: JSONB on Postgres, JSON string in SQLite.
 */

import { useCallback, useMemo } from 'react';
import { useDB, useQuery } from '@/lib/db/system';

// ---------------------------------------------------------------------------
// Types — mirrors the `structure` JSONB format produced by Haiku
// ---------------------------------------------------------------------------

export interface PlanExercise {
  exercise_id: string;
  exercise_name: string;
  sets: number;
  reps: string;          // e.g. "8-12" or "5"
  rir?: number;          // target RIR; omit = not specified
  rest_seconds: number;
  notes?: string;
}

export interface PlanDay {
  day_of_week: number;   // 0=Mon … 6=Sun
  session_name: string;  // e.g. "Push Day A"
  exercises: PlanExercise[];
  rest_day?: boolean;    // true = active rest, no exercises
}

export interface PlanWeek {
  week_number: number;   // 1-based
  days: PlanDay[];
}

export interface PlanStructure {
  goal: string;
  reasoning: string;     // Haiku's explanation of why this plan suits the user
  weeks: PlanWeek[];
}

export interface Plan {
  id: string;
  user_id: string | null; // null for global templates
  name: string;
  is_template: number;    // 0 | 1
  is_ai_generated: number; // 0 | 1
  is_active: number;      // 0 | 1
  structure: string;      // JSON string — parse with parsePlanStructure()
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helper: parse structure JSON safely
// ---------------------------------------------------------------------------

export function parsePlanStructure(raw: string): PlanStructure | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: ISO weekday 0=Mon … 6=Sun
// ---------------------------------------------------------------------------
function todayDow(): number {
  return (new Date().getDay() + 6) % 7;
}

// ---------------------------------------------------------------------------
// Hook: active plan + today's session
// ---------------------------------------------------------------------------

export function useWorkoutPlans() {
  // The user's active AI plan (if any)
  const { data: activePlanRows, isLoading: planLoading } = useQuery<Plan>(
    'SELECT * FROM plans WHERE is_active = 1 LIMIT 1'
  );
  const activePlan = activePlanRows[0] ?? null;

  const parsedPlan = useMemo(
    () => (activePlan ? parsePlanStructure(activePlan.structure) : null),
    [activePlan]
  );

  // Today's scheduled session — derived from the parsed plan (no extra table needed)
  const todaySession = useMemo<PlanDay | null>(() => {
    if (!parsedPlan) return null;
    const dow = todayDow();
    // Walk through all weeks and find any day matching today's weekday.
    // Use the last week's prescription if the plan has multiple progressive weeks.
    let found: PlanDay | null = null;
    for (const week of parsedPlan.weeks) {
      const day = week.days.find((d) => d.day_of_week === dow);
      if (day) found = day;
    }
    return found;
  }, [parsedPlan]);

  // Free-tier static templates
  const { data: templates, isLoading: templatesLoading } = useQuery<Plan>(
    'SELECT * FROM plans WHERE is_template = 1 ORDER BY name ASC'
  );

  // User's full plan history (non-templates)
  const { data: planHistory, isLoading: historyLoading } = useQuery<Plan>(
    'SELECT * FROM plans WHERE is_template = 0 ORDER BY created_at DESC'
  );

  return {
    activePlan,
    parsedPlan,
    todaySession,
    templates,
    planHistory,
    isLoading: planLoading || templatesLoading || historyLoading,
  };
}

// ---------------------------------------------------------------------------
// Hook: plan detail for a specific plan
// ---------------------------------------------------------------------------

export function usePlanDetail(planId: string) {
  const { data: planRows, isLoading } = useQuery<Plan>(
    'SELECT * FROM plans WHERE id = ? LIMIT 1',
    [planId]
  );

  const plan = planRows[0] ?? null;
  const parsedPlan = useMemo(
    () => (plan ? parsePlanStructure(plan.structure) : null),
    [plan]
  );

  // Group by week for the plan viewer screen
  const weekMap = useMemo<Map<number, PlanDay[]>>(() => {
    const m = new Map<number, PlanDay[]>();
    if (!parsedPlan) return m;
    for (const week of parsedPlan.weeks) {
      m.set(week.week_number, week.days);
    }
    return m;
  }, [parsedPlan]);

  return { plan, parsedPlan, weekMap, isLoading };
}

// ---------------------------------------------------------------------------
// Hook: mutations — activate, deactivate
// These write locally; PowerSync uploads to Supabase in the background.
// The server validates is_active via the plans RLS policy.
// ---------------------------------------------------------------------------

export function usePlanActions() {
  const db = useDB();

  /** Switch to a new active plan. Deactivates all others first. */
  const activatePlan = useCallback(
    async (planId: string): Promise<void> => {
      const now = new Date().toISOString();
      // Deactivate everything first
      await db.execute(
        'UPDATE plans SET is_active = 0, updated_at = ? WHERE is_active = 1',
        [now]
      );
      // Then activate the chosen plan
      await db.execute(
        'UPDATE plans SET is_active = 1, updated_at = ? WHERE id = ?',
        [now, planId]
      );
    },
    [db]
  );

  /** Stop following any plan (freestyle). */
  const deactivateAllPlans = useCallback(async (): Promise<void> => {
    const now = new Date().toISOString();
    await db.execute(
      'UPDATE plans SET is_active = 0, updated_at = ? WHERE is_active = 1',
      [now]
    );
  }, [db]);

  return { activatePlan, deactivateAllPlans };
}

// ---------------------------------------------------------------------------
// Hook: user constraints (injury / equipment limits)
// Used to display what exercises the plan generator will avoid.
// ---------------------------------------------------------------------------

export interface UserConstraint {
  id: string;             // server-side constraint_id, aliased as id by sync rule
  user_id: string;
  constraint_type: string;
  custom_note: string | null;
  created_at: string;
}

export function useUserConstraints() {
  const db = useDB();

  const { data: constraints, isLoading } = useQuery<UserConstraint>(
    'SELECT * FROM user_constraints ORDER BY constraint_type ASC'
  );

  const addConstraint = useCallback(
    async (constraintType: string, customNote?: string): Promise<void> => {
      const id = (await import('@/lib/db/utils')).generateId();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT OR IGNORE INTO user_constraints
           (id, user_id, constraint_type, custom_note, created_at)
         VALUES (?, (SELECT current_setting('request.jwt.claim.sub', true)), ?, ?, ?)`,
        [id, constraintType, customNote ?? null, now]
      );
    },
    [db]
  );

  const removeConstraint = useCallback(
    async (constraintId: string): Promise<void> => {
      await db.execute('DELETE FROM user_constraints WHERE id = ?', [constraintId]);
    },
    [db]
  );

  return { constraints, isLoading, addConstraint, removeConstraint };
}
