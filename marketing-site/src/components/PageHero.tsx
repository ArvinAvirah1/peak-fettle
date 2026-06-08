// Compact static hero for sub-pages (Features, Pricing, About). The animated
// scroll-scrub hero (ScrollHero) is reserved for the home page.

import type { ReactNode } from 'react';
import Reveal from './Reveal';
import styles from './PageHero.module.css';

export default function PageHero({
    eyebrow,
    title,
    lede,
    children,
}: {
    eyebrow: string;
    title: ReactNode;
    lede?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <header className={styles.hero}>
            <div className={styles.glow} aria-hidden="true" />
            <div className="container">
                <Reveal>
                    <p className="eyebrow">{eyebrow}</p>
                    <h1 className={`h1 ${styles.title}`}>{title}</h1>
                    {lede && <p className={`lede ${styles.lede}`}>{lede}</p>}
                    {children && <div className={styles.extra}>{children}</div>}
                </Reveal>
            </div>
        </header>
    );
}
