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

CREATE OR REPLACE FUNCTION compute_percentile_batch(
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
        -- Resolve the effective 1RM per user × lift.
        -- Priority: user-confirmed value > Epley estimate from logged sets.
        SELECT
            u.user_id,
            u.lift_id,
            u.sex,
            u.primary_discipline,
            u.age,
            u.training_years,
            u.bodyweight_kg,
            -- Use confirmed_kg if the user has provided one; else Epley estimate
            COALESCE(ucr.confirmed_kg, u.best_one_rm_kg)    AS effective_e1rm,
            -- is_estimated: TRUE when no confirmed value exists (Epley path)
            (ucr.confirmed_kg IS NULL)                       AS is_estimated,
            -- Cohort bucketing fields
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
            ON  ucr.user_id = u.user_id
            AND ucr.lift_id = u.lift_id
        -- Only process rows where we have a usable lift weight
        WHERE COALESCE(ucr.confirmed_kg, u.best_one_rm_kg) > 0
    ),
    cohort_counts AS (
        -- Count internal Peak Fettle users per cohort cell.
        -- (Excludes external reference data which never appears in v_user_lift_inputs.)
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
        -- Experience-adjusted percentile
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
        END                                                    AS percentile,
        -- Population percentile (gender + BW only; NULL for UNDISCLOSED)
        CASE
            WHEN b.sex IN ('MALE', 'FEMALE') THEN
                compute_percentile_simple(
                    b.lift_id, b.sex, b.bodyweight_kg,
                    b.effective_e1rm, p_model_version
                )
            ELSE NULL
        END                                                    AS percentile_simple,
        -- Internal cohort size (drives confidence ring)
        cc.cohort_size::INTEGER                                AS cohort_size_internal,
        -- Estimation flag
        b.is_estimated                                         AS is_estimated,
        NOW()                                                  AS computed_at
    FROM base b
    LEFT JOIN cohort_counts cc
        ON  cc.lift_id              = b.lift_id
        AND cc.sex                  = COALESCE(b.sex, 'UNDISCLOSED')
        AND cc.primary_discipline   = COALESCE(b.primary_discipline, 'other')
        AND cc.age_band             = b.age_band
        AND cc.exp_band             = b.exp_band
$$;
