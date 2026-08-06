/**
 * qualifierPercentile — what a qualified set contributes to a strength ranking.
 * =============================================================================
 * THE FOUNDER'S HARD RULE (decision D2): qualifiers split PR and history
 * tracking, but a user must NEVER be penalised in their percentile for training
 * a harder variant. Someone who only ever close-grip benches must not rank as a
 * weak bencher.
 *
 * The naive implementations both fail:
 *   • Feed every variant in at face value  -> the close-gripper looks weak.
 *   • Drop every variant                   -> they get no ranking at all AND
 *                                             lose the one they legitimately had.
 * So each (exercise, axis, value) carries a treatment:
 *
 *   passthrough  the variant does not change achievable load; feed it unchanged.
 *   normalize    divide by a researched coefficient (close-grip bench 0.95) to
 *                get the equivalent competition-lift load.
 *   exclude      track the PR, never feed the percentile model.
 *
 * FOUR HARD RULES (SPEC §3), each answering a way this silently goes wrong:
 *
 *   1. MISSING COEFFICIENT => EXCLUDE, never passthrough. Absence of evidence
 *      must not quietly feed a harder variant in at face value. This is the rule
 *      that makes the conservative dataset actually conservative: 15 of the
 *      researched collapse qualifiers carry no coefficient at all.
 *
 *   2. CUSTOM VALUES => ALWAYS EXCLUDE. There is by definition no coefficient
 *      for an option one user invented.
 *
 *   3. AT MOST ONE non-1.0 ratio per set. If two would apply, exclude. Do NOT
 *      multiply coefficients: review found data where multiplying would have
 *      deducted a single 3.9% study finding twice (1.04 x 1.04).
 *
 *   4. NULL / no qualifiers => PASSTHROUGH. Every set logged before v21 has no
 *      qualifiers, and every set whose axis the user has switched off records
 *      none. Treating absence as exclude would silently empty the model.
 *
 * PURE MODULE — no React, no SQLite, no i18n. The inflation guard that pairs
 * with this lives in the reducer (see applyQualifierToSet's callers and
 * SPEC §3 rule 4): a normalized estimate may only fill in when the lift has no
 * actual passthrough set, and may never exceed the best actual e1RM.
 * =============================================================================
 */

import { parseQualifiers, isCustomValue, type QualifierMap } from './qualifierKey';
import { qualifierSpecForExercise } from '../constants/exerciseQualifierMap';

export type QualifierVerdict =
  | { kind: 'passthrough' }
  | { kind: 'normalize'; ratio: number }
  | { kind: 'exclude'; reason: 'custom' | 'no-coefficient' | 'explicit' | 'multiple-ratios' };

/**
 * How a set's qualifiers affect its contribution to the strength model.
 *
 * `exerciseName` resolves the coefficient table; an unknown exercise yields
 * passthrough, because an exercise we know nothing about is not evidence of a
 * harder variant.
 */
export function qualifierVerdict(
  exerciseName: string | null | undefined,
  qualifiers: QualifierMap | null | undefined,
): QualifierVerdict {
  // Rule 4: absence means "not recorded", which is exactly what every pre-v21
  // set is. Never exclude on absence.
  if (!qualifiers || Object.keys(qualifiers).length === 0) return { kind: 'passthrough' };

  const spec = qualifierSpecForExercise(exerciseName);
  const coeffs = spec?.coeffs ?? [];

  let ratio: number | null = null;

  for (const [axisId, value] of Object.entries(qualifiers)) {
    if (typeof value !== 'string' || value.length === 0) continue;

    // Rule 2: a user-invented option has no coefficient by construction.
    if (isCustomValue(value)) return { kind: 'exclude', reason: 'custom' };

    const entry = coeffs.find((c) => c.a === axisId && c.v === value);

    // No entry at all means one of two things, and BOTH are safe to pass
    // through: either this axis does not affect achievable load for this
    // exercise (rope vs straight bar at the same stack weight), or the value is
    // this exercise's ordinary case. The dataset explicitly records `exclude`
    // wherever a variant is materially harder but unquantified, so a genuine
    // "we don't know" is never silent — it is a recorded exclude, handled below.
    if (!entry) continue;

    if (entry.t === 'x') return { kind: 'exclude', reason: 'explicit' };
    if (entry.t === 'p') continue;

    // normalize
    if (typeof entry.r !== 'number' || !Number.isFinite(entry.r) || entry.r <= 0) {
      // Rule 1: a normalize with no usable ratio is not evidence — exclude
      // rather than silently passing the load through at face value.
      return { kind: 'exclude', reason: 'no-coefficient' };
    }
    // Rule 3: never multiply. Two independent adjustments compound error, and
    // the researched data contained a pair that would have double-counted one
    // small study finding.
    if (ratio !== null) return { kind: 'exclude', reason: 'multiple-ratios' };
    ratio = entry.r;
  }

  if (ratio !== null) return { kind: 'normalize', ratio };
  return { kind: 'passthrough' };
}

export interface QualifiedLoad {
  /** Load to feed the model, in kg. Null = this set must not be fed at all. */
  kg: number | null;
  /** True when the value is a normalized ESTIMATE rather than an actual lift. */
  estimated: boolean;
  verdict: QualifierVerdict;
}

/**
 * Resolve one set's contribution.
 *
 * `qualifiersJson` is the raw column, so callers can hand rows straight from
 * SQLite without pre-parsing.
 */
export function qualifiedLoadForSet(
  exerciseName: string | null | undefined,
  qualifiersJson: string | null | undefined,
  kg: number,
): QualifiedLoad {
  const verdict = qualifierVerdict(exerciseName, parseQualifiers(qualifiersJson));
  if (verdict.kind === 'exclude') return { kg: null, estimated: false, verdict };
  if (verdict.kind === 'normalize') {
    // A HARDER variant has ratio < 1, so dividing raises it to the equivalent
    // competition-lift load. That is the whole point: the close-gripper is
    // credited with the bench they could do, not penalised for the one they did.
    return { kg: kg / verdict.ratio, estimated: true, verdict };
  }
  return { kg, estimated: false, verdict };
}

/**
 * Best e1RM for one lift, applying the INFLATION GUARD (SPEC §3 rule 4).
 *
 * The original spec protected only against penalising. Review found the other
 * direction unguarded: a normalized estimate feeds an uncapped MAX, so a
 * generously-normalized variant could beat the user's real competition-lift PR
 * and drive their headline number. That is just as wrong, and less visible.
 *
 * So:
 *   • Actual (passthrough) sets always count.
 *   • Normalized estimates only FILL IN when there is no actual set for the lift,
 *     and are capped at the best actual otherwise.
 *
 * Returns null when nothing qualifies — the caller must then contribute NOTHING
 * for that lift, never a depressed value. That null is the founder's guarantee.
 */
export function bestQualifiedE1rm(
  candidates: readonly { e1rm: number; estimated: boolean; loggedAt?: string }[],
): { e1rm: number; estimated: boolean; loggedAt: string } | null {
  let bestActual: { e1rm: number; loggedAt: string } | null = null;
  let bestEstimate: { e1rm: number; loggedAt: string } | null = null;

  for (const c of candidates) {
    if (!Number.isFinite(c.e1rm) || c.e1rm <= 0) continue;
    const entry = { e1rm: c.e1rm, loggedAt: c.loggedAt ?? '' };
    if (c.estimated) {
      if (!bestEstimate || entry.e1rm > bestEstimate.e1rm) bestEstimate = entry;
    } else if (!bestActual || entry.e1rm > bestActual.e1rm) {
      bestActual = entry;
    }
  }

  if (bestActual) {
    // An estimate never beats a real lift. It can only confirm one.
    return { e1rm: bestActual.e1rm, estimated: false, loggedAt: bestActual.loggedAt };
  }
  if (bestEstimate) {
    return { e1rm: bestEstimate.e1rm, estimated: true, loggedAt: bestEstimate.loggedAt };
  }
  return null;
}
