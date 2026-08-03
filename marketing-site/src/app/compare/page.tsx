import type { Metadata } from 'next';
import Link from 'next/link';
import PageHero from '@/components/PageHero';
import Reveal from '@/components/Reveal';
import Icon from '@/components/Icon';
import JsonLd from '@/components/JsonLd';
import { SITE } from '@/lib/site';
import {
    COLUMNS,
    LOGGERS,
    DIFFERENT_CATEGORY,
    METHODOLOGY,
    type CellValue,
    type CompetitorRow,
} from '@/lib/competitors';
import styles from './compare.module.css';

export const metadata: Metadata = {
    title: 'Peak Fettle vs Hevy, Strong, Fitbod & More',
    description:
        'An honest comparison of workout trackers: Peak Fettle vs Hevy, Strong, Boostcamp, Fitbod, ' +
        'Caliber, Apple Fitness+ and Whoop — free tiers, pricing, offline data, exports, and strength percentiles.',
    alternates: { canonical: '/compare' },
    openGraph: {
        title: 'Compare · Peak Fettle',
        description:
            'Peak Fettle vs Hevy, Strong, Boostcamp, Fitbod, Caliber, Apple Fitness+ and Whoop — compared honestly.',
        url: `${SITE.url}/compare`,
    },
};

// The three claims no competitor in the table matches. Product truth:
// tierPolicy.ts (local-first free tier), schema v18 weight_centi (exact
// entry), strengthModelV3.ts (on-device cohort percentiles).
const DIFFERENTIATORS = [
    {
        kicker: 'Local-first',
        title: 'Your training data never leaves your phone on the free tier.',
        body:
            'Free accounts run entirely on on-device storage — no logging caps, no routine caps, ' +
            'no history paywall, and no server round-trips to slow the logger down. Pro adds ' +
            'encrypted multi-device sync when you want it.',
        gold: true,
    },
    {
        kicker: 'Exact entry',
        title: 'The number you type is the number we store.',
        body:
            'Log 186.7 and it stays 186.7 — weights are stored as exact fixed-point values in the ' +
            'unit you typed, never rounded to the nearest plate or mangled by unit conversion.',
        gold: true,
    },
    {
        kicker: 'Honest rank',
        title: 'A percentile against people like you, computed on your device.',
        body:
            'Cohort-matched by sex, age band, and years trained — not a generic standards chart. ' +
            'The model runs on-device, so your lifts are ranked the moment you log them.',
        gold: true,
    },
];

const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url },
        { '@type': 'ListItem', position: 2, name: 'Compare', item: `${SITE.url}/compare` },
    ],
};

function Cell({ value }: { value: CellValue }): React.ReactElement {
    return (
        <td
            className={[
                styles.cell,
                value.good === true ? styles.cellGood : '',
                value.good === false ? styles.cellLimited : '',
                value.gold ? styles.cellGold : '',
            ].join(' ')}
        >
            {value.text}
        </td>
    );
}

function Row({ row }: { row: CompetitorRow }): React.ReactElement {
    return (
        <tr className={row.self ? styles.selfRow : undefined}>
            <th scope="row" className={styles.rowName}>
                {row.name}
            </th>
            {COLUMNS.map((c) => (
                <Cell key={c.key} value={row[c.key]} />
            ))}
        </tr>
    );
}

export default function ComparePage() {
    return (
        <>
            <JsonLd data={breadcrumb} />
            <PageHero
                eyebrow="The field"
                title={<>Compared <span className="gradient-text">honestly.</span></>}
                lede="Every serious logger has strengths. Here is where each one stands on the things that matter — free-tier limits, who holds your data, and whether you ever learn where you actually rank."
            />

            <div className="container">
                {/* -------------------------------------------------------- */}
                {/* The three differentiators                                 */}
                {/* -------------------------------------------------------- */}
                <section className={styles.diffs} aria-label="What sets Peak Fettle apart">
                    {DIFFERENTIATORS.map((d, i) => (
                        <Reveal
                            key={d.kicker}
                            delay={((i % 3) + 1) as 1 | 2 | 3}
                            className={`card ${styles.diffCard}`}
                        >
                            <p className={styles.diffKicker}>{d.kicker}</p>
                            <h2 className={styles.diffTitle}>{d.title}</h2>
                            <p className={styles.diffBody}>{d.body}</p>
                        </Reveal>
                    ))}
                </section>

                {/* -------------------------------------------------------- */}
                {/* Main comparison table                                     */}
                {/* -------------------------------------------------------- */}
                <section className="section-tight" aria-label="Feature comparison table">
                    <Reveal>
                        <p className="eyebrow">Side by side</p>
                        <h2 className="h2">The loggers.</h2>
                        <p className={`lede ${styles.tableLede}`}>
                            Apps a lifter would actually cross-shop. Scroll the table on mobile.
                        </p>
                    </Reveal>
                    <Reveal className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th scope="col" className={styles.rowName}>App</th>
                                    {COLUMNS.map((c) => (
                                        <th key={c.key} scope="col" className={styles.colHead}>
                                            {c.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {LOGGERS.map((row) => (
                                    <Row key={row.name} row={row} />
                                ))}
                            </tbody>
                        </table>
                    </Reveal>
                    <p className={`mono-note ${styles.methodology}`}>{METHODOLOGY}</p>
                </section>

                {/* -------------------------------------------------------- */}
                {/* Different category band                                   */}
                {/* -------------------------------------------------------- */}
                <section className="section-tight" aria-label="Different category">
                    <Reveal>
                        <p className="eyebrow">Different category</p>
                        <h2 className="h2">Great products. Not loggers.</h2>
                    </Reveal>
                    <div className={styles.catGrid}>
                        {DIFFERENT_CATEGORY.map((c, i) => (
                            <Reveal key={c.name} delay={((i % 2) + 1) as 1 | 2} className={`card ${styles.catCard}`}>
                                <div className={styles.catHead}>
                                    <h3 className="h3">{c.name}</h3>
                                    <span className={styles.catPrice}>{c.price}</span>
                                </div>
                                <p className={styles.catWhat}>{c.what}</p>
                                <p className={styles.catWhy}>{c.why}</p>
                            </Reveal>
                        ))}
                    </div>
                </section>

                {/* -------------------------------------------------------- */}
                {/* Switching                                                 */}
                {/* -------------------------------------------------------- */}
                <section className="section-tight" aria-label="Switching from another app">
                    <Reveal className={`card ${styles.switchCard}`}>
                        <p className="eyebrow">Switching?</p>
                        <h2 className="h2">Bring your history with you.</h2>
                        <p className={`lede ${styles.switchLede}`}>
                            Peak Fettle ships dedicated CSV importers for Hevy and Strong — export from
                            either app, import in one step, and your whole training history (and your
                            percentile) is waiting on day one.
                        </p>
                        <ul className={styles.switchList} role="list">
                            <li><Icon name="check" size={20} /> Hevy CSV import</li>
                            <li><Icon name="check" size={20} /> Strong CSV import</li>
                            <li><Icon name="check" size={20} /> CSV export any time — it stays your data</li>
                        </ul>
                        <div className={styles.switchCta}>
                            <Link href="/#download" className="btn btn-primary">Get the app</Link>
                            <Link href="/features" className="btn btn-ghost">See all features</Link>
                        </div>
                    </Reveal>
                </section>
            </div>
        </>
    );
}
