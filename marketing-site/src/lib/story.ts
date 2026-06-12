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

export type StoryWeek = {
    wk: number;
    /** estimated one-rep max, bench press, kg (Epley from logged working sets) */
    e1rm: number;
    /** 0–1000 strength score at that week */
    score: number;
    /** editorial annotation, lowercase mono voice (only on landmark weeks) */
    note?: string;
};

export const LIFTER = {
    initials: 'A.R.',
    age: 29,
    yearsTrained: 3,
    cohort: 'M · 25–34 · 2–4 YRS TRAINED',
} as const;

/** The one dataset. Bench press e1RM (kg) + strength score, weeks 1–26. */
export const STORY: StoryWeek[] = [
    { wk: 1,  e1rm: 84.0,  score: 612, note: 'wk 01 — return to the bar · e1RM 84.0 kg' },
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
    { wk: 19, e1rm: 104.0, score: 665, note: 'wk 19 — 104.0 kg. first time past 100.' },
    { wk: 20, e1rm: 103.5, score: 666 },
    { wk: 21, e1rm: 104.5, score: 668 },
    { wk: 22, e1rm: 105.0, score: 670 },
    { wk: 23, e1rm: 104.5, score: 671 },
    { wk: 24, e1rm: 105.5, score: 673 },
    { wk: 25, e1rm: 106.0, score: 675 },
    { wk: 26, e1rm: 107.5, score: 678, note: 'wk 26 — e1RM 107.5 kg · score 612 → 678' },
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
} as const;

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
export function readout(week: StoryWeek): string {
    const wk = String(week.wk).padStart(2, '0');
    const kg = week.e1rm.toFixed(1).padStart(5, ' '); // figure space pad
    return `WK ${wk} · E1RM ${kg} KG · SCORE ${week.score}`;
}
