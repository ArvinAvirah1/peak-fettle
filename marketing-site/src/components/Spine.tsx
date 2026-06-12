// The line never stops — a 1px ledger spine down the page's left margin,
// filled by scroll via a CSS scroll-driven animation. Zero JS: browsers
// without animation-timeline support (and reduced-motion users) get the
// complete static line, a designed state rather than a fallback.
// Wide desktop only; the page must carry itself without it.

import styles from './Spine.module.css';

const MARKERS = [
    { label: 'wk 01', top: '6%' },
    { label: 'wk 06', top: '24%' },
    { label: 'wk 13', top: '40%' },
    { label: 'wk 14', top: '52%' },
    { label: 'wk 19', top: '64%' },
    { label: 'wk 26', top: '86%' },
] as const;

export default function Spine() {
    return (
        <div className={styles.rail} aria-hidden="true">
            <span className={styles.track} />
            <span className={styles.fill} />
            {MARKERS.map((m) => (
                <span key={m.label} className={styles.marker} style={{ top: m.top }}>
                    {m.label}
                </span>
            ))}
        </div>
    );
}
