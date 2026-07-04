/**
 * programAdoption.ts — TICKET-132: adopt a shelf Program through the SAME
 * persistence path `planAdoption.ts` uses, so the engine owns progression
 * thereafter (spec: "Adoption runs through planAdoption so the engine owns
 * progression").
 * =============================================================================
 * `planAdoption.ts` (mobile/src/planGen/planAdoption.ts) is NOT in this
 * agent's file-ownership list (another concurrent wave-1 agent may touch it),
 * so rather than edit it, this module mirrors its exact two-step persistence
 * contract using the SAME building blocks it calls — `createRoutine`
 * (tier-branched: local SQLite for free, server for Pro) and `saveSchedule`
 * (local-first for both tiers) — applied to a shelf `Program` instead of a
 * `PlanV2`. A `Program`'s `days[]` is already the exact `RoutineExercise[]`
 * shape `mapWeekToRoutines` produces, so this is a like-for-like port of that
 * function's logic onto simpler input, not a new persistence strategy.
 *
 * See the final report for the exact patch snippet that would let
 * `planAdoption.ts` export a small `adoptRoutinesToSchedule` helper so BOTH
 * call sites (survey-driven PlanV2 adoption and this shelf) share one
 * implementation — left as a snippet rather than applied, per the file-
 * ownership rule for this ticket.
 *
 * Zero network on the free path: `createRoutine`/`saveSchedule` are the same
 * tier-branched local-first calls used everywhere else in the routines data
 * layer (src/data/routines.ts, src/data/schedule.ts) — no raw `api/*` import
 * here.
 */

import { createRoutine } from '../routines';
import type { TierUser } from '../backup/tierPolicy';
import {
  emptySchedule,
  saveSchedule,
  normalizeSchedule,
  type Schedule,
  type ScheduleSlot,
} from '../schedule';
import type { Program } from './types';

export interface AdoptProgramResult {
  routineIds: string[];
  schedule: Schedule;
}

/**
 * buildCycleScheduleForProgram — PURE: a program's adopted routines become a
 * CYCLE schedule (routines in order, no rest slot — every one of this shelf's
 * programs is a training day, unlike a survey plan which may include rest
 * sessions). Exported for unit testing, mirrors
 * `planAdoption.buildScheduleForPlan`'s cycle branch.
 */
export function buildCycleScheduleForProgram(
  routines: Array<{ id: string; name: string }>,
  now: Date,
): Schedule {
  const cycle: ScheduleSlot[] = routines.map((r) => ({ routineId: r.id, routineName: r.name }));
  return normalizeSchedule({
    ...emptySchedule('cycle'),
    mode: 'cycle',
    cycle,
    position: 0,
    updatedAt: now.toISOString(),
  });
}

/**
 * adoptProgramToSchedule — persist a shelf Program's days as routines (one
 * per day, in order) and write a cycle schedule cycling through them, exactly
 * mirroring `planAdoption.adoptPlanToSchedule`'s create-routines-then-write-
 * schedule contract. The CALLER must have already resolved any replace/keep
 * prompt against the existing schedule (see `planAdoption.hasExistingSchedule`,
 * reused as-is — no need to duplicate that read-only check).
 *
 * @param user    tier user (routine creation branches on tier — free = local
 *                SQLite only, Pro = server; see tierPolicy.ts)
 * @param userId  owner id for created routines
 * @param program the shelf program being adopted
 * @param now     clock for the schedule updatedAt stamp (call site owns the
 *                clock — no Date.now()/new Date() literal inside this module)
 */
export async function adoptProgramToSchedule(
  user: TierUser | null | undefined,
  userId: string,
  program: Program,
  now: Date,
): Promise<AdoptProgramResult> {
  const created: Array<{ id: string; name: string }> = [];
  for (const day of program.days) {
    const routine = await createRoutine(
      user,
      { name: `${program.name} - ${day.name}`, exercises: day.exercises },
      userId,
    );
    created.push({ id: routine.id, name: routine.name });
  }

  const schedule = buildCycleScheduleForProgram(created, now);
  await saveSchedule(schedule);

  return { routineIds: created.map((r) => r.id), schedule };
}
