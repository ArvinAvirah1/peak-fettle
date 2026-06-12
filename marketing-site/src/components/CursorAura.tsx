'use client';
// Site-wide cursor aura — a soft teal light that follows the pointer so the
// whole page feels alive, not just the hero. Fine pointers only; respects
// prefers-reduced-motion; pure transform updates (no layout work).

import { useEffect, useRef } from 'react';

export default function CursorAura() {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const fine = window.matchMedia('(pointer: fine)').matches;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!fine || reduced) return;

        let x = -9999, y = -9999, cx = x, cy = y;
        let raf = 0;
        const onMove = (e: PointerEvent) => {
            x = e.clientX; y = e.clientY;
            el.style.opacity = '1';
            if (!raf) raf = requestAnimationFrame(tick);
        };
        const tick = () => {
            // ease toward the pointer for a trailing-light feel
            cx += (x - cx) * 0.12;
            cy += (y - cy) * 0.12;
            el.style.transform = `translate(${cx - 300}px, ${cy - 300}px)`;
            raf = Math.abs(x - cx) + Math.abs(y - cy) > 0.5 ? requestAnimationFrame(tick) : 0;
        };
        const onLeave = () => { el.style.opacity = '0'; };

        window.addEventListener('pointermove', onMove, { passive: true });
        document.documentElement.addEventListener('pointerleave', onLeave);
        return () => {
            window.removeEventListener('pointermove', onMove);
            document.documentElement.removeEventListener('pointerleave', onLeave);
            if (raf) cancelAnimationFrame(raf);
        };
    }, []);

    return (
        <div
            ref={ref}
            aria-hidden="true"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: 600,
                height: 600,
                borderRadius: '50%',
                pointerEvents: 'none',
                zIndex: 1,
                opacity: 0,
                transition: 'opacity .4s ease',
                background:
                    'radial-gradient(circle, rgba(45,212,191,.07) 0%, rgba(45,212,191,.03) 35%, transparent 70%)',
                willChange: 'transform',
            }}
        />
    );
}
