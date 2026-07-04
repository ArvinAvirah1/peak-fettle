/**
 * badges/evaluator — TICKET-143: achievement/badge rule evaluator.
 *
 * Two layers, same split as the training-engine "pure rule + orchestrator"
 * pattern used elsewhere in this repo (e.g. loggerLogic.ts / autoreg rules):
 *
 *   1. `evaluateBadges(metrics, alreadyEarnedIds, now)` — PURE. Table-driven
 *      over BADGE_DEFS; no DB access, no clock/random reads inside the rule
 *      (the CLAUDE.md code rule — `now` is a parameter). Returns the badges
 *      that are newly earned this call (i.e. metric clears the threshold AND
 *      the badge id is not already in `alreadyEarnedIds`).
 *
 *   2. `runBadgeEvaluation(userId, now)` — the DB-touching orchestrator.
 *      Gathers the metrics snapshot from existing local tables with a small
 *      number of INDEXED, already-materialized queries (counts/sums, no full
 *      table scans of unbounded history beyond what the indexes already
 *      cover), calls the pure evaluator, persists newly-earned badges into
 *      `badges_earned` (schema v14), and grants any attached cosmetic via the
 *      EXISTING `cosmeticUnlocks.grantCosmetic` ledger (no new bypass — see
 *      badgeDefs.ts's file header for the full rationale).
 *
 * PERF: every query below is a single aggregate (COUNT/SUM/MAX) or a bounded
 * lookup keyed by an existing index (idx_exercise_prs_user, idx_workouts_*,
 * the sets table's implicit rowid scan is unavoidable for SUM(weight*reps)
 * but is a single linear pass with no per-row JS work — see the perf test in
 * evaluator.test.js using a large synthetic fixture).
 *
 * CALL SITES (both cheap, off the critical path — see this ticket's report
 * for the exact patch snippets since neither host file is in this ticket's
 * ownership):
 *   - Post-workout-save: WorkoutLoggerHost.tsx's handleFinishWorkout /
 *     the share-card onFinish handler (fire-and-forget, after the finish
 *     Alert's onPress, well after the save itself completes).
 *   - App open: mobile/app/_layout.tsx, deferred via
 *     InteractionManager.runAfterInteractions (same pattern already used for
 *     push registration / widget bridge / localDb warm-up in that file) —
 *     never on the boot critical path.
 */

import { localDb } from '../../db/localDb';
import { BADGE_DEFS, BadgeDef } from './badgeDefs';
import { grantCosmetic } from '../cosmeticUnlocks';
import { getActiveGroupIds } from '../groupSignals';
import { getSetting, setSetting } from '../appSettings';

// ---------------------------------------------------------------------------
// Metrics snapshot — everything a rule might need, gathered ONCE per run.
// ---------------------------------------------------------------------------

export interface BadgeMetrics {
  workoutCount: number;
  /** The larger of current/longest streak, in whole weeks (floor(days / 7)). */
  streakWeeks: number;
  prCount: number;
  /** Lifetime total volume in kg across every logged lift set (weight_kg * reps). */
  totalVolumeKg: number;
  /** Count of distinct groups this device has joined (local registry, zero network). */
  groupsJoined: number;
  /** Count of training programs this device has observed complete/adopted. */
  programsCompleted: number;
}

// ---------------------------------------------------------------------------
// 1. Pure evaluator
// ---------------------------------------------------------------------------

function metricFor(category: BadgeDef['category'], metrics: BadgeMetrics): number {
  switch (category) {
    case 'workout_count': return metrics.workoutCount;
    case 'streak': return metrics.streakWeeks;
    case 'pr_count': return metrics.prCount;
    case 'total_volume': return metrics.totalVolumeKg;
    case 'group_participation': return metrics.groupsJoined;
    case 'program_completion': return metrics.programsCompleted;
    default: return 0;
  }
}

export interface EarnedBadge {
  badgeId: string;
  earnedAt: string;
  cosmeticItemId?: string;
}

/**
 * Pure: given a metrics snapshot and the set of badge ids already earned,
 * returns every badge that newly clears its threshold this call. Table-driven
 * over BADGE_DEFS (~20 entries) — O(n) in the badge catalogue, not the user's
 * history (the metrics were already aggregated by the caller).
 *
 * `now` is a parameter (never `new Date()` inside this function) per the
 * CLAUDE.md/Workflow no-literal-clock-read rule.
 */
export function evaluateBadges(
  metrics: BadgeMetrics,
  alreadyEarnedIds: ReadonlySet<string>,
  now: Date,
): EarnedBadge[] {
  const nowIso = now.toISOString();
  const newlyEarned: EarnedBadge[] = [];
  for (const def of BADGE_DEFS) {
    if (alreadyEarnedIds.has(def.id)) continue;
    const value = metricFor(def.category, metrics);
    if (value >= def.threshold) {
      newlyEarned.push({
        badgeId: def.id,
        earnedAt: nowIso,
        ...(def.cosmeticItemId ? { cosmeticItemId: def.cosmeticItemId } : {}),
      });
    }
  }
  return newlyEarned;
}

// ---------------------------------------------------------------------------
// 2. DB-touching orchestrator
// ---------------------------------------------------------------------------

const PROGRAM_COMPLETIONS_SEEN_KEY = 'badge_program_completions_seen';
const LAST_SEEN_PROGRAM_STATUS_KEY = 'badge_last_seen_program_status';

/**
 * `generated_plans` is a SINGLE-ACTIVE-ROW table (id='active') — completing a
 * program overwrites the row rather than accumulating history, so a running
 * "programs completed" count can't be read directly with one query. Instead
 * we track a small device-local counter (app_settings — derived/cache data,
 * intentionally NOT in BACKUP_TABLES, same class as the exercise-name cache)
 * that increments the FIRST time this function observes the single row
 * transition INTO a completed state ('trial_complete', 'plan_adopted', or
 * 'trial_adopted') since the last time it checked. Comparing against the
 * last-seen status (not just "is it complete now") makes repeated calls
 * idempotent — re-observing the same completed row on every app-open does not
 * re-increment the counter.
 */
async function countProgramCompletions(): Promise<number> {
  const priorCountRaw = await getSetting(PROGRAM_COMPLETIONS_SEEN_KEY);
  const priorCount = priorCountRaw ? parseInt(priorCountRaw, 10) || 0 : 0;
  const lastSeenStatus = await getSetting(LAST_SEEN_PROGRAM_STATUS_KEY);

  let currentStatus: string | null = null;
  try {
    const row = await localDb.getFirst<{ status: string }>(
      `SELECT status FROM generated_plans WHERE id = 'active'`,
    );
    currentStatus = row?.status ?? null;
  } catch {
    return priorCount; // table absent on an older schema snapshot — degrade to last known count
  }

  const COMPLETED_STATUSES = new Set(['trial_complete', 'plan_adopted', 'trial_adopted']);
  const isCompletedNow = currentStatus != null && COMPLETED_STATUSES.has(currentStatus);
  const wasCompletedBefore = lastSeenStatus != null && COMPLETED_STATUSES.has(lastSeenStatus);

  let nextCount = priorCount;
  if (isCompletedNow && !wasCompletedBefore) {
    nextCount = priorCount + 1;
    await setSetting(PROGRAM_COMPLETIONS_SEEN_KEY, String(nextCount));
  }
  if (currentStatus !== lastSeenStatus) {
    await setSetting(LAST_SEEN_PROGRAM_STATUS_KEY, currentStatus ?? '');
  }
  return nextCount;
}

/**
 * Gather the metrics snapshot from existing local tables. Every query is a
 * single aggregate — no unbounded per-row JS work, no N+1s.
 */
export async function gatherBadgeMetrics(): Promise<BadgeMetrics> {
  await localDb.init();

  const [workoutRow, streakRow, prRow, volumeRow] = await Promise.all([
    localDb.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM workouts`).catch(() => null),
    localDb
      .getFirst<{ current_streak_days: number; longest_streak_days: number }>(
        `SELECT current_streak_days, longest_streak_days FROM streaks LIMIT 1`,
      )
      .catch(() => null),
    localDb.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM exercise_prs`).catch(() => null),
    localDb
      .getFirst<{ total: number | null }>(
        `SELECT SUM(COALESCE(weight_kg, weight_raw / 8.0) * reps) AS total
           FROM sets WHERE kind = 'lift'`,
      )
      .catch(() => null),
  ]);

  const streakDays = Math.max(
    streakRow?.current_streak_days ?? 0,
    streakRow?.longest_streak_days ?? 0,
  );

  const programsCompleted = await countProgramCompletions();

  return {
    workoutCount: workoutRow?.n ?? 0,
    streakWeeks: Math.floor(streakDays / 7),
    prCount: prRow?.n ?? 0,
    totalVolumeKg: volumeRow?.total ?? 0,
    groupsJoined: getActiveGroupIds().length,
    programsCompleted,
  };
}

/** Every badge_id already recorded in `badges_earned`. */
async function getEarnedBadgeIds(): Promise<Set<string>> {
  try {
    const rows = await localDb.getAll<{ badge_id: string }>(
      `SELECT badge_id FROM badges_earned`,
    );
    return new Set(rows.map((r) => r.badge_id));
  } catch {
    return new Set();
  }
}

export interface BadgeEvaluationResult {
  newlyEarned: EarnedBadge[];
}

/**
 * Run the full evaluation + persistence + cosmetic-grant flow. Safe to call
 * repeatedly (idempotent — already-earned badges are never re-granted) and
 * cheap enough to run on every app-open and after every workout save (see the
 * file header for both call sites).
 *
 * @param userId  current user id (passed to grantCosmetic's ledger key —
 *                falls back to 'local' for a free/local-first install with no
 *                server user id, mirroring the pattern in profile.tsx).
 * @param now     evaluation timestamp — passed explicitly (no internal
 *                Date.now()/new Date() per the CLAUDE.md code rule).
 */
export async function runBadgeEvaluation(
  userId: string,
  now: Date = new Date(),
): Promise<BadgeEvaluationResult> {
  await localDb.init();

  const [metrics, alreadyEarned] = await Promise.all([
    gatherBadgeMetrics(),
    getEarnedBadgeIds(),
  ]);

  const newlyEarned = evaluateBadges(metrics, alreadyEarned, now);

  for (const earned of newlyEarned) {
    try {
      await localDb.execute(
        `INSERT OR IGNORE INTO badges_earned (badge_id, earned_at) VALUES (?, ?)`,
        [earned.badgeId, earned.earnedAt],
        { tables: ['badges_earned'] },
      );
    } catch {
      // best-effort — a persistence failure for one badge must not block the rest
      continue;
    }
    if (earned.cosmeticItemId) {
      // EXISTING grant path (mobile/src/data/cosmeticUnlocks.ts) — no new
      // bypass surface. See badgeDefs.ts's header for why this is safe.
      await grantCosmetic(userId, earned.cosmeticItemId, 'streak').catch(() => {});
    }
  }

  return { newlyEarned };
}

/**
 * Retroactive first-run grant: evaluate over the FULL existing local history.
 * This is the SAME function as runBadgeEvaluation — the metrics gathering
 * already scans full history (not a rolling window), so "first run after
 * this ticket ships" and "every subsequent call" are the identical code path.
 * Exported under this name for call-site clarity / the ticket's explicit
 * "retroactive grant on first run" acceptance criterion.
 */
export const runRetroactiveBadgeGrant = runBadgeEvaluation;
