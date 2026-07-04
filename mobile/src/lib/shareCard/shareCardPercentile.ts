/**
 * shareCardPercentile — TICKET-131 (shareable workout summary cards)
 *
 * Computes the OPTIONAL "percentile flex line" for a share card entirely
 * ON-DEVICE via strengthModelV3.ts (TICKET-093) — mirrors the pattern already
 * used by TierLadderCard.tsx, but sources its inputs from LOCAL SQLite (best
 * e1RM per competition lift + the local profile snapshot) instead of the Pro
 * server `rankings` payload, so it works identically for FREE (local-first)
 * and Pro users. There is NO network call anywhere in this module — per
 * CLAUDE.md §1 (local-first invariant) and the TICKET-131 spec ("never a
 * network call").
 *
 * Pure functions only: no `Date.now()`/clock reads, no randomness. The caller
 * supplies the exercise history slice already loaded for the share (typically
 * "all sets ever logged", read once by the sheet).
 */

import {
  computeRankedPercentile,
  overallStrengthPercentilePartial,
  LiftId,
  Sex,
  SexInput,
} from '../strengthModelV3';
import { epley1Rm } from '../oneRm';

// ---------------------------------------------------------------------------
// Exercise name → competition lift mapping
// ---------------------------------------------------------------------------

/**
 * Maps a free-text exercise name to a v3 model lift id. Deliberately
 * conservative (mirrors TierLadderCard's LIFT_ID_TO_MODEL strictness for
 * squat/bench/deadlift): only the canonical barbell competition variants
 * count toward the flex line — accessory/variant lifts (front squat, sumo,
 * incline) are excluded so the "TOP X% · LIFT" claim stays honest.
 */
const NAME_TO_LIFT: Array<{ pattern: RegExp; lift: LiftId }> = [
  { pattern: /^back squat$/i, lift: 'squat' },
  { pattern: /^squat$/i, lift: 'squat' },
  { pattern: /^barbell squat$/i, lift: 'squat' },
  { pattern: /^bench press$/i, lift: 'bench' },
  { pattern: /^barbell bench press$/i, lift: 'bench' },
  { pattern: /^bench$/i, lift: 'bench' },
  { pattern: /^deadlift$/i, lift: 'deadlift' },
  { pattern: /^barbell deadlift$/i, lift: 'deadlift' },
  { pattern: /^overhead press$/i, lift: 'ohp' },
  { pattern: /^ohp$/i, lift: 'ohp' },
  { pattern: /^military press$/i, lift: 'ohp' },
];

export function exerciseNameToLift(name: string | null | undefined): LiftId | null {
  if (!name) return null;
  const trimmed = name.trim();
  for (const { pattern, lift } of NAME_TO_LIFT) {
    if (pattern.test(trimmed)) return lift;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Best e1RM extraction (pure — operates on a caller-supplied set list)
// ---------------------------------------------------------------------------

/** Minimal shape of a lift set needed to find the best e1RM per lift. */
export interface FlexLiftSetInput {
  exerciseName: string | null | undefined;
  weightKg: number | null | undefined;
  reps: number | null | undefined;
  /** True for a drop-chain / fatigue set (S1) — excluded from PR/e1RM comparisons. */
  isDrop?: boolean;
}

/** Best e1RM per recognised competition lift across the supplied sets. */
export function bestLiftE1rms(sets: FlexLiftSetInput[]): Partial<Record<LiftId, number>> {
  const best: Partial<Record<LiftId, number>> = {};
  for (const s of sets) {
    if (s.isDrop) continue;
    const lift = exerciseNameToLift(s.exerciseName);
    if (!lift) continue;
    const kg = s.weightKg ?? 0;
    const reps = s.reps ?? 0;
    if (!(kg > 0) || !(reps > 0)) continue;
    const e1rm = epley1Rm(kg, Math.min(reps, 12));
    if (!(e1rm > 0)) continue;
    if ((best[lift] ?? 0) < e1rm) best[lift] = e1rm;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Flex line result
// ---------------------------------------------------------------------------

export interface FlexLineResult {
  /** e.g. "TOP 8% · BENCH PRESS · MEN 75–82.5 KG" — caller renders verbatim. */
  headline: string;
  /** The lift the flex line is about (the one just PR'd, if resolvable). */
  lift: LiftId;
  /** Percentile 0-100 (higher = stronger), rounded for display. */
  percentile: number;
  provisional: boolean;
}

const LIFT_DISPLAY_NAME: Record<LiftId, string> = {
  squat: 'SQUAT',
  bench: 'BENCH PRESS',
  deadlift: 'DEADLIFT',
  ohp: 'OVERHEAD PRESS',
};

/** Bodyweight band label, e.g. "75–82.5 KG" from a bodyweight in kg. Static 7.5 kg bands. */
function bodyweightBandLabel(bwKg: number): string {
  const bandSize = 7.5;
  const lower = Math.floor(bwKg / bandSize) * bandSize;
  const upper = lower + bandSize;
  return `${lower.toFixed(1).replace(/\.0$/, '')}–${upper.toFixed(1).replace(/\.0$/, '')} KG`;
}

function sexLabel(sex: Sex | null): string {
  if (sex === 'M') return 'MEN';
  if (sex === 'F') return 'WOMEN';
  return 'ALL LIFTERS';
}

function normalizeSex(raw: string | null | undefined): Sex | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'm' || s === 'male') return 'M';
  if (s === 'f' || s === 'female') return 'F';
  return null;
}

/**
 * Build the flex-line for a SPECIFIC lift just performed in the shared
 * workout (preferred — "you just PR'd bench, brag about bench").
 * Returns null when the lift isn't a recognised competition lift, or the
 * profile lacks bodyweight (percentile has no denominator).
 */
export function flexLineForLift(
  lift: LiftId,
  e1rmKg: number,
  bodyweightKg: number | null | undefined,
  sexRaw: string | null | undefined,
): FlexLineResult | null {
  const bw = bodyweightKg != null && bodyweightKg > 0 ? bodyweightKg : null;
  if (bw == null || !(e1rmKg > 0)) return null;
  const sex = normalizeSex(sexRaw);
  const pct = sex
    ? computeRankedPercentile(lift, sex, e1rmKg, bw)
    : computeRankedPercentile(lift, undefined, e1rmKg, bw);
  const rounded = pct >= 99 ? Math.round(pct * 10) / 10 : Math.round(pct);
  return {
    headline: `TOP ${Math.max(0.1, 100 - rounded)}% · ${LIFT_DISPLAY_NAME[lift]} · ${sexLabel(sex)} ${bodyweightBandLabel(bw)}`,
    lift,
    percentile: rounded,
    provisional: false,
  };
}

/**
 * Fallback: the overall (DOTS composite) tier flex-line when no single lift
 * is a clean fit (e.g. the shared workout wasn't a competition lift, or the
 * caller just wants the headline strength claim). Mirrors TierLadderCard's
 * overallStrengthPercentilePartial usage but is intentionally a SEPARATE,
 * simpler entry point for the share-card copy (no tier ladder name — just a
 * percentile claim across whichever of squat/bench/deadlift are known).
 */
export function flexLineOverall(
  lifts: Partial<Record<'squat' | 'bench' | 'deadlift', number>>,
  bodyweightKg: number | null | undefined,
  sexRaw: string | null | undefined,
): FlexLineResult | null {
  const bw = bodyweightKg != null && bodyweightKg > 0 ? bodyweightKg : null;
  if (bw == null) return null;
  const sex = normalizeSex(sexRaw);
  const result = sex
    ? overallStrengthPercentilePartial(lifts, bw, sex)
    : overallStrengthPercentilePartial(lifts, bw, undefined as unknown as SexInput);
  if (!result) return null;
  const rounded = result.pct >= 99 ? Math.round(result.pct * 10) / 10 : Math.round(result.pct);
  const knownLift = (['squat', 'bench', 'deadlift'] as const).find((l) => (lifts[l] ?? 0) > 0);
  return {
    headline: `TOP ${Math.max(0.1, 100 - rounded)}% OVERALL STRENGTH · ${sexLabel(sex)} ${bodyweightBandLabel(bw)}`,
    lift: (knownLift ?? 'squat') as LiftId,
    percentile: rounded,
    provisional: result.provisional,
  };
}
