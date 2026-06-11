// Peak Fettle mark — the EXACT App Store icon artwork (founder 2026-06-10):
// three ascending teal bars + the bright notched peak. Geometry and colors
// were pixel-sampled from mobile/assets/icon.png (1024×1024), then the
// viewBox is cropped tight to the mark so it sits correctly in the nav.
// Matches mobile/src/components/BrandMark.tsx — one artwork everywhere.

export default function Logo({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="160 160 800 704"
            role="img"
            aria-label="Peak Fettle"
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* ascending bars (sampled: #136760 → #1f9c8f → #2bd1bd) */}
            <rect x="192" y="640" width="144" height="191" rx="40" fill="#136760" />
            <rect x="416" y="480" width="144" height="351" rx="40" fill="#1f9c8f" />
            <rect x="640" y="608" width="144" height="223" rx="40" fill="#2bd1bd" />
            {/* the peak — notched arrow above the last bar */}
            <polygon
                points="767,192 927,511 815,511 767,409 720,511 608,511"
                fill="#3edcc6"
            />
        </svg>
    );
}
