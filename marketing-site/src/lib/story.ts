// ─── THE DATA CONSTITUTION ───────────────────────────────────────────────────
// Every number rendered anywhere on the marketing site must trace to exactly
// one of two sources:
//   (a) THE STORY — the 26-week composite-lifter narrative below, or
//   (b) a real product constant (the 0–1000 scale, £0 / £6.99, Epley's formula,
//       the 8 disciplines).
// No other digits are permitted: no decorative stats, no sparkline filler,
// no counters ticking to impressive values. If a future edit needs a number,
// it cites this file or it doesn't ship. That discipline — every figure
// captioned, sourced, and honest about the boring parts — is the aesthetic.
//
// The lifter: "A.R., 29 — three years trained" is a composite. The math is
// real (Epley e1RM; scores follow the product's 0–1000 model). The shape is
// deliberately honest: fast returning-lifter gains, a five-week plateau, a
// programmed deload, one PR, then slow grinding. Nobody posts the plateau.
// ─────────────────────────────────────────────────────────────────────────────

import { weightValue, toLb, type Unit } from './units';

/** Round to the nearest 5 — the granularity gyms actually plate in. */
const round5 = (v: number): number => Math.round(v / 5) * 5;

export type StoryWeek = {
    wk: number;
    /** estimated one-rep max, bench press, kg (Epley from logged working sets) */
    e1rm: number;
    /** 0–1000 strength score at that week */
    score: number;
    /**
     * Editorial annotation, lowercase mono voice (only on landmark weeks).
     *
     * A plain string is unit-free and reads the same either way. Where the beat
     * names a weight it is written twice, because the landmarks are round
     * numbers in one unit and meaningless in the other: "first time past 100"
     * is a kilo milestone, and its pound equivalent is passing 225, not 229.3.
     * The digits still trace to `e1rm` — only the framing is hand-set.
     */
    note?: string | Record<Unit, string>;
};

/** The annotation for a week, in the reader's unit. */
export function noteFor(week: StoryWeek, unit: Unit): string | undefined {
    if (!week.note) return undefined;
    return typeof week.note === 'string' ? week.note : week.note[unit];
}

export const LIFTER = {
    initials: 'A.R.',
    age: 29,
    yearsTrained: 3,
    cohort: 'M · 25–34 · 2–4 YRS TRAINED',
} as const;

/** The one dataset. Bench press e1RM (kg) + strength score, weeks 1–26. */
export const STORY: StoryWeek[] = [
    { wk: 1,  e1rm: 84.0,  score: 612, note: { kg: 'wk 01 — return to the bar · e1RM 84.0 kg', lb: 'wk 01 — return to the bar · e1RM 185.2 lb' } },
    { wk: 2,  e1rm: 86.5,  score: 618 },
    { wk: 3,  e1rm: 88.0,  score: 622 },
    { wk: 4,  e1rm: 90.5,  score: 627 },
    { wk: 5,  e1rm: 92.0,  score: 631 },
    { wk: 6,  e1rm: 93.5,  score: 634 },
    { wk: 7,  e1rm: 95.0,  score: 638 },
    { wk: 8,  e1rm: 96.0,  score: 641 },
    { wk: 9,  e1rm: 96.5,  score: 643 },
    { wk: 10, e1rm: 96.0,  score: 643 },
    { wk: 11, e1rm: 96.5,  score: 644 },
    { wk: 12, e1rm: 97.0,  score: 645 },
    { wk: 13, e1rm: 96.5,  score: 645, note: 'wks 09–13 — the plateau. nobody posts this part.' },
    { wk: 14, e1rm: 92.0,  score: 641, note: 'wk 14 — deload, on purpose' },
    { wk: 15, e1rm: 95.5,  score: 645 },
    { wk: 16, e1rm: 98.0,  score: 650 },
    { wk: 17, e1rm: 100.0, score: 655 },
    { wk: 18, e1rm: 101.5, score: 659 },
    { wk: 19, e1rm: 104.0, score: 665, note: { kg: 'wk 19 — 104.0 kg. first time past 100.', lb: 'wk 19 — 229.3 lb. first time past 225.' } },
    { wk: 20, e1rm: 103.5, score: 666 },
    { wk: 21, e1rm: 104.5, score: 668 },
    { wk: 22, e1rm: 105.0, score: 670 },
    { wk: 23, e1rm: 104.5, score: 671, note: 'wk 23 — two sessions missed. make-up window kept the streak.' },
    { wk: 24, e1rm: 105.5, score: 673 },
    { wk: 25, e1rm: 106.0, score: 675 },
    { wk: 26, e1rm: 107.5, score: 678, note: { kg: 'wk 26 — e1RM 107.5 kg · score 612 → 678', lb: 'wk 26 — e1RM 237.0 lb · score 612 → 678' } },
];

/** Derived landmarks — single place so sections can never disagree. */
export const LANDMARKS = {
    start: STORY[0],                       // wk 01 — 84.0 kg, score 612
    plateauEnd: STORY[12],                 // wk 13 — the flat stretch closes
    deload: STORY[13],                     // wk 14 — 92.0 kg, by design
    pr: STORY[18],                         // wk 19 — 104.0 kg, gold
    end: STORY[25],                        // wk 26 — 107.5 kg, score 678
    gainKg: 23.5,                          // 107.5 − 84.0
    percentileStart: 41,                   // wk 01, within A.R.'s cohort
    percentileEnd: 64,                     // wk 26, within A.R.'s cohort
    nextWeek: 27,                          // the week the ledger hands the reader
} as const;

/** A.R.'s current streak at the end of the story (the wk-23 lapse was
 *  bridged by a make-up window, so the run survives). */
export const STREAK_DAYS = 12;

/**
 * The week the app-showcase "plates" depict (the fast start chapter).
 * Phone screens render this week's numbers so page and product agree.
 */
export const PLATE_WEEK = STORY[5];        // wk 06 — e1RM 93.5 kg, score 634

/** A.R.'s cohort percentile at the plate week (between 41st wk01 → 64th wk26). */
export const PLATE_PERCENTILE = 47;

/**
 * The plate week's logged bench sets — each Epley-consistent with the
 * 93.5 kg week-6 e1RM (85 × (1 + 3/30) = 93.5 is the top set).
 */
export const PLATE_SETS = [
    { weightKg: 85,   reps: 3, e1rm: 93.5, pr: true },
    { weightKg: 80,   reps: 5, e1rm: 93.3, pr: false },
    { weightKg: 72.5, reps: 6, e1rm: 87.0, pr: false },
] as const;

/**
 * Fig. 01 — the method's worked example. 72 kg × 5 under Epley:
 * 72 × (1 + 5/30) = 84.0 kg — exactly A.R.'s week-1 e1RM.
 */
export const METHOD_SET = { weightKg: 72, reps: 5, e1rm: 84.0 } as const;

// ─── THE POUND EDITION ───────────────────────────────────────────────────────
// The constitution above is authored in kilograms, and every pound figure used
// to be a live conversion of it — which is why a US reader saw "158.7 lb × 5"
// and "185.2 lb". Arithmetically correct, but nobody has ever loaded 158.7 lb.
//
// So pounds are now authored natively: round numbers a lifter would actually
// plate, with the Epley arithmetic exactly true in the unit being displayed.
// The narrative shape is unchanged — the same fast start, the same five-week
// plateau, the same deload and PR — because the series is derived from the
// kilogram one and rounded to the nearest 5 lb.
//
// The honest caveat, stated rather than buried: A.R. is a COMPOSITE, and the
// two editions are therefore the same lifter told in two units, not the same
// numbers converted. Every value below is within ~2.5 lb of the true conversion
// except week 6, noted where it happens.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Week-6 is pinned to 210 rather than the rounded 205.
 *
 * 205 lb is not reachable as an Epley result from any multi-rep set at a plated
 * weight (205 = W × (1 + r/30) has no solution where W is divisible by 5 and
 * r > 1). Since the phone mockup shows this week's actual logged sets, the week
 * has to land somewhere a real set can produce. 210 costs 3.9 lb of drift on one
 * week of a composite; showing sets that don't add up would cost the whole point.
 */
const LB_OVERRIDES: Record<number, number> = { 6: 210 };

/** e1RM for a week in the reader's unit: real kilos, or native round pounds. */
export function e1rmFor(week: StoryWeek, unit: Unit): number {
    if (unit === 'kg') return week.e1rm;
    return LB_OVERRIDES[week.wk] ?? round5(toLb(week.e1rm));
}

/**
 * Fig. 01 — the worked example, per unit.
 *
 * kg: 72 × (1 + 5/30) = 84.0 — exactly A.R.'s week-1 e1RM.
 * lb: 150 × (1 + 7/30) = 185 — exactly A.R.'s week-1 e1RM in pounds, and both
 *     numbers are ones you could actually load. The rep count differs because
 *     that is what makes the arithmetic land whole in each unit.
 */
export const METHOD_SET_LB = { weightLb: 150, reps: 7, e1rm: 185 } as const;

/** Fig. 01's numbers in the reader's unit. */
export function methodSetFor(unit: Unit): { weight: number; reps: number; e1rm: number } {
    return unit === 'lb'
        ? { weight: METHOD_SET_LB.weightLb, reps: METHOD_SET_LB.reps, e1rm: METHOD_SET_LB.e1rm }
        : { weight: METHOD_SET.weightKg, reps: METHOD_SET.reps, e1rm: METHOD_SET.e1rm };
}

/**
 * The plate week's logged sets in pounds. Each is Epley-exact and plateable:
 *   180 × (1 + 5/30) = 210   ← the PR, and the week's e1RM
 *   175 × (1 + 6/30) = 210
 *   150 × (1 + 8/30) = 190
 */
export const PLATE_SETS_LB = [
    { weightLb: 180, reps: 5, e1rm: 210, pr: true },
    { weightLb: 175, reps: 6, e1rm: 210, pr: false },
    { weightLb: 150, reps: 8, e1rm: 190, pr: false },
] as const;

/** The plate week's sets in the reader's unit, as {weight, reps, pr}. */
export function plateSetsFor(unit: Unit): { weight: number; reps: number; pr: boolean }[] {
    return unit === 'lb'
        ? PLATE_SETS_LB.map((s) => ({ weight: s.weightLb, reps: s.reps, pr: s.pr }))
        : PLATE_SETS.map((s) => ({ weight: s.weightKg, reps: s.reps, pr: s.pr }));
}

/**
 * Fig. 04 a/b/c — the cohort small-multiples proof. The SAME final score
 * (678) lands at three different percentiles depending on the cohort —
 * which is the entire fairness argument, made wordless.
 */
export const COHORT_MULTIPLES = [
    { label: 'M · 18–24 · <1 YR TRAINED',  percentile: 81, you: false },
    { label: LIFTER.cohort,                percentile: LANDMARKS.percentileEnd, you: true },
    { label: 'M · 40+ · 10+ YRS TRAINED',  percentile: 47, you: false },
] as const;

// ─── Chart geometry helpers (pure; SSR-safe) ────────────────────────────────

export type ChartFrame = {
    width: number; height: number;
    left: number; right: number; top: number; bottom: number;
    /** e1RM domain mapped to the y axis */
    yMin: number; yMax: number;
    /** week domain mapped to the x axis */
    wkMin: number; wkMax: number;
};

export function xAt(frame: ChartFrame, wk: number): number {
    const { width, left, right, wkMin, wkMax } = frame;
    return left + ((wk - wkMin) / (wkMax - wkMin)) * (width - left - right);
}

export function yAt(frame: ChartFrame, e1rm: number): number {
    const { height, top, bottom, yMin, yMax } = frame;
    return top + ((yMax - e1rm) / (yMax - yMin)) * (height - top - bottom);
}

/** Straight polyline through the weeks — honest data, no smoothing. */
export function linePath(frame: ChartFrame, weeks: StoryWeek[] = STORY): string {
    return weeks
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(frame, p.wk).toFixed(1)} ${yAt(frame, p.e1rm).toFixed(1)}`)
        .join(' ');
}

/** Same line closed down to the x-axis, for the area fill under the climb. */
export function areaPath(frame: ChartFrame, weeks: StoryWeek[] = STORY): string {
    const base = (frame.height - frame.bottom).toFixed(1);
    const first = weeks[0];
    const last = weeks[weeks.length - 1];
    return (
        `M${xAt(frame, first.wk).toFixed(1)} ${base} ` +
        weeks.map((p) => `L${xAt(frame, p.wk).toFixed(1)} ${yAt(frame, p.e1rm).toFixed(1)}`).join(' ') +
        ` L${xAt(frame, last.wk).toFixed(1)} ${base} Z`
    );
}

/** Fixed-slot readout strings (mono): no layout shift as the scrub moves. */
export function readout(week: StoryWeek, unit: Unit = 'kg'): string {
    const wk = String(week.wk).padStart(2, '0');
    // Both units sit in five characters across the story's range
    // (84.0-107.5 kg / 185.2-237.0 lb), so the slot width never changes.
    const kg = weightValue(week.e1rm, unit).padStart(5, ' '); // figure space pad
    return `WK ${wk} · E1RM ${kg} ${unit.toUpperCase()} · SCORE ${week.score}`;
}
