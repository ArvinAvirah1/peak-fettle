import Link from 'next/link';
import ScrollHero from '@/components/ScrollHero';
import Reveal from '@/components/Reveal';
import DeviceMockup from '@/components/DeviceMockup';
import Icon from '@/components/Icon';
import WaitlistForm from '@/components/WaitlistForm';
import DownloadButtons from '@/components/DownloadButtons';
import JsonLd from '@/components/JsonLd';
import { ScreenLog, ScreenRank, ScreenScore } from '@/components/AppScreens';
import { FEATURES, DISCIPLINES, FAQS, PLANS } from '@/lib/content';
import { SITE, ASSETS } from '@/lib/site';
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

export default function Home() {
    return (
        <>
            <JsonLd data={[softwareSchema, faqSchema]} />

            <ScrollHero />

            {/* ---- Disciplines strip ---- */}
            <section className={`${styles.strip} section-tight`} aria-label="Supported disciplines">
                <div className="container">
                    <p className={styles.stripLabel}>One app for every way you train</p>
                    <ul className={styles.disciplines} role="list">
                        {DISCIPLINES.map((d) => (
                            <li key={d}>{d}</li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* ---- Showcase: real screens ---- */}
            <section className={`${styles.showcase} section`} aria-label="The app">
                <div className="container">
                    <Reveal className={styles.sectionHead} as="header">
                        <p className="eyebrow">See it in action</p>
                        <h2 className="h2">Your training, made legible.</h2>
                        <p className="lede">
                            Every screen earns its place. Log fast, see honest numbers, and watch
                            the climb — without a single vanity metric.
                        </p>
                    </Reveal>

                    <div className={styles.phones}>
                        <Reveal delay={1} className={styles.phoneA}>
                            <DeviceMockup src={ASSETS.screens ? '/screens/log.png' : undefined} alt="Logging a bench press workout in Peak Fettle" fallback={<ScreenLog />} />
                        </Reveal>
                        <Reveal delay={2} className={styles.phoneB}>
                            <DeviceMockup src={ASSETS.screens ? '/screens/score.png' : undefined} alt="The 0 to 1000 strength score screen" fallback={<ScreenScore />} />
                        </Reveal>
                        <Reveal delay={3} className={styles.phoneC}>
                            <DeviceMockup src={ASSETS.screens ? '/screens/rank.png' : undefined} alt="Percentile ranking against a matched cohort" fallback={<ScreenRank />} />
                        </Reveal>
                    </div>
                </div>
            </section>

            {/* ---- Features grid ---- */}
            <section id="features" className={`${styles.features} section`} aria-label="Features">
                <div className="container">
                    <Reveal className={styles.sectionHead} as="header">
                        <p className="eyebrow">Everything you need to climb</p>
                        <h2 className="h2">Honest data. Real coaching. No fluff.</h2>
                    </Reveal>
                    <ul className={styles.featureGrid} role="list">
                        {FEATURES.map((f, i) => (
                            <Reveal key={f.title} as="li" delay={((i % 3) + 1) as 1 | 2 | 3} className={`card ${styles.featureCard}`}>
                                <span className={styles.featureIcon}><Icon name={f.icon} /></span>
                                <h3 className={styles.featureTitle}>{f.title}</h3>
                                <p className={styles.featureBody}>{f.body}</p>
                            </Reveal>
                        ))}
                    </ul>
                </div>
            </section>

            {/* ---- Honest percentiles split ---- */}
            <section className={`${styles.split} section`} aria-label="Fair percentiles">
                <div className={`container ${styles.splitInner}`}>
                    <Reveal className={styles.splitCopy}>
                        <p className="eyebrow">Fair by design</p>
                        <h2 className="h2">Ranked against people like you.</h2>
                        <p className="lede">
                            Most apps flatter you or crush you. Peak Fettle matches you to a cohort by
                            sex, age, and years trained — so your percentile is honest at every stage.
                        </p>
                        <ul className={styles.checklist} role="list">
                            <li><Icon name="check" size={20} /> Cohort-matched, never one-size-fits-all</li>
                            <li><Icon name="check" size={20} /> Encouraging early, honest long-term</li>
                        </ul>
                    </Reveal>
                    <Reveal delay={2} className={styles.splitPhone}>
                        <DeviceMockup src={ASSETS.screens ? '/screens/rank.png' : undefined} alt="Percentile ranking detail" fallback={<ScreenRank />} />
                    </Reveal>
                </div>
            </section>

            {/* ---- Methodology / how scoring works (E-E-A-T, YMYL) ---- */}
            <section className={`${styles.method} section`} aria-label="How your strength score works">
                <div className="container">
                    <Reveal className={styles.sectionHead} as="header">
                        <p className="eyebrow">The method</p>
                        <h2 className="h2">How your strength score works.</h2>
                        <p className="lede">
                            Every working set becomes an <strong>estimated one-rep max</strong>. That feeds a
                            single <strong>0–1000 strength score</strong> — or industry-standard{' '}
                            <strong>DOTS / Wilks</strong> — plus an honest percentile against a cohort matched
                            to your sex, age, and years trained.
                        </p>
                    </Reveal>
                    <ol className={styles.methodGrid}>
                        <Reveal as="li" delay={1} className={`card ${styles.methodCard}`}>
                            <span className={styles.methodNum}>1</span>
                            <span className={styles.methodIcon}><Icon name="barbell" /></span>
                            <h3 className={styles.methodTitle}>Estimate</h3>
                            <p className={styles.methodBody}>
                                From your reps and weight we estimate your one-rep max for every lift using
                                established strength formulas — no maxing out required.
                            </p>
                        </Reveal>
                        <Reveal as="li" delay={2} className={`card ${styles.methodCard}`}>
                            <span className={styles.methodNum}>2</span>
                            <span className={styles.methodIcon}><Icon name="score" /></span>
                            <h3 className={styles.methodTitle}>Score</h3>
                            <p className={styles.methodBody}>
                                Your estimated 1RM, volume, progressive overload, and consistency combine into
                                one 0–1000 score. Prefer the classics? Switch to DOTS or Wilks any time.
                            </p>
                        </Reveal>
                        <Reveal as="li" delay={3} className={`card ${styles.methodCard}`}>
                            <span className={styles.methodNum}>3</span>
                            <span className={styles.methodIcon}><Icon name="percentile" /></span>
                            <h3 className={styles.methodTitle}>Rank</h3>
                            <p className={styles.methodBody}>
                                We place you in a cohort matched by sex, age, and years trained, then show your
                                honest percentile against strength standards — never beginner versus veteran.
                            </p>
                        </Reveal>
                    </ol>
                    <p className={styles.methodNote}>
                        Peak Fettle is a training tool, not medical advice. <Link href="/features">See the full breakdown →</Link>
                    </p>
                </div>
            </section>

            {/* ---- Philosophy / definition ---- */}
            <section className={`${styles.philosophy} section`} aria-label="What is fettle">
                <div className="container">
                    <Reveal className={`card ${styles.defCard}`}>
                        <div className={styles.defLeft}>
                            <span className={styles.defWord}>fettle</span>
                            <span className={styles.defPhonetic}>/ˈfɛt(ə)l/</span>
                            <span className={styles.defPos}>noun</span>
                        </div>
                        <div className={styles.defRight}>
                            <p>The condition you arrive in. The shape you choose to be in.</p>
                            <p className={styles.defEtym}>
                                From Old English <em>fetel</em> — a belt, a girdle. To be in fine
                                fettle is to be ready, prepared, equal to what comes next. Consistency
                                is the engine: even a five-minute session keeps the habit alive. Every
                                set you log is one notch tighter.
                            </p>
                        </div>
                    </Reveal>
                </div>
            </section>

            {/* ---- Pricing teaser ---- */}
            <section className={`${styles.pricing} section`} aria-label="Pricing">
                <div className="container">
                    <Reveal className={styles.sectionHead} as="header">
                        <p className="eyebrow">Start free, upgrade when you want</p>
                        <h2 className="h2">Pricing that respects the climb.</h2>
                    </Reveal>
                    <div className={styles.planGrid}>
                        {PLANS.map((p, i) => (
                            <Reveal key={p.name} delay={((i % 3) + 1) as 1 | 2 | 3} className={`card ${styles.plan} ${p.featured ? styles.planFeatured : ''}`}>
                                <h3 className={styles.planName}>{p.name}</h3>
                                <p className={styles.planPrice}>
                                    {p.price} <span>/ {p.cadence}</span>
                                </p>
                                <p className={styles.planTagline}>{p.tagline}</p>
                                <ul className={styles.planFeatures} role="list">
                                    {p.features.slice(0, 5).map((feat) => (
                                        <li key={feat}><Icon name="check" size={18} /> {feat}</li>
                                    ))}
                                </ul>
                            </Reveal>
                        ))}
                    </div>
                    <p className={styles.pricingMore}>
                        <Link href="/pricing">See the full comparison <Icon name="arrow" size={18} /></Link>
                    </p>
                </div>
            </section>

            {/* ---- FAQ ---- */}
            <section className={`${styles.faq} section`} aria-label="Frequently asked questions">
                <div className={`container ${styles.faqInner}`}>
                    <Reveal className={styles.faqHead}>
                        <p className="eyebrow">Questions, answered</p>
                        <h2 className="h2">The honest FAQ.</h2>
                    </Reveal>
                    <div className={styles.faqList}>
                        {FAQS.map((f) => (
                            <details key={f.q} className={styles.faqItem}>
                                <summary>{f.q}<span className={styles.faqPlus} aria-hidden="true" /></summary>
                                <p>{f.a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* ---- Final CTA ---- */}
            <section id="download" className={`${styles.cta} section`} aria-label="Get the app">
                <div className="container">
                    <Reveal className={`card ${styles.ctaCard}`}>
                        <h2 className="h2">Ready to train at peak?</h2>
                        <p className="lede">
                            Download Peak Fettle and turn your next session into measurable progress.
                            Free to start — no ads, no vanity metrics.
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
