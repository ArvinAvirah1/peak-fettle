'use client';
// The echoes — the hero's living layer. Your cursor leads a chain of past
// selves: three fading ghosts repeat your path at increasing delay, labeled
// wk 0 → wk 2, with "you — now" at the head. Log long enough and the chart
// fills with people you used to be; this is that idea, behind the title.
//
// Mounted as the first child of the hero <section>; listens on the parent so
// the whole hero drives it. Play is clamped to the top band so the echoes
// never tangle with the cover chart's annotations. Fine pointers follow the
// cursor; touch devices get the gentle idle drift; reduced motion gets a
// designed frozen state. All per-frame work is direct attribute mutation —
// no React state, no layout reads.

import { useEffect, useRef } from 'react';
import styles from './EchoField.module.css';

// oldest ghost = wk 0 (the start), counting up toward you
const GHOSTS = [
    { ago: 4200, opacity: 0.16, label: 'wk 0' },
    { ago: 2800, opacity: 0.30, label: 'wk 1' },
    { ago: 1400, opacity: 0.50, label: 'wk 2' },
] as const;

// frozen composition for prefers-reduced-motion (fractions of layer size)
const FROZEN = [
    { x: 0.40, y: 0.78 },
    { x: 0.50, y: 0.66 },
    { x: 0.58, y: 0.54 },
] as const;
const FROZEN_LEAD = { x: 0.66, y: 0.44 } as const;

export default function EchoField() {
    const layerRef = useRef<HTMLDivElement>(null);
    const trailRef = useRef<SVGPathElement>(null);
    const leadRef = useRef<SVGCircleElement>(null);
    const leadLblRef = useRef<SVGTextElement>(null);
    const ghostRefs = useRef<(SVGCircleElement | null)[]>([]);
    const ghostLblRefs = useRef<(SVGTextElement | null)[]>([]);

    useEffect(() => {
        const layer = layerRef.current;
        const section = layer?.parentElement;
        const trail = trailRef.current;
        const lead = leadRef.current;
        const leadLbl = leadLblRef.current;
        if (!layer || !section || !trail || !lead || !leadLbl) return;

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const fine = window.matchMedia('(pointer: fine)').matches;

        let W = 0, H = 0, clampY = 0;
        const measure = () => {
            W = layer.clientWidth;
            H = layer.clientHeight;
            clampY = H * 0.56; // keep the play above the cover chart
        };
        measure();

        const place = (el: SVGCircleElement, lbl: SVGTextElement, x: number, y: number) => {
            el.setAttribute('cx', x.toFixed(1));
            el.setAttribute('cy', y.toFixed(1));
            lbl.setAttribute('x', Math.min(x + 12, W - 96).toFixed(0));
            lbl.setAttribute('y', (y + 20).toFixed(0));
        };

        if (reduced) {
            // the frozen print: the chain laid out as a designed still
            const ro = new ResizeObserver(() => {
                measure();
                GHOSTS.forEach((_, i) => {
                    const dot = ghostRefs.current[i];
                    const lbl = ghostLblRefs.current[i];
                    if (dot && lbl) place(dot, lbl, FROZEN[i].x * W, FROZEN[i].y * clampY);
                });
                place(lead, leadLbl, FROZEN_LEAD.x * W, FROZEN_LEAD.y * clampY);
                leadLbl.setAttribute('y', (FROZEN_LEAD.y * clampY - 14).toFixed(0));
            });
            ro.observe(layer);
            return () => ro.disconnect();
        }

        let mx = W * 0.64, my = clampY * 0.5, tx = mx, ty = my;
        let hover = false;
        let t = 2.3;
        const pts: { x: number; y: number; t: number }[] = [];
        let raf = 0;
        let running = false;

        const onMove = (e: PointerEvent) => {
            const r = layer.getBoundingClientRect();
            tx = e.clientX - r.left;
            ty = Math.min(clampY, e.clientY - r.top);
            hover = true;
        };
        const onLeave = () => { hover = false; };

        const frame = () => {
            t += 0.006;
            if (!hover) {
                // idle drift keeps the hero alive, biased to the open right side
                tx = W * (0.62 + 0.25 * Math.sin(t * 0.8));
                ty = clampY * (0.55 + 0.38 * Math.sin(t * 1.5 + 1.2) + 0.07 * Math.sin(t * 3.1));
            }
            mx += (tx - mx) * 0.1;
            my += (ty - my) * 0.1;

            const now = performance.now();
            pts.push({ x: mx, y: my, t: now });
            while (pts.length && now - pts[0].t > 5200) pts.shift();

            place(lead, leadLbl, mx, my);
            leadLbl.setAttribute('y', (my - 12).toFixed(0));

            for (let i = 0; i < GHOSTS.length; i++) {
                const dot = ghostRefs.current[i];
                const lbl = ghostLblRefs.current[i];
                if (!dot || !lbl) continue;
                const target = now - GHOSTS[i].ago;
                let g = pts[0];
                for (const q of pts) { if (q.t <= target) g = q; else break; }
                if (g) place(dot, lbl, g.x, g.y);
            }

            // short live trail behind the lead
            let d = '';
            for (const q of pts) {
                if (now - q.t <= 1000) d += (d ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1);
            }
            trail.setAttribute('d', d || 'M-9 -9');

            raf = requestAnimationFrame(frame);
        };

        const start = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
        const stop = () => { if (running) { running = false; cancelAnimationFrame(raf); } };

        const ro = new ResizeObserver(measure);
        ro.observe(layer);
        const io = new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop()));
        io.observe(section);
        const onVis = () => (document.hidden ? stop() : start());
        document.addEventListener('visibilitychange', onVis);

        if (fine) {
            section.addEventListener('pointermove', onMove);
            section.addEventListener('pointerleave', onLeave);
        }

        return () => {
            stop();
            ro.disconnect();
            io.disconnect();
            document.removeEventListener('visibilitychange', onVis);
            section.removeEventListener('pointermove', onMove);
            section.removeEventListener('pointerleave', onLeave);
        };
    }, []);

    return (
        <div ref={layerRef} className={styles.layer} aria-hidden="true">
            <svg className={styles.svg}>
                <path ref={trailRef} className={styles.trail} d="M-9 -9" />
                {GHOSTS.map((g, i) => (
                    <g key={g.label} opacity={g.opacity}>
                        <circle
                            ref={(el) => { ghostRefs.current[i] = el; }}
                            className={styles.ghost}
                            cx={-20} cy={-20} r={4}
                        />
                        <text
                            ref={(el) => { ghostLblRefs.current[i] = el; }}
                            className={styles.label}
                            x={-20} y={-20}
                        >
                            {g.label}
                        </text>
                    </g>
                ))}
                <circle ref={leadRef} className={styles.lead} cx={-20} cy={-20} r={4.5} />
                <text ref={leadLblRef} className={styles.leadLabel} x={-20} y={-20}>
                    you — now
                </text>
            </svg>
        </div>
    );
}
