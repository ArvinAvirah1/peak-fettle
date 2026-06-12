'use client';
// Mouse-interactive generative hero — replaces the AI-human ScrollHero video.
//
// A full-bleed canvas renders a living constellation in the brand palette:
// particles drift on a slow field, link to near neighbours, and bend toward
// the cursor. A "summit line" — the brand's climb — is drawn through the
// field and ripples where the pointer passes. No raster/video assets at all.
//
// prefers-reduced-motion → a single static frame (no animation loop).
// Coarse pointers (touch) → the field animates gently but ignores pointer.

import { useEffect, useRef } from 'react';
import DownloadButtons from './DownloadButtons';
import styles from './InteractiveHero.module.css';

type P = { x: number; y: number; vx: number; vy: number; r: number; hue: number };

const ACCENT = { r: 45, g: 212, b: 191 };   // --accent  #2DD4BF
const ACCENT_HI = { r: 94, g: 234, b: 212 }; // --accent-hi #5EEAD4

export default function InteractiveHero() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sectionRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const section = sectionRef.current;
        if (!canvas || !section) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        let w = 0, h = 0;
        let particles: P[] = [];
        const mouse = { x: -9999, y: -9999, vx: 0, px: -9999, active: false };
        let raf = 0;
        let t = 0;

        const resize = () => {
            w = section.clientWidth;
            h = section.clientHeight;
            if (!w || !h) return; // layout not settled yet — observer will re-fire
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            seed();
        };

        const seed = () => {
            const count = Math.max(60, Math.min(150, Math.round((w * h) / 14000)));
            particles = Array.from({ length: count }, () => ({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.25,
                r: 0.8 + Math.random() * 1.8,
                hue: Math.random(),
            }));
        };

        const LINK = 120;       // neighbour link distance
        const REACH = 200;      // cursor influence radius

        const draw = () => {
            t += 0.004;
            ctx.clearRect(0, 0, w, h);

            // summit line: the brand "climb" path, rippling near the cursor
            ctx.beginPath();
            const baseY = h * 0.72;
            for (let x = 0; x <= w; x += 8) {
                const climb = (x / w) * h * 0.34;             // rises left → right
                const wave = Math.sin(x * 0.012 + t * 3) * 10;
                let ripple = 0;
                if (mouse.active) {
                    const d = Math.abs(x - mouse.x);
                    if (d < REACH) ripple = Math.cos((d / REACH) * Math.PI * 0.5) * -36;
                }
                const y = baseY - climb + wave + ripple;
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            const grad = ctx.createLinearGradient(0, 0, w, 0);
            grad.addColorStop(0, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},0.06)`);
            grad.addColorStop(0.7, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},0.35)`);
            grad.addColorStop(1, `rgba(${ACCENT_HI.r},${ACCENT_HI.g},${ACCENT_HI.b},0.8)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // particles
            for (const p of particles) {
                // slow drift field
                p.vx += Math.sin(p.y * 0.01 + t) * 0.002;
                p.vy += Math.cos(p.x * 0.01 + t) * 0.002;

                // cursor gravity — gentle pull, harder push very close
                if (mouse.active) {
                    const dx = mouse.x - p.x, dy = mouse.y - p.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < REACH * REACH && d2 > 1) {
                        const d = Math.sqrt(d2);
                        const f = d < 50 ? -0.06 : 0.012 * (1 - d / REACH);
                        p.vx += (dx / d) * f;
                        p.vy += (dy / d) * f;
                    }
                }

                p.vx *= 0.985; p.vy *= 0.985;
                p.x += p.vx; p.y += p.vy;
                if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
                if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20;
            }

            // links
            for (let i = 0; i < particles.length; i++) {
                const a = particles[i];
                for (let j = i + 1; j < particles.length; j++) {
                    const b = particles[j];
                    const dx = a.x - b.x, dy = a.y - b.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < LINK * LINK) {
                        const alpha = (1 - Math.sqrt(d2) / LINK) * 0.18;
                        ctx.strokeStyle = `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${alpha})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }

            // dots (brighter near cursor)
            for (const p of particles) {
                let glow = 0.45 + p.hue * 0.3;
                if (mouse.active) {
                    const dx = mouse.x - p.x, dy = mouse.y - p.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < REACH) glow = Math.min(1, glow + (1 - d / REACH) * 0.6);
                }
                const c = p.hue > 0.6 ? ACCENT_HI : ACCENT;
                ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${glow})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        const loop = () => { draw(); raf = requestAnimationFrame(loop); };

        const onMove = (e: PointerEvent) => {
            const rect = section.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
            mouse.active = true;
            // headline tilt
            section.style.setProperty('--mx', `${(mouse.x / w - 0.5).toFixed(3)}`);
            section.style.setProperty('--my', `${(mouse.y / h - 0.5).toFixed(3)}`);
        };
        const onLeave = () => { mouse.active = false; };

        resize();
        const ro = new ResizeObserver(() => { resize(); draw(); });
        ro.observe(section);
        draw(); // paint immediately — don't wait for the first rAF tick

        if (!reduced) {
            if (!coarse) {
                section.addEventListener('pointermove', onMove);
                section.addEventListener('pointerleave', onLeave);
            }
            raf = requestAnimationFrame(loop);
        }

        return () => {
            ro.disconnect();
            section.removeEventListener('pointermove', onMove);
            section.removeEventListener('pointerleave', onLeave);
            if (raf) cancelAnimationFrame(raf);
        };
    }, []);

    return (
        <section ref={sectionRef} className={styles.section} aria-label="Peak Fettle">
            <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
            <div className={styles.vignette} aria-hidden="true" />

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
        </section>
    );
}
