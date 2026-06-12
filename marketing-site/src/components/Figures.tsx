// Numbered editorial figures — the essay's diagrams. All server-rendered
// inline SVG; every digit traces to src/lib/story.ts (see the data
// constitution there). Fixed aspect ratios, so SVG text scales like a print
// figure rather than reflowing.

import {
    STORY,
    LANDMARKS,
    METHOD_SET,
    COHORT_MULTIPLES,
    linePath,
    xAt,
    yAt,
    type ChartFrame,
} from '@/lib/story';
import styles from './Figures.module.css';

/** Gaussian curve path for cohort distributions (pure, deterministic). */
function gaussPath(
    w: number, h: number, padX: number, baseY: number, peak: number,
    mean: number, sd: number, domain: number, steps = 72,
): string {
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
        const s = (i / steps) * domain;
        const x = padX + (s / domain) * (w - padX * 2);
        const z = (s - mean) / sd;
        const y = baseY - Math.exp(-0.5 * z * z) * peak;
        pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(' ');
}

const scoreX = (w: number, padX: number, s: number) => padX + (s / 1000) * (w - padX * 2);

/** 81 → "81st", 64 → "64th" — ordinals for percentile captions. */
const ord = (n: number) => {
    const v = n % 100;
    const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
    return `${n}${suffix}`;
};

/* ─── Fig. 01 — Estimate: one logged set becomes an e1RM ─────────────────── */

export function FigEstimate() {
    return (
        <svg viewBox="0 0 360 210" className={styles.fig} role="img"
            aria-label={`A logged set of ${METHOD_SET.weightKg} kilograms for ${METHOD_SET.reps} reps becomes an estimated one-rep max of ${METHOD_SET.e1rm} kilograms`}>
            <rect x="22" y="42" width="138" height="60" rx="6" className={styles.panel} />
            <text x="38" y="66" className={styles.tinyMuted}>SET 01 — BENCH</text>
            <text x="38" y="90" className={styles.monoStrong}>{METHOD_SET.weightKg} kg × {METHOD_SET.reps}</text>
            <path d="M160 72 H 232 V 128" className={styles.leader} />
            <text x="244" y="116" className={styles.tinyMuted}>e1RM</text>
            <text x="244" y="142" className={styles.accentBig}>{METHOD_SET.e1rm.toFixed(1)} kg</text>
            <text x="22" y="192" className={styles.formula}>epley — w × (1 + r/30) · 72 × 7/6 = 84.0</text>
        </svg>
    );
}

/* ─── Fig. 02 — Score: the 0–1000 scale, one quiet marker ────────────────── */

export function FigScale() {
    const w = 360, padX = 24, y = 118;
    const mx = scoreX(w, padX, LANDMARKS.start.score);
    return (
        <svg viewBox="0 0 360 210" className={styles.fig} role="img"
            aria-label={`A horizontal 0 to 1000 strength score scale with a single marker at ${LANDMARKS.start.score}, week one`}>
            <line x1={padX} y1={y} x2={w - padX} y2={y} className={styles.axis} />
            {[0, 250, 500, 750, 1000].map((v) => {
                const x = scoreX(w, padX, v);
                return (
                    <g key={v}>
                        <line x1={x} y1={y} x2={x} y2={y + 8} className={styles.axis} />
                        <text x={x} y={y + 26} textAnchor="middle" className={styles.tinyMuted}>{v}</text>
                    </g>
                );
            })}
            <line x1={mx} y1={y} x2={mx} y2={76} className={styles.markerLine} />
            <circle cx={mx} cy={y} r="4.5" className={styles.markerDot} />
            <text x={mx} y={62} textAnchor="middle" className={styles.monoAccent}>
                {LANDMARKS.start.score} — wk 01
            </text>
            <text x="22" y="192" className={styles.formula}>score — f(e1rm, volume, overload, consistency)</text>
        </svg>
    );
}

/* ─── Fig. 03 — Rank: the cohort curve, one honest dot ───────────────────── */

export function FigCohort() {
    const w = 360, padX = 24, baseY = 138, peak = 74;
    // A.R.'s wk-01 score sits at the 41st percentile of his cohort.
    const mean = 630, sd = 92;
    const mx = scoreX(w, padX, LANDMARKS.start.score);
    const z = (LANDMARKS.start.score - mean) / sd;
    const my = baseY - Math.exp(-0.5 * z * z) * peak;
    return (
        <svg viewBox="0 0 360 210" className={styles.fig} role="img"
            aria-label={`A cohort distribution curve with A.R.'s week-one score marked at the ${LANDMARKS.percentileStart}st percentile`}>
            <line x1={padX} y1={baseY} x2={w - padX} y2={baseY} className={styles.axis} />
            <path d={gaussPath(w, 0, padX, baseY, peak, mean, sd, 1000)} className={styles.curve} />
            <line x1={mx} y1={baseY} x2={mx} y2={my} className={styles.markerLine} />
            <circle cx={mx} cy={my} r="4.5" className={styles.markerDot} />
            <text x={mx + 10} y={my - 8} className={styles.monoAccent}>
                you — {LANDMARKS.percentileStart}st
            </text>
            <text x="22" y="192" className={styles.formula}>cohort — M · 25–34 · 2–4 yrs trained</text>
        </svg>
    );
}

/* ─── Fig. 05 — The deload, up close (weeks 12–16) ───────────────────────── */

export function FigDeload() {
    const frame: ChartFrame = {
        width: 720, height: 280,
        left: 56, right: 28, top: 32, bottom: 40,
        yMin: 88, yMax: 100, wkMin: 12, wkMax: 16,
    };
    const crop = STORY.slice(11, 16); // wks 12–16
    const deloadX = xAt(frame, 14);
    const deloadY = yAt(frame, LANDMARKS.deload.e1rm);
    return (
        <svg viewBox="0 0 720 280" className={styles.fig} role="img"
            aria-label="A zoomed chart of weeks 12 to 16 showing the deliberate week-14 deload dip from 97 to 92 kilograms and the rebuild after it">
            {[90, 95, 100].map((v) => (
                <g key={v}>
                    <line x1={frame.left} x2={frame.width - frame.right}
                        y1={yAt(frame, v)} y2={yAt(frame, v)} className={styles.grid} />
                    <text x={frame.left - 10} y={yAt(frame, v) + 4} textAnchor="end" className={styles.tinyMuted}>
                        {v}
                    </text>
                </g>
            ))}
            {crop.map((p) => (
                <text key={p.wk} x={xAt(frame, p.wk)} y={frame.height - 14} textAnchor="middle" className={styles.tinyMuted}>
                    wk {p.wk}
                </text>
            ))}
            <path d={linePath(frame, crop)} className={styles.cropLine} />
            <circle cx={deloadX} cy={deloadY} r="5" className={styles.markerDot} />
            <path d={`M${deloadX} ${deloadY + 14} V ${deloadY + 44}`} className={styles.leader} />
            <text x={deloadX} y={deloadY + 64} textAnchor="middle" className={styles.monoNote}>
                wk 14 — deload, on purpose
            </text>
        </svg>
    );
}

/* ─── Fig. 04 a/b/c — same score, three cohorts, three truths ────────────── */

export function FigCohortMultiples() {
    const w = 560, h = 116, padX = 36, baseY = 86, peak = 52;
    const finalScore = LANDMARKS.end.score;
    const mx = scoreX(w, padX, finalScore);
    // Curve placements chosen so the same 678 reads high / middling / modest.
    const params = [
        { mean: 590, sd: 96 },  // young, new to training — 678 is well right
        { mean: 645, sd: 92 },  // A.R.'s cohort — 678 is a little right
        { mean: 690, sd: 98 },  // long-trained — 678 sits left of the bulk
    ];
    const letters = ['a', 'b', 'c'];
    return (
        <div className={styles.multiples}>
            {COHORT_MULTIPLES.map((c, i) => {
                const { mean, sd } = params[i];
                const z = (finalScore - mean) / sd;
                const my = baseY - Math.exp(-0.5 * z * z) * peak;
                return (
                    <figure key={c.label} className={`${styles.multiple} ${c.you ? styles.multipleYou : ''}`}>
                        <svg viewBox={`0 0 ${w} ${h}`} role="img"
                            aria-label={`Cohort ${c.label}: the same score of ${finalScore} lands at the ${ord(c.percentile)} percentile`}>
                            <line x1={padX} y1={baseY} x2={w - padX} y2={baseY} className={styles.axis} />
                            <path d={gaussPath(w, 0, padX, baseY, peak, mean, sd, 1000)} className={styles.curve} />
                            <line x1={mx} y1={baseY} x2={mx} y2={my} className={c.you ? styles.markerLine : styles.markerLineDim} />
                            <circle cx={mx} cy={my} r="4" className={c.you ? styles.markerDot : styles.markerDotDim} />
                        </svg>
                        <figcaption className={styles.multipleCaption}>
                            <span className={styles.multipleLabel}>
                                fig. 04{letters[i]} — {c.label}{c.you ? ' · A.R.' : ''}
                            </span>
                            <span className={c.you ? styles.multiplePctYou : styles.multiplePct}>
                                score {finalScore} → {ord(c.percentile)} pct
                            </span>
                        </figcaption>
                    </figure>
                );
            })}
        </div>
    );
}

/* ─── The terminal projection — wk 27 is yours ───────────────────────────── */

export function FigProjection() {
    return (
        <svg viewBox="0 0 340 120" className={styles.projection} aria-hidden="true">
            {/* the spine arrives */}
            <path d="M20 92 H 64" className={styles.spineSolid} />
            {/* gold use 3 of 3 — the final up-tick */}
            <path d="M64 92 L 78 74" className={styles.tickGold} />
            {/* the dashed projection, exiting through an open arrowhead */}
            <path d="M78 74 L 286 34" className={styles.dashed} />
            <path d="M276 26 L 292 33 L 282 46" className={styles.arrowHead} />
            <text x="208" y="72" className={styles.monoNote}>wk {LANDMARKS.nextWeek} — yours</text>
        </svg>
    );
}
