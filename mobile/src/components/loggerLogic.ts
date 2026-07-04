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
  /**
   * Session-only superset group id (S1). Members of the same group are performed
   * back-to-back with no rest between them (A1→A2→…→rest). null/undefined =
   * ungrouped (exactly today's flow). Groups are contiguous runs in `exercises`.
   */
  groupId?: string | null;
  /**
   * Shared round count for the group (S1). While grouped, an exercise's own
   * `targetSets` is SUPERSEDED by the group's `groupRounds` for completion — a
   * grouped member completes when loggedSetCount >= groupRounds. Ignored when the
   * exercise is ungrouped (groupId absent).
   */
  groupRounds?: number;
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
  // S1: a GROUPED exercise's completion is driven by the group's shared rounds,
  // NOT its own targetSets — every member does `groupRounds` rounds regardless of
  // its individual planned set count (founder decision: shared rounds supersede
  // per-exercise target_sets while grouped).
  if (ex.groupId != null && typeof ex.groupRounds === 'number' && ex.groupRounds > 0) {
    return ex.loggedSetCount >= ex.groupRounds;
  }
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
  // S1 group-awareness: because grouped members are CONTIGUOUS and each carries the
  // same completion rule, a fully-completed group is naturally skipped member by
  // member (every member reads completed), and entering a partially-done group
  // lands on its first pending member — no special-casing needed here beyond the
  // group-aware isExerciseCompleted above. `isGroupFullyComplete` is available for
  // callers that want to reason about a whole group explicitly.
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

// ---------------------------------------------------------------------------
// 4. Superset group sequencing (S1) — all pure, tested in loggerLogic.test.js
// ---------------------------------------------------------------------------

/**
 * The members of a superset group, in session order. Contiguous runs are the
 * common case, but this does NOT require contiguity — it returns every exercise
 * whose groupId matches, paired with its absolute index in `exercises`. `groupId`
 * null/'' → empty (ungrouped exercises are not a "group").
 */
export function groupMembers<E extends LoggerExercise>(
  exercises: E[],
  groupId: string | null | undefined,
): Array<{ index: number; exercise: E }> {
  if (groupId == null || groupId === '') return [];
  const out: Array<{ index: number; exercise: E }> = [];
  for (let i = 0; i < exercises.length; i++) {
    if (exercises[i]?.groupId === groupId) out.push({ index: i, exercise: exercises[i]! });
  }
  return out;
}

/**
 * The CURRENT round (1-based) for a grouped exercise given how many sets it has
 * logged this session. Round = loggedSetCount + 1, clamped to the group's rounds
 * (so once all rounds are logged it reports the final round, not rounds+1). Falls
 * back to `targetSets` for an ungrouped exercise, and to a single round when no
 * count is known. Never returns < 1.
 */
export function roundOf(
  exercise: LoggerExercise | undefined,
  loggedSetCount: number,
): number {
  if (!exercise) return 1;
  const rounds =
    exercise.groupId != null && typeof exercise.groupRounds === 'number' && exercise.groupRounds > 0
      ? exercise.groupRounds
      : typeof exercise.targetSets === 'number' && exercise.targetSets > 0
        ? exercise.targetSets
        : Infinity;
  const round = loggedSetCount + 1;
  if (round < 1) return 1;
  if (Number.isFinite(rounds) && round > rounds) return rounds as number;
  return round;
}

/**
 * The number of complete rounds a group has finished — i.e. the MINIMUM
 * loggedSetCount across its members (a round is "done" only when every member has
 * logged a set for it). Empty group → 0.
 */
export function completedRounds<E extends LoggerExercise>(
  exercises: E[],
  groupId: string | null | undefined,
): number {
  const members = groupMembers(exercises, groupId);
  if (members.length === 0) return 0;
  let min = Infinity;
  for (const m of members) min = Math.min(min, m.exercise.loggedSetCount);
  return Number.isFinite(min) ? min : 0;
}

/**
 * True when EVERY member of the group has logged the given 1-based `round`
 * (i.e. loggedSetCount >= round for all members). Empty group → false.
 */
export function isGroupRoundComplete<E extends LoggerExercise>(
  exercises: E[],
  groupId: string | null | undefined,
  round: number,
): boolean {
  const members = groupMembers(exercises, groupId);
  if (members.length === 0) return false;
  return members.every((m) => m.exercise.loggedSetCount >= round);
}

/**
 * True when every member of the group has finished all `groupRounds` (each
 * member's completion via isExerciseCompleted). Empty group → false.
 */
export function isGroupFullyComplete<E extends LoggerExercise>(
  exercises: E[],
  groupId: string | null | undefined,
): boolean {
  const members = groupMembers(exercises, groupId);
  if (members.length === 0) return false;
  return members.every((m) => isExerciseCompleted(m.exercise));
}

/**
 * After logging a set on a grouped member at `fromIndex`, the index of the NEXT
 * member of the SAME group that still has work THIS round — i.e. whose
 * loggedSetCount is LESS than the just-completed member's (so it hasn't caught up
 * to this round yet) AND which is not itself group-complete. Returns null when
 * the round's last member just finished (→ the round is done → the caller fires
 * rest), or when `fromIndex` is ungrouped.
 *
 * We advance in session order starting AFTER fromIndex, wrapping within the
 * group, so a 3-member circuit flows A1→A2→A3 then null (round end). A member
 * that has already caught up (equal count) is skipped — this makes the advance
 * robust if the user logged members out of order.
 */
export function nextInGroupIndex(
  session: LoggerSession,
  fromIndex: number,
): number | null {
  const exercises = session.exercises;
  const cur = exercises[fromIndex];
  if (!cur || cur.groupId == null) return null;
  const gid = cur.groupId;
  const members = groupMembers(exercises, gid);
  if (members.length <= 1) return null;
  // The round the CURRENT member just completed = its loggedSetCount (already
  // incremented by the caller's optimistic update before this runs). A peer
  // "still has work this round" when it has logged FEWER sets than the current
  // member and is not group-complete.
  const curCount = cur.loggedSetCount;
  // Walk the group members in order, starting from the one after `fromIndex`
  // (wrapping), returning the first peer that is behind this round.
  const memberIndices = members.map((m) => m.index);
  const startPos = memberIndices.indexOf(fromIndex);
  const len = memberIndices.length;
  for (let step = 1; step <= len; step++) {
    const idx = memberIndices[(startPos + step) % len]!;
    if (idx === fromIndex) continue;
    const peer = exercises[idx]!;
    if (isExerciseCompleted(peer)) continue;
    if (peer.loggedSetCount < curCount) return idx;
  }
  return null;
}

/**
 * TICKET-144 acceptance criterion 2 — grouped-set rest mode. Mirrors
 * appSettings.GroupRestMode ('after_round' | 'after_exercise') structurally
 * (this module imports nothing from appSettings — the caller reads the
 * setting and passes the mode in, keeping this pure: no clock reads, no
 * storage reads).
 */
export type RestMode = 'after_round' | 'after_exercise';

/**
 * Should REST fire after logging the set at `index`?
 *   • Ungrouped exercise → always true (today's behaviour, both modes).
 *   • Grouped, mode 'after_round' (default) → false (SUPPRESS) while another
 *     member of the group still has work THIS round (nextInGroupIndex is
 *     non-null); true at round end. This is today's behaviour, unchanged.
 *   • Grouped, mode 'after_exercise' → true on EVERY exercise transition
 *     within the group — i.e. also mid-round, immediately after each member's
 *     set (A1→A2, A2→A3, …), in addition to firing at round end. The caller
 *     (WorkoutLoggerHost/StepperLogger) still auto-advances to the next group
 *     member via nextInGroupIndex; only the rest-timer firing decision changes.
 *
 * `mode` defaults to 'after_round' so every existing call site and test keeps
 * current behavior unless it explicitly opts into 'after_exercise'.
 *
 * The one host-level predicate that gates BOTH setRestEndAt/restTimer.start and
 * the stepper's local visual rest ring (spec §3).
 */
export function restAfterSet(
  session: LoggerSession,
  index: number,
  mode: RestMode = 'after_round',
): boolean {
  const ex = session.exercises[index];
  if (!ex || ex.groupId == null) return true;
  if (mode === 'after_exercise') return true;
  return nextInGroupIndex(session, index) == null;
}

// ---------------------------------------------------------------------------
// 5. Dropset helpers (S1) — pure, tested
// ---------------------------------------------------------------------------

/**
 * The pre-fill weight (kg) for a drop at 1-based-ish `dropIndex` off a top-set
 * weight, each drop reducing by `pct` (default 0.20 = −20%) COMPOUNDING, rounded
 * to the nearest 0.5 kg. dropIndex 1 → one drop (−20%), 2 → two drops
 * (0.8·0.8 = 0.64×), etc. dropIndex <= 0 returns the (rounded) top weight.
 * Never negative.
 *
 * Rounding to 0.5 kg matches the local `sets.weight_kg` exact-kg storage and the
 * kg weight step; the caller stores the exact kg this returns.
 */
export function dropPrefillKg(
  lastWeightKg: number,
  dropIndex: number,
  pct = 0.2,
): number {
  const base = Number.isFinite(lastWeightKg) && lastWeightKg > 0 ? lastWeightKg : 0;
  const factor = Math.max(0, 1 - pct);
  const steps = dropIndex > 0 ? dropIndex : 0;
  const raw = base * Math.pow(factor, steps);
  const rounded = Math.round(raw * 2) / 2; // nearest 0.5 kg
  return rounded < 0 ? 0 : rounded;
}

/**
 * Cheap check — is this logged row a DROP row (drop.index tagged in metrics_json)?
 * Uses a substring test for '"drop"' rather than JSON.parse so the PR hot paths
 * (computePRIds, countPRsThisWeek, the PR toast) can exclude drops without paying
 * a parse per row. A row is only tagged `{ drop: {...} }` when a drop chain
 * actually starts, so this never false-positives on a plain straight set.
 */
export function isDropRow(metricsJson: string | null | undefined): boolean {
  if (metricsJson == null || metricsJson === '') return false;
  return metricsJson.indexOf('"drop"') !== -1;
}

// ---------------------------------------------------------------------------
// 6. Dropset PLAN — which sets a persisted routine marks as dropset sets (S2)
// ---------------------------------------------------------------------------

/**
 * The seeded dropset plan for an exercise (from a persisted routine's
 * `dropset` field, mapped into the session model). `lastN` = the LAST N sets are
 * dropset sets (or the literal 'all' for every set); `drops`/`dropPct` seed the
 * drop-chain ladder when a set auto-offers. Kept structural (no RN import).
 */
export interface DropsetPlan {
  lastN: number | 'all';
  drops: number;
  dropPct: number;
}

/**
 * Should the set at 1-based `ordinal` (the Nth set of this exercise, i.e.
 * loggedSetCount at log time + 1) be treated as a DROPSET set under `plan`?
 *
 *   • plan null/absent            → false (no dropsets → today's behaviour).
 *   • plan.lastN === 'all'        → every set is a dropset set → true (ordinal>=1).
 *   • plan.lastN === N (number)   → the LAST N sets of `totalSets` are dropset
 *                                   sets: true when ordinal > totalSets - N.
 *
 * `totalSets` is the exercise's planned set count for this session (group rounds
 * supersede per-exercise target_sets — the caller passes the effective total).
 * When `totalSets` is unknown/<=0 we can't locate "the last N", so only the
 * 'all' case can fire; a numeric lastN returns false (no false auto-offer).
 *
 * Boundary examples (totalSets 4):
 *   lastN 1 → only ordinal 4 is a dropset set.
 *   lastN 2 → ordinals 3 and 4.
 *   lastN 'all' → every ordinal 1..∞.
 * Pure: identical inputs → identical output.
 */
export function isDropsetPlannedSet(
  ordinal: number,
  totalSets: number | null | undefined,
  plan: DropsetPlan | null | undefined,
): boolean {
  if (!plan) return false;
  if (!Number.isFinite(ordinal) || ordinal < 1) return false;
  if (plan.lastN === 'all') return true;
  const lastN = plan.lastN;
  if (typeof lastN !== 'number' || !Number.isFinite(lastN) || lastN < 1) return false;
  // Numeric lastN needs a known total to place "the last N sets".
  if (typeof totalSets !== 'number' || !Number.isFinite(totalSets) || totalSets <= 0) {
    return false;
  }
  return ordinal > totalSets - lastN;
}

// ---------------------------------------------------------------------------
// 7. Effort display — RIR ⇄ RPE (TICKET-128)
// ---------------------------------------------------------------------------
//
// RIR (Reps In Reserve) is the ONLY stored value (sets.rir) — this is a
// display-layer toggle only, never a migration. RPE = 10 − RIR, clamped to
// the conventional 5–10 RPE band (RIR 0..5 → RPE 10..5). An RIR above 5 has
// no single well-defined RPE (anything below "somewhat hard") — per spec we
// render that as "RPE ≤ 5" rather than inventing a number below 5.
//
// Both directions are pure and total (never throw): invalid/null/undefined
// input maps to null (rirToRpe) or NaN-safe fallback behavior — callers own
// how to render a "no value" case.

/** Display mode for logged effort. Mirrors appSettings.EffortDisplay. */
export type EffortDisplay = 'rir' | 'rpe';

/**
 * Convert a stored RIR value to an RPE number, clamped to the 5–10 display
 * band. RIR values above 5 all collapse to an RPE of 5 (the caller renders
 * that case as "RPE ≤ 5" via formatEffort/rpeBandLabel — this function just
 * returns the clamped number for anything that needs the raw value).
 *
 *   rir  0 → rpe 10   (to failure)
 *   rir  2 → rpe 8
 *   rir  5 → rpe 5
 *   rir  7 → rpe 5    (clamped — "RPE ≤ 5" is the correct display, not "3")
 *
 * null/undefined/negative/non-finite RIR → null (no value to convert).
 */
export function rirToRpe(rir: number | null | undefined): number | null {
  if (rir == null || !Number.isFinite(rir) || rir < 0) return null;
  const raw = 10 - rir;
  return Math.max(5, Math.min(10, raw));
}

/**
 * True when the given RIR is high enough that its RPE is clamped (i.e. the
 * exact RPE number is not meaningful and the display should read "RPE ≤ 5"
 * rather than a specific number). RIR > 5 ⇒ true. null/undefined ⇒ false
 * (nothing to clamp — formatEffort handles the "no value" case separately).
 */
export function isRpeClamped(rir: number | null | undefined): boolean {
  return rir != null && Number.isFinite(rir) && rir > 5;
}

/**
 * Convert a user-typed RPE (5–10 display band) back to the RIR value that
 * must be STORED (sets.rir is canonical — RPE never touches the database).
 * RPE = 10 − RIR, so RIR = 10 − RPE. Input is clamped to 0–10 before
 * conversion so a stray out-of-range typed value never produces a negative
 * or absurd RIR. null/undefined/non-finite RPE → null (nothing typed yet).
 *
 *   rpe 10 → rir 0
 *   rpe  8 → rir 2
 *   rpe  5 → rir 5
 */
export function rpeToRir(rpe: number | null | undefined): number | null {
  if (rpe == null || !Number.isFinite(rpe)) return null;
  const clamped = Math.max(0, Math.min(10, rpe));
  return Math.round(10 - clamped);
}

/**
 * Human-readable effort label for a stored RIR value, honoring the display
 * mode. Returns null when there is no RIR to show (caller omits the chip).
 *
 *   mode 'rir', rir 2       → "RIR 2"
 *   mode 'rir', rir 0       → "to failure"      (unchanged existing copy)
 *   mode 'rpe', rir 2       → "RPE 8"
 *   mode 'rpe', rir 7       → "RPE ≤ 5"         (clamped band)
 *   any mode,   rir null    → null
 */
export function formatEffort(
  rir: number | null | undefined,
  mode: EffortDisplay,
): string | null {
  if (rir == null || !Number.isFinite(rir) || rir < 0) return null;
  if (mode === 'rpe') {
    const rpe = rirToRpe(rir);
    if (rpe == null) return null;
    return isRpeClamped(rir) ? 'RPE ≤ 5' : `RPE ${rpe}`;
  }
  return rir === 0 ? 'to failure' : `RIR ${rir}`;
}
