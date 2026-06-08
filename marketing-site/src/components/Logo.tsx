// Peak Fettle mark — an upward "peak" built from ascending bars (progress /
// a loaded plate stack climbing), not a mountain. Pure SVG, scales cleanly.

export default function Logo({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 32 32"
            role="img"
            aria-label="Peak Fettle"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient id="pf-peak" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#14B8A6" />
                    <stop offset="0.55" stopColor="#2DD4BF" />
                    <stop offset="1" stopColor="#5EEAD4" />
                </linearGradient>
            </defs>
            {/* ascending bars climbing to a peak */}
            <rect x="3" y="22" width="5" height="7" rx="1.5" fill="url(#pf-peak)" opacity="0.45" />
            <rect x="10.5" y="16" width="5" height="13" rx="1.5" fill="url(#pf-peak)" opacity="0.7" />
            {/* the apex — a sharp peak chevron */}
            <path
                d="M24 3.5 L31 16.5 L26.5 16.5 L24 11.8 L21.5 16.5 L17 16.5 Z"
                fill="url(#pf-peak)"
            />
            <rect x="18" y="20" width="5" height="9" rx="1.5" fill="url(#pf-peak)" />
            <rect x="25.5" y="18" width="3.5" height="11" rx="1.5" fill="url(#pf-peak)" opacity="0.85" />
        </svg>
    );
}
