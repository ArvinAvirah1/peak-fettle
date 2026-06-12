// Home — "The Measured Climb". The page is a longform training ledger:
// 26 weeks of one composite lifter (A.R.), told chapter by chapter, with the
// product introduced exactly where the story needs it. Every number traces to
// src/lib/story.ts — see the data constitution there.

import Link from 'next/link';
import HeroLedger from '@/components/HeroLedger';
import Spine from '@/components/Spine';
import Reveal from '@/components/Reveal';
import DeviceMockup from '@/components/DeviceMockup';
import Icon from '@/components/Icon';
import WaitlistForm from '@/components/WaitlistForm';
import DownloadButtons from '@/components/DownloadButtons';
import JsonLd from '@/components/JsonLd';
import { ScreenLog, ScreenRank, ScreenScore } from '@/components/AppScreens';
import {
    FigEstimate, FigScale, FigCohort, FigDeload, FigCohortMultiples, FigProjection,
} from '@/components/Figures';
import { FEATURES, DISCIPLINES, FAQS, PLANS } from '@/lib/content';
import { SITE, ASSETS } from '@/lib/site';
import { LANDMARKS, PLATE_WEEK } from '@/lib/story';
import styles from './page.module.css';

const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    name: SITE.name,
    operatingSystem: 'iOS, Android',
    applicationCategory: 'HealthApplication',
    applicationSubCategory: 'Fitness',
    description: SITE.metaDescription,
    url: SITE.url,
    image: `${SITE.url}/opengraph-image`,
    screenshot: `${SITE.url}/opengraph-image`,
    featureList: FEATURES.map((f) => f.title),
    offers: [
        { '@type': 'Offer', price: '0', priceCurrency: 'GBP', name: 'Free' },
        { '@type': 'Offer', price: '6.99', priceCurrency: 'GBP', name: 'Pro (monthly)' },
    ],
};

const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
};

const PLATES = [
    { num: 'plate i', title: 'the logger', caption: 'a set takes four taps.' },
    { num: 'plate ii', title: 'the score', caption: `${PLATE_WEEK.score} and climbing.` },
    { num: 'plate iii', title: 'the cohort', caption: 'honest company.' },
] as const;

export default function Home() {
    return (
        <>
            <JsonLd data={[softwareSchema, faqSchema]} />
            <Spine />

            {/* ── 01 · The cover ─────────────────────────────────────────── */}
            <HeroLedger />

            {/* ── 02 · The method — how a set becomes a number ───────────── */}
            <section id="method" className={`${styles.method} section`} aria-label="How your strength score works">
                <div className="container">
                    <Reveal className={styles.sectionHead} as="header">
                        <p className="eyebrow">wk 01 · fig. 01–03 — the method</p>
                        <h2 className="h2">How a set becomes a number.</h2>
                        <p className="lede">
                            Every working set becomes an <strong>estimated one-rep max</strong>. That
                            feeds a single <strong>0–1000 strength score</strong> — or
                            industry-standard <strong>DOTS / Wilks</strong> — plus an honest
                            percentile against a cohort matched to your sex, age, and years trained.
                            Here is A.R.&rsquo;s very first week, traced through.
                        </p>
                    </Reveal>
                    <ol className={styles.figGrid} role="list">
                        <Reveal as="li" delay={1} className={styles.figItem}>
                            <p className={styles.figKicker}>fig. 01 — estimate</p>
                            <FigEstimate />
                            <h3 className={styles.figTitle}>Estimate</h3>
                            <p className={styles.figBody}>
                                From reps and weight we estimate a one-rep max for every lift using
                                established strength formulas — no maxing out required. A.R.&rsquo;s
                                72&nbsp;kg × 5 opens the ledger at 84.0.
                            </p>
                        </Reveal>
                        <Reveal as="li" delay={2} className={styles.figItem}>
                            <p className={styles.figKicker}>fig. 02 — score</p>
                            <FigScale />
                            <h3 className={styles.figTitle}>Score</h3>
                            <p className={styles.figBody}>
                                Estimated 1RM, volume, progressive overload, and consistency combine
                                into one 0–1000 number. Week one reads {LANDMARKS.start.score}.
                                Prefer the classics? Switch to DOTS or Wilks any time.
                            </p>
                        </Reveal>
                        <Reveal as="li" delay={3} className={styles.figItem}>
                            <p className={styles.figKicker}>fig. 03 — rank</p>
                            <FigCohort />
                            <h3 className={styles.figTitle}>Rank</h3>
                            <p className={styles.figBody}>
                                The score lands in a cohort matched by sex, age, and years trained —
                                the {LANDMARKS.percentileStart}st percentile, honestly. A beginner is
                                never measured against a veteran.
                            </p>
                        </Reveal>
                    </ol>
                    <p className={styles.methodNote}>
                        Peak Fettle is a training tool, not medical advice.{' '}
                        <Link href="/features">See the full breakdown →</Link>
                    </p>
                </div>
            </section>

            {/* ── 03 · Field notes — the app, as plates ──────────────────── */}
            <section className={`${styles.plates} section`} aria-label="The app">
                <div className="container">
                    <Reveal className={styles.sectionHead} as="header">
                        <p className="eyebrow">wk 01–08 · plates i–iii — field notes</p>
                        <h2 className="h2">Your training, made legible.</h2>
                        <p className="lede">
                            Eight weeks in, the fast start is on the page: e1RM{' '}
                            {PLATE_WEEK.e1rm.toFixed(1)}&nbsp;kg by week six. Every screen earns its
                            place — log fast, read honest numbers, watch the climb.
                        </p>
                    </Reveal>

                    <div className={styles.phones}>
                        {[
                            <DeviceMockup key="log" src={ASSETS.screens ? '/screens/log.png' : undefined} alt="Logging a bench press workout in Peak Fettle" fallback={<ScreenLog />} />,
                            <DeviceMockup key="score" src={ASSETS.screens ? '/screens/score.png' : undefined} alt="The 0 to 1000 strength score screen" fallback={<ScreenScore />} />,
                            <DeviceMockup key="rank" src={ASSETS.screens ? '/screens/rank.png' : undefined} alt="Percentile ranking against a matched cohort" fallback={<ScreenRank />} />,
                        ].map((mockup, i) => (
                            <Reveal key={PLATES[i].num} delay={((i % 3) + 1) as 1 | 2 | 3} className={styles[`phone${'ABC'[i]}` as 'phoneA' | 'phoneB' | 'phoneC']}>
                                {mockup}
                                <p className={styles.plateCaption}>
                                    <span className={styles.plateNum}>{PLATES[i].num}</span>
                                    {' — '}{PLATES[i].title} · {PLATES[i].caption}
                                </p>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── 04 · The plateau — the features ledger ─────────────────── */}
            <section id="features" className={`${styles.ledger} section`} aria-label="Features">
                <div className="container">
                    <Reveal className={styles.sectionHead} as="header">
                        <p className="eyebrow">wk 09–13 · the plateau — what gets measured</p>
                        <blockquote className={styles.pullQuote}>
                            Weeks nine to thirteen: 96.5, 96.0, 96.5, 97.0, 96.5.{' '}
                            <em>Nobody posts this part.</em>
                        </blockquote>
                        <p className="lede">
                            Plateaus are where tracking earns its keep. Everything Peak Fettle
                            measures, in one index:
                        </p>
                    </Reveal>
                    <ul className={styles.featureIndex} role="list">
                        {FEATURES.map((f, i) => (
                            <Reveal key={f.title} as="li" delay={((i % 2) + 1) as 1 | 2} className={styles.featureRow}>
                                <span className={styles.featureNum}>{String(i + 1).padStart(2, '0')}</span>
                                <div className={styles.featureText}>
                                    <h3 className={styles.featureTitle}>
                                        <Icon name={f.icon} size={20} className={styles.featureGlyph} />
                                        {f.title}
                                    </h3>
                                    <p className={styles.featureBody}>{f.body}</p>
                                </div>
                            </Reveal>
                        ))}
                    </ul>
                </div>
            </section>

            {/* ── 05 · The deload — streaks, kept honestly ───────────────── */}
            <section className={`${styles.deload} section-tight`} aria-label="Streaks and deloads">
                <div className={`container ${styles.deloadInner}`}>
                    <Reveal className={styles.deloadFig}>
                        <p className="eyebrow">wk 14 · fig. 05 — the deload</p>
                        <FigDeload />
                        <p className={styles.figCaption}>
                            fig. 05 — weeks 12–16, up close. the dip is the plan working.
                        </p>
                    </Reveal>
                    <Reveal delay={2} className={styles.deloadCopy}>
                        <h2 className="h2">Rest is part of the program.</h2>
                        <p className="lede">
                            A deload week reads as a dip on the chart and progress in the plan.
                            Streaks work the same way: even a five-minute session keeps one alive,
                            a missed day gets a make-up window, and an emergency override exists for
                            real life. A streak is only lost when the system is sure you quit — not
                            busy.
                        </p>
                        <p className={styles.deloadFootnote}>
                            wk 23 — two sessions missed. make-up window kept the streak.
                        </p>
                    </Reveal>
                </div>
            </section>

            {/* ── 06 · Honest company — percentiles proven ───────────────── */}
            <section className={`${styles.fairness} section`} aria-label="Fair percentiles">
                <div className={`container ${styles.fairnessInner}`}>
                    <Reveal className={styles.fairnessCopy}>
                        <p className="eyebrow">wk 19 · fig. 04 — honest company</p>
                        <h2 className="h2">Ranked against people like you.</h2>
                        <p className="lede">
                            Most apps flatter you or crush you. Peak Fettle matches you to a cohort
                            by sex, age, and years trained — the same score reads differently in
                            different company, and saying so is the point.
                        </p>
                        <ul className={styles.checklist} role="list">
                            <li><Icon name="check" size={20} /> Cohort-matched, never one-size-fits-all</li>
                            <li><Icon name="check" size={20} /> Unisex scale opt-out, always</li>
                            <li><Icon name="check" size={20} /> Encouraging early, honest long-term</li>
                        </ul>
                        <p className={styles.prNote}>
                            <span className={styles.prTick} aria-hidden="true" />
                            wk 19 — 104.0 kg. first time past 100.
                        </p>
                    </Reveal>
                    <Reveal delay={2} className={styles.fairnessFig}>
                        <FigCohortMultiples />
                    </Reveal>
                </div>
            </section>

            {/* ── 07 · The disciplines — a specimen line ─────────────────── */}
            <section className={`${styles.specimen} section-tight`} aria-label="Supported disciplines">
                <div className="container">
                    <Reveal>
                        <p className={styles.specimenLine}>
                            {DISCIPLINES.map((d, i) => (
                                <span key={d}>
                                    {d}
                                    {i < DISCIPLINES.length - 1 && <span className={styles.interpunct} aria-hidden="true"> · </span>}
                                </span>
                            ))}
                        </p>
                        <p className={styles.specimenCaption}>
                            cardio logs pace and splits; the bar logs kilos. one ledger.
                        </p>
                    </Reveal>
                </div>
            </section>

            {/* ── 08 · The word — a dictionary leaf ──────────────────────── */}
            <section className={styles.paper} aria-label="What is fettle">
                <div className={`container ${styles.paperInner}`}>
                    <span className={styles.paperRule} aria-hidden="true" />
                    <span className={styles.paperNo}>No. 26</span>
                    <Reveal className={styles.defWrap}>
                        <p className={styles.defWord}>fettle</p>
                        <p className={styles.defMeta}>/ˈfɛt(ə)l/ · noun · from Old English <em>fetel</em>, a belt or girdle</p>
                        <p className={styles.defSense}>
                            The condition you arrive in. The shape you choose to be in.
                        </p>
                        <p className={styles.defEtym}>
                            To be in fine fettle is to be ready, prepared, equal to what comes next.
                            Consistency is the engine: even a five-minute session keeps the habit
                            alive. Every set you log is one notch tighter.
                        </p>
                    </Reveal>
                </div>
            </section>

            {/* ── 09 · Two editions — pricing ────────────────────────────── */}
            <section className={`${styles.pricing} section`} aria-label="Pricing">
                <div className="container">
                    <Reveal className={styles.sectionHead} as="header">
                        <p className="eyebrow">wk 23–25 · the editions</p>
                        <h2 className="h2">Pricing that respects the climb.</h2>
                    </Reveal>
                    <div className={styles.planGrid}>
                        {PLANS.map((p, i) => (
                            <Reveal key={p.name} delay={((i % 3) + 1) as 1 | 2 | 3} className={`${styles.plan} ${p.featured ? styles.planFeatured : ''}`}>
                                <p className={styles.planStamp}>
                                    edition {i === 0 ? 'i' : 'ii'} — {p.name} · {p.price} {p.cadence}
                                    {p.featured && <span className={styles.planTag}>recommended for the climb</span>}
                                </p>
                                <p className={styles.planTagline}>{p.tagline}</p>
                                <ul className={styles.planFeatures} role="list">
                                    {p.features.slice(0, 5).map((feat) => (
                                        <li key={feat}><Icon name="check" size={16} /> {feat}</li>
                                    ))}
                                </ul>
                            </Reveal>
                        ))}
                    </div>
                    <p className={styles.pricingFootnote}>
                        free tier is not a demo. it tracks, scores, and ranks — forever.
                    </p>
                    <p className={styles.pricingMore}>
                        <Link href="/pricing">See the full comparison <Icon name="arrow" size={18} /></Link>
                    </p>
                </div>
            </section>

            {/* ── 10 · Notes & corrections — FAQ ─────────────────────────── */}
            <section className={`${styles.faq} section`} aria-label="Frequently asked questions">
                <div className={`container ${styles.faqInner}`}>
                    <Reveal className={styles.faqHead}>
                        <p className="eyebrow">appendix — notes &amp; corrections</p>
                        <h2 className="h2">The honest FAQ.</h2>
                    </Reveal>
                    <div className={styles.faqList}>
                        {FAQS.map((f, i) => (
                            <details key={f.q} className={styles.faqItem}>
                                <summary>
                                    <span className={styles.faqIndex}>q.{String(i + 1).padStart(2, '0')}</span>
                                    <span className={styles.faqQuestion}>{f.q}</span>
                                    <span className={styles.faqPlus} aria-hidden="true" />
                                </summary>
                                <p>{f.a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── 11 · Week one — the close ──────────────────────────────── */}
            <section id="download" className={`${styles.cta} section`} aria-label="Get the app">
                <div className={`container ${styles.ctaInner}`}>
                    <Reveal>
                        <FigProjection />
                        <h2 className={`h2 ${styles.ctaHead}`}>Your line starts at week&nbsp;1.</h2>
                        <p className={`lede ${styles.ctaLede}`}>
                            Train at peak. <em className={styles.ctaMeasured}>Measured.</em> Free to
                            start — no ads, no vanity metrics.
                        </p>
                        <DownloadButtons align="center" className={styles.ctaButtons} />
                        <div id="notify" className={styles.notify}>
                            <p className={styles.notifyLabel}>Not on your store yet? Get the launch email.</p>
                            <WaitlistForm />
                        </div>
                    </Reveal>
                </div>
            </section>
        </>
    );
}
