'use client';
// Lightweight scroll-reveal. Adds `.is-in` when the element enters the viewport,
// driving the .reveal transition defined in globals.css. No animation library.
// Respects prefers-reduced-motion (globals.css forces .reveal visible there).

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

type RevealProps = {
    children: ReactNode;
    /** stagger step 1–5 maps to .reveal-N delay classes */
    delay?: 1 | 2 | 3 | 4 | 5;
    as?: ElementType;
    className?: string;
    /** re-trigger every time it scrolls into view (default: once) */
    repeat?: boolean;
};

export default function Reveal({
    children,
    delay,
    as: Tag = 'div',
    className = '',
    repeat = false,
}: RevealProps) {
    const ref = useRef<HTMLElement>(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === 'undefined') {
            setShown(true);
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setShown(true);
                        if (!repeat) io.unobserve(entry.target);
                    } else if (repeat) {
                        setShown(false);
                    }
                }
            },
            { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [repeat]);

    const cls = [
        'reveal',
        delay ? `reveal-${delay}` : '',
        shown ? 'is-in' : '',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <Tag ref={ref} className={cls}>
            {children}
        </Tag>
    );
}
