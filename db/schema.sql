-- =============================================================================
-- Peak Fettle — CONSOLIDATED DATABASE SCHEMA  (single source of truth)
-- Generated 2026-06-01 by consolidating migrations/ + peak-fettle-agents/server/
-- migrations/ into one ordered, fresh-run bootstrap. Supersedes the old
-- two-directory migration pile, all_migrations.sql, APPLY_ALL_pending.sql, and
-- the loose root reference SQL (compute_percentile.sql, lift_vectors_seed.sql).
--
-- HOW TO APPLY
--   Run this file ONCE, top to bottom, in the Supabase SQL editor on a FRESH
--   project. There is no user base, so no incremental migration history is kept.
--   After this, run db/seed_supplemental.sql if present.
--
-- IDEMPOTENCY / RE-RUN
--   Designed for a single fresh-project run. Most blocks are idempotent
--   (CREATE ... IF NOT EXISTS / CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS).
--   A handful of CREATE POLICY statements are NOT guarded and will error on a
--   second run — that is expected for a fresh-project bootstrap.
--
-- KNOWN DRIFT PRESERVED AS-IS (do NOT "clean" without the owning ticket)
--   * Percentile engine: this file contains the FULL applied chain
--     v1 (20260502) -> v2 (20260510_engine_v2 + arch_1_6) -> 20260515 hotfix.
--     The last CREATE OR REPLACE wins, reproducing the exact deployed behavior.
--     Collapsing the chain / reconciling it against the loose root
--     compute_percentile.sql (a separate, more complete standalone version with
--     overall_strength_percentile* + compute_percentile_sex_only) is TICKET-066.
--   * workout_templates / template_exercises are defined twice (root 20260517
--     WITH form_cue + public-read RLS, server 20260530 without). Date order makes
--     the 20260517 definition win; 20260530 only adds seed rows. See TICKET-068.
--
-- This consolidation closes TICKET-068 acceptance #2 (single canonical history).
-- =============================================================================

SET client_min_messages = warning;


-- ============================ PART 1: CORE + PERCENTILE (through 2026-05-15) ============================

-- #############################################################################
-- # SOURCE: migrations/20260430_initial_schema.sql
-- #############################################################################

-- Peak Fettle — initial Supabase schema
-- Author: dev-database
-- Date: 2026-04-30
-- Phase: B (production stack foundation)
-- Source: workflow-optimization/briefs/dev-roadmap-relay-2026-04-30.md

-- ---------------------------------------------------------------------------
-- Conventions
--   * UUID primary keys via gen_random_uuid()
--   * Every row has created_at / updated_at TIMESTAMPTZ
--   * Soft-delete via deleted_at where it would matter
--   * Weights stored in kg only; UI converts at render time (per dev-lead rule)
--   * Effort stored as RIR; legacy rpe column retained read-only (-1 = not recorded)
-- ---------------------------------------------------------------------------

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- N-10: pg_trgm must be created before the GIN trigram index on exercises.name
-- (idx_exercises_name_trgm). Without this the index is silently absent and
-- TICKET-007 fuzzy search degrades to exact ILIKE matching with no warning.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- USERS — auth + profile + cohort demographics
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    TEXT,

    -- Cohort demographics (used by percentile engine)
    sex             TEXT CHECK (sex IN ('M', 'F', 'X')),  -- X = unisex / opted out
    birth_date      DATE,
    weight_class_kg NUMERIC(5,2),
    years_in_sport  SMALLINT,
    experience_level TEXT CHECK (experience_level IN ('beginner','intermediate','advanced')),

    -- Tier
    tier            TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','paid')),

    -- Preferences
    unit_pref       TEXT NOT NULL DEFAULT 'kg' CHECK (unit_pref IN ('kg','lbs')),
    score_pref      TEXT NOT NULL DEFAULT 'peak_fettle' CHECK (score_pref IN ('peak_fettle','wilks','dots')),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- EXERCISES — global library (not user-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE exercises (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- N-15: cap at 100 chars to match the Qt-side logSetAt() guard. Names
    -- longer than this are almost certainly a paste error or overflow risk.
    name            TEXT NOT NULL CHECK (length(name) <= 100),
    category        TEXT NOT NULL CHECK (category IN ('lift','cardio','sport','mobility')),
    muscle_groups   TEXT[],
    is_compound     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exercises_name_trgm ON exercises USING gin (name gin_trgm_ops);
-- ^ enable pg_trgm in Supabase before this runs; falls back gracefully if missing
-- (Supabase has pg_trgm available — confirm CREATE EXTENSION pg_trgm in project)

-- Aliases / synonyms — backs TICKET-007 search
CREATE TABLE exercise_aliases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercise_id     UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    alias           TEXT NOT NULL,
    UNIQUE (exercise_id, alias)
);

CREATE INDEX idx_exercise_aliases_alias ON exercise_aliases(alias);

-- ---------------------------------------------------------------------------
-- WORKOUTS — a workout = one calendar day (per dev-lead rule)
-- ---------------------------------------------------------------------------
CREATE TABLE workouts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_key         DATE NOT NULL,                  -- canonical grouping key
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, day_key)
);

CREATE INDEX idx_workouts_user_day ON workouts(user_id, day_key DESC);

-- ---------------------------------------------------------------------------
-- SETS — handles both lift and cardio (per TICKET-010 contract)
-- ---------------------------------------------------------------------------
CREATE TABLE sets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_id          UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id         UUID NOT NULL REFERENCES exercises(id),
    kind                TEXT NOT NULL CHECK (kind IN ('lift','cardio')),
    set_index           SMALLINT NOT NULL,         -- order within workout

    -- LIFT fields (NULL for cardio)
    reps                SMALLINT,
    weight_kg           NUMERIC(6,2),
    rir                 SMALLINT,                  -- -1 = not recorded, 0 = to failure
    rpe                 SMALLINT,                  -- legacy, read-only

    -- CARDIO fields (NULL for lift)
    duration_sec        INTEGER,
    distance_m          NUMERIC(8,2),
    avg_pace_sec_per_km NUMERIC(6,2),

    logged_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Either lift fields OR cardio fields must be populated
    CHECK (
        (kind = 'lift'   AND reps IS NOT NULL AND weight_kg IS NOT NULL)
        OR
        (kind = 'cardio' AND duration_sec IS NOT NULL)
    )
);

CREATE INDEX idx_sets_user_logged ON sets(user_id, logged_at DESC);
CREATE INDEX idx_sets_workout ON sets(workout_id, set_index);
CREATE INDEX idx_sets_exercise ON sets(exercise_id);

-- ---------------------------------------------------------------------------
-- PLANS — AI-generated and template plans
-- ---------------------------------------------------------------------------
CREATE TABLE plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for global templates
    name            TEXT NOT NULL,
    is_template     BOOLEAN NOT NULL DEFAULT FALSE,
    is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    -- Plan structure stored as JSONB so the AI service and templates can share format
    structure       JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plans_user ON plans(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_plans_template ON plans(is_template) WHERE is_template = TRUE;

-- ---------------------------------------------------------------------------
-- STREAKS — one row per user, daily aggregation; events table for audit
-- ---------------------------------------------------------------------------
CREATE TABLE streaks (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_streak_days INTEGER NOT NULL DEFAULT 0,
    longest_streak_days INTEGER NOT NULL DEFAULT 0,
    last_session_date   DATE,
    -- make-up window: if a session is missed, user has until end of week to make up
    pending_makeup      BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE streak_overrides (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    override_date   DATE NOT NULL,
    reason          TEXT NOT NULL CHECK (reason IN ('illness','travel','exam','other')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, override_date)
);

-- ---------------------------------------------------------------------------
-- PERCENTILE_VECTORS — batch-computed weekly, never real-time
-- ---------------------------------------------------------------------------
CREATE TABLE percentile_vectors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercise_id     UUID NOT NULL REFERENCES exercises(id),
    sex             TEXT NOT NULL CHECK (sex IN ('M','F','X')),
    age_band        TEXT NOT NULL,    -- e.g. '18-24', '25-34'
    weight_class_kg NUMERIC(5,2) NOT NULL,
    years_band      TEXT NOT NULL,    -- e.g. '0-1','1-3','3-5','5+'
    -- Distribution: array of (percentile, weight_kg or pace) tuples
    distribution    JSONB NOT NULL,
    sample_size     INTEGER NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (exercise_id, sex, age_band, weight_class_kg, years_band)
);

CREATE INDEX idx_percentile_lookup
    ON percentile_vectors(exercise_id, sex, age_band, weight_class_kg, years_band);

-- ---------------------------------------------------------------------------
-- HEALTH SUITE PHASE 1 — daily_health_log + habits
-- N-09: These tables are intentionally NOT defined here. The sole source of
-- truth is the dedicated migration files:
--   * 20260430_add_daily_health_log.sql
--   * 20260430_add_habits.sql
-- Defining them here AND in those files created duplicate trigger registrations
-- (trg_daily_health_log_updated from this file + trg_daily_health_log_updated_at
-- from the dedicated file) that would fire twice on every UPDATE. Removed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ROW-LEVEL SECURITY — core tables only; health-suite tables handled in add_*
-- ---------------------------------------------------------------------------
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE streak_overrides    ENABLE ROW LEVEL SECURITY;

-- Users: only see / edit own row
CREATE POLICY "users_self_only" ON users
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "workouts_self_only" ON workouts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "sets_self_only" ON sets
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "plans_self_or_template" ON plans
    FOR SELECT USING (auth.uid() = user_id OR is_template = TRUE);
CREATE POLICY "plans_write_self" ON plans
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "plans_update_self" ON plans
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "plans_delete_self" ON plans
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "streaks_self_only" ON streaks
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "streak_overrides_self_only" ON streak_overrides
    FOR ALL USING (auth.uid() = user_id);

-- daily_health_log and habits RLS policies live in their dedicated migration files.

-- exercises and percentile_vectors are global read-only for users; no RLS needed
-- (writes restricted via Supabase service role)

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated            BEFORE UPDATE ON users     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_workouts_updated         BEFORE UPDATE ON workouts  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_plans_updated            BEFORE UPDATE ON plans     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_streaks_updated          BEFORE UPDATE ON streaks   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- N-09: daily_health_log trigger lives in 20260430_add_daily_health_log.sql (deduplicated)

-- ---------------------------------------------------------------------------
-- DEV-DATABASE OUTPUT
-- 1. SQL DDL: see above. 11 tables, 1 trigger function, 5 triggers.
-- 2. Indexes added: email lookup, exercise trgm, alias lookup, workouts(user,day),
--    sets(user,logged_at), sets(workout,set_index), sets(exercise),
--    plans(user), plans(template), percentile lookup, daily_health_log(user,date).
-- 3. Migration file: migrations/20260430_initial_schema.sql (this file).
-- 4. Breaking changes for backend-dev: none (greenfield). On future migrations
--    that rename or drop columns, flag in the dev-team relay.
-- ---------------------------------------------------------------------------


-- #############################################################################
-- # SOURCE: migrations/20260502_seed_exercise_library.sql
-- #############################################################################

-- Peak Fettle — Exercise library seed (Phase B)
-- Author: dev-database
-- Date: 2026-05-02
-- Source: DEV_ROADMAP_2026-05-01.md Phase B, TICKET-007
--
-- Seeds ~160 exercises across all categories into the `exercises` table,
-- then seeds common aliases/synonyms into `exercise_aliases` so the
-- GET /exercises/search endpoint can surface canonical names from colloquial
-- queries ("OHP" → Overhead Press, "RDL" → Romanian Deadlift, etc.).
--
-- Safe to re-run: uses INSERT … ON CONFLICT DO NOTHING throughout.
-- Requires: 20260430_initial_schema.sql has been applied.

-- Enable pg_trgm if not already enabled (needed for the GIN index on exercises.name).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- EXERCISES
-- ---------------------------------------------------------------------------
-- Unique index on exercises.name required for the ON CONFLICT (name) clause
-- in the INSERT below. Must be created before the INSERT runs.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'exercises'
          AND indexname  = 'idx_exercises_name_unique'
    ) THEN
        CREATE UNIQUE INDEX idx_exercises_name_unique ON exercises (name);
    END IF;
END $$;

INSERT INTO exercises (name, category, muscle_groups, is_compound) VALUES
-- ======================== CHEST ========================
('Barbell Bench Press',            'lift', ARRAY['chest','triceps','anterior_deltoid'], TRUE),
('Incline Barbell Bench Press',    'lift', ARRAY['chest','triceps','anterior_deltoid'], TRUE),
('Decline Barbell Bench Press',    'lift', ARRAY['chest','triceps'],                   TRUE),
('Close-Grip Bench Press',         'lift', ARRAY['triceps','chest'],                   TRUE),
('Dumbbell Bench Press',           'lift', ARRAY['chest','triceps','anterior_deltoid'], TRUE),
('Incline Dumbbell Press',         'lift', ARRAY['chest','anterior_deltoid'],          TRUE),
('Decline Dumbbell Press',         'lift', ARRAY['chest','triceps'],                   TRUE),
('Flat Dumbbell Fly',              'lift', ARRAY['chest'],                             FALSE),
('Incline Dumbbell Fly',           'lift', ARRAY['chest','anterior_deltoid'],          FALSE),
('Cable Crossover',                'lift', ARRAY['chest'],                             FALSE),
('Cable Fly (Low to High)',        'lift', ARRAY['chest'],                             FALSE),
('Cable Fly (High to Low)',        'lift', ARRAY['chest'],                             FALSE),
('Pec Deck',                       'lift', ARRAY['chest'],                             FALSE),
('Machine Chest Press',            'lift', ARRAY['chest','triceps'],                   TRUE),
('Push-Up',                        'lift', ARRAY['chest','triceps','anterior_deltoid'], TRUE),
('Diamond Push-Up',                'lift', ARRAY['triceps','chest'],                   TRUE),
('Dip (Chest-Focused)',            'lift', ARRAY['chest','triceps'],                   TRUE),
('Weighted Dip',                   'lift', ARRAY['chest','triceps'],                   TRUE),
('Floor Press',                    'lift', ARRAY['chest','triceps'],                   TRUE),
('Landmine Press',                 'lift', ARRAY['chest','anterior_deltoid'],          TRUE),

-- ======================== BACK ========================
('Deadlift',                        'lift', ARRAY['back','glutes','hamstrings'],         TRUE),
('Sumo Deadlift',                   'lift', ARRAY['glutes','hamstrings','back'],         TRUE),
('Trap Bar Deadlift',               'lift', ARRAY['back','glutes','quads'],              TRUE),
('Stiff-Leg Deadlift',              'lift', ARRAY['hamstrings','back'],                  TRUE),
('Rack Pull',                       'lift', ARRAY['back','traps'],                       TRUE),
('Pull-Up',                         'lift', ARRAY['latissimus_dorsi','biceps'],          TRUE),
('Chin-Up',                         'lift', ARRAY['latissimus_dorsi','biceps'],          TRUE),
('Wide-Grip Pull-Up',               'lift', ARRAY['latissimus_dorsi'],                   TRUE),
('Weighted Pull-Up',                'lift', ARRAY['latissimus_dorsi','biceps'],          TRUE),
('Lat Pulldown',                    'lift', ARRAY['latissimus_dorsi','biceps'],          FALSE),
('Wide-Grip Lat Pulldown',          'lift', ARRAY['latissimus_dorsi'],                   FALSE),
('Straight-Arm Pulldown',           'lift', ARRAY['latissimus_dorsi'],                   FALSE),
('Barbell Row',                     'lift', ARRAY['upper_back','biceps'],                TRUE),
('Pendlay Row',                     'lift', ARRAY['upper_back'],                         TRUE),
('T-Bar Row',                       'lift', ARRAY['upper_back','biceps'],                TRUE),
('Seated Cable Row',                'lift', ARRAY['upper_back','biceps'],                FALSE),
('Single-Arm Dumbbell Row',         'lift', ARRAY['latissimus_dorsi','biceps'],          FALSE),
('Chest-Supported Dumbbell Row',    'lift', ARRAY['upper_back'],                         FALSE),
('Inverted Row',                    'lift', ARRAY['upper_back','biceps'],                TRUE),
('Machine Row',                     'lift', ARRAY['upper_back'],                         FALSE),
('Hyperextension',                  'lift', ARRAY['lower_back','glutes'],                FALSE),
('Good Morning',                    'lift', ARRAY['hamstrings','lower_back'],             TRUE),
('Shrug (Barbell)',                  'lift', ARRAY['traps'],                              FALSE),
('Shrug (Dumbbell)',                 'lift', ARRAY['traps'],                              FALSE),
('Farmer''s Carry',                  'lift', ARRAY['traps','forearms','core'],            TRUE),

-- ======================== SHOULDERS ========================
('Overhead Press',                  'lift', ARRAY['anterior_deltoid','triceps','traps'],  TRUE),
('Push Press',                      'lift', ARRAY['anterior_deltoid','triceps','quads'],  TRUE),
('Seated Barbell Press',            'lift', ARRAY['anterior_deltoid','triceps'],          TRUE),
('Dumbbell Shoulder Press',         'lift', ARRAY['anterior_deltoid','triceps'],          TRUE),
('Arnold Press',                    'lift', ARRAY['deltoids','triceps'],                  FALSE),
('Machine Shoulder Press',          'lift', ARRAY['anterior_deltoid','triceps'],          FALSE),
('Lateral Raise',                   'lift', ARRAY['medial_deltoid'],                     FALSE),
('Cable Lateral Raise',             'lift', ARRAY['medial_deltoid'],                     FALSE),
('Machine Lateral Raise',           'lift', ARRAY['medial_deltoid'],                     FALSE),
('Front Raise',                     'lift', ARRAY['anterior_deltoid'],                   FALSE),
('Bent-Over Reverse Fly',           'lift', ARRAY['posterior_deltoid','upper_back'],     FALSE),
('Reverse Pec Deck',                'lift', ARRAY['posterior_deltoid','upper_back'],     FALSE),
('Face Pull',                       'lift', ARRAY['posterior_deltoid','rotator_cuff'],   FALSE),
('Upright Row',                     'lift', ARRAY['traps','medial_deltoid'],              FALSE),
('Handstand Push-Up',               'lift', ARRAY['anterior_deltoid','triceps'],          TRUE),

-- ======================== BICEPS ========================
('Barbell Curl',                    'lift', ARRAY['biceps'],                             FALSE),
('EZ-Bar Curl',                     'lift', ARRAY['biceps'],                             FALSE),
('Dumbbell Curl',                   'lift', ARRAY['biceps'],                             FALSE),
('Alternating Dumbbell Curl',       'lift', ARRAY['biceps'],                             FALSE),
('Hammer Curl',                     'lift', ARRAY['biceps','brachialis'],                FALSE),
('Incline Dumbbell Curl',           'lift', ARRAY['biceps'],                             FALSE),
('Preacher Curl',                   'lift', ARRAY['biceps'],                             FALSE),
('Spider Curl',                     'lift', ARRAY['biceps'],                             FALSE),
('Concentration Curl',              'lift', ARRAY['biceps'],                             FALSE),
('Cable Curl',                      'lift', ARRAY['biceps'],                             FALSE),
('Reverse Curl',                    'lift', ARRAY['brachialis','forearms'],              FALSE),
('Zottman Curl',                    'lift', ARRAY['biceps','forearms'],                  FALSE),
('Machine Curl',                    'lift', ARRAY['biceps'],                             FALSE),

-- ======================== TRICEPS ========================
('Triceps Pushdown',                'lift', ARRAY['triceps'],                            FALSE),
('Rope Pushdown',                   'lift', ARRAY['triceps'],                            FALSE),
('Overhead Triceps Extension',      'lift', ARRAY['triceps'],                            FALSE),
('Skull Crusher',                   'lift', ARRAY['triceps'],                            FALSE),
('EZ-Bar Skull Crusher',            'lift', ARRAY['triceps'],                            FALSE),
('Dumbbell Skull Crusher',          'lift', ARRAY['triceps'],                            FALSE),
('Cable Overhead Extension',        'lift', ARRAY['triceps'],                            FALSE),
('Triceps Kickback',                'lift', ARRAY['triceps'],                            FALSE),
('Bench Dip',                       'lift', ARRAY['triceps'],                            FALSE),
('Parallel Bar Dip (Triceps)',       'lift', ARRAY['triceps','chest'],                   TRUE),
('JM Press',                        'lift', ARRAY['triceps'],                            FALSE),
('Machine Triceps Extension',       'lift', ARRAY['triceps'],                            FALSE),

-- ======================== FOREARMS ========================
('Wrist Curl',                      'lift', ARRAY['forearms'],                           FALSE),
('Reverse Wrist Curl',              'lift', ARRAY['forearms'],                           FALSE),
('Dead Hang',                       'lift', ARRAY['forearms','grip'],                    FALSE),
('Plate Pinch Hold',                'lift', ARRAY['forearms','grip'],                    FALSE),
('Wrist Roller',                    'lift', ARRAY['forearms'],                           FALSE),

-- ======================== QUADS ========================
('Back Squat',                      'lift', ARRAY['quads','glutes'],                     TRUE),
('Front Squat',                     'lift', ARRAY['quads','core'],                       TRUE),
('High-Bar Squat',                  'lift', ARRAY['quads','glutes'],                     TRUE),
('Low-Bar Squat',                   'lift', ARRAY['quads','glutes','hamstrings'],        TRUE),
('Pause Squat',                     'lift', ARRAY['quads','glutes'],                     TRUE),
('Box Squat',                       'lift', ARRAY['quads','glutes'],                     TRUE),
('Goblet Squat',                    'lift', ARRAY['quads','core'],                       TRUE),
('Hack Squat',                      'lift', ARRAY['quads'],                              FALSE),
('Belt Squat',                      'lift', ARRAY['quads','glutes'],                     TRUE),
('Leg Press',                       'lift', ARRAY['quads','glutes'],                     FALSE),
('Leg Extension',                   'lift', ARRAY['quads'],                              FALSE),
('Walking Lunge',                   'lift', ARRAY['quads','glutes'],                     TRUE),
('Reverse Lunge',                   'lift', ARRAY['quads','glutes'],                     TRUE),
('Bulgarian Split Squat',           'lift', ARRAY['quads','glutes'],                     TRUE),
('Step-Up',                         'lift', ARRAY['quads','glutes'],                     TRUE),
('Pistol Squat',                    'lift', ARRAY['quads','core'],                       TRUE),
('Bodyweight Squat',                'lift', ARRAY['quads','glutes'],                     TRUE),

-- ======================== HAMSTRINGS ========================
('Romanian Deadlift',               'lift', ARRAY['hamstrings','glutes'],                TRUE),
('Single-Leg Romanian Deadlift',    'lift', ARRAY['hamstrings','glutes'],                TRUE),
('Lying Leg Curl',                  'lift', ARRAY['hamstrings'],                         FALSE),
('Seated Leg Curl',                 'lift', ARRAY['hamstrings'],                         FALSE),
('Nordic Curl',                     'lift', ARRAY['hamstrings'],                         FALSE),
('Glute-Ham Raise',                 'lift', ARRAY['hamstrings','glutes'],                TRUE),
('Kettlebell Swing',                'lift', ARRAY['hamstrings','glutes','lower_back'],   TRUE),

-- ======================== GLUTES ========================
('Hip Thrust',                      'lift', ARRAY['glutes'],                             FALSE),
('Barbell Hip Thrust',              'lift', ARRAY['glutes'],                             FALSE),
('Glute Bridge',                    'lift', ARRAY['glutes'],                             FALSE),
('Single-Leg Hip Thrust',           'lift', ARRAY['glutes'],                             FALSE),
('Cable Pull-Through',              'lift', ARRAY['glutes','hamstrings'],                FALSE),
('Frog Pump',                       'lift', ARRAY['glutes'],                             FALSE),
('Curtsy Lunge',                    'lift', ARRAY['glutes','quads'],                     TRUE),
('Glute Kickback Machine',          'lift', ARRAY['glutes'],                             FALSE),
('Banded Clamshell',                'lift', ARRAY['glutes','hip_abductors'],             FALSE),

-- ======================== CALVES ========================
('Standing Calf Raise',             'lift', ARRAY['calves'],                             FALSE),
('Seated Calf Raise',               'lift', ARRAY['calves'],                             FALSE),
('Donkey Calf Raise',               'lift', ARRAY['calves'],                             FALSE),
('Leg Press Calf Raise',            'lift', ARRAY['calves'],                             FALSE),
('Single-Leg Calf Raise',           'lift', ARRAY['calves'],                             FALSE),
('Tibialis Raise',                  'lift', ARRAY['tibialis_anterior'],                  FALSE),

-- ======================== CORE ========================
('Plank',                           'lift', ARRAY['core'],                               FALSE),
('Side Plank',                      'lift', ARRAY['core','obliques'],                    FALSE),
('Hollow Hold',                     'lift', ARRAY['core'],                               FALSE),
('Dead Bug',                        'lift', ARRAY['core'],                               FALSE),
('Hanging Leg Raise',               'lift', ARRAY['core','hip_flexors'],                 FALSE),
('Toes-to-Bar',                     'lift', ARRAY['core','hip_flexors'],                 FALSE),
('Cable Crunch',                    'lift', ARRAY['core'],                               FALSE),
('Crunch',                          'lift', ARRAY['core'],                               FALSE),
('Russian Twist',                   'lift', ARRAY['core','obliques'],                    FALSE),
('Pallof Press',                    'lift', ARRAY['core','obliques'],                    FALSE),
('Ab Wheel Rollout',                'lift', ARRAY['core'],                               FALSE),
('Dragon Flag',                     'lift', ARRAY['core'],                               FALSE),

-- ======================== FULL BODY ========================
('Burpee',                          'lift', ARRAY['full_body'],                          TRUE),
('Thruster',                        'lift', ARRAY['quads','shoulders','triceps'],        TRUE),
('Turkish Get-Up',                  'lift', ARRAY['full_body','core'],                   TRUE),
('Sled Push',                       'lift', ARRAY['quads','glutes','calves'],            TRUE),
('Sled Pull',                       'lift', ARRAY['back','biceps'],                      TRUE),
('Tire Flip',                       'lift', ARRAY['full_body'],                          TRUE),

-- ======================== OLYMPIC ========================
('Snatch',                          'lift', ARRAY['full_body'],                          TRUE),
('Power Snatch',                    'lift', ARRAY['full_body'],                          TRUE),
('Overhead Squat',                  'lift', ARRAY['quads','core'],                       TRUE),
('Clean',                           'lift', ARRAY['full_body'],                          TRUE),
('Power Clean',                     'lift', ARRAY['full_body'],                          TRUE),
('Hang Clean',                      'lift', ARRAY['full_body'],                          TRUE),
('Clean and Jerk',                  'lift', ARRAY['full_body'],                          TRUE),
('Jerk',                            'lift', ARRAY['shoulders','triceps','quads'],        TRUE),

-- ======================== PLYOMETRICS ========================
('Box Jump',                        'lift', ARRAY['quads','glutes'],                     TRUE),
('Broad Jump',                      'lift', ARRAY['quads','glutes'],                     TRUE),
('Jump Squat',                      'lift', ARRAY['quads','glutes'],                     TRUE),
('Medicine Ball Slam',              'lift', ARRAY['core','full_body'],                   TRUE),

-- ======================== CARDIO ========================
('Running (Outdoor)',               'cardio', ARRAY['full_body'],                        TRUE),
('Treadmill Run',                   'cardio', ARRAY['full_body'],                        TRUE),
('Treadmill Walk',                  'cardio', ARRAY['full_body'],                        TRUE),
('Incline Walk',                    'cardio', ARRAY['glutes','calves'],                  TRUE),
('Sprint Intervals',                'cardio', ARRAY['full_body'],                        TRUE),
('5K Run',                          'cardio', ARRAY['full_body'],                        TRUE),
('10K Run',                         'cardio', ARRAY['full_body'],                        TRUE),
('Cycling (Outdoor)',               'cardio', ARRAY['quads','hamstrings'],               TRUE),
('Stationary Bike',                 'cardio', ARRAY['quads','hamstrings'],               TRUE),
('Assault Bike',                    'cardio', ARRAY['full_body'],                        TRUE),
('Rowing (Erg)',                    'cardio', ARRAY['back','legs','core'],               TRUE),
('Swimming (Freestyle)',            'cardio', ARRAY['full_body'],                        TRUE),
('Stair Climber',                   'cardio', ARRAY['quads','glutes','calves'],          TRUE),
('Elliptical',                      'cardio', ARRAY['full_body'],                        TRUE),
('Jump Rope',                       'cardio', ARRAY['calves','full_body'],               TRUE),
('Hike',                            'cardio', ARRAY['full_body'],                        TRUE),

-- ======================== MOBILITY ========================
('Couch Stretch',                   'mobility', ARRAY['hip_flexors','quads'],            FALSE),
('90-90 Hip Stretch',               'mobility', ARRAY['glutes','hip_rotators'],          FALSE),
('Pigeon Pose',                     'mobility', ARRAY['glutes','hip_flexors'],           FALSE),
('World''s Greatest Stretch',       'mobility', ARRAY['full_body'],                      FALSE),
('Cat-Cow',                         'mobility', ARRAY['lower_back','core'],              FALSE),
('Thoracic Spine Rotation',         'mobility', ARRAY['upper_back'],                     FALSE),
('Foam Roll Quads',                 'mobility', ARRAY['quads'],                          FALSE),
('Foam Roll Back',                  'mobility', ARRAY['upper_back','lower_back'],        FALSE),
('Shoulder Dislocates',             'mobility', ARRAY['shoulders'],                      FALSE),
('Hamstring Stretch',               'mobility', ARRAY['hamstrings'],                     FALSE),
('Calf Stretch',                    'mobility', ARRAY['calves'],                         FALSE)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- EXERCISE ALIASES (TICKET-007)
-- ---------------------------------------------------------------------------
-- Inserts common colloquial names, abbreviations, and alternate spellings.
-- The /exercises/search endpoint JOIN on this table so users can type their
-- gym-floor vocabulary and land on the canonical name.

INSERT INTO exercise_aliases (exercise_id, alias)
SELECT e.id, a.alias
FROM exercises e
JOIN (VALUES
    -- Bench Press variants
    ('Barbell Bench Press',         'bench press'),
    ('Barbell Bench Press',         'flat bench'),
    ('Barbell Bench Press',         'bench'),
    ('Barbell Bench Press',         'bp'),
    ('Barbell Bench Press',         'chest press barbell'),
    ('Incline Barbell Bench Press', 'incline bench'),
    ('Incline Barbell Bench Press', 'incline press'),
    ('Dumbbell Bench Press',        'db bench'),
    ('Dumbbell Bench Press',        'dumbbell press'),
    ('Incline Dumbbell Press',      'incline db press'),

    -- Overhead Press
    ('Overhead Press',              'OHP'),
    ('Overhead Press',              'ohp'),
    ('Overhead Press',              'strict press'),
    ('Overhead Press',              'military press'),
    ('Overhead Press',              'shoulder press'),
    ('Overhead Press',              'standing press'),
    ('Push Press',                  'push press barbell'),
    ('Dumbbell Shoulder Press',     'db shoulder press'),
    ('Dumbbell Shoulder Press',     'seated db press'),

    -- Deadlift
    ('Deadlift',                    'conventional deadlift'),
    ('Deadlift',                    'dl'),
    ('Deadlift',                    'DL'),
    ('Romanian Deadlift',           'RDL'),
    ('Romanian Deadlift',           'rdl'),
    ('Romanian Deadlift',           'romanian'),
    ('Romanian Deadlift',           'romanian dl'),
    ('Stiff-Leg Deadlift',          'SLDL'),
    ('Stiff-Leg Deadlift',          'straight leg deadlift'),
    ('Trap Bar Deadlift',           'hex bar deadlift'),
    ('Trap Bar Deadlift',           'trap bar dl'),

    -- Squat
    ('Back Squat',                  'squat'),
    ('Back Squat',                  'barbell squat'),
    ('Back Squat',                  'BS'),
    ('Front Squat',                 'FS'),
    ('Front Squat',                 'front squat barbell'),
    ('Bulgarian Split Squat',       'BSS'),
    ('Bulgarian Split Squat',       'bss'),
    ('Bulgarian Split Squat',       'split squat'),
    ('Goblet Squat',                'kb squat'),

    -- Pull movements
    ('Pull-Up',                     'pullup'),
    ('Pull-Up',                     'pull up'),
    ('Chin-Up',                     'chinup'),
    ('Chin-Up',                     'chin up'),
    ('Lat Pulldown',                'pulldown'),
    ('Lat Pulldown',                'lats pulldown'),
    ('Barbell Row',                 'bent over row'),
    ('Barbell Row',                 'BOR'),
    ('Barbell Row',                 'barbell bent-over row'),
    ('Single-Arm Dumbbell Row',     'db row'),
    ('Single-Arm Dumbbell Row',     'one arm row'),
    ('Seated Cable Row',            'cable row'),
    ('Seated Cable Row',            'low cable row'),

    -- Curl / biceps
    ('Barbell Curl',                'bb curl'),
    ('Dumbbell Curl',               'db curl'),
    ('Hammer Curl',                 'neutral grip curl'),
    ('Preacher Curl',               'scott curl'),
    ('EZ-Bar Curl',                 'ez curl'),
    ('EZ-Bar Curl',                 'EZ bar curl'),

    -- Triceps
    ('Skull Crusher',               'lying tricep extension'),
    ('Skull Crusher',               'french press'),
    ('Triceps Pushdown',            'pushdown'),
    ('Overhead Triceps Extension',  'french curl'),
    ('Overhead Triceps Extension',  'tricep overhead extension'),
    ('EZ-Bar Skull Crusher',        'EZ skull crusher'),

    -- Glutes / hips
    ('Barbell Hip Thrust',          'hip thrust'),
    ('Barbell Hip Thrust',          'HT'),
    ('Glute Bridge',                'bridge'),
    ('Romanian Deadlift',           'hip hinge'),
    ('Cable Pull-Through',          'pull through'),

    -- Calf
    ('Standing Calf Raise',         'calf raise'),
    ('Standing Calf Raise',         'SCR'),
    ('Seated Calf Raise',           'seated calf'),

    -- Core
    ('Ab Wheel Rollout',            'ab roller'),
    ('Ab Wheel Rollout',            'rollout'),
    ('Hanging Leg Raise',           'HLR'),
    ('Hanging Leg Raise',           'hanging raises'),
    ('Toes-to-Bar',                 'T2B'),
    ('Toes-to-Bar',                 'toes to bar'),
    ('Pallof Press',                'palloff press'),

    -- Olympic
    ('Snatch',                      'full snatch'),
    ('Clean and Jerk',              'C&J'),
    ('Clean and Jerk',              'clean jerk'),
    ('Power Clean',                 'PC'),
    ('Power Clean',                 'power clean barbell'),
    ('Overhead Squat',              'OHS'),

    -- Cardio
    ('Running (Outdoor)',           'run'),
    ('Running (Outdoor)',           'outdoor run'),
    ('Running (Outdoor)',           'jogging'),
    ('Treadmill Run',               'treadmill'),
    ('Rowing (Erg)',                'rowing machine'),
    ('Rowing (Erg)',                'erg'),
    ('Rowing (Erg)',                'concept 2'),
    ('Assault Bike',                'airdyne'),
    ('Assault Bike',                'echo bike'),
    ('Stationary Bike',             'spin bike'),
    ('Jump Rope',                   'skipping'),
    ('Jump Rope',                   'jump rope skipping'),

    -- Face pull / rear delt
    ('Face Pull',                   'face pulls'),
    ('Face Pull',                   'rear delt cable'),
    ('Bent-Over Reverse Fly',       'reverse fly'),
    ('Bent-Over Reverse Fly',       'rear delt fly'),
    ('Reverse Pec Deck',            'rear delt pec deck'),

    -- Plyometrics
    ('Box Jump',                    'box jumps'),
    ('Medicine Ball Slam',          'med ball slam'),
    ('Medicine Ball Slam',          'slam ball'),

    -- Lateral raise
    ('Lateral Raise',               'lat raise'),
    ('Lateral Raise',               'side raise'),
    ('Cable Lateral Raise',         'cable side raise'),

    -- Misc compounds
    ('Kettlebell Swing',            'KB swing'),
    ('Kettlebell Swing',            'swing'),
    ('Farmer''s Carry',              'farmer carry'),
    ('Farmer''s Carry',              'farmer walk'),
    ('Shrug (Barbell)',              'barbell shrug'),
    ('Shrug (Barbell)',              'shrugs'),
    ('Shrug (Dumbbell)',             'dumbbell shrug'),
    ('Sled Push',                   'prowler push'),
    ('Sled Pull',                   'sled drag')
) AS a(exercise_name, alias) ON e.name = a.exercise_name
WHERE NOT EXISTS (
    SELECT 1 FROM exercise_aliases ea
    WHERE ea.exercise_id = e.id AND ea.alias = a.alias
);

-- ---------------------------------------------------------------------------
-- DEV-DATABASE OUTPUT
-- 1. Migration: migrations/20260502_seed_exercise_library.sql (this file).
-- 2. Rows inserted: ~160 exercises across all categories.
-- 3. Aliases inserted: ~100 common colloquial names for the most popular movements.
-- 4. Idempotent: INSERT ... ON CONFLICT DO NOTHING; WHERE NOT EXISTS.
-- 5. Breaking changes for backend-dev: none. New rows only.
-- 6. Notes:
--    - The ON CONFLICT clause requires a unique index on exercises.name.
--      The migration adds it if missing (DO block above).
--    - pg_trgm extension is required for the existing GIN index on exercises.name.
--      CREATE EXTENSION IF NOT EXISTS pg_trgm added at top for safety.
-- ---------------------------------------------------------------------------


-- #############################################################################
-- # SOURCE: migrations/20260502_percentile_engine.sql
-- #############################################################################

-- Peak Fettle — Percentile engine migration
-- Author: dev-database + data-analyst subteam
-- Date: 2026-05-02
-- Source: compute_percentile.sql, lift_vectors_seed.sql, strength_curve_model.md
--
-- What this migration installs (idempotent — safe to run twice):
--   1. lift_vectors           — per (lift × sex) parameter table for the log-normal model
--   2. norm_cdf()             — Abramowitz & Stegun normal CDF approximation
--   3. resolve_lift_vector()  — collapses inheritance chains to a final (mu, sigma) pair
--   4. compute_percentile()   — main function: given a user's 1RM, returns [0, 100]
--   5. compute_percentile_batch() — called by the weekly cron job
--   6. v_user_lift_inputs     — view over users + sets used by the batch job
--   7. user_percentile_rankings — one row per (user × lift), updated by cron weekly
--   8. Seed data for lift_vectors (model_version = 1, 5 base lifts + ~80 inherited)
--   9. v_lift_vector_summary  — dev-team verification view

-- ---------------------------------------------------------------------------
-- 1. lift_vectors — the per (lift × sex) coefficient table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lift_vectors (
    lift_id              TEXT     NOT NULL,
    sex                  CHAR(1)  NOT NULL CHECK (sex IN ('M','F')),
    model_version        INTEGER  NOT NULL DEFAULT 1,

    -- Distribution parameters (log-normal)
    mu                   DOUBLE PRECISION,
    sigma                DOUBLE PRECISION,

    -- Bodyweight scaling
    alpha                DOUBLE PRECISION NOT NULL DEFAULT 0.667,
    bw_ref_kg            DOUBLE PRECISION NOT NULL DEFAULT 75,

    -- Age curve (piecewise linear)
    age_peak_lo          INTEGER  NOT NULL DEFAULT 23,
    age_peak_hi          INTEGER  NOT NULL DEFAULT 35,
    youth_decay_per_year DOUBLE PRECISION NOT NULL DEFAULT 0.012,
    age_decay_per_year   DOUBLE PRECISION NOT NULL DEFAULT 0.010,

    -- Training-experience curve (first-order kinetics)
    training_floor       DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    training_tau_years   DOUBLE PRECISION NOT NULL DEFAULT 3.0,

    -- Inheritance
    parent_lift_id       TEXT,
    inheritance_ratio    DOUBLE PRECISION,

    -- Provenance
    fit_source           TEXT,
    fit_sample_size      INTEGER,
    notes                TEXT,

    PRIMARY KEY (lift_id, sex, model_version),
    CHECK (
        (mu IS NOT NULL AND sigma IS NOT NULL)
        OR
        (parent_lift_id IS NOT NULL AND inheritance_ratio IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS lift_vectors_lookup_idx
    ON lift_vectors (lift_id, sex, model_version);


-- ---------------------------------------------------------------------------
-- 2. norm_cdf — Abramowitz & Stegun 26.2.17 approximation, max error 7.5e-8
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION norm_cdf(z DOUBLE PRECISION)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE AS $$
DECLARE
    p   CONSTANT DOUBLE PRECISION := 0.2316419;
    b1  CONSTANT DOUBLE PRECISION := 0.319381530;
    b2  CONSTANT DOUBLE PRECISION := -0.356563782;
    b3  CONSTANT DOUBLE PRECISION := 1.781477937;
    b4  CONSTANT DOUBLE PRECISION := -1.821255978;
    b5  CONSTANT DOUBLE PRECISION := 1.330274429;
    abs_z DOUBLE PRECISION;
    t     DOUBLE PRECISION;
    pdf   DOUBLE PRECISION;
    poly  DOUBLE PRECISION;
    cdf   DOUBLE PRECISION;
BEGIN
    abs_z := abs(z);
    t     := 1.0 / (1.0 + p * abs_z);
    pdf   := exp(-0.5 * abs_z * abs_z) / sqrt(2.0 * pi());
    poly  := b1*t + b2*t^2 + b3*t^3 + b4*t^4 + b5*t^5;
    cdf   := 1.0 - pdf * poly;
    IF z < 0 THEN
        RETURN 1.0 - cdf;
    ELSE
        RETURN cdf;
    END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. resolve_lift_vector — collapses inheritance to final (mu, sigma, ...)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_lift_vector(
    p_lift_id        TEXT,
    p_sex            CHAR(1),
    p_model_version  INTEGER DEFAULT 1
)
RETURNS TABLE (
    mu                   DOUBLE PRECISION,
    sigma                DOUBLE PRECISION,
    alpha                DOUBLE PRECISION,
    bw_ref_kg            DOUBLE PRECISION,
    age_peak_lo          INTEGER,
    age_peak_hi          INTEGER,
    youth_decay_per_year DOUBLE PRECISION,
    age_decay_per_year   DOUBLE PRECISION,
    training_floor       DOUBLE PRECISION,
    training_tau_years   DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    rec lift_vectors%ROWTYPE;
    parent_rec RECORD;
BEGIN
    SELECT * INTO rec
      FROM lift_vectors
     WHERE lift_id = p_lift_id AND sex = p_sex AND model_version = p_model_version;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No lift_vectors row for (%, %, v%)', p_lift_id, p_sex, p_model_version;
    END IF;

    IF rec.mu IS NOT NULL AND rec.sigma IS NOT NULL THEN
        RETURN QUERY SELECT
            rec.mu, rec.sigma, rec.alpha, rec.bw_ref_kg,
            rec.age_peak_lo, rec.age_peak_hi,
            rec.youth_decay_per_year, rec.age_decay_per_year,
            rec.training_floor, rec.training_tau_years;
        RETURN;
    END IF;

    SELECT * INTO parent_rec
      FROM resolve_lift_vector(rec.parent_lift_id, p_sex, p_model_version);

    RETURN QUERY SELECT
        parent_rec.mu + ln(rec.inheritance_ratio)   AS mu,
        parent_rec.sigma                            AS sigma,
        COALESCE(rec.alpha, parent_rec.alpha)       AS alpha,
        COALESCE(rec.bw_ref_kg, parent_rec.bw_ref_kg) AS bw_ref_kg,
        COALESCE(rec.age_peak_lo, parent_rec.age_peak_lo),
        COALESCE(rec.age_peak_hi, parent_rec.age_peak_hi),
        COALESCE(rec.youth_decay_per_year, parent_rec.youth_decay_per_year),
        COALESCE(rec.age_decay_per_year, parent_rec.age_decay_per_year),
        COALESCE(rec.training_floor, parent_rec.training_floor),
        COALESCE(rec.training_tau_years, parent_rec.training_tau_years);
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. compute_percentile — main ranking function
-- ---------------------------------------------------------------------------
-- Returns [0, 100] for a given user's lift relative to their cohort.
-- Inputs: lift_id, sex, bodyweight_kg, age, training_yrs, lift_kg (1RM equiv)
CREATE OR REPLACE FUNCTION compute_percentile(
    p_lift_id        TEXT,
    p_sex            CHAR(1),
    p_bodyweight_kg  DOUBLE PRECISION,
    p_age            INTEGER,
    p_training_yrs   DOUBLE PRECISION,
    p_lift_kg        DOUBLE PRECISION,
    p_model_version  INTEGER DEFAULT 1
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    v RECORD;
    bw_clamped     DOUBLE PRECISION;
    age_clamped    INTEGER;
    yrs_clamped    DOUBLE PRECISION;
    age_factor     DOUBLE PRECISION;
    train_factor   DOUBLE PRECISION;
    bw_factor      DOUBLE PRECISION;
    log_expected   DOUBLE PRECISION;
    z              DOUBLE PRECISION;
BEGIN
    IF p_lift_kg IS NULL OR p_lift_kg <= 0 THEN RETURN NULL; END IF;
    IF p_bodyweight_kg IS NULL OR p_bodyweight_kg <= 0 THEN RETURN NULL; END IF;
    IF p_age IS NULL OR p_age < 10 THEN RETURN NULL; END IF;
    IF p_sex NOT IN ('M','F') THEN RETURN NULL; END IF;

    bw_clamped  := GREATEST(40,
                       LEAST(p_bodyweight_kg, CASE p_sex WHEN 'M' THEN 210 ELSE 150 END));
    age_clamped := GREATEST(14, LEAST(p_age, 90));
    yrs_clamped := GREATEST(0,  LEAST(COALESCE(p_training_yrs, 0), 30));

    SELECT * INTO v
      FROM resolve_lift_vector(p_lift_id, p_sex, p_model_version);

    bw_factor := power(bw_clamped / v.bw_ref_kg, v.alpha);

    IF age_clamped < v.age_peak_lo THEN
        age_factor := GREATEST(0.40, 1.0 - v.youth_decay_per_year * (v.age_peak_lo - age_clamped));
    ELSIF age_clamped <= v.age_peak_hi THEN
        age_factor := 1.0;
    ELSE
        age_factor := GREATEST(0.40, 1.0 - v.age_decay_per_year * (age_clamped - v.age_peak_hi));
    END IF;

    train_factor := v.training_floor +
                   (1.0 - v.training_floor) *
                   (1.0 - exp(-yrs_clamped / v.training_tau_years));

    log_expected := v.mu + ln(bw_factor) + ln(age_factor) + ln(train_factor);

    z := GREATEST(-4.0, LEAST(4.0, (ln(p_lift_kg) - log_expected) / v.sigma));

    RETURN 100.0 * norm_cdf(z);
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. v_user_lift_inputs — source view for the weekly batch
-- ---------------------------------------------------------------------------
-- Aggregates each user's best Epley E1RM per exercise from their logged sets.
-- The batch job reads this view; it never touches the raw sets table directly.
--
-- Epley E1RM formula: weight_kg * (1 + reps / 30)
-- Only lift sets with reps >= 1 are included; bodyweight exercises excluded
-- (weight_kg > 0 guard).
--
-- NOTE: Users with sex = 'X' (opted out) are excluded from percentile ranking
-- because the model is calibrated on binary sex categories. They can still log
-- normally; their data simply won't feed the ranking table.

CREATE OR REPLACE VIEW v_user_lift_inputs AS
SELECT
    u.id                                          AS user_id,
    s.exercise_id,
    e.name                                        AS exercise_name,
    -- Map the exercise name to the lift_vectors lift_id.
    -- Convention: exercise names are stored in the library exactly matching
    -- lift_id keys (snake_case). The exercises migration seeds them this way.
    REPLACE(LOWER(e.name), ' ', '_')              AS lift_id,
    u.sex,
    COALESCE(u.weight_class_kg,
        -- Fall back to a derived estimate from the heaviest set weight if no class set.
        -- This is a rough heuristic only; users should be encouraged to set their profile.
        CASE u.sex WHEN 'M' THEN 83 ELSE 66 END
    )::DOUBLE PRECISION                           AS bodyweight_kg,
    EXTRACT(YEAR FROM AGE(NOW(), u.birth_date))::INTEGER AS age,
    COALESCE(u.years_in_sport, 0)::DOUBLE PRECISION AS training_years,
    -- Best Epley E1RM across all logged sets for this exercise.
    -- CTO guardrail #12 (N-03, 2026-05-03): do not apply Epley for singles (reps = 1).
    -- A 200 kg single must return exactly 200 kg, not 206.7 kg.
    MAX(
        CASE WHEN s.reps = 1 THEN s.weight_kg
             ELSE s.weight_kg * (1.0 + s.reps / 30.0)
        END
    )                                              AS best_one_rm_kg
FROM sets s
JOIN users u  ON u.id  = s.user_id
JOIN exercises e ON e.id = s.exercise_id
WHERE
    s.kind        = 'lift'
    AND s.reps    >= 1
    AND s.weight_kg > 0
    AND u.sex     IN ('M', 'F')          -- 'X' opted-out users excluded
    AND u.deleted_at IS NULL
    AND u.birth_date IS NOT NULL         -- age required for model
GROUP BY
    u.id, s.exercise_id, e.name, u.sex,
    u.weight_class_kg, u.birth_date, u.years_in_sport;


-- ---------------------------------------------------------------------------
-- 6. compute_percentile_batch — bulk ranking function (called by cron)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_percentile_batch(
    p_model_version INTEGER DEFAULT 1
)
RETURNS TABLE (
    user_id     UUID,
    lift_id     TEXT,
    percentile  DOUBLE PRECISION,
    computed_at TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
    SELECT
        u.user_id,
        u.lift_id,
        compute_percentile(
            u.lift_id,
            u.sex,
            u.bodyweight_kg,
            u.age,
            u.training_years,
            u.best_one_rm_kg,
            p_model_version
        ) AS percentile,
        now() AS computed_at
    FROM v_user_lift_inputs u
    WHERE u.best_one_rm_kg > 0;
$$;


-- ---------------------------------------------------------------------------
-- 7. user_percentile_rankings — persisted output of the weekly cron
-- ---------------------------------------------------------------------------
-- One row per (user × lift_id). The cron job upserts into this table weekly.
-- The API reads from here — no live computation at query time.
CREATE TABLE IF NOT EXISTS user_percentile_rankings (
    user_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lift_id       TEXT    NOT NULL,
    percentile    DOUBLE PRECISION,          -- NULL if compute_percentile() returned NULL
    model_version INTEGER NOT NULL DEFAULT 1,
    computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, lift_id, model_version)
);

CREATE INDEX IF NOT EXISTS idx_upr_user
    ON user_percentile_rankings(user_id);

CREATE INDEX IF NOT EXISTS idx_upr_lift
    ON user_percentile_rankings(lift_id);


-- ---------------------------------------------------------------------------
-- 8. Seed data — lift_vectors model_version = 1
-- N-08: replaced DELETE + INSERT with INSERT ... ON CONFLICT DO UPDATE so
-- this migration is idempotent (safe to re-run on db reset without losing data
-- or failing with duplicate-key errors).
-- ---------------------------------------------------------------------------

-- BACK SQUAT
INSERT INTO lift_vectors (lift_id, sex, model_version, mu, sigma, alpha, bw_ref_kg, fit_source, fit_sample_size, notes) VALUES
 ('back_squat', 'M', 1, 4.7228, 0.3107, 0.667, 75, 'Bielik 2024 + USAPL standards', 571650, 'Intermediate=1.50xBW; Elite=2.50xBW'),
 ('back_squat', 'F', 1, 4.1744, 0.2934, 0.667, 65, 'Bielik 2024 + USAPL standards', 238336, 'Intermediate=1.00xBW; Elite=1.65xBW')
ON CONFLICT (lift_id, sex, model_version) DO UPDATE SET
    mu = EXCLUDED.mu, sigma = EXCLUDED.sigma, alpha = EXCLUDED.alpha,
    bw_ref_kg = EXCLUDED.bw_ref_kg, fit_source = EXCLUDED.fit_source,
    fit_sample_size = EXCLUDED.fit_sample_size, notes = EXCLUDED.notes;

-- BENCH PRESS
INSERT INTO lift_vectors (lift_id, sex, model_version, mu, sigma, alpha, bw_ref_kg, fit_source, fit_sample_size, notes) VALUES
 ('bench_press', 'M', 1, 4.3175, 0.2466, 0.667, 75, 'Bielik 2024 + USAPL standards', 571650, 'Intermediate=1.00xBW; Elite=1.50xBW'),
 ('bench_press', 'F', 1, 3.8177, 0.2749, 0.667, 65, 'Bielik 2024 + USAPL standards', 238336, 'Intermediate=0.70xBW; Elite=1.10xBW')
ON CONFLICT (lift_id, sex, model_version) DO UPDATE SET
    mu = EXCLUDED.mu, sigma = EXCLUDED.sigma, alpha = EXCLUDED.alpha,
    bw_ref_kg = EXCLUDED.bw_ref_kg, fit_source = EXCLUDED.fit_source,
    fit_sample_size = EXCLUDED.fit_sample_size, notes = EXCLUDED.notes;

-- DEADLIFT
INSERT INTO lift_vectors (lift_id, sex, model_version, mu, sigma, alpha, bw_ref_kg, fit_source, fit_sample_size, notes) VALUES
 ('deadlift', 'M', 1, 4.8767, 0.2741, 0.667, 75, 'Bielik 2024 + USAPL standards', 571650, 'Intermediate=1.75xBW; Elite=2.75xBW'),
 ('deadlift', 'F', 1, 4.4067, 0.2697, 0.667, 65, 'Bielik 2024 + USAPL standards', 238336, 'Intermediate=1.25xBW; Elite=1.95xBW')
ON CONFLICT (lift_id, sex, model_version) DO UPDATE SET
    mu = EXCLUDED.mu, sigma = EXCLUDED.sigma, alpha = EXCLUDED.alpha,
    bw_ref_kg = EXCLUDED.bw_ref_kg, fit_source = EXCLUDED.fit_source,
    fit_sample_size = EXCLUDED.fit_sample_size, notes = EXCLUDED.notes;

-- OVERHEAD PRESS
INSERT INTO lift_vectors (lift_id, sex, model_version, mu, sigma, alpha, bw_ref_kg, fit_source, fit_sample_size, notes) VALUES
 ('overhead_press', 'M', 1, 3.8849, 0.2913, 0.667, 75, 'Industry aggregator + standards', 50000, 'Intermediate=0.65xBW; Elite=1.05xBW'),
 ('overhead_press', 'F', 1, 3.3781, 0.3105, 0.667, 65, 'Industry aggregator + standards', 25000, 'Intermediate=0.45xBW; Elite=0.75xBW')
ON CONFLICT (lift_id, sex, model_version) DO UPDATE SET
    mu = EXCLUDED.mu, sigma = EXCLUDED.sigma, alpha = EXCLUDED.alpha,
    bw_ref_kg = EXCLUDED.bw_ref_kg, fit_source = EXCLUDED.fit_source,
    fit_sample_size = EXCLUDED.fit_sample_size, notes = EXCLUDED.notes;

-- BARBELL ROW
INSERT INTO lift_vectors (lift_id, sex, model_version, mu, sigma, alpha, bw_ref_kg, fit_source, fit_sample_size, notes) VALUES
 ('barbell_row', 'M', 1, 4.2049, 0.2466, 0.667, 75, 'Strength Level + standards', 80000, 'Calibrated to 0.90 of bench press distribution'),
 ('barbell_row', 'F', 1, 3.7124, 0.2749, 0.667, 65, 'Strength Level + standards', 40000, 'Calibrated to 0.90 of bench press distribution')
ON CONFLICT (lift_id, sex, model_version) DO UPDATE SET
    mu = EXCLUDED.mu, sigma = EXCLUDED.sigma, alpha = EXCLUDED.alpha,
    bw_ref_kg = EXCLUDED.bw_ref_kg, fit_source = EXCLUDED.fit_source,
    fit_sample_size = EXCLUDED.fit_sample_size, notes = EXCLUDED.notes;

-- Inherited lifts
INSERT INTO lift_vectors (lift_id, sex, model_version, parent_lift_id, inheritance_ratio, bw_ref_kg, fit_source, notes) VALUES
 -- Squat family
 ('front_squat',           'M', 1, 'back_squat', 0.85, 75, 'Industry aggregator', 'FS ~85% of BS'),
 ('front_squat',           'F', 1, 'back_squat', 0.85, 65, 'Industry aggregator', 'FS ~85% of BS'),
 ('low_bar_squat',         'M', 1, 'back_squat', 1.05, 75, 'Industry aggregator', 'LB ~105%'),
 ('low_bar_squat',         'F', 1, 'back_squat', 1.05, 65, 'Industry aggregator', 'LB ~105%'),
 ('high_bar_squat',        'M', 1, 'back_squat', 0.95, 75, 'Industry aggregator', 'HB ~95%'),
 ('high_bar_squat',        'F', 1, 'back_squat', 0.95, 65, 'Industry aggregator', 'HB ~95%'),
 ('paused_squat',          'M', 1, 'back_squat', 0.92, 75, 'Industry aggregator', 'Paused ~92%'),
 ('paused_squat',          'F', 1, 'back_squat', 0.92, 65, 'Industry aggregator', 'Paused ~92%'),
 ('box_squat',             'M', 1, 'back_squat', 0.90, 75, 'Industry aggregator', 'Box ~90%'),
 ('box_squat',             'F', 1, 'back_squat', 0.90, 65, 'Industry aggregator', 'Box ~90%'),
 ('zercher_squat',         'M', 1, 'back_squat', 0.78, 75, 'Industry aggregator', 'Zercher ~78%'),
 ('zercher_squat',         'F', 1, 'back_squat', 0.78, 65, 'Industry aggregator', 'Zercher ~78%'),
 ('safety_bar_squat',      'M', 1, 'back_squat', 0.92, 75, 'Industry aggregator', 'SSB ~92%'),
 ('safety_bar_squat',      'F', 1, 'back_squat', 0.92, 65, 'Industry aggregator', 'SSB ~92%'),
 ('hack_squat_machine',    'M', 1, 'back_squat', 0.90, 75, 'Industry aggregator', 'Machine ~90%'),
 ('hack_squat_machine',    'F', 1, 'back_squat', 0.90, 65, 'Industry aggregator', 'Machine ~90%'),
 ('leg_press_machine',     'M', 1, 'back_squat', 2.50, 75, 'Industry aggregator', '~2.5x BS'),
 ('leg_press_machine',     'F', 1, 'back_squat', 2.50, 65, 'Industry aggregator', '~2.5x BS'),
 ('bulgarian_split_squat', 'M', 1, 'back_squat', 0.40, 75, 'Industry aggregator', 'Per-leg ~40%'),
 ('bulgarian_split_squat', 'F', 1, 'back_squat', 0.40, 65, 'Industry aggregator', 'Per-leg ~40%'),
 ('goblet_squat',          'M', 1, 'back_squat', 0.45, 75, 'Industry aggregator', 'Limited by anterior load'),
 ('goblet_squat',          'F', 1, 'back_squat', 0.45, 65, 'Industry aggregator', 'Limited by anterior load'),
 -- Bench family
 ('incline_bench_press',   'M', 1, 'bench_press', 0.78, 75, 'Industry aggregator', 'Incline ~78%'),
 ('incline_bench_press',   'F', 1, 'bench_press', 0.78, 65, 'Industry aggregator', 'Incline ~78%'),
 ('decline_bench_press',   'M', 1, 'bench_press', 1.05, 75, 'Industry aggregator', 'Decline ~105%'),
 ('decline_bench_press',   'F', 1, 'bench_press', 1.05, 65, 'Industry aggregator', 'Decline ~105%'),
 ('close_grip_bench',      'M', 1, 'bench_press', 0.90, 75, 'Industry aggregator', 'CGB ~90%'),
 ('close_grip_bench',      'F', 1, 'bench_press', 0.90, 65, 'Industry aggregator', 'CGB ~90%'),
 ('paused_bench_press',    'M', 1, 'bench_press', 0.92, 75, 'Industry aggregator', 'Paused ~92%'),
 ('paused_bench_press',    'F', 1, 'bench_press', 0.92, 65, 'Industry aggregator', 'Paused ~92%'),
 ('floor_press',           'M', 1, 'bench_press', 0.88, 75, 'Industry aggregator', 'Floor ~88%'),
 ('floor_press',           'F', 1, 'bench_press', 0.88, 65, 'Industry aggregator', 'Floor ~88%'),
 ('chest_press_machine',   'M', 1, 'bench_press', 0.95, 75, 'Industry aggregator', 'Machine ~95%'),
 ('chest_press_machine',   'F', 1, 'bench_press', 0.95, 65, 'Industry aggregator', 'Machine ~95%'),
 ('dumbbell_bench_press',  'M', 1, 'bench_press', 0.42, 75, 'Industry aggregator', 'PER-DB ~42%'),
 ('dumbbell_bench_press',  'F', 1, 'bench_press', 0.42, 65, 'Industry aggregator', 'PER-DB ~42%'),
 ('dumbbell_incline_press','M', 1, 'bench_press', 0.33, 75, 'Industry aggregator', 'PER-DB ~33%'),
 ('dumbbell_incline_press','F', 1, 'bench_press', 0.33, 65, 'Industry aggregator', 'PER-DB ~33%'),
 -- Deadlift family
 ('sumo_deadlift',         'M', 1, 'deadlift', 1.00, 75, 'Industry aggregator', 'Comparable to conventional'),
 ('sumo_deadlift',         'F', 1, 'deadlift', 1.00, 65, 'Industry aggregator', 'Often higher for women'),
 ('romanian_deadlift',     'M', 1, 'deadlift', 0.82, 75, 'Industry aggregator', 'RDL ~82%'),
 ('romanian_deadlift',     'F', 1, 'deadlift', 0.82, 65, 'Industry aggregator', 'RDL ~82%'),
 ('stiff_leg_deadlift',    'M', 1, 'deadlift', 0.78, 75, 'Industry aggregator', 'SLDL ~78%'),
 ('stiff_leg_deadlift',    'F', 1, 'deadlift', 0.78, 65, 'Industry aggregator', 'SLDL ~78%'),
 ('deficit_deadlift',      'M', 1, 'deadlift', 0.85, 75, 'Industry aggregator', 'Deficit ~85%'),
 ('deficit_deadlift',      'F', 1, 'deadlift', 0.85, 65, 'Industry aggregator', 'Deficit ~85%'),
 ('rack_pull',             'M', 1, 'deadlift', 1.30, 75, 'Industry aggregator', 'Mid-shin ~130%'),
 ('rack_pull',             'F', 1, 'deadlift', 1.30, 65, 'Industry aggregator', 'Mid-shin ~130%'),
 ('trap_bar_deadlift',     'M', 1, 'deadlift', 1.05, 75, 'Industry aggregator', 'Trap bar ~105%'),
 ('trap_bar_deadlift',     'F', 1, 'deadlift', 1.05, 65, 'Industry aggregator', 'Trap bar ~105%'),
 -- Overhead family
 ('push_press',            'M', 1, 'overhead_press', 1.30, 75, 'Industry aggregator', 'PP ~130%'),
 ('push_press',            'F', 1, 'overhead_press', 1.30, 65, 'Industry aggregator', 'PP ~130%'),
 ('seated_overhead_press', 'M', 1, 'overhead_press', 0.92, 75, 'Industry aggregator', 'Seated ~92%'),
 ('seated_overhead_press', 'F', 1, 'overhead_press', 0.92, 65, 'Industry aggregator', 'Seated ~92%'),
 ('arnold_press',          'M', 1, 'overhead_press', 0.55, 75, 'Industry aggregator', 'PER-DB ~55%'),
 ('arnold_press',          'F', 1, 'overhead_press', 0.55, 65, 'Industry aggregator', 'PER-DB ~55%'),
 ('dumbbell_shoulder_press','M', 1, 'overhead_press', 0.42, 75, 'Industry aggregator', 'PER-DB ~42%'),
 ('dumbbell_shoulder_press','F', 1, 'overhead_press', 0.42, 65, 'Industry aggregator', 'PER-DB ~42%'),
 ('lateral_raise',         'M', 1, 'overhead_press', 0.18, 75, 'Industry aggregator', 'PER-DB; isolation'),
 ('lateral_raise',         'F', 1, 'overhead_press', 0.18, 65, 'Industry aggregator', 'PER-DB; isolation'),
 -- Row family
 ('pendlay_row',           'M', 1, 'barbell_row', 0.92, 75, 'Industry aggregator', 'Strict pause ~92%'),
 ('pendlay_row',           'F', 1, 'barbell_row', 0.92, 65, 'Industry aggregator', 'Strict pause ~92%'),
 ('t_bar_row',             'M', 1, 'barbell_row', 1.05, 75, 'Industry aggregator', 'T-bar ~105%'),
 ('t_bar_row',             'F', 1, 'barbell_row', 1.05, 65, 'Industry aggregator', 'T-bar ~105%'),
 ('seated_cable_row',      'M', 1, 'barbell_row', 0.85, 75, 'Industry aggregator', 'Cable ~85%'),
 ('seated_cable_row',      'F', 1, 'barbell_row', 0.85, 65, 'Industry aggregator', 'Cable ~85%'),
 ('chest_supported_row',   'M', 1, 'barbell_row', 0.90, 75, 'Industry aggregator', 'CSR ~90%'),
 ('chest_supported_row',   'F', 1, 'barbell_row', 0.90, 65, 'Industry aggregator', 'CSR ~90%'),
 ('lat_pulldown',          'M', 1, 'barbell_row', 0.95, 75, 'Industry aggregator', 'Pulldown ~95%'),
 ('lat_pulldown',          'F', 1, 'barbell_row', 0.95, 65, 'Industry aggregator', 'Pulldown ~95%'),
 ('dumbbell_row',          'M', 1, 'barbell_row', 0.40, 75, 'Industry aggregator', 'PER-DB ~40%'),
 ('dumbbell_row',          'F', 1, 'barbell_row', 0.40, 65, 'Industry aggregator', 'PER-DB ~40%'),
 -- Pull / dip / arms
 ('weighted_pull_up',      'M', 1, 'bench_press', 0.55, 75, 'Industry aggregator', 'Added load only'),
 ('weighted_pull_up',      'F', 1, 'bench_press', 0.55, 65, 'Industry aggregator', 'Added load only'),
 ('weighted_chin_up',      'M', 1, 'bench_press', 0.60, 75, 'Industry aggregator', 'Chins slightly stronger'),
 ('weighted_chin_up',      'F', 1, 'bench_press', 0.60, 65, 'Industry aggregator', 'Chins slightly stronger'),
 ('weighted_dip',          'M', 1, 'bench_press', 0.65, 75, 'Industry aggregator', 'Added load only'),
 ('weighted_dip',          'F', 1, 'bench_press', 0.65, 65, 'Industry aggregator', 'Added load only'),
 ('barbell_curl',          'M', 1, 'bench_press', 0.40, 75, 'Industry aggregator', 'Curl ~40%'),
 ('barbell_curl',          'F', 1, 'bench_press', 0.40, 65, 'Industry aggregator', 'Curl ~40%'),
 ('ez_bar_curl',           'M', 1, 'bench_press', 0.42, 75, 'Industry aggregator', 'EZ slightly heavier'),
 ('ez_bar_curl',           'F', 1, 'bench_press', 0.42, 65, 'Industry aggregator', 'EZ slightly heavier'),
 ('dumbbell_curl',         'M', 1, 'bench_press', 0.18, 75, 'Industry aggregator', 'PER-DB'),
 ('dumbbell_curl',         'F', 1, 'bench_press', 0.18, 65, 'Industry aggregator', 'PER-DB'),
 ('preacher_curl',         'M', 1, 'bench_press', 0.35, 75, 'Industry aggregator', 'Slightly weaker'),
 ('preacher_curl',         'F', 1, 'bench_press', 0.35, 65, 'Industry aggregator', 'Slightly weaker'),
 ('skullcrusher',          'M', 1, 'bench_press', 0.45, 75, 'Industry aggregator', 'Tricep ~45%'),
 ('skullcrusher',          'F', 1, 'bench_press', 0.45, 65, 'Industry aggregator', 'Tricep ~45%'),
 ('tricep_pushdown',       'M', 1, 'bench_press', 0.50, 75, 'Industry aggregator', 'Cable ~50%'),
 ('tricep_pushdown',       'F', 1, 'bench_press', 0.50, 65, 'Industry aggregator', 'Cable ~50%'),
 -- Hip / posterior
 ('hip_thrust',            'M', 1, 'back_squat', 1.50, 75, 'Industry aggregator', 'HT ~150%'),
 ('hip_thrust',            'F', 1, 'back_squat', 1.60, 65, 'Industry aggregator', 'F often higher ~160%'),
 ('glute_bridge',          'M', 1, 'back_squat', 1.30, 75, 'Industry aggregator', 'GB ~130%'),
 ('glute_bridge',          'F', 1, 'back_squat', 1.40, 65, 'Industry aggregator', 'GB ~140%'),
 ('good_morning',          'M', 1, 'back_squat', 0.50, 75, 'Industry aggregator', 'GM ~50%'),
 ('good_morning',          'F', 1, 'back_squat', 0.50, 65, 'Industry aggregator', 'GM ~50%'),
 -- Single-leg / isolation
 ('walking_lunge',         'M', 1, 'back_squat', 0.45, 75, 'Industry aggregator', 'Loaded total per side'),
 ('walking_lunge',         'F', 1, 'back_squat', 0.45, 65, 'Industry aggregator', 'Loaded total per side'),
 ('leg_curl_machine',      'M', 1, 'deadlift',   0.30, 75, 'Industry aggregator', 'Hamstring isolation'),
 ('leg_curl_machine',      'F', 1, 'deadlift',   0.30, 65, 'Industry aggregator', 'Hamstring isolation'),
 ('leg_extension_machine', 'M', 1, 'back_squat', 0.55, 75, 'Industry aggregator', 'Quad isolation'),
 ('leg_extension_machine', 'F', 1, 'back_squat', 0.55, 65, 'Industry aggregator', 'Quad isolation'),
 ('calf_raise_machine',    'M', 1, 'back_squat', 1.20, 75, 'Industry aggregator', 'Short lever, heavy'),
 ('calf_raise_machine',    'F', 1, 'back_squat', 1.20, 65, 'Industry aggregator', 'Short lever, heavy')
ON CONFLICT (lift_id, sex, model_version) DO UPDATE SET
    parent_lift_id    = EXCLUDED.parent_lift_id,
    inheritance_ratio = EXCLUDED.inheritance_ratio,
    bw_ref_kg         = EXCLUDED.bw_ref_kg,
    fit_source        = EXCLUDED.fit_source,
    notes             = EXCLUDED.notes;


-- ---------------------------------------------------------------------------
-- 9. Verification view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_lift_vector_summary AS
SELECT
    lift_id,
    sex,
    model_version,
    CASE
        WHEN mu IS NOT NULL THEN 'direct_fit'
        ELSE 'inherited_from_' || parent_lift_id || ' (' || inheritance_ratio || ')'
    END AS fit_type,
    fit_sample_size,
    notes
FROM lift_vectors
WHERE model_version = 1
ORDER BY sex, lift_id;

-- ===========================================================================
-- End of 20260502_percentile_engine.sql
-- ===========================================================================


-- #############################################################################
-- # SOURCE: migrations/20260503_lift_inputs_view.sql
-- #############################################################################

-- migrations/20260503_lift_inputs_view.sql
-- Phase D gate item: v_user_lift_inputs
-- N-07 (2026-05-03): The compute_percentile_batch() function depends on this view.
--   Phase D percentile feature is NOT complete until this migration is present and
--   the batch job has been smoke-tested against it.
--
-- This file is the canonical, standalone definition of the view.
-- 20260502_percentile_engine.sql also contains a CREATE OR REPLACE VIEW for the same
-- object; that definition and this one are kept in sync. Running both in order is safe
-- because both use CREATE OR REPLACE.
--
-- Schema decisions (documented here so Phase D review is self-contained):
--
--   • Only 'lift' kind sets are included — cardio sets carry no weight_kg 1RM.
--   • reps >= 1: singles (reps = 1) return weight_kg × (1 + 1/30) ≈ weight_kg × 1.033.
--     CTO guardrail #12 (N-03 fix 2026-05-03) corrects this at the Qt layer;
--     the view applies Epley for 2+ reps only to match that guardrail.
--   • weight_kg > 0: excludes bodyweight exercises that store 0 as weight.
--   • users.sex IN ('M','F'): users who opt out with sex = 'X' are excluded from
--     cohort ranking. They can still log freely; their data just won't feed the table.
--   • users.deleted_at IS NULL: excludes soft-deleted accounts.
--   • users.birth_date IS NOT NULL: age is required for the Schofield-derived model.
--   • weight_class_kg: if null (user hasn't set profile), a conservative default is
--     used (83 kg for M, 66 kg for F). This is flagged in the UI as "set your weight
--     class for accurate rankings" — Phase D PM task.

CREATE OR REPLACE VIEW v_user_lift_inputs AS
SELECT
    u.id                                                        AS user_id,
    s.exercise_id,
    e.name                                                      AS exercise_name,
    -- Derive lift_id from exercise name by lowercasing and replacing spaces with underscores.
    -- The exercise library seeds names in Title Case; this transform maps them to the
    -- lift_vectors.lift_id convention (e.g. "Barbell Squat" → "barbell_squat").
    REPLACE(LOWER(e.name), ' ', '_')                            AS lift_id,
    u.sex,
    COALESCE(
        u.weight_class_kg,
        -- Fallback heuristic when no weight class is set on the profile.
        CASE u.sex WHEN 'M' THEN 83 ELSE 66 END
    )::DOUBLE PRECISION                                         AS bodyweight_kg,
    EXTRACT(YEAR FROM AGE(NOW(), u.birth_date))::INTEGER        AS age,
    COALESCE(u.years_in_sport, 0)::DOUBLE PRECISION             AS training_years,
    -- Best Epley E1RM across all logged lift sets for this exercise.
    -- Epley: e1rm = weight_kg * (1 + reps / 30)
    -- Per CTO guardrail #12, the formula is only applied when reps >= 2.
    -- For singles (reps = 1) the raw weight_kg is the 1RM — no multiplier.
    MAX(
        CASE
            WHEN s.reps = 1 THEN s.weight_kg
            ELSE s.weight_kg * (1.0 + s.reps / 30.0)
        END
    )                                                           AS best_one_rm_kg
FROM sets s
JOIN users     u ON u.id  = s.user_id
JOIN exercises e ON e.id  = s.exercise_id
WHERE
    s.kind          = 'lift'
    AND s.reps      >= 1
    AND s.weight_kg > 0
    AND u.sex       IN ('M', 'F')
    AND u.deleted_at  IS NULL
    AND u.birth_date  IS NOT NULL
GROUP BY
    u.id,
    s.exercise_id,
    e.name,
    u.sex,
    u.weight_class_kg,
    u.birth_date,
    u.years_in_sport;

-- Verify the view is queryable (psql \d v_user_lift_inputs should show the columns).
-- Phase D acceptance test: after seeding at least one lift set for a user with a full
-- profile (sex M/F, birth_date, weight_class_kg), the following must return a row:
--
--   SELECT * FROM v_user_lift_inputs LIMIT 1;
--
-- The compute_percentile_batch() function in 20260502_percentile_engine.sql reads
-- this view; if the view is absent that function errors at call time, not at definition.


-- #############################################################################
-- # SOURCE: migrations/20260505_sets_weight_raw.sql
-- #############################################################################

-- migrations/20260505_sets_weight_raw.sql
-- Phase D — minimal set storage
-- Author: dev-database
-- Date: 2026-05-05
--
-- Changes:
--   1. Replace weight_kg NUMERIC(6,2) with weight_raw SMALLINT
--        storage unit: 1 unit = 0.125 kg  (i.e. stored value = actual_kg × 8)
--        precision:    0.125 kg (covers all standard plates including 1.25 kg micro)
--        max value:    32767 units = 4,095.875 kg
--   2. Add CHECK constraint on rir: NULL | -1 (not recorded) … 10
--   3. Rebuild the kind/fields CHECK that referenced weight_kg → weight_raw
--   4. Recreate v_user_lift_inputs so the percentile batch sees the correct kg value
--
-- Backward-compatible API contract:
--   The application layer (routes/sets.js) encodes on write  (weight_kg × 8 → weight_raw)
--   and decodes on read  (weight_raw ÷ 8 → weight_kg).  No client-visible change.
--
-- Idempotent: safe to re-run (column/constraint existence checks prevent duplicate errors).

-- ---------------------------------------------------------------------------
-- STEP 1 — Add weight_raw column (nullable initially to allow data migration)
-- ---------------------------------------------------------------------------
ALTER TABLE sets
    ADD COLUMN IF NOT EXISTS weight_raw SMALLINT;

-- ---------------------------------------------------------------------------
-- STEP 2 — Migrate existing data
--   Round to nearest eighth-kg unit.  NULL weight_kg (cardio rows) stays NULL.
-- ---------------------------------------------------------------------------
UPDATE sets
   SET weight_raw = ROUND(weight_kg * 8)::SMALLINT
 WHERE weight_kg IS NOT NULL
   AND weight_raw IS NULL;   -- skip if re-running after a partial run

-- ---------------------------------------------------------------------------
-- STEP 3 — Drop the old CHECK constraint that references weight_kg
--   The constraint was created inline in 20260430_initial_schema.sql without an
--   explicit name, so Postgres assigned one automatically.  We find it by
--   inspecting pg_constraint rather than hard-coding the generated name.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    _cname TEXT;
BEGIN
    SELECT conname INTO _cname
      FROM pg_constraint
     WHERE conrelid = 'sets'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) LIKE '%weight_kg%';
    IF _cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE sets DROP CONSTRAINT %I', _cname);
        RAISE NOTICE 'Dropped constraint % (referenced weight_kg)', _cname;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- STEP 4 — Drop weight_kg
--   CASCADE drops v_user_lift_inputs, which references this column.
--   Step 7 recreates the view using weight_raw instead.
-- ---------------------------------------------------------------------------
ALTER TABLE sets
    DROP COLUMN IF EXISTS weight_kg CASCADE;

-- ---------------------------------------------------------------------------
-- STEP 5 — Add the rebuilt kind/fields CHECK using weight_raw
-- ---------------------------------------------------------------------------
ALTER TABLE sets
    ADD CONSTRAINT sets_kind_fields_check CHECK (
        (kind = 'lift'   AND reps IS NOT NULL AND weight_raw IS NOT NULL)
        OR
        (kind = 'cardio' AND duration_sec IS NOT NULL)
    );

-- ---------------------------------------------------------------------------
-- STEP 6 — Add rir range CHECK
--   -1 = not recorded  |  0 = to failure  |  1–10 = reps in reserve
--   NULL is allowed for cardio sets.
-- ---------------------------------------------------------------------------
ALTER TABLE sets
    ADD CONSTRAINT sets_rir_range_check CHECK (
        rir IS NULL OR rir BETWEEN -1 AND 10
    );

-- ---------------------------------------------------------------------------
-- STEP 7 — Recreate v_user_lift_inputs
--   Divides weight_raw by 8.0 so the percentile batch continues to receive
--   a float kg value without any change to compute_percentile().
--   This supersedes the definition in 20260502_percentile_engine.sql and
--   20260503_lift_inputs_view.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_lift_inputs AS
SELECT
    u.id                                                            AS user_id,
    s.exercise_id,
    e.name                                                          AS exercise_name,
    REPLACE(LOWER(e.name), ' ', '_')                                AS lift_id,
    u.sex,
    COALESCE(
        u.weight_class_kg,
        CASE u.sex WHEN 'M' THEN 83 ELSE 66 END
    )::DOUBLE PRECISION                                             AS bodyweight_kg,
    EXTRACT(YEAR FROM AGE(NOW(), u.birth_date))::INTEGER            AS age,
    COALESCE(u.years_in_sport, 0)::DOUBLE PRECISION                 AS training_years,
    -- Decode weight_raw → actual kg before applying the Epley formula.
    -- Per CTO guardrail #12: singles (reps = 1) return raw weight — no multiplier.
    MAX(
        CASE
            WHEN s.reps = 1 THEN s.weight_raw / 8.0
            ELSE (s.weight_raw / 8.0) * (1.0 + s.reps / 30.0)
        END
    )                                                               AS best_one_rm_kg
FROM sets s
JOIN users     u ON u.id  = s.user_id
JOIN exercises e ON e.id  = s.exercise_id
WHERE
    s.kind          = 'lift'
    AND s.reps      >= 1
    AND s.weight_raw > 0
    AND u.sex        IN ('M', 'F')
    AND u.deleted_at   IS NULL
    AND u.birth_date   IS NOT NULL
GROUP BY
    u.id,
    s.exercise_id,
    e.name,
    u.sex,
    u.weight_class_kg,
    u.birth_date,
    u.years_in_sport;

-- ---------------------------------------------------------------------------
-- VERIFICATION QUERIES (run manually after applying)
-- ---------------------------------------------------------------------------
-- 1. Confirm column types:
--      SELECT column_name, data_type, numeric_precision, numeric_scale
--      FROM information_schema.columns
--      WHERE table_name = 'sets'
--      ORDER BY ordinal_position;
--
-- 2. Confirm weight_kg is gone:
--      SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'sets' AND column_name = 'weight_kg';
--      -- should return 0 rows
--
-- 3. Spot-check a lift set (replace <uuid> with a real set id):
--      SELECT weight_raw, weight_raw / 8.0 AS weight_kg_decoded FROM sets
--      WHERE kind = 'lift' LIMIT 5;
--
-- 4. Confirm v_user_lift_inputs still resolves:
--      SELECT * FROM v_user_lift_inputs LIMIT 1;


-- #############################################################################
-- # SOURCE: migrations/20260510_percentile_engine_v2.sql
-- #############################################################################

-- ===========================================================================
-- Peak Fettle — Percentile Engine v2 migration
-- TICKET-031 | dev-database | 2026-05-10
--
-- What this migration does (all statements are idempotent):
--
--   1. ALTER lift_vectors
--        • DROP NOT NULL from bw_ref_kg and training_floor
--          (inherited rows must be NULL so COALESCE falls through to parent)
--        • DROP DEFAULT 0.55 from training_floor
--          (the v1 default silently short-circuited inheritance for all accessories)
--        • ADD COLUMN IF NOT EXISTS pop_mu    DOUBLE PRECISION
--        • ADD COLUMN IF NOT EXISTS pop_sigma DOUBLE PRECISION
--
--   2. ADD COLUMN IF NOT EXISTS percentile_simple to user_percentile_rankings
--      (stores the gender+BW-only comparison alongside the experience-adjusted value)
--
--   3. CREATE OR REPLACE all v2 SQL functions (norm_cdf unchanged, but
--      resolve_lift_vector, compute_percentile, compute_percentile_simple,
--      and compute_percentile_batch are all upgraded):
--        • resolve_lift_vector: now returns pop_mu, pop_sigma;
--          COALESCEs training_floor through the inheritance chain correctly
--        • compute_percentile: default model_version → 2 (was 1)
--        • compute_percentile_simple: NEW — gender + BW only, uses pop_mu/pop_sigma
--        • compute_percentile_batch: returns both percentile + percentile_simple;
--          default model_version → 2
--
--   4. Seed lift_vectors model_version = 2 rows (DELETE existing v2 rows first;
--      v1 rows are intentionally preserved for one audit cycle then can be purged).
--
--   5. Refresh v_lift_vector_summary to show v2 rows.
--
-- References: compute_percentile.sql, lift_vectors_seed.sql, strength_curve_model.md
-- V2 calibration rationale: see lift_vectors_seed.sql header comment.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. ALTER lift_vectors — make columns nullable, add pop_mu / pop_sigma
-- ---------------------------------------------------------------------------

-- bw_ref_kg: inherited rows must be NULL so COALESCE inherits from parent.
-- v1 schema had NOT NULL DEFAULT 75, which meant inherited rows got 75 even
-- when their parent had a different reference bodyweight.
ALTER TABLE lift_vectors ALTER COLUMN bw_ref_kg DROP NOT NULL;

-- training_floor: inherited rows must be NULL so COALESCE falls through.
-- v1 schema had NOT NULL DEFAULT 0.55; inherited accessories silently used
-- 0.55 instead of the parent's calibrated value — the core v1 bug.
ALTER TABLE lift_vectors ALTER COLUMN training_floor DROP NOT NULL;
ALTER TABLE lift_vectors ALTER COLUMN training_floor DROP DEFAULT;

-- Population-level log-normal parameters for compute_percentile_simple().
-- NULL for inherited rows (resolved at query time via resolve_lift_vector).
ALTER TABLE lift_vectors ADD COLUMN IF NOT EXISTS pop_mu    DOUBLE PRECISION;
ALTER TABLE lift_vectors ADD COLUMN IF NOT EXISTS pop_sigma DOUBLE PRECISION;


-- ---------------------------------------------------------------------------
-- 2. ADD percentile_simple to user_percentile_rankings
-- ---------------------------------------------------------------------------
-- Gender + bodyweight comparison (no age / experience adjustment).
-- NULL until the v2 batch job runs; NULL also for users whose profile is
-- incomplete (missing bodyweight).

ALTER TABLE user_percentile_rankings
    ADD COLUMN IF NOT EXISTS percentile_simple DOUBLE PRECISION;


-- ---------------------------------------------------------------------------
-- 3a. norm_cdf — unchanged from v1; re-applied for idempotency
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION norm_cdf(z DOUBLE PRECISION)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE AS $$
DECLARE
    p   CONSTANT DOUBLE PRECISION := 0.2316419;
    b1  CONSTANT DOUBLE PRECISION := 0.319381530;
    b2  CONSTANT DOUBLE PRECISION := -0.356563782;
    b3  CONSTANT DOUBLE PRECISION := 1.781477937;
    b4  CONSTANT DOUBLE PRECISION := -1.821255978;
    b5  CONSTANT DOUBLE PRECISION := 1.330274429;
    abs_z DOUBLE PRECISION;
    t     DOUBLE PRECISION;
    pdf   DOUBLE PRECISION;
    poly  DOUBLE PRECISION;
    cdf   DOUBLE PRECISION;
BEGIN
    abs_z := abs(z);
    t     := 1.0 / (1.0 + p * abs_z);
    pdf   := exp(-0.5 * abs_z * abs_z) / sqrt(2.0 * pi());
    poly  := b1*t + b2*t^2 + b3*t^3 + b4*t^4 + b5*t^5;
    cdf   := 1.0 - pdf * poly;
    IF z < 0 THEN
        RETURN 1.0 - cdf;
    ELSE
        RETURN cdf;
    END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3b. resolve_lift_vector — v2: adds pop_mu, pop_sigma to return set;
--     COALESCE(training_floor, parent.training_floor) now works correctly
--     because training_floor is nullable (v1 bug: DEFAULT 0.55 short-circuited)
-- ---------------------------------------------------------------------------

-- DROP required: return shape changes (10 cols → 12, adds pop_mu/pop_sigma).
-- CREATE OR REPLACE cannot change the return type.
DROP FUNCTION IF EXISTS resolve_lift_vector(TEXT, CHAR(1), INTEGER);

CREATE OR REPLACE FUNCTION resolve_lift_vector(
    p_lift_id        TEXT,
    p_sex            CHAR(1),
    p_model_version  INTEGER DEFAULT 2
)
RETURNS TABLE (
    mu                   DOUBLE PRECISION,
    sigma                DOUBLE PRECISION,
    pop_mu               DOUBLE PRECISION,
    pop_sigma            DOUBLE PRECISION,
    alpha                DOUBLE PRECISION,
    bw_ref_kg            DOUBLE PRECISION,
    age_peak_lo          INTEGER,
    age_peak_hi          INTEGER,
    youth_decay_per_year DOUBLE PRECISION,
    age_decay_per_year   DOUBLE PRECISION,
    training_floor       DOUBLE PRECISION,
    training_tau_years   DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    rec lift_vectors%ROWTYPE;
    parent_rec RECORD;
BEGIN
    SELECT * INTO rec
      FROM lift_vectors
     WHERE lift_id = p_lift_id AND sex = p_sex AND model_version = p_model_version;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No lift_vectors row for (%, %, v%)', p_lift_id, p_sex, p_model_version;
    END IF;

    -- Direct fit: return stored values directly
    IF rec.mu IS NOT NULL AND rec.sigma IS NOT NULL THEN
        RETURN QUERY SELECT
            rec.mu, rec.sigma,
            rec.pop_mu, rec.pop_sigma,
            rec.alpha, rec.bw_ref_kg,
            rec.age_peak_lo, rec.age_peak_hi,
            rec.youth_decay_per_year, rec.age_decay_per_year,
            rec.training_floor, rec.training_tau_years;
        RETURN;
    END IF;

    -- Inherited: pull parent row, offset mu and pop_mu by ln(ratio).
    -- sigma, pop_sigma, and all other parameters fall through via COALESCE.
    -- training_floor COALESCE now works correctly because the column is
    -- nullable (v1 bug: NOT NULL DEFAULT 0.55 short-circuited this).
    SELECT * INTO parent_rec
      FROM resolve_lift_vector(rec.parent_lift_id, p_sex, p_model_version);

    RETURN QUERY SELECT
        parent_rec.mu     + ln(rec.inheritance_ratio)   AS mu,
        parent_rec.sigma                                AS sigma,
        parent_rec.pop_mu + ln(rec.inheritance_ratio)   AS pop_mu,
        parent_rec.pop_sigma                            AS pop_sigma,
        COALESCE(rec.alpha,                parent_rec.alpha)                 AS alpha,
        COALESCE(rec.bw_ref_kg,            parent_rec.bw_ref_kg)             AS bw_ref_kg,
        COALESCE(rec.age_peak_lo,          parent_rec.age_peak_lo),
        COALESCE(rec.age_peak_hi,          parent_rec.age_peak_hi),
        COALESCE(rec.youth_decay_per_year, parent_rec.youth_decay_per_year),
        COALESCE(rec.age_decay_per_year,   parent_rec.age_decay_per_year),
        COALESCE(rec.training_floor,       parent_rec.training_floor),       -- v2 fix
        COALESCE(rec.training_tau_years,   parent_rec.training_tau_years);
END;
$$;


-- ---------------------------------------------------------------------------
-- 3c. compute_percentile — v2: default model_version changed 1 → 2
--     Logic is unchanged; the improvement comes from better lift_vectors seed data
--     (corrected mu asymptote, per-lift training_floor) and the inheritance fix.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_percentile(
    p_lift_id        TEXT,
    p_sex            CHAR(1),
    p_bodyweight_kg  DOUBLE PRECISION,
    p_age            INTEGER,
    p_training_yrs   DOUBLE PRECISION,
    p_lift_kg        DOUBLE PRECISION,
    p_model_version  INTEGER DEFAULT 2
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    v RECORD;
    bw_clamped     DOUBLE PRECISION;
    age_clamped    INTEGER;
    yrs_clamped    DOUBLE PRECISION;
    age_factor     DOUBLE PRECISION;
    train_factor   DOUBLE PRECISION;
    bw_factor      DOUBLE PRECISION;
    log_expected   DOUBLE PRECISION;
    z              DOUBLE PRECISION;
BEGIN
    -- Input validation
    IF p_lift_kg IS NULL OR p_lift_kg <= 0 THEN RETURN NULL; END IF;
    IF p_bodyweight_kg IS NULL OR p_bodyweight_kg <= 0 THEN RETURN NULL; END IF;
    IF p_age IS NULL OR p_age < 10 THEN RETURN NULL; END IF;
    IF p_sex NOT IN ('M','F') THEN RETURN NULL; END IF;

    -- Clamp inputs (per strength_curve_model.md §5)
    bw_clamped  := GREATEST(40, LEAST(p_bodyweight_kg,
                       CASE p_sex WHEN 'M' THEN 210 ELSE 150 END));
    age_clamped := GREATEST(14, LEAST(p_age, 90));
    yrs_clamped := GREATEST(0,  LEAST(COALESCE(p_training_yrs, 0), 30));

    -- Resolve parameter vector (handles inheritance)
    SELECT * INTO v FROM resolve_lift_vector(p_lift_id, p_sex, p_model_version);

    -- Factor 1: Bodyweight (allometric power law)
    bw_factor := power(bw_clamped / v.bw_ref_kg, v.alpha);

    -- Factor 2: Age (piecewise linear, calibrated to McCulloch/Foster USAPL tables)
    IF age_clamped < v.age_peak_lo THEN
        age_factor := GREATEST(0.40, 1.0 - v.youth_decay_per_year * (v.age_peak_lo - age_clamped));
    ELSIF age_clamped <= v.age_peak_hi THEN
        age_factor := 1.0;
    ELSE
        age_factor := GREATEST(0.40, 1.0 - v.age_decay_per_year * (age_clamped - v.age_peak_hi));
    END IF;

    -- Factor 3: Training experience (first-order kinetics, per-lift f₀)
    train_factor := v.training_floor +
                   (1.0 - v.training_floor) *
                   (1.0 - exp(-yrs_clamped / v.training_tau_years));

    -- Combined expected log lift (log-normal model)
    log_expected := v.mu + ln(bw_factor) + ln(age_factor) + ln(train_factor);

    -- Z-score (clamp ±4 per §5)
    z := GREATEST(-4.0, LEAST(4.0, (ln(p_lift_kg) - log_expected) / v.sigma));

    RETURN 100.0 * norm_cdf(z);
END;
$$;


-- ---------------------------------------------------------------------------
-- 3d. compute_percentile_simple — NEW in v2
--     Gender + bodyweight only; no age or experience adjustment.
--     Uses pop_mu / pop_sigma from the lift_vectors row.
--     Interpretation: "Where do I rank among ALL strength trainees of my
--     gender at my bodyweight, regardless of age or experience?"
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_percentile_simple(
    p_lift_id        TEXT,
    p_sex            CHAR(1),
    p_bodyweight_kg  DOUBLE PRECISION,
    p_lift_kg        DOUBLE PRECISION,
    p_model_version  INTEGER DEFAULT 2
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    v RECORD;
    bw_clamped     DOUBLE PRECISION;
    bw_factor      DOUBLE PRECISION;
    log_expected   DOUBLE PRECISION;
    z              DOUBLE PRECISION;
BEGIN
    -- Input validation
    IF p_lift_kg IS NULL OR p_lift_kg <= 0 THEN RETURN NULL; END IF;
    IF p_bodyweight_kg IS NULL OR p_bodyweight_kg <= 0 THEN RETURN NULL; END IF;
    IF p_sex NOT IN ('M','F') THEN RETURN NULL; END IF;

    bw_clamped := GREATEST(40, LEAST(p_bodyweight_kg,
                      CASE p_sex WHEN 'M' THEN 210 ELSE 150 END));

    SELECT * INTO v FROM resolve_lift_vector(p_lift_id, p_sex, p_model_version);

    -- pop_mu / pop_sigma must be non-null for direct-fit lifts.
    -- They are propagated through the inheritance chain by resolve_lift_vector.
    IF v.pop_mu IS NULL OR v.pop_sigma IS NULL THEN RETURN NULL; END IF;

    -- Bodyweight adjustment (same allometric scaling as experience-adjusted model)
    bw_factor := power(bw_clamped / v.bw_ref_kg, v.alpha);

    -- No age factor, no training factor — population comparison only.
    -- Equation: z = (ln(lift_kg) − (pop_mu + α·ln(BW/BW₀))) / pop_sigma
    log_expected := v.pop_mu + ln(bw_factor);

    z := GREATEST(-4.0, LEAST(4.0, (ln(p_lift_kg) - log_expected) / v.pop_sigma));

    RETURN 100.0 * norm_cdf(z);
END;
$$;


-- ---------------------------------------------------------------------------
-- 3e. compute_percentile_batch — v2: returns both percentile + percentile_simple
--     Default model_version changed 1 → 2.
--     The cron job upserts both values into user_percentile_rankings.
-- ---------------------------------------------------------------------------

-- DROP required: return shape changes between v1 and v2.
DROP FUNCTION IF EXISTS compute_percentile_batch(INTEGER);

CREATE OR REPLACE FUNCTION compute_percentile_batch(
    p_model_version INTEGER DEFAULT 2
)
RETURNS TABLE (
    user_id              UUID,
    lift_id              TEXT,
    percentile           DOUBLE PRECISION,
    percentile_simple    DOUBLE PRECISION,
    computed_at          TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
    SELECT
        u.user_id,
        u.lift_id,
        compute_percentile(
            u.lift_id, u.sex, u.bodyweight_kg, u.age,
            u.training_years, u.best_one_rm_kg, p_model_version
        ) AS percentile,
        compute_percentile_simple(
            u.lift_id, u.sex, u.bodyweight_kg,
            u.best_one_rm_kg, p_model_version
        ) AS percentile_simple,
        now() AS computed_at
    FROM v_user_lift_inputs u
    WHERE u.best_one_rm_kg > 0;
$$;


-- ---------------------------------------------------------------------------
-- 4. Seed lift_vectors model_version = 2
-- ---------------------------------------------------------------------------
-- V1 rows (model_version = 1) are intentionally preserved in the table so the
-- v1 batch cycle can still run for one more week as a parallel sanity check.
-- After the atomic swap (update cron default to 2), v1 rows can be purged with:
--   DELETE FROM lift_vectors WHERE model_version = 1;

-- Idempotency: delete existing v2 rows before re-seeding.
DELETE FROM lift_vectors WHERE model_version = 2;


-- =========================================================================
-- DIRECT-FIT BASE COMPOUNDS (big 4 + barbell row)
-- V2 calibration: corrected μ (now the asymptote, not the intermediate std),
-- per-lift training_floor derived from beginner/intermediate anchors,
-- pop_mu / pop_sigma for the population-level simple comparison.
-- Full derivation in lift_vectors_seed.sql header and strength_curve_model.md.
-- =========================================================================

-- BACK SQUAT
-- M: beg=0.75×BW, int=1.50×BW, adv=2.00×BW, eli=2.50×BW  (BW₀=75 kg)
-- F: beg=0.50×BW, int=1.00×BW, adv=1.35×BW, eli=1.65×BW  (BW₀=65 kg)
INSERT INTO lift_vectors (
    lift_id, sex, model_version,
    mu, sigma, pop_mu, pop_sigma,
    alpha, bw_ref_kg,
    training_floor, training_tau_years,
    fit_source, fit_sample_size, notes
) VALUES
 ('back_squat', 'M', 2,
  5.1465, 0.2245, 4.7228, 0.3660,
  0.667, 75,
  0.3273, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards', 809986,
  'f₀=0.3273 (beg/int=0.75/1.50=0.50); μ→asymptote via int@2yr; σ=adv/int at 90th pctile; pop_σ=eli/beg span'),
 ('back_squat', 'F', 2,
  4.5983, 0.2342, 4.1744, 0.3629,
  0.667, 65,
  0.3273, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards', 809986,
  'f₀=0.3273 (beg/int=0.50/1.00=0.50); σ=adv/int at 90th pctile');


-- BENCH PRESS
-- M: beg=0.50×BW, int=1.00×BW, adv=1.25×BW, eli=1.50×BW  (BW₀=75 kg)
-- F: beg=0.30×BW, int=0.70×BW, adv=0.90×BW, eli=1.10×BW  (BW₀=65 kg)
INSERT INTO lift_vectors (
    lift_id, sex, model_version,
    mu, sigma, pop_mu, pop_sigma,
    alpha, bw_ref_kg,
    training_floor, training_tau_years,
    fit_source, fit_sample_size, notes
) VALUES
 ('bench_press', 'M', 2,
  4.7409, 0.1741, 4.3175, 0.3340,
  0.667, 75,
  0.3273, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards', 809986,
  'f₀=0.3273 (beg/int=0.50/1.00=0.50); validated: 20yo 77.1kg 4yr → L₅₀≈203.7lb (v1 erroneously gave ~139lb)'),
 ('bench_press', 'F', 2,
  4.2894, 0.1961, 3.8182, 0.3950,
  0.667, 65,
  0.2674, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards', 809986,
  'f₀=0.2674 (beg/int=0.30/0.70=0.4286); lower F:M ratio for upper body');


-- DEADLIFT
-- M: beg=1.00×BW, int=1.75×BW, adv=2.25×BW, eli=2.75×BW  (BW₀=75 kg)
-- F: beg=0.65×BW, int=1.25×BW, adv=1.65×BW, eli=1.95×BW  (BW₀=65 kg)
INSERT INTO lift_vectors (
    lift_id, sex, model_version,
    mu, sigma, pop_mu, pop_sigma,
    alpha, bw_ref_kg,
    training_floor, training_tau_years,
    fit_source, fit_sample_size, notes
) VALUES
 ('deadlift', 'M', 2,
  5.2501, 0.1961, 4.8771, 0.3075,
  0.667, 75,
  0.3935, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards', 809986,
  'f₀=0.3935 (beg/int=1.00/1.75=0.5714); higher f₀ than bench — deadlift easier for novices'),
 ('deadlift', 'F', 2,
  4.8072, 0.2166, 4.3975, 0.3340,
  0.667, 65,
  0.3452, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards', 809986,
  'f₀=0.3452 (beg/int=0.65/1.25=0.5200); F:M deadlift ratio ~0.82 per Bielik 2024');


-- OVERHEAD PRESS (strict barbell, standing)
-- M: beg=0.40×BW, int=0.65×BW, adv=0.85×BW, eli=1.05×BW  (BW₀=75 kg)
-- F: beg=0.20×BW, int=0.45×BW, adv=0.60×BW, eli=0.75×BW  (BW₀=65 kg)
INSERT INTO lift_vectors (
    lift_id, sex, model_version,
    mu, sigma, pop_mu, pop_sigma,
    alpha, bw_ref_kg,
    training_floor, training_tau_years,
    fit_source, fit_sample_size, notes
) VALUES
 ('overhead_press', 'M', 2,
  4.2280, 0.2094, 3.8867, 0.2934,
  0.667, 75,
  0.4378, 3.0,
  'Strength Level (n~50,000) + Nuckols/SBS + industry standards', 50000,
  'f₀=0.4378 (beg/int=0.40/0.65=0.6154); validated: 20yo 77.1kg 4yr → L₅₀≈126.5lb (v1 erroneously gave ~93lb)'),
 ('overhead_press', 'F', 2,
  3.8369, 0.2245, 3.3759, 0.4018,
  0.667, 65,
  0.2802, 3.0,
  'Strength Level (n~25,000) + Nuckols/SBS + industry standards', 25000,
  'f₀=0.2802 (beg/int=0.20/0.45=0.4444); wider pop_sigma reflects large F spread in OHP');


-- BARBELL ROW (canonical row parent for inheritance; calibrated to 90% of bench)
INSERT INTO lift_vectors (
    lift_id, sex, model_version,
    mu, sigma, pop_mu, pop_sigma,
    alpha, bw_ref_kg,
    training_floor, training_tau_years,
    fit_source, fit_sample_size, notes
) VALUES
 ('barbell_row', 'M', 2,
  4.6358, 0.1741, 4.2122, 0.3340,
  0.667, 75,
  0.3273, 3.0,
  'Strength Level (n~80,000) + 0.90 × bench press distribution', 80000,
  'Calibrated to 90% of bench press distribution at all levels; canonical row parent'),
 ('barbell_row', 'F', 2,
  4.1843, 0.1961, 3.7124, 0.3950,
  0.667, 65,
  0.2674, 3.0,
  'Strength Level (n~40,000) + 0.90 × bench press distribution', 40000,
  'Calibrated to 90% of bench press distribution at all levels');


-- =========================================================================
-- INHERITED LIFTS (model_version = 2)
-- mu, sigma, pop_mu, pop_sigma are NULL — resolved at query time by
-- resolve_lift_vector() as: child_mu = parent_mu + ln(ratio),
--                             child_pop_mu = parent_pop_mu + ln(ratio).
-- bw_ref_kg and training_floor are also NULL → COALESCE from parent.
-- This is the v2 schema fix: v1 had these NOT NULL which broke inheritance.
-- =========================================================================

INSERT INTO lift_vectors (lift_id, sex, model_version, parent_lift_id, inheritance_ratio, fit_source, notes)
VALUES
 -- ---- Squat family ----
 ('front_squat',           'M', 2, 'back_squat',     0.85, 'Strength Level + Symmetric Strength', 'FS ~85% of BS'),
 ('front_squat',           'F', 2, 'back_squat',     0.85, 'Strength Level + Symmetric Strength', 'FS ~85% of BS'),
 ('low_bar_squat',         'M', 2, 'back_squat',     1.05, 'Industry aggregator', 'LB typically ~5% heavier than HB'),
 ('low_bar_squat',         'F', 2, 'back_squat',     1.05, 'Industry aggregator', 'LB typically ~5% heavier than HB'),
 ('high_bar_squat',        'M', 2, 'back_squat',     0.95, 'Industry aggregator', 'HB ~5% lighter than LB'),
 ('high_bar_squat',        'F', 2, 'back_squat',     0.95, 'Industry aggregator', 'HB ~5% lighter than LB'),
 ('paused_squat',          'M', 2, 'back_squat',     0.92, 'Strength Level',      'Paused ~92% of competition squat'),
 ('paused_squat',          'F', 2, 'back_squat',     0.92, 'Strength Level',      'Paused ~92% of competition squat'),
 ('box_squat',             'M', 2, 'back_squat',     0.90, 'Industry aggregator', 'Box ~90% of free squat'),
 ('box_squat',             'F', 2, 'back_squat',     0.90, 'Industry aggregator', 'Box ~90% of free squat'),
 ('zercher_squat',         'M', 2, 'back_squat',     0.78, 'Symmetric Strength',  'Zercher ~78% of BS'),
 ('zercher_squat',         'F', 2, 'back_squat',     0.78, 'Symmetric Strength',  'Zercher ~78% of BS'),
 ('safety_bar_squat',      'M', 2, 'back_squat',     0.92, 'Strength Level',      'SSB ~92% of BS'),
 ('safety_bar_squat',      'F', 2, 'back_squat',     0.92, 'Strength Level',      'SSB ~92% of BS'),
 ('hack_squat_machine',    'M', 2, 'back_squat',     0.90, 'Industry aggregator', 'Machine leverage adjustment applied'),
 ('hack_squat_machine',    'F', 2, 'back_squat',     0.90, 'Industry aggregator', 'Machine leverage adjustment applied'),
 ('leg_press_machine',     'M', 2, 'back_squat',     2.50, 'Strength Level',      'Leg press ~2.5× BS; leverage-corrected'),
 ('leg_press_machine',     'F', 2, 'back_squat',     2.50, 'Strength Level',      'Leg press ~2.5× BS; leverage-corrected'),
 ('bulgarian_split_squat', 'M', 2, 'back_squat',     0.40, 'Strength Level',      'Per-leg load ~40% of BS'),
 ('bulgarian_split_squat', 'F', 2, 'back_squat',     0.40, 'Strength Level',      'Per-leg load ~40% of BS'),
 ('goblet_squat',          'M', 2, 'back_squat',     0.45, 'Industry aggregator', 'Limited by anterior chain / grip'),
 ('goblet_squat',          'F', 2, 'back_squat',     0.45, 'Industry aggregator', 'Limited by anterior chain / grip'),

 -- ---- Bench press family ----
 ('incline_bench_press',   'M', 2, 'bench_press',    0.78, 'Strength Level',      'Incline ~78% of flat'),
 ('incline_bench_press',   'F', 2, 'bench_press',    0.78, 'Strength Level',      'Incline ~78% of flat'),
 ('decline_bench_press',   'M', 2, 'bench_press',    1.05, 'Strength Level',      'Decline slightly heavier than flat'),
 ('decline_bench_press',   'F', 2, 'bench_press',    1.05, 'Strength Level',      'Decline slightly heavier than flat'),
 ('close_grip_bench',      'M', 2, 'bench_press',    0.90, 'Strength Level',      'CGB ~90% of flat bench'),
 ('close_grip_bench',      'F', 2, 'bench_press',    0.90, 'Strength Level',      'CGB ~90% of flat bench'),
 ('paused_bench_press',    'M', 2, 'bench_press',    0.92, 'OpenPowerlifting',    'Paused ~92% of competition bench'),
 ('paused_bench_press',    'F', 2, 'bench_press',    0.92, 'OpenPowerlifting',    'Paused ~92% of competition bench'),
 ('floor_press',           'M', 2, 'bench_press',    0.88, 'Strength Level',      'Floor press ~88% of flat'),
 ('floor_press',           'F', 2, 'bench_press',    0.88, 'Strength Level',      'Floor press ~88% of flat'),
 ('chest_press_machine',   'M', 2, 'bench_press',    0.95, 'Industry aggregator', 'Machine ~95% of free; no stabilisation demand'),
 ('chest_press_machine',   'F', 2, 'bench_press',    0.95, 'Industry aggregator', 'Machine ~95% of free; no stabilisation demand'),
 ('dumbbell_bench_press',  'M', 2, 'bench_press',    0.42, 'Strength Level',      'PER-DUMBBELL load ~42% of barbell total'),
 ('dumbbell_bench_press',  'F', 2, 'bench_press',    0.42, 'Strength Level',      'PER-DUMBBELL load ~42% of barbell total'),
 ('dumbbell_incline_press','M', 2, 'bench_press',    0.33, 'Strength Level',      'PER-DUMBBELL ~33% of barbell flat'),
 ('dumbbell_incline_press','F', 2, 'bench_press',    0.33, 'Strength Level',      'PER-DUMBBELL ~33% of barbell flat'),

 -- ---- Deadlift family ----
 ('sumo_deadlift',         'M', 2, 'deadlift',       1.00, 'OpenPowerlifting',    'Comparable to conventional at competition level'),
 ('sumo_deadlift',         'F', 2, 'deadlift',       1.00, 'OpenPowerlifting',    'Often higher for women due to leverage'),
 ('romanian_deadlift',     'M', 2, 'deadlift',       0.82, 'Strength Level',      'RDL ~82% of conventional'),
 ('romanian_deadlift',     'F', 2, 'deadlift',       0.82, 'Strength Level',      'RDL ~82% of conventional'),
 ('stiff_leg_deadlift',    'M', 2, 'deadlift',       0.78, 'Industry aggregator', 'SLDL ~78% of conventional'),
 ('stiff_leg_deadlift',    'F', 2, 'deadlift',       0.78, 'Industry aggregator', 'SLDL ~78% of conventional'),
 ('deficit_deadlift',      'M', 2, 'deadlift',       0.85, 'Strength Level',      'Deficit ~85%'),
 ('deficit_deadlift',      'F', 2, 'deadlift',       0.85, 'Strength Level',      'Deficit ~85%'),
 ('rack_pull',             'M', 2, 'deadlift',       1.30, 'Strength Level',      'Mid-shin rack pull ~130%'),
 ('rack_pull',             'F', 2, 'deadlift',       1.30, 'Strength Level',      'Mid-shin rack pull ~130%'),
 ('trap_bar_deadlift',     'M', 2, 'deadlift',       1.05, 'Strength Level',      'Trap bar ~105% conventional'),
 ('trap_bar_deadlift',     'F', 2, 'deadlift',       1.05, 'Strength Level',      'Trap bar ~105% conventional'),

 -- ---- Overhead press family ----
 ('push_press',            'M', 2, 'overhead_press', 1.30, 'Strength Level',      'Push press ~130% of strict OHP'),
 ('push_press',            'F', 2, 'overhead_press', 1.30, 'Strength Level',      'Push press ~130% of strict OHP'),
 ('seated_overhead_press', 'M', 2, 'overhead_press', 0.92, 'Strength Level',      'Seated ~92% of standing'),
 ('seated_overhead_press', 'F', 2, 'overhead_press', 0.92, 'Strength Level',      'Seated ~92% of standing'),
 ('arnold_press',          'M', 2, 'overhead_press', 0.55, 'Industry aggregator', 'PER-DUMBBELL ~55% of barbell strict'),
 ('arnold_press',          'F', 2, 'overhead_press', 0.55, 'Industry aggregator', 'PER-DUMBBELL ~55% of barbell strict'),
 ('dumbbell_shoulder_press','M', 2, 'overhead_press', 0.42, 'Strength Level',      'PER-DUMBBELL ~42% of barbell strict'),
 ('dumbbell_shoulder_press','F', 2, 'overhead_press', 0.42, 'Strength Level',      'PER-DUMBBELL ~42% of barbell strict'),
 ('lateral_raise',         'M', 2, 'overhead_press', 0.18, 'Strength Level',      'PER-DUMBBELL; isolation, much lower than press'),
 ('lateral_raise',         'F', 2, 'overhead_press', 0.18, 'Strength Level',      'PER-DUMBBELL; isolation, much lower than press'),

 -- ---- Row family ----
 ('pendlay_row',           'M', 2, 'barbell_row',    0.92, 'Strength Level',      'Strict pause ~92% of bent row'),
 ('pendlay_row',           'F', 2, 'barbell_row',    0.92, 'Strength Level',      'Strict pause ~92% of bent row'),
 ('t_bar_row',             'M', 2, 'barbell_row',    1.05, 'Strength Level',      'T-bar slightly heavier — fixed plane advantage'),
 ('t_bar_row',             'F', 2, 'barbell_row',    1.05, 'Strength Level',      'T-bar slightly heavier — fixed plane advantage'),
 ('seated_cable_row',      'M', 2, 'barbell_row',    0.85, 'Strength Level',      'Cable ~85% of barbell row'),
 ('seated_cable_row',      'F', 2, 'barbell_row',    0.85, 'Strength Level',      'Cable ~85% of barbell row'),
 ('chest_supported_row',   'M', 2, 'barbell_row',    0.90, 'Strength Level',      'CSR ~90%'),
 ('chest_supported_row',   'F', 2, 'barbell_row',    0.90, 'Strength Level',      'CSR ~90%'),
 ('lat_pulldown',          'M', 2, 'barbell_row',    0.95, 'Strength Level',      'Pulldown ~95% of row'),
 ('lat_pulldown',          'F', 2, 'barbell_row',    0.95, 'Strength Level',      'Pulldown ~95% of row'),
 ('dumbbell_row',          'M', 2, 'barbell_row',    0.40, 'Strength Level',      'PER-DUMBBELL ~40% of barbell row'),
 ('dumbbell_row',          'F', 2, 'barbell_row',    0.40, 'Strength Level',      'PER-DUMBBELL ~40% of barbell row'),

 -- ---- Pull-up / dip / arm isolation ----
 ('weighted_pull_up',      'M', 2, 'bench_press',    0.55, 'Strength Level',      'Added load only; bodyweight summed at app layer'),
 ('weighted_pull_up',      'F', 2, 'bench_press',    0.55, 'Strength Level',      'Added load only; bodyweight summed at app layer'),
 ('weighted_chin_up',      'M', 2, 'bench_press',    0.60, 'Strength Level',      'Chins ~5% stronger than pulls for added load'),
 ('weighted_chin_up',      'F', 2, 'bench_press',    0.60, 'Strength Level',      'Chins ~5% stronger than pulls for added load'),
 ('weighted_dip',          'M', 2, 'bench_press',    0.65, 'Strength Level',      'Added load only; bodyweight summed at app layer'),
 ('weighted_dip',          'F', 2, 'bench_press',    0.65, 'Strength Level',      'Added load only; bodyweight summed at app layer'),
 ('barbell_curl',          'M', 2, 'bench_press',    0.40, 'Strength Level',      'Barbell curl ~40% of bench'),
 ('barbell_curl',          'F', 2, 'bench_press',    0.40, 'Strength Level',      'Barbell curl ~40% of bench'),
 ('ez_bar_curl',           'M', 2, 'bench_press',    0.42, 'Strength Level',      'EZ bar slightly stronger than straight bar'),
 ('ez_bar_curl',           'F', 2, 'bench_press',    0.42, 'Strength Level',      'EZ bar slightly stronger than straight bar'),
 ('dumbbell_curl',         'M', 2, 'bench_press',    0.18, 'Strength Level',      'PER-DUMBBELL'),
 ('dumbbell_curl',         'F', 2, 'bench_press',    0.18, 'Strength Level',      'PER-DUMBBELL'),
 ('preacher_curl',         'M', 2, 'bench_press',    0.35, 'Strength Level',      'Slightly weaker than standing barbell curl'),
 ('preacher_curl',         'F', 2, 'bench_press',    0.35, 'Strength Level',      'Slightly weaker than standing barbell curl'),
 ('skullcrusher',          'M', 2, 'bench_press',    0.45, 'Strength Level',      'Tricep extension ~45% of bench'),
 ('skullcrusher',          'F', 2, 'bench_press',    0.45, 'Strength Level',      'Tricep extension ~45% of bench'),
 ('tricep_pushdown',       'M', 2, 'bench_press',    0.50, 'Strength Level',      'Cable pushdown ~50% of bench'),
 ('tricep_pushdown',       'F', 2, 'bench_press',    0.50, 'Strength Level',      'Cable pushdown ~50% of bench'),

 -- ---- Hip / posterior chain ----
 ('hip_thrust',            'M', 2, 'back_squat',     1.50, 'Strength Level',      'Hip thrust ~150% of BS at advanced level'),
 ('hip_thrust',            'F', 2, 'back_squat',     1.60, 'Strength Level',      'F often higher: ~160% of BS'),
 ('glute_bridge',          'M', 2, 'back_squat',     1.30, 'Strength Level',      'Glute bridge ~130% of BS'),
 ('glute_bridge',          'F', 2, 'back_squat',     1.40, 'Strength Level',      'F: ~140% of BS'),
 ('good_morning',          'M', 2, 'back_squat',     0.50, 'Strength Level',      'Good morning ~50% of BS'),
 ('good_morning',          'F', 2, 'back_squat',     0.50, 'Strength Level',      'Good morning ~50% of BS'),

 -- ---- Lunge / single-leg / isolation ----
 ('walking_lunge',         'M', 2, 'back_squat',     0.45, 'Strength Level',      'Loaded total per side; varies with stride'),
 ('walking_lunge',         'F', 2, 'back_squat',     0.45, 'Strength Level',      'Loaded total per side; varies with stride'),
 ('leg_curl_machine',      'M', 2, 'deadlift',       0.30, 'Strength Level',      'Hamstring isolation — much lower than hip hinge'),
 ('leg_curl_machine',      'F', 2, 'deadlift',       0.30, 'Strength Level',      'Hamstring isolation — much lower than hip hinge'),
 ('leg_extension_machine', 'M', 2, 'back_squat',     0.55, 'Strength Level',      'Quad isolation'),
 ('leg_extension_machine', 'F', 2, 'back_squat',     0.55, 'Strength Level',      'Quad isolation'),
 ('calf_raise_machine',    'M', 2, 'back_squat',     1.20, 'Strength Level',      'Short lever — calf raises typically heavy'),
 ('calf_raise_machine',    'F', 2, 'back_squat',     1.20, 'Strength Level',      'Short lever — calf raises typically heavy');


-- ---------------------------------------------------------------------------
-- 5. Refresh v_lift_vector_summary to expose v2 rows
--
-- DROP first: v2 inserts new columns before fit_sample_size, which shifts
-- the column positions Postgres recorded for the v1 view.  CREATE OR REPLACE
-- cannot handle that — it would error with "cannot change name of view column
-- 'fit_sample_size' to 'mu'".  Dropping cleanly avoids the conflict.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS v_lift_vector_summary;

CREATE OR REPLACE VIEW v_lift_vector_summary AS
SELECT
    lift_id,
    sex,
    model_version,
    CASE
        WHEN mu IS NOT NULL THEN 'direct_fit'
        ELSE 'inherited_from_' || parent_lift_id || ' (×' || inheritance_ratio || ')'
    END AS fit_type,
    round(mu::numeric, 4)        AS mu,
    round(sigma::numeric, 4)     AS sigma,
    round(pop_mu::numeric, 4)    AS pop_mu,
    round(pop_sigma::numeric, 4) AS pop_sigma,
    training_floor,
    fit_sample_size,
    notes
FROM lift_vectors
WHERE model_version = 2
ORDER BY sex, lift_id;

-- ===========================================================================
-- End of 20260510_percentile_engine_v2.sql
-- TICKET-031 complete.
--
-- Next steps:
--   1. Apply this migration to production Supabase: supabase db push
--   2. TICKET-032: update cron/percentile.js to use model_version 2 and
--      store percentile_simple; update routes/percentile.js to surface both.
--   3. Run one batch cycle in parallel (model_version 1 and 2) to sanity-check
--      before the atomic swap (delete v1 rows from lift_vectors and
--      user_percentile_rankings where model_version = 1).
-- ===========================================================================


-- #############################################################################
-- # SOURCE: migrations/20260510_percentile_arch_1_6.sql
-- #############################################################################

-- ===========================================================================
-- Peak Fettle — Percentile System Architecture (ROADMAP item 1.6)
-- 2026-05-10  |  dev-database
--
-- Implements the five foundational exec decisions from exec-percentile-decisions.md
-- (CEO × CTO working session 2026-05-10).  All five components ship together —
-- a partial migration produces incoherent rankings.
--
-- What this migration does:
--
--   1. ALTER users
--        • sex column: widen CHECK from ('M','F','X') → TEXT enum MALE|FEMALE|UNDISCLOSED
--          Existing rows: 'M' → 'MALE', 'F' → 'FEMALE', 'X' → 'UNDISCLOSED'.
--          Sex is stored as a ranking computation input only — it must not appear
--          on any user-facing profile view, API response (outside the ranking engine),
--          or analytics events. (CTO data-minimization requirement.)
--        • ADD COLUMN primary_discipline TEXT — one of the four cohort dimensions.
--          Valid values: 'powerlifting','weightlifting','general_strength',
--          'running','cycling','swimming','other'. NULL until set via onboarding.
--
--   2. ALTER user_percentile_rankings
--        • ADD COLUMN cohort_size_internal INTEGER — count of internal Peak Fettle
--          users in this user's cohort (age band × sex × discipline × experience band).
--          Drives the confidence ring UI. NULL until the batch job runs.
--          External reference-data rows (Open Powerlifting, race results) do NOT
--          inflate this count — they exist only to keep percentiles valid on Day 1.
--
--   3. CREATE compute_dots_score() — the DOTS polynomial for strength normalisation.
--      DOTS is the ranking formula for all strength percentiles (CTO decision).
--      Wilks and the proprietary Peak Fettle Score remain as user-selectable
--      display formats but do not drive the underlying rank.
--
--   4. CREATE compute_undisclosed_percentile() — midpoint distribution for users
--      who select "I'd rather not say" on the biological sex question.
--      Formula (CEO + CTO joint decision):
--        μ_mid  = (μ_male + μ_female) / 2
--        σ_mid  = sqrt((σ_male² + σ_female²) / 2)
--      The user is scored against N(μ_mid, σ_mid).  If the user later discloses
--      sex in settings, their percentile recalculates immediately against the
--      correct single-sex distribution (handled at cron time — no live math here).
--
--   5. UPDATE compute_percentile_batch() — now routes UNDISCLOSED users through
--      compute_undisclosed_percentile(), passes primary_discipline through to the
--      cohort dimension set, and computes cohort_size_internal per user × lift.
--
--   6. CREATE v_user_lift_inputs replacement — expose primary_discipline so the
--      batch function can read it in one query.
--
--   7. Reference data bootstrap note — the Open Powerlifting import and race
--      result datasets are seeded as lift_vectors rows with model_version = 2
--      (already done in 20260510_percentile_engine_v2.sql).  The reference rows
--      carry fit_source metadata so the API can label them.  No schema change
--      needed here; the confidence ring just filters to internal users only.
--
-- References:
--   exec-percentile-decisions.md  — five decisions with rationale
--   ROADMAP.md §1.6               — acceptance criteria
--   20260510_percentile_engine_v2.sql — v2 SQL functions this migration extends
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. ALTER users — sex enum migration + primary_discipline
-- ---------------------------------------------------------------------------

-- Step 1a: drop the old CHECK constraint so we can alter the column values.
-- The constraint is inline on the column; PostgreSQL names it automatically.
-- We use the safe pattern: drop constraint by name (requires knowing it) OR
-- use ALTER TABLE ... DROP CONSTRAINT IF EXISTS with the generated name.
-- Safer: add a new constraint after the data migration.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_sex_check;

-- Step 1b: migrate existing single-char values to the new enum strings.
UPDATE users SET sex = 'MALE'        WHERE sex = 'M';
UPDATE users SET sex = 'FEMALE'      WHERE sex = 'F';
UPDATE users SET sex = 'UNDISCLOSED' WHERE sex = 'X';

-- Step 1c: add the new constraint.
ALTER TABLE users
    ADD CONSTRAINT users_sex_check
    CHECK (sex IN ('MALE', 'FEMALE', 'UNDISCLOSED'));

-- Step 1d: add primary_discipline.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS primary_discipline TEXT
    CHECK (primary_discipline IN (
        'powerlifting', 'weightlifting', 'general_strength',
        'running', 'cycling', 'swimming', 'other'
    ));

-- Step 1e: update percentile_vectors legacy table (same pattern).
ALTER TABLE percentile_vectors DROP CONSTRAINT IF EXISTS percentile_vectors_sex_check;
UPDATE percentile_vectors SET sex = 'MALE'        WHERE sex = 'M';
UPDATE percentile_vectors SET sex = 'FEMALE'      WHERE sex = 'F';
UPDATE percentile_vectors SET sex = 'UNDISCLOSED' WHERE sex = 'X';
ALTER TABLE percentile_vectors
    ADD CONSTRAINT percentile_vectors_sex_check
    CHECK (sex IN ('MALE', 'FEMALE', 'UNDISCLOSED'));

-- Step 1f: update lift_vectors sex column (used by v2 compute functions).
-- lift_vectors uses CHAR(1) 'M'/'F' — add an UNDISCLOSED variant so the
-- midpoint function can look up both sexes by name.
-- The existing 'M' and 'F' rows are unchanged; we do not rename them here
-- because compute_percentile() already passes 'M'/'F' internally.
-- The midpoint function will query with sex='M' and sex='F' explicitly.
-- No schema change to lift_vectors required.


-- ---------------------------------------------------------------------------
-- 2. ALTER user_percentile_rankings — add cohort_size_internal
-- ---------------------------------------------------------------------------

ALTER TABLE user_percentile_rankings
    ADD COLUMN IF NOT EXISTS cohort_size_internal INTEGER;

-- Comment: NULL means the batch job has not yet run.  A value of 0 means the
-- user is the only one in their cohort — still show the percentile (sourced from
-- reference data) but show an empty ring in the UI.


-- ---------------------------------------------------------------------------
-- 3. compute_dots_score() — DOTS polynomial (Powerlifting Australia 2019)
--
-- DOTS coefficients for males and females are different polynomials over
-- bodyweight (kg).  The score is additive, with coefficients:
--   male:   A = -0.000001093, B = 0.0007391293, C = -0.1918119073,
--           D = 24.0900756, E = -307.75076
--   female: A = -0.0000010706, B = 0.0005158568, C = -0.1126655495,
--           D = 13.6175032, E = -57.96288
--
-- DOTS_score = lift_total_kg × 500 / poly(BW)
-- For a single-lift percentile we pass the individual lift as lift_total_kg.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_dots_score(
    p_sex            TEXT,         -- 'MALE', 'FEMALE', or 'UNDISCLOSED'
    p_bodyweight_kg  DOUBLE PRECISION,
    p_lift_kg        DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE AS $$
DECLARE
    bw     DOUBLE PRECISION;
    poly   DOUBLE PRECISION;
    -- Male coefficients
    mA CONSTANT DOUBLE PRECISION := -0.000001093;
    mB CONSTANT DOUBLE PRECISION :=  0.0007391293;
    mC CONSTANT DOUBLE PRECISION := -0.1918119073;
    mD CONSTANT DOUBLE PRECISION :=  24.0900756;
    mE CONSTANT DOUBLE PRECISION := -307.75076;
    -- Female coefficients
    fA CONSTANT DOUBLE PRECISION := -0.0000010706;
    fB CONSTANT DOUBLE PRECISION :=  0.0005158568;
    fC CONSTANT DOUBLE PRECISION := -0.1126655495;
    fD CONSTANT DOUBLE PRECISION :=  13.6175032;
    fE CONSTANT DOUBLE PRECISION := -57.96288;
    -- Midpoint (UNDISCLOSED): average of M and F coefficients
    uA DOUBLE PRECISION;
    uB DOUBLE PRECISION;
    uC DOUBLE PRECISION;
    uD DOUBLE PRECISION;
    uE DOUBLE PRECISION;
BEGIN
    IF p_lift_kg IS NULL OR p_lift_kg <= 0 THEN RETURN NULL; END IF;
    IF p_bodyweight_kg IS NULL OR p_bodyweight_kg <= 0 THEN RETURN NULL; END IF;

    -- Clamp bodyweight to valid DOTS range
    bw := GREATEST(40, LEAST(p_bodyweight_kg, 210));

    IF p_sex = 'MALE' THEN
        poly := mA*bw^4 + mB*bw^3 + mC*bw^2 + mD*bw + mE;
    ELSIF p_sex = 'FEMALE' THEN
        poly := fA*bw^4 + fB*bw^3 + fC*bw^2 + fD*bw + fE;
    ELSE
        -- UNDISCLOSED: midpoint of the two polynomials
        uA := (mA + fA) / 2.0;
        uB := (mB + fB) / 2.0;
        uC := (mC + fC) / 2.0;
        uD := (mD + fD) / 2.0;
        uE := (mE + fE) / 2.0;
        poly := uA*bw^4 + uB*bw^3 + uC*bw^2 + uD*bw + uE;
    END IF;

    IF poly <= 0 THEN RETURN NULL; END IF;
    RETURN p_lift_kg * 500.0 / poly;
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. compute_undisclosed_percentile()
--
-- For UNDISCLOSED users, compute percentile against the midpoint distribution:
--   μ_mid  = (μ_male + μ_female) / 2
--   σ_mid  = sqrt((σ_male² + σ_female²) / 2)
--
-- This is experience-adjusted (uses compute_percentile internally for M and F
-- to extract their log-expected values, then combines them).  We implement it
-- directly for efficiency: resolve the male and female vectors, compute the
-- midpoint parameters, then apply the normal CDF.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_undisclosed_percentile(
    p_lift_id       TEXT,
    p_bodyweight_kg DOUBLE PRECISION,
    p_age           INTEGER,
    p_training_yrs  DOUBLE PRECISION,
    p_lift_kg       DOUBLE PRECISION,
    p_model_version INTEGER DEFAULT 2
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    vM RECORD;
    vF RECORD;
    -- Male parameters
    bw_clamped_M  DOUBLE PRECISION;
    age_factor_M  DOUBLE PRECISION;
    train_factor_M DOUBLE PRECISION;
    log_exp_M     DOUBLE PRECISION;
    -- Female parameters
    bw_clamped_F  DOUBLE PRECISION;
    age_factor_F  DOUBLE PRECISION;
    train_factor_F DOUBLE PRECISION;
    log_exp_F     DOUBLE PRECISION;
    -- Midpoint
    mu_mid        DOUBLE PRECISION;
    sigma_mid     DOUBLE PRECISION;
    z             DOUBLE PRECISION;
    age_clamped   INTEGER;
    yrs_clamped   DOUBLE PRECISION;
BEGIN
    IF p_lift_kg IS NULL OR p_lift_kg <= 0 THEN RETURN NULL; END IF;
    IF p_bodyweight_kg IS NULL OR p_bodyweight_kg <= 0 THEN RETURN NULL; END IF;
    IF p_age IS NULL OR p_age < 10 THEN RETURN NULL; END IF;

    age_clamped := GREATEST(14, LEAST(p_age, 90));
    yrs_clamped := GREATEST(0,  LEAST(COALESCE(p_training_yrs, 0), 30));

    -- Resolve male vector
    SELECT * INTO vM FROM resolve_lift_vector(p_lift_id, 'M', p_model_version);
    -- Resolve female vector
    SELECT * INTO vF FROM resolve_lift_vector(p_lift_id, 'F', p_model_version);

    -- ---- Male log-expected ----
    bw_clamped_M := GREATEST(40, LEAST(p_bodyweight_kg, 210));
    IF age_clamped < vM.age_peak_lo THEN
        age_factor_M := GREATEST(0.40, 1.0 - vM.youth_decay_per_year * (vM.age_peak_lo - age_clamped));
    ELSIF age_clamped <= vM.age_peak_hi THEN
        age_factor_M := 1.0;
    ELSE
        age_factor_M := GREATEST(0.40, 1.0 - vM.age_decay_per_year * (age_clamped - vM.age_peak_hi));
    END IF;
    train_factor_M := vM.training_floor + (1.0 - vM.training_floor) * (1.0 - exp(-yrs_clamped / vM.training_tau_years));
    log_exp_M := vM.mu
        + ln(power(bw_clamped_M / vM.bw_ref_kg, vM.alpha))
        + ln(age_factor_M)
        + ln(train_factor_M);

    -- ---- Female log-expected ----
    bw_clamped_F := GREATEST(40, LEAST(p_bodyweight_kg, 150));
    IF age_clamped < vF.age_peak_lo THEN
        age_factor_F := GREATEST(0.40, 1.0 - vF.youth_decay_per_year * (vF.age_peak_lo - age_clamped));
    ELSIF age_clamped <= vF.age_peak_hi THEN
        age_factor_F := 1.0;
    ELSE
        age_factor_F := GREATEST(0.40, 1.0 - vF.age_decay_per_year * (age_clamped - vF.age_peak_hi));
    END IF;
    train_factor_F := vF.training_floor + (1.0 - vF.training_floor) * (1.0 - exp(-yrs_clamped / vF.training_tau_years));
    log_exp_F := vF.mu
        + ln(power(bw_clamped_F / vF.bw_ref_kg, vF.alpha))
        + ln(age_factor_F)
        + ln(train_factor_F);

    -- ---- Midpoint ----
    -- μ_mid = (log_exp_M + log_exp_F) / 2  (both are in log-space, so this
    --         is equivalent to the geometric mean of the expected lifts)
    mu_mid    := (log_exp_M + log_exp_F) / 2.0;
    -- σ_mid = sqrt((σ_M² + σ_F²) / 2)
    sigma_mid := sqrt((vM.sigma^2 + vF.sigma^2) / 2.0);

    z := GREATEST(-4.0, LEAST(4.0, (ln(p_lift_kg) - mu_mid) / sigma_mid));
    RETURN 100.0 * norm_cdf(z);
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. Rebuild v_user_lift_inputs to expose primary_discipline
--
-- The existing view was created in 20260503_lift_inputs_view.sql.
-- We DROP first because the column order changes significantly (exercise_id
-- and exercise_name are removed; sex moves to col 2; primary_discipline is
-- added). CREATE OR REPLACE cannot rename or reorder existing columns.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS v_user_lift_inputs;

CREATE OR REPLACE VIEW v_user_lift_inputs AS
SELECT
    u.id                                        AS user_id,
    u.sex,                                      -- 'MALE' | 'FEMALE' | 'UNDISCLOSED' | NULL
    u.primary_discipline,                       -- 'powerlifting' | 'running' | … | NULL
    EXTRACT(YEAR FROM AGE(NOW(), u.birth_date)) AS age,
    u.years_in_sport                            AS training_years,
    -- BUG-001 fix: use weight_raw / 8.0 (weight_kg was dropped in 20260505_sets_weight_raw.sql)
    -- BUG-006 fix: sex-based bodyweight fallback (was hardcoded 75 kg, distorted runner/beginner percentiles)
    COALESCE(u.weight_class_kg, CASE u.sex WHEN 'MALE' THEN 83 ELSE 66 END) AS bodyweight_kg,
    REPLACE(LOWER(e.name), ' ', '_')            AS lift_id,
    -- Best estimated 1RM across all sets for this exercise
    -- Uses weight_raw (SMALLINT, kg × 8) — weight_kg dropped in 20260505_sets_weight_raw.sql (BUG-001)
    MAX(
        CASE
            WHEN s.reps = 1 THEN s.weight_raw / 8.0
            ELSE (s.weight_raw / 8.0) * (1.0 + s.reps::float / 30.0)   -- Epley E1RM
        END
    )                                           AS best_one_rm_kg,
    -- Account creation date — used by cohort-graduation cron
    u.created_at
FROM users u
JOIN workouts w ON w.user_id = u.id
JOIN sets s     ON s.workout_id = w.id
JOIN exercises e ON e.id = s.exercise_id
WHERE s.weight_raw > 0
  AND s.reps >= 1
  AND REPLACE(LOWER(e.name), ' ', '_') IS NOT NULL
GROUP BY u.id, u.sex, u.primary_discipline, u.birth_date,
         u.years_in_sport, u.weight_class_kg, REPLACE(LOWER(e.name), ' ', '_'), u.created_at;


-- ---------------------------------------------------------------------------
-- 6. compute_percentile_batch() v3 — routes UNDISCLOSED users + discipline
--
-- Replaces the v2 version from 20260510_percentile_engine_v2.sql.
-- New behaviour:
--   • UNDISCLOSED sex → compute_undisclosed_percentile() instead of returning NULL
--   • cohort_size_internal — count of internal users in the same
--     (lift_id, sex, discipline, age_band, experience_band) cohort
--   • model_version default remains 2
-- ---------------------------------------------------------------------------

-- DROP required: return shape changes (adds cohort_size_internal).
DROP FUNCTION IF EXISTS compute_percentile_batch(INTEGER);

CREATE OR REPLACE FUNCTION compute_percentile_batch(
    p_model_version INTEGER DEFAULT 2
)
RETURNS TABLE (
    user_id               UUID,
    lift_id               TEXT,
    percentile            DOUBLE PRECISION,
    percentile_simple     DOUBLE PRECISION,
    cohort_size_internal  INTEGER,
    computed_at           TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
    WITH base AS (
        SELECT
            u.user_id,
            u.lift_id,
            u.sex,
            u.primary_discipline,
            u.age,
            u.training_years,
            u.bodyweight_kg,
            u.best_one_rm_kg,
            -- Age band for cohort bucketing
            CASE
                WHEN u.age < 18  THEN 'under-18'
                WHEN u.age < 25  THEN '18-24'
                WHEN u.age < 35  THEN '25-34'
                WHEN u.age < 45  THEN '35-44'
                WHEN u.age < 55  THEN '45-54'
                ELSE                  '55+'
            END AS age_band,
            -- Experience band for cohort bucketing
            CASE
                WHEN COALESCE(u.training_years, 0) < 1 THEN '0-1'
                WHEN COALESCE(u.training_years, 0) < 3 THEN '1-3'
                WHEN COALESCE(u.training_years, 0) < 7 THEN '3-7'
                ELSE                                        '7+'
            END AS exp_band
        FROM v_user_lift_inputs u
        WHERE u.best_one_rm_kg > 0
    ),
    cohort_counts AS (
        -- Count internal users per (lift_id, sex, discipline, age_band, exp_band).
        -- UNDISCLOSED users are counted in a synthetic cohort by themselves
        -- (their midpoint distribution is stable regardless of cohort size).
        SELECT
            lift_id,
            COALESCE(sex, 'UNDISCLOSED')             AS sex,
            COALESCE(primary_discipline, 'other')    AS primary_discipline,
            age_band,
            exp_band,
            COUNT(*) AS cohort_size
        FROM base
        GROUP BY lift_id, COALESCE(sex, 'UNDISCLOSED'),
                 COALESCE(primary_discipline, 'other'), age_band, exp_band
    )
    SELECT
        b.user_id,
        b.lift_id,
        -- Percentile: route by sex
        CASE
            WHEN b.sex = 'UNDISCLOSED' OR b.sex IS NULL THEN
                compute_undisclosed_percentile(
                    b.lift_id, b.bodyweight_kg, b.age::INTEGER,
                    b.training_years, b.best_one_rm_kg, p_model_version
                )
            ELSE
                compute_percentile(
                    b.lift_id, b.sex, b.bodyweight_kg, b.age::INTEGER,
                    b.training_years, b.best_one_rm_kg, p_model_version
                )
        END AS percentile,
        -- Simple percentile: gender + BW only (NULL for UNDISCLOSED — no simple model for midpoint)
        CASE
            WHEN b.sex IN ('MALE', 'FEMALE') THEN
                compute_percentile_simple(
                    b.lift_id, b.sex, b.bodyweight_kg,
                    b.best_one_rm_kg, p_model_version
                )
            ELSE NULL
        END AS percentile_simple,
        -- Internal cohort size (for confidence ring UI)
        COALESCE(cc.cohort_size, 0)::INTEGER AS cohort_size_internal,
        now() AS computed_at
    FROM base b
    LEFT JOIN cohort_counts cc
           ON cc.lift_id              = b.lift_id
          AND cc.sex                  = COALESCE(b.sex, 'UNDISCLOSED')
          AND cc.primary_discipline   = COALESCE(b.primary_discipline, 'other')
          AND cc.age_band             = b.age_band
          AND cc.exp_band             = b.exp_band;
$$;


-- ---------------------------------------------------------------------------
-- 7. PATCH /users/profile endpoint contract (backend note — no schema change)
--
-- The mobile onboarding screen POSTs:
--   PATCH /users/profile  { sex: 'MALE'|'FEMALE'|'UNDISCLOSED', primary_discipline: '...' }
-- This is handled by routes/user.js (not defined here — schema-only migration).
-- Sex must not be returned by GET /users/profile or any other endpoint
-- except the ranking engine.  See CTO data-minimization note.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- End of 20260510_percentile_arch_1_6.sql
--
-- Next steps:
--   1. Apply: supabase db push (or psql -f this file against dev DB)
--   2. Backfill primary_discipline to 'general_strength' for existing users
--      who have logged strength exercises (one-time ops script).
--   3. Update cron/percentile.js to SELECT cohort_size_internal from
--      compute_percentile_batch() and upsert it into user_percentile_rankings.
--   4. Ship onboarding screen (TICKET-038) to collect sex + discipline.
--   5. Cohort graduation cron (TICKET-037 / ROADMAP 2.8) runs weekly.
-- ===========================================================================


-- #############################################################################
-- # SOURCE: migrations/20260510_1rm_confirmation.sql
-- #############################################################################

-- ===========================================================================
-- Migration: 1RM confirmation system (TICKET-040)
-- Date: 2026-05-10
-- ===========================================================================
--
-- Implements TICKET-034 resolution (exec decision: Option B default with
-- Option C user-opt-in):
--
--   Option B (default): Use Epley estimate silently; flag rankings as
--     is_estimated=true so the mobile client can show a banner.
--
--   Option C (user-opt-in via settings): User confirms or overrides each
--     lift's Epley estimate before it is used for ranking. Stored in
--     user_confirmed_1rm. Once confirmed, is_estimated=false for that lift.
--     Confirmation persists until the user logs sets that produce a
--     meaningfully different estimate (handled client-side for now).
--
-- Changes:
--   1. users.use_1rm_confirmation  — BOOLEAN, default FALSE (Option B)
--   2. user_confirmed_1rm          — stores per-lift confirmed 1RM values
--   3. user_percentile_rankings.is_estimated — flags Epley-derived rankings
--   4. compute_percentile_batch()  — updated to use confirmed values first;
--                                    returns is_estimated column
--
-- Downstream:
--   • cron/percentile.js upsert expanded to 7 params (adds is_estimated)
--   • GET /percentile returns is_estimated, epley_estimate_kg, confirmed_1rm_kg
--   • PATCH /user/profile handles use_1rm_confirmation field
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Add use_1rm_confirmation preference to users
-- ---------------------------------------------------------------------------

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS use_1rm_confirmation BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.use_1rm_confirmation IS
    'Option C flag — when TRUE the app prompts the user to confirm each '
    'Epley estimate before it is used for ranking. Default FALSE = Option B '
    '(silent Epley conversion with banner disclosure).';


-- ---------------------------------------------------------------------------
-- 2. Create user_confirmed_1rm table
--
-- Stores the user''s manually confirmed (or overridden) 1RM per lift.
-- When a row exists for (user_id, lift_id), compute_percentile_batch()
-- uses confirmed_kg instead of the Epley estimate from logged sets,
-- and marks is_estimated = FALSE on the resulting ranking.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_confirmed_1rm (
    user_id      UUID             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lift_id      TEXT             NOT NULL,
    confirmed_kg DOUBLE PRECISION NOT NULL CHECK (confirmed_kg > 0 AND confirmed_kg < 1500),
    confirmed_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, lift_id)
);

CREATE INDEX IF NOT EXISTS idx_ucr_user_id ON user_confirmed_1rm (user_id);

COMMENT ON TABLE user_confirmed_1rm IS
    'Per-user, per-lift confirmed 1RM values. '
    'Used by compute_percentile_batch() as the authoritative lift weight '
    'when present (takes precedence over MAX(e1rm_kg) from logged sets). '
    'Added in TICKET-040 / ROADMAP 1RM confirmation system.';


-- ---------------------------------------------------------------------------
-- 3. Add is_estimated column to user_percentile_rankings
--
-- TRUE  → ranking was computed from an Epley estimate (no confirmed_1rm)
-- FALSE → ranking was computed from a user-confirmed value (or a true 1RM set
--         where reps=1 was logged and no Epley conversion was needed)
-- NULL  → pre-migration rows; treated as TRUE by the client
-- ---------------------------------------------------------------------------

ALTER TABLE user_percentile_rankings
    ADD COLUMN IF NOT EXISTS is_estimated BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN user_percentile_rankings.is_estimated IS
    'TRUE when the ranking input was derived from an Epley-estimated 1RM '
    '(multi-rep sets only, no user confirmation). FALSE when the user has '
    'confirmed (or manually set) their 1RM for this lift via the '
    'user_confirmed_1rm table. Added TICKET-040.';


-- ---------------------------------------------------------------------------
-- 4. Row-level security for user_confirmed_1rm
-- ---------------------------------------------------------------------------

ALTER TABLE user_confirmed_1rm ENABLE ROW LEVEL SECURITY;

-- Users may only read their own confirmed values
CREATE POLICY ucr_select ON user_confirmed_1rm
    FOR SELECT USING (user_id = auth.uid());

-- Users may only insert for themselves
CREATE POLICY ucr_insert ON user_confirmed_1rm
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users may update their own values
CREATE POLICY ucr_update ON user_confirmed_1rm
    FOR UPDATE USING (user_id = auth.uid());

-- Users may delete their own values (e.g. "reset to Epley")
CREATE POLICY ucr_delete ON user_confirmed_1rm
    FOR DELETE USING (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 5. Update compute_percentile_batch() to use confirmed 1RM values
--
-- This is a CREATE OR REPLACE of the function introduced in
-- 20260510_percentile_arch_1_6.sql.  The signature gains one return column:
--   is_estimated BOOLEAN
-- and the body LEFT JOINs user_confirmed_1rm to override best_one_rm_kg
-- when a confirmed value is present.
--
-- Callers (cron/percentile.js) must be updated to handle the new column.
-- ---------------------------------------------------------------------------

-- NOTE: compute_percentile_batch() was originally redefined here but the
-- definition was truncated (file write error — see dev-context Lessons §8).
-- The complete, canonical definition is in 20260515_percentile_hotfix_consolidation.sql.


-- #############################################################################
-- # SOURCE: migrations/20260515_percentile_hotfix_consolidation.sql
-- #############################################################################

-- ===========================================================================
-- Migration: 20260515_percentile_hotfix_consolidation.sql
-- Date:      2026-05-15
-- Author:    web-and-application-dev (automated Hotfix / Pre-Launch Data
--            Integrity Sprint per DEV_ROADMAP_2026-05-14.md §5–§6)
--
-- Purpose
-- -------
-- Closes the two remaining Pre-Launch Data Integrity Sprint items
-- (BUG-004, BUG-005) and locks in the final, consolidated definition of
-- compute_percentile_batch() so partial application of the 20260510_*
-- migration set can no longer leave the database in an inconsistent state.
--
-- This migration is dated 2026-05-15 specifically so it sorts AFTER every
-- 20260510_* file and AFTER 20260515_plans_active.sql (alphabetically the
-- latter two share a prefix and this file sorts last in alphabetical order
-- among the 20260515_* migrations only because the comparison continues
-- into the descriptive suffix; we ensure the desired ordering by also
-- flagging this file as a hard prerequisite for any future percentile work
-- in the migration runner — see comment block at end of file).
--
-- What this migration does
-- ------------------------
--   1. BUG-004 — Widen compute_percentile() and compute_percentile_simple()
--      parameter type from CHAR(1) → TEXT. Internally translate the
--      'MALE'/'FEMALE'/'UNDISCLOSED' enum strings (now used app-wide after
--      20260510_percentile_arch_1_6.sql) to the legacy 'M'/'F' values still
--      stored in lift_vectors.sex. The CHAR(1) signature was silently
--      truncating its TEXT inputs today; the next type refactor would have
--      converted the truncation into a NULL-returning hard break for every
--      ranking. After this migration both the new TEXT enum and the legacy
--      single-char form are accepted.
--
--   2. BUG-004 — Same fix for resolve_lift_vector(): accepts TEXT, translates
--      'MALE'/'FEMALE' → 'M'/'F' before the lift_vectors lookup. (The lift_vectors
--      table itself keeps 'M'/'F' rows — see comment in 20260510_percentile_arch_1_6.sql
--      §1f explaining why the underlying table is intentionally not migrated.)
--
--   3. BUG-005 — Replaces the three conflicting compute_percentile_batch()
--      definitions (in 20260510_percentile_engine_v2.sql, 20260510_1rm_confirmation.sql,
--      and 20260510_percentile_arch_1_6.sql) with one canonical version that
--      includes EVERY field any one of them shipped:
--
--        • percentile               (experience-adjusted, routes UNDISCLOSED
--                                    through compute_undisclosed_percentile)
--        • percentile_simple        (gender + BW only; NULL for UNDISCLOSED)
--        • cohort_size_internal     (from 1_6, drives confidence ring)
--        • is_estimated             (from 1rm_confirmation, drives "Confirm
--                                    your max" CTA)
--        • computed_at              (timestamp)
--
--      The body honours user_confirmed_1rm overrides (priority over the
--      Epley estimate), which is what cron/percentile.js + GET /percentile
--      already expect (see TICKET-040/041/042 in dev-context).
--
-- Backward-compat notes
-- ---------------------
--   • The 20260510 migration files remain on disk unchanged. Their
--     compute_percentile_batch() definitions are still valid SQL — they will
--     simply be CREATE-OR-REPLACE'd by the version in this file when the
--     migration runner reaches it. The risk addressed by BUG-005 is that a
--     PARTIAL application (e.g., 1_6 applied but 1rm_confirmation skipped)
--     would leave the database with a 6-column return that callers expecting
--     7 columns would crash on. After this hotfix the *final* definition is
--     deterministic regardless of which intermediate files were applied
--     and in which order.
--   • Callers (server/cron/percentile.js, server/routes/percentile.js)
--     already select the seven columns shipped here; no application-side
--     change is required.
--
-- References
-- ----------
--   • DEV_ROADMAP_2026-05-14.md §5 (Hotfix), §6 (Pre-Launch Data Integrity)
--   • beta-feedback-report-2026-05-11.md (BUG-004 + BUG-005 reporters)
--   • migrations/20260510_percentile_engine_v2.sql (v2 functions)
--   • migrations/20260510_percentile_arch_1_6.sql (UNDISCLOSED + cohort)
--   • migrations/20260510_1rm_confirmation.sql    (is_estimated + confirmed_1rm)
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. BUG-004 — resolve_lift_vector(): accept TEXT, translate enum → legacy
-- ---------------------------------------------------------------------------

-- DROP required: parameter type changes CHAR(1) → TEXT (BUG-004).
-- CREATE OR REPLACE cannot change parameter types.
DROP FUNCTION IF EXISTS resolve_lift_vector(TEXT, CHAR(1), INTEGER);

CREATE OR REPLACE FUNCTION resolve_lift_vector(
    p_lift_id        TEXT,
    p_sex            TEXT,           -- BUG-004: was CHAR(1)
    p_model_version  INTEGER DEFAULT 2
)
RETURNS TABLE (
    mu                   DOUBLE PRECISION,
    sigma                DOUBLE PRECISION,
    pop_mu               DOUBLE PRECISION,
    pop_sigma            DOUBLE PRECISION,
    alpha                DOUBLE PRECISION,
    bw_ref_kg            DOUBLE PRECISION,
    age_peak_lo          INTEGER,
    age_peak_hi          INTEGER,
    youth_decay_per_year DOUBLE PRECISION,
    age_decay_per_year   DOUBLE PRECISION,
    training_floor       DOUBLE PRECISION,
    training_tau_years   DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    rec lift_vectors%ROWTYPE;
    parent_rec RECORD;
    v_sex CHAR(1);
BEGIN
    -- BUG-004: translate the new TEXT enum to the legacy single-char value
    -- that lift_vectors.sex actually stores. Accepts both forms so callers
    -- written before and after the 20260510_percentile_arch_1_6 migration
    -- both work.
    v_sex := CASE upper(p_sex)
                WHEN 'MALE'   THEN 'M'
                WHEN 'FEMALE' THEN 'F'
                WHEN 'M'      THEN 'M'
                WHEN 'F'      THEN 'F'
                ELSE NULL
             END;

    IF v_sex IS NULL THEN
        RAISE EXCEPTION 'resolve_lift_vector: sex must be MALE/FEMALE (or M/F); got %', p_sex;
    END IF;

    SELECT * INTO rec
      FROM lift_vectors
     WHERE lift_id = p_lift_id AND sex = v_sex AND model_version = p_model_version;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No lift_vectors row for (%, %, v%)', p_lift_id, v_sex, p_model_version;
    END IF;

    -- Direct fit
    IF rec.mu IS NOT NULL AND rec.sigma IS NOT NULL THEN
        RETURN QUERY SELECT
            rec.mu, rec.sigma,
            rec.pop_mu, rec.pop_sigma,
            rec.alpha, rec.bw_ref_kg,
            rec.age_peak_lo, rec.age_peak_hi,
            rec.youth_decay_per_year, rec.age_decay_per_year,
            rec.training_floor, rec.training_tau_years;
        RETURN;
    END IF;

    -- Inherited (recursion uses the legacy single-char to skip another
    -- translation). v_sex is already CHAR(1).
    SELECT * INTO parent_rec
      FROM resolve_lift_vector(rec.parent_lift_id, v_sex::TEXT, p_model_version);

    RETURN QUERY SELECT
        parent_rec.mu     + ln(rec.inheritance_ratio)   AS mu,
        parent_rec.sigma                                AS sigma,
        parent_rec.pop_mu + ln(rec.inheritance_ratio)   AS pop_mu,
        parent_rec.pop_sigma                            AS pop_sigma,
        COALESCE(rec.alpha,                parent_rec.alpha)                 AS alpha,
        COALESCE(rec.bw_ref_kg,            parent_rec.bw_ref_kg)             AS bw_ref_kg,
        COALESCE(rec.age_peak_lo,          parent_rec.age_peak_lo),
        COALESCE(rec.age_peak_hi,          parent_rec.age_peak_hi),
        COALESCE(rec.youth_decay_per_year, parent_rec.youth_decay_per_year),
        COALESCE(rec.age_decay_per_year,   parent_rec.age_decay_per_year),
        COALESCE(rec.training_floor,       parent_rec.training_floor),
        COALESCE(rec.training_tau_years,   parent_rec.training_tau_years);
END;
$$;


-- ---------------------------------------------------------------------------
-- 2. BUG-004 — compute_percentile(): accept TEXT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_percentile(
    p_lift_id        TEXT,
    p_sex            TEXT,           -- BUG-004: was CHAR(1); silently truncated
    p_bodyweight_kg  DOUBLE PRECISION,
    p_age            INTEGER,
    p_training_yrs   DOUBLE PRECISION,
    p_lift_kg        DOUBLE PRECISION,
    p_model_version  INTEGER DEFAULT 2
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    v RECORD;
    v_sex          CHAR(1);
    bw_clamped     DOUBLE PRECISION;
    age_clamped    INTEGER;
    yrs_clamped    DOUBLE PRECISION;
    age_factor     DOUBLE PRECISION;
    train_factor   DOUBLE PRECISION;
    bw_factor      DOUBLE PRECISION;
    log_expected   DOUBLE PRECISION;
    z              DOUBLE PRECISION;
BEGIN
    -- Input validation
    IF p_lift_kg IS NULL OR p_lift_kg <= 0 THEN RETURN NULL; END IF;
    IF p_bodyweight_kg IS NULL OR p_bodyweight_kg <= 0 THEN RETURN NULL; END IF;
    IF p_age IS NULL OR p_age < 10 THEN RETURN NULL; END IF;

    -- BUG-004: accept TEXT enum or single-char form
    v_sex := CASE upper(p_sex)
                WHEN 'MALE'   THEN 'M'
                WHEN 'FEMALE' THEN 'F'
                WHEN 'M'      THEN 'M'
                WHEN 'F'      THEN 'F'
                ELSE NULL
             END;
    IF v_sex IS NULL THEN RETURN NULL; END IF;     -- UNDISCLOSED routed elsewhere

    -- Clamp inputs (per strength_curve_model.md §5)
    bw_clamped  := GREATEST(40, LEAST(p_bodyweight_kg,
                       CASE v_sex WHEN 'M' THEN 210 ELSE 150 END));
    age_clamped := GREATEST(14, LEAST(p_age, 90));
    yrs_clamped := GREATEST(0,  LEAST(COALESCE(p_training_yrs, 0), 30));

    -- Resolve parameter vector (resolve_lift_vector now also TEXT-aware)
    SELECT * INTO v FROM resolve_lift_vector(p_lift_id, v_sex::TEXT, p_model_version);

    bw_factor := power(bw_clamped / v.bw_ref_kg, v.alpha);

    IF age_clamped < v.age_peak_lo THEN
        age_factor := GREATEST(0.40, 1.0 - v.youth_decay_per_year * (v.age_peak_lo - age_clamped));
    ELSIF age_clamped <= v.age_peak_hi THEN
        age_factor := 1.0;
    ELSE
        age_factor := GREATEST(0.40, 1.0 - v.age_decay_per_year * (age_clamped - v.age_peak_hi));
    END IF;

    train_factor := v.training_floor +
                   (1.0 - v.training_floor) *
                   (1.0 - exp(-yrs_clamped / v.training_tau_years));

    log_expected := v.mu + ln(bw_factor) + ln(age_factor) + ln(train_factor);

    z := GREATEST(-4.0, LEAST(4.0, (ln(p_lift_kg) - log_expected) / v.sigma));

    RETURN 100.0 * norm_cdf(z);
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. BUG-004 — compute_percentile_simple(): accept TEXT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_percentile_simple(
    p_lift_id        TEXT,
    p_sex            TEXT,           -- BUG-004
    p_bodyweight_kg  DOUBLE PRECISION,
    p_lift_kg        DOUBLE PRECISION,
    p_model_version  INTEGER DEFAULT 2
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    v RECORD;
    v_sex      CHAR(1);
    bw_clamped DOUBLE PRECISION;
    bw_factor  DOUBLE PRECISION;
    log_expected DOUBLE PRECISION;
    z          DOUBLE PRECISION;
BEGIN
    IF p_lift_kg IS NULL OR p_lift_kg <= 0 THEN RETURN NULL; END IF;
    IF p_bodyweight_kg IS NULL OR p_bodyweight_kg <= 0 THEN RETURN NULL; END IF;

    v_sex := CASE upper(p_sex)
                WHEN 'MALE'   THEN 'M'
                WHEN 'FEMALE' THEN 'F'
                WHEN 'M'      THEN 'M'
                WHEN 'F'      THEN 'F'
                ELSE NULL
             END;
    IF v_sex IS NULL THEN RETURN NULL; END IF;

    bw_clamped := GREATEST(40, LEAST(p_bodyweight_kg,
                      CASE v_sex WHEN 'M' THEN 210 ELSE 150 END));

    SELECT * INTO v FROM resolve_lift_vector(p_lift_id, v_sex::TEXT, p_model_version);

    IF v.pop_mu IS NULL OR v.pop_sigma IS NULL THEN RETURN NULL; END IF;

    bw_factor    := power(bw_clamped / v.bw_ref_kg, v.alpha);
    log_expected := v.pop_mu + ln(bw_factor);

    z := GREATEST(-4.0, LEAST(4.0, (ln(p_lift_kg) - log_expected) / v.pop_sigma));

    RETURN 100.0 * norm_cdf(z);
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. BUG-005 — Final consolidated compute_percentile_batch()
--
-- Includes:
--   • UNDISCLOSED routing                  (from 20260510_percentile_arch_1_6)
--   • cohort_size_internal                 (from 20260510_percentile_arch_1_6)
--   • is_estimated + user_confirmed_1rm    (from 20260510_1rm_confirmation)
--   • percentile_simple                    (from 20260510_percentile_engine_v2)
--
-- Drop-and-recreate is required because we are changing the RETURNS TABLE
-- signature (the 1_6 version returned 6 columns; the 1rm_confirmation version
-- returned 7 in a different order). PostgreSQL refuses to CREATE OR REPLACE
-- a function whose return type changes.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS compute_percentile_batch(INTEGER);

CREATE FUNCTION compute_percentile_batch(
    p_model_version INTEGER DEFAULT 2
)
RETURNS TABLE (
    user_id               UUID,
    lift_id               TEXT,
    percentile            DOUBLE PRECISION,
    percentile_simple     DOUBLE PRECISION,
    cohort_size_internal  INTEGER,
    is_estimated          BOOLEAN,
    computed_at           TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
    WITH base AS (
        -- Resolve effective 1RM per user × lift.
        -- Priority: user-confirmed value > Epley estimate from logged sets.
        SELECT
            u.user_id,
            u.lift_id,
            u.sex,
            u.primary_discipline,
            u.age,
            u.training_years,
            u.bodyweight_kg,
            COALESCE(ucr.confirmed_kg, u.best_one_rm_kg) AS effective_e1rm,
            (ucr.confirmed_kg IS NULL)                    AS is_estimated,
            CASE
                WHEN u.age < 18  THEN 'under-18'
                WHEN u.age < 25  THEN '18-24'
                WHEN u.age < 35  THEN '25-34'
                WHEN u.age < 45  THEN '35-44'
                WHEN u.age < 55  THEN '45-54'
                ELSE                  '55+'
            END AS age_band,
            CASE
                WHEN COALESCE(u.training_years, 0) < 1 THEN '0-1'
                WHEN COALESCE(u.training_years, 0) < 3 THEN '1-3'
                WHEN COALESCE(u.training_years, 0) < 7 THEN '3-7'
                ELSE                                        '7+'
            END AS exp_band
        FROM v_user_lift_inputs u
        LEFT JOIN user_confirmed_1rm ucr
               ON ucr.user_id = u.user_id
              AND ucr.lift_id = u.lift_id
        WHERE COALESCE(ucr.confirmed_kg, u.best_one_rm_kg) > 0
    ),
    cohort_counts AS (
        SELECT
            lift_id,
            COALESCE(sex, 'UNDISCLOSED')          AS sex,
            COALESCE(primary_discipline, 'other') AS primary_discipline,
            age_band,
            exp_band,
            COUNT(*) AS cohort_size
        FROM base
        GROUP BY
            lift_id,
            COALESCE(sex, 'UNDISCLOSED'),
            COALESCE(primary_discipline, 'other'),
            age_band,
            exp_band
    )
    SELECT
        b.user_id,
        b.lift_id,
        -- Experience-adjusted percentile, routes UNDISCLOSED separately
        CASE
            WHEN b.sex = 'UNDISCLOSED' OR b.sex IS NULL THEN
                compute_undisclosed_percentile(
                    b.lift_id, b.bodyweight_kg, b.age::INTEGER,
                    b.training_years, b.effective_e1rm, p_model_version
                )
            ELSE
                compute_percentile(
                    b.lift_id, b.sex, b.bodyweight_kg, b.age::INTEGER,
                    b.training_years, b.effective_e1rm, p_model_version
                )
        END                                                  AS percentile,
        -- Population (gender + BW only) percentile; NULL for UNDISCLOSED
        CASE
            WHEN b.sex IN ('MALE', 'FEMALE') THEN
                compute_percentile_simple(
                    b.lift_id, b.sex, b.bodyweight_kg,
                    b.effective_e1rm, p_model_version
                )
            ELSE NULL
        END                                                  AS percentile_simple,
        COALESCE(cc.cohort_size, 0)::INTEGER                 AS cohort_size_internal,
        b.is_estimated                                       AS is_estimated,
        NOW()                                                AS computed_at
    FROM base b
    LEFT JOIN cohort_counts cc
           ON cc.lift_id              = b.lift_id
          AND cc.sex                  = COALESCE(b.sex, 'UNDISCLOSED')
          AND cc.primary_discipline   = COALESCE(b.primary_discipline, 'other')
          AND cc.age_band             = b.age_band
          AND cc.exp_band             = b.exp_band;
$$;

COMMENT ON FUNCTION compute_percentile_batch(INTEGER) IS
    'Final consolidated batch percentile function (BUG-005 fix, 2026-05-15). '
    'Returns 7 columns: user_id, lift_id, percentile, percentile_simple, '
    'cohort_size_internal, is_estimated, computed_at. Honours user_confirmed_1rm '
    'overrides; routes UNDISCLOSED users through compute_undisclosed_percentile. '
    'Supersedes the three earlier definitions in 20260510_*.sql migrations.';


-- ---------------------------------------------------------------------------
-- 5. compute_undisclosed_percentile() — refresh to use TEXT-aware resolve
--
-- The function was already TEXT-aware at its outer signature, but it called
-- resolve_lift_vector() with literal 'M'/'F' arguments. Those still work
-- (the new resolve_lift_vector accepts both), but we re-create the function
-- so its dependencies clearly point at the post-hotfix lookup chain. The
-- body is otherwise unchanged from 20260510_percentile_arch_1_6.sql §4.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_undisclosed_percentile(
    p_lift_id       TEXT,
    p_bodyweight_kg DOUBLE PRECISION,
    p_age           INTEGER,
    p_training_yrs  DOUBLE PRECISION,
    p_lift_kg       DOUBLE PRECISION,
    p_model_version INTEGER DEFAULT 2
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    vM RECORD;
    vF RECORD;
    bw_clamped_M  DOUBLE PRECISION;
    age_factor_M  DOUBLE PRECISION;
    train_factor_M DOUBLE PRECISION;
    log_exp_M     DOUBLE PRECISION;
    bw_clamped_F  DOUBLE PRECISION;
    age_factor_F  DOUBLE PRECISION;
    train_factor_F DOUBLE PRECISION;
    log_exp_F     DOUBLE PRECISION;
    mu_mid        DOUBLE PRECISION;
    sigma_mid     DOUBLE PRECISION;
    z             DOUBLE PRECISION;
    age_clamped   INTEGER;
    yrs_clamped   DOUBLE PRECISION;
BEGIN
    IF p_lift_kg IS NULL OR p_lift_kg <= 0 THEN RETURN NULL; END IF;
    IF p_bodyweight_kg IS NULL OR p_bodyweight_kg <= 0 THEN RETURN NULL; END IF;
    IF p_age IS NULL OR p_age < 10 THEN RETURN NULL; END IF;

    age_clamped := GREATEST(14, LEAST(p_age, 90));
    yrs_clamped := GREATEST(0,  LEAST(COALESCE(p_training_yrs, 0), 30));

    -- These literal calls succeed under both the old CHAR(1) and the new TEXT
    -- signature of resolve_lift_vector — the function is overload-free and
    -- both forms cast cleanly.
    SELECT * INTO vM FROM resolve_lift_vector(p_lift_id, 'M'::TEXT, p_model_version);
    SELECT * INTO vF FROM resolve_lift_vector(p_lift_id, 'F'::TEXT, p_model_version);

    bw_clamped_M := GREATEST(40, LEAST(p_bodyweight_kg, 210));
    IF age_clamped < vM.age_peak_lo THEN
        age_factor_M := GREATEST(0.40, 1.0 - vM.youth_decay_per_year * (vM.age_peak_lo - age_clamped));
    ELSIF age_clamped <= vM.age_peak_hi THEN
        age_factor_M := 1.0;
    ELSE
        age_factor_M := GREATEST(0.40, 1.0 - vM.age_decay_per_year * (age_clamped - vM.age_peak_hi));
    END IF;
    train_factor_M := vM.training_floor + (1.0 - vM.training_floor) * (1.0 - exp(-yrs_clamped / vM.training_tau_years));
    log_exp_M := vM.mu
        + ln(power(bw_clamped_M / vM.bw_ref_kg, vM.alpha))
        + ln(age_factor_M)
        + ln(train_factor_M);

    bw_clamped_F := GREATEST(40, LEAST(p_bodyweight_kg, 150));
    IF age_clamped < vF.age_peak_lo THEN
        age_factor_F := GREATEST(0.40, 1.0 - vF.youth_decay_per_year * (vF.age_peak_lo - age_clamped));
    ELSIF age_clamped <= vF.age_peak_hi THEN
        age_factor_F := 1.0;
    ELSE
        age_factor_F := GREATEST(0.40, 1.0 - vF.age_decay_per_year * (age_clamped - vF.age_peak_hi));
    END IF;
    train_factor_F := vF.training_floor + (1.0 - vF.training_floor) * (1.0 - exp(-yrs_clamped / vF.training_tau_years));
    log_exp_F := vF.mu
        + ln(power(bw_clamped_F / vF.bw_ref_kg, vF.alpha))
        + ln(age_factor_F)
        + ln(train_factor_F);

    mu_mid    := (log_exp_M + log_exp_F) / 2.0;
    sigma_mid := sqrt((vM.sigma^2 + vF.sigma^2) / 2.0);

    z := GREATEST(-4.0, LEAST(4.0, (ln(p_lift_kg) - mu_mid) / sigma_mid));
    RETURN 100.0 * norm_cdf(z);
END;
$$;


-- ===========================================================================
-- Post-apply runner contract
--
-- Migration runners that maintain a schema_migrations table should record
-- this file as a hard prerequisite for any future percentile-related migration.
-- After this file is applied the database satisfies all open items in the
-- DEV_ROADMAP_2026-05-14.md Hotfix and Pre-Launch Data Integrity sprints
-- (BUG-001 / BUG-002 / BUG-003 / BUG-004 / BUG-005 / BUG-006 — see roadmap §12).
-- ===========================================================================


-- #############################################################################
-- # SOURCE: migrations/20260430_add_daily_health_log.sql
-- #############################################################################

-- ============================================================================
-- Migration: 20260430_add_daily_health_log.sql
-- Phase:     Health Suite Expansion — Phase 1 (Data Layer Prep)
-- Author:    dev-database (delegated by dev-lead)
-- Reviewed:  Workflow Coordinator brief 2026-04-30
-- ----------------------------------------------------------------------------
-- Purpose:
--   Foundation table for cross-domain health primitives. No UI reads from this
--   yet. We are paying a small migration cost now so the Phase 2 Wellbeing tab
--   does not require a second invasive migration over a populated workout
--   dataset.
--
-- Notes:
--   * Encryption-at-rest is provided by Supabase storage (project default).
--   * Per-row access control is enforced by RLS below — auth.uid() must match
--     the row's user_id for any read or write.
--   * Phase 3 may add a `source` column for Apple Health / Google Fit imports;
--     left out for now to keep the row narrow.
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_health_log (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    log_date             DATE         NOT NULL,

    -- Sleep
    sleep_hours          NUMERIC(4,2),                  -- e.g. 7.50
    sleep_quality        SMALLINT     CHECK (sleep_quality   BETWEEN 1 AND 5),

    -- Mood / stress (self-reported, 1–5 Likert)
    mood_score           SMALLINT     CHECK (mood_score      BETWEEN 1 AND 5),
    stress_score         SMALLINT     CHECK (stress_score    BETWEEN 1 AND 5),

    -- Screen time (manual entry now; Phase 3 wires OS APIs)
    screen_time_minutes  INTEGER      CHECK (screen_time_minutes >= 0),

    -- Habit completions for the day (FK enforcement deferred — array of habit IDs)
    habits_completed     UUID[]       DEFAULT '{}',

    -- Meditation
    meditation_minutes   INTEGER      CHECK (meditation_minutes >= 0),

    -- Free-form
    notes                TEXT,

    -- Bookkeeping
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Invariant: one log row per user per calendar day
    UNIQUE (user_id, log_date)
);

-- Time-series read pattern: latest N days for a user.
CREATE INDEX IF NOT EXISTS idx_daily_health_log_user_date
    ON daily_health_log (user_id, log_date DESC);

-- ----------------------------------------------------------------------------
-- updated_at trigger (mirrors the convention used elsewhere in the schema)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_daily_health_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_health_log_updated_at ON daily_health_log;
CREATE TRIGGER trg_daily_health_log_updated_at
    BEFORE UPDATE ON daily_health_log
    FOR EACH ROW
    EXECUTE FUNCTION set_daily_health_log_updated_at();

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE daily_health_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own health logs" ON daily_health_log;
CREATE POLICY "Users can manage own health logs"
    ON daily_health_log
    FOR ALL
    USING      (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- End of migration 20260430_add_daily_health_log.sql
-- ============================================================================


-- #############################################################################
-- # SOURCE: migrations/20260430_add_habits.sql
-- #############################################################################

-- ============================================================================
-- Migration: 20260430_add_habits.sql
-- Phase:     Health Suite Expansion — Phase 1 (Data Layer Prep)
-- Author:    dev-database (delegated by dev-lead)
-- Reviewed:  Workflow Coordinator brief 2026-04-30
-- ----------------------------------------------------------------------------
-- Purpose:
--   Define `habits` now so the Phase 2 Wellbeing tab does not require a
--   second migration. No UI reads from this yet.
--
-- Open exec questions (do NOT block this migration — daily_only is the
-- conservative default until exec confirms):
--   * Should habit frequency support 'weekly' and 'custom' at Phase 2, or
--     daily only? Default left as 'daily' here; the column is TEXT so future
--     values can be added without an ALTER.
-- ============================================================================

CREATE TABLE IF NOT EXISTS habits (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT         NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    frequency   TEXT         NOT NULL DEFAULT 'daily'
                              CHECK (frequency IN ('daily', 'weekly')),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Active-habits-for-user is the dominant Phase 2 query.
CREATE INDEX IF NOT EXISTS idx_habits_user_active
    ON habits (user_id)
    WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own habits" ON habits;
CREATE POLICY "Users can manage own habits"
    ON habits
    FOR ALL
    USING      (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- End of migration 20260430_add_habits.sql
-- ============================================================================


-- #############################################################################
-- # SOURCE: migrations/20260502_refresh_token_revocation.sql
-- #############################################################################

-- Peak Fettle — Refresh token revocation table
-- Author: dev-backend
-- Date: 2026-05-02
-- Ticket: T-02 (DEV_ROADMAP_2026-05-02.md §B-0)
--
-- Problem: Without a revocation list, stolen refresh tokens are valid for 30 days.
-- Solution: Store a SHA-256 hash of each issued refresh token.
--   - On /auth/refresh: verify hash exists and is not expired; rotate token.
--   - On /auth/logout: DELETE the row (token revoked immediately).
--
-- Why hash, not plaintext?
--   If this table is ever read by an attacker, raw tokens would let them impersonate
--   users. A SHA-256 hash is one-way — the original token cannot be recovered from it.
--
-- Cleanup: a cron job (or Supabase scheduled function) should periodically DELETE
-- rows WHERE expires_at < NOW() to prevent unbounded table growth.

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,   -- SHA-256(rawToken), hex-encoded
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash    ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- Cleanup function: called by a weekly cron to prune expired rows.
CREATE OR REPLACE FUNCTION prune_expired_refresh_tokens()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM refresh_tokens WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;


-- #############################################################################
-- # SOURCE: migrations/20260503_cosmetics.sql
-- #############################################################################

-- migrations/20260503_cosmetics.sql
-- Phase: D (Character Customization + Cosmetic Shop)
-- Author: dev-database
-- Date: 2026-05-03
--
-- Implements the full data model for the cosmetic catalog and user loadout:
--
--   cosmetic_items         Global catalog of all purchasable/default items
--   user_cosmetics         Per-user ownership ledger (acquired items)
--   user_equipped_cosmetics  Active loadout: one row per user per slot
--
-- Categories (4):
--   'avatar'  — base portrait art for the user's character
--   'frame'   — decorative border around the avatar on profile cards
--   'badge'   — equippable text/icon tag shown under the username
--   'theme'   — UI color palette that re-skins the app for that user
--
-- Rarity tiers and default credit prices (§ calibration pending cosmetic list):
--   'common'     — 100 credits  (~2 successful streak-weeks at base rate)
--   'rare'       — 300 credits  (~6 streak-weeks)
--   'legendary'  — 750 credits  (~10 streak-weeks, roughly one multiplied run)
--
-- Default items (is_default = TRUE):
--   Available to every user at no cost. Users can equip defaults without
--   owning them — the equip endpoint checks is_default OR ownership.
--
-- Metadata JSONB shape by category:
--   avatar : { "image_url": "...", "alt_text": "..." }
--   frame  : { "image_url": "...", "color_hex": "#RRGGBB" }
--   badge  : { "label": "...", "icon": "...", "color_hex": "#RRGGBB" }
--   theme  : { "primary": "#...", "secondary": "#...", "accent": "#...",
--               "surface": "#...", "on_primary": "#..." }
--
-- Conventions (matching initial_schema.sql):
--   * UUID primary keys via gen_random_uuid()
--   * TIMESTAMPTZ for all timestamps
--   * RLS enabled; service role handles seed writes
--   * set_updated_at() already defined in 20260430_initial_schema.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- SECTION 1: Cosmetic items catalog
-- Global table; not user-scoped. Managed via service role / admin tool.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cosmetic_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    description   TEXT NOT NULL DEFAULT '',
    category      TEXT NOT NULL CHECK (category IN ('avatar', 'frame', 'badge', 'theme')),
    rarity        TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'legendary')),
    price_credits INT  NOT NULL CHECK (price_credits >= 0),
    -- is_default: TRUE → item is free and available to all users without purchase.
    -- Default items cannot be purchased (price_credits is ignored for them).
    is_default    BOOLEAN NOT NULL DEFAULT FALSE,
    -- is_active: FALSE → item is de-listed from the shop (legacy items stay in DB).
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    -- Visual / functional data; shape varies by category (see header).
    metadata      JSONB NOT NULL DEFAULT '{}',
    sort_order    INT  NOT NULL DEFAULT 0,  -- lower = earlier in shop listing
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shop listing query: active items, ordered by category → rarity → sort_order
CREATE INDEX IF NOT EXISTS idx_cosmetic_items_shop
    ON cosmetic_items (category, rarity, sort_order)
    WHERE is_active = TRUE;

-- cosmetic_items is a public catalog: globally READABLE, writes only via the
-- service role (admin tooling). RLS posture (corrected 2026-06-01):
--   ENABLE RLS + a SELECT-only policy.
-- Why: with Supabase's default GRANT ALL to anon/authenticated, leaving RLS
-- *off* would let those keys read AND WRITE this table via the auto REST API —
-- the opposite of "service-role-only writes". Enabling RLS with ONLY a SELECT
-- policy gives public read, denies anon/authenticated writes, and the service
-- role still writes (it bypasses RLS). This also clears the Supabase linter
-- warning ("table without RLS").
ALTER TABLE cosmetic_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cosmetic_items_public_read ON cosmetic_items;
CREATE POLICY cosmetic_items_public_read
    ON cosmetic_items FOR SELECT USING (true);

-- !!  WRITE-GUARD — DO NOT ADD INSERT / UPDATE / DELETE RLS POLICIES HERE  !!
-- Adding any write policy would let authenticated users flip is_default = TRUE
-- on paid items, bypassing the credit-purchase requirement. Catalog mutations
-- stay service-role-only. The SELECT-only policy above is the complete and
-- correct posture; do not add write policies without a security review.

-- ---------------------------------------------------------------------------
-- SECTION 2: User cosmetics (ownership ledger)
-- One row per (user, item) when the user owns the item.
-- Defaults are owned by everyone implicitly (no row needed — checked in API).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_cosmetics (
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id            UUID NOT NULL REFERENCES cosmetic_items(id),
    acquired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acquisition_source TEXT NOT NULL DEFAULT 'purchase'
                           CHECK (acquisition_source IN ('purchase', 'admin_grant')),
    PRIMARY KEY (user_id, item_id)
);

-- User's owned items list (shop "owned" badge + equip permission check)
CREATE INDEX IF NOT EXISTS idx_user_cosmetics_user
    ON user_cosmetics (user_id, acquired_at DESC);

ALTER TABLE user_cosmetics ENABLE ROW LEVEL SECURITY;

-- Users can only see their own inventory.
CREATE POLICY "user_cosmetics_self_select" ON user_cosmetics
    FOR SELECT USING (auth.uid() = user_id);

-- Purchase writes come from application code (service role call in transaction).
-- No direct client INSERT — balance check must be atomic.

-- ---------------------------------------------------------------------------
-- SECTION 3: User equipped cosmetics (active loadout)
-- One row per (user, slot). Slot = category name.
-- A NULL item_id is not stored — absence of a row means "no item equipped"
-- (the app falls back to the category's default item).
-- Constraint: equipped item must be owned by the user OR be a default item.
--   Enforced at the application layer (not in SQL) to keep the constraint
--   readable and to avoid a complex cross-table CHECK.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_equipped_cosmetics (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot       TEXT NOT NULL CHECK (slot IN ('avatar', 'frame', 'badge', 'theme')),
    item_id    UUID NOT NULL REFERENCES cosmetic_items(id),
    equipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, slot)
);

-- Profile display: fetch a user's full equipped loadout in one scan
CREATE INDEX IF NOT EXISTS idx_user_equipped_user
    ON user_equipped_cosmetics (user_id);

ALTER TABLE user_equipped_cosmetics ENABLE ROW LEVEL SECURITY;

-- Anyone can read a user's equipped cosmetics (needed for group roster display).
CREATE POLICY "user_equipped_public_read" ON user_equipped_cosmetics
    FOR SELECT USING (TRUE);

-- Only the owning user can change their own loadout.
CREATE POLICY "user_equipped_self_write" ON user_equipped_cosmetics
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- SECTION 4: Seed data — initial cosmetic catalog
-- 16 items across 4 categories × 3-4 rarities.
-- image_url values are placeholders; replace with CDN URLs before launch.
-- color_hex values are production-ready.
-- All non-default items priced at tier defaults (common=100, rare=300, legendary=750).
-- ---------------------------------------------------------------------------

-- Helper: ensure the seed is idempotent (re-running migration is safe).
-- We insert with ON CONFLICT DO NOTHING so re-runs skip existing rows.

-- ── Avatars ────────────────────────────────────────────────────────────────
INSERT INTO cosmetic_items (name, description, category, rarity, price_credits, is_default, metadata, sort_order)
VALUES
    -- Default avatar: always available, no purchase needed
    ('Rookie',
     'The default athlete. Everyone starts here.',
     'avatar', 'common', 0, TRUE,
     '{"image_url": "/assets/cosmetics/avatars/rookie.png", "alt_text": "A determined beginner athlete"}',
     0),
    ('Iron Grinder',
     'Consistent. Methodical. Always shows up.',
     'avatar', 'common', 100, FALSE,
     '{"image_url": "/assets/cosmetics/avatars/iron_grinder.png", "alt_text": "A focused weightlifter mid-set"}',
     10),
    ('Morning Pacer',
     'Up before the sun. Fastest in the early-morning cohort.',
     'avatar', 'common', 100, FALSE,
     '{"image_url": "/assets/cosmetics/avatars/morning_pacer.png", "alt_text": "A runner at dawn"}',
     20),
    ('Power Block',
     'Rare power athlete. Trains heavy, recovers smart.',
     'avatar', 'rare', 300, FALSE,
     '{"image_url": "/assets/cosmetics/avatars/power_block.png", "alt_text": "A powerlifter in a meet singlet"}',
     30),
    ('Sprint Ghost',
     'Rare track speedster. Leaves the field behind.',
     'avatar', 'rare', 300, FALSE,
     '{"image_url": "/assets/cosmetics/avatars/sprint_ghost.png", "alt_text": "A sprinter mid-stride, motion blur"}',
     40),
    ('Peak Fettle Champion',
     'Legendary. Awarded to those who reach the top of the rankings.',
     'avatar', 'legendary', 750, FALSE,
     '{"image_url": "/assets/cosmetics/avatars/champion.png", "alt_text": "Gold-trimmed champion athlete on a podium"}',
     50),

-- ── Frames ─────────────────────────────────────────────────────────────────
    ('Simple Slate',
     'A clean dark border. Lets the avatar speak for itself.',
     'frame', 'common', 0, TRUE,
     '{"image_url": "/assets/cosmetics/frames/simple_slate.png", "color_hex": "#4A5568"}',
     0),
    ('Bronze Ring',
     'Warm bronze accent. Marks a dedicated competitor.',
     'frame', 'common', 100, FALSE,
     '{"image_url": "/assets/cosmetics/frames/bronze_ring.png", "color_hex": "#CD7F32"}',
     10),
    ('Silver Laurel',
     'A silver wreath border. Classical, earned.',
     'frame', 'rare', 300, FALSE,
     '{"image_url": "/assets/cosmetics/frames/silver_laurel.png", "color_hex": "#C0C0C0"}',
     20),
    ('Gold Circuit',
     'Rare electrified gold frame with circuit-board filigree.',
     'frame', 'rare', 300, FALSE,
     '{"image_url": "/assets/cosmetics/frames/gold_circuit.png", "color_hex": "#FFD700"}',
     30),
    ('Platinum Peak',
     'Legendary platinum mountain-peak frame. Only the elite.',
     'frame', 'legendary', 750, FALSE,
     '{"image_url": "/assets/cosmetics/frames/platinum_peak.png", "color_hex": "#E5E4E2"}',
     40),

-- ── Badges ─────────────────────────────────────────────────────────────────
    ('Consistent',
     'You show up. Every week, without fail.',
     'badge', 'common', 0, TRUE,
     '{"label": "Consistent", "icon": "calendar-check", "color_hex": "#718096"}',
     0),
    ('Early Bird',
     'Logs workouts before 7 AM more than anyone in your group.',
     'badge', 'common', 100, FALSE,
     '{"label": "Early Bird", "icon": "sunrise", "color_hex": "#F6AD55"}',
     10),
    ('Streak Master',
     'Maintained a group streak for 10+ consecutive weeks.',
     'badge', 'rare', 300, FALSE,
     '{"label": "Streak Master", "icon": "fire", "color_hex": "#E53E3E"}',
     20),
    ('Iron Will',
     'Hit your personal goal every week for a full month.',
     'badge', 'rare', 300, FALSE,
     '{"label": "Iron Will", "icon": "dumbbell", "color_hex": "#4A5568"}',
     30),
    ('Peak Performer',
     'Legendary. Top 1% of your cohort. Undeniable.',
     'badge', 'legendary', 750, FALSE,
     '{"label": "Peak Performer", "icon": "crown", "color_hex": "#D69E2E"}',
     40),

-- ── Themes ─────────────────────────────────────────────────────────────────
    ('Charcoal Dark',
     'The default dark mode. Sharp, focused, no distractions.',
     'theme', 'common', 0, TRUE,
     '{"primary": "#1A202C", "secondary": "#2D3748", "accent": "#63B3ED", "surface": "#4A5568", "on_primary": "#F7FAFC"}',
     0),
    ('Arctic White',
     'Clean light mode. Crisp as a morning run in January.',
     'theme', 'common', 100, FALSE,
     '{"primary": "#F7FAFC", "secondary": "#EDF2F7", "accent": "#3182CE", "surface": "#E2E8F0", "on_primary": "#1A202C"}',
     10),
    ('Midnight Blue',
     'Deep navy. Professional and calm.',
     'theme', 'rare', 300, FALSE,
     '{"primary": "#1A365D", "secondary": "#2A4365", "accent": "#90CDF4", "surface": "#2C5282", "on_primary": "#EBF8FF"}',
     20),
    ('Forest Green',
     'Earthy, grounded. For the athlete who trains outdoors.',
     'theme', 'rare', 300, FALSE,
     '{"primary": "#1C4532", "secondary": "#276749", "accent": "#9AE6B4", "surface": "#2F855A", "on_primary": "#F0FFF4"}',
     30),
    ('Crimson Beast',
     'Legendary blood-red. Power. Intensity. No apologies.',
     'theme', 'legendary', 750, FALSE,
     '{"primary": "#63171B", "secondary": "#822727", "accent": "#FEB2B2", "surface": "#9B2C2C", "on_primary": "#FFF5F5"}',
     40),
    ('Golden Hour',
     'Legendary warm amber gradient. The light of champions.',
     'theme', 'legendary', 750, FALSE,
     '{"primary": "#744210", "secondary": "#975A16", "accent": "#FAF089", "surface": "#B7791F", "on_primary": "#FFFFF0"}',
     50)

ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- SUMMARY
-- 3 tables, 3 indexes, 3 RLS policies.
-- 22 seed items: 6 avatars, 5 frames, 5 badges, 6 themes.
--   Default (free) items: 1 per category = 4 total.
--   Common (100 cr): 6 items.
--   Rare (300 cr): 7 items.
--   Legendary (750 cr): 5 items.
-- Application constants (prices, categories) also live in:
--   server/routes/cosmetics.js
-- ---------------------------------------------------------------------------


-- #############################################################################
-- # SOURCE: migrations/20260503_exercise_prs.sql
-- #############################################################################

-- migrations/20260503_exercise_prs.sql
-- Phase: D (PR badges feature — TICKET-008)
-- Author: dev-database
-- Date: 2026-05-03
--
-- PURPOSE
-- -------
-- Introduces exercise_prs: a derived, maintained table that stores each user's
-- personal record (PR) per exercise per rep count.  It backs the PR badge
-- overlay on the recent-sets list (TICKET-008).
--
-- One row per (user_id, exercise_id, rep_count):
--   rep_count = 0   → best estimated 1-Rep Max (E1RM)
--                     Epley formula: weight_kg * (1 + reps / 30)
--                     Exception: singles (reps = 1) → E1RM = weight_kg
--                     (Per CTO guardrail #12)
--   rep_count = 1–N → best weight lifted at exactly that rep count
--
-- MAINTENANCE MODEL
-- -----------------
-- This table is NOT self-maintaining via triggers on sets.  The application
-- layer (WorkoutTracker C++ model) is responsible for issuing an upsert after
-- every new set is logged.  The migration defines only the table structure and
-- constraints.  See "Application layer upsert" section in the migration header
-- for the expected logic.
--
-- Conventions (matching 20260430_initial_schema.sql):
--   * UUID foreign keys; no surrogate PK (composite PK is meaningful here)
--   * TIMESTAMPTZ for all timestamps
--   * Weights stored in kg only; UI converts at render time
--   * RLS enabled; set_updated_at() trigger function already exists from
--     initial_schema.sql
--   * DROP POLICY IF EXISTS before each CREATE POLICY (idempotent)
--
-- AA-02 (2026-05-11): WEIGHT COLUMN NAMING — IMPORTANT FOR FUTURE TRIGGERS
-- -----------------------------------------------------------------------
-- This doc-block (and parts of the body below) still refers to
-- `sets.weight_kg`. As of the 2026-05-05 weight_raw migration, the canonical
-- on-disk column is `sets.weight_raw` (SMALLINT, ÷8 fixed-point). The
-- application layer (`server/routes/sets.js::decodeWeight`) decodes
-- `weight_raw / 8.0` back to a float weight_kg for clients. Any new SQL
-- trigger or query that needs the kg value must use `(weight_raw / 8.0)`
-- directly; selecting `sets.weight_kg` will fail with a column-not-found
-- error. Application-layer upserts remain unchanged because they pass
-- decoded weight values.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- TABLE: exercise_prs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercise_prs (
    user_id       UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    exercise_id   UUID        NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,

    -- 0 = E1RM PR (Epley: weight_kg * (1 + reps/30); singles: weight_kg exactly)
    -- 1–N = weight PR at that exact rep count
    rep_count     SMALLINT    NOT NULL,

    -- Best weight in kg at this rep count, OR best E1RM kg equivalent (rep_count=0)
    weight_kg     NUMERIC(6,2) NOT NULL,

    -- The set that achieved this PR (ON DELETE CASCADE keeps the table clean if
    -- raw logs are ever purged — PR history goes with the source set)
    set_id        UUID        NOT NULL REFERENCES sets(id) ON DELETE CASCADE,

    -- Denormalised timestamp of the achieving set; avoids a join for badge display
    achieved_at   TIMESTAMPTZ NOT NULL,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, exercise_id, rep_count)
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

-- Fast lookup of all PRs for a single user (profile screen, dashboard)
CREATE INDEX IF NOT EXISTS idx_exercise_prs_user
    ON exercise_prs (user_id);

-- Dominant query: all PRs for one user + one exercise (exercise detail screen,
-- PR badge rendering on the recent-sets list — TICKET-008)
CREATE INDEX IF NOT EXISTS idx_exercise_prs_user_exercise
    ON exercise_prs (user_id, exercise_id);

-- ---------------------------------------------------------------------------
-- ROW-LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE exercise_prs ENABLE ROW LEVEL SECURITY;

-- Users can only read, insert, and update their own PR rows.
-- The application layer always supplies user_id = auth.uid() in upserts.
DROP POLICY IF EXISTS "exercise_prs_self_only" ON exercise_prs;
CREATE POLICY "exercise_prs_self_only" ON exercise_prs
    FOR ALL
    USING     (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- set_updated_at() is defined in 20260430_initial_schema.sql
-- DROP first for idempotency (safe to re-run this migration).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_exercise_prs_updated ON exercise_prs;
CREATE TRIGGER trg_exercise_prs_updated
    BEFORE UPDATE ON exercise_prs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- APPLICATION LAYER UPSERT SPEC
-- WorkoutTracker (C++) must call this logic after every logSet() for lift sets.
--
-- After saving a lift set (exercise_id E, reps R, weight_kg W, set_id S, logged_at T):
--
--   // Step 1 — weight PR at this rep count
--   e1rm = (R == 1) ? W : W * (1.0 + R / 30.0)   // Epley, guardrail #12
--   SELECT weight_kg INTO cur_weight
--     FROM exercise_prs WHERE user_id=U AND exercise_id=E AND rep_count=R;
--   IF NOT FOUND OR W > cur_weight:
--     INSERT INTO exercise_prs (user_id,exercise_id,rep_count,weight_kg,set_id,achieved_at)
--     VALUES (U, E, R, W, S, T)
--     ON CONFLICT (user_id,exercise_id,rep_count) DO UPDATE
--       SET weight_kg=EXCLUDED.weight_kg, set_id=EXCLUDED.set_id,
--           achieved_at=EXCLUDED.achieved_at, updated_at=NOW();
--
--   // Step 2 — E1RM PR (rep_count = 0)
--   SELECT weight_kg INTO cur_e1rm
--     FROM exercise_prs WHERE user_id=U AND exercise_id=E AND rep_count=0;
--   IF NOT FOUND OR e1rm > cur_e1rm:
--     INSERT INTO exercise_prs (user_id,exercise_id,rep_count,weight_kg,set_id,achieved_at)
--     VALUES (U, E, 0, e1rm, S, T)
--     ON CONFLICT (user_id,exercise_id,rep_count) DO UPDATE
--       SET weight_kg=EXCLUDED.weight_kg, set_id=EXCLUDED.set_id,
--           achieved_at=EXCLUDED.achieved_at, updated_at=NOW();
--
-- recentSets() JOIN to set isPr:
--   LEFT JOIN exercise_prs pr
--          ON pr.user_id    = s.user_id
--         AND pr.exercise_id = s.exercise_id
--         AND pr.set_id      = s.id
--   -- isPr = (pr.set_id IS NOT NULL)
--   -- A row appears in exercise_prs only when it is the current record holder,
--   -- so the join naturally marks only the PR set in the list.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- SUMMARY
-- 1 table   : exercise_prs
-- 2 indexes : idx_exercise_prs_user, idx_exercise_prs_user_exercise
-- 1 policy  : exercise_prs_self_only (FOR ALL, self-scoped)
-- 1 trigger : trg_exercise_prs_updated
-- ---------------------------------------------------------------------------


-- #############################################################################
-- # SOURCE: migrations/20260503_group_streak_credits.sql
-- #############################################################################

-- migrations/20260503_group_streak_credits.sql
-- Phase: D (Group Streak Credits feature)
-- Author: dev-database
-- Date: 2026-05-03
-- Source: group_streak_credits_spec.md
--
-- Implements the full data model for §4 of the Group Streak Credits spec:
--
--   user_weekly_goals       Per-user workout target (§2, §3 decision 7)
--   groups                  Group definition + admin + streak state (§4)
--   group_memberships       Membership roster with lifecycle status (§4, §7)
--   group_week_evaluations  Idempotent audit row per group per ISO week (§4, §5)
--   credit_ledger           Append-only wallet ledger (§4)
--   user_credit_balance     Derived view: SUM(credit_ledger.amount) per user
--   group_active_member_count  Helper view for dormancy and cap checks
--
-- Proposed defaults baked in (§10 — single source of truth; calibrate before launch):
--   GROUP_SIZE_CAP       = 12
--   MAX_GROUPS_PER_USER  = 3   (enforced in application code, not SQL)
--   ACCOUNT_AGE_DAYS     = 30  (enforced in application code)
--   MIN_SESSIONS         = 10  (enforced in application code)
--   WEEKLY_GOAL_FLOOR    = 1   (CHECK constraint on user_weekly_goals)
--   BASE_CREDITS         = 50  (enforced in application code / cron)
--   MULTIPLIER_CAP       = 3.0 (enforced in application code / cron)
--   NEW_JOINER_GRACE_WKS = 2   (enforced in application code / cron)
--   KICK_COOLDOWN_WEEKS  = 4   (enforced in application code)
--
-- Conventions (matching 20260430_initial_schema.sql):
--   * UUID primary keys via gen_random_uuid()
--   * TIMESTAMPTZ for all timestamps
--   * Soft lifecycles via status TEXT columns (no hard deletes on memberships)
--   * RLS enabled on every table; service role handles all cron writes
--   * set_updated_at() trigger function already exists from initial_schema.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- SECTION 1: User weekly goals
-- §2: Each member sets a personal weekly goal ("4 workouts/week", etc.).
-- §7: Mid-week edits queue and apply the following Monday.
-- §3 decision 7: Floor of 1 workout/week.
-- The cron job applies pending_workouts_per_week before evaluating a group.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_weekly_goals (
    user_id                   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    workouts_per_week         INT  NOT NULL DEFAULT 3
                                  CHECK (workouts_per_week >= 1),
    -- Queued change: applies on pending_applies_at (next Monday 00:00 UTC)
    pending_workouts_per_week INT  CHECK (pending_workouts_per_week >= 1),
    pending_applies_at        DATE,  -- ISO week start (Monday) when pending takes effect
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_weekly_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_weekly_goals_self_only" ON user_weekly_goals
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_user_weekly_goals_updated
    BEFORE UPDATE ON user_weekly_goals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- SECTION 2: Groups
-- §1: Creator picks name and size_cap (2 ≤ cap ≤ 12).
--     Creator becomes admin: can kick members, rename, transfer admin role.
--     Group activates the moment a second member joins.
-- §4 spec DDL faithfully reproduced + invite_token added for share-link invites.
-- invite_token: UUID regenerated on demand by admin; used for the join link.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS groups (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    size_cap             INT  NOT NULL CHECK (size_cap BETWEEN 2 AND 12),
    admin_user_id        UUID NOT NULL REFERENCES users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_streak_weeks INT  NOT NULL DEFAULT 0,
    last_evaluated_week  DATE,   -- ISO week start (Monday) of most recent evaluation
    -- Share-link token. Regenerated by admin whenever old link should be invalidated.
    invite_token         UUID NOT NULL DEFAULT gen_random_uuid(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- idx_groups_last_evaluated: fast scan for the weekly cron job (§5)
CREATE INDEX IF NOT EXISTS idx_groups_last_evaluated
    ON groups (last_evaluated_week);

-- idx_groups_admin: admin-lookup for permission checks
CREATE INDEX IF NOT EXISTS idx_groups_admin
    ON groups (admin_user_id);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- NOTE: "groups_visible_to_members" policy is defined AFTER group_memberships is
-- created (see below) because the policy body references group_memberships and
-- Postgres validates the reference immediately at CREATE POLICY time.

-- Only the admin can update group metadata (name, invite_token).
CREATE POLICY "groups_admin_update" ON groups
    FOR UPDATE USING (auth.uid() = admin_user_id);

-- Group creation is done by the creating user; INSERT allowed when caller = admin.
-- (Application code enforces the eligibility gate and group-cap before the INSERT.)
CREATE POLICY "groups_insert_by_creator" ON groups
    FOR INSERT WITH CHECK (auth.uid() = admin_user_id);

CREATE TRIGGER trg_groups_updated
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- SECTION 3: Group memberships
-- §4 spec DDL + kick_cooldown_until for the 4-week rejoin cooldown (§7, §8).
-- status lifecycle: 'active' → 'left' (voluntary) | 'kicked' (admin action)
-- joined_at determines first eligible week: member eligible for weeks starting
--   AFTER the Monday following joined_at (see §7 — week-boundary join rule).
-- left_at is set on leave/kick; used by cron for the 48h kick rule (§7).
-- kick_cooldown_until: blocks rejoin for 4 weeks after a kick (§7, §8).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_memberships (
    group_id             UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id              UUID NOT NULL REFERENCES users(id),
    joined_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at              TIMESTAMPTZ,
    status               TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'left', 'kicked')),
    kick_cooldown_until  TIMESTAMPTZ,  -- NULL unless kicked; blocks rejoin until this ts
    PRIMARY KEY (group_id, user_id)
);

-- Active-members-per-group: dominant query for cron + size-cap enforcement
CREATE INDEX IF NOT EXISTS idx_group_memberships_group_status
    ON group_memberships (group_id, status);

-- User's active memberships: concurrent-group-cap enforcement (§3 decision 5)
CREATE INDEX IF NOT EXISTS idx_group_memberships_user_active
    ON group_memberships (user_id)
    WHERE status = 'active';

-- last_evaluated_week scan in cron: also needs a user_id lookup for goal checks
CREATE INDEX IF NOT EXISTS idx_group_memberships_user
    ON group_memberships (user_id);

ALTER TABLE group_memberships ENABLE ROW LEVEL SECURITY;

-- Members can see all memberships (active + past) in groups they belong to.
CREATE POLICY "memberships_visible_to_group_members" ON group_memberships
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM group_memberships gm2
            WHERE gm2.group_id = group_memberships.group_id
              AND gm2.user_id  = auth.uid()
              AND gm2.status   = 'active'
        )
    );

-- A user can insert their own membership row (when joining via API).
CREATE POLICY "memberships_self_insert" ON group_memberships
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- A member can update their own row (to leave); admin can update any row in their groups.
CREATE POLICY "memberships_self_or_admin_update" ON group_memberships
    FOR UPDATE USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM groups g
            WHERE g.id = group_memberships.group_id
              AND g.admin_user_id = auth.uid()
        )
    );

-- Deferred: groups SELECT policy that cross-references group_memberships.
-- Must appear after group_memberships is created (circular FK dependency).
CREATE POLICY "groups_visible_to_members" ON groups
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM group_memberships gm
            WHERE gm.group_id = groups.id
              AND gm.user_id  = auth.uid()
              AND gm.status   = 'active'
        )
    );

-- ---------------------------------------------------------------------------
-- SECTION 4: Group week evaluations
-- §4, §5: Idempotent audit row per (group_id, week_start).
--   credits_per_member = 0 on failure, > 0 on success.
--   Primary key blocks double-inserts — replays are no-ops (§5, §9).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_week_evaluations (
    group_id            UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    week_start          DATE NOT NULL,   -- ISO week start (Monday, UTC)
    eligible_members    INT  NOT NULL,
    members_hit_goal    INT  NOT NULL,
    streak_weeks_after  INT  NOT NULL,
    credits_per_member  INT  NOT NULL,   -- 0 on failure
    evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, week_start)
);

-- History display: most recent first per group
CREATE INDEX IF NOT EXISTS idx_group_week_evals_group
    ON group_week_evaluations (group_id, week_start DESC);

ALTER TABLE group_week_evaluations ENABLE ROW LEVEL SECURITY;

-- Current and past members can read evaluation history.
CREATE POLICY "evaluations_visible_to_members" ON group_week_evaluations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM group_memberships gm
            WHERE gm.group_id = group_week_evaluations.group_id
              AND gm.user_id  = auth.uid()
        )
    );

-- Only the service role (cron) inserts evaluation rows; client writes blocked.

-- ---------------------------------------------------------------------------
-- SECTION 5: Credit ledger (append-only)
-- §4: Wallet balance is NEVER stored — it is always derived as SUM(amount).
-- Positive amounts = earned; negative = spent.
-- source: 'group_streak' | 'cosmetic_purchase' | 'admin_adjustment'
--   cosmetic_purchase and admin_adjustment reserved for future use.
-- group_id + week_start populated for 'group_streak' entries (audit trail).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_ledger (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    amount      INT  NOT NULL,
    source      TEXT NOT NULL
                    CHECK (source IN ('group_streak', 'cosmetic_purchase', 'admin_adjustment')),
    group_id    UUID REFERENCES groups(id),
    week_start  DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast balance derivation and paginated history display
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
    ON credit_ledger (user_id, created_at DESC);

ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;

-- Users can only read their own ledger.
CREATE POLICY "credit_ledger_self_select" ON credit_ledger
    FOR SELECT USING (auth.uid() = user_id);

-- All ledger writes come from the service role (cron, cosmetic shop).
-- No direct client INSERT/UPDATE/DELETE.

-- ---------------------------------------------------------------------------
-- SECTION 6: Derived views
-- ---------------------------------------------------------------------------

-- user_credit_balance: wallet balance per user (§4)
-- Usage: SELECT balance FROM user_credit_balance WHERE user_id = $1
CREATE OR REPLACE VIEW user_credit_balance AS
    SELECT user_id, COALESCE(SUM(amount), 0) AS balance
    FROM credit_ledger
    GROUP BY user_id;

-- group_active_member_count: active headcount per group
-- Used by application code for size-cap checks and dormancy detection.
CREATE OR REPLACE VIEW group_active_member_count AS
    SELECT group_id, COUNT(*) AS active_count
    FROM group_memberships
    WHERE status = 'active'
    GROUP BY group_id;

-- ---------------------------------------------------------------------------
-- SUMMARY
-- 5 tables, 2 views, 7 indexes, 12 RLS policies, 2 triggers.
-- All application-layer constants (caps, rates, multiplier) live in:
--   server/routes/groups.js  (API layer)
--   server/cron/group-streaks.js  (evaluation cron)
-- ---------------------------------------------------------------------------


-- #############################################################################
-- # SOURCE: migrations/20260503_rls_policies.sql
-- #############################################################################

-- migrations/20260503_rls_policies.sql
-- Phase: D (RLS completeness pass)
-- Author: dev-database
-- Date: 2026-05-03
--
-- PURPOSE
-- -------
-- Fills the RLS gaps left by earlier migration files.
-- All prior table-specific migrations (20260430_initial_schema.sql,
-- 20260502_percentile_engine.sql, 20260502_refresh_token_revocation.sql, etc.)
-- already enable RLS and define policies on user-scoped tables.
-- This migration covers the two tables that were missed:
--
--   user_percentile_rankings  — users should read only their own ranking rows
--   refresh_tokens            — users should read/delete only their own tokens
--
-- It also enables RLS on the four global read-only tables and adds a
-- permissive SELECT policy to each.  This is defence-in-depth: those tables
-- hold no user-private data, but enabling RLS now prevents any accidental
-- write policy being added later without review.
--
--   exercises        — global library; any authenticated user can read
--   exercise_aliases — same
--   percentile_vectors — batch distribution data; any authenticated user can read
--   lift_vectors     — model coefficients; any authenticated user can read
--
-- cosmetic_items is deliberately omitted: cosmetics.sql documents that it is
-- intentionally public (no RLS) so the unauthenticated shop preview works.
-- Revisit at Phase E if anonymous browsing policy changes.
--
-- !!  WRITE-GUARD for cosmetic_items  !!
-- DO NOT add INSERT / UPDATE / DELETE policies to cosmetic_items here or in
-- any future migration without a security review. The absence of write RLS is
-- intentional: all catalog mutations go through the service role. Adding a
-- write policy — even FOR SELECT — could allow users to flip is_default = TRUE
-- on paid items, granting free access to premium cosmetics.
-- See 20260503_cosmetics.sql for the full rationale.
--
-- All statements use DROP POLICY IF EXISTS before CREATE POLICY so this
-- migration is safe to re-run (idempotent).
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. user_percentile_rankings
-- ===========================================================================
-- Cron job writes (INSERT / UPDATE) via the service role — no client write
-- policy is needed or desirable.
-- Users may only read their own ranking rows.
-- ---------------------------------------------------------------------------
ALTER TABLE user_percentile_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "percentile_rankings_self_select" ON user_percentile_rankings;
CREATE POLICY "percentile_rankings_self_select" ON user_percentile_rankings
    FOR SELECT
    USING (auth.uid() = user_id);


-- ===========================================================================
-- 2. refresh_tokens
-- ===========================================================================
-- Token issuance (INSERT) is done by the auth service layer via the service
-- role — no client INSERT policy.
-- Users may SELECT their own tokens (for active-session display, if ever
-- surfaced) and DELETE their own token on logout.
-- The /auth/refresh endpoint operates via the service role and is unaffected
-- by client-tier policies.
-- ---------------------------------------------------------------------------
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refresh_tokens_self_select" ON refresh_tokens;
CREATE POLICY "refresh_tokens_self_select" ON refresh_tokens
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "refresh_tokens_self_delete" ON refresh_tokens;
CREATE POLICY "refresh_tokens_self_delete" ON refresh_tokens
    FOR DELETE
    USING (auth.uid() = user_id);


-- ===========================================================================
-- 3. exercises  (global read-only, defence-in-depth)
-- ===========================================================================
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercises_public_read" ON exercises;
CREATE POLICY "exercises_public_read" ON exercises
    FOR SELECT
    USING (TRUE);

-- No INSERT / UPDATE / DELETE policies for authenticated clients.
-- All writes come through the service role (seeding + admin tooling).


-- ===========================================================================
-- 4. exercise_aliases  (global read-only, defence-in-depth)
-- ===========================================================================
ALTER TABLE exercise_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercise_aliases_public_read" ON exercise_aliases;
CREATE POLICY "exercise_aliases_public_read" ON exercise_aliases
    FOR SELECT
    USING (TRUE);


-- ===========================================================================
-- 5. percentile_vectors  (global read-only, defence-in-depth)
-- ===========================================================================
-- Batch-computed distribution data; holds no user PII.
-- Any authenticated client may read; writes are service-role only.
-- ---------------------------------------------------------------------------
ALTER TABLE percentile_vectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "percentile_vectors_public_read" ON percentile_vectors;
CREATE POLICY "percentile_vectors_public_read" ON percentile_vectors
    FOR SELECT
    USING (TRUE);


-- ===========================================================================
-- 6. lift_vectors  (global read-only, defence-in-depth)
-- ===========================================================================
-- Model coefficients; holds no user PII.
-- Any authenticated client may read (needed by the mobile app to display
-- lift descriptions and inheritance info); writes are service-role only.
-- ---------------------------------------------------------------------------
ALTER TABLE lift_vectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lift_vectors_public_read" ON lift_vectors;
CREATE POLICY "lift_vectors_public_read" ON lift_vectors
    FOR SELECT
    USING (TRUE);


-- ===========================================================================
-- SUMMARY
-- 6 tables touched:
--   user_percentile_rankings  — RLS enabled; 1 policy (self SELECT)
--   refresh_tokens            — RLS enabled; 2 policies (self SELECT, self DELETE)
--   exercises                 — RLS enabled; 1 policy (public SELECT)
--   exercise_aliases          — RLS enabled; 1 policy (public SELECT)
--   percentile_vectors        — RLS enabled; 1 policy (public SELECT)
--   lift_vectors              — RLS enabled; 1 policy (public SELECT)
--
-- Tables explicitly NOT touched (already handled in prior migrations):
--   users, workouts, sets, plans, streaks, streak_overrides,
--   daily_health_log, habits, user_weekly_goals, groups,
--   group_memberships, group_week_evaluations, credit_ledger,
--   user_cosmetics, user_equipped_cosmetics
--
-- Tables explicitly NOT touched (intentional no-RLS design):
--   cosmetic_items  — public catalog; anonymous shop preview requires it;
--                     see cosmetics.sql for rationale.
-- ===========================================================================


-- #############################################################################
-- # SOURCE: migrations/20260504_daily_health_metrics.sql
-- #############################################################################

-- migrations/20260504_daily_health_metrics.sql
-- Phase: C (TICKET-013 — Smartwatch Integration, Phase C backend/DB layer)
-- Author: dev-database
-- Date: 2026-05-04
--
-- PURPOSE
-- -------
-- Creates the daily_health_metrics table that stores wearable-sourced health
-- signals used to contextualise AI plan generation (TICKET-011).
--
-- Phase C scope: Apple HealthKit read path (resting HR, HRV, sleep, active
-- calories). The mobile team's HealthKit background-refresh task writes rows
-- via POST /health-metrics. The AI plan prompt reads the last 7 days of metrics
-- per user to inform intensity and volume recommendations.
--
-- Phase D additions (do not add yet):
--   - Garmin Connect IQ read path (source = 'garmin')
--   - Galaxy Watch / Wear OS (source = 'wear_os')
--
-- UNIQUE constraint on (user_id, date, source) allows a single upsert per
-- source per day. If HealthKit syncs twice on the same day the later write wins.
--
-- Safe to re-run: all DDL uses IF NOT EXISTS / IF EXISTS guards.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS daily_health_metrics (
    metric_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date            DATE        NOT NULL,
    resting_hr_bpm  INT         CHECK (resting_hr_bpm IS NULL OR (resting_hr_bpm BETWEEN 20 AND 250)),
    hrv_ms          NUMERIC(6,2) CHECK (hrv_ms IS NULL OR hrv_ms >= 0),
    sleep_hours     NUMERIC(4,2) CHECK (sleep_hours IS NULL OR (sleep_hours BETWEEN 0 AND 24)),
    active_kcal     INT         CHECK (active_kcal IS NULL OR active_kcal >= 0),
    source          TEXT        NOT NULL DEFAULT 'apple_healthkit'
                                CHECK (source IN ('apple_healthkit', 'garmin', 'wear_os', 'manual')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, date, source)
);

CREATE INDEX IF NOT EXISTS idx_daily_health_metrics_user_date
    ON daily_health_metrics(user_id, date DESC);

-- RLS: users read and write only their own health metrics.
-- The mobile client writes rows directly via the API (not Supabase realtime)
-- so we only need a standard user-scoped policy here.
ALTER TABLE daily_health_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own health metrics"   ON daily_health_metrics;
DROP POLICY IF EXISTS "users insert own health metrics" ON daily_health_metrics;
DROP POLICY IF EXISTS "users update own health metrics" ON daily_health_metrics;

CREATE POLICY "users read own health metrics"
    ON daily_health_metrics FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "users insert own health metrics"
    ON daily_health_metrics FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own health metrics"
    ON daily_health_metrics FOR UPDATE
    USING (auth.uid() = user_id);


-- #############################################################################
-- # SOURCE: migrations/20260504_user_constraints.sql
-- #############################################################################

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


-- #############################################################################
-- # SOURCE: migrations/20260510_exercise_prs_delete_trigger.sql
-- #############################################################################

-- migrations/20260510_exercise_prs_delete_trigger.sql
-- Phase B — Y-03: exercise_prs stale-PR recompute on set delete / downward edit
-- Author: dev-database (pf-1am-dev-ops automated session)
-- Date: 2026-05-10
--
-- PROBLEM (Y-03)
-- ──────────────
-- exercise_prs stores one row per (user_id, exercise_id, rep_count) pointing at
-- the set that achieved the current PR.  The application layer upserts this table
-- on every new logSet() call (upward path only).
--
-- Two silent-corruption cases exist when the DELETE /sets/:id endpoint is used
-- (or a weight/rep correction goes downward):
--
--   A. SET DELETE  — exercise_prs.set_id has ON DELETE CASCADE, so the PR row
--      vanishes with the set.  If a second-best set existed, it never becomes the
--      recorded PR.  The user's badge disappears silently.
--
--   B. DOWNWARD EDIT  — a PATCH /sets/:id lowers weight_raw or reps.  The PR row
--      still points to that set but now stores a value that another set may beat.
--      Stale PR remains on display.
--
-- SOLUTION
-- ────────
-- Two SECURITY DEFINER trigger functions (bypass RLS; only called from internal
-- trigger context, never from client code):
--
--   recompute_exercise_pr_after_set_delete()
--     Fires: AFTER DELETE ON sets FOR EACH ROW
--     Action:
--       • Re-scan sets for the new best weight at OLD.reps → upsert or no-op
--       • Re-scan all sets for best E1RM → upsert or delete rep_count=0 row
--
--   recompute_exercise_pr_after_set_update()
--     Fires: AFTER UPDATE ON sets FOR EACH ROW
--     Guard: skips if weight_raw did not decrease AND reps did not change
--            (upward edits are already handled by app-layer upsert)
--     Action: same recompute as delete function, for both old-reps bucket and
--             new-reps bucket, plus E1RM recompute.
--
-- IDEMPOTENCY
-- ───────────
-- Uses CREATE OR REPLACE FUNCTION and DROP TRIGGER IF EXISTS / CREATE TRIGGER.
-- Safe to re-run.
--
-- COMPATIBILITY
-- ─────────────
-- weight_raw column (SMALLINT, kg × 8) introduced in 20260505_sets_weight_raw.sql.
-- E1RM formula per CTO guardrail #12: singles (reps = 1) → weight_raw / 8.0 exactly;
-- others → (weight_raw / 8.0) * (1.0 + reps / 30.0)  [Epley].
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. Trigger function: recompute after DELETE
-- ===========================================================================
CREATE OR REPLACE FUNCTION recompute_exercise_pr_after_set_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as function owner (postgres); bypasses client-tier RLS
SET search_path = public
AS $$
DECLARE
    v_best_rep  RECORD;
    v_best_e1rm RECORD;
BEGIN
    -- Only lift sets participate in exercise_prs.
    IF OLD.kind <> 'lift' THEN
        RETURN OLD;
    END IF;

    -- ── A. Weight PR at this exact rep count ─────────────────────────────────
    -- The ON DELETE CASCADE on exercise_prs.set_id has already removed the PR row
    -- if this set was the record holder.  Find the next-best set, if any.
    SELECT s.id,
           s.weight_raw / 8.0 AS weight_kg,
           s.logged_at
    INTO   v_best_rep
    FROM   sets s
    WHERE  s.user_id     = OLD.user_id
      AND  s.exercise_id = OLD.exercise_id
      AND  s.reps        = OLD.reps
      AND  s.kind        = 'lift'
    ORDER  BY s.weight_raw DESC, s.logged_at ASC
    LIMIT  1;

    IF FOUND THEN
        INSERT INTO exercise_prs
               (user_id, exercise_id, rep_count, weight_kg, set_id, achieved_at)
        VALUES (OLD.user_id, OLD.exercise_id, OLD.reps,
                v_best_rep.weight_kg, v_best_rep.id, v_best_rep.logged_at)
        ON CONFLICT (user_id, exercise_id, rep_count) DO UPDATE
            SET weight_kg   = EXCLUDED.weight_kg,
                set_id      = EXCLUDED.set_id,
                achieved_at = EXCLUDED.achieved_at,
                updated_at  = NOW();
    END IF;
    -- If NOT FOUND: CASCADE already removed the PR row — no new record exists.

    -- ── B. E1RM PR (rep_count = 0) ────────────────────────────────────────────
    -- The deleted set may have held the E1RM PR.  Recompute across all remaining
    -- lift sets for this (user, exercise).
    SELECT s.id,
           s.logged_at,
           CASE
               WHEN s.reps = 1 THEN s.weight_raw / 8.0
               ELSE (s.weight_raw / 8.0) * (1.0 + s.reps / 30.0)
           END AS e1rm_kg
    INTO   v_best_e1rm
    FROM   sets s
    WHERE  s.user_id     = OLD.user_id
      AND  s.exercise_id = OLD.exercise_id
      AND  s.kind        = 'lift'
      AND  s.reps       >= 1
    ORDER  BY
           CASE
               WHEN s.reps = 1 THEN s.weight_raw / 8.0
               ELSE (s.weight_raw / 8.0) * (1.0 + s.reps / 30.0)
           END DESC,
           s.logged_at ASC
    LIMIT  1;

    IF FOUND THEN
        INSERT INTO exercise_prs
               (user_id, exercise_id, rep_count, weight_kg, set_id, achieved_at)
        VALUES (OLD.user_id, OLD.exercise_id, 0,
                v_best_e1rm.e1rm_kg, v_best_e1rm.id, v_best_e1rm.logged_at)
        ON CONFLICT (user_id, exercise_id, rep_count) DO UPDATE
            SET weight_kg   = EXCLUDED.weight_kg,
                set_id      = EXCLUDED.set_id,
                achieved_at = EXCLUDED.achieved_at,
                updated_at  = NOW();
    ELSE
        -- No lift sets remain for this exercise: remove the E1RM row if it exists.
        DELETE FROM exercise_prs
        WHERE  user_id     = OLD.user_id
          AND  exercise_id = OLD.exercise_id
          AND  rep_count   = 0;
    END IF;

    RETURN OLD;
END;
$$;

-- Register the DELETE trigger
DROP TRIGGER IF EXISTS trg_exercise_prs_recompute_on_delete ON sets;
CREATE TRIGGER trg_exercise_prs_recompute_on_delete
    AFTER DELETE ON sets
    FOR EACH ROW
    EXECUTE FUNCTION recompute_exercise_pr_after_set_delete();


-- ===========================================================================
-- 2. Helper: recompute both rep-count PR and E1RM PR for a given
--    (user_id, exercise_id, reps) tuple.
--    Called by the UPDATE trigger for OLD.reps and NEW.reps buckets.
-- ===========================================================================
CREATE OR REPLACE FUNCTION _recompute_pr_bucket(
    p_user_id     UUID,
    p_exercise_id UUID,
    p_reps        SMALLINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_best RECORD;
BEGIN
    -- Weight PR at p_reps
    SELECT s.id,
           s.weight_raw / 8.0 AS weight_kg,
           s.logged_at
    INTO   v_best
    FROM   sets s
    WHERE  s.user_id     = p_user_id
      AND  s.exercise_id = p_exercise_id
      AND  s.reps        = p_reps
      AND  s.kind        = 'lift'
    ORDER  BY s.weight_raw DESC, s.logged_at ASC
    LIMIT  1;

    IF FOUND THEN
        INSERT INTO exercise_prs
               (user_id, exercise_id, rep_count, weight_kg, set_id, achieved_at)
        VALUES (p_user_id, p_exercise_id, p_reps,
                v_best.weight_kg, v_best.id, v_best.logged_at)
        ON CONFLICT (user_id, exercise_id, rep_count) DO UPDATE
            SET weight_kg   = EXCLUDED.weight_kg,
                set_id      = EXCLUDED.set_id,
                achieved_at = EXCLUDED.achieved_at,
                updated_at  = NOW();
    ELSE
        DELETE FROM exercise_prs
        WHERE  user_id     = p_user_id
          AND  exercise_id = p_exercise_id
          AND  rep_count   = p_reps;
    END IF;
END;
$$;


-- ===========================================================================
-- 3. Trigger function: recompute after downward UPDATE
-- ===========================================================================
CREATE OR REPLACE FUNCTION recompute_exercise_pr_after_set_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_best_e1rm RECORD;
BEGIN
    -- Only lift sets with a weight or reps change that could dethrone a PR.
    IF NEW.kind <> 'lift' THEN
        RETURN NEW;
    END IF;

    -- Fast-path: upward edits are handled by the application-layer upsert.
    -- Only trigger a recompute when weight went DOWN or reps changed.
    IF NEW.weight_raw >= OLD.weight_raw AND NEW.reps = OLD.reps THEN
        RETURN NEW;
    END IF;

    -- ── Recompute rep-count PR buckets ───────────────────────────────────────
    -- If reps changed, the OLD rep bucket needs a full recompute (this set may
    -- no longer be its best).
    IF NEW.reps <> OLD.reps THEN
        PERFORM _recompute_pr_bucket(OLD.user_id, OLD.exercise_id, OLD.reps);
    END IF;

    -- The NEW rep bucket always needs a recompute (weight may have dropped).
    PERFORM _recompute_pr_bucket(NEW.user_id, NEW.exercise_id, NEW.reps);

    -- ── Recompute E1RM PR (rep_count = 0) ────────────────────────────────────
    SELECT s.id,
           s.logged_at,
           CASE
               WHEN s.reps = 1 THEN s.weight_raw / 8.0
               ELSE (s.weight_raw / 8.0) * (1.0 + s.reps / 30.0)
           END AS e1rm_kg
    INTO   v_best_e1rm
    FROM   sets s
    WHERE  s.user_id     = NEW.user_id
      AND  s.exercise_id = NEW.exercise_id
      AND  s.kind        = 'lift'
      AND  s.reps       >= 1
    ORDER  BY
           CASE
               WHEN s.reps = 1 THEN s.weight_raw / 8.0
               ELSE (s.weight_raw / 8.0) * (1.0 + s.reps / 30.0)
           END DESC,
           s.logged_at ASC
    LIMIT  1;

    IF FOUND THEN
        INSERT INTO exercise_prs
               (user_id, exercise_id, rep_count, weight_kg, set_id, achieved_at)
        VALUES (NEW.user_id, NEW.exercise_id, 0,
                v_best_e1rm.e1rm_kg, v_best_e1rm.id, v_best_e1rm.logged_at)
        ON CONFLICT (user_id, exercise_id, rep_count) DO UPDATE
            SET weight_kg   = EXCLUDED.weight_kg,
                set_id      = EXCLUDED.set_id,
                achieved_at = EXCLUDED.achieved_at,
                updated_at  = NOW();
    ELSE
        DELETE FROM exercise_prs
        WHERE  user_id     = NEW.user_id
          AND  exercise_id = NEW.exercise_id
          AND  rep_count   = 0;
    END IF;

    RETURN NEW;
END;
$$;

-- Register the UPDATE trigger
DROP TRIGGER IF EXISTS trg_exercise_prs_recompute_on_update ON sets;
CREATE TRIGGER trg_exercise_prs_recompute_on_update
    AFTER UPDATE OF weight_raw, reps ON sets
    FOR EACH ROW
    EXECUTE FUNCTION recompute_exercise_pr_after_set_update();


-- ===========================================================================
-- SUMMARY
-- ───────
-- 3 new functions:
--   recompute_exercise_pr_after_set_delete()  — AFTER DELETE trigger handler
--   _recompute_pr_bucket(user, exercise, reps) — shared helper (SECURITY DEFINER)
--   recompute_exercise_pr_after_set_update()  — AFTER UPDATE trigger handler
--
-- 2 new triggers on the `sets` table:
--   trg_exercise_prs_recompute_on_delete  — fires AFTER DELETE FOR EACH ROW
--   trg_exercise_prs_recompute_on_update  — fires AFTER UPDATE OF weight_raw, reps
--
-- Closes Y-03: stale exercise_prs rows on set-delete and downward weight/rep edit.
-- All functions are SECURITY DEFINER to bypass RLS in the trigger context.
-- No changes to existing tables, indexes, or policies.
-- ===========================================================================


-- #############################################################################
-- # SOURCE: migrations/20260510_exercise_prs_recompute_trigger.sql
-- #############################################################################

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


-- #############################################################################
-- # SOURCE: migrations/20260515_plans_active.sql
-- #############################################################################

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


-- ============================ PART 2: ADDITIVE MIGRATIONS (after 2026-05-15) ============================

-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260504_orphaned_auth_records.sql
-- #############################################################################

-- Migration: 20260504_orphaned_auth_records
-- Cleanup table for Supabase auth records that failed to delete via the admin
-- API after the corresponding DB rows were already removed (TICKET-030).
--
-- A cleanup cron job should periodically:
--   1. SELECT auth_uid FROM orphaned_auth_records WHERE resolved_at IS NULL
--   2. Call supabaseAdmin.auth.admin.deleteUser(auth_uid) for each row
--   3. UPDATE orphaned_auth_records SET resolved_at = NOW() on success
--
-- The cron is the belt-and-suspenders guarantee referenced in TICKET-030.

CREATE TABLE IF NOT EXISTS orphaned_auth_records (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_uid    UUID        NOT NULL,
    -- Human-readable error from the failed deleteUser() call.
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Set by the cleanup cron once deleteUser() succeeds on retry.
    resolved_at TIMESTAMPTZ
);

-- Only the service role / backend can write to this table.
-- RLS: no SELECT / INSERT / UPDATE / DELETE for authenticated or anon users.
ALTER TABLE orphaned_auth_records ENABLE ROW LEVEL SECURITY;
-- No policies = deny all for normal roles. The service role bypasses RLS
-- entirely (Supabase default), so the backend can still insert rows.

-- Index for the cron query (unresolved orphans only).
CREATE INDEX IF NOT EXISTS idx_orphaned_auth_records_unresolved
    ON orphaned_auth_records (created_at)
    WHERE resolved_at IS NULL;


-- #############################################################################
-- # SOURCE: migrations/20260516_theme_preference.sql
-- #############################################################################

-- Migration: 20260516_theme_preference.sql
-- Phase E — E-002: Theme Switcher
--
-- Adds theme_preference column to users table so the selected theme
-- persists across devices and survives an app reinstall.
-- The mobile app reads this at login and writes it on theme change
-- via PATCH /user/profile { theme_preference }.
--
-- Valid values match the ThemeName union type in mobile/src/theme/types.ts:
--   'deepOcean' | 'ember' | 'forest' | 'midnight' | 'monochrome'

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme_preference TEXT
    DEFAULT 'deepOcean'
    CHECK (theme_preference IN ('deepOcean', 'ember', 'forest', 'midnight', 'monochrome'));

COMMENT ON COLUMN users.theme_preference IS
  'User-selected app theme. Default: deepOcean (dark navy + turquoise). '
  'Persisted via PATCH /user/profile and loaded at auth login. '
  'Valid values: deepOcean | ember | forest | midnight | monochrome (Phase E, E-002).';


-- #############################################################################
-- # SOURCE: migrations/20260517_cardio_import.sql
-- #############################################################################

-- Migration: 20260517_cardio_import.sql
-- PL-2: CSV Import — adds cardio import columns to workouts table

ALTER TABLE workouts ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS distance_m INTEGER;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS avg_pace_sec_per_km INTEGER;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS source TEXT;

-- Extend session_type CHECK to include 'cardio_import'
-- CONSOLIDATION-ORDER FIX (2026-06-01): in the original migration timeline
-- 20260517_rest_day_designation.sql (which creates session_type) ran BEFORE
-- this file. The consolidated bootstrap orders cardio_import first, so add the
-- column here idempotently to avoid "column session_type does not exist". The
-- later rest_day ADD COLUMN IF NOT EXISTS then no-ops (its inline 3-value CHECK
-- is skipped), leaving the 4-value constraint below as the final state.
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'workout';
-- Drop the existing constraint (if any) and recreate it with 'cardio_import'.
ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_session_type_check;
ALTER TABLE workouts ADD CONSTRAINT workouts_session_type_check
  CHECK (session_type IN ('workout', 'rest_day', 'emergency_override', 'cardio_import'));


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260517_notification_queue.sql
-- #############################################################################

-- migrations/20260517_notification_queue.sql
-- Server-side notification queue for FCM push dispatch.
-- TICKET-037 cron references this table; this migration creates it.
-- Worker (future): polls this table and sends via FCM HTTP v1 API.

CREATE TABLE IF NOT EXISTS notification_queue (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          TEXT NOT NULL,           -- 'streak_milestone' | 'plan_ready' | 'cohort_graduation'
    title         TEXT NOT NULL,
    body          TEXT NOT NULL,
    data          JSONB,
    sent_at       TIMESTAMPTZ,             -- NULL = pending
    error         TEXT,                    -- last dispatch error if any
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_user_pending
    ON notification_queue (user_id, created_at)
    WHERE sent_at IS NULL;

-- RLS: users can read their own notifications; server uses service role to insert
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_notifications"
    ON notification_queue FOR SELECT
    USING (auth.uid() = user_id);

COMMENT ON TABLE notification_queue IS 'Pending FCM push notifications. Dispatcher cron polls sent_at IS NULL rows.';


-- #############################################################################
-- # SOURCE: migrations/20260517_rest_day_designation.sql
-- #############################################################################

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


-- #############################################################################
-- # SOURCE: migrations/20260517_template_library.sql
-- #############################################################################

-- Migration: 20260517_template_library.sql
-- PL-1: Template Library — curated workout programs

CREATE TABLE IF NOT EXISTS workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  discipline TEXT NOT NULL CHECK (discipline IN ('powerlifting','weightlifting','general_strength','running','cycling','swimming','other_mixed')),
  experience_level TEXT NOT NULL CHECK (experience_level IN ('beginner','intermediate','advanced')),
  days_per_week INTEGER NOT NULL,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  session_name TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES template_sessions(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps TEXT NOT NULL,
  rest_seconds INTEGER,
  form_cue TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- RLS: templates are public read, no user write
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_templates" ON workout_templates FOR SELECT USING (true);
CREATE POLICY "public_read_sessions" ON template_sessions FOR SELECT USING (true);
CREATE POLICY "public_read_exercises" ON template_exercises FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- Seed data: 6 templates with hardcoded UUIDs
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  -- Template UUIDs
  t1 UUID := 'a1000000-0000-0000-0000-000000000001'; -- Beginner Full Body 3-Day
  t2 UUID := 'a2000000-0000-0000-0000-000000000002'; -- PPL 3-Day
  t3 UUID := 'a3000000-0000-0000-0000-000000000003'; -- PPL 6-Day
  t4 UUID := 'a4000000-0000-0000-0000-000000000004'; -- Upper/Lower 4-Day
  t5 UUID := 'a5000000-0000-0000-0000-000000000005'; -- Powerlifting Beginner
  t6 UUID := 'a6000000-0000-0000-0000-000000000006'; -- Running Beginner

  -- Session UUIDs — t1
  s1_1 UUID := 'b1010000-0000-0000-0000-000000000001'; -- T1 Day 1
  s1_2 UUID := 'b1020000-0000-0000-0000-000000000002'; -- T1 Day 2
  s1_3 UUID := 'b1030000-0000-0000-0000-000000000003'; -- T1 Day 3

  -- Session UUIDs — t2
  s2_1 UUID := 'b2010000-0000-0000-0000-000000000001'; -- T2 Push
  s2_2 UUID := 'b2020000-0000-0000-0000-000000000002'; -- T2 Pull
  s2_3 UUID := 'b2030000-0000-0000-0000-000000000003'; -- T2 Legs

  -- Session UUIDs — t3
  s3_1 UUID := 'b3010000-0000-0000-0000-000000000001'; -- T3 Push A
  s3_2 UUID := 'b3020000-0000-0000-0000-000000000002'; -- T3 Pull A
  s3_3 UUID := 'b3030000-0000-0000-0000-000000000003'; -- T3 Legs A
  s3_4 UUID := 'b3040000-0000-0000-0000-000000000004'; -- T3 Push B
  s3_5 UUID := 'b3050000-0000-0000-0000-000000000005'; -- T3 Pull B
  s3_6 UUID := 'b3060000-0000-0000-0000-000000000006'; -- T3 Legs B

  -- Session UUIDs — t4
  s4_1 UUID := 'b4010000-0000-0000-0000-000000000001'; -- T4 Upper A
  s4_2 UUID := 'b4020000-0000-0000-0000-000000000002'; -- T4 Lower A
  s4_3 UUID := 'b4030000-0000-0000-0000-000000000003'; -- T4 Upper B
  s4_4 UUID := 'b4040000-0000-0000-0000-000000000004'; -- T4 Lower B

  -- Session UUIDs — t5
  s5_1 UUID := 'b5010000-0000-0000-0000-000000000001'; -- T5 Workout A
  s5_2 UUID := 'b5020000-0000-0000-0000-000000000002'; -- T5 Workout B

  -- Session UUIDs — t6
  s6_1 UUID := 'b6010000-0000-0000-0000-000000000001'; -- T6 Day 1
  s6_2 UUID := 'b6020000-0000-0000-0000-000000000002'; -- T6 Day 2
  s6_3 UUID := 'b6030000-0000-0000-0000-000000000003'; -- T6 Day 3

BEGIN

-- -----------------------------------------------------------------------
-- TEMPLATES
-- -----------------------------------------------------------------------
INSERT INTO workout_templates (id, name, description, discipline, experience_level, days_per_week, is_featured)
VALUES
  (t1, 'Beginner Full Body 3-Day',
   'Classic three-day full-body program hitting squat, press, and pull every session. Ideal for building the movement patterns and strength base.',
   'general_strength', 'beginner', 3, TRUE),

  (t2, 'Push/Pull/Legs 3-Day',
   'One push session, one pull session, one leg session per week. Each session is focused and efficient — great for intermediate lifters on a tighter schedule.',
   'general_strength', 'intermediate', 3, FALSE),

  (t3, 'Push/Pull/Legs 6-Day',
   'Full PPL split run twice per week. Higher volume than the 3-day variant; suited for intermediate lifters who can recover from 6 sessions.',
   'general_strength', 'intermediate', 6, TRUE),

  (t4, 'Upper/Lower 4-Day',
   'Four-day upper/lower split with two upper and two lower sessions per week, varying rep ranges for strength and hypertrophy stimulus.',
   'general_strength', 'intermediate', 4, FALSE),

  (t5, 'Powerlifting Beginner (SL5×5-style)',
   'Two alternating workouts (A and B) run three times per week. Linear progression on squat, bench, overhead press, barbell row, and deadlift.',
   'powerlifting', 'beginner', 3, TRUE),

  (t6, 'Running Beginner Plan',
   'Three-day run/walk plan for new runners. Builds aerobic base with easy runs and walk/run intervals before progressing to a longer easy run.',
   'running', 'beginner', 3, FALSE)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------
-- SESSIONS
-- -----------------------------------------------------------------------
INSERT INTO template_sessions (id, template_id, day_number, session_name, notes) VALUES
  -- T1
  (s1_1, t1, 1, 'Full Body A', 'Mon — squat, bench, deadlift, lat pulldown'),
  (s1_2, t1, 2, 'Full Body B', 'Wed — squat, overhead press, barbell row, curl'),
  (s1_3, t1, 3, 'Full Body A (repeat)', 'Fri — repeat Day 1 workout'),

  -- T2
  (s2_1, t2, 1, 'Push', 'Chest, shoulders, triceps'),
  (s2_2, t2, 2, 'Pull', 'Back, biceps, rear delts'),
  (s2_3, t2, 3, 'Legs', 'Quads, hamstrings, calves'),

  -- T3
  (s3_1, t3, 1, 'Push A', 'Heavy push — bench focus'),
  (s3_2, t3, 2, 'Pull A', 'Heavy pull — deadlift focus'),
  (s3_3, t3, 3, 'Legs A', 'Heavy legs — squat focus'),
  (s3_4, t3, 4, 'Push B', 'Volume push — slightly higher reps'),
  (s3_5, t3, 5, 'Pull B', 'Volume pull — slightly higher reps'),
  (s3_6, t3, 6, 'Legs B', 'Volume legs — slightly higher reps'),

  -- T4
  (s4_1, t4, 1, 'Upper A', 'Strength-focused upper — heavy bench and row'),
  (s4_2, t4, 2, 'Lower A', 'Strength-focused lower — heavy squat'),
  (s4_3, t4, 3, 'Upper B', 'Hypertrophy-focused upper — incline and cables'),
  (s4_4, t4, 4, 'Lower B', 'Hypertrophy-focused lower — deadlift + accessories'),

  -- T5
  (s5_1, t5, 1, 'Workout A', 'Squat, Bench, Barbell Row — alternate with Workout B each session'),
  (s5_2, t5, 2, 'Workout B', 'Squat, Overhead Press, Deadlift — alternate with Workout A each session'),

  -- T6
  (s6_1, t6, 1, 'Easy Run', 'Conversational effort, build aerobic base'),
  (s6_2, t6, 2, 'Walk/Run Intervals', 'Structured intervals — build run tolerance'),
  (s6_3, t6, 3, 'Long Run', 'Longest run of the week at easy effort')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------
-- EXERCISES
-- -----------------------------------------------------------------------
INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, form_cue, order_index) VALUES

  -- T1 Day 1 (Full Body A)
  (s1_1, 'Barbell Back Squat', 3, '5', 180, 'Brace core, sit to depth, drive knees out', 0),
  (s1_1, 'Barbell Bench Press', 3, '5', 180, 'Retract shoulder blades, touch chest, press in a slight arc', 1),
  (s1_1, 'Barbell Deadlift', 1, '5', 240, 'Hinge at hips, bar over mid-foot, neutral spine throughout', 2),
  (s1_1, 'Lat Pulldown', 3, '8', 90, 'Pull elbows to pockets, keep chest tall', 3),

  -- T1 Day 2 (Full Body B)
  (s1_2, 'Barbell Back Squat', 3, '5', 180, 'Brace core, sit to depth, drive knees out', 0),
  (s1_2, 'Overhead Press', 3, '5', 180, 'Stack bar over heels, lock out overhead, squeeze glutes', 1),
  (s1_2, 'Barbell Row', 3, '5', 120, 'Hinge to ~45°, pull bar to lower chest, controlled lower', 2),
  (s1_2, 'Dumbbell Curl', 3, '10', 60, 'Supinate at the top, avoid swinging', 3),

  -- T1 Day 3 (Full Body A repeat)
  (s1_3, 'Barbell Back Squat', 3, '5', 180, 'Brace core, sit to depth, drive knees out', 0),
  (s1_3, 'Barbell Bench Press', 3, '5', 180, 'Retract shoulder blades, touch chest, press in a slight arc', 1),
  (s1_3, 'Barbell Deadlift', 1, '5', 240, 'Hinge at hips, bar over mid-foot, neutral spine throughout', 2),
  (s1_3, 'Lat Pulldown', 3, '8', 90, 'Pull elbows to pockets, keep chest tall', 3),

  -- T2 Push
  (s2_1, 'Barbell Bench Press', 4, '6', 180, 'Control the descent, explode up', 0),
  (s2_1, 'Overhead Press', 3, '8', 120, 'Full lockout, tight core, no back arch', 1),
  (s2_1, 'Tricep Pushdown', 3, '12', 60, 'Elbows pinned at sides, full extension', 2),
  (s2_1, 'Lateral Raise', 3, '15', 45, 'Lead with elbows, stop at shoulder height', 3),

  -- T2 Pull
  (s2_2, 'Barbell Deadlift', 3, '5', 240, 'Bar over mid-foot, lat engagement before pull', 0),
  (s2_2, 'Barbell Row', 4, '6', 120, 'Pull bar into lower chest, squeeze at top', 1),
  (s2_2, 'Pull-up', 3, 'AMRAP', 90, 'Full hang to chin over bar, controlled negative', 2),
  (s2_2, 'Face Pull', 3, '15', 45, 'Pull to forehead, external rotate at end range', 3),

  -- T2 Legs
  (s2_3, 'Barbell Back Squat', 4, '6', 180, 'Knees track toes, full depth if mobility allows', 0),
  (s2_3, 'Romanian Deadlift', 3, '10', 90, 'Soft knee, push hips back, feel hamstring stretch', 1),
  (s2_3, 'Leg Press', 3, '12', 90, 'Full range, feet hip-width, do not lock out aggressively', 2),
  (s2_3, 'Calf Raise', 3, '15', 45, 'Full stretch at bottom, hold squeeze at top', 3),

  -- T3 Push A (heavy)
  (s3_1, 'Barbell Bench Press', 4, '6', 180, 'Retract shoulder blades, controlled descent', 0),
  (s3_1, 'Overhead Press', 3, '8', 120, 'Full lockout, bar path slightly back at top', 1),
  (s3_1, 'Tricep Pushdown', 3, '12', 60, 'Elbows pinned, squeeze at bottom', 2),
  (s3_1, 'Lateral Raise', 3, '15', 45, 'Lead with elbows, stop at shoulder height', 3),

  -- T3 Pull A (heavy)
  (s3_2, 'Barbell Deadlift', 3, '5', 240, 'Bar over mid-foot, neutral spine', 0),
  (s3_2, 'Barbell Row', 4, '6', 120, 'Hinge, pull to lower chest', 1),
  (s3_2, 'Pull-up', 3, 'AMRAP', 90, 'Full range, control the negative', 2),
  (s3_2, 'Face Pull', 3, '15', 45, 'External rotate, pull to forehead', 3),

  -- T3 Legs A (heavy)
  (s3_3, 'Barbell Back Squat', 4, '6', 180, 'Depth, knees out, braced', 0),
  (s3_3, 'Romanian Deadlift', 3, '10', 90, 'Hinge, feel stretch, no rounding', 1),
  (s3_3, 'Leg Press', 3, '12', 90, 'Full ROM, feet hip-width', 2),
  (s3_3, 'Calf Raise', 3, '15', 45, 'Full stretch and squeeze', 3),

  -- T3 Push B (volume)
  (s3_4, 'Incline Dumbbell Press', 4, '10', 90, 'Slight incline, touch chest, press up and in', 0),
  (s3_4, 'Dumbbell Shoulder Press', 3, '12', 75, 'Full range, core tight, no flare', 1),
  (s3_4, 'Cable Tricep Extension', 3, '15', 45, 'Elbows fixed, full extension', 2),
  (s3_4, 'Lateral Raise', 3, '20', 30, 'Light weight, feel the burn at shoulder height', 3),

  -- T3 Pull B (volume)
  (s3_5, 'Lat Pulldown', 4, '10', 90, 'Pull elbows to pockets, arch slightly', 0),
  (s3_5, 'Cable Row', 4, '12', 75, 'Neutral spine, pull to navel, squeeze', 1),
  (s3_5, 'Dumbbell Curl', 3, '15', 45, 'Supinate, no swing', 2),
  (s3_5, 'Face Pull', 3, '20', 30, 'High anchor, external rotate', 3),

  -- T3 Legs B (volume)
  (s3_6, 'Hack Squat', 4, '10', 90, 'Feet shoulder-width, full depth', 0),
  (s3_6, 'Walking Lunge', 3, '12', 75, 'Long stride, upright torso', 1),
  (s3_6, 'Leg Curl', 3, '15', 60, 'Controlled, squeeze at top', 2),
  (s3_6, 'Calf Raise', 4, '20', 30, 'Full stretch, big squeeze', 3),

  -- T4 Upper A (strength)
  (s4_1, 'Barbell Bench Press', 4, '5', 180, 'Heavy, retract scapula, controlled descent', 0),
  (s4_1, 'Barbell Row', 4, '5', 180, 'Hinge, pull to lower chest, stay tight', 1),
  (s4_1, 'Overhead Press', 3, '8', 120, 'Full lockout, bar over heels', 2),
  (s4_1, 'Chin-up', 3, 'AMRAP', 90, 'Supinated grip, chin over bar, full hang', 3),

  -- T4 Lower A (strength)
  (s4_2, 'Barbell Back Squat', 4, '5', 180, 'Depth, brace, drive through floor', 0),
  (s4_2, 'Romanian Deadlift', 3, '8', 120, 'Hip hinge, hamstring stretch, neutral back', 1),
  (s4_2, 'Leg Press', 3, '10', 90, 'Full ROM, feet hip-width', 2),
  (s4_2, 'Leg Curl', 3, '12', 60, 'Controlled, full range', 3),

  -- T4 Upper B (hypertrophy)
  (s4_3, 'Incline Dumbbell Press', 4, '8', 90, 'Touch chest, press up and in, control descent', 0),
  (s4_3, 'Cable Row', 4, '10', 75, 'Neutral spine, squeeze at end', 1),
  (s4_3, 'Dumbbell Shoulder Press', 3, '12', 75, 'Full range, no flare', 2),
  (s4_3, 'Lat Pulldown', 3, '12', 75, 'Wide grip, pull to upper chest', 3),

  -- T4 Lower B (hypertrophy)
  (s4_4, 'Barbell Deadlift', 4, '4', 240, 'Bar over mid-foot, lats engaged before pull', 0),
  (s4_4, 'Front Squat', 3, '6', 180, 'Upright torso, elbows up, full depth', 1),
  (s4_4, 'Leg Extension', 3, '15', 60, 'Full extension, controlled return', 2),
  (s4_4, 'Calf Raise', 4, '15', 45, 'Full stretch, pause at bottom', 3),

  -- T5 Workout A
  (s5_1, 'Barbell Back Squat', 5, '5', 180, 'Add 2.5 kg each session while form holds', 0),
  (s5_1, 'Barbell Bench Press', 5, '5', 180, 'Controlled descent, drive up, retract scapula', 1),
  (s5_1, 'Barbell Row', 5, '5', 120, 'Strict form — pull to lower chest, no jerking', 2),

  -- T5 Workout B
  (s5_2, 'Barbell Back Squat', 5, '5', 180, 'Same weight as last squat session, add 2.5 kg each time', 0),
  (s5_2, 'Overhead Press', 5, '5', 180, 'Full lockout, squeeze glutes, no back arch', 1),
  (s5_2, 'Barbell Deadlift', 1, '5', 300, 'Add 5 kg each session — the fastest lift to progress', 2),

  -- T6 Day 1 (Easy Run)
  (s6_1, 'Easy Run', 1, '20 min', NULL, 'Land midfoot, keep cadence ~170 spm, conversational pace', 0),

  -- T6 Day 2 (Intervals)
  (s6_2, 'Walk/Run Intervals', 8, '1 min run / 2 min walk', NULL, 'Run at a comfortable effort — you should be able to speak short sentences', 0),

  -- T6 Day 3 (Long Run)
  (s6_3, 'Easy Run', 1, '30 min', NULL, 'Easy effort throughout — slower than you think, nasal breathing helps', 0);

END $$;


-- #############################################################################
-- # SOURCE: migrations/20260517_wilks_score.sql
-- #############################################################################

-- migrations/20260517_wilks_score.sql
-- OD-2: Implements Wilks2 (2020 revision) strength coefficient.
-- Wilks2 reference: Wilks RR (2020). Journal of Strength and Conditioning Research.
-- Allows comparison of powerlifting totals across bodyweight classes.
-- Called by routes/percentile.js inline in SELECT; no stored column needed.

CREATE OR REPLACE FUNCTION compute_wilks_score(
    p_sex    TEXT,               -- 'MALE', 'FEMALE', or 'UNDISCLOSED'
    p_bw_kg  DOUBLE PRECISION,   -- bodyweight in kg (clamped 40–200 kg internally)
    p_lift_kg DOUBLE PRECISION   -- lift weight in kg (e.g. best 1RM)
) RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    bw DOUBLE PRECISION := GREATEST(40.0, LEAST(200.0, COALESCE(p_bw_kg, 80.0)));
    -- Wilks2 male coefficients
    MA CONSTANT DOUBLE PRECISION :=  47.46178854;
    MB CONSTANT DOUBLE PRECISION :=   8.472061379;
    MC CONSTANT DOUBLE PRECISION :=   0.07369410346;
    MD CONSTANT DOUBLE PRECISION :=  -0.001395833811;
    ME CONSTANT DOUBLE PRECISION :=   7.07665973070743e-6;
    MF CONSTANT DOUBLE PRECISION :=  -1.20804336482315e-8;
    -- Wilks2 female coefficients
    FA CONSTANT DOUBLE PRECISION := -125.4255398;
    FB CONSTANT DOUBLE PRECISION :=  13.71219419;
    FC CONSTANT DOUBLE PRECISION :=  -0.03307250631;
    FD CONSTANT DOUBLE PRECISION :=  -0.001050400051;
    FE CONSTANT DOUBLE PRECISION :=   9.38773881462799e-6;
    FF CONSTANT DOUBLE PRECISION :=  -2.3334613884954e-8;
    male_denom   DOUBLE PRECISION;
    female_denom DOUBLE PRECISION;
    male_score   DOUBLE PRECISION;
    female_score DOUBLE PRECISION;
BEGIN
    IF p_lift_kg IS NULL OR p_lift_kg <= 0 THEN RETURN NULL; END IF;

    male_denom   := MA + MB*bw + MC*bw^2 + MD*bw^3 + ME*bw^4 + MF*bw^5;
    female_denom := FA + FB*bw + FC*bw^2 + FD*bw^3 + FE*bw^4 + FF*bw^5;

    IF male_denom <= 0 OR female_denom <= 0 THEN RETURN NULL; END IF;

    male_score   := p_lift_kg * 600.0 / male_denom;
    female_score := p_lift_kg * 600.0 / female_denom;

    RETURN CASE p_sex
        WHEN 'MALE'        THEN ROUND(male_score::NUMERIC,   2)::DOUBLE PRECISION
        WHEN 'FEMALE'      THEN ROUND(female_score::NUMERIC, 2)::DOUBLE PRECISION
        WHEN 'UNDISCLOSED' THEN ROUND(((male_score + female_score) / 2.0)::NUMERIC, 2)::DOUBLE PRECISION
        ELSE NULL
    END;
END;
$$;

COMMENT ON FUNCTION compute_wilks_score(TEXT, DOUBLE PRECISION, DOUBLE PRECISION)
    IS 'Wilks2 (2020). Returns score rounded to 2 dp. bw_kg clamped 40–200. Returns NULL for unknown sex or zero/null lift.';


-- #############################################################################
-- # SOURCE: migrations/20260518_fcm_token.sql
-- #############################################################################

-- migrations/20260518_fcm_token.sql
-- Adds fcm_token to users for FCM push dispatch (TICKET-024 mobile registers tokens).
-- push-dispatcher.js cron reads this column to look up device tokens.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS fcm_token TEXT;

COMMENT ON COLUMN users.fcm_token
    IS 'FCM device registration token. Written by mobile after push permission granted '
       '(PATCH /user/profile {fcm_token}). Cleared by push-dispatcher on NotRegistered error. '
       'NULL = user has not granted push permission or token is stale.';

-- Index for the dispatcher JOIN: users WHERE fcm_token IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_users_fcm_token_not_null
    ON users (id)
    WHERE fcm_token IS NOT NULL AND fcm_token <> '';


-- #############################################################################
-- # SOURCE: migrations/20260518_notification_prefs.sql
-- #############################################################################

-- migrations/20260518_notification_prefs.sql
-- Adds per-user notification preference flags.
-- streak_notifications_enabled: opt-out of streak milestone pushes (default ON).
-- plan_notifications_enabled: opt-out of plan-ready pushes (default ON).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS streak_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS plan_notifications_enabled   BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN users.streak_notifications_enabled
    IS 'When FALSE, push-dispatcher skips streak_milestone notifications for this user.';
COMMENT ON COLUMN users.plan_notifications_enabled
    IS 'When FALSE, push-dispatcher skips plan_ready notifications for this user.';


-- #############################################################################
-- # SOURCE: migrations/20260519_paywall_trigger.sql
-- #############################################################################

-- Phase 1.5: session-count paywall trigger
-- Adds a timestamp column to track when a user first hits the free-tier session limit.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS paywall_triggered_at TIMESTAMPTZ;

COMMENT ON COLUMN users.paywall_triggered_at IS
  'Timestamp when the free-tier session limit (5 sessions) was first reached. '
  'NULL = user has not yet hit the limit. Set once, never cleared. '
  'Frontend gates upgrade prompt on this value being non-null.';


-- #############################################################################
-- # SOURCE: migrations/20260519_workouts_activity_type.sql
-- #############################################################################

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


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260524_notification_queue_retry_cap.sql
-- #############################################################################

-- Migration: 20260524_notification_queue_retry_cap
-- NEW-003 fix: add retry_count and failed_permanently columns to notification_queue.
--
-- Without these columns the push-dispatcher retries failed notifications every
-- 5 minutes indefinitely. A corrupt payload, MessageTooBig, or misclassified
-- transient error creates an infinite retry loop that wastes DB connections
-- and Expo API quota at scale.
--
-- After this migration the dispatcher:
--   • Skips rows where failed_permanently = TRUE
--   • Increments retry_count on each failed attempt
--   • Sets failed_permanently = TRUE after MAX_RETRIES (5) attempts
--   • Sets failed_permanently = TRUE immediately on DeviceNotRegistered

ALTER TABLE notification_queue
    ADD COLUMN IF NOT EXISTS retry_count        INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS failed_permanently BOOLEAN     NOT NULL DEFAULT FALSE;

-- Index so the dispatcher's WHERE NOT failed_permanently filter is fast
CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
    ON notification_queue (created_at ASC)
    WHERE sent_at IS NULL AND failed_permanently = FALSE;

COMMENT ON COLUMN notification_queue.retry_count IS
    'Number of delivery attempts made (incremented on each failure).';

COMMENT ON COLUMN notification_queue.failed_permanently IS
    'TRUE when the notification should no longer be retried (DeviceNotRegistered, '
    'or retry_count exceeded MAX_RETRIES). Dispatcher skips these rows.';


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260526_routines_table.sql
-- #############################################################################

-- TICKET-055/056: User-saved workout routines
-- Routines are simple, repeatable single-session workouts distinct from:
--   • workout_templates (global curated multi-day programs)
--   • plans (AI-generated multi-week blocks)
-- A routine is just an ordered list of exercises with per-exercise targets.

CREATE TABLE IF NOT EXISTS routines (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    -- exercises: [{exercise_id, name, target_sets, target_reps}]
    exercises    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);

-- RLS (Supabase)
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY routines_user_policy ON routines
    FOR ALL USING (auth.uid() = user_id);


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260529_show_wilks.sql
-- #############################################################################

-- TICKET-066: per-user preference to show Wilks score in rankings
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_wilks BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN users.show_wilks IS 'User opted in to seeing their Wilks2 score in the rankings tab.';


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260530_template_library.sql
-- #############################################################################

-- 20260530_template_library.sql
-- FIX (IOS-RELEASE / TEMPLATES-500, 2026-05-30):
-- GET /templates and GET /templates/:id (routes/templates.js) query
-- workout_templates / template_sessions / template_exercises, but NO migration
-- ever created those tables. The route comment cited
-- "migrations/20260517_template_library.sql" — that file was never written or
-- committed (confirmed: not in git history). In the deployed DB the SELECT hit a
-- non-existent relation, Postgres errored, and the whole /templates tab returned
-- 500 ("Could not load templates" on the Templates screen and on the Log tab's
-- "Starter Splits"). This migration creates the missing schema.
--
-- Column set matches routes/templates.js exactly:
--   workout_templates : id, name, description, discipline, experience_level,
--                       days_per_week, is_featured, created_at
--   template_sessions : id, template_id, day_number, session_name, notes
--   template_exercises: id, session_id, exercise_name, sets, reps,
--                       rest_seconds, form_cue, order_index
-- and the frontend WorkoutTemplate type (mobile/src/api/templates.ts) — note
-- reps is TEXT ("8-12"), experience_level is one of beginner|intermediate|advanced|elite.
--
-- Migrations here are applied MANUALLY (no runner in package.json): run this file
-- against the Railway production Postgres to clear the 500.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workout_templates (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    description      TEXT        NOT NULL DEFAULT '',
    discipline       TEXT        NOT NULL,
    experience_level TEXT        NOT NULL
                     CHECK (experience_level IN ('beginner','intermediate','advanced','elite')),
    days_per_week    INT         NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
    is_featured      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_sessions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id   UUID        NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
    day_number    INT         NOT NULL,
    session_name  TEXT        NOT NULL,
    notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_template_sessions_template ON template_sessions(template_id);

CREATE TABLE IF NOT EXISTS template_exercises (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID        NOT NULL REFERENCES template_sessions(id) ON DELETE CASCADE,
    exercise_name TEXT        NOT NULL,
    sets          INT         NOT NULL CHECK (sets BETWEEN 1 AND 20),
    reps          TEXT        NOT NULL,            -- TEXT on purpose: "5", "8-12", "AMRAP"
    rest_seconds  INT,
    form_cue      TEXT,
    order_index   INT         NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_template_exercises_session ON template_exercises(session_id);

-- ---------------------------------------------------------------------------
-- Seed — PLACEHOLDER starter content (FOUNDER: review / expand / replace).
-- Generic, non-proprietary strength splits so the feature works out of the box.
-- Guarded by NOT EXISTS so re-running is safe and won't duplicate.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    fb_id    UUID;
    ul_id    UUID;
    s_id     UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM workout_templates) THEN

        -- 1) Full Body 3-Day (beginner, featured) --------------------------------
        INSERT INTO workout_templates (name, description, discipline, experience_level, days_per_week, is_featured)
        VALUES ('Full Body 3-Day',
                'A simple full-body routine three days a week. Great first program for building the main lifts.',
                'weightlifting', 'beginner', 3, TRUE)
        RETURNING id INTO fb_id;

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (fb_id, 1, 'Day A', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Back Squat',     3, '5',    180, 0),
            (s_id, 'Bench Press',    3, '5',    180, 1),
            (s_id, 'Barbell Row',    3, '8-10', 120, 2),
            (s_id, 'Plank',          3, '30-60s', 60, 3);

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (fb_id, 2, 'Day B', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Deadlift',          3, '5',    180, 0),
            (s_id, 'Overhead Press',    3, '5',    180, 1),
            (s_id, 'Lat Pulldown',      3, '8-12', 120, 2),
            (s_id, 'Hanging Knee Raise', 3, '10-15', 60, 3);

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (fb_id, 3, 'Day C', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Front Squat',     3, '6-8',  150, 0),
            (s_id, 'Incline Bench Press', 3, '6-8', 150, 1),
            (s_id, 'Seated Cable Row', 3, '10-12', 120, 2),
            (s_id, 'Back Extension',  3, '12-15', 60, 3);

        -- 2) Upper / Lower 4-Day (intermediate, featured) ------------------------
        INSERT INTO workout_templates (name, description, discipline, experience_level, days_per_week, is_featured)
        VALUES ('Upper / Lower 4-Day',
                'Four-day upper/lower split balancing strength and hypertrophy across the week.',
                'weightlifting', 'intermediate', 4, TRUE)
        RETURNING id INTO ul_id;

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (ul_id, 1, 'Upper A', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Bench Press',     4, '5-6',  180, 0),
            (s_id, 'Barbell Row',     4, '6-8',  150, 1),
            (s_id, 'Overhead Press',  3, '8-10', 120, 2),
            (s_id, 'Pull-Up',         3, 'AMRAP', 120, 3);

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (ul_id, 2, 'Lower A', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Back Squat',      4, '5-6',  180, 0),
            (s_id, 'Romanian Deadlift', 3, '8-10', 150, 1),
            (s_id, 'Leg Press',       3, '10-12', 120, 2),
            (s_id, 'Standing Calf Raise', 4, '12-15', 60, 3);

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (ul_id, 3, 'Upper B', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Incline Dumbbell Press', 4, '8-10', 120, 0),
            (s_id, 'Lat Pulldown',    4, '10-12', 120, 1),
            (s_id, 'Lateral Raise',   3, '12-15', 60, 2),
            (s_id, 'Face Pull',       3, '15-20', 60, 3);

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (ul_id, 4, 'Lower B', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Deadlift',        3, '5',    180, 0),
            (s_id, 'Front Squat',     3, '8-10', 150, 1),
            (s_id, 'Walking Lunge',   3, '10-12', 90, 2),
            (s_id, 'Hanging Leg Raise', 3, '10-15', 60, 3);

    END IF;
END $$;


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260530_workouts_session_type.sql
-- #############################################################################

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


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260531_exercises_alt_fields.sql
-- #############################################################################

-- 20260531_exercises_alt_fields.sql
-- Foundation for the Pro "alternative exercise" feature (machine-busy swap).
--
-- muscle_heads: granular muscle targets (e.g. 'lower_chest', 'front_delt',
--   'side_delt') — finer than the existing coarse muscle_groups ('chest',
--   'shoulders'). Enables accurate same-muscle alternative matching. The
--   frontend taxonomy already exists in mobile/src/constants/muscles.ts; this is
--   the server-side column it was always meant to populate.
-- equipment: 'barbell'|'dumbbell'|'cable'|'machine'|'bodyweight'|'other' — lets
--   the swap prefer a free-weight alternative when a machine is occupied.
--
-- Both NULLable and additive: existing rows + all current queries are unaffected,
-- and the /alternatives endpoint will simply return nothing until rows are tagged
-- (accurate tagging is a deliberate data pass, not auto-derived — see plan).
-- Idempotent. Apply in the Supabase SQL Editor.

ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS muscle_heads TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS equipment    TEXT;


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260531_users_comp_pro.sql
-- #############################################################################

-- 20260531_users_comp_pro.sql
-- Permanent manual/promo Pro grants (comp accounts for promoters, friends, etc.).
--
-- `tier` ('free'|'paid') stays the EFFECTIVE entitlement that requirePaid checks.
-- `comp_pro` records WHY someone is paid: TRUE = manually comped (no billing),
-- permanent until explicitly revoked. This keeps comps safe once real billing
-- (RevenueCat + Apple IAP) is added later:
--
--   * Comping a user:   UPDATE users SET tier='paid', comp_pro=TRUE  WHERE ...
--   * Revoking a comp:  UPDATE users SET tier='free', comp_pro=FALSE WHERE ...
--   * FUTURE RevenueCat webhook MUST honor comps — never downgrade a comp:
--       UPDATE users SET tier = CASE
--           WHEN comp_pro THEN 'paid'
--           WHEN <has_active_subscription> THEN 'paid'
--           ELSE 'free' END
--     and must never charge a comped account.
--
-- Idempotent. Apply in the Supabase SQL Editor.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS comp_pro BOOLEAN NOT NULL DEFAULT FALSE;


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260531_users_paywall_triggered_at.sql
-- #############################################################################

-- 20260531_users_paywall_triggered_at.sql
-- GAP found via full prod-schema audit (2026-05-31):
-- routes/workouts.js (POST /workouts paywall block) does
--   SELECT paywall_triggered_at FROM users ...
--   UPDATE users SET paywall_triggered_at = NOW() ...
-- but the users table has no paywall_triggered_at column. The block is a
-- fire-and-forget IIFE with its own try/catch (logs "[paywall-trigger] error
-- (non-fatal)"), so it does NOT 500 the request -- but the session-count paywall
-- trigger is silently broken (never persists, never enqueues the upgrade push).
--
-- Nullable timestamp: NULL = never triggered; set once to NOW(), never cleared.
-- Idempotent. Apply in the Supabase SQL Editor.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS paywall_triggered_at TIMESTAMPTZ;


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260531_workouts_cardio_columns.sql
-- #############################################################################

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


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260531_workouts_unique_day.sql
-- #############################################################################

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



-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260604_workout_routine_link.sql
-- # (folded 2026-06-10 — standing rule: every schema change edits this file
-- #  in the same commit; migrations/ files are incremental convenience copies.)
-- #############################################################################

-- 20260604 — Link a workout to the routine it was performed from.
--
-- Recent Activity needs to label a session "Leg Day 6/4/26" when it came from a
-- routine, and fall back to a plain date for free (ad-hoc) sessions. Workouts are
-- stored one-per-(user, day_key) and previously had no routine reference.
--
-- We store BOTH:
--   routine_id   — FK to the routine (nullable; ON DELETE SET NULL so deleting a
--                  routine does not delete history, it just drops the link).
--   routine_name — denormalised snapshot of the routine name at session time, so
--                  the historical label survives a later rename or delete of the
--                  routine. routine_name is what the UI renders.
--
-- Both are NULL for ad-hoc / free sessions, which keep their date-only label.
--
-- Idempotent: safe to re-run.

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS routine_id   UUID REFERENCES routines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routine_name TEXT;



-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260607_expand_exercise_library.sql
-- # (folded 2026-06-10)
-- #############################################################################

-- 20260607 — Expand the exercise library (TICKET-098).
--
-- (a) Adds the one bundled-template exercise that had no exact library row
--     ("Close-Grip Lat Pulldown") so the beginner templates resolve 1:1 instead
--     of falling back to "Lat Pulldown".
-- (b) Deeper pass: common machine/cable/dumbbell/bodyweight variants that were
--     missing from the seed, across every muscle group + a couple of cardio.
--
-- Idempotent: ON CONFLICT (name) DO NOTHING relies on idx_exercises_name_unique.
-- Safe to re-run; only inserts names that don't already exist.

INSERT INTO exercises (name, category, muscle_groups, is_compound) VALUES
  -- Back / lats
  ('Close-Grip Lat Pulldown',      'lift', ARRAY['lats','biceps','back'],            TRUE),
  ('Reverse-Grip Lat Pulldown',    'lift', ARRAY['lats','biceps','back'],            TRUE),
  ('Neutral-Grip Lat Pulldown',    'lift', ARRAY['lats','biceps','back'],            TRUE),
  ('Seal Row',                     'lift', ARRAY['back','lats','biceps'],            TRUE),
  ('Meadows Row',                  'lift', ARRAY['back','lats','biceps'],            TRUE),
  ('Landmine Row',                 'lift', ARRAY['back','lats','biceps'],            TRUE),
  ('Assisted Pull-Up',             'lift', ARRAY['lats','back','biceps'],            TRUE),
  -- Chest
  ('Smith Machine Bench Press',    'lift', ARRAY['chest','triceps','anterior_deltoid'], TRUE),
  ('Dumbbell Pullover',            'lift', ARRAY['chest','lats'],                    FALSE),
  ('Incline Cable Fly',            'lift', ARRAY['chest','anterior_deltoid'],        FALSE),
  -- Shoulders
  ('Smith Machine Shoulder Press', 'lift', ARRAY['anterior_deltoid','triceps'],      TRUE),
  ('Cable Front Raise',            'lift', ARRAY['anterior_deltoid'],                FALSE),
  ('Cuban Press',                  'lift', ARRAY['shoulders','rotator_cuff'],        FALSE),
  -- Legs / glutes
  ('Smith Machine Squat',          'lift', ARRAY['quads','glutes','hamstrings'],     TRUE),
  ('Sissy Squat',                  'lift', ARRAY['quads'],                           FALSE),
  ('Pendulum Squat',               'lift', ARRAY['quads','glutes'],                  TRUE),
  ('Hip Abduction Machine',        'lift', ARRAY['glutes','abductors'],              FALSE),
  ('Hip Adduction Machine',        'lift', ARRAY['adductors'],                       FALSE),
  ('Cable Kickback',               'lift', ARRAY['glutes'],                          FALSE),
  ('Reverse Hyperextension',       'lift', ARRAY['glutes','hamstrings','lower_back'], FALSE),
  ('Dumbbell Lunge',               'lift', ARRAY['quads','glutes','hamstrings'],     TRUE),
  ('Goblet Lunge',                 'lift', ARRAY['quads','glutes'],                  TRUE),
  -- Arms
  ('Cable Rope Hammer Curl',       'lift', ARRAY['biceps','forearms'],              FALSE),
  ('Preacher Curl Machine',        'lift', ARRAY['biceps'],                          FALSE),
  ('Cable Reverse Curl',           'lift', ARRAY['forearms','biceps'],              FALSE),
  ('Tricep Dip Machine',           'lift', ARRAY['triceps','chest'],                FALSE),
  -- Core
  ('Bicycle Crunch',               'lift', ARRAY['core','obliques'],                FALSE),
  ('Decline Crunch',               'lift', ARRAY['core'],                            FALSE),
  ('Cable Woodchopper',            'lift', ARRAY['core','obliques'],                FALSE),
  ('Mountain Climbers',            'lift', ARRAY['core','hip_flexors'],             FALSE),
  ('Suitcase Carry',               'lift', ARRAY['core','obliques','forearms'],     TRUE),
  ('Hanging Knee Raise',           'lift', ARRAY['core','hip_flexors'],             FALSE),
  -- Cardio / conditioning
  ('Battle Ropes',                 'cardio', ARRAY['shoulders','core'],             FALSE),
  ('Ski Erg',                      'cardio', ARRAY['lats','triceps','core'],        FALSE)
ON CONFLICT (name) DO NOTHING;



-- #############################################################################
-- # Security hardening: SECURITY INVOKER on advisor-flagged views
-- # (Supabase Advisor: "Security Definer View" — CRITICAL)
-- #
-- # These views default to SECURITY DEFINER, which ignores the querying user's
-- # RLS and runs as the view owner. user_credit_balance in particular exposes
-- # every user's wallet balance, so a client/PostgREST query could read another
-- # user's data. SECURITY INVOKER makes each view respect the caller's RLS.
-- # The Express server queries via the elevated postgres/service role (which
-- # bypasses RLS regardless), so this is safe and changes no server behaviour.
-- # Appended at end-of-file so it applies to the FINAL definition of each view
-- # (several are re-defined earlier via CREATE OR REPLACE).
-- # Requires Postgres 15+ (Supabase is 15+).
-- #############################################################################

ALTER VIEW public.user_credit_balance        SET (security_invoker = true);
ALTER VIEW public.group_active_member_count  SET (security_invoker = true);
ALTER VIEW public.v_user_lift_inputs         SET (security_invoker = true);
ALTER VIEW public.v_lift_vector_summary      SET (security_invoker = true);


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260611_engine_profile_fields.sql
-- # (folded 2026-06-12 — SPEC-094A Agent Q)
-- #############################################################################

-- 20260611 — Training Engine: user profile fields (TICKET-engine spec §2)
--
-- Adds the survey columns required by the Training Engine to the users table.
-- These fields are collected in the onboarding survey and the training-survey
-- screen (Agent C) and consumed by generatePlan() (Agent A) to select the
-- correct template, scale-down session count, and prescribe loading targets.
--
-- Idempotent: every clause uses ADD COLUMN IF NOT EXISTS, safe to re-run.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS training_goal TEXT
    CHECK (training_goal IN ('strength','hypertrophy','endurance','sport_performance','general_fitness')),
  ADD COLUMN IF NOT EXISTS sessions_per_week SMALLINT
    CHECK (sessions_per_week BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS session_minutes SMALLINT
    CHECK (session_minutes IN (15,30,45,60,90)),
  ADD COLUMN IF NOT EXISTS goal_weight_kg NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS equipment_profile TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS season_phase TEXT
    CHECK (season_phase IN ('off_season','in_season')),
  ADD COLUMN IF NOT EXISTS last_deload_at DATE;



-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260611_exercise_tagging.sql
-- # (folded 2026-06-12 — SPEC-094A Agent Q)
-- #############################################################################

-- 20260611 — Training Engine: exercise movement_pattern + equipment tagging (TICKET-engine spec §2)
--
-- (a) Adds movement_pattern TEXT and equipment TEXT[] columns to exercises.
-- (b) Tags every seeded exercise with a movement_pattern from the closed taxonomy:
--     squat, hinge, lunge, horizontal_push, vertical_push, horizontal_pull,
--     vertical_pull, isolation_arms, isolation_shoulders, isolation_chest,
--     isolation_back, isolation_legs, isolation_calves, core, carry,
--     olympic, plyometric, cardio
--     and equipment from the closed vocabulary:
--     barbell, dumbbell, kettlebell, machine, cable, bodyweight, bands,
--     bench, rack, pullup_bar, bike, treadmill, pool, track
--
-- Sources: db/schema.sql seed + migrations/20260611_expand_exercise_library.sql
-- Default for unrecognised exercises: movement_pattern = NULL, equipment = ARRAY['machine']
--
-- Idempotent: column adds use IF NOT EXISTS; UPDATE rows are guarded by
--   WHERE movement_pattern IS NULL so repeated runs never overwrite
--   manually-set values.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS movement_pattern TEXT,
  ADD COLUMN IF NOT EXISTS equipment        TEXT[];

-- ---------------------------------------------------------------------------
-- CHEST — horizontal_push family
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','bench','rack']
  WHERE name = 'Barbell Bench Press'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','bench','rack']
  WHERE name = 'Incline Barbell Bench Press'      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','bench','rack']
  WHERE name = 'Decline Barbell Bench Press'      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','bench','rack']
  WHERE name = 'Close-Grip Bench Press'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Dumbbell Bench Press'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Incline Dumbbell Press'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Decline Dumbbell Press'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Flat Dumbbell Fly'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Incline Dumbbell Fly'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['cable']
  WHERE name = 'Cable Crossover'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['cable']
  WHERE name = 'Cable Fly (Low to High)'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['cable']
  WHERE name = 'Cable Fly (High to Low)'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['machine']
  WHERE name = 'Pec Deck'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['machine']
  WHERE name = 'Machine Chest Press'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['bodyweight']
  WHERE name = 'Push-Up'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['bodyweight']
  WHERE name = 'Diamond Push-Up'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['bodyweight','rack']
  WHERE name = 'Dip (Chest-Focused)'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['bodyweight','rack']
  WHERE name = 'Weighted Dip'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','bench']
  WHERE name = 'Floor Press'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','rack']
  WHERE name = 'Landmine Press'                   AND movement_pattern IS NULL;
-- Smith Machine Bench Press
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['machine','bench']
  WHERE name = 'Smith Machine Bench Press'        AND movement_pattern IS NULL;
-- Dumbbell Pullover (lats+chest — treat as isolation_chest per primary muscle_groups)
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Dumbbell Pullover'                AND movement_pattern IS NULL;
-- Incline Cable Fly
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['cable','bench']
  WHERE name = 'Incline Cable Fly'                AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- BACK — horizontal_pull / vertical_pull / hinge / isolation_back
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Deadlift'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell']
  WHERE name = 'Sumo Deadlift'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell']
  WHERE name = 'Trap Bar Deadlift'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell']
  WHERE name = 'Stiff-Leg Deadlift'               AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Rack Pull'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Pull-Up'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Chin-Up'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Wide-Grip Pull-Up'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Weighted Pull-Up'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['machine','cable']
  WHERE name = 'Lat Pulldown'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['machine','cable']
  WHERE name = 'Wide-Grip Lat Pulldown'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['cable']
  WHERE name = 'Straight-Arm Pulldown'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['barbell']
  WHERE name = 'Barbell Row'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['barbell']
  WHERE name = 'Pendlay Row'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['barbell']
  WHERE name = 'T-Bar Row'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['cable','machine']
  WHERE name = 'Seated Cable Row'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Single-Arm Dumbbell Row'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Chest-Supported Dumbbell Row'     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['bodyweight']
  WHERE name = 'Inverted Row'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['machine']
  WHERE name = 'Machine Row'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_back',  equipment = ARRAY['bodyweight','machine']
  WHERE name = 'Hyperextension'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell']
  WHERE name = 'Good Morning'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['barbell']
  WHERE name = 'Shrug (Barbell)'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['dumbbell']
  WHERE name = 'Shrug (Dumbbell)'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'carry',           equipment = ARRAY['dumbbell','barbell','kettlebell']
  WHERE name = 'Farmer''s Carry'                  AND movement_pattern IS NULL;
-- Expanded back exercises
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['cable','machine']
  WHERE name = 'Close-Grip Lat Pulldown'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['cable','machine']
  WHERE name = 'Reverse-Grip Lat Pulldown'        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['cable','machine']
  WHERE name = 'Neutral-Grip Lat Pulldown'        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['barbell','bench']
  WHERE name = 'Seal Row'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['dumbbell']
  WHERE name = 'Meadows Row'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['barbell']
  WHERE name = 'Landmine Row'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['machine','pullup_bar','bodyweight']
  WHERE name = 'Assisted Pull-Up'                 AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- SHOULDERS — vertical_push / isolation_shoulders
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['barbell','rack']
  WHERE name = 'Overhead Press'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['barbell','rack']
  WHERE name = 'Push Press'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['barbell','bench']
  WHERE name = 'Seated Barbell Press'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['dumbbell']
  WHERE name = 'Dumbbell Shoulder Press'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['dumbbell']
  WHERE name = 'Arnold Press'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['machine']
  WHERE name = 'Machine Shoulder Press'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['dumbbell']
  WHERE name = 'Lateral Raise'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['cable']
  WHERE name = 'Cable Lateral Raise'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['machine']
  WHERE name = 'Machine Lateral Raise'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['dumbbell','barbell']
  WHERE name = 'Front Raise'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['dumbbell']
  WHERE name = 'Bent-Over Reverse Fly'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['machine']
  WHERE name = 'Reverse Pec Deck'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['cable']
  WHERE name = 'Face Pull'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['barbell','cable']
  WHERE name = 'Upright Row'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['bodyweight']
  WHERE name = 'Handstand Push-Up'                AND movement_pattern IS NULL;
-- Expanded shoulder exercises
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['machine','bench']
  WHERE name = 'Smith Machine Shoulder Press'     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['cable']
  WHERE name = 'Cable Front Raise'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['dumbbell','barbell']
  WHERE name = 'Cuban Press'                      AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- BICEPS — isolation_arms
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell']
  WHERE name = 'Barbell Curl'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell']
  WHERE name = 'EZ-Bar Curl'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Dumbbell Curl'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Alternating Dumbbell Curl'        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Hammer Curl'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Incline Dumbbell Curl'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['machine','barbell']
  WHERE name = 'Preacher Curl'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Spider Curl'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Concentration Curl'               AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Cable Curl'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Reverse Curl'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Zottman Curl'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['machine']
  WHERE name = 'Machine Curl'                     AND movement_pattern IS NULL;
-- Expanded arm exercises
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Cable Rope Hammer Curl'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['machine']
  WHERE name = 'Preacher Curl Machine'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Cable Reverse Curl'               AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- TRICEPS — isolation_arms
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Triceps Pushdown'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Rope Pushdown'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell','cable','barbell']
  WHERE name = 'Overhead Triceps Extension'       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','bench']
  WHERE name = 'Skull Crusher'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','bench']
  WHERE name = 'EZ-Bar Skull Crusher'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Dumbbell Skull Crusher'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Cable Overhead Extension'         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Triceps Kickback'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['bench','bodyweight']
  WHERE name = 'Bench Dip'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['bodyweight','rack']
  WHERE name = 'Parallel Bar Dip (Triceps)'       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','bench']
  WHERE name = 'JM Press'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['machine']
  WHERE name = 'Machine Triceps Extension'        AND movement_pattern IS NULL;
-- Expanded tricep
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['machine']
  WHERE name = 'Tricep Dip Machine'               AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- FOREARMS — isolation_arms
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Wrist Curl'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Reverse Wrist Curl'               AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Dead Hang'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['bodyweight']
  WHERE name = 'Plate Pinch Hold'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['bodyweight']
  WHERE name = 'Wrist Roller'                     AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- QUADS / SQUAT FAMILY — squat, lunge
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Back Squat'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Front Squat'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack']
  WHERE name = 'High-Bar Squat'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Low-Bar Squat'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Pause Squat'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack','bench']
  WHERE name = 'Box Squat'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['dumbbell','kettlebell']
  WHERE name = 'Goblet Squat'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['machine']
  WHERE name = 'Hack Squat'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['machine','barbell']
  WHERE name = 'Belt Squat'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['machine']
  WHERE name = 'Leg Press'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Leg Extension'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['barbell','dumbbell','bodyweight']
  WHERE name = 'Walking Lunge'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['barbell','dumbbell','bodyweight']
  WHERE name = 'Reverse Lunge'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['dumbbell','barbell','bodyweight']
  WHERE name = 'Bulgarian Split Squat'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['dumbbell','barbell','bodyweight']
  WHERE name = 'Step-Up'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['bodyweight']
  WHERE name = 'Pistol Squat'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['bodyweight']
  WHERE name = 'Bodyweight Squat'                 AND movement_pattern IS NULL;
-- Expanded squat/lunge
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['machine']
  WHERE name = 'Smith Machine Squat'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['bodyweight']
  WHERE name = 'Sissy Squat'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['machine']
  WHERE name = 'Pendulum Squat'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['dumbbell']
  WHERE name = 'Dumbbell Lunge'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['dumbbell','kettlebell']
  WHERE name = 'Goblet Lunge'                     AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- HAMSTRINGS — hinge, isolation_legs
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Romanian Deadlift'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Single-Leg Romanian Deadlift'     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Lying Leg Curl'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Seated Leg Curl'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['bodyweight']
  WHERE name = 'Nordic Curl'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['machine','bodyweight']
  WHERE name = 'Glute-Ham Raise'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['kettlebell','dumbbell']
  WHERE name = 'Kettlebell Swing'                 AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- GLUTES — hinge, isolation_legs, lunge
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','dumbbell','bench']
  WHERE name = 'Hip Thrust'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','bench']
  WHERE name = 'Barbell Hip Thrust'               AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['bodyweight']
  WHERE name = 'Glute Bridge'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['bodyweight','dumbbell']
  WHERE name = 'Single-Leg Hip Thrust'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['cable']
  WHERE name = 'Cable Pull-Through'               AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['bodyweight']
  WHERE name = 'Frog Pump'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['dumbbell','barbell','bodyweight']
  WHERE name = 'Curtsy Lunge'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Glute Kickback Machine'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['bands','bodyweight']
  WHERE name = 'Banded Clamshell'                 AND movement_pattern IS NULL;
-- Expanded glute/leg exercises
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Hip Abduction Machine'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Hip Adduction Machine'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['cable']
  WHERE name = 'Cable Kickback'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['machine','bodyweight']
  WHERE name = 'Reverse Hyperextension'           AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- CALVES — isolation_calves
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['machine','barbell','dumbbell']
  WHERE name = 'Standing Calf Raise'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['machine']
  WHERE name = 'Seated Calf Raise'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['machine','bodyweight']
  WHERE name = 'Donkey Calf Raise'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['machine']
  WHERE name = 'Leg Press Calf Raise'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['bodyweight']
  WHERE name = 'Single-Leg Calf Raise'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['bodyweight']
  WHERE name = 'Tibialis Raise'                   AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- CORE — core
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Plank'                            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Side Plank'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Hollow Hold'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Dead Bug'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Hanging Leg Raise'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Toes-to-Bar'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['cable']
  WHERE name = 'Cable Crunch'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Crunch'                           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['dumbbell','bodyweight']
  WHERE name = 'Russian Twist'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['cable']
  WHERE name = 'Pallof Press'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Ab Wheel Rollout'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Dragon Flag'                      AND movement_pattern IS NULL;
-- Expanded core
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Bicycle Crunch'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight','bench']
  WHERE name = 'Decline Crunch'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['cable']
  WHERE name = 'Cable Woodchopper'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Mountain Climbers'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'carry',           equipment = ARRAY['dumbbell','kettlebell']
  WHERE name = 'Suitcase Carry'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Hanging Knee Raise'               AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- FULL BODY / CONDITIONING — plyometric, carry
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bodyweight']
  WHERE name = 'Burpee'                           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Thruster'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'carry',           equipment = ARRAY['dumbbell','kettlebell']
  WHERE name = 'Turkish Get-Up'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'carry',           equipment = ARRAY['machine']
  WHERE name = 'Sled Push'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'carry',           equipment = ARRAY['machine']
  WHERE name = 'Sled Pull'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bodyweight']
  WHERE name = 'Tire Flip'                        AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- OLYMPIC — olympic
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Snatch'                           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Power Snatch'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell']
  WHERE name = 'Overhead Squat'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Clean'                            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Power Clean'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Hang Clean'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Clean and Jerk'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Jerk'                             AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- PLYOMETRICS — plyometric
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bench','bodyweight']
  WHERE name = 'Box Jump'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bodyweight']
  WHERE name = 'Broad Jump'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bodyweight']
  WHERE name = 'Jump Squat'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bodyweight']
  WHERE name = 'Medicine Ball Slam'               AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- CARDIO — cardio
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['track']
  WHERE name = 'Running (Outdoor)'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['treadmill']
  WHERE name = 'Treadmill Run'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['treadmill']
  WHERE name = 'Treadmill Walk'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['treadmill']
  WHERE name = 'Incline Walk'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['track']
  WHERE name = 'Sprint Intervals'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['track']
  WHERE name = '5K Run'                           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['track']
  WHERE name = '10K Run'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['bike']
  WHERE name = 'Cycling (Outdoor)'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['bike']
  WHERE name = 'Stationary Bike'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['bike']
  WHERE name = 'Assault Bike'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['machine']
  WHERE name = 'Rowing (Erg)'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['pool']
  WHERE name = 'Swimming (Freestyle)'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['machine']
  WHERE name = 'Stair Climber'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['machine']
  WHERE name = 'Elliptical'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['bodyweight']
  WHERE name = 'Jump Rope'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['track']
  WHERE name = 'Hike'                             AND movement_pattern IS NULL;
-- Expanded cardio/conditioning
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['bodyweight']
  WHERE name = 'Battle Ropes'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['machine']
  WHERE name = 'Ski Erg'                          AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- MOBILITY — core (mobility patterns don't map to a strength pattern;
--            core is the closest catch-all; equipment = bodyweight)
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Couch Stretch'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = '90-90 Hip Stretch'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Pigeon Pose'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'World''s Greatest Stretch'        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Cat-Cow'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Thoracic Spine Rotation'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Foam Roll Quads'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Foam Roll Back'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['bodyweight']
  WHERE name = 'Shoulder Dislocates'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Hamstring Stretch'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Calf Stretch'                     AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- FALLBACK: any exercise still untagged gets equipment = ARRAY['machine']
--           movement_pattern remains NULL (discoverable via IS NULL query)
-- ---------------------------------------------------------------------------
UPDATE exercises
  SET equipment = ARRAY['machine']
  WHERE equipment IS NULL;


-- #############################################################################
-- # SOURCE: peak-fettle-agents/server/migrations/20260612_oauth_identities.sql
-- # (folded 2026-06-12 — SPEC-094A Agent Q)
-- #############################################################################

-- 20260612 — TICKET-099: oauth_identities table
--
-- One row per (user, provider) identity from Apple or Google sign-in.
-- The user_id FK links back to the users row created or located by
-- POST /auth/oauth. A user may have both an apple and a google identity.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS; UNIQUE constraint prevents
-- duplicate (provider, provider_sub) pairs on repeated runs.

CREATE TABLE IF NOT EXISTS oauth_identities (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider     TEXT        NOT NULL CHECK (provider IN ('apple', 'google')),
    provider_sub TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (provider, provider_sub)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_user
    ON oauth_identities (user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_provider_sub
    ON oauth_identities (provider, provider_sub);


-- ===========================================================================
-- SOURCE: migrations/20260612_group_weekly_signals.sql (folded in 2026-06-14)
--
-- Clients send a tiny weekly signal instead of the server reading personal
-- workout logs for group evaluation. cron/group-streaks.js prefers signals when
-- present and falls back to the legacy log-query path otherwise.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS group_weekly_signals (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id      UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    week_start    DATE        NOT NULL,  -- ISO Monday, YYYY-MM-DD
    hit_goal      BOOLEAN     NOT NULL,
    workouts_done SMALLINT    NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT group_weekly_signals_unique UNIQUE (group_id, user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_gws_group_week
    ON group_weekly_signals (group_id, week_start);
CREATE INDEX IF NOT EXISTS idx_gws_user_group_week
    ON group_weekly_signals (user_id, group_id, week_start);


-- ===========================================================================
-- LIFEOS TICKET-111 (2026-06-12) — cross-app whole-person streak marker.
--
-- Local-first posture (Q30): the Life OS app's content never reaches the
-- server. This table stores ONLY a per-day boolean presence marker ("at
-- least one habit was active on this date") — no habit names, no counts.
-- The whole-person streak is computed on read in routes/lifeos.js from the
-- union of workouts.day_key and these rows (deviation from the spec's
-- stored-counter sketch, recorded in LIFEOS_BUILD_STATUS).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS lifeos_activity_days (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date    DATE NOT NULL,
    PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_lifeos_activity_days_user
    ON lifeos_activity_days (user_id, date DESC);

-- RLS (repo convention: every per-user table) — review finding 2026-06-12.
ALTER TABLE lifeos_activity_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lifeos_activity_days_self_only" ON lifeos_activity_days
    FOR ALL USING (auth.uid() = user_id);


-- ===========================================================================
-- LIFEOS TICKET-121 — accountability partner (Q33 option a, 2026-06-20)
--
-- Stores ONLY the latest opaque, CLIENT-COMPOSED daily summary string per user
-- (e.g. "3/4 habits today, streak intact") — NEVER raw habit/mood/blocked-app
-- data; the client guarantees the payload is a summary. `code` is a high-entropy
-- capability token the user generates on-device and shares with ONE partner; the
-- partner reads via the PUBLIC GET /partner/:code (routes/partner.js, no auth —
-- the code IS the capability). Revoke = rotate the code (old code stops
-- resolving) or DELETE the row. ON DELETE CASCADE covers account deletion
-- (TICKET-127 data-deletion check). Feature is OFF by default (flag
-- accountabilityPartner); no row exists until the user opts in + pairs.
-- Founder: apply this table to the live DB (no in-repo migration runner) and add
-- the App Privacy "Data shared with others: usage summary" disclosure before ship.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS lifeos_partner_summaries (
    user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code         TEXT NOT NULL UNIQUE,         -- capability token (≥128-bit, client-generated)
    summary_text TEXT NOT NULL,                -- opaque, client-composed; never raw data
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Server-side pause enforcement, 2026-07-02 (TICKET-127): a paused pairing
    -- must go dark server-side too, not just hide the UI on-device -- the
    -- partner code is a public capability URL, so pausing has to be enforced
    -- where the read actually happens (routes/partner.js GET /:code -> 404).
    paused       BOOLEAN NOT NULL DEFAULT FALSE
);

-- Idempotent ALTER for already-deployed DBs predating the paused column
-- (schema.sql is canonical + re-runnable; CLAUDE.md #4 drift-tolerant convention).
ALTER TABLE lifeos_partner_summaries ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_lifeos_partner_summaries_code
    ON lifeos_partner_summaries (code);

ALTER TABLE lifeos_partner_summaries ENABLE ROW LEVEL SECURITY;

-- Self-only for any Supabase-context access; the server's pg pool scopes by
-- user_id (writes) / code (the public read) explicitly.
CREATE POLICY "lifeos_partner_summaries_self_only" ON lifeos_partner_summaries
    FOR ALL USING (auth.uid() = user_id);


-- ===========================================================================
-- LOCAL-SCHEMA v5 fold (2026-06-17) — device-local app_settings + workouts idx
--
-- These mirror the on-device SQLite schema v5 (mobile/src/db/localSchema.ts,
-- SCHEMA_V5_STATEMENTS) so db/schema.sql stays the canonical, re-runnable source
-- of truth for every table the app knows about.
--
-- 1. app_settings — a tiny per-INSTALL key/value config store (first consumer:
--    the rest-timer default). It is DEVICE CONFIG, never user data: it is NOT in
--    the backup registry (exportEngine BACKUP_TABLES) and the server never reads
--    or writes it. Defined here only for schema completeness/drift-tolerance; it
--    carries no user_id and therefore no RLS (it is not a per-user table).
--
-- 2. workouts(session_type) / workouts(created_at) — the on-device history and
--    streak reads filter by session_type and order by created_at. Server-side,
--    the composite idx_workouts_session_type (user_id, session_type,
--    created_at DESC) folded above (~L5187) already covers the session_type
--    predicate and created_at ordering, so only the standalone created_at index
--    is added here. All CREATE ... IF NOT EXISTS → idempotent, safe to re-run.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_workouts_created_at
    ON workouts (created_at);


-- ===========================================================================
-- LOCAL-SCHEMA v6 fold (2026-06-17) — rich cardio metrics + persistable username
--
-- Mirrors the on-device SQLite schema v6 (mobile/src/db/localSchema.ts,
-- SCHEMA_V6_STATEMENTS) so db/schema.sql stays the canonical, re-runnable source
-- of truth. Both ALTERs are ADD COLUMN IF NOT EXISTS → idempotent, safe to re-run.
--
-- 1. sets.metrics_json TEXT — a JSON blob for cardio/sport metrics that don't fit
--    the fixed columns (avg/max HR, calories, cadence, elevation gain, RPE,
--    per-unit splits, open extras). On-device it is read/written via
--    mobile/src/data/cardioMetrics.ts for ALL tiers in this wave.
--    SERVER STATUS: server sync of metrics_json is a later PHASE-6 server task —
--    no route reads or writes this column yet. It is added here ONLY for schema
--    completeness / forward drift-tolerance so a future server `remake` already
--    carries it (the local store is the system of record until Phase 6).
--
-- 2. display_name — free (local-first) users persist an edited username on-device
--    in user_profile.display_name (a LOCAL-only mirror table; there is no server
--    `user_profile`). The canonical SERVER column is users.display_name, already
--    declared in CREATE TABLE users (~L71). It is re-asserted idempotently below
--    so this fold is self-documenting and survives prod schema drift.
-- ===========================================================================

ALTER TABLE sets  ADD COLUMN IF NOT EXISTS metrics_json TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;


-- ===========================================================================
-- LOCAL-SCHEMA v8 fold + Pro server sync (Task 3, 2026-06-19) — expanded survey
--
-- Mirrors the on-device SQLite user_profile columns (localSchema v8) on the
-- server `users` table so a PRO user's training-survey answers persist + sync via
-- PATCH /user/profile (peak-fettle-agents/server/routes/user.js). FREE users are
-- local-first and need none of this (no server row). birth_date already exists on
-- users (DATE, see CREATE TABLE users above) and is intentionally NOT re-added.
-- Arrays mirror the local JSON arrays: injuries / muscle_priorities are string[]
-- (TEXT[]); training_days is number[] 0–6 (INTEGER[]); bodyweight_kg is canonical
-- exact kg (NUMERIC — never the legacy kg×8). All ADD COLUMN IF NOT EXISTS →
-- idempotent, safe to re-run.
-- Source: peak-fettle-agents/server/migrations/20260619_expanded_survey_fields.sql
-- ===========================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS primary_focus     TEXT,
  ADD COLUMN IF NOT EXISTS injuries          TEXT[],
  ADD COLUMN IF NOT EXISTS muscle_priorities TEXT[],
  ADD COLUMN IF NOT EXISTS bodyweight_kg     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS training_days     INTEGER[];


-- ===========================================================================
-- WAVE 2 FOLD (2026-07-03) — TICKET-129 / TICKET-130 / TICKET-138
--
-- 129: per-set notes + flags. Additive columns on `sets`; flags is a bitmask
--      (1=paused, 2=tempo, 4=belt, 8=pin/rack, 16=discomfort — SET_FLAG_DEFS in
--      mobile/src/db/localSchema.ts). Server routes (routes/sets.js, the GDPR
--      export in routes/user.js) are drift-guarded and fall back to the legacy
--      column set until this fold runs on prod.
-- 130: body measurements (Pro sync only; free tier is 100% local). Mirrors the
--      on-device `body_measurements` table (localSchema). unit ∈ cm|in|pct is
--      enforced client-side; the server stays permissive (drift tolerance).
-- 138: routine share links. Short unlisted ids, 90-day default expiry,
--      revoke = DELETE. routes/shareLinks.js degrades 404 on 42P01/42703 until
--      this fold runs. UNIQUE(routine_id) backs its ON CONFLICT upsert.
-- All statements idempotent — safe to re-run (the whole-file "remake" rule).
-- ===========================================================================

ALTER TABLE sets ADD COLUMN IF NOT EXISTS note  TEXT;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS flags INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS body_measurements (
    id          TEXT        PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric      TEXT        NOT NULL,
    value       NUMERIC     NOT NULL,
    unit        TEXT        NOT NULL,          -- 'cm' | 'in' | 'pct'
    logged_at   TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_body_measurements_user_metric
    ON body_measurements(user_id, metric, logged_at);
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "body_measurements_self_only" ON body_measurements
        FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS routine_share_links (
    id          TEXT        PRIMARY KEY,
    routine_id  UUID        NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    exercises   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    CONSTRAINT routine_share_links_routine_unique UNIQUE (routine_id)
);
CREATE INDEX IF NOT EXISTS idx_routine_share_links_user   ON routine_share_links(user_id);
CREATE INDEX IF NOT EXISTS idx_routine_share_links_expiry ON routine_share_links(expires_at);
ALTER TABLE routine_share_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "routine_share_links_owner_only" ON routine_share_links
        FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ===========================================================================
-- WAVE 3 FOLD (2026-07-03) — TICKET-139 group leaderboards
--
-- Opt-in aggregates riding the existing weekly-signal row. All nullable /
-- defaulted → purely additive; the streak cron reads only hit_goal and is
-- unaffected. routes/groups.js degrades (legacy 5-column insert, leaderboard
-- omitted) until this fold runs on prod. session_count intentionally reuses
-- the existing workouts_done column (aliased in the route) — no duplicate.
-- TICKET-133/143 (progress photos, badges) are LOCAL-ONLY: no server DDL.
-- ===========================================================================

ALTER TABLE group_weekly_signals
    ADD COLUMN IF NOT EXISTS opted_in        BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS total_volume_kg NUMERIC,
    ADD COLUMN IF NOT EXISTS streak_weeks    SMALLINT;
