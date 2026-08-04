// ─── UNITS ───────────────────────────────────────────────────────────────────
// The data constitution (see story.ts) stores every weight once, in kilograms.
// This module is the only place those kilograms become a rendered string, so a
// pound reader and a kilo reader are looking at the same dataset through two
// formatters rather than two copies of the numbers.
//
// Pounds are the default for the United States (plus Liberia and Myanmar, the
// only other countries that never adopted the metric system). Everywhere else
// lifts in kilos — British, Australian and Canadian gyms all plate in kg — so
// the rest of the world gets kg.
// ─────────────────────────────────────────────────────────────────────────────

export type Unit = 'kg' | 'lb';

/** Exact by definition: 1 lb = 0.45359237 kg. */
const KG_PER_LB = 0.45359237;

export const toLb = (kg: number): number => kg / KG_PER_LB;

/** Countries that read weights in pounds. */
const IMPERIAL = new Set(['US', 'LR', 'MM']);

export function unitForCountry(country?: string | null): Unit {
    return country && IMPERIAL.has(country.toUpperCase()) ? 'lb' : 'kg';
}

/** The number alone, converted and rounded. */
export function weightValue(kg: number, unit: Unit, dp = 1): string {
    const v = unit === 'lb' ? toLb(kg) : kg;
    return v.toFixed(dp);
}

/** Number + unit, e.g. "104.0 kg" / "229.3 lb". */
export function weight(kg: number, unit: Unit, dp = 1): string {
    return `${weightValue(kg, unit, dp)} ${unit}`;
}

/** Drops a trailing ".0" — for the app-screen chrome where 85 kg reads better
 *  than 85.0 kg, matching how the product itself renders a logged set. */
export function weightTrim(kg: number, unit: Unit): string {
    const v = unit === 'lb' ? toLb(kg) : kg;
    return `${Number.isInteger(v) ? v : v.toFixed(1)} ${unit}`;
}

/**
 * Gridline ticks for the hero chart, per unit.
 *
 * The chart's y domain is fixed in kilograms (78–112). Kilo readers get round
 * kilos; pound readers get round pounds, positioned by converting each label
 * back to its kilogram value so both axes plot against the same scale.
 */
export function yTicksFor(unit: Unit): { kg: number; label: string }[] {
    if (unit === 'lb') {
        return [180, 200, 220, 240].map((lb) => ({
            kg: lb * KG_PER_LB,
            label: `${lb} lb`,
        }));
    }
    return [80, 90, 100, 110].map((kg) => ({ kg, label: `${kg} kg` }));
}
