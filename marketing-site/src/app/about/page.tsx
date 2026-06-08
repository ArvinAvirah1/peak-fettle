import type { Metadata } from 'next';
import Link from 'next/link';
import PageHero from '@/components/PageHero';
import Reveal from '@/components/Reveal';
import Icon, { type IconName } from '@/components/Icon';
import JsonLd from '@/components/JsonLd';
import { SITE } from '@/lib/site';
import styles from './about.module.css';

export const metadata: Metadata = {
    title: 'About — Our Honest Training Approach',
    description:
        'Peak Fettle is built on one belief: consistency is the most critical factor in fitness ' +
        "progress. Honest metrics, fair comparisons, and plans you'll actually keep.",
    alternates: { canonical: '/about' },
    openGraph: {
        title: 'About · Peak Fettle',
        description: 'Built on the belief that consistency beats intensity. Honest metrics, fair comparisons.',
        url: `${SITE.url}/about`,
    },
};

const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url },
        { '@type': 'ListItem', position: 2, name: 'About', item: `${SITE.url}/about` },
    ],
};

const VALUES: { icon: IconName; title: string; body: string }[] = [
    { icon: 'streak', title: 'Consistency over intensity', body: 'The session you keep beats the session you skip. We design every feature to make showing up easy and shame-free.' },
    { icon: 'percentile', title: 'Honest by default', body: 'Cohort-matched percentiles and an asymptotic score that tells the truth — encouraging early, realistic for the long haul.' },
    { icon: 'adjust', title: 'Your plan, your call', body: 'AI suggests; you decide. Swap exercises, shift days, change goals. Enjoyable plans are the ones people actually follow.' },
    { icon: 'lock', title: 'Your data is yours', body: 'No ads. No selling your training history. Clear about what we store and why — and easy to take with you.' },
];

export default function AboutPage() {
    return (
        <>
            <JsonLd data={breadcrumb} />
            <PageHero
                eyebrow="About"
                title={<>Built for the <span className="gradient-text">long climb.</span></>}
                lede="Peak Fettle started from a simple, stubborn belief about fitness — and a frustration with apps that flatter, shame, or overwhelm."
            />

            <section className={`${styles.story} section-tight`}>
                <div className={`container ${styles.storyInner}`}>
                    <Reveal>
                        <p className={styles.lead}>
                            Most people don&apos;t quit training because a program was wrong. They quit because
                            it was unsustainable — too aggressive, too rigid, or too discouraging.
                        </p>
                        <p>
                            Peak Fettle is built around the most reliable finding in fitness: <strong>consistency
                            is the most critical factor in progress.</strong> So we measure it, protect it, and
                            reward it. A five-minute visit still counts. A missed day has a make-up window. A
                            beginner is never ranked against a ten-year veteran.
                        </p>
                        <p>
                            We serve every discipline — weightlifting, running, cycling, swimming, team sports —
                            with tools that are both deeply personal and quietly competitive. A 0–1000 strength
                            score and an estimated 1RM for lifters. Splits, pace, and consistency for cardio.
                            And, for those who want it, an AI coach that writes a plan around your real life and
                            adapts it to the performance you actually log.
                        </p>
                        <p>
                            No vanity metrics. No dark patterns. Just an honest picture of where you are, where
                            you rank among people like you, and a sustainable way to climb.
                        </p>
                    </Reveal>
                </div>
            </section>

            <section className={`${styles.values} section`}>
                <div className="container">
                    <Reveal className={styles.valuesHead}>
                        <p className="eyebrow">What we stand for</p>
                        <h2 className="h2">Four principles, no compromises.</h2>
                    </Reveal>
                    <div className={styles.valueGrid}>
                        {VALUES.map((v, i) => (
                            <Reveal key={v.title} delay={((i % 4) + 1) as 1 | 2 | 3 | 4} className={`card ${styles.value}`}>
                                <span className={styles.valueIcon}><Icon name={v.icon} /></span>
                                <h3 className={styles.valueTitle}>{v.title}</h3>
                                <p className={styles.valueBody}>{v.body}</p>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            <section className={`${styles.cta} section`}>
                <div className="container">
                    <Reveal className={`card ${styles.ctaCard}`}>
                        <h2 className="h2">Find out where you stand.</h2>
                        <p className="lede">Start free. Log one set. See the climb begin.</p>
                        <Link href="/#download" className="btn btn-primary">Get the app</Link>
                    </Reveal>
                </div>
            </section>
        </>
    );
}
