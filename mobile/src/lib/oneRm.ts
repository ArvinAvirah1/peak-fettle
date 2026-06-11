/**
 * oneRm — estimated-1RM formulas (Epley, Brzycki) + inverse.
 * Mirrors the server's Epley convention (weight × (1 + reps/30)).
 * Pure module — unit-tested in __tests__/training-tools.test.js.
 */

export type OneRmFormula = 'epley' | 'brzycki';

export function epley1Rm(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function brzycki1Rm(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weight;
  if (reps >= 37) return 0; // formula domain
  return (weight * 36) / (37 - reps);
}

export function estimate1Rm(weight: number, reps: number, formula: OneRmFormula = 'epley'): number {
  return formula === 'brzycki' ? brzycki1Rm(weight, reps) : epley1Rm(weight, reps);
}

/** Inverse: weight you could lift for `reps` given a 1RM. */
export function weightForReps(oneRm: number, reps: number, formula: OneRmFormula = 'epley'): number {
  if (!(oneRm > 0) || !(reps > 0)) return 0;
  if (reps === 1) return oneRm;
  if (formula === 'brzycki') {
    if (reps >= 37) return 0;
    return (oneRm * (37 - reps)) / 36;
  }
  return oneRm / (1 + reps / 30);
}
