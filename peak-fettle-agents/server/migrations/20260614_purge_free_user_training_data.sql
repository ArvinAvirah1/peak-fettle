-- 20260614 — Purge free-tier users' personal training data from the server.
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

  -- Guardrail intentionally REMOVED (founder decision 2026-06-13): there are no
  -- paid users yet and the founder accepts wiping ALL server-side training data.
  -- With zero paid users, `tier <> 'paid'` matches every user, so this purges
  -- the entire training dataset. The server copy is being discarded knowingly.
END $$;

-- Delete children first, parents last. Each table is purged only if it EXISTS
-- in this database — prod has drifted (e.g. user_percentile_rankings was already
-- dropped), so to_regclass() guards every statement and silently skips absentees.
-- The free-user filter is inlined into each DELETE (no temp table) so this works
-- in SQL editors that run statements with autocommit between them — a TEMP TABLE
-- ON COMMIT DROP would vanish before the loop reached it.
DO $purge$
DECLARE
  tbl  TEXT;
  tbls TEXT[] := ARRAY[
    'sets', 'exercise_prs', 'user_confirmed_1rm', 'user_percentile_rankings',
    'daily_health_metrics', 'daily_health_log', 'user_weekly_goals',
    'user_constraints', 'streak_overrides', 'streaks', 'plans',
    'workouts'  -- last: children already gone; routine_id FK is SET NULL
  ];
  n BIGINT;
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format(
        'DELETE FROM %I WHERE user_id IN (SELECT id FROM users WHERE tier <> ''paid'' OR tier IS NULL)',
        tbl
      );
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE '  purged % rows from %', n, tbl;
    ELSE
      RAISE NOTICE '  skipped % (table does not exist)', tbl;
    END IF;
  END LOOP;
END $purge$;

COMMIT;

-- After COMMIT, VACUUM ANALYZE the purged tables to reclaim space:
--   VACUUM (ANALYZE) sets, workouts, exercise_prs, user_percentile_rankings;
