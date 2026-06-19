/**
 * Locale-derived defaults for Peak Fettle.
 *
 * Founder decision (2026-06-19): weight units default to the user's COUNTRY —
 * the United States uses pounds, everywhere else uses kilograms. This is a
 * DEFAULT only; it is applied when the user has not explicitly chosen a unit
 * (e.g. during onboarding, or as the initial `unit_pref` when none is stored)
 * and stays fully overridable by the kg/lbs toggle in Settings.
 *
 * We read the device region via expo-localization rather than the language —
 * an en-GB or es-US user should still get the unit their country uses, and the
 * region code is the right signal for that. Everything is defensively guarded:
 * `getLocales()` can return an empty array and `regionCode` can be null, in
 * which case we fall back to the global default ('kg').
 */

import * as Localization from 'expo-localization';
import type { UnitSystem } from './units';

/** Country/region codes that use pounds (lbs) for body/lifting weight. */
const LBS_REGION_CODES: ReadonlySet<string> = new Set(['US']);

/**
 * The default weight unit for the device's region.
 *
 * Returns 'lbs' when the primary locale's region is the United States, else
 * 'kg'. Guarded against an empty locale list and a null region code so it can
 * never throw — it simply falls back to 'kg'.
 */
export function defaultUnitForLocale(): UnitSystem {
  try {
    const locales = Localization.getLocales?.() ?? [];
    const region = locales[0]?.regionCode;
    if (typeof region === 'string' && LBS_REGION_CODES.has(region.toUpperCase())) {
      return 'lbs';
    }
  } catch {
    // expo-localization unavailable (e.g. an unexpected runtime) — fall through.
  }
  return 'kg';
}
