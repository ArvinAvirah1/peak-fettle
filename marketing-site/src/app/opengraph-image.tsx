import { ImageResponse } from 'next/og';

// Dynamic social card — no external asset needed. Used for Open Graph and,
// via the metadata fallback, Twitter/X. Replace with a richer designed image
// later by adding /public/og.png and referencing it in metadata if preferred.

export const runtime = 'edge';
export const alt = 'Peak Fettle — Train at peak. Measured.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    background: '#06080F',
                    backgroundImage:
                        'radial-gradient(900px 500px at 80% -10%, rgba(45,212,191,0.22), transparent), radial-gradient(700px 500px at 0% 110%, rgba(30,58,138,0.25), transparent)',
                    padding: 72,
                    color: '#E8F1F8',
                    fontFamily: 'sans-serif',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    {/* Exact App Store icon mark (sampled from mobile/assets/icon.png) */}
                    <svg width="56" height="56" viewBox="160 160 800 704" xmlns="http://www.w3.org/2000/svg">
                        <rect x="192" y="640" width="144" height="191" rx="40" fill="#136760" />
                        <rect x="416" y="480" width="144" height="351" rx="40" fill="#1f9c8f" />
                        <rect x="640" y="608" width="144" height="223" rx="40" fill="#2bd1bd" />
                        <polygon points="767,192 927,511 815,511 767,409 720,511 608,511" fill="#3edcc6" />
                    </svg>
                    <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>Peak Fettle</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 82, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2 }}>
                        Train at peak.
                    </div>
                    <div style={{ fontSize: 82, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2, color: '#2DD4BF' }}>
                        Measured every rep.
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, color: '#98ACC4' }}>
                    Track · Strength score · Fair percentiles · iOS &amp; Android
                </div>
            </div>
        ),
        { ...size }
    );
}
