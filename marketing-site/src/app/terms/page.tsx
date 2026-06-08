import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import JsonLd from '@/components/JsonLd';
import styles from '../legal.module.css';

export const metadata: Metadata = {
    title: 'Terms of Service',
    description: 'The terms that govern your use of Peak Fettle.',
    alternates: { canonical: '/terms' },
    robots: { index: true, follow: true },
};

const UPDATED = '1 June 2026';

const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url },
        { '@type': 'ListItem', position: 2, name: 'Terms of Service', item: `${SITE.url}/terms` },
    ],
};

export default function TermsPage() {
    return (
        <div className={styles.wrap}>
            <JsonLd data={breadcrumb} />
            <div className={`container ${styles.inner}`}>
                <h1 className={`h2 ${styles.title}`}>Terms of Service</h1>
                <p className={styles.updated}>Last updated: {UPDATED}</p>

                <div className={styles.callout}>
                    <span aria-hidden="true">⚠️</span>
                    <p><strong>Template for review.</strong> These terms are a working draft and must be reviewed
                    by qualified counsel before launch. They are not legal advice.</p>
                </div>

                <div className={styles.body}>
                    <p>These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the {SITE.name} app and
                    website (the &ldquo;Service&rdquo;). By using the Service, you agree to these Terms.</p>

                    <h2>1. Eligibility &amp; accounts</h2>
                    <p>You must be at least 16 (or the minimum age in your region) to use the Service. You are
                    responsible for your account credentials and for activity under your account.</p>

                    <h2>2. The Service</h2>
                    <p>{SITE.name} provides fitness tracking, strength scoring, percentile rankings, habit streaks,
                    and optional AI-generated training plans. Features may change as we improve the Service.</p>

                    <h2>3. Subscriptions &amp; billing</h2>
                    <ul>
                        <li>Core tracking and percentile features are free.</li>
                        <li><strong>Pro</strong> is a paid subscription unlocking AI-generated, adaptive plans.</li>
                        <li>Paid subscriptions are billed through the Apple App Store or Google Play and renew automatically until cancelled.</li>
                        <li>Manage or cancel your subscription in your app store account settings. Store refund policies apply.</li>
                    </ul>

                    <h2>4. Acceptable use</h2>
                    <p>You agree not to misuse the Service — including attempting to disrupt it, reverse-engineer it,
                    scrape it, or use it to harm others. We may suspend accounts that violate these Terms.</p>

                    <h2>5. Your content and data</h2>
                    <p>You retain ownership of the training data you log. You grant us a limited licence to process
                    it to operate and improve the Service, as described in our <a href="/privacy">Privacy Policy</a>.</p>

                    <h2>6. Health disclaimer</h2>
                    <p><strong>{SITE.name} is a training tool, not medical advice.</strong> Recommendations, scores,
                    and plans are informational only. Consult a qualified professional before starting or changing
                    any exercise or nutrition program, especially if you have an injury or medical condition. You
                    train at your own risk.</p>

                    <h2>7. Disclaimers</h2>
                    <p>The Service is provided &ldquo;as is&rdquo; without warranties of any kind, to the fullest
                    extent permitted by law. We do not guarantee specific fitness results.</p>

                    <h2>8. Limitation of liability</h2>
                    <p>To the maximum extent permitted by law, {SITE.name} will not be liable for indirect,
                    incidental, or consequential damages arising from your use of the Service.</p>

                    <h2>9. Termination</h2>
                    <p>You may stop using the Service and delete your account at any time. We may suspend or
                    terminate access if you breach these Terms or where required by law.</p>

                    <h2>10. Changes</h2>
                    <p>We may update these Terms. We will post the updated version here and revise the date above.
                    Continued use after changes means you accept the updated Terms.</p>

                    <h2>11. Governing law</h2>
                    <p>These Terms are governed by the laws of England and Wales, unless otherwise required by your
                    local consumer law. <em>(Confirm jurisdiction with counsel.)</em></p>

                    <h2>12. Contact</h2>
                    <p>Questions about these Terms? Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>
                </div>
            </div>
        </div>
    );
}
