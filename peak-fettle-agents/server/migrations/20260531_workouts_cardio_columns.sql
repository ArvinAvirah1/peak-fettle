-- 20260531_workouts_cardio_columns.sql
-- GAP found via full prod-schema audit (2026-05-31):
-- routes/csvImport.js bulk-inserts into workouts (activity_type, duration_seconds,
-- distance_m, avg_pace_sec_per_km, source), and routes/workouts.js mileage/pace
-- analytics (GET mileage + pace-trend) SELECT/GROUP BY activity_type — but none
-- of these columns exist on the prod workouts table (only id, user_id, day_key,
-- notes, session_type, created_at, updated_at). So CSV import (POST /import/csv)
-- and the cardio analytics endpoints would 500 with 42703 "column does not exist".
--
-- These describe imported cardio sessions (session_type='cardio_import'); NULL for
-- normal lifting workouts. Idempotent. Apply in the Supabase SQL Editor.

ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS activity_type       TEXT,
    ADD COLUMN IF NOT EXISTS duration_seconds    INTEGER,
    ADD COLUMN IF NOT EXISTS distance_m          INTEGER,
    ADD COLUMN IF NOT EXISTS avg_pace_sec_per_km INTEGER,
    ADD COLUMN IF NOT EXISTS source              TEXT;
