-- Migration: 20260517_cardio_import.sql
-- PL-2: CSV Import — adds cardio import columns to workouts table

ALTER TABLE workouts ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS distance_m INTEGER;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS avg_pace_sec_per_km INTEGER;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS source TEXT;

-- Extend session_type CHECK to include 'cardio_import'
-- Drop the existing constraint (added in 20260517_rest_day_designation.sql) and recreate it
-- with the additional 'cardio_import' value.
ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_session_type_check;
ALTER TABLE workouts ADD CONSTRAINT workouts_session_type_check
  CHECK (session_type IN ('workout', 'rest_day', 'emergency_override', 'cardio_import'));
