-- 20260612 — Purge free-tier users' personal training data from the server.
--
--   ⚠️  FOUNDER-GATED + DESTRUCTIVE.  APPLY ONLY AFTER:
--       1. A fresh prod backup is taken (pg_dump) and verified restorable.
--       2. The local-first EAS build is live and free users' data is confirmed
--          to be persisting on-device (so the server copy is genuinely redundant).
--       3. You have run STEP 1 (preview) below and accepted the row counts.
--
--   Decision (founder, 2026-06-12): the server stores sets/reps ONLY for PRO
--   (tier='paid') users, for cross-device sync. Free users are local-first; their
--   personal training rows on the server are stale duplicates and should be removed.
--
--   "Free" here means users.tier <> 'paid' (covers 'free' and any NULL/legacy).
--   Paid users and all shared/reference data (exercises, lift_vectors, groups,
--   cosmetics catalog, etc.) are untouched.
--
--   This file does NOT delete user accounts, group memberships, oauth identities,
--   or cosmetics ownership — only personal TRAINING data.

-- ===========================================================================
-- STEP 1 — PREVIEW (read-only).  Run this alone first and sanity-check counts.
-- ===========================================================================
-- SELECT
--   (SELECT count(*) FROM users WHERE tier <> 'paid' OR tier IS NULL)                                                AS free_users,
--   (SELECT count(*) FROM sets        s WHERE s.user_id IN (SELECT id FROM users WHERE tier <> 'paid' OR tier IS NULL)) AS free_sets,
--   (SELECT count(*) FROM workouts    w WHERE w.user_id IN (SELECT id FROM users WHERE tier <> 'paid' OR tier IS NULL)) AS free_workouts,
--   (SELECT count(*) FROM exercise_prs p WHERE p.user_id IN (SELECT id FROM users WHERE tier <> 'paid' OR tier IS NULL)) AS free_prs;

-- ===========================================================================
-- STEP 2 — PURGE.  Runs in a single transaction. If counts look wrong, the
--          DO block RAISES and the whole thing rolls back. Review the NOTICEs,
--          then this COMMITs automatically when run as a whole.
-- ===========================================================================
BEGIN;

DO $$
DECLARE
  n_users    BIGINT;
  n_sets     BIGINT;
  n_workouts BIGINT;
BEGIN
  SELECT count(*) INTO n_users    FROM users WHERE tier <> 'paid' OR tier IS NULL;
  SELECT count(*) INTO n_sets     FROM sets     WHERE user_id IN (SELECT id FROM users WHERE tier <> 'paid' OR tier IS NULL);
  SELECT count(*) INTO n_workouts FROM workouts WHERE user_id IN (SELECT id FROM users WHERE tier <> 'paid' OR tier IS NULL);
  RAISE NOTICE 'Purging training data for % free users: % sets, % workouts (+ derived rows).',
    n_users, n_sets, n_workouts;

  -- Optional guardrail: refuse to run if it would wipe an implausibly large share
  -- of ALL data (e.g. tier column never populated -> everyone looks "free").
  IF (SELECT count(*) FROM users WHERE tier = 'paid') = 0
     AND (SELECT count(*) FROM users) > 0 THEN
    RAISE EXCEPTION 'Aborting: zero paid users found. Verify users.tier is populated before purging.';
  END IF;
END $$;

-- Free-user id set, materialized once.
CREATE TEMP TABLE _free_uids ON COMMIT DROP AS
  SELECT id FROM users WHERE tier <> 'paid' OR tier IS NULL;

-- Delete children first where there is no ON DELETE CASCADE chain we can rely on.
-- sets cascade from workouts, but delete explicitly to be unambiguous.
DELETE FROM sets                     WHERE user_id IN (SELECT id FROM _free_uids);
DELETE FROM exercise_prs             WHERE user_id IN (SELECT id FROM _free_uids);
DELETE FROM user_confirmed_1rm       WHERE user_id IN (SELECT id FROM _free_uids);
DELETE FROM user_percentile_rankings WHERE user_id IN (SELECT id FROM _free_uids);
DELETE FROM daily_health_metrics     WHERE user_id IN (SELECT id FROM _free_uids);
DELETE FROM daily_health_log         WHERE user_id IN (SELECT id FROM _free_uids);
DELETE FROM user_weekly_goals        WHERE user_id IN (SELECT id FROM _free_uids);
DELETE FROM user_constraints         WHERE user_id IN (SELECT id FROM _free_uids);
DELETE FROM streak_overrides         WHERE user_id IN (SELECT id FROM _free_uids);
DELETE FROM streaks                  WHERE user_id IN (SELECT id FROM _free_uids);
DELETE FROM plans                    WHERE user_id IN (SELECT id FROM _free_uids);
-- workouts last (sets already gone; routine_id FK is SET NULL so safe).
DELETE FROM workouts                 WHERE user_id IN (SELECT id FROM _free_uids);

COMMIT;

-- After COMMIT, VACUUM ANALYZE the purged tables to reclaim space:
--   VACUUM (ANALYZE) sets, workouts, exercise_prs, user_percentile_rankings;
