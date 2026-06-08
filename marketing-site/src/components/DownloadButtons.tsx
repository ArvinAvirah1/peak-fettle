// App Store + Google Play buttons. Links come from NEXT_PUBLIC_IOS_URL /
// NEXT_PUBLIC_ANDROID_URL (see lib/site.ts). Until those are set, the buttons
// point at the on-page "get notified" capture (#notify) so nothing dead-ends.
//
// NOTE: these are clean, on-brand store buttons — before public launch, swap in
// the official Apple "Download on the App Store" and Google "Get it on Google
// Play" badge artwork (brand-guideline requirement for store linking).

import { SITE } from '@/lib/site';
import styles from './DownloadButtons.module.css';

function AppleGlyph() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.glyph}>
            <path fill="currentColor" d="M16.36 12.6c-.02-2.3 1.88-3.4 1.96-3.45-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.75 2.28-1.6 2.78-.41 6.89 1.15 9.15.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.43-3.65zM14.13 5.5c.64-.78 1.07-1.85.95-2.93-.92.04-2.03.61-2.69 1.38-.59.68-1.11 1.78-.97 2.83 1.02.08 2.07-.52 2.71-1.28z" />
        </svg>
    );
}

function PlayGlyph() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.glyph}>
            <path fill="#34D399" d="M3.6 2.4 13.2 12 3.6 21.6c-.34-.18-.6-.55-.6-1.06V3.46c0-.51.26-.88.6-1.06z" />
            <path fill="#5EEAD4" d="M16.8 8.6 13.2 12l3.6 3.4 3.7-2.1c.7-.4.7-1.4 0-1.8l-3.7-2.1z" />
            <path fill="#2DD4BF" d="M3.6 2.4c.3-.16.68-.18 1.05.03l11.15 6.17L13.2 12 3.6 2.4z" />
            <path fill="#14B8A6" d="M13.2 12 4.65 21.57c-.37.2-.75.19-1.05.03L13.2 12z" />
        </svg>
    );
}

type Props = { align?: 'start' | 'center'; className?: string };

export default function DownloadButtons({ align = 'start', className = '' }: Props) {
    const iosHref = SITE.ios || '/#notify';
    const androidHref = SITE.android || '/#notify';
    const ext = (href: string) => href.startsWith('http');

    return (
        <div className={`${styles.row} ${align === 'center' ? styles.center : ''} ${className}`}>
            <a
                href={iosHref}
                className={styles.store}
                {...(ext(iosHref) ? { target: '_blank', rel: 'noopener' } : {})}
                aria-label="Download on the App Store"
            >
                <AppleGlyph />
                <span className={styles.txt}>
                    <small>Download on the</small>{' '}
                    <strong>App Store</strong>
                </span>
            </a>
            <a
                href={androidHref}
                className={styles.store}
                {...(ext(androidHref) ? { target: '_blank', rel: 'noopener' } : {})}
                aria-label="Get it on Google Play"
            >
                <PlayGlyph />
                <span className={styles.txt}>
                    <small>Get it on</small>{' '}
                    <strong>Google Play</strong>
                </span>
            </a>
        </div>
    );
}
