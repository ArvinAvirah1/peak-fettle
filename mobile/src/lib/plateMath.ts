/**
 * plateMath — plate-loading + machine/pulley effective-load math.
 *
 * Founder spec (2026-06-10): the calculator must first take the base machine /
 * bar weight (defaulting to the previously used value for that exercise), and
 * support a pulley configuration so users who switch gyms onto a different
 * pulley ratio still log the CORRECT effective load — keeping the strength
 * metrics (e1RM, percentiles, tier) honest.
 *
 * Pure module — no React, no IO — unit-tested in __tests__/training-tools.test.js.
 */

// ── Pulley configurations ────────────────────────────────────────────────────
// factor = effective resistance per kg of stack moved.
// A 2:1 stack pulley halves the felt load (you pull twice the cable distance
// at half the force); 1:2 doubles it.

export interface PulleyOption {
  id: string;
  label: string;
  factor: number;
}

export const PULLEY_OPTIONS: PulleyOption[] = [
  { id: '1:1', label: 'Direct (1:1)', factor: 1 },
  { id: '2:1', label: '2:1 — feels half the stack', factor: 0.5 },
  { id: '1:2', label: '1:2 — feels double the stack', factor: 2 },
];

export function pulleyById(id: string | null | undefined): PulleyOption {
  return PULLEY_OPTIONS.find((p) => p.id === id) ?? PULLEY_OPTIONS[0]!;
}

/** Effective (felt) load for a machine: stack/base weight × pulley factor. */
export function effectiveLoad(stackWeight: number, pulleyFactor: number): number {
  if (!(stackWeight > 0) || !(pulleyFactor > 0)) return 0;
  return round2(stackWeight * pulleyFactor);
}

// ── Plate breakdown (barbell) ────────────────────────────────────────────────

export const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const LB_PLATES = [45, 35, 25, 10, 5, 2.5];
export const DEFAULT_BAR_KG = 20;
export const DEFAULT_BAR_LB = 45;

export interface PlateCount {
  plate: number;
  count: number;
}

export interface PlateBreakdown {
  /** Plates PER SIDE, heaviest first. */
  perSide: PlateCount[];
  /** Total actually achievable with the given plates (bar + 2×side). */
  achievedTotal: number;
  /** target − achieved (0 when the target is exactly loadable). */
  residual: number;
  /** True when target < bar weight (nothing to load). */
  belowBar: boolean;
}

/**
 * Greedy per-side plate breakdown for a target TOTAL weight on a bar.
 * Units are whatever the caller uses — pass a matching plate set.
 */
export function plateBreakdown(
  targetTotal: number,
  barWeight: number,
  plates: number[] = KG_PLATES,
): PlateBreakdown {
  if (!(targetTotal > 0) || !(barWeight >= 0) || targetTotal < barWeight) {
    return { perSide: [], achievedTotal: barWeight, residual: round2(Math.max(0, targetTotal - barWeight)), belowBar: true };
  }
  let perSideRemaining = (targetTotal - barWeight) / 2;
  const out: PlateCount[] = [];
  const sorted = [...plates].sort((a, b) => b - a);
  for (const p of sorted) {
    const count = Math.floor(round2(perSideRemaining) / p);
    if (count > 0) {
      out.push({ plate: p, count });
      perSideRemaining = round2(perSideRemaining - count * p);
    }
  }
  const loadedPerSide = out.reduce((s, pc) => s + pc.plate * pc.count, 0);
  const achievedTotal = round2(barWeight + 2 * loadedPerSide);
  return {
    perSide: out,
    achievedTotal,
    residual: round2(targetTotal - achievedTotal),
    belowBar: false,
  };
}

/** Round a weight to the nearest loadable increment (2.5 kg / 5 lb typical). */
export function roundToIncrement(weight: number, increment: number): number {
  if (!(increment > 0)) return round2(weight);
  return round2(Math.round(weight / increment) * increment);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
