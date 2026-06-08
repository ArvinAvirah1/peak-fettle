import type { Metadata } from 'next';
import Link from 'next/link';
import PageHero from '@/components/PageHero';
import Reveal from '@/components/Reveal';
import DeviceMockup from '@/components/DeviceMockup';
import Icon, { type IconName } from '@/components/Icon';
import JsonLd from '@/components/JsonLd';
import { ScreenLog, ScreenScore, ScreenRank, ScreenStreak } from '@/components/AppScreens';
import { SITE, ASSETS } from '@/lib/site';
import styles from './features.module.css';

export const metadata: Metadata = {
    title: 'Workout Tracking Features',
    description:
        'How Peak Fettle works: fast set logging, a 0–1000 strength score, fair percentile rankings, ' +
        'adaptive AI plans, and habit streaks — for lifting and cardio alike.',
    alternates: { canonical: '/features' },
    openGraph: {
        title: 'Features · Peak Fettle',
        description: 'Set logging, strength score, fair percentiles, adaptive AI plans, and habit streaks.',
        url: `${SITE.url}/features`,
    },
};

type Spotlight = {
    eyebrow: string;
    title: string;
    body: string;
    bullets: string[];
    screen: React.ReactNode;
    src: string;
    alt: string;
};

const SPOTLIGHTS: Spotlight[] = [
    {
        eyebrow: 'Logging',
        title: 'Log a set in seconds',
        body:
            'Reps, weight, and effort — that is all it takes. Sets group into workouts automatically, ' +
            'and Peak Fettle estimates your 1RM from every working set so progress is visible immediately.',
        bullets: ['Auto-grouped workouts', 'Estimated 1RM per set', 'RIR / effort tracking'],
        screen: <ScreenLog />, src: '/screens/log.png', alt: 'Logging a workout',
    },
    {
        eyebrow: 'Strength score',
        title: 'One honest number, 0–1000',
        body:
            'Your score blends estimated 1RM with volume, progressive overload, and consistency. ' +
            'Beginners feel fast early momentum; advanced athletes get an honest, asymptotic curve. ' +
            'Prefer the classics? Switch to DOTS or Wilks any time.',
        bullets: ['Peak Fettle score or DOTS / Wilks', 'Rewards consistency, not just genetics', '8-week trend at a glance'],
        screen: <ScreenScore />, src: '/screens/score.png', alt: 'Strength score screen',
    },
    {
        eyebrow: 'Percentiles',
        title: 'Ranked against people like you',
        body:
            'Percentiles are cohort-matched by sex (with a unisex opt-out), age, and years trained — ' +
            'recognizing that relative gains slow as you advance. Encouraging at the start, honest for the long haul.',
        bullets: ['Matched cohorts, never veterans vs. beginners', 'Unisex scale on request', 'Per-lift and overall'],
        screen: <ScreenRank />, src: '/screens/rank.png', alt: 'Percentile ranking screen',
    },
    {
        eyebrow: 'Consistency',
        title: 'Streaks that survive real life',
        body:
            'Showing up is the baseline — even a five-minute visit counts. Miss a day and a make-up window ' +
            'keeps your streak honest; an emergency override covers exams, illness, and travel without shame.',
        bullets: ['Make-up window each week', 'Emergency override', 'Lost only after two unmanaged misses'],
        screen: <ScreenStreak />, src: '/screens/streak.png', alt: 'Habit streak screen',
    },
];

const STEPS: { icon: IconName; title: string; body: string }[] = [
    { icon: 'barbell', title: 'Log', body: 'Capture every set and session in seconds.' },
    { icon: 'score', title: 'Score', body: 'See your estimated 1RM and 0–1000 strength score.' },
    { icon: 'percentile', title: 'Rank', body: 'Compare honestly within your matched cohort.' },
    { icon: 'ai', title: 'Adapt', body: 'AI re-plans around the performance you actually log.' },
];

const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url },
        { '@type': 'ListItem', position: 2, name: 'Features', item: `${SITE.url}/features` },
    ],
};

export default function FeaturesPage() {
    return (
        <>
            <JsonLd data={breadcrumb} />
            <PageHero
                eyebrow="Features"
                title={<>Everything you need to <span className="gradient-text">climb.</span></>}
                lede="Honest data and real coaching for lifting and cardio alike — built for the serious gym-goer who wants signal, not vanity metrics."
            />

            <div className="container">
                {SPOTLIGHTS.map((s, i) => (
                    <section
                        key={s.title}
                        className={`${styles.spot} ${i % 2 === 1 ? styles.reverse : ''}`}
                        aria-label={s.title}
                    >
                        <Reveal className={styles.spotCopy}>
                            <p className="eyebrow">{s.eyebrow}</p>
                            <h2 className="h2">{s.title}</h2>
                            <p className="lede">{s.body}</p>
                            <ul className={styles.bullets} role="list">
                                {s.bullets.map((b) => (
                                    <li key={b}><Icon name="check" size={20} /> {b}</li>
                                ))}
                            </ul>
                        </Reveal>
                        <Reveal delay={2} className={styles.spotPhone}>
                            <DeviceMockup src={ASSETS.screens ? s.src : undefined} alt={s.alt} fallback={s.screen} />
                        </Reveal>
                    </section>
                ))}
            </div>

            <section className={`${styles.steps} section`} aria-label="How it works">
                <div className="container">
                    <Reveal className={styles.stepsHead}>
                        <p className="eyebrow">How it works</p>
                        <h2 className="h2">A loop that compounds.</h2>
                    </Reveal>
                    <ol className={styles.stepGrid}>
                        {STEPS.map((st, i) => (
                            <Reveal key={st.title} as="li" delay={((i % 4) + 1) as 1 | 2 | 3 | 4} className={`card ${styles.step}`}>
                                <span className={styles.stepNum}>{i + 1}</span>
                                <span className={styles.stepIcon}><Icon name={st.icon} /></span>
                                <h3 className={styles.stepTitle}>{st.title}</h3>
                                <p className={styles.stepBody}>{st.body}</p>
                            </Reveal>
                        ))}
                    </ol>
                </div>
            </section>

            <section className={`${styles.cta} section`}>
                <div className="container">
                    <Reveal className={`card ${styles.ctaCard}`}>
                        <h2 className="h2">Put it to work tonight.</h2>
                        <Link href="/#download" className="btn btn-primary">Get the app</Link>
                    </Reveal>
                </div>
            </section>
        </>
    );
}
