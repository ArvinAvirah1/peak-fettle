/**
 * autoregulation.ts — TICKET-141: in-session load suggestions (deterministic).
 * =============================================================================
 * "Hevy Trainer auto-adjusts your weights" — under the hood it is arithmetic we
 * already own. This module extends engine v2 with next-set / next-session load
 * suggestions computed from (recent history slice, target RIR band, equipment
 * increment config). PURE + DETERMINISTIC:
 *
 *   • No network. No storage. No randomness. No clock reads — `now` is an input.
 *   • Same inputs → byte-identical output (the engine determinism rule).
 *   • The word "AI" never appears in any user-facing string (founder rule).
 *   • Every suggestion carries its rule id and a human "because" line that
 *     names the observation it fired on ("you hit 80 kg × 8 @ RIR 2 last time").
 *
 * RULE TABLE (evaluated top-to-bottom; first match wins):
 *   AR-S1  stale history      — newest working set > STALE_DAYS (21) old
 *                               → conservative restart at RESTART_FACTOR (0.90),
 *                               rounded DOWN to the equipment increment.
 *   AR-D1  missed reps        — last-session best set below the rep target's
 *                               low end → back off BACKOFF_FACTOR (0.975 ≈ −2.5%),
 *                               guaranteed at least one increment lighter.
 *   AR-R1  effort miss (hold) — reps hit but logged RIR below the target band
 *                               (too close to failure) → hold the same load and
 *                               win the rep/effort target before adding weight.
 *   AR-P1  progression        — top of the rep range reached with RIR at/above
 *                               the band top (room to spare) → +1 increment.
 *   AR-H1  hold (in band)     — everything on target → same load again
 *                               (accumulate quality volume; add weight when
 *                               AR-P1's condition is met).
 *
 * Worked examples live in the test table (autoregulation.test.js) — they are
 * the documentation of record for the thresholds.
 *
 * Weight I/O invariant (CLAUDE.md §2): inputs/outputs are EXACT KG. Display
 * conversion happens only through constants/units.ts (formatWeight here for
 * the "because" copy; the UI prefills inputs via kgToInputValue). In lbs mode
 * rounding happens on the DISPLAY value (5 lb plate steps) and converts back
 * to exact kg, so a lbs user sees clean bar math (the 185-lb lesson).
 *
 * Effort copy respects the TICKET-128 display setting via the ONE conversion
 * helper (components/loggerLogic.formatEffort) — RIR stays the stored truth.
 */

import { formatWeight, kgToLbs, lbsToKg, UnitSystem } from '../../../constants/units';
import { formatEffort, EffortDisplay } from '../../../components/loggerLogic';

// ---------------------------------------------------------------------------
// Tunables (documented thresholds — founder sign-off tracked in TICKET-141)
// ---------------------------------------------------------------------------

/** History older than this many days is "stale" → conservative restart (AR-S1). */
export const STALE_DAYS = 21;
/** Conservative-restart multiplier applied to the last working load (AR-S1). */
export const RESTART_FACTOR = 0.9;
/** Missed-reps back-off multiplier (AR-D1) — ≈ −2.5%. */
export const BACKOFF_FACTOR = 0.975;

/** Display-unit plate/handle increments per equipment class. */
export const INCREMENTS_KG: Record<AutoregEquipment, number> = {
  barbell: 2.5, // 1.25 kg per side
  dumbbell: 2, // typical fixed-DB rack step
  machine: 2.5, // stack pin step (approx; stacks vary)
  cable: 2.5,
  bodyweight: 0, // load does not change — progress via reps
  other: 2.5,
};
export const INCREMENTS_LB: Record<AutoregEquipment, number> = {
  barbell: 5, // 2.5 lb per side
  dumbbell: 5,
  machine: 5,
  cable: 5,
  bodyweight: 0,
  other: 5,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutoregEquipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'other';

/** One logged working set (drop-chain rows must be flagged so they are excluded). */
export interface AutoregSetObservation {
  /** ISO datetime the set was logged. */
  loggedAt: string;
  /** Exact kg (CLAUDE.md §2 — never a display value). */
  weightKg: number;
  reps: number;
  /** Stored RIR; null/undefined = not recorded. */
  rir?: number | null;
  /** True for drop-chain / intentional fatigue rows — excluded from the signal. */
  isDrop?: boolean;
}

/** The prescription the suggestion is judged against. */
export interface AutoregTargets {
  /** Rep target band (low === high for a fixed target, e.g. 5×5). */
  targetRepsLow: number;
  targetRepsHigh: number;
  /** Target RIR band, low ≤ high (e.g. 1–3). */
  targetRirLow: number;
  targetRirHigh: number;
}

export interface AutoregConfig {
  unitPref: UnitSystem;
  equipment: AutoregEquipment;
  /** TICKET-128 effort-display setting — copy only; storage stays RIR. */
  effortDisplay: EffortDisplay;
  /** The current time, PASSED IN (no clock reads inside the rule). */
  now: string | Date;
}

export type AutoregRuleId = 'AR-P1' | 'AR-H1' | 'AR-D1' | 'AR-R1' | 'AR-S1';

export interface AutoregSuggestion {
  /** Exact kg to prescribe for the next working set/session. */
  suggested_kg: number;
  rule_id: AutoregRuleId;
  /** Human explanation naming the observation — the copy IS the feature. */
  because: string;
  /** TICKET-146: i18n template id (engine.json `because.<key>`) — UI renders
   *  via src/i18n/engine.ts engineBecause(); `because` stays the EN fallback. */
  because_key: string;
  because_params: Record<string, string | number>;
}

// ---------------------------------------------------------------------------
// Rounding — display-unit plate math, exact-kg storage
// ---------------------------------------------------------------------------

function roundToIncrementKg(
  kg: number,
  unitPref: UnitSystem,
  equipment: AutoregEquipment,
  mode: 'nearest' | 'down',
): number {
  if (equipment === 'bodyweight') return round2(kg);
  if (unitPref === 'lbs') {
    const inc = INCREMENTS_LB[equipment];
    const lb = kgToLbs(kg);
    const steps = mode === 'down' ? Math.floor(lb / inc) : Math.round(lb / inc);
    return round2(lbsToKg(Math.max(inc, steps * inc)));
  }
  const inc = INCREMENTS_KG[equipment];
  const steps = mode === 'down' ? Math.floor(kg / inc) : Math.round(kg / inc);
  return round2(Math.max(inc, steps * inc));
}

function incrementKg(unitPref: UnitSystem, equipment: AutoregEquipment): number {
  if (equipment === 'bodyweight') return 0;
  return unitPref === 'lbs' ? lbsToKg(INCREMENTS_LB[equipment]) : INCREMENTS_KG[equipment];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Reference-set selection
// ---------------------------------------------------------------------------

/** Epley e1RM, reps capped at 12 (matches lib/oneRm usage elsewhere). */
function e1rm(weightKg: number, reps: number): number {
  const r = Math.min(reps, 12);
  return r <= 1 ? weightKg : weightKg * (1 + r / 30);
}

/**
 * The reference observation = the best (highest-e1RM) NON-DROP set from the
 * most recent calendar day that has any valid working set.
 */
export function pickReferenceSet(
  history: AutoregSetObservation[],
): AutoregSetObservation | null {
  const valid = history.filter(
    (s) =>
      !s.isDrop &&
      Number.isFinite(s.weightKg) &&
      s.weightKg > 0 &&
      Number.isFinite(s.reps) &&
      s.reps > 0 &&
      !Number.isNaN(Date.parse(s.loggedAt)),
  );
  if (valid.length === 0) return null;
  const newestDay = valid
    .map((s) => s.loggedAt.slice(0, 10))
    .sort()
    .pop() as string;
  const sameDay = valid.filter((s) => s.loggedAt.slice(0, 10) === newestDay);
  return sameDay.reduce((best, s) =>
    e1rm(s.weightKg, s.reps) > e1rm(best.weightKg, best.reps) ? s : best,
  );
}

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute the next-load suggestion for ONE exercise. Returns null when there
 * is no usable history (a suggestion with nothing behind it would be noise).
 */
export function suggestNextLoad(
  history: AutoregSetObservation[],
  targets: AutoregTargets,
  config: AutoregConfig,
): AutoregSuggestion | null {
  const ref = pickReferenceSet(history);
  if (!ref) return null;

  const nowMs = typeof config.now === 'string' ? Date.parse(config.now) : config.now.getTime();
  if (Number.isNaN(nowMs)) return null;

  const { unitPref, equipment, effortDisplay } = config;
  const lastLabel = `${formatWeight(ref.weightKg, unitPref)} × ${ref.reps}`;
  const effort = ref.rir != null ? formatEffort(ref.rir, effortDisplay) : null;
  const lastLine = effort ? `${lastLabel} @ ${effort}` : lastLabel;

  // AR-S1 — stale history → conservative restart.
  const ageDays = (nowMs - Date.parse(ref.loggedAt)) / DAY_MS;
  if (ageDays > STALE_DAYS) {
    const suggested = roundToIncrementKg(ref.weightKg * RESTART_FACTOR, unitPref, equipment, 'down');
    const staleDays = Math.floor(ageDays);
    return {
      suggested_kg: suggested,
      rule_id: 'AR-S1',
      because: `engine rule AR-S1: it has been ${staleDays} days since ${lastLine} — restarting a notch lighter to rebuild momentum.`,
      because_key: 'AR-S1',
      because_params: { days: staleDays, last: lastLine },
    };
  }

  // Bodyweight — load cannot change; keep the reference and coach reps.
  if (equipment === 'bodyweight') {
    return {
      suggested_kg: round2(ref.weightKg),
      rule_id: 'AR-H1',
      because: `engine rule AR-H1: bodyweight movement — progress by adding reps past ${ref.reps} before adding load.`,
      because_key: 'AR-H1_bodyweight',
      because_params: { reps: ref.reps },
    };
  }

  // AR-D1 — missed the rep target's low end → small back-off.
  if (ref.reps < targets.targetRepsLow) {
    let suggested = roundToIncrementKg(ref.weightKg * BACKOFF_FACTOR, unitPref, equipment, 'nearest');
    if (suggested >= ref.weightKg) {
      suggested = roundToIncrementKg(ref.weightKg - incrementKg(unitPref, equipment), unitPref, equipment, 'nearest');
    }
    suggested = round2(Math.max(suggested, incrementKg(unitPref, equipment)));
    return {
      suggested_kg: suggested,
      rule_id: 'AR-D1',
      because: `engine rule AR-D1: last time was ${lastLine} — below the ${targets.targetRepsLow}–${targets.targetRepsHigh} rep target, so about 2.5% comes off to win the reps back.`,
      because_key: 'AR-D1',
      because_params: { last: lastLine, repsLow: targets.targetRepsLow, repsHigh: targets.targetRepsHigh },
    };
  }

  // AR-R1 — reps hit but effort below the band (too close to failure) → hold.
  if (ref.rir != null && ref.rir < targets.targetRirLow) {
    return {
      suggested_kg: round2(ref.weightKg),
      rule_id: 'AR-R1',
      because: `engine rule AR-R1: ${lastLine} was harder than the plan calls for — same load again until it sits in the target effort band.`,
      because_key: 'AR-R1',
      because_params: { last: lastLine },
    };
  }

  // AR-P1 — top of the rep range with effort at/above the band top → progress.
  const effortHasRoom = ref.rir == null || ref.rir >= targets.targetRirHigh;
  if (ref.reps >= targets.targetRepsHigh && effortHasRoom) {
    const suggested = roundToIncrementKg(
      ref.weightKg + incrementKg(unitPref, equipment),
      unitPref,
      equipment,
      'nearest',
    );
    return {
      suggested_kg: suggested,
      rule_id: 'AR-P1',
      because: `engine rule AR-P1: you hit ${lastLine} — top of the rep range with room to spare, so one increment goes on.`,
      because_key: 'AR-P1',
      because_params: { last: lastLine },
    };
  }

  // AR-H1 — in band → hold.
  return {
    suggested_kg: round2(ref.weightKg),
    rule_id: 'AR-H1',
    because: `engine rule AR-H1: ${lastLine} sits inside the target band — same load, keep stacking quality sets.`,
    because_key: 'AR-H1',
    because_params: { last: lastLine },
  };
}
