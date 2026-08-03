/**
 * competitors.ts — the /compare page's data constitution.
 *
 * Extends the story.ts rule to externally-sourced facts: every figure on the
 * comparison page traces to THIS file, and every entry here carries its source
 * and check-date. Competitor prices are US App Store figures (Peak Fettle
 * prices in GBP); the page footnotes this explicitly.
 *
 * Checked: 2026-08 (web sources cited per entry). Absolute negatives
 * ("not offered") are used only where multiple 2026 reviews enumerate the full
 * feature set (Hevy, Strong, Caliber); otherwise wording stays soft.
 */

export type CellValue = {
    /** Short display text for the table cell. */
    text: string;
    /** true = clearly good, false = clearly limited, undefined = neutral. */
    good?: boolean;
    /** Peak Fettle differentiator cell — gold treatment, budget of 3 per page. */
    gold?: boolean;
};

export type CompetitorRow = {
    name: string;
    /** True for the Peak Fettle row (accent column treatment). */
    self?: boolean;
    freeTier: CellValue;
    price: CellValue;
    offline: CellValue;
    ownership: CellValue;
    percentiles: CellValue;
    programs: CellValue;
    coaching: CellValue;
};

/** Table column headers, in render order. */
export const COLUMNS = [
    { key: 'freeTier', label: 'Free tier' },
    { key: 'price', label: 'Paid price' },
    { key: 'offline', label: 'Offline / local data' },
    { key: 'ownership', label: 'Export & ownership' },
    { key: 'percentiles', label: 'Rank vs population' },
    { key: 'programs', label: 'Programs' },
    { key: 'coaching', label: 'Coaching' },
] as const;

// ---------------------------------------------------------------------------
// The loggers — apps a lifter would actually cross-shop with Peak Fettle.
// ---------------------------------------------------------------------------

export const LOGGERS: CompetitorRow[] = [
    {
        name: 'Peak Fettle',
        self: true,
        // Product truth: tierPolicy.ts — free (!is_paid) users run entirely on
        // on-device SQLite; no logging/routine/history caps exist in code.
        freeTier: { text: 'Unlimited logging, routines & history — data stays on your phone', good: true, gold: true },
        // Product truth: pricing page / story.ts data constitution (£0 / £6.99).
        price: { text: '£6.99/mo Pro (multi-device sync)', good: true },
        offline: { text: 'Local-first: works fully offline by design', good: true },
        ownership: { text: 'CSV export + imports from Hevy & Strong', good: true },
        // Product truth: strengthModelV3.ts — on-device cohort-matched percentiles.
        percentiles: { text: 'Cohort-matched percentiles, computed on-device', good: true, gold: true },
        programs: { text: '8 bundled programs + routine builder & folders', good: true },
        coaching: { text: 'Adaptive plan generation from your survey + logs' },
    },
    {
        // Sources: sensai.fit/blog/hevy-review-2026; repreturn.com/hevy-app-review;
        // help.hevyapp.com (export). Checked 2026-08.
        name: 'Hevy',
        freeTier: { text: 'Unlimited logging; 4 routines, ~3 months of graphs', good: false },
        price: { text: 'From $2.99/mo · $23.99/yr · $74.99 lifetime' },
        offline: { text: 'Offline logging, cloud sync' },
        ownership: { text: 'CSV export' },
        percentiles: { text: 'Not offered', good: false },
        programs: { text: 'Routines only — no marketplace', good: false },
        coaching: { text: 'Not offered', good: false },
    },
    {
        // Sources: apps.apple.com Strong listing; prpath.app/blog/strong-app-review-2026;
        // setgraph.app. Checked 2026-08.
        name: 'Strong',
        freeTier: { text: 'Unlimited logging; 3 routines, charts behind Pro', good: false },
        price: { text: '$4.99/mo · $29.99/yr · $99.99 lifetime' },
        offline: { text: 'Offline capable, cloud sync' },
        ownership: { text: 'CSV export' },
        percentiles: { text: 'Not offered', good: false },
        programs: { text: 'Routines only', good: false },
        coaching: { text: 'Not offered', good: false },
    },
    {
        // Sources: boostcamp.app/pro; boostcamp.app/features; barbend.com &
        // garagegymreviews.com Boostcamp reviews. Checked 2026-08.
        name: 'Boostcamp',
        freeTier: { text: '11k+ community programs, tracking, plate calc', good: true },
        price: { text: '$59.99/yr (or $14.99/mo)' },
        offline: { text: 'Cloud-backed' },
        ownership: { text: 'Limited export' },
        // Fair contrast: standards-based 0–100 score, not a population percentile.
        percentiles: { text: '0–100 strength score (standards-based, Pro)', good: false },
        programs: { text: 'Best-in-class program marketplace', good: true },
        coaching: { text: 'Coach-written programs, no live coaching' },
    },
    {
        // Sources: sensai.fit/blog/fitbod-review-2026; fitnessdrum.com/fitbod-review.
        // Trial form varies by platform. Checked 2026-08.
        name: 'Fitbod',
        freeTier: { text: 'Trial only (3 workouts) — no free tier', good: false },
        price: { text: '$15.99/mo · $95.99/yr' },
        offline: { text: 'Cloud-backed' },
        ownership: { text: 'Limited export' },
        percentiles: { text: 'Not a focus', good: false },
        programs: { text: 'Algorithmic workout generation', good: true },
        coaching: { text: 'Recovery-aware auto-programming' },
    },
    {
        // Sources: garagegymreviews.com/caliber-app-review; barbend.com Caliber
        // review. Checked 2026-08.
        name: 'Caliber',
        freeTier: { text: 'Free forever: library + custom workouts, no coach', good: true },
        price: { text: 'Plus from $72/yr · coaching $19–$200/mo' },
        offline: { text: 'Cloud-backed' },
        ownership: { text: 'Limited export' },
        percentiles: { text: 'Not offered', good: false },
        programs: { text: 'Coach-assigned plans' },
        coaching: { text: 'Human 1-on-1 & group coaching', good: true },
    },
];

// ---------------------------------------------------------------------------
// Different category — content & wearable services, not lifting loggers.
// Kept in a separate band so the comparison stays honest.
// ---------------------------------------------------------------------------

export type CategoryNote = {
    name: string;
    price: string;
    what: string;
    why: string;
};

export const DIFFERENT_CATEGORY: CategoryNote[] = [
    {
        // Source: support.apple.com/en-us/102233. Checked 2026-08.
        name: 'Apple Fitness+',
        price: '$9.99/mo · $79.99/yr',
        what: 'Video workout classes across yoga, HIIT, strength and more.',
        why: 'A content service — it does not log sets, track 1RMs, or rank strength. Pairs fine alongside a logger.',
    },
    {
        // Source: whoop.com/us/en/membership; trackervs.com. Checked 2026-08.
        name: 'Whoop',
        price: '$199–$359/yr with hardware',
        what: 'Recovery wearable: sleep, strain, HRV, health monitoring.',
        why: 'Measures recovery, not lifting. No set logging or strength percentiles; your data lives in Whoop’s cloud.',
    },
];

/** Methodology footnote rendered under the table. */
export const METHODOLOGY =
    'Competitor prices are US App Store figures checked August 2026 and shift by region; ' +
    'Peak Fettle prices in GBP. “Not offered” appears only where multiple current reviews ' +
    'enumerate the full feature set. Sources are cited in this page’s data file.';
