import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Peak Fettle — Train like the data is watching.',
    description:
        'Peak Fettle turns every set, every mile, and every gym visit into a measurable climb. ' +
        'Track your progress, see where you rank, and follow plans built for the way you actually train.',
    keywords: ['fitness tracker', 'strength training', 'workout app', 'personal record', 'percentile ranking'],
    openGraph: {
        title:       'Peak Fettle',
        description: 'Train. Measure. Climb.',
        type:        'website',
        url:         'https://peakfettle.com',
    },
    twitter: {
        card:        'summary_large_image',
        title:       'Peak Fettle',
        description: 'Train. Measure. Climb.',
    },
};

// Z-04 (2026-05-11): themeColor and viewport must be exported separately in
// Next.js 14+. Embedding them in `metadata` is deprecated and emits build
// warnings on every `next build`. Moved to the dedicated `viewport` export.
export const viewport: Viewport = {
    themeColor: '#06080F',
    width: 'device-width',
    initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
