-- Migration: 20260517_rest_day_designation.sql
-- PL-3: Rest Day Designation — adds session_type to workouts table

-- 1. Add a session_type column to workouts table
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'workout'
  CHECK (session_type IN ('workout', 'rest_day', 'emergency_override'));

-- 2. A rest_day counts as streak-preserved — update the streak logic comment
-- (Streak cron reads workouts with session_type = 'workout' OR session_type = 'rest_day'
--  to determine active days; 'emergency_override' covers illness/travel.)
-- The streak-break rule stays: only 2 unexcused missed sessions breaks a streak.

-- 3. Index for the cron query
CREATE INDEX IF NOT EXISTS idx_workouts_session_type ON workouts(user_id, session_type, created_at DESC);
