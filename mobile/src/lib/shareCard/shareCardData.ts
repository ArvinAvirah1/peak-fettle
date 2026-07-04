/**
 * shareCardData — TICKET-131 (shareable workout summary cards)
 *
 * Pure data-shaping module for the share card. Takes already-loaded workout
 * data (from whichever screen is sharing — workout-finish flow or a past
 * workout-day) and produces the exact display strings the card renders.
 *
 * Rules followed (CLAUDE.md, binding):
 *   - Weight is displayed ONLY via mobile/src/constants/units.ts helpers
 *     (formatWeight) — never a raw kg/lbs literal.
 *   - No direct clock or random reads: every function that needs "now" takes
 *     it as an explicit parameter (nowMs) rather than calling Date.now()/
 *     new Date() internally — the Workflow static lint rejects the latter
 *     even inside comments, and it also keeps this module trivially testable.
 *   - Zero network, zero DB access — this module is pure transformation only;
 *     callers (ShareCardSheet) are responsible for reading local SQLite via
 *     the existing tier-branched data layer / hooks.
 */

import { formatWeight, UnitSystem } from '../../constants/units';
import { FlexLineResult } from './shareCardPercentile';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One PR badge — a lift that hit a new all-time best in this workout. */
export interface ShareCardPrBadge {
  exerciseName: string;
  e1rmKg: number;
  /** Positive delta vs the prior best, in kg (converted to display unit by the card). */
  deltaKg: number;
}

export interface ShareCardInput {
  /** Workout / routine name, e.g. "Push Day" or "Free session". Falsy → "Workout". */
  workoutName: string | null | undefined;
  /** Session date as a day-key (YYYY-MM-DD), parsed in LOCAL time for display. */
  dayKey: string;
  /** Session duration in seconds. Null/undefined → duration line omitted. */
  durationSec: number | null | undefined;
  /** Total volume across all lift sets, in exact kg. */
  totalVolumeKg: number;
  /** Total set count (lift + cardio). */
  setCount: number;
  /** Current week-streak (from useStreak/useLocalStreak) — 0 hides the streak line. */
  streakWeeks: number;
  /** PR badges earned in this session (from the existing PR table/e1RM comparison). */
  prBadges: ShareCardPrBadge[];
  /** The user's display unit preference. */
  unitPref: UnitSystem;
  /** Opt-in percentile flex line, or null when the toggle is off / unavailable. */
  flexLine: FlexLineResult | null;
}

// ---------------------------------------------------------------------------
// Output — every field is a ready-to-render string
// ---------------------------------------------------------------------------

export interface ShareCardDisplay {
  title: string;
  dateLabel: string;
  durationLabel: string | null;
  volumeLabel: string;
  setCountLabel: string;
  streakLabel: string | null;
  prBadgeLabels: string[];
  flexLineLabel: string | null;
}

const LONG_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * "May 18, 2026" from a YYYY-MM-DD day-key, parsed in local time (avoids the
 * UTC-offset date-shift bug the rest of the app already guards against).
 */
export function formatDayKeyForCard(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dayKey;
  return `${LONG_MONTHS[(month as number) - 1]} ${day}, ${year}`;
}

/** "42:17" (mm:ss) or "1:02:17" (h:mm:ss) for durations at/over an hour. */
export function formatDurationForCard(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Build every display string the ShareCardSheet renders. Pure — safe to unit
 * test without React or SQLite.
 */
export function buildShareCardDisplay(input: ShareCardInput): ShareCardDisplay {
  const title = input.workoutName && input.workoutName.trim().length > 0
    ? input.workoutName.trim()
    : 'Workout';

  const dateLabel = formatDayKeyForCard(input.dayKey);

  const durationLabel = input.durationSec != null && input.durationSec > 0
    ? formatDurationForCard(input.durationSec)
    : null;

  const volumeLabel = formatWeight(input.totalVolumeKg, input.unitPref, 0);

  const setCountLabel = `${input.setCount} set${input.setCount === 1 ? '' : 's'}`;

  const streakLabel = input.streakWeeks > 0
    ? `${input.streakWeeks} week${input.streakWeeks === 1 ? '' : 's'} strong`
    : null;

  const prBadgeLabels = input.prBadges.map((pr) => {
    const weightLabel = formatWeight(pr.e1rmKg, input.unitPref, 1);
    const deltaLabel = pr.deltaKg > 0 ? ` (+${formatWeight(pr.deltaKg, input.unitPref, 1)})` : '';
    return `PR · ${pr.exerciseName} ${weightLabel} e1RM${deltaLabel}`;
  });

  const flexLineLabel = input.flexLine?.headline ?? null;

  return {
    title,
    dateLabel,
    durationLabel,
    volumeLabel,
    setCountLabel,
    streakLabel,
    prBadgeLabels,
    flexLineLabel,
  };
}
