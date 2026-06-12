'use client';
// The cover of the essay. A magazine-cover hero where the chart is the
// photograph: A.R.'s 26 weeks of bench e1RM, drawn full-bleed beneath the
// headline. The chart is operable — pointer or arrow keys scrub a crosshair
// across the weeks and a fixed-slot mono readout reports each measurement.
// Zero canvas; one inline SVG (grid/area/line) + an HTML annotation layer so
// type never distorts. Reduced motion renders the line fully drawn with the
// crosshair parked on the wk-19 PR.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import WaitlistForm from './WaitlistForm';
import EchoField from './EchoField';
import { STORY, LANDMARKS, HERO_FRAME, readout } from './heroChartGeometry';
import styles from './HeroLedger.module.css';

export default function HeroLedger() {
    // Parked on the PR until the visitor takes the controls.
    const [wkIndex, setWkIndex] = useState(LANDMARKS.pr.wk - 1);
    const [touched, setTouched] = useState(false);
    const plotRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef(0);

    const week = STORY[wkIndex];
    const F = HERO_FRAME;

    const pct = {
        x: (wk: number) => `${((F.left + ((wk - 1) / 25) * (F.width - F.left - F.right)) / F.width * 100).toFixed(3)}%`,
        y: (v: number) => `${((F.top + ((F.yMax - v) / (F.yMax - F.yMin)) * (F.height - F.top - F.bottom)) / F.height * 100).toFixed(3)}%`,
    };

    const snapToPointer = useCallback((clientX: number) => {
        const el = plotRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const fx = ((clientX - rect.left) / rect.width) * F.width;
        const t = (fx - F.left) / (F.width - F.left - F.right);
        const wk = Math.round(1 + Math.min(1, Math.max(0, t)) * 25);
        setWkIndex(wk - 1);
        setTouched(true);
    }, [F]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (rafRef.current) return;
        const x = e.clientX;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            snapToPointer(x);
        });
    }, [snapToPointer]);

    useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

    const onKeyDown = (e: React.KeyboardEvent) => {
        let next: number | null = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(25, wkIndex + 1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, wkIndex - 1);
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = 25;
        if (next !== null) {
            e.preventDefault();
            setWkIndex(next);
            setTouched(true);
        }
    };

    return (
        <section className={styles.hero} aria-label="Peak Fettle — a training ledger">
            <EchoField />

            {/* ---- Top band: the cover type ---- */}
            <div className={`container ${styles.copy}`}>
                <p className={styles.overline}>
                    Peak Fettle — a training ledger · strength, measured honestly
                </p>
                <h1 className={styles.headline}>
                    <span className={styles.line1}>Train at peak.</span>
                    <span className={styles.line2}>
                        <em className={styles.measured}>Measured.</em>
                        <span className={styles.baseline} aria-hidden="true">
                            <i className={styles.baselineRule} />
                            <b className={styles.baselineLabel}>107.5 kg — wk 26</b>
                        </span>
                    </span>
                </h1>
                <p className={styles.deck}>
                    Every set you log becomes an estimated 1RM, a 0–1000 strength score, and an
                    honest percentile against people actually like you. Log long enough and the
                    ledger fills with people you used to be — all of them weaker than you.
                </p>
                <div className={styles.actions}>
                    <WaitlistForm variant="inline" />
                    <Link href="#method" className={`btn btn-ghost ${styles.method}`}>
                        Read the method ↓
                    </Link>
                </div>
                <p className={styles.meta}>iOS · Android · pre-launch — free to start</p>
            </div>

            {/* ---- Bottom band: the instrument ---- */}
            <div className={styles.chartWrap}>
                <div className={`container ${styles.readoutRow}`}>
                    <output className={styles.readout} aria-hidden="true">
                        {readout(week)}
                    </output>
                    <span className={styles.readoutHint}>
                        {touched ? ' ' : 'drag or use arrow keys'}
                    </span>
                </div>

                <div
                    ref={plotRef}
                    className={styles.plot}
                    role="slider"
                    tabIndex={0}
                    aria-label="Scrub through A.R.'s 26 weeks of bench press progress"
                    aria-valuemin={1}
                    aria-valuemax={26}
                    aria-valuenow={week.wk}
                    aria-valuetext={`Week ${week.wk}: estimated 1RM ${week.e1rm.toFixed(1)} kilograms, strength score ${week.score}`}
                    onPointerMove={onPointerMove}
                    onPointerDown={(e) => snapToPointer(e.clientX)}
                    onKeyDown={onKeyDown}
                >
                    {/* geometry layer — stretches; strokes stay 1:1 via non-scaling-stroke */}
                    <svg
                        className={styles.svg}
                        viewBox={`0 0 ${F.width} ${F.height}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                    >
                        <defs>
                            <linearGradient id="climb-fill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0E5C55" stopOpacity="0.45" />
                                <stop offset="100%" stopColor="#0E5C55" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {F.yTicks.map((v) => (
                            <line
                                key={v}
                                className={styles.gridline}
                                x1={F.left} x2={F.width - F.right}
                                y1={F.yPx(v)} y2={F.yPx(v)}
                                vectorEffect="non-scaling-stroke"
                            />
                        ))}
                        <path className={styles.area} d={F.area} />
                        <path
                            className={styles.lineDraw}
                            d={F.line}
                            pathLength={1}
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>

                    {/* annotation layer — HTML, so type never stretches */}
                    {F.yTicks.map((v) => (
                        <span key={v} className={styles.yLabel} style={{ top: pct.y(v) }}>
                            {v} kg
                        </span>
                    ))}
                    {F.xTicks.map((wk) => (
                        <span key={wk} className={styles.xLabel} style={{ left: pct.x(wk) }}>
                            wk {String(wk).padStart(2, '0')}
                        </span>
                    ))}

                    {/* landmark dots */}
                    {F.dotWeeks.map((wk) => {
                        const p = STORY[wk - 1];
                        const isPr = wk === LANDMARKS.pr.wk;
                        return (
                            <span
                                key={wk}
                                className={`${styles.dot} ${isPr ? styles.dotPr : ''}`}
                                style={{ left: pct.x(wk), top: pct.y(p.e1rm) }}
                            />
                        );
                    })}

                    {/* editorial annotations */}
                    <span className={`${styles.note} ${styles.noteStart}`} style={{ left: pct.x(1), top: pct.y(84) }}>
                        wk 01 — return to the bar · e1RM 84.0 kg
                    </span>
                    <span className={`${styles.note} ${styles.notePlateau}`} style={{ left: pct.x(11), top: pct.y(97) }}>
                        wks 09–13 — the plateau. nobody posts this part.
                    </span>
                    <span className={`${styles.note} ${styles.noteDeload}`} style={{ left: pct.x(14), top: pct.y(92) }}>
                        wk 14 — deload, on purpose
                    </span>
                    <span className={`${styles.note} ${styles.notePr}`} style={{ left: pct.x(19), top: pct.y(104) }}>
                        wk 19 — 104.0 kg. first time past 100.
                    </span>
                    <span className={`${styles.note} ${styles.noteEnd}`} style={{ left: pct.x(26), top: pct.y(107.5) }}>
                        wk 26 — e1RM 107.5 kg<br />score 612 → 678
                    </span>

                    {/* crosshair */}
                    <span
                        className={styles.crosshair}
                        style={{ left: pct.x(week.wk) }}
                        aria-hidden="true"
                    >
                        <i className={styles.crosshairDot} style={{ top: pct.y(week.e1rm) }} />
                    </span>
                </div>

                <div className={`container ${styles.figRow}`}>
                    <p className={styles.figCaption}>
                        fig. 00 — estimated 1rm, bench press · one lifter, 26 weeks
                    </p>
                    <p className={styles.honesty}>
                        A.R. is a composite lifter. The math is real.
                    </p>
                </div>
            </div>

            <div className={styles.scrollHint} aria-hidden="true">
                <span>scroll — wk 01 begins</span>
                <span className={styles.scrollLine} />
            </div>
        </section>
    );
}
