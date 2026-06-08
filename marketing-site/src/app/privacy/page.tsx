import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import JsonLd from '@/components/JsonLd';
import styles from '../legal.module.css';

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description: 'How Peak Fettle collects, uses, and protects your data.',
    alternates: { canonical: '/privacy' },
    robots: { index: true, follow: true },
};

const UPDATED = '1 June 2026';

const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url },
        { '@type': 'ListItem', position: 2, name: 'Privacy Policy', item: `${SITE.url}/privacy` },
    ],
};

export default function PrivacyPage() {
    return (
        <div className={`${styles.wrap}`}>
            <JsonLd data={breadcrumb} />
            <div className={`container ${styles.inner}`}>
                <h1 className={`h2 ${styles.title}`}>Privacy Policy</h1>
                <p className={styles.updated}>Last updated: {UPDATED}</p>

                <div className={styles.callout}>
                    <span aria-hidden="true">⚠️</span>
                    <p><strong>Template for review.</strong> This policy is a working draft and must be reviewed
                    by qualified counsel before launch. It is not legal advice.</p>
                </div>

                <div className={styles.body}>
                    <p>
                        This Privacy Policy explains how {SITE.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) handles
                        information when you use our mobile app and website (the &ldquo;Service&rdquo;). We aim to
                        collect only what we need to make the Service work and to be clear about why.
                    </p>

                    <h2>Information we collect</h2>
                    <h3>Information you provide</h3>
                    <ul>
                        <li><strong>Account details</strong> — your email address and basic profile (e.g. sex, age band, and years trained) used to calculate fair percentile cohorts.</li>
                        <li><strong>Training data</strong> — the sets, reps, weights, sessions, goals, and notes you log.</li>
                        <li><strong>Survey responses</strong> — for AI plan generation (goals, equipment, availability, injury history you choose to share).</li>
                        <li><strong>Communications</strong> — messages and emails you send us, including waitlist/launch sign-ups.</li>
                    </ul>
                    <h3>Information collected automatically</h3>
                    <ul>
                        <li><strong>Usage and device data</strong> — app/website interactions, approximate region, device and OS type, and diagnostic logs.</li>
                        <li><strong>Cookies / analytics</strong> — privacy-respecting analytics to understand aggregate usage. See &ldquo;Analytics&rdquo; below.</li>
                    </ul>

                    <h2>How we use your information</h2>
                    <ul>
                        <li>To provide core features: logging, strength scores, percentile rankings, streaks, and AI plans.</li>
                        <li>To match you to a fair comparison cohort by sex (with a unisex opt-out), age, and experience.</li>
                        <li>To operate, secure, debug, and improve the Service.</li>
                        <li>To communicate with you about your account, launch updates you requested, and important changes.</li>
                    </ul>

                    <h2>Sharing and service providers</h2>
                    <p>We do <strong>not</strong> sell your personal data. We share limited data with processors who help us run the Service, under contract and only as needed:</p>
                    <ul>
                        <li><strong>Email delivery</strong> — Resend, to send confirmations and updates you requested.</li>
                        <li><strong>Hosting / infrastructure</strong> — our website and app backend providers (e.g. Vercel and our database host).</li>
                        <li><strong>Analytics</strong> — an aggregate, privacy-respecting analytics provider.</li>
                        <li><strong>Legal</strong> — where required by law, or to protect rights and safety.</li>
                    </ul>

                    <h2>Analytics</h2>
                    <p>We use aggregate analytics to count visits and understand which features help. Where required, we ask for consent and honor your device&apos;s tracking preferences.</p>

                    <h2>Data retention</h2>
                    <p>We keep your data while your account is active and as needed to provide the Service. You can delete your account at any time; we then remove or anonymize your data within a reasonable period, except where we must retain it for legal reasons.</p>

                    <h2>Your rights</h2>
                    <p>Depending on where you live (e.g. UK/EU GDPR, California CCPA), you may have rights to access, correct, export, restrict, or delete your data, and to object to certain processing. To exercise these, email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>

                    <h2>Security</h2>
                    <p>We use technical and organizational measures to protect your data. No method of transmission or storage is perfectly secure, but we work to safeguard it and to notify you of material incidents as required by law.</p>

                    <h2>Children</h2>
                    <p>The Service is not directed to children under 16 (or the minimum age in your region). We do not knowingly collect their data.</p>

                    <h2>International transfers</h2>
                    <p>Your data may be processed in countries other than your own. Where required, we use appropriate safeguards for such transfers.</p>

                    <h2>Changes to this policy</h2>
                    <p>We may update this policy. We will post the new version here and update the date above; material changes will be communicated where appropriate.</p>

                    <h2>Contact</h2>
                    <p>Questions? Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>
                </div>
            </div>
        </div>
    );
}
