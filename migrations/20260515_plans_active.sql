-- migrations/20260515_plans_active.sql
-- Phase: D (offline-first React Native app)
-- Author: dev-database
-- Date: 2026-05-15
--
-- PURPOSE
-- -------
-- Adds `is_active` to the `plans` table so each user can mark one plan as
-- their currently-followed program.  The column is managed client-side via
-- PowerSync writes; the server enforces the at-most-one constraint via a
-- partial unique index and a trigger.
--
-- Safe to re-run: all DDL uses IF NOT EXISTS / IF EXISTS guards.
-- ---------------------------------------------------------------------------

-- 1. Add the column (default 0 = not active)
ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Partial unique index: at most one active plan per user at a time.
--    (global templates — user_id IS NULL — are excluded from the constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_one_active_per_user
    ON plans (user_id)
    WHERE is_active = TRUE AND user_id IS NOT NULL;

-- 3. updated_at trigger (reuse existing set_updated_at function)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_plans_updated'
          AND tgrelid = 'plans'::regclass
    ) THEN
        CREATE TRIGGER trg_plans_updated
            BEFORE UPDATE ON plans
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;

-- 4. RLS — users can update their own plan's is_active flag.
--    The existing update policy ("plans_update_self") already covers this.
--    No new policy needed.
