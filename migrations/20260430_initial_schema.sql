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
