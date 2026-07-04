/**
 * badgeDefs — TICKET-143: static achievement/badge catalogue.
 *
 * Pure data — no DB access, no React. ~20 badges v1 across the ticket's named
 * dimensions: workout count, streak weeks, PR count, total volume, group
 * participation, program completion. Each badge's `rule` is a short, honest,
 * user-facing description (shown for LOCKED badges too — "locked show their
 * rule", not a mystery box).
 *
 * COSMETIC GRANTS (coordinate with the 2026-06-19 cosmetic-gating fix):
 *   `cosmeticItemId` is OPTIONAL. When present, earning the badge calls the
 *   EXISTING `grantCosmetic(userId, itemId, 'streak')` ledger function
 *   (mobile/src/data/cosmeticUnlocks.ts) — the SAME function already used for
 *   streak-milestone celebrations. This is a permanent "banked ownership"
 *   record, NOT a new unlock-check bypass: `isUnlocked()` (the live
 *   streak/Pro gate that actually controls what a user can EQUIP) is
 *   untouched by this ticket and still governs equip-ability exactly as it
 *   did before. Every `cosmeticItemId` below is chosen to be an id that is
 *   ALREADY reachable through the existing streak ladder in
 *   peakAvatarOptions.ts's COSMETIC_TIERS (7/30/100-day items) — so a badge
 *   grant never contradicts the live gate; it MIRRORS a milestone the user
 *   has independently reached (workout-count/PR/volume badges tend to
 *   correlate with streak length) and permanently banks it via the ledger so
 *   it survives a later streak reset (exactly the use case `grantCosmetic`'s
 *   own docstring describes). No new bypass surface is introduced.
 *
 * RULE SHAPE: every rule is evaluated by badgeEvaluator.ts against existing
 * local tables ONLY (workouts, sets, exercise_prs, streaks, generated_plans,
 * plus the device-local active-group-id registry for "group participation").
 * Evaluation takes `now`/inputs as parameters — no Date.now()/Math.random()
 * inside a rule (Workflow lint + CLAUDE.md code rules).
 */

export type BadgeCategory =
  | 'workout_count'
  | 'streak'
  | 'pr_count'
  | 'total_volume'
  | 'group_participation'
  | 'program_completion';

export interface BadgeDef {
  id: string;
  name: string;
  category: BadgeCategory;
  /** Short, honest, user-facing description of the unlock rule (shown even when locked). */
  rule: string;
  /** The numeric threshold the evaluator checks the relevant metric against. */
  threshold: number;
  /** Optional cosmetic item id granted via the EXISTING cosmeticUnlocks.grantCosmetic path. */
  cosmeticItemId?: string;
}

export const BADGE_DEFS: BadgeDef[] = [
  // ── Workout count ──────────────────────────────────────────────────────
  {
    id: 'workouts_1',
    name: 'First Rep',
    category: 'workout_count',
    rule: 'Log your first workout.',
    threshold: 1,
  },
  {
    id: 'workouts_10',
    name: 'Getting Started',
    category: 'workout_count',
    rule: 'Log 10 workouts.',
    threshold: 10,
  },
  {
    id: 'workouts_50',
    name: 'Regular',
    category: 'workout_count',
    rule: 'Log 50 workouts.',
    threshold: 50,
    cosmeticItemId: 'compression', // { streak: 7 } outfit — reachable via the existing ladder
  },
  {
    id: 'workouts_100',
    name: 'Committed',
    category: 'workout_count',
    rule: 'Log 100 workouts.',
    threshold: 100,
    cosmeticItemId: 'hoodie', // { streak: 30 } outfit
  },
  {
    id: 'workouts_250',
    name: 'Iron Habit',
    category: 'workout_count',
    rule: 'Log 250 workouts.',
    threshold: 250,
    cosmeticItemId: 'zipUp', // { streak: 30 } outfit
  },
  {
    id: 'workouts_500',
    name: 'Lifer',
    category: 'workout_count',
    rule: 'Log 500 workouts.',
    threshold: 500,
  },

  // ── Streak weeks (current OR longest streak, in whole weeks) ───────────
  {
    id: 'streak_1_week',
    name: 'One Week In',
    category: 'streak',
    rule: 'Reach a 7-day streak.',
    threshold: 1,
    cosmeticItemId: 'sweatband', // { streak: 7 } headwear
  },
  {
    id: 'streak_4_weeks',
    name: 'Monthly Momentum',
    category: 'streak',
    rule: 'Reach a 28-day streak.',
    threshold: 4,
    cosmeticItemId: 'snapback', // { streak: 30 } headwear
  },
  {
    id: 'streak_12_weeks',
    name: 'Quarter Strong',
    category: 'streak',
    rule: 'Reach an 84-day streak.',
    threshold: 12,
  },
  {
    id: 'streak_26_weeks',
    name: 'Half-Year Habit',
    category: 'streak',
    rule: 'Reach a 182-day streak.',
    threshold: 26,
    cosmeticItemId: 'undercut', // { streak: 100 } hair
  },
  {
    id: 'streak_52_weeks',
    name: 'Full Year',
    category: 'streak',
    rule: 'Reach a 364-day streak.',
    threshold: 52,
  },

  // ── PR count (distinct exercise_prs rows — one per exercise+rep-count) ─
  {
    id: 'prs_5',
    name: 'Record Setter',
    category: 'pr_count',
    rule: 'Set 5 personal records.',
    threshold: 5,
  },
  {
    id: 'prs_20',
    name: 'Record Breaker',
    category: 'pr_count',
    rule: 'Set 20 personal records.',
    threshold: 20,
    cosmeticItemId: 'aviator', // { streak: 7 } glasses
  },
  {
    id: 'prs_50',
    name: 'Record Collector',
    category: 'pr_count',
    rule: 'Set 50 personal records.',
    threshold: 50,
    cosmeticItemId: 'stars', // { streak: 7 } eyes
  },
  {
    id: 'prs_100',
    name: 'PR Machine',
    category: 'pr_count',
    rule: 'Set 100 personal records.',
    threshold: 100,
    cosmeticItemId: 'fire', // { streak: 30 } eyes
  },

  // ── Total volume (lifetime, kg, across all logged lift sets) ───────────
  {
    id: 'volume_10000',
    name: 'Ten Tonnes',
    category: 'total_volume',
    rule: 'Lift 10,000 kg total volume.',
    threshold: 10_000,
  },
  {
    id: 'volume_100000',
    name: 'Hundred Tonnes',
    category: 'total_volume',
    rule: 'Lift 100,000 kg total volume.',
    threshold: 100_000,
    cosmeticItemId: 'dreadlocks', // { streak: 7 } hair
  },
  {
    id: 'volume_1000000',
    name: 'Million Kilo Club',
    category: 'total_volume',
    rule: 'Lift 1,000,000 kg total volume.',
    threshold: 1_000_000,
    cosmeticItemId: 'crownGold', // 'pro' headwear — Pro users only get this grant
  },

  // ── Group participation (device-local: at least N joined groups) ──────
  {
    id: 'group_joined_1',
    name: 'Joined the Group',
    category: 'group_participation',
    rule: 'Join a group.',
    threshold: 1,
  },
  {
    id: 'group_joined_3',
    name: 'Community Builder',
    category: 'group_participation',
    rule: 'Join 3 groups.',
    threshold: 3,
  },

  // ── Program completion (generated_plans reaching an adopted/complete state) ──
  {
    id: 'program_completed_1',
    name: 'Program Finisher',
    category: 'program_completion',
    rule: 'Complete a full training program.',
    threshold: 1,
    cosmeticItemId: 'handlebar', // { streak: 7 } facial hair
  },
  {
    id: 'program_completed_3',
    name: 'Serial Finisher',
    category: 'program_completion',
    rule: 'Complete 3 full training programs.',
    threshold: 3,
    cosmeticItemId: 'vikingBeard', // { streak: 30 } facial hair
  },
];

/** Fast id -> BadgeDef lookup, built once at module load. */
export const BADGE_DEFS_BY_ID: Record<string, BadgeDef> = Object.fromEntries(
  BADGE_DEFS.map((b) => [b.id, b]),
);
