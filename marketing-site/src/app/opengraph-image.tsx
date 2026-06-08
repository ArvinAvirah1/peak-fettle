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
                    <svg width="56" height="56" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                        <rect x="6" y="20" width="4.5" height="6" rx="1.4" fill="#2DD4BF" opacity="0.5" />
                        <rect x="13" y="15" width="4.5" height="11" rx="1.4" fill="#2DD4BF" opacity="0.75" />
                        <path d="M24 6 L29 16 L25.5 16 L24 12.6 L22.5 16 L19 16 Z" fill="#5EEAD4" />
                        <rect x="20" y="19" width="4.5" height="7" rx="1.4" fill="#2DD4BF" />
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
