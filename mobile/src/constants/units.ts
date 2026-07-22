/**
 * Unit system constants for Peak Fettle.
 *
 * The user's preference (kg / lbs) is stored as `unit_pref` on the User
 * object and persisted by the server. The UI reads this from AuthContext
 * and converts display values using the helpers below.
 *
 * Source of truth (2026-07-21): set weights store the EXACT entered value as
 * fixed-point integer centi units (`weight_centi` = value × 100 in the entered
 * unit, + `weight_unit`) alongside canonical kilograms (`weight_kg`, used for
 * all computation and sync). Display/edit prefers the exact entry; kg is the
 * fallback for legacy rows. Convert only via the helpers below.
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
 * DEPRECATED for display (2026-07-21): this was a band-aid for the old
 * weight_raw (kg×8) fixed-point encoding, but once weights were stored as
 * exact kg it CORRUPTED displayed values — an entered 186.7 lb rendered as
 * 186.75 lb. Display paths now show the exact entry (see weight_centi /
 * formatWeight's 2-decimal rounding). Keep only for plate-increment stepping
 * where snapping to quarter-pound plate math is genuinely wanted.
 */
export function roundToNearestQuarterLb(lbs: number): number {
  return Math.round(lbs * 4) / 4;
}

/**
 * Format a weight for display given the user's unit preference.
 * @param weightKg - Weight in kilograms (canonical stored value)
 * @param unitPref - The user's preferred unit system
 * @param decimals - Number of decimal places (default 1)
 * @returns Formatted string e.g. "100.0 kg" or "220.5 lbs"
 *
 * When unitPref is 'lbs', the converted value is rounded to 2 decimals (0.01
 * lb) before formatting — this absorbs float dust from the kg round-trip while
 * reproducing the entered value exactly. (The old nearest-0.25-lb rounding is
 * GONE: it displayed 186.7 lb entries as 186.75 lb. Prefer formatWeightEntry
 * when the exact centi entry is available.)
 */
export function formatWeight(
  weightKg: number,
  unitPref: UnitSystem,
  decimals = 1
): string {
  if (unitPref === 'lbs') {
    const lbs = Number(kgToLbs(weightKg).toFixed(2));
    return `${lbs.toFixed(decimals)} lbs`;
  }
  return `${weightKg.toFixed(decimals)} kg`;
}

// ---------------------------------------------------------------------------
// Fixed-point exact weight entry ("dollars and cents", 2026-07-21)
//
// Whatever the user types is stored EXACTLY as an integer: weight_centi =
// entered value × 100 in the ENTERED unit (50 lb → 5000, 82.5 kg → 8250),
// paired with weight_unit ('kg' | 'lbs'). Integers can't pick up float dust
// through storage/serialization, and recording the entry unit means a lbs
// user's 186.7 always reads back as 186.7 — no kg round-trip involved.
// weight_kg stays the canonical value for all computation (1RM, volume,
// percentiles, server sync); centi + unit are the display/edit source of truth.
// ---------------------------------------------------------------------------

/** Convert a typed display value to fixed-point centi units (value × 100). */
export function displayToCenti(displayValue: number): number {
  return Math.round(displayValue * 100);
}

/** Convert a stored centi entry to canonical kilograms (for computation). */
export function centiToKg(centi: number, unit: UnitSystem): number {
  const value = centi / 100;
  return unit === 'lbs' ? lbsToKg(value) : value;
}

/**
 * Convert a stored centi entry to a display-unit number. Exact (no float
 * involvement at all) when the stored unit matches the viewer's unit pref;
 * cross-unit views convert and round to 2 decimals.
 */
export function centiToDisplayValue(
  centi: number,
  storedUnit: UnitSystem,
  unitPref: UnitSystem
): number {
  const value = centi / 100;
  if (storedUnit === unitPref) return value;
  const converted = unitPref === 'lbs' ? kgToLbs(value) : lbsToKg(value);
  return Number(converted.toFixed(2));
}

/**
 * Format an exact centi entry for display, trimming trailing zeros so the
 * value reads back exactly as typed ("186.7 lbs", "82.5 kg", "50 lbs").
 */
export function formatWeightEntry(
  centi: number,
  storedUnit: UnitSystem,
  unitPref: UnitSystem
): string {
  const value = centiToDisplayValue(centi, storedUnit, unitPref);
  return `${String(value)} ${unitPref === 'lbs' ? 'lbs' : 'kg'}`;
}

/**
 * Row shape shared by anything that carries a set weight: canonical kg plus
 * the optional exact fixed-point entry (null on legacy rows / server rows
 * that predate the columns).
 */
export interface ExactWeightFields {
  weight_kg: number;
  weight_centi?: number | null;
  weight_unit?: string | null;
}

function exactEntryOf(row: ExactWeightFields): { centi: number; unit: UnitSystem } | null {
  if (
    row.weight_centi != null &&
    Number.isFinite(row.weight_centi) &&
    (row.weight_unit === 'kg' || row.weight_unit === 'lbs')
  ) {
    return { centi: row.weight_centi, unit: row.weight_unit };
  }
  return null;
}

/**
 * Preferred set-weight formatter: shows the EXACT entered value when the row
 * carries the fixed-point entry, otherwise falls back to the canonical-kg
 * formatWeight (2-decimal rounded — still entry-exact for v3+ rows).
 */
export function formatSetWeight(
  row: ExactWeightFields,
  unitPref: UnitSystem,
  decimals = 1
): string {
  const exact = exactEntryOf(row);
  if (exact) return formatWeightEntry(exact.centi, exact.unit, unitPref);
  return formatWeight(row.weight_kg, unitPref, decimals);
}

/**
 * Preferred edit-prefill: returns the EXACT entered value as a clean editable
 * string when available, otherwise falls back to kgToInputValue.
 */
export function setWeightToInputValue(
  row: ExactWeightFields,
  unitPref: UnitSystem
): string {
  const exact = exactEntryOf(row);
  if (exact) return String(centiToDisplayValue(exact.centi, exact.unit, unitPref));
  return kgToInputValue(row.weight_kg, unitPref);
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

// ---------------------------------------------------------------------------
// Length (TICKET-130: body measurements module)
//
// Mirrors the weight-unit helpers above EXACTLY — the 185 lb -> 185 kg lesson
// applies to length too: ONE conversion path, canonical storage unit, and a
// stable prefill round-trip. Canonical storage = cm (matches the `unit: 'cm'`
// value most measurements naturally take); `displayToCm` converts a typed
// display value TO storage on save, `cmToInputValue` converts a stored value
// back to a clean editable string for PREFILLING an edit field.
// ---------------------------------------------------------------------------

/** Exact conversion factor. 1 inch = 2.54 cm. */
export const CM_TO_IN = 1 / 2.54;

/** Convert centimetres to inches. */
export function cmToIn(cm: number): number {
  return cm * CM_TO_IN;
}

/** Convert inches to centimetres. */
export function inToCm(inches: number): number {
  return inches / CM_TO_IN;
}

/**
 * Convert a display-unit length value back to canonical centimetres for
 * storage. `unitPref` here is the LENGTH unit ('cm' | 'in'), independent of
 * the user's weight unit_pref (a lbs-weight user can still prefer cm tape
 * measurements, though in practice the two are usually aligned by the caller).
 * @param displayValue - the number entered by the user
 * @param unitPref      - 'cm' | 'in'
 * @returns length in centimetres (FULL precision — do not pre-round before storing)
 */
export function displayToCm(displayValue: number, unitPref: 'cm' | 'in'): number {
  return unitPref === 'in' ? inToCm(displayValue) : displayValue;
}

/**
 * Convert a stored exact-cm length into a clean editable string for
 * PREFILLING an input when revising an existing measurement. Mirrors
 * kgToInputValue: round to `maxDecimals`, then strip trailing zeros so a
 * clean entry round-trips exactly (81.5 cm shows as "81.5", not "81.50").
 * @param valueCm     - stored length in centimetres (exact)
 * @param unitPref    - 'cm' | 'in'
 * @param maxDecimals - max decimals to show (default 1 — tape-measure precision)
 */
export function cmToInputValue(
  valueCm: number,
  unitPref: 'cm' | 'in',
  maxDecimals = 1,
): string {
  const value = unitPref === 'in' ? cmToIn(valueCm) : valueCm;
  const rounded = Number(value.toFixed(maxDecimals));
  return String(rounded);
}

/**
 * Format a length for display given the unit preference.
 * @param valueCm  - length in centimetres (canonical storage value)
 * @param unitPref - 'cm' | 'in'
 * @param decimals - number of decimal places (default 1)
 * @returns Formatted string e.g. "81.5 cm" or "32.1 in"
 */
export function formatLength(
  valueCm: number,
  unitPref: 'cm' | 'in',
  decimals = 1,
): string {
  if (unitPref === 'in') {
    return `${cmToIn(valueCm).toFixed(decimals)} in`;
  }
  return `${valueCm.toFixed(decimals)} cm`;
}

/**
 * Parse a free-text length input (decimal string), tolerating a
 * trailing/leading dot, commas as decimal separators, and stray whitespace.
 * Returns null for empty/invalid/non-positive input so callers can show a
 * validation hint rather than storing NaN or a nonsensical 0/negative length.
 */
export function parseLengthInput(text: string): number | null {
  if (text == null) return null;
  const normalized = String(text).trim().replace(',', '.');
  if (normalized === '' || normalized === '.') return null;
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}
