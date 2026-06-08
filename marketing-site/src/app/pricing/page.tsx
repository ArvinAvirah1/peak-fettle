import type { Metadata } from 'next';
import Link from 'next/link';
import PageHero from '@/components/PageHero';
import Reveal from '@/components/Reveal';
import Icon from '@/components/Icon';
import JsonLd from '@/components/JsonLd';
import { PLANS } from '@/lib/content';
import { SITE } from '@/lib/site';
import styles from './pricing.module.css';

export const metadata: Metadata = {
    title: 'Pricing — Free & Pro Plans',
    description:
        'Peak Fettle is free forever for full tracking and percentile rankings. Upgrade to Pro for ' +
        'AI-generated, adaptive training plans. No ads, ever.',
    alternates: { canonical: '/pricing' },
    openGraph: {
        title: 'Pricing · Peak Fettle',
        description: 'Free forever for tracking + percentiles. Pro unlocks adaptive AI plans.',
        url: `${SITE.url}/pricing`,
    },
};

const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url },
        { '@type': 'ListItem', position: 2, name: 'Pricing', item: `${SITE.url}/pricing` },
    ],
};

const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Peak Fettle Pro',
    description: 'AI-generated, adaptive training plans for the Peak Fettle app.',
    brand: { '@type': 'Brand', name: SITE.name },
    offers: {
        '@type': 'Offer',
        price: '6.99',
        priceCurrency: 'GBP',
        availability: 'https://schema.org/InStock',
        url: `${SITE.url}/pricing`,
    },
};

export default function PricingPage() {
    return (
        <>
            <JsonLd data={[breadcrumb, productSchema]} />
            <PageHero
                eyebrow="Pricing"
                title={<>Free to start. <span className="gradient-text">Honest to scale.</span></>}
                lede="The free tier already beats most paid apps. Pro adds a coach that re-plans around your real performance. No ads on either."
            />

            <section className={`${styles.plans} section-tight`}>
                <div className="container">
                    <div className={styles.grid}>
                        {PLANS.map((p, i) => (
                            <Reveal key={p.name} delay={((i % 2) + 1) as 1 | 2} className={`card ${styles.plan} ${p.featured ? styles.featured : ''}`}>
                                <h2 className={styles.name}>{p.name}</h2>
                                <p className={styles.price}>{p.price} <span>/ {p.cadence}</span></p>
                                <p className={styles.tagline}>{p.tagline}</p>
                                <Link href="/#download" className={`btn ${p.featured ? 'btn-primary' : 'btn-ghost'} ${styles.cta}`}>
                                    {p.cta}
                                </Link>
                                <ul className={styles.features} role="list">
                                    {p.features.map((f) => (
                                        <li key={f}><Icon name="check" size={18} /> {f}</li>
                                    ))}
                                </ul>
                            </Reveal>
                        ))}
                    </div>
                    <p className={styles.note}>
                        Prices shown in GBP and may vary by region and store. Cancel anytime — your logged
                        history and free features stay with you.
                    </p>
                </div>
            </section>

            <section className={`${styles.faq} section`}>
                <div className="container">
                    <Reveal>
                        <h2 className={`h2 ${styles.faqTitle}`}>What you get, plainly</h2>
                    </Reveal>
                    <div className={styles.faqGrid}>
                        <Reveal as="div" delay={1} className={`card ${styles.faqCard}`}>
                            <h3>Why is so much free?</h3>
                            <p>Tracking and honest percentiles are the heart of Peak Fettle. We&apos;d rather you
                            build the habit first. Pro exists for people who want a plan written and adjusted for them.</p>
                        </Reveal>
                        <Reveal as="div" delay={2} className={`card ${styles.faqCard}`}>
                            <h3>What does Pro adapt to?</h3>
                            <p>Your logged sets, missed sessions, and goals. Hit your numbers and it progresses load;
                            stall and it backs off. Change a goal and it re-plans — you keep the final say.</p>
                        </Reveal>
                        <Reveal as="div" delay={3} className={`card ${styles.faqCard}`}>
                            <h3>Any ads or data selling?</h3>
                            <p>No ads, ever. We don&apos;t sell your training data. See the <Link href="/privacy" className={styles.inlineLink}>Privacy Policy</Link> for exactly what we store and why.</p>
                        </Reveal>
                    </div>
                </div>
            </section>
        </>
    );
}
