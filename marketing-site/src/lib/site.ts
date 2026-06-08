// Central site configuration — single source of truth for URLs, nav, and copy.
// Anything environment-specific (canonical URL, store links) reads from
// NEXT_PUBLIC_* env vars with safe defaults so the site builds and previews
// before the founder has provided real values.

export const SITE = {
    name: 'Peak Fettle',
    // Canonical origin. Swap by setting NEXT_PUBLIC_SITE_URL in Vercel.
    url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://peakfettle.com').replace(/\/$/, ''),
    tagline: 'Train at peak. Measured.',
    // Long-form, used for hero copy and OpenGraph (length there is fine).
    description:
        'Peak Fettle turns every set, every mile, and every gym visit into measurable progress. ' +
        'Log your training, see where you honestly rank against athletes at your level, and follow ' +
        'AI-built plans designed for the way you actually train.',
    // Tight, keyword-led, ~155 chars — used for the meta description (SEO).
    metaDescription:
        'Peak Fettle is a workout tracker that turns every set into an estimated 1RM, a 0–1000 strength ' +
        'score, and an honest percentile against athletes at your level.',
    email: 'hello@peakfettle.com',
    twitter: '@peakfettle',
    // App store links. Empty string = not provided yet → CTAs fall back to the
    // "get notified" capture. Fill these in to flip the site to live-download.
    ios: process.env.NEXT_PUBLIC_IOS_URL || '',
    android: process.env.NEXT_PUBLIC_ANDROID_URL || '',
} as const;

/** Primary navigation — shared by the desktop bar, mobile menu, and footer. */
export const NAV_LINKS = [
    { href: '/features', label: 'Features' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/about', label: 'About' },
] as const;

export const FOOTER_LINKS = {
    Product: [
        { href: '/features', label: 'Features' },
        { href: '/pricing', label: 'Pricing' },
        { href: '/#notify', label: 'Get notified' },
    ],
    Company: [
        { href: '/about', label: 'About' },
        { href: `mailto:${SITE.email}`, label: 'Contact' },
    ],
    Legal: [
        { href: '/privacy', label: 'Privacy' },
        { href: '/terms', label: 'Terms' },
    ],
} as const;

/** True once at least one real store link exists. Drives "live" vs "notify" CTAs. */
export const APP_IS_LIVE = Boolean(SITE.ios || SITE.android);

/**
 * Asset-readiness flags. While false, components render the on-brand SVG
 * stand-ins and do NOT request the (non-existent) files — so there are no 404s.
 * Flip a flag to true once the real files are dropped into /public.
 */
export const ASSETS = {
    // Set true after exporting real screenshots to /public/screens/*.png
    screens: false,
    // Set true to use the two-image hero crossfade (hero-start.jpg + hero-end.jpg)
    // INSTEAD of a hero.mp4 video. Leave false when using a video.
    heroStills: false,
};
