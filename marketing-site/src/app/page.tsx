// Peak Fettle — Marketing landing page
// Phase B: one landing page + waitlist form (backed by Resend via /api/waitlist)
// T-09 (2026-05-03): scroll-margin-top on section anchors matches 72px sticky nav height
// Author: dev-frontend (Web Department)
// Date: 2026-05-02 / updated 2026-05-03

import Nav from '@/components/Nav';
import WaitlistForm from '@/components/WaitlistForm';
import styles from './page.module.css';

const FEATURES = [
    {
        icon: '📈',
        title: 'Track Every Set',
        body:  'Log reps, weight, and effort (RIR) in seconds. The app groups sets into ' +
               'daily workouts automatically — no setup needed.',
    },
    {
        icon: '🎯',
        title: 'Percentile Rankings',
        body:  'See exactly where your best lift ranks against athletes at your level. ' +
               'Cohort-matched by sex, age, and years of training — honest comparisons only.',
    },
    {
        icon: '🤖',
        title: 'AI-Generated Plans',
        body:  'Answer a short survey and get a periodized training plan tailored to your ' +
               'schedule, equipment, and goals. Powered by Claude.',
    },
    {
        icon: '🔁',
        title: 'Habit Streaks',
        body:  'Build sustainable habits beyond the gym — sleep, nutrition, recovery. ' +
               'Make-up windows and emergency overrides so life doesn\'t break your streak.',
    },
    {
        icon: '💪',
        title: 'Strength Score',
        body:  'A 0–1000 score derived from your estimated 1RM. Beginners see fast early ' +
               'gains; advanced athletes see honest, asymptotic progress.',
    },
    {
        icon: '🏃',
        title: 'Lift + Cardio Together',
        body:  'Log a barbell session and a 5K run in the same workout. Progress graphs ' +
               'adapt to show splits and pace for cardio, E1RM for strength.',
    },
];

export default function Home() {
    return (
        <main>
            {/* ---- Nav (client component: hamburger + focus trap + aria-modal) ---- */}
            <Nav />

            {/* ---- Hero ---- */}
            <section className={styles.hero} aria-label="Hero">
                <div className="container">
                    <div className={styles.heroInner}>
                        <div className={styles.heroCopy}>
                            <p className={styles.eyebrow}>Fitness tracking, reimagined</p>
                            <h1 className={styles.headline}>
                                Train like the<br />
                                <span className={styles.accent}>data is watching.</span>
                            </h1>
                            <p className={styles.subhead}>
                                Peak Fettle turns every set, every mile, and every gym visit into
                                a measurable climb. Track progress, compare yourself to real
                                athletes at your level, and follow AI-generated plans built for
                                the way you actually train.
                            </p>
                            <div className={styles.heroActions}>
                                <a href="#waitlist" className={styles.btnPrimary}>
                                    Get Early Access
                                </a>
                                <a href="#features" className={styles.btnSecondary}>
                                    See features ↓
                                </a>
                            </div>
                            <p className={styles.heroMeta}>
                                Free during beta · iOS · Android · Desktop
                            </p>
                        </div>

                        {/* Simple ASCII-art / typographic preview on desktop */}
                        <div className={styles.heroVisual} aria-hidden="true">
                            <div className={styles.mockCard}>
                                <div className={styles.mockHeader}>
                                    <span className={styles.mockDot} />
                                    <span className={styles.mockTitle}>Bench Press — Today</span>
                                </div>
                                <div className={styles.mockRow}>
                                    <span>Set 1</span>
                                    <span className={styles.mockAccent}>100 kg × 5</span>
                                    <span className={styles.mockBadge}>PR</span>
                                </div>
                                <div className={styles.mockRow}>
                                    <span>Set 2</span>
                                    <span>95 kg × 6</span>
                                </div>
                                <div className={styles.mockRow}>
                                    <span>Set 3</span>
                                    <span>90 kg × 8</span>
                                </div>
                                <div className={styles.mockStat}>
                                    E1RM: <strong>117 kg</strong> · Score: <strong>671</strong>
                                    <span className={styles.mockPercentile}>Top 12%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ---- Definition card ---- */}
            <section className={styles.defSection} aria-label="What is fettle">
                <div className="container">
                    <div className={styles.defCard}>
                        <div className={styles.defLeft}>
                            <span className={styles.defWord}>fettle</span>
                            <span className={styles.defPhonetic}>/ˈfɛt(ə)l/</span>
                            <span className={styles.defPos}>noun</span>
                        </div>
                        <div className={styles.defRight}>
                            <p>
                                The condition you arrive in. The shape you choose to be in.
                                The strap you cinch on before the hard work begins.
                            </p>
                            <p className={styles.defEtym}>
                                From Old English <em>fetel</em> — a belt, a girdle. To be in
                                fine fettle is to be ready, prepared, equal to what comes next.
                                Every set you log is one notch tighter.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ---- Features ---- */}
            <section id="features" className={styles.featuresSection} aria-label="Features">
                <div className="container">
                    <h2 className={styles.sectionTitle}>Everything you need to climb</h2>
                    <p className={styles.sectionSub}>
                        Built for the serious gym-goer who wants honest data, not vanity metrics.
                    </p>
                    <ul className={styles.featureGrid}>
                        {FEATURES.map((f) => (
                            <li key={f.title} className={styles.featureCard}>
                                <span className={styles.featureIcon}>{f.icon}</span>
                                <h3 className={styles.featureTitle}>{f.title}</h3>
                                <p className={styles.featureBody}>{f.body}</p>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* ---- Waitlist ---- */}
            <section id="waitlist" className={styles.waitlistSection} aria-label="Join waitlist">
                <div className="container">
                    <div className={styles.waitlistInner}>
                        <div className={styles.waitlistCopy}>
                            <h2 className={styles.waitlistTitle}>
                                Get early access
                            </h2>
                            <p className={styles.waitlistSub}>
                                We&apos;re opening beta spots to a small group first. Drop your email
                                and we&apos;ll reach out when your spot is ready. No spam — one email
                                when the app is ready for you.
                            </p>
                            <ul className={styles.waitlistPerks}>
                                <li>✓ Free during beta</li>
                                <li>✓ Founding member badge on your profile</li>
                                <li>✓ Direct line to the dev team</li>
                                <li>✓ Locked-in pricing before public launch</li>
                            </ul>
                        </div>
                        <div className={styles.waitlistForm}>
                            <WaitlistForm />
                        </div>
                    </div>
                </div>
            </section>

            {/* ---- Footer ---- */}
            <footer className={styles.footer}>
                <div className="container">
                    <div className={styles.footerInner}>
                        <span className={styles.logo}>
                            <span className={styles.logoMark}>▲</span>
                            Peak Fettle
                        </span>
                        <p className={styles.footerMeta}>
                            © 2026 Peak Fettle. All rights reserved.
                            &nbsp;·&nbsp;
                            <a href="mailto:hello@peakfettle.com">hello@peakfettle.com</a>
                        </p>
                    </div>
                </div>
            </footer>
        </main>
    );
}
