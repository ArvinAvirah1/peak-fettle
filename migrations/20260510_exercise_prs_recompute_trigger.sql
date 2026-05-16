-- migrations/20260510_exercise_prs_recompute_trigger.sql
-- ============================================================================
-- DEPRECATED — NO-OP MIGRATION
-- ============================================================================
-- BUG-003 fix (2026-05-15, Hotfix Sprint per DEV_ROADMAP_2026-05-14.md §5)
--
-- This file previously contained a duplicate Y-03 trigger implementation that
-- conflicted with `20260510_exercise_prs_delete_trigger.sql`. It also referenced
-- the dropped column `weight_kg` (replaced by `weight_raw` in the
-- 2026-05-05 weight_raw migration), which would error out on apply.
--
-- The CORRECT implementation lives in:
--     migrations/20260510_exercise_prs_delete_trigger.sql
--
-- This file is intentionally left as a no-op so any environment that already
-- recorded it in the migration history (e.g., schema_migrations) does not
-- attempt to re-apply or skip subsequent migrations. New environments will
-- simply execute zero DDL from this file.
--
-- Do NOT add SQL here. If trigger logic needs adjustment, edit the
-- delete_trigger.sql file instead.
-- ============================================================================

-- Intentional no-op: a comment-only file is valid SQL and produces no schema
-- changes. The DO block below is a syntactic confirmation that the file is
-- not empty and that it parses cleanly under psql.
DO $$
BEGIN
    -- BUG-003: superseded by 20260510_exercise_prs_delete_trigger.sql
    PERFORM 1;
END $$;
