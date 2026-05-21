-- migrations/20260519_workouts_activity_type.sql
-- Phase: F (pre-launch tester fix)
-- Author: dev-backend
-- Date: 2026-05-19
--
-- PURPOSE
-- -------
-- CSV-002 (2026-05-19 tester feedback): `activity_type` was parsed from both
-- Garmin and Strava rows in csvImport.js but never persisted because the
-- column did not exist on `workouts`. As a result every cardio import was
-- stored as an undifferentiated `cardio_import` session and downstream
-- analytics had no way to filter by run vs. ride vs. swim.
--
-- This migration adds the column and a CHECK constraint that mirrors the
-- activityTypeMap values produced by both parsers. The default is 'other' so
-- the column is safe to backfill on existing rows.
--
-- Safe to re-run: all DDL uses IF NOT EXISTS guards.
-- ---------------------------------------------------------------------------

-- 1. Add the column with the inclusive set of values produced by the parsers.
ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS activity_type TEXT;

-- 2. CHECK constraint matching csvImport.js activityTypeMap values.
--    Allow NULL for non-cardio rows (workout, rest_day, emergency_override)
--    so the constraint does not retroactively reject lifting sessions.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'workouts_activity_type_check'
          AND conrelid = 'workouts'::regclass
    ) THEN
        ALTER TABLE workouts
            ADD CONSTRAINT workouts_activity_type_check
            CHECK (
                activity_type IS NULL
                OR activity_type IN ('run', 'ride', 'swim', 'walk', 'other')
            );
    END IF;
END $$;

-- 3. Partial index to keep activity-type filters on cardio imports fast.
CREATE INDEX IF NOT EXISTS idx_workouts_activity_type
    ON workouts (user_id, activity_type)
    WHERE session_type = 'cardio_import';
