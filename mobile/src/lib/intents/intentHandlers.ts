/**
 * intentHandlers — TICKET-145 (Siri / App Intents voice logging).
 *
 * THIN, PURE handler layer for the three v1 App Intents:
 *   - LogSetIntent(reps, weight, exercise?)
 *   - StartWorkoutIntent(routine?)
 *   - StartRestIntent(seconds?)
 *
 * Design rules (unit-testable in plain node, per the ticket brief):
 *   - No native calls, no DB calls, no clock/random access in here. Every
 *     function is a pure `(payload, deps) -> Result` transform: parse +
 *     validate the intent's raw payload, resolve defaults using deps passed
 *     in by the caller, and produce a DATA-LAYER "write plan" describing what
 *     should happen. `intentBridge.ts` is the thin impure shell that gathers
 *     `deps` (current exercise, current time, local data layer) and executes
 *     the returned plan against `mobile/src/data` — this file never touches
 *     `localDb`/`localWorkouts` itself.
 *   - Time is ALWAYS passed in (`now: Date`), never read via `Date.now()`/
 *     `new Date()` in this module — keeps the module deterministic for tests
 *     and satisfies the repo's "no literal clock access" rule for generated
 *     code (CLAUDE.md §7).
 *   - Weight is ALWAYS expressed in the user's display unit at the intent
 *     boundary (that's what Siri parses from speech: "one hundred" in
 *     lb-mode is the number 100, unit 'lbs') and is converted to exact kg via
 *     `constants/units.ts` (`displayToKg`) — the SAME helper the manual
 *     logger uses. A spoken "one hundred" in lb-mode must store 45.36 kg
 *     (CLAUDE.md §2 — the 185-lb lesson, voice edition). Free-text weight
 *     strings (in case a caller needs to parse raw Siri dictation) go through
 *     `parseWeightInput` first, exactly like the manual edit path.
 *   - No REST on any tier: every plan this module returns is meant to be
 *     applied to the LOCAL data layer only (localDb via localWorkouts /
 *     data/schedule.ts), regardless of is_paid. TICKET-145's spec locks this
 *     down explicitly for v1 — a Siri-invoked write can happen with the app
 *     not foregrounded and no guaranteed auth/network context in the widget
 *     extension process, so it always lands in the same on-device SQLite
 *     store both tiers already read from (Pro's normal sync path picks it up
 *     on next app foreground/PowerSync tick, same as any other local write
 *     later reconciled — no new contract needed for v1).
 *   - Graceful failure copy: when a required piece of context is missing
 *     (no in-progress exercise for LogSetIntent, no resolvable routine for
 *     StartWorkoutIntent) the handler returns a `{ ok: false, message }`
 *     result with user-facing copy Siri can speak back — never throws.
 */

import { UnitSystem, displayToKg, displayToCenti, parseWeightInput } from '../../constants/units';

// ---------------------------------------------------------------------------
// Shared result shape
// ---------------------------------------------------------------------------

export interface IntentFailure {
  ok: false;
  /** Spoken/dialog copy for Siri / the widget confirmation — always graceful, never a stack trace. */
  message: string;
}

export type IntentResult<T> = { ok: true; plan: T } | IntentFailure;

// ---------------------------------------------------------------------------
// LogSetIntent
// ---------------------------------------------------------------------------

/** Raw payload as received from the App Intent (Swift passes these as strings/numbers via the App Group JSON record). */
export interface LogSetPayload {
  /** Rep count. Siri/App Intents typically hand this over already-parsed as a number. */
  reps: number | string | null | undefined;
  /** Weight in the user's DISPLAY unit (not necessarily kg) — see `unitPref` in deps. */
  weight: number | string | null | undefined;
  /** Optional spoken/typed exercise name; when absent, falls back to the current in-progress exercise. */
  exercise?: string | null;
}

/** Context the pure handler needs but must not fetch itself. */
export interface LogSetDeps {
  /** The user's weight display unit ('kg' | 'lbs'). */
  unitPref: UnitSystem;
  /**
   * The exercise currently in progress in the logger (id + display name), or
   * null when no workout/exercise is active. Supplied by intentBridge.ts,
   * which reads it from the SAME "current exercise" state the in-app stepper
   * uses — this module never guesses.
   */
  currentExercise: { id: string; name: string } | null;
  /**
   * Best-effort resolver from a spoken/typed exercise name to a known
   * exercise id (e.g. against the local exercise_names cache). Returns null
   * when nothing matches. Optional — omitted when `exercise` wasn't spoken.
   */
  resolveExerciseByName?: (name: string) => { id: string; name: string } | null;
  /** Current time (server/device clock) — never read internally. */
  now: Date;
}

/** The write plan intentBridge.ts executes against the local data layer. */
export interface LogSetPlan {
  type: 'logSet';
  exerciseId: string;
  exerciseName: string;
  reps: number;
  /** Exact kilograms — already converted via displayToKg(). */
  weightKg: number;
  /** Fixed-point exact entry: spoken value × 100 in the spoken unit (v18). */
  weightCenti: number;
  /** Unit the weight was spoken/typed in ('kg' | 'lbs'). */
  weightUnit: UnitSystem;
  loggedAt: string; // ISO, derived from deps.now
}

const NO_ACTIVE_WORKOUT_MESSAGE =
  "You don't have a set in progress. Open Peak Fettle and start a workout, then try again.";
const NO_EXERCISE_MATCH_MESSAGE =
  "I couldn't find that exercise. Try naming it exactly as it appears in your workout, or leave it blank to log to your current exercise.";
const BAD_REPS_MESSAGE = "I didn't catch a valid rep count. Try again with a number, like \"8 reps\".";
const BAD_WEIGHT_MESSAGE = "I didn't catch a valid weight. Try again with a number, like \"100 kilos\".";

/** Coerce a Siri/App-Intent numeric field (number or numeric string) to a finite number, else null. */
function coerceNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Fall back to the same tolerant free-text parse the manual weight input uses
  // (handles a trailing/leading dot, comma decimal separators, stray whitespace).
  return parseWeightInput(value);
}

/**
 * Parse + validate a LogSetIntent payload into a local-data write plan.
 * Never throws — returns `{ ok: false, message }` for any invalid/missing
 * input, with copy suitable for Siri to speak back to the user.
 */
export function handleLogSetIntent(
  payload: LogSetPayload,
  deps: LogSetDeps,
): IntentResult<LogSetPlan> {
  const reps = coerceNumber(payload.reps);
  if (reps == null || !Number.isFinite(reps) || reps <= 0) {
    return { ok: false, message: BAD_REPS_MESSAGE };
  }

  const rawWeight = coerceNumber(payload.weight);
  if (rawWeight == null || !Number.isFinite(rawWeight) || rawWeight < 0) {
    return { ok: false, message: BAD_WEIGHT_MESSAGE };
  }

  // Exercise resolution: an explicitly spoken name wins (resolved via the
  // caller's lookup); otherwise fall back to whatever exercise is currently
  // in progress. Neither present → graceful failure (no silent misfile).
  let exercise: { id: string; name: string } | null = null;
  const spokenName = payload.exercise?.trim();
  if (spokenName) {
    exercise = deps.resolveExerciseByName ? deps.resolveExerciseByName(spokenName) : null;
    if (!exercise) {
      return { ok: false, message: NO_EXERCISE_MATCH_MESSAGE };
    }
  } else {
    exercise = deps.currentExercise;
    if (!exercise) {
      return { ok: false, message: NO_ACTIVE_WORKOUT_MESSAGE };
    }
  }

  // The 185-lb lesson, voice edition: convert the spoken display-unit weight
  // to EXACT kg via the single shared conversion helper — never a bespoke
  // multiply here. "one hundred" in lb-mode -> displayToKg(100, 'lbs') = 45.36...kg.
  const weightKg = displayToKg(Math.round(reps) === reps ? rawWeight : rawWeight, deps.unitPref);

  return {
    ok: true,
    plan: {
      type: 'logSet',
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      reps: Math.round(reps),
      weightKg,
      weightCenti: displayToCenti(rawWeight),
      weightUnit: deps.unitPref,
      loggedAt: deps.now.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// StartWorkoutIntent
// ---------------------------------------------------------------------------

export interface StartWorkoutPayload {
  /** Optional spoken/typed routine name; falls back to the schedule's "next up" when absent. */
  routine?: string | null;
}

export interface StartWorkoutDeps {
  /** Resolve a spoken/typed routine name to a known routine, or null if unmatched. */
  resolveRoutineByName?: (name: string) => { id: string; name: string } | null;
  /**
   * The schedule's current "next up" slot (already resolved by the caller via
   * data/schedule.ts's resolveNextUp) — used when no routine was named.
   * null when nothing is scheduled or today is a rest day.
   */
  nextUp: { routineId: string; routineName: string } | null;
  now: Date;
}

export interface StartWorkoutPlan {
  type: 'startWorkout';
  routineId: string | null;
  routineName: string | null;
  startedAt: string;
}

const NO_ROUTINE_MATCH_MESSAGE =
  "I couldn't find that routine. Try naming it exactly as it appears in Peak Fettle, or say \"start my workout\" to use what's next up.";
const NOTHING_SCHEDULED_MESSAGE =
  "You don't have a routine scheduled right now. Open Peak Fettle to pick one, or name a routine directly.";

export function handleStartWorkoutIntent(
  payload: StartWorkoutPayload,
  deps: StartWorkoutDeps,
): IntentResult<StartWorkoutPlan> {
  const spokenName = payload.routine?.trim();
  if (spokenName) {
    const routine = deps.resolveRoutineByName ? deps.resolveRoutineByName(spokenName) : null;
    if (!routine) {
      return { ok: false, message: NO_ROUTINE_MATCH_MESSAGE };
    }
    return {
      ok: true,
      plan: {
        type: 'startWorkout',
        routineId: routine.id,
        routineName: routine.name,
        startedAt: deps.now.toISOString(),
      },
    };
  }

  if (!deps.nextUp) {
    return { ok: false, message: NOTHING_SCHEDULED_MESSAGE };
  }

  return {
    ok: true,
    plan: {
      type: 'startWorkout',
      routineId: deps.nextUp.routineId,
      routineName: deps.nextUp.routineName,
      startedAt: deps.now.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// StartRestIntent
// ---------------------------------------------------------------------------

export interface StartRestPayload {
  /** Optional spoken/typed rest duration in seconds; falls back to deps.defaultSeconds. */
  seconds?: number | string | null;
}

export interface StartRestDeps {
  /** The user's configured default rest timer (settings row / REST_TIMER_DEFAULT fallback). */
  defaultSeconds: number;
  /** Clamp bounds — mirrors useRestTimer's REST_TIMER_MIN/MAX so a spoken value can't produce a nonsensical timer. */
  minSeconds: number;
  maxSeconds: number;
  now: Date;
}

export interface StartRestPlan {
  type: 'startRest';
  seconds: number;
  startedAt: string;
}

const BAD_REST_SECONDS_MESSAGE =
  "I didn't catch a valid rest time. Try again with a number of seconds, like \"90 seconds\".";

export function handleStartRestIntent(
  payload: StartRestPayload,
  deps: StartRestDeps,
): IntentResult<StartRestPlan> {
  let seconds = deps.defaultSeconds;
  if (payload.seconds != null) {
    const parsed = coerceNumber(payload.seconds);
    if (parsed == null || !Number.isFinite(parsed) || parsed <= 0) {
      return { ok: false, message: BAD_REST_SECONDS_MESSAGE };
    }
    seconds = parsed;
  }

  const clamped = Math.max(deps.minSeconds, Math.min(deps.maxSeconds, Math.round(seconds)));

  return {
    ok: true,
    plan: {
      type: 'startRest',
      seconds: clamped,
      startedAt: deps.now.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Exported failure copy (so intentBridge.ts / Swift-side fallback strings can
// reuse the exact same wording rather than re-authoring it in two places).
// ---------------------------------------------------------------------------

export const INTENT_MESSAGES = {
  noActiveWorkout: NO_ACTIVE_WORKOUT_MESSAGE,
  noExerciseMatch: NO_EXERCISE_MATCH_MESSAGE,
  badReps: BAD_REPS_MESSAGE,
  badWeight: BAD_WEIGHT_MESSAGE,
  noRoutineMatch: NO_ROUTINE_MATCH_MESSAGE,
  nothingScheduled: NOTHING_SCHEDULED_MESSAGE,
  badRestSeconds: BAD_REST_SECONDS_MESSAGE,
} as const;
