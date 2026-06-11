/**
 * warmup — warm-up ramp recommendation from the previous workout's top set.
 *
 * Founder spec (2026-06-10): weight and reps are DERIVED from the previous
 * workout's top set for the exercise; the user chooses per exercise whether
 * to warm up and how many warm-up sets; recommended weight/reps are shown and
 * fully editable.
 *
 * Pure module — unit-tested in __tests__/training-tools.test.js.
 */

import { roundToIncrement } from './plateMath';

export interface WarmupSet {
  /** Recommended weight, rounded to the increment (0 = empty bar / bodyweight). */
  weight: number;
  reps: number;
  /** Fraction of the reference top-set weight (for display, e.g. "60%"). */
  pct: number;
}

/** Ramp schemes by warm-up set count. Percent of previous top-set weight. */
const SCHEMES: Record<number, Array<{ pct: number; reps: number }>> = {
  1: [{ pct: 0.6, reps: 5 }],
  2: [
    { pct: 0.45, reps: 8 },
    { pct: 0.7, reps: 4 },
  ],
  3: [
    { pct: 0.4, reps: 8 },
    { pct: 0.6, reps: 5 },
    { pct: 0.8, reps: 3 },
  ],
  4: [
    { pct: 0.3, reps: 10 },
    { pct: 0.45, reps: 8 },
    { pct: 0.65, reps: 5 },
    { pct: 0.85, reps: 2 },
  ],
};

export const WARMUP_SET_CHOICES = [1, 2, 3, 4];
export const DEFAULT_WARMUP_SETS = 3;

/**
 * Build the recommended ramp from the previous top set.
 * Returns [] when there is no reference weight (no history yet).
 */
export function computeWarmupPlan(
  prevTopWeight: number | null | undefined,
  numSets: number,
  increment = 2.5,
): WarmupSet[] {
  if (prevTopWeight == null || !(prevTopWeight > 0)) return [];
  const scheme = SCHEMES[Math.min(4, Math.max(1, Math.round(numSets)))] ?? SCHEMES[DEFAULT_WARMUP_SETS]!;
  return scheme.map(({ pct, reps }) => ({
    weight: Math.max(0, roundToIncrement(prevTopWeight * pct, increment)),
    reps,
    pct,
  }));
}
