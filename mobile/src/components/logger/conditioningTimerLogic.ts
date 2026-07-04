/**
 * conditioningTimerLogic.ts — pure EMOM / AMRAP / interval timer math (TICKET-144).
 * =============================================================================
 * Attachable to a cardio-type exercise from the logger as a "conditioning timer"
 * — a self-contained clock the user runs for a fixed structure (EMOM, AMRAP, or
 * work/rest intervals), then logs the result as one cardio-kind set: `duration_sec`
 * = total elapsed, plus optional rounds completed for AMRAP.
 *
 * PURITY (CLAUDE.md invariants): no Date.now() / setInterval / Math.random() in
 * here — every function takes `elapsedMs`/`nowMs`/durations as parameters. The
 * React ticking (setInterval, Date.now()) lives ONLY in the paired hook
 * (useConditioningTimer.ts / the sheet component), exactly like
 * useRestTimer.ts wraps loggerLogic-style pure derivation. Identical inputs →
 * identical outputs; safe to unit test in plain node (see
 * mobile/src/components/__tests__/conditioningTimerLogic.test.js).
 *
 * Three MODES:
 *   EMOM     — "Every Minute On the Minute": N rounds, a fixed interval each
 *              (usually 60s but configurable). The clock displays which round
 *              is active and time remaining IN the current round. Total
 *              duration = rounds * intervalSec.
 *   AMRAP    — "As Many Rounds/Reps As Possible" in a fixed time cap T. The
 *              user free-runs the whole cap and taps "+ round" each time they
 *              complete a round; the timer just counts down T. Total duration
 *              = the cap (T), rounds completed = whatever the user tapped.
 *   INTERVAL — fixed work/rest seconds, repeated for `rounds` rounds (e.g.
 *              30s work / 15s rest x 8). The clock alternates WORK/REST
 *              phases. Total duration = rounds * (workSec + restSec), minus a
 *              trailing rest that is commonly skipped (see totalDurationSec).
 * =============================================================================
 */

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export type ConditioningMode = 'emom' | 'amrap' | 'interval';

/** EMOM config: N rounds, each `intervalSec` long (commonly 60). */
export interface EmomConfig {
  mode: 'emom';
  rounds: number;
  intervalSec: number;
}

/** AMRAP config: a single fixed time cap in seconds. */
export interface AmrapConfig {
  mode: 'amrap';
  capSec: number;
}

/** Fixed work/rest interval config, repeated `rounds` times. */
export interface IntervalConfig {
  mode: 'interval';
  rounds: number;
  workSec: number;
  restSec: number;
  /** Whether the final round's trailing rest counts toward total duration. Default false (skipped). */
  trailingRest?: boolean;
}

export type ConditioningConfig = EmomConfig | AmrapConfig | IntervalConfig;

// ---------------------------------------------------------------------------
// Validation / normalization — bounds mirror the sheet's numeric inputs so a
// bad/garbage config never produces a nonsensical timer (e.g. 0 rounds, a
// negative interval). Caller should validate before starting a run.
// ---------------------------------------------------------------------------

export const CONDITIONING_BOUNDS = {
  roundsMin: 1,
  roundsMax: 50,
  secMin: 1,
  secMax: 3600,
};

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  const r = Math.round(v);
  return Math.max(min, Math.min(max, r));
}

/** Normalize (clamp) a config's numeric fields to sane bounds. Mode is preserved as-is. */
export function normalizeConfig(cfg: ConditioningConfig): ConditioningConfig {
  const { roundsMin, roundsMax, secMin, secMax } = CONDITIONING_BOUNDS;
  if (cfg.mode === 'emom') {
    return {
      mode: 'emom',
      rounds: clampInt(cfg.rounds, roundsMin, roundsMax),
      intervalSec: clampInt(cfg.intervalSec, secMin, secMax),
    };
  }
  if (cfg.mode === 'amrap') {
    return { mode: 'amrap', capSec: clampInt(cfg.capSec, secMin, secMax) };
  }
  return {
    mode: 'interval',
    rounds: clampInt(cfg.rounds, roundsMin, roundsMax),
    workSec: clampInt(cfg.workSec, secMin, secMax),
    restSec: clampInt(cfg.restSec, 0, secMax),
    trailingRest: cfg.trailingRest === true,
  };
}

// ---------------------------------------------------------------------------
// Total planned duration (seconds) — used to pre-fill duration_sec if the
// user finishes the full plan without abandoning early.
// ---------------------------------------------------------------------------

export function totalDurationSec(cfg: ConditioningConfig): number {
  const c = normalizeConfig(cfg);
  if (c.mode === 'emom') return c.rounds * c.intervalSec;
  if (c.mode === 'amrap') return c.capSec;
  const full = c.rounds * (c.workSec + c.restSec);
  return c.trailingRest ? full : full - c.restSec;
}

// ---------------------------------------------------------------------------
// EMOM — phase derivation from elapsed ms
// ---------------------------------------------------------------------------

export interface EmomPhase {
  /** 1-based round currently active. Clamped to `rounds` once the plan is done. */
  round: number;
  /** Seconds remaining in the CURRENT round's interval (0 when the round just ticked over). */
  secLeftInRound: number;
  /** True once elapsed >= rounds * intervalSec (the whole EMOM is complete). */
  done: boolean;
}

/**
 * Derive the EMOM phase from elapsed milliseconds since start. Elapsed clamps
 * at 0 for negative input (not-yet-started clocks read as round 1, full interval).
 */
export function emomPhaseAt(cfg: EmomConfig, elapsedMs: number): EmomPhase {
  const c = normalizeConfig(cfg) as EmomConfig;
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const total = c.rounds * c.intervalSec;
  if (elapsedSec >= total) {
    return { round: c.rounds, secLeftInRound: 0, done: true };
  }
  const roundIdx = Math.floor(elapsedSec / c.intervalSec); // 0-based
  const intoRound = elapsedSec - roundIdx * c.intervalSec;
  return {
    round: roundIdx + 1,
    secLeftInRound: c.intervalSec - intoRound,
    done: false,
  };
}

// ---------------------------------------------------------------------------
// AMRAP — countdown derivation (mirrors restRemainingSec's shape/rounding)
// ---------------------------------------------------------------------------

export interface AmrapPhase {
  /** Whole seconds remaining in the cap, clamped to >= 0. */
  secLeft: number;
  done: boolean;
}

export function amrapPhaseAt(cfg: AmrapConfig, elapsedMs: number): AmrapPhase {
  const c = normalizeConfig(cfg) as AmrapConfig;
  const elapsedSec = Math.max(0, elapsedMs / 1000);
  const left = c.capSec - elapsedSec;
  if (left <= 0) return { secLeft: 0, done: true };
  return { secLeft: Math.ceil(left), done: false };
}

// ---------------------------------------------------------------------------
// INTERVAL — work/rest phase derivation
// ---------------------------------------------------------------------------

export interface IntervalPhase {
  /** 1-based round currently active. Clamped to `rounds` once the plan is done. */
  round: number;
  /** 'work' | 'rest' — which phase of the current round is active. */
  phase: 'work' | 'rest';
  /** Seconds remaining in the CURRENT phase. */
  secLeftInPhase: number;
  done: boolean;
}

/**
 * Derive the work/rest phase from elapsed ms. A restSec of 0 means every round
 * is 100% work (no rest phase ever reported). The FINAL round's rest is still
 * reported as a phase here (this is the moment-to-moment clock — whether the
 * trailing rest counts toward the logged duration is decided by
 * totalDurationSec, not this function).
 */
export function intervalPhaseAt(cfg: IntervalConfig, elapsedMs: number): IntervalPhase {
  const c = normalizeConfig(cfg) as IntervalConfig;
  const cycleSec = c.workSec + c.restSec;
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const total = c.rounds * cycleSec;
  if (elapsedSec >= total) {
    return { round: c.rounds, phase: 'rest', secLeftInPhase: 0, done: true };
  }
  const roundIdx = Math.floor(elapsedSec / cycleSec); // 0-based
  const intoRound = elapsedSec - roundIdx * cycleSec;
  if (intoRound < c.workSec) {
    return { round: roundIdx + 1, phase: 'work', secLeftInPhase: c.workSec - intoRound, done: false };
  }
  return {
    round: roundIdx + 1,
    phase: 'rest',
    secLeftInPhase: cycleSec - intoRound,
    done: false,
  };
}

// ---------------------------------------------------------------------------
// AMRAP round-tap tracking (pure) — the user taps "+ round" (and optionally
// "+ rep" within a round) while the clock runs; this just accumulates counts,
// no clock involved. Kept here so the sheet/hook has zero ad-hoc counters.
// ---------------------------------------------------------------------------

/** Increment a round counter by 1, never negative. */
export function incrementRounds(current: number): number {
  const n = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  return n + 1;
}

/** Decrement a round counter by 1, clamped at 0 (undo a mis-tap). */
export function decrementRounds(current: number): number {
  const n = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  return Math.max(0, n - 1);
}

// ---------------------------------------------------------------------------
// Result — what gets handed to onLogCardioSet once the user finishes/abandons
// ---------------------------------------------------------------------------

export interface ConditioningResult {
  /** Seconds to store in the cardio set's duration_sec. */
  durationSec: number;
  /** Rounds completed, when the mode tracks rounds (AMRAP tap count, or EMOM/interval rounds reached). null when not meaningful. */
  rounds: number | null;
}

/**
 * Build the result to log once the user stops the clock (whether by
 * completing the full plan or abandoning early at `elapsedMs`).
 *
 *   • EMOM     — durationSec = actual elapsed (clamped to the planned total);
 *                rounds = the round reached (emomPhaseAt's `round`, or `rounds`
 *                if completed).
 *   • AMRAP    — durationSec = actual elapsed (clamped to the cap — AMRAP is a
 *                fixed cap, elapsed can't exceed it meaningfully); rounds =
 *                the user's tapped `roundsCompleted` count (passed in, since
 *                this module doesn't own the tap state).
 *   • INTERVAL — durationSec = actual elapsed (clamped to totalDurationSec);
 *                rounds = the round reached.
 *
 * `elapsedMs` may exceed the plan (user let it run past done) — always
 * clamped to the plan's total so an abandoned-late timer never logs more than
 * what was actually prescribed.
 */
export function buildConditioningResult(
  cfg: ConditioningConfig,
  elapsedMs: number,
  roundsCompleted?: number,
): ConditioningResult {
  const c = normalizeConfig(cfg);
  const plannedTotalSec = totalDurationSec(c);
  const elapsedSec = Math.max(0, Math.round(elapsedMs / 1000));
  const clampedSec = Math.min(elapsedSec, plannedTotalSec);

  if (c.mode === 'amrap') {
    const rounds =
      typeof roundsCompleted === 'number' && Number.isFinite(roundsCompleted) && roundsCompleted >= 0
        ? Math.floor(roundsCompleted)
        : null;
    return { durationSec: clampedSec, rounds };
  }
  if (c.mode === 'emom') {
    const phase = emomPhaseAt(c, elapsedMs);
    return { durationSec: clampedSec, rounds: phase.round };
  }
  // interval
  const phase = intervalPhaseAt(c, elapsedMs);
  return { durationSec: clampedSec, rounds: phase.round };
}

// ---------------------------------------------------------------------------
// Display helpers — pure formatting, no locale logic beyond mm:ss
// ---------------------------------------------------------------------------

/** "m:ss" display for a whole-seconds countdown/count-up value. Never negative. */
export function formatClock(totalSec: number): string {
  const s = Number.isFinite(totalSec) && totalSec > 0 ? Math.round(totalSec) : 0;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Short label for a mode, used in headers/analytics tags. */
export function modeLabel(mode: ConditioningMode): string {
  if (mode === 'emom') return 'EMOM';
  if (mode === 'amrap') return 'AMRAP';
  return 'Intervals';
}
