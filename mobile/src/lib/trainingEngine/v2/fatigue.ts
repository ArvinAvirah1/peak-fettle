/**
 * fatigue.ts — TICKET-142: fatigue-aware plan adjustment (deterministic).
 * =============================================================================
 * Fitbod's moat is fatigue-aware programming. We already COMPUTE readiness
 * (insightsLocal.computeReadiness → ReadinessCard / recovery heatmap) — this
 * module makes it ACT: sustained low readiness produces a plan-adjustment
 * PROPOSAL (volume trim or early deload). Suggest-only — the user always
 * confirms; accepted proposals apply through the EXISTING plan-adjust
 * mechanisms (planGen/metaChanges), never a new progression concept.
 *
 * PURE + DETERMINISTIC (engine rules):
 *   • No network. No storage. No randomness. No clock reads — `now` is input.
 *   • Same inputs → byte-identical output.
 *   • The word "AI" never appears in any user-facing string (founder rule).
 *   • Every proposal carries its rule id and a human "because" line naming
 *     the exact observation it fired on (same pattern as TICKET-141).
 *
 * RULE TABLE (evaluated top-to-bottom; first match wins):
 *   FT-D1  early deload  — 7-day mean readiness < LOW_WEEK_MEAN (55) over at
 *                          least MIN_SCORED_DAYS_WEEK (4) scored days, AND
 *                          ≥ MIN_WEEKS_SINCE_DELOAD (5) weeks since
 *                          last_deload_at (a null last_deload_at qualifies
 *                          only when the series itself spans ≥ 35 days — a
 *                          brand-new user should never be told to deload)
 *                          → propose pulling the deload forward.
 *   FT-V1  volume trim   — the 3 (CONSEC_LOW_SESSIONS) most recent scored
 *                          days inside VOLUME_WINDOW_DAYS (14) are ALL below
 *                          LOW_SESSION_SCORE (60)
 *                          → propose −TRIM_PCT (20%) accessory volume next
 *                          session.
 *
 * DISMISSAL BACKOFF (no nagging): after a dismissal the card stays quiet for
 * BACKOFF_BASE_DAYS (3) × 2^(consecutiveDismissals−1) days, capped at
 * BACKOFF_MAX_DAYS (28). A deload logged AFTER the last dismissal resets the
 * backoff entirely (the situation changed). Accepting a proposal resets the
 * counter (persistence side: appSettings.setFatigueAdviceDismissal).
 *
 * Worked examples live in __tests__/fatigue.test.js — the documentation of
 * record for these thresholds (founder sign-off tracked in TICKET-142).
 * Readiness inputs come from the LOCAL readiness computation on both tiers —
 * zero network on any tier.
 */

// ---------------------------------------------------------------------------
// Tunables (documented thresholds — founder sign-off tracked in TICKET-142)
// ---------------------------------------------------------------------------

/** FT-D1: 7-day mean readiness below this proposes an early deload. */
export const LOW_WEEK_MEAN = 55;
/** FT-D1: minimum scored days inside the 7-day window for the mean to count. */
export const MIN_SCORED_DAYS_WEEK = 4;
/** FT-D1: minimum whole weeks since the last deload before proposing another. */
export const MIN_WEEKS_SINCE_DELOAD = 5;
/** FT-D1: with no deload on record, the series must span at least this many days. */
export const MIN_HISTORY_SPAN_DAYS = 35;

/** FT-V1: a scored day below this counts as a low-readiness session. */
export const LOW_SESSION_SCORE = 60;
/** FT-V1: how many consecutive recent scored days must be low. */
export const CONSEC_LOW_SESSIONS = 3;
/** FT-V1: recency window the low days must fall inside. */
export const VOLUME_WINDOW_DAYS = 14;
/** FT-V1: proposed accessory-volume trim, percent. */
export const TRIM_PCT = 20;

/** Dismissal backoff: base days, doubling per consecutive dismissal, capped. */
export const BACKOFF_BASE_DAYS = 3;
export const BACKOFF_MAX_DAYS = 28;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One day of readiness input; score null/undefined = not computable that day. */
export interface ReadinessDay {
  /** ISO date or datetime the score belongs to. */
  date: string;
  /** Readiness 0–100, or null when unknown (unknown days are ignored). */
  score: number | null;
}

export interface FatigueDismissalState {
  lastDismissedAt: string | null;
  consecutiveDismissals: number;
}

export interface FatigueConfig {
  /** The current time, PASSED IN (no clock reads inside the rule). */
  now: string | Date;
  /** profile.last_deload_at (ISO) or null when no deload is on record. */
  lastDeloadAt?: string | null;
  /** Persisted dismissal state; omit/null = never dismissed. */
  dismissal?: FatigueDismissalState | null;
}

export type FatigueRuleId = 'FT-D1' | 'FT-V1';

export interface FatigueAdvice {
  rule_id: FatigueRuleId;
  /** Applied through EXISTING plan mechanisms — never a new concept. */
  action: 'pull_deload_forward' | 'trim_accessory_volume';
  /** Present only for trim_accessory_volume. */
  trim_pct?: number;
  /** Human explanation naming the observation — the copy IS the feature. */
  because: string;
}

// ---------------------------------------------------------------------------
// Small pure helpers (exported for the UI layer + tests)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(d: string | Date): number {
  return typeof d === 'string' ? Date.parse(d) : d.getTime();
}

/** Backoff length in days for a given consecutive-dismissal count. */
export function dismissalBackoffDays(consecutiveDismissals: number): number {
  if (!Number.isFinite(consecutiveDismissals) || consecutiveDismissals <= 0) return 0;
  const days = BACKOFF_BASE_DAYS * Math.pow(2, Math.floor(consecutiveDismissals) - 1);
  return Math.min(days, BACKOFF_MAX_DAYS);
}

/**
 * Whether advice is currently suppressed by dismissal backoff. A deload dated
 * AFTER the last dismissal resets the backoff (the situation changed).
 */
export function isSuppressedByDismissal(
  dismissal: FatigueDismissalState | null | undefined,
  lastDeloadAt: string | null | undefined,
  now: string | Date,
): boolean {
  if (!dismissal || !dismissal.lastDismissedAt) return false;
  const dismissedMs = Date.parse(dismissal.lastDismissedAt);
  if (Number.isNaN(dismissedMs)) return false;
  if (lastDeloadAt) {
    const deloadMs = Date.parse(lastDeloadAt);
    if (!Number.isNaN(deloadMs) && deloadMs > dismissedMs) return false; // reset
  }
  const nowMs = toMs(now);
  if (Number.isNaN(nowMs)) return false;
  const backoffMs = dismissalBackoffDays(dismissal.consecutiveDismissals) * DAY_MS;
  return nowMs - dismissedMs < backoffMs;
}

/** Next persisted state after the user dismisses the card. */
export function nextDismissalState(
  prev: FatigueDismissalState | null | undefined,
  dismissedAt: string,
): FatigueDismissalState {
  return {
    lastDismissedAt: dismissedAt,
    consecutiveDismissals: (prev && prev.consecutiveDismissals > 0 ? prev.consecutiveDismissals : 0) + 1,
  };
}

/** Next persisted state after the user ACCEPTS a proposal (backoff resets). */
export function acceptedDismissalState(): FatigueDismissalState {
  return { lastDismissedAt: null, consecutiveDismissals: 0 };
}

function sanitize(series: ReadinessDay[], nowMs: number): Array<{ ms: number; score: number | null }> {
  return (series || [])
    .map((d) => ({ ms: Date.parse(d && d.date ? d.date : ''), score: d ? d.score : null }))
    .filter(
      (d) =>
        !Number.isNaN(d.ms) &&
        d.ms <= nowMs &&
        (d.score == null || (Number.isFinite(d.score) && d.score >= 0 && d.score <= 100)),
    )
    .sort((a, b) => a.ms - b.ms);
}

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

/**
 * Compute the (at most one) plan-adjustment proposal for the current moment.
 * Returns null when nothing fires, data is insufficient, or the card is in
 * dismissal backoff. First matching rule wins: FT-D1 outranks FT-V1.
 */
export function suggestPlanAdjustment(
  readiness: ReadinessDay[],
  config: FatigueConfig,
): FatigueAdvice | null {
  const nowMs = toMs(config.now);
  if (Number.isNaN(nowMs)) return null;

  if (isSuppressedByDismissal(config.dismissal, config.lastDeloadAt, config.now)) return null;

  const days = sanitize(readiness, nowMs);
  if (days.length === 0) return null;
  const scored = days.filter((d) => d.score != null) as Array<{ ms: number; score: number }>;
  if (scored.length === 0) return null;

  // ---- FT-D1: sustained low weekly readiness → pull the deload forward ----
  const weekScored = scored.filter((d) => nowMs - d.ms <= 7 * DAY_MS);
  if (weekScored.length >= MIN_SCORED_DAYS_WEEK) {
    const mean = weekScored.reduce((s, d) => s + d.score, 0) / weekScored.length;
    if (mean < LOW_WEEK_MEAN) {
      let deloadOk = false;
      let deloadLine = '';
      const deloadMs = config.lastDeloadAt ? Date.parse(config.lastDeloadAt) : NaN;
      if (!Number.isNaN(deloadMs)) {
        const weeksSince = Math.floor((nowMs - deloadMs) / (7 * DAY_MS));
        if (weeksSince >= MIN_WEEKS_SINCE_DELOAD) {
          deloadOk = true;
          deloadLine = `your last deload was ${weeksSince} weeks ago`;
        }
      } else {
        const oldest = days[0];
        const spanDays = oldest ? (nowMs - oldest.ms) / DAY_MS : 0;
        if (spanDays >= MIN_HISTORY_SPAN_DAYS) {
          deloadOk = true;
          deloadLine = 'no deload is on record';
        }
      }
      if (deloadOk) {
        const meanRounded = Math.round(mean);
        return {
          rule_id: 'FT-D1',
          action: 'pull_deload_forward',
          because: `engine rule FT-D1: readiness has averaged ${meanRounded} over the last 7 days (${weekScored.length} scored days, threshold ${LOW_WEEK_MEAN}) and ${deloadLine} — consider pulling your deload forward.`,
        };
      }
    }
  }

  // ---- FT-V1: N consecutive low readiness days → trim accessory volume ----
  const recentScored = scored.filter((d) => nowMs - d.ms <= VOLUME_WINDOW_DAYS * DAY_MS);
  if (recentScored.length >= CONSEC_LOW_SESSIONS) {
    const lastN = recentScored.slice(-CONSEC_LOW_SESSIONS);
    if (lastN.every((d) => d.score < LOW_SESSION_SCORE)) {
      const list = lastN.map((d) => Math.round(d.score)).join(', ');
      return {
        rule_id: 'FT-V1',
        action: 'trim_accessory_volume',
        trim_pct: TRIM_PCT,
        because: `engine rule FT-V1: your last ${CONSEC_LOW_SESSIONS} readiness scores (${list}) are all under ${LOW_SESSION_SCORE} — consider trimming accessory volume about ${TRIM_PCT}% next session.`,
      };
    }
  }

  return null;
}
