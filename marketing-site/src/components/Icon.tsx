// Minimal line-icon set (stroke = currentColor). Keeps the brand crisp and
// avoids generic emoji. 24×24 viewBox, 1.6 stroke.

export type IconName =
    | 'barbell' | 'percentile' | 'ai' | 'streak' | 'score' | 'cardio'
    | 'shield' | 'check' | 'arrow' | 'spark' | 'adjust' | 'lock';

const paths: Record<IconName, React.ReactNode> = {
    barbell: (
        <>
            <path d="M4 9v6M7 7v10M17 7v10M20 9v6" />
            <path d="M7 12h10" />
        </>
    ),
    percentile: (
        <>
            <path d="M4 20V10M9 20V6M14 20v-8M19 20V4" />
        </>
    ),
    ai: (
        <>
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            <rect x="7" y="7" width="10" height="10" rx="3" />
            <path d="M10 11h4M10 14h2" />
        </>
    ),
    streak: (
        <>
            <path d="M12 3c3 3 4 5.5 4 8a4 4 0 1 1-8 0c0-1 .3-2 1-3 .2 1 1 1.6 1.6 1.6C12 9 11 6 12 3Z" />
        </>
    ),
    score: (
        <>
            <path d="M5 18a8 8 0 1 1 14 0" />
            <path d="M12 14l4-4" />
            <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
        </>
    ),
    cardio: (
        <>
            <path d="M3 12h4l2 5 4-10 2 5h6" />
        </>
    ),
    shield: (
        <>
            <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
            <path d="M9 12l2 2 4-4" />
        </>
    ),
    check: <path d="M5 12l4 4 10-10" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    spark: <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />,
    adjust: (
        <>
            <path d="M4 8h11M4 16h7" />
            <circle cx="18" cy="8" r="2" />
            <circle cx="14" cy="16" r="2" />
        </>
    ),
    lock: (
        <>
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
    ),
};

export default function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {paths[name]}
        </svg>
    );
}
