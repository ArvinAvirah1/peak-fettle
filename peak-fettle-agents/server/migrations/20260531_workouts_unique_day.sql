-- 20260531_workouts_unique_day.sql
-- DEFENSIVE (WORKOUTS-500 follow-up, 2026-05-31):
-- POST /workouts and POST /workouts/rest-day (routes/workouts.js:53,240) use
--   INSERT INTO workouts (...) ON CONFLICT (user_id, day_key) DO UPDATE ...
-- which REQUIRES a unique constraint (or unique index) on workouts(user_id, day_key).
-- If it is absent, Postgres throws 42P10 "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification". The earlier
-- "column session_type does not exist" error fired during PARSE, before the
-- ON CONFLICT was evaluated, so this constraint had not yet been exercised.
--
-- This migration adds the constraint only if no unique index already covers
-- (user_id, day_key), so it is a safe no-op when prod already has it.
-- Idempotent. Apply MANUALLY (Supabase SQL Editor — this is the Supabase DB).
--
-- NOTE: if duplicate (user_id, day_key) rows already exist, creating the unique
-- index will fail. That is desirable — it means real duplicate data needs manual
-- review rather than silently collapsing rows.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE tablename = 'workouts'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef ILIKE '%(user_id, day_key)%'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'workouts'
          AND c.contype IN ('u', 'p')
          AND pg_get_constraintdef(c.oid) ILIKE '%(user_id, day_key)%'
    )
    THEN
        CREATE UNIQUE INDEX workouts_user_day_key_uniq
            ON workouts (user_id, day_key);
    END IF;
END $$;
