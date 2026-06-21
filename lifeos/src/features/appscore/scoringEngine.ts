/**
 * scoringEngine — TICKET-122: App Wellbeing Scoring.
 *
 * INDEPENDENT formula (not derived from any third-party "Digital Dopamine"
 * or similar product methodology). Computes a plain additive index on-device.
 *
 * ---
 * FORMULA — Weighted Engagement Quality Index (WEQI):
 *
 *   For each rated app i with usage minutes U_i and rating R_i:
 *     contribution_i = direction(R_i) × ln(1 + U_i)
 *
 *   where direction():
 *     'energizing' → +1
 *     'neutral'    →  0
 *     'draining'   → -1
 *
 *   Raw score S = Σ contribution_i
 *
 *   The log transform dampens extreme outliers (e.g. 600-minute sessions don't
 *   dominate trivially short sessions). Unrated apps contribute 0 (neutral
 *   default). The result is an unbounded real number — positive = net
 *   energizing week, negative = net draining week, zero = balanced.
 *
 *   Display: rounded to one decimal place, shown with a numeral + text label.
 *   Copy is always informational, never judgmental (CONTENT_SAFETY §3).
 *
 * NOTE: "usage minutes" in v1 is a stub (FamilyActivityReport is not yet
 * bridged in JS). Pass 0 for all apps to get a usage-agnostic rating-only
 * score, which still gives meaningful +/- direction.
 * ---
 */

import type { AppRatingRow } from './appRatingsDb';

export interface ScoredApp {
  tokenLabel: string;
  rating: AppRatingRow['rating'];
  usageMinutes: number;
  contribution: number;
}

export interface WeeklyScore {
  /** The composite index value (positive = energizing balance). */
  index: number;
  /** Short human-readable label e.g. "Energizing balance". */
  label: string;
  /** Count of rated apps that contributed positively. */
  energizingCount: number;
  /** Count of rated apps that contributed negatively. */
  drainingCount: number;
  /** Total rated apps included. */
  totalRated: number;
  /** Per-app breakdown for display. */
  breakdown: ScoredApp[];
}

function ratingDirection(rating: AppRatingRow['rating']): number {
  if (rating === 'energizing') return 1;
  if (rating === 'draining') return -1;
  return 0;
}

/**
 * Pure scoring function — no I/O, no side effects, no Date.now().
 *
 * @param ratings  - All rated app rows from lo_app_ratings.
 * @param usageMap - Map from token_label → usage minutes this week.
 *                   Missing keys default to 0 (rating-only contribution).
 */
export function computeWeeklyScore(
  ratings: AppRatingRow[],
  usageMap: Map<string, number>
): WeeklyScore {
  const breakdown: ScoredApp[] = ratings.map((row) => {
    const usageMinutes = usageMap.get(row.token_label) ?? 0;
    const contribution = ratingDirection(row.rating) * Math.log1p(usageMinutes);
    return {
      tokenLabel: row.token_label,
      rating: row.rating,
      usageMinutes,
      contribution,
    };
  });

  const index = breakdown.reduce((sum, b) => sum + b.contribution, 0);
  const energizingCount = breakdown.filter((b) => b.rating === 'energizing').length;
  const drainingCount = breakdown.filter((b) => b.rating === 'draining').length;

  const label = scoreLabel(index, energizingCount, drainingCount);

  return {
    index: Math.round(index * 10) / 10,
    label,
    energizingCount,
    drainingCount,
    totalRated: ratings.length,
    breakdown,
  };
}

/** Map a numeric index to a plain, non-judgmental label. */
function scoreLabel(index: number, energizing: number, draining: number): string {
  if (energizing === 0 && draining === 0) return 'No ratings yet';
  if (index > 1) return 'Energizing balance';
  if (index > 0) return 'Slightly energizing';
  if (index === 0) return 'Balanced';
  if (index > -1) return 'Mixed';
  return 'More draining apps this week';
}

/** Convenience: rating-only score when usage data is unavailable (v1 default). */
export function computeRatingOnlyScore(ratings: AppRatingRow[]): WeeklyScore {
  return computeWeeklyScore(ratings, new Map());
}
