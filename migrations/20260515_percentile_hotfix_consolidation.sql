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
