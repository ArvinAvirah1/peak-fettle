/**
 * Unit system constants for Peak Fettle.
 *
 * The user's preference (kg / lbs) is stored as `unit_pref` on the User
 * object and persisted by the server. The UI reads this from AuthContext
 * and converts display values using the helpers below.
 *
 * Source of truth: always store weights in kilograms internally (matching
 * the server's weight_kg column). Convert to lbs only at render time.
 */

export type UnitSystem = 'kg' | 'lbs';

/** Exact conversion factor. 1 kg = 2.20462 lbs. */
export const KG_TO_LBS = 2.20462 as const;

/**
 * Convert kilograms to pounds.
 * @param kg - Weight in kilograms
 * @returns Weight in pounds
 */
export function kgToLbs(kg: number): number {
  return kg * KG_TO_LBS;
}

/**
 * Convert pounds to kilograms.
 * @param lbs - Weight in pounds
 * @returns Weight in kilograms
 */
export function lbsToKg(lbs: number): number {
  return lbs / KG_TO_LBS;
}

/**
 * Round a lbs value to the nearest quarter pound (0.25 lb).
 *
 * Band-aid for weight_raw fixed-point precision loss:
 *   45 lbs → kg → SMALLINT (kg×8) → kg → lbs = 44.919 lbs
 * Rounding to the nearest 0.25 lb restores standard plate values.
 * (Standard plates land on quarter-pound boundaries after any lbs↔kg
 * round-trip through the kg×8 encoding used by weight_raw.)
 */
export function roundToNearestQuarterLb(lbs: number): number {
  return Math.round(lbs * 4) / 4;
}

/**
 * Format a weight for display given the user's unit preference.
 * @param weightKg - Weight in kilograms (server-side value)
 * @param unitPref - The user's preferred unit system
 * @param decimals - Number of decimal places (default 1)
 * @returns Formatted string e.g. "100.0 kg" or "220.5 lbs"
 *
 * When unitPref is 'lbs', the value is rounded to the nearest 0.25 lb
 * before formatting to correct precision loss from the kg×8 fixed-point
 * encoding in weight_raw (SMALLINT).
 */
export function formatWeight(
  weightKg: number,
  unitPref: UnitSystem,
  decimals = 1
): string {
  if (unitPref === 'lbs') {
    const lbs = roundToNearestQuarterLb(kgToLbs(weightKg));
    return `${lbs.toFixed(decimals)} lbs`;
  }
  return `${weightKg.toFixed(decimals)} kg`;
}

/**
 * Convert a display value back to kilograms for API submission.
 * @param displayValue - The number entered by the user
 * @param unitPref - The user's preferred unit system
 * @returns Weight in kilograms (FULL precision — do not pre-round before storing)
 */
export function displayToKg(displayValue: number, unitPref: UnitSystem): number {
  return unitPref === 'lbs' ? lbsToKg(displayValue) : displayValue;
}

/**
 * Convert a stored exact-kg weight into a clean editable string for PREFILLING
 * an input when revising an existing set. This is the round-trip that must be
 * stable: a value the user typed should come back looking the same.
 *
 * Since v3 the local `sets.weight_kg` column stores the exact kilograms entered
 * (no kg×8 rounding), so `kg → display value` reproduces the original entry to
 * the displayed precision. We format to `maxDecimals` and strip trailing zeros
 * so 185 lb shows as "185" (not "185.0" or the old band-aid "184.92"), and
 * 82.5 kg shows as "82.5" (not "82.50").
 *
 * @param weightKg   - stored weight in kilograms (exact)
 * @param unitPref   - the user's preferred unit
 * @param maxDecimals - max decimals to show (default 2; lbs round-trips cleanly at 1–2)
 */
export function kgToInputValue(
  weightKg: number,
  unitPref: UnitSystem,
  maxDecimals = 2
): string {
  const value = unitPref === 'lbs' ? kgToLbs(weightKg) : weightKg;
  // Round to maxDecimals to absorb floating-point dust (e.g. 184.99999), then
  // drop trailing zeros and any trailing dot.
  const rounded = Number(value.toFixed(maxDecimals));
  return String(rounded);
}

/**
 * Parse a free-text weight input (decimal string) into a number, tolerating a
 * trailing/leading dot, commas as decimal separators, and stray whitespace.
 * Returns null for empty/invalid input so callers can show a validation hint
 * rather than storing NaN.
 */
export function parseWeightInput(text: string): number | null {
  if (text == null) return null;
  const normalized = String(text).trim().replace(',', '.');
  if (normalized === '' || normalized === '.') return null;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}
