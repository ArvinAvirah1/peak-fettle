import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';
import { SITE } from '@/lib/site';

const display = Space_Grotesk({
    subsets: ['latin'],
    weight: ['500', '600', '700'],
    variable: '--font-display',
    display: 'swap',
});

const body = Inter({
    subsets: ['latin'],
    variable: '--font-body',
    display: 'swap',
});

export const metadata: Metadata = {
    metadataBase: new URL(SITE.url),
    title: {
        default: 'Peak Fettle — Workout Tracker & Strength Percentiles',
        template: `%s · ${SITE.name}`,
    },
    description: SITE.metaDescription,
    applicationName: SITE.name,
    keywords: [
        'workout tracker app', 'strength score', 'strength standards', '1RM calculator',
        'percentile ranking', 'gym log app', 'lifting and running tracker', 'AI workout plan',
        'DOTS Wilks calculator', 'habit streak tracker', 'one rep max estimator',
    ],
    authors: [{ name: SITE.name }],
    creator: SITE.name,
    alternates: { canonical: '/' },
    openGraph: {
        type: 'website',
        siteName: SITE.name,
        title: `${SITE.name} — ${SITE.tagline}`,
        description: SITE.description,
        url: SITE.url,
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: `${SITE.name} — ${SITE.tagline}`,
        description: SITE.description,
        site: SITE.twitter,
        creator: SITE.twitter,
    },
    robots: {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
    category: 'health',
};

export const viewport: Viewport = {
    themeColor: '#06080F',
    colorScheme: 'dark',
    width: 'device-width',
    initialScale: 1,
};

// Organization + WebSite structured data — present on every page.
const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/icon.svg`,
    image: `${SITE.url}/opengraph-image`,
    description: SITE.metaDescription,
    slogan: SITE.tagline,
    email: SITE.email,
    contactPoint: {
        '@type': 'ContactPoint',
        email: SITE.email,
        contactType: 'customer support',
        availableLanguage: 'English',
    },
    sameAs: [`https://twitter.com/${SITE.twitter.replace('@', '')}`],
};

const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${display.variable} ${body.variable}`}>
            <body>
                <a href="#main" className="skip-link">Skip to content</a>
                <JsonLd data={[orgSchema, websiteSchema]} />
                <Nav />
                <main id="main">{children}</main>
                <Footer />
            </body>
        </html>
    );
}
