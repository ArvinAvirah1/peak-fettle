'use client';
// Scroll-scrub cinematic hero — the "scroll stopper".
//
// It picks the best available asset, in priority order:
//   1. VIDEO  — public/hero/hero.mp4 (+ optional .webm): scrubbed frame-by-frame
//      as you scroll (the tutorial's technique).
//   2. STILLS — public/hero/hero-start.jpg + hero-end.jpg: a scroll-driven
//      CROSSFADE between the two frames. No video tool required — just the two
//      Nano Banana images (e.g. "bar on the floor" -> "lockout + data burst").
//   3. SVG    — a self-animating on-brand placeholder, so it always looks done.
//
// prefers-reduced-motion and coarse pointers skip the scrub and stay static.

import { useEffect, useRef, useState } from 'react';
import DownloadButtons from './DownloadButtons';
import { ASSETS } from '@/lib/site';
import styles from './ScrollHero.module.css';

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

export default function ScrollHero() {
    const sectionRef = useRef<HTMLElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const [hasVideo, setHasVideo] = useState(false);
    const [startLoaded, setStartLoaded] = useState(false);
    const [endLoaded, setEndLoaded] = useState(false);
    const [scrub, setScrub] = useState(true);

    const hasStills = startLoaded && endLoaded;
    const hasArt = hasVideo || hasStills; // a real asset is showing

    useEffect(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        setScrub(!reduced && !coarse);
    }, []);

    useEffect(() => {
        const section = sectionRef.current;
        const stage = stageRef.current;
        if (!section || !stage) return;

        let raf = 0;
        const update = () => {
            raf = 0;
            const rect = section.getBoundingClientRect();
            const total = section.offsetHeight - window.innerHeight;
            const progress = total > 0 ? clamp(-rect.top / total) : 0;

            // expose progress to CSS (drives parallax + the stills crossfade)
            stage.style.setProperty('--p', progress.toFixed(4));

            const v = videoRef.current;
            if (scrub && hasVideo && v && v.duration && isFinite(v.duration)) {
                const t = progress * (v.duration - 0.05);
                if (Math.abs(v.currentTime - t) > 1 / 60) {
                    try { v.currentTime = t; } catch { /* seek not ready */ }
                }
            }
        };
        const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };

        update();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [scrub, hasVideo]);

    useEffect(() => {
        const v = videoRef.current;
        if (v && hasVideo && !scrub) v.play().catch(() => { /* autoplay blocked */ });
    }, [hasVideo, scrub]);

    return (
        <section ref={sectionRef} className={styles.section} aria-label="Peak Fettle">
            <div ref={stageRef} className={styles.stage}>
                <div className={styles.media} aria-hidden="true">
                    {/* 3. Placeholder art — hidden once a real asset paints */}
                    <div className={`${styles.placeholder} ${hasArt ? styles.placeholderHidden : ''}`}>
                        <HeroArt />
                    </div>

                    {/* 2. Two-still crossfade (only when opted in via ASSETS.heroStills,
                          i.e. when using two images instead of a hero.mp4). */}
                    {ASSETS.heroStills && (
                        <div className={`${styles.stills} ${hasStills && !hasVideo ? styles.stillsShown : ''}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/hero/hero-start.jpg"
                                alt=""
                                className={styles.still}
                                onLoad={() => setStartLoaded(true)}
                                onError={() => setStartLoaded(false)}
                            />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/hero/hero-end.jpg"
                                alt=""
                                className={`${styles.still} ${styles.stillEnd}`}
                                onLoad={() => setEndLoaded(true)}
                                onError={() => setEndLoaded(false)}
                            />
                        </div>
                    )}

                    {/* 1. Real cinematic video (highest priority) */}
                    <video
                        ref={videoRef}
                        className={`${styles.video} ${hasVideo ? styles.videoShown : ''}`}
                        muted
                        playsInline
                        preload="metadata"
                        loop={!scrub}
                        onLoadedData={() => setHasVideo(true)}
                        onError={() => setHasVideo(false)}
                    >
                        <source src="/hero/hero.mp4" type="video/mp4" />
                    </video>

                    <div className={styles.vignette} />
                    <div className={styles.grid} />
                </div>

                <div className={`container ${styles.copyWrap}`}>
                    <div className={styles.copy}>
                        <p className="eyebrow">Strength, made measurable</p>
                        <h1 className={`h1 ${styles.headline}`}>
                            Train at <span className="gradient-text">peak.</span><br />
                            <span className={styles.headline2}>Measured every rep.</span>
                        </h1>
                        <p className={`lede ${styles.sub}`}>
                            Peak Fettle is the workout tracker that turns every set into data — your
                            estimated 1RM, a 0–1000 strength score, and an honest percentile against
                            athletes at <em>your</em> level. Lift, run, repeat. Watch the climb.
                        </p>
                        <div className={styles.actions}>
                            <DownloadButtons />
                        </div>
                        <p className={styles.meta}>iOS · Android · Free to start</p>
                    </div>
                </div>

                <div className={styles.scrollHint} aria-hidden="true">
                    <span>Scroll</span>
                    <span className={styles.scrollLine} />
                </div>
            </div>
        </section>
    );
}

/* On-brand placeholder: a loaded barbell whose energy resolves into data. */
function HeroArt() {
    return (
        <svg className={styles.art} viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Peak Fettle">
            <defs>
                <radialGradient id="hero-glow" cx="50%" cy="46%" r="55%">
                    <stop offset="0%" stopColor="#0E3B3A" />
                    <stop offset="60%" stopColor="#081225" />
                    <stop offset="100%" stopColor="#06080F" />
                </radialGradient>
                <linearGradient id="hero-bar" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#5EEAD4" />
                    <stop offset="1" stopColor="#14B8A6" />
                </linearGradient>
            </defs>
            <rect width="1280" height="720" fill="url(#hero-glow)" />
            <g className={styles.rings} fill="none" stroke="#2DD4BF" strokeWidth="1">
                <circle cx="640" cy="330" r="140" opacity="0.35" />
                <circle cx="640" cy="330" r="210" opacity="0.2" />
                <circle cx="640" cy="330" r="290" opacity="0.1" />
            </g>
            <g transform="translate(640 330)">
                <rect x="-300" y="-9" width="600" height="18" rx="9" fill="url(#hero-bar)" />
                {[-250, -210, -170].map((x, i) => (
                    <rect key={x} x={x - 18} y={-58 - i * 6} width="34" height={116 + i * 12} rx="8" fill="#2DD4BF" opacity={0.9 - i * 0.12} />
                ))}
                {[216, 176, 136].map((x, i) => (
                    <rect key={x} x={x - 16} y={-58 - i * 6} width="34" height={116 + i * 12} rx="8" fill="#2DD4BF" opacity={0.9 - i * 0.12} />
                ))}
            </g>
            <g className={styles.motes} fill="#5EEAD4">
                <circle cx="380" cy="220" r="3" />
                <circle cx="900" cy="250" r="2.5" />
                <circle cx="300" cy="420" r="2" />
                <circle cx="980" cy="430" r="3" />
                <circle cx="520" cy="150" r="2" />
                <circle cx="760" cy="520" r="2.5" />
            </g>
            <g fontFamily="monospace" fill="#9DE9DF" opacity="0.85">
                <text x="250" y="180" fontSize="22">E1RM 142kg</text>
                <text x="930" y="200" fontSize="20">Top 9%</text>
                <text x="300" y="560" fontSize="20">Score 781</text>
                <text x="880" y="560" fontSize="18">+12 this week</text>
            </g>
        </svg>
    );
}
