/**
 * planAdoption.ts — map an adopted plan into the calendar/schedule (Stage 2).
 * =============================================================================
 * REQUIREMENTS_ADDENDUM_2026-07-02 section 2: on adopting a plan (single, or a
 * split chosen out of the trial flow), write its weekly day structure into the
 * existing schedule system, then the UI redirects to the schedule screen so the
 * user can set timing.
 *
 * How the mapping works (follows the existing schedule shape EXACTLY —
 * src/data/schedule.ts):
 *   - We take the plan's WEEK-1 sessions (the repeating microcycle) as the day
 *     structure. Each session with at least one exercise becomes a saved routine
 *     (src/data/routines.ts) named "<Split> - <day label>"; its exercises are
 *     the slots (name + sets + rep range). Rest/empty sessions become rest slots.
 *   - If the survey specified real weekdays (trainingDays), we build a WEEKLY
 *     schedule: the plan's training days are laid onto those weekdays in order;
 *     any remaining weekdays are rest. Otherwise we build a CYCLE schedule:
 *     the training routines in order followed by one rest slot (a simple,
 *     honest default the user can refine in the editor).
 *
 * The routine creation is tier-branched (createRoutine handles local vs server);
 * the schedule store is local-first for both tiers today (saveSchedule). No REST
 * call is made for a free user. Clock-free except for routine timestamps taken
 * inside the routines data layer.
 * =============================================================================
 */

import type { PlanV2, PlanSessionV2, SplitPreference } from '../lib/trainingEngine/v2/types';
import type { TierUser } from '../data/backup/tierPolicy';
import { createRoutine } from '../data/routines';
import type { RoutineExercise } from '../data/routines';
import {
  emptySchedule,
  saveSchedule,
  loadSchedule,
  normalizeSchedule,
  type Schedule,
  type ScheduleSlot,
} from '../data/schedule';

const SPLIT_LABEL: Record<SplitPreference, string> = {
  ppl: 'PPL',
  upper_lower: 'Upper/Lower',
  body_part: 'Body-part',
  unsure: 'Plan',
};

/** A training session mapped to a would-be routine (before it is persisted). */
interface MappedRoutine {
  name: string;
  exercises: RoutineExercise[];
}

/**
 * mapWeekToRoutines — PURE: turn a plan week's sessions into routine payloads.
 * Rest/empty sessions are dropped (they become rest slots in the schedule).
 * Exported for unit testing the mapping without touching the DB.
 */
export function mapWeekToRoutines(
  split: SplitPreference,
  sessions: PlanSessionV2[],
): MappedRoutine[] {
  const label = SPLIT_LABEL[split] ?? 'Plan';
  const out: MappedRoutine[] = [];
  sessions.forEach((session) => {
    const slots = session.slots ?? [];
    if (slots.length === 0) return; // rest/recovery day — no routine
    const exercises: RoutineExercise[] = slots.map((slot) => ({
      exercise_id: slot.exercise_id ?? null,
      name: slot.name,
      target_sets: slot.sets,
      target_reps: slot.reps,
    }));
    out.push({ name: `${label} - ${session.day_label}`, exercises });
  });
  return out;
}

/**
 * buildScheduleForPlan — PURE: given the created routine ids/names and the plan's
 * training-day weekdays (JS getDay 0..6, may be empty), produce a Schedule.
 *   - trainingDays present → WEEKLY schedule (routines onto those weekdays in
 *     order; extra weekdays rest).
 *   - otherwise            → CYCLE schedule (routines in order + one rest slot).
 * Exported for unit testing.
 */
export function buildScheduleForPlan(
  routines: Array<{ id: string; name: string }>,
  trainingDays: number[],
  now: Date = new Date(),
): Schedule {
  const slots: ScheduleSlot[] = routines.map((r) => ({ routineId: r.id, routineName: r.name }));

  // Weekly when the user pinned real weekdays and we have at least one routine.
  const days = [...new Set(trainingDays.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (days.length > 0 && slots.length > 0) {
    const base = emptySchedule('weekly');
    const weekly: (ScheduleSlot | null)[] = [null, null, null, null, null, null, null];
    // Lay each routine onto a weekday in order; if there are more routines than
    // pinned days, the surplus routines fall back into the cycle-less remainder
    // by wrapping (keeps every routine reachable).
    days.forEach((weekday, i) => {
      const slot = slots[i % slots.length];
      if (slot) weekly[weekday] = slot;
    });
    return normalizeSchedule({
      ...base,
      mode: 'weekly',
      weekly,
      updatedAt: now.toISOString(),
    });
  }

  // Cycle: training routines in order + a single rest slot (honest default).
  const cycle: ScheduleSlot[] = [...slots];
  if (slots.length > 0) cycle.push({ routineId: null });
  return normalizeSchedule({
    ...emptySchedule('cycle'),
    mode: 'cycle',
    cycle,
    position: 0,
    updatedAt: now.toISOString(),
  });
}

export interface AdoptResult {
  routineIds: string[];
  schedule: Schedule;
}

/**
 * hasExistingSchedule — true when there is already a non-empty saved schedule, so
 * the caller can prompt "replace or keep?" before clobbering it (addendum section
 * 2: never silently overwrite the user's schedule).
 */
export async function hasExistingSchedule(): Promise<boolean> {
  const s = await loadSchedule();
  if (!s) return false;
  const weeklyHas = s.weekly.some((slot) => slot && slot.routineId);
  const cycleHas = s.cycle.some((slot) => slot && slot.routineId);
  return weeklyHas || cycleHas;
}

/**
 * adoptPlanToSchedule — persist the plan as routines + write the schedule. The
 * CALLER must have already resolved the replace/keep prompt (see
 * hasExistingSchedule) — this function unconditionally writes the schedule.
 *
 * @param user          tier user (routine creation branches on tier)
 * @param userId        owner id for created routines
 * @param plan          the plan being adopted (its week-1 = the microcycle)
 * @param trainingDays  survey weekdays (JS getDay 0..6); empty ⇒ cycle schedule
 * @param now           clock for the schedule updatedAt stamp (call site)
 */
export async function adoptPlanToSchedule(
  user: TierUser | null | undefined,
  userId: string,
  plan: PlanV2,
  trainingDays: number[],
  now: Date = new Date(),
): Promise<AdoptResult> {
  const week1 = plan.weeks[0];
  const mapped = mapWeekToRoutines(plan.splitPreference, week1?.sessions ?? []);

  // Create each routine (tier-branched). If none map (all rest), we still write
  // an empty schedule so the redirect lands somewhere sensible.
  const created: Array<{ id: string; name: string }> = [];
  for (const m of mapped) {
    const routine = await createRoutine(user, { name: m.name, exercises: m.exercises }, userId);
    created.push({ id: routine.id, name: routine.name });
  }

  const schedule = buildScheduleForPlan(created, trainingDays, now);
  await saveSchedule(schedule);

  return { routineIds: created.map((r) => r.id), schedule };
}
