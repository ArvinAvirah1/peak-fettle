-- migrations/20260504_user_constraints.sql
-- Phase: C (TICKET-012 — Injury & Limitation Constraint Filter)
-- Author: dev-database
-- Date: 2026-05-04
--
-- PURPOSE
-- -------
-- Implements the user constraint system that hard-blocks certain movement
-- patterns from AI-generated plans (TICKET-011). Two schema changes:
--
--   1. user_constraints  — per-user table of physical limitation flags
--   2. exercises.contraindications  — TEXT[] column tagging each exercise
--      with the constraint types that should exclude it from plans
--
-- The plan generation endpoint (POST /plans/generate) reads both tables
-- before building the Haiku prompt so blocked exercises never appear in output.
--
-- CONSTRAINT TYPE VOCABULARY
-- --------------------------
-- Canonical constraint_type values (must match contraindications tags):
--   lower_back    — lumbar-loading movements (deadlifts, good mornings, etc.)
--   knee          — high knee-flexion / knee-shear movements (squats, lunges)
--   shoulder      — overhead or extreme shoulder-range movements
--   wrist         — wrist-loading or extreme wrist-flexion movements
--   hip           — hip-flexion or hip-impingement patterns
--   ankle         — ankle dorsiflexion-intensive movements
--   no_barbell    — any exercise requiring a barbell
--   no_jumping    — plyometric / impact movements
--   bodyweight_only — any exercise requiring equipment
--   custom        — free-text, handled by AI prompt context only
--
-- Safe to re-run: all DDL uses IF NOT EXISTS / IF EXISTS guards.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. user_constraints table
-- ===========================================================================

CREATE TABLE IF NOT EXISTS user_constraints (
    constraint_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    constraint_type TEXT        NOT NULL,
    custom_note     TEXT,       -- used when constraint_type = 'custom'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, constraint_type)
);

CREATE INDEX IF NOT EXISTS idx_user_constraints_user
    ON user_constraints(user_id);

-- RLS: users read and write only their own constraints
ALTER TABLE user_constraints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own constraints"  ON user_constraints;
DROP POLICY IF EXISTS "users insert own constraints" ON user_constraints;
DROP POLICY IF EXISTS "users delete own constraints" ON user_constraints;

CREATE POLICY "users read own constraints"
    ON user_constraints FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "users insert own constraints"
    ON user_constraints FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own constraints"
    ON user_constraints FOR DELETE
    USING (auth.uid() = user_id);


-- ===========================================================================
-- 2. exercises.contraindications column
-- ===========================================================================

ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS contraindications TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_exercises_contraindications
    ON exercises USING gin (contraindications);


-- ===========================================================================
-- 3. Seed contraindication tags on existing exercises
-- ===========================================================================
-- Strategy: UPDATE ... WHERE name = '<exercise>'. Safe to re-run because
-- setting a TEXT[] to the same value is idempotent.

-- LOWER BACK — spinal loading under load
UPDATE exercises SET contraindications = array_cat(contraindications, ARRAY['lower_back'])
WHERE name IN (
    'Deadlift', 'Sumo Deadlift', 'Trap Bar Deadlift',
    'Stiff-Leg Deadlift', 'Romanian Deadlift', 'Rack Pull',
    'Good Morning', 'Hyperextension', 'Barbell Row', 'Pendlay Row',
    'T-Bar Row', 'Jefferson Curl', 'Back Squat', 'Front Squat',
    'Overhead Press', 'Seated Barbell Press', 'Push Press',
    'Barbell Shrug'
) AND NOT (contraindications @> ARRAY['lower_back']);

-- KNEE — high knee-flexion / knee-shear loads
UPDATE exercises SET contraindications = array_cat(contraindications, ARRAY['knee'])
WHERE name IN (
    'Back Squat', 'Front Squat', 'Goblet Squat', 'Bulgarian Split Squat',
    'Walking Lunge', 'Reverse Lunge', 'Lateral Lunge', 'Step-Up',
    'Leg Press', 'Hack Squat', 'Sissy Squat', 'Box Jump', 'Jump Squat',
    'Leg Extension', 'Nordic Hamstring Curl', 'Pistol Squat',
    'Sumo Deadlift', 'Trap Bar Deadlift'
) AND NOT (contraindications @> ARRAY['knee']);

-- SHOULDER — overhead range or extreme shoulder loading
UPDATE exercises SET contraindications = array_cat(contraindications, ARRAY['shoulder'])
WHERE name IN (
    'Overhead Press', 'Push Press', 'Seated Barbell Press',
    'Dumbbell Shoulder Press', 'Arnold Press', 'Machine Shoulder Press',
    'Lateral Raise', 'Cable Lateral Raise', 'Machine Lateral Raise',
    'Front Raise', 'Upright Row', 'Handstand Push-Up',
    'Pull-Up', 'Chin-Up', 'Wide-Grip Pull-Up', 'Weighted Pull-Up',
    'Lat Pulldown', 'Wide-Grip Lat Pulldown',
    'Barbell Bench Press', 'Incline Barbell Bench Press',
    'Decline Barbell Bench Press', 'Dumbbell Bench Press',
    'Incline Dumbbell Press', 'Dip (Chest-Focused)', 'Weighted Dip',
    'Push-Up', 'Diamond Push-Up', 'Face Pull', 'Cable Crossover',
    'Pec Deck', 'Flat Dumbbell Fly', 'Incline Dumbbell Fly'
) AND NOT (contraindications @> ARRAY['shoulder']);

-- WRIST — wrist loading or extreme wrist-flexion
UPDATE exercises SET contraindications = array_cat(contraindications, ARRAY['wrist'])
WHERE name IN (
    'Barbell Curl', 'Reverse Curl', 'Wrist Curl', 'Reverse Wrist Curl',
    'Push-Up', 'Diamond Push-Up', 'Handstand Push-Up',
    'Dumbbell Bench Press', 'Incline Dumbbell Press',
    'Dumbbell Shoulder Press', 'Arnold Press',
    'Farmer''s Carry', 'Deadlift', 'Sumo Deadlift'
) AND NOT (contraindications @> ARRAY['wrist']);

-- HIP — hip-flexion intensive or hip-impingement risk
UPDATE exercises SET contraindications = array_cat(contraindications, ARRAY['hip'])
WHERE name IN (
    'Back Squat', 'Front Squat', 'Goblet Squat', 'Bulgarian Split Squat',
    'Deadlift', 'Sumo Deadlift', 'Romanian Deadlift', 'Stiff-Leg Deadlift',
    'Hip Thrust', 'Glute Bridge', 'Cable Pull-Through',
    'Step-Up', 'Walking Lunge', 'Reverse Lunge', 'Lateral Lunge',
    'Leg Press', 'Hack Squat'
) AND NOT (contraindications @> ARRAY['hip']);

-- NO_BARBELL — requires a barbell
UPDATE exercises SET contraindications = array_cat(contraindications, ARRAY['no_barbell'])
WHERE name IN (
    'Barbell Bench Press', 'Incline Barbell Bench Press', 'Decline Barbell Bench Press',
    'Close-Grip Bench Press', 'Floor Press', 'Overhead Press', 'Push Press',
    'Seated Barbell Press', 'Back Squat', 'Front Squat',
    'Deadlift', 'Sumo Deadlift', 'Stiff-Leg Deadlift', 'Romanian Deadlift',
    'Rack Pull', 'Good Morning', 'Barbell Row', 'Pendlay Row', 'T-Bar Row',
    'Barbell Curl', 'EZ-Bar Curl', 'Barbell Shrug', 'Barbell Hip Thrust',
    'Landmine Press', 'Zercher Squat', 'Overhead Squat'
) AND NOT (contraindications @> ARRAY['no_barbell']);

-- NO_JUMPING — plyometric / high-impact
UPDATE exercises SET contraindications = array_cat(contraindications, ARRAY['no_jumping'])
WHERE name IN (
    'Box Jump', 'Jump Squat', 'Broad Jump', 'Depth Jump',
    'Burpee', 'Jump Rope', 'Box Jump-Over', 'Tuck Jump',
    'Lateral Box Jump', 'Single-Leg Box Jump'
) AND NOT (contraindications @> ARRAY['no_jumping']);
