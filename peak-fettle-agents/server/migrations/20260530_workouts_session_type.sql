-- 20260530_workouts_session_type.sql
-- FIX (WORKOUTS-500, 2026-05-30):
-- routes/workouts.js queries workouts.session_type extensively (POST /, the
-- streak/paywall COUNT(... WHERE session_type='workout'), POST /rest-day, the
-- cardio-import reads, GET /), but NO migration ever added the column. Confirmed
-- missing in prod via Railway logs:
--   [unhandled] error: column "session_type" does not exist
--   at routes/workouts.js:50  (Postgres code 42703)
-- => POST /workouts 500s on mount (usePowerSyncLog init), which is the Log tab's
--    "Request failed with status code 500" banner.
--
-- session_type classifies a workout row; values used in code:
--   'workout' | 'rest_day' | 'emergency_override' | 'cardio_import'
-- Existing rows are real sessions, so the default 'workout' is correct for them.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + constraint guarded by pg_constraint.
-- Apply MANUALLY against Railway prod (no migration runner in package.json).

ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'workout';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'workouts_session_type_check'
    ) THEN
        ALTER TABLE workouts
            ADD CONSTRAINT workouts_session_type_check
            CHECK (session_type IN ('workout', 'rest_day', 'emergency_override', 'cardio_import'));
    END IF;
END $$;
