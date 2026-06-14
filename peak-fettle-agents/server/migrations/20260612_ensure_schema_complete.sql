-- 20260612 — Ensure-everything: bring a drifted prod DB up to the columns/tables
--            every live route + cron depends on.  (Bug review 2026-06-12.)
--
-- WHY THIS EXISTS
--   db/schema.sql is a single consolidated, idempotent file (base CREATE TABLEs
--   followed by inline ADD COLUMN IF NOT EXISTS "migrations").  Railway prod was
--   built up incrementally and the founder is no longer certain which of those
--   inline ALTERs actually ran.  The Rankings "Request failed with status code
--   500" is the smoking gun: GET /percentile SELECTs upr.percentile_simple,
--   upr.cohort_size_internal, upr.is_estimated and s.weight_raw — columns that
--   only exist if the later inline ALTERs were applied.  A brand-new user with
--   zero rows should get an empty 200; a 500 means one of those columns is
--   missing in prod and Postgres rejects the SELECT at plan time.
--
-- WHAT THIS DOES
--   Re-asserts — idempotently — every column/table/index the currently-deployed
--   routes touch.  On a fully-migrated prod every statement is a no-op.  On a
--   drifted prod it fills exactly the gaps.  No data is modified or deleted.
--
-- SAFE TO RUN MULTIPLE TIMES.  Run inside a transaction; if anything errors the
--   whole thing rolls back and prod is untouched.
--
--   Fuller alternative: re-running the entire db/schema.sql top-to-bottom is also
--   idempotent and is the canonical "sync prod to source of truth" operation.
--   This file is the reviewable subset that unbricks the live 500s.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. users — Training Engine survey fields (20260611_engine_profile_fields)
--    Missing columns here make PATCH /user/profile's RETURNING clause 500 and
--    block generatePlan(). (Note: the client also currently PATCHes the wrong
--    path /users/profile -> 404; that is fixed in the mobile app, not here.)
-- ---------------------------------------------------------------------------
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
  ADD COLUMN IF NOT EXISTS last_deload_at DATE,
  ADD COLUMN IF NOT EXISTS use_1rm_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sex TEXT,
  ADD COLUMN IF NOT EXISTS primary_discipline TEXT;

-- ---------------------------------------------------------------------------
-- 2. user_percentile_rankings — columns the GET /percentile SELECT requires.
--    These are the direct cause of the Rankings 500 when absent in prod.
-- ---------------------------------------------------------------------------
ALTER TABLE user_percentile_rankings
  ADD COLUMN IF NOT EXISTS percentile_simple    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS cohort_size_internal INTEGER,
  ADD COLUMN IF NOT EXISTS is_estimated         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS model_version        INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- 3. sets — weight_raw (SMALLINT, kg x 8) the percentile Epley subquery reads.
--    Column existence is what matters for query planning; a NULL value for a
--    new user simply yields a NULL estimate.
-- ---------------------------------------------------------------------------
ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS weight_raw SMALLINT;

-- ---------------------------------------------------------------------------
-- 4. user_confirmed_1rm — LEFT JOINed by GET /percentile and written by
--    POST /percentile/confirm-1rm. Re-assert table + key columns.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_confirmed_1rm (
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lift_id      TEXT        NOT NULL,
    confirmed_kg NUMERIC(6,2) NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, lift_id)
);

-- ---------------------------------------------------------------------------
-- 5. workouts — routine link (20260604). Recent Activity labels + POST/PATCH.
-- ---------------------------------------------------------------------------
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS routine_id   UUID REFERENCES routines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routine_name TEXT;

-- ---------------------------------------------------------------------------
-- 6. exercises — tagging columns the library + engine read (20260611_tagging).
-- ---------------------------------------------------------------------------
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS movement_pattern TEXT,
  ADD COLUMN IF NOT EXISTS equipment        TEXT[];

-- ---------------------------------------------------------------------------
-- 7. oauth_identities (20260612_oauth_identities) — needed by POST /auth/oauth.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 8. group_weekly_signals (20260612_group_weekly_signals) — POST
--    /groups/:id/weekly-signal upsert + the weekly evaluation cron.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_weekly_signals (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id      UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    week_start    DATE        NOT NULL,
    hit_goal      BOOLEAN     NOT NULL,
    workouts_done SMALLINT    NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT group_weekly_signals_unique UNIQUE (group_id, user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_gws_group_week
    ON group_weekly_signals (group_id, week_start);
CREATE INDEX IF NOT EXISTS idx_gws_user_group_week
    ON group_weekly_signals (user_id, group_id, week_start);

COMMIT;

-- Post-run sanity check (run manually; not part of the transaction):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='user_percentile_rankings' ORDER BY 1;
--   -- expect: cohort_size_internal, computed_at, is_estimated, lift_id,
--   --         model_version, percentile, percentile_simple, user_id
