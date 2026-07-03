/**
 * loggerLogic.ts — pure, testable helpers for the workout logger.
 * =============================================================================
 * Extracted from WorkoutLoggerHost / StepperLogger so the tricky bits are unit-
 * testable in plain node (see src/components/__tests__/loggerLogic.test.js), free
 * of React / react-native / expo imports.
 *
 * Three concerns live here — one per founder-reported logger bug:
 *
 *   1. restRemainingMs(endAt, now)      — rest-timer countdown derived from an
 *                                         ABSOLUTE deadline (single source of truth),
 *                                         so the on-screen time is correct on every
 *                                         tick / remount / foreground transition and
 *                                         never drifts against the scheduled
 *                                         notification. Clamps at 0 for a past deadline.
 *
 *   2. nextPendingExerciseIndex(...)    — the "up next" affordance and the advance
 *                                         action must skip ALREADY-COMPLETED
 *                                         exercises: search FORWARD from the current
 *                                         index, wrapping around; null when nothing
 *                                         else is pending (→ finish state). Fixes the
 *                                         "jumped ahead, then 'up next' points back at
 *                                         a done exercise" bug.
 *
 *   3. isPlannedComplete(logged, target)/ postFinalSetState(...) — once every planned
 *                                         set of an exercise is logged, the PRIMARY
 *                                         button becomes "Next exercise" / "Finish",
 *                                         and logging an extra set is demoted to a
 *                                         secondary action.
 *
 * PURITY (CLAUDE.md invariants): no Date.now() inside the helpers — the caller
 * passes `now`. No Math.random(). Identical inputs → identical output.
 * =============================================================================
 */

// ---------------------------------------------------------------------------
// Structural session types (a subset of RoutineSession / RoutineSessionExercise
// from RoutineStrip). Kept structural so this module imports nothing from RN.
// ---------------------------------------------------------------------------

export interface LoggerExercise {
  /** Number of sets logged for this exercise in the current session. */
  loggedSetCount: number;
  /** Planned target set count (routine/template). Undefined for ad-hoc/free. */
  targetSets?: number;
  /** Optional explicit "done" flag the session model may carry. */
  done?: boolean;
  /** Display name — used to build the "Next exercise: <name>" label. */
  name?: string;
}

export interface LoggerSession<E extends LoggerExercise = LoggerExercise> {
  exercises: E[];
  currentIndex: number;
}

// ---------------------------------------------------------------------------
// 1. Rest-timer remaining, from an absolute deadline
// ---------------------------------------------------------------------------

/**
 * Remaining rest in MILLISECONDS, derived from the absolute end timestamp.
 *
 * This is the single source of truth for the countdown: the value is a pure
 * function of `endAt` (set once, at the same instant the notification is
 * scheduled) and the current wall clock `now`. Because it re-derives from the
 * deadline every call, it is correct after backgrounding, navigation, or a
 * remount — there is no per-tick accumulator to drift.
 *
 *   • endAt === null / undefined  → 0  (timer idle)
 *   • deadline already passed      → 0  (clamped, never negative)
 */
export function restRemainingMs(endAt: number | null | undefined, now: number): number {
  if (endAt == null) return 0;
  const remaining = endAt - now;
  return remaining > 0 ? remaining : 0;
}

/**
 * Remaining rest in whole SECONDS, rounded UP so a 0.4s remainder still shows
 * "1" until the deadline actually passes (matches a wall-clock countdown). Clamps
 * at 0. Convenience wrapper over restRemainingMs for the UI.
 */
export function restRemainingSec(endAt: number | null | undefined, now: number): number {
  return Math.ceil(restRemainingMs(endAt, now) / 1000);
}

// ---------------------------------------------------------------------------
// 2. Completed-exercise detection + next-pending index
// ---------------------------------------------------------------------------

/**
 * True when an exercise's planned sets are all logged.
 *
 * "Completed" is defined exactly as the session model does:
 *   • If the exercise has a planned target (`targetSets` > 0), it is complete
 *     when loggedSetCount >= targetSets.
 *   • If there is NO planned target (ad-hoc / free session), we fall back to the
 *     model's own `done` flag if present, else "has at least one logged set".
 *
 * The `targetSets`-based rule takes precedence so an extra set beyond target
 * (e.g. logged set 4 of a 3-set exercise) still reads as complete.
 */
export function isExerciseCompleted(ex: LoggerExercise | undefined): boolean {
  if (!ex) return false;
  if (typeof ex.targetSets === 'number' && ex.targetSets > 0) {
    return ex.loggedSetCount >= ex.targetSets;
  }
  if (typeof ex.done === 'boolean') return ex.done;
  return ex.loggedSetCount > 0;
}

/**
 * Index of the next NON-COMPLETED exercise, searching FORWARD from `fromIndex`
 * and wrapping around the end back to the start. Returns null when every OTHER
 * exercise is complete (→ the caller should go to the finish state).
 *
 * The current exercise at `fromIndex` is considered LAST (only if we wrap all
 * the way around and it is itself still pending do we return it). This is what
 * fixes the "jumped ahead to a later exercise, came back, 'up next' pointed at
 * an already-done earlier one" bug: we always advance to the nearest remaining
 * work rather than the literal `currentIndex + 1`.
 */
export function nextPendingExerciseIndex(
  session: LoggerSession,
  fromIndex: number,
): number | null {
  const n = session.exercises.length;
  if (n === 0) return null;
  // Walk the (n-1) positions AFTER fromIndex (wrapping), then finally fromIndex
  // itself — so a pending current exercise is only chosen if nothing else remains.
  for (let step = 1; step <= n; step++) {
    const idx = (fromIndex + step) % n;
    if (!isExerciseCompleted(session.exercises[idx])) return idx;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. Post-final-set button-emphasis derivation
// ---------------------------------------------------------------------------

/**
 * True once the current exercise's planned sets are complete — i.e. the user
 * has just logged the LAST planned set (loggedSetCount >= targetSets). When
 * there is no planned target this is false (free/ad-hoc sessions never enter the
 * "planned complete" emphasis-swap state; they keep the normal "Log set N" flow).
 */
export function isPlannedComplete(
  loggedSetCount: number,
  targetSets: number | null | undefined,
): boolean {
  if (typeof targetSets !== 'number' || targetSets <= 0) return false;
  return loggedSetCount >= targetSets;
}

export interface PostFinalSetState {
  /** Are the planned sets for the current exercise complete? */
  plannedComplete: boolean;
  /**
   * Index of the exercise to advance to when planned-complete (next pending,
   * skipping done exercises, wrapping). null → no pending exercise remains
   * (the primary action should be "Finish workout").
   */
  nextIndex: number | null;
  /**
   * Label for the PRIMARY (big/bold) action once planned-complete:
   *   • "Next exercise: <name>"  when a pending exercise remains,
   *   • "Finish workout"         when none do.
   * null when not yet planned-complete (caller keeps the normal "Log set N").
   */
  primaryLabel: string | null;
  /**
   * The extra-set label ("Log set N") that swaps into the SECONDARY slot once
   * planned-complete, so the user can still log beyond target. N is the next
   * set number (loggedSetCount + 1).
   */
  extraSetLabel: string;
}

/**
 * Derive the button-emphasis state for the current exercise after a set is
 * logged (founder fix #4). When the planned sets are complete, the primary
 * action becomes "Next exercise: <name>" (or "Finish workout"), and the
 * extra-set action is demoted to secondary. `nextName` is resolved by the
 * caller from `nextIndex` (kept out of here so this stays a pure index/label fn).
 */
export function postFinalSetState(
  session: LoggerSession,
  opts?: { nextName?: string | null },
): PostFinalSetState {
  const cur = session.exercises[session.currentIndex];
  const logged = cur?.loggedSetCount ?? 0;
  const target = cur?.targetSets;
  const plannedComplete = isPlannedComplete(logged, target);
  const nextIndex = nextPendingExerciseIndex(session, session.currentIndex);
  const extraSetLabel = `Log set ${logged + 1}`;

  let primaryLabel: string | null = null;
  if (plannedComplete) {
    if (nextIndex == null) {
      primaryLabel = 'Finish workout';
    } else {
      const nm = opts?.nextName ?? session.exercises[nextIndex]?.name ?? 'next';
      primaryLabel = `Next exercise: ${nm}`;
    }
  }

  return { plannedComplete, nextIndex, primaryLabel, extraSetLabel };
}
