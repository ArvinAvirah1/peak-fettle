/**
 * Share-card milestone helper — TICKET-120.
 *
 * Extends the engine/streaks MILESTONES (7 / 30 / 100 / 365) with 66 days
 * (Lally 2010 mean habit-formation estimate) as a celebratory-only milestone.
 * The extra milestone is share-feature-only: it is NOT fed back into the core
 * streak engine, which owns its own MILESTONES tuple.
 *
 * Pure module — no React, no DB, no side effects; safe in @babel sweep.
 */

import { MILESTONES } from '../../engine/streaks';

/** All share-card milestone values, descending (highest first for easy lookup). */
export const SHARE_MILESTONES = [365, 100, 66, 30, 7] as const;
export type ShareMilestone = (typeof SHARE_MILESTONES)[number];

/** Labels shown on the share card for each milestone. */
export const MILESTONE_LABELS: Record<ShareMilestone, string> = {
  365: '1 Year',
  100: '100 Days',
  66: '66 Days',
  30: '30 Days',
  7: '7 Days',
};

/** Celebratory copy for each milestone (CONTENT_SAFETY: no loss-framing, no shaming). */
export const MILESTONE_COPY: Record<ShareMilestone, { heading: string; sub: string }> = {
  365: {
    heading: 'A full year of showing up.',
    sub: 'That is consistency worth celebrating.',
  },
  100: {
    heading: '100 days of building something real.',
    sub: 'This is what commitment looks like.',
  },
  66: {
    heading: '66 days — habits are forming.',
    sub: 'Research suggests this is where things click.',
  },
  30: {
    heading: '30 days in.',
    sub: 'One month of showing up every day.',
  },
  7: {
    heading: 'A full week of momentum.',
    sub: 'Seven days of building something.',
  },
};

/**
 * Returns the highest share milestone just crossed when `currentStreak`
 * reaches exactly that value; returns null otherwise.
 *
 * "Just crossed" means `previousStreak < milestone <= currentStreak` —
 * the affordance fires once at the crossing point, not on every subsequent day.
 */
export function milestoneCrossed(
  previousStreak: number,
  currentStreak: number
): ShareMilestone | null {
  for (const m of SHARE_MILESTONES) {
    if (previousStreak < m && currentStreak >= m) {
      return m;
    }
  }
  return null;
}

// Re-export the engine MILESTONES so callers can import from one place.
export { MILESTONES };
