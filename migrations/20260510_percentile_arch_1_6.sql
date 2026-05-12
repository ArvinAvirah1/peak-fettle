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
-- We replace it here to add the discipline column the batch function needs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_user_lift_inputs AS
SELECT
    u.id                                        AS user_id,
    u.sex,                                      -- 'MALE' | 'FEMALE' | 'UNDISCLOSED' | NULL
    u.primary_discipline,                       -- 'powerlifting' | 'running' | … | NULL
    EXTRACT(YEAR FROM AGE(NOW(), u.birth_date)) AS age,
    u.years_in_sport                            AS training_years,
    -- bodyweight: prefer weight_class_kg midpoint, fall back to stored weight_kg if present
    COALESCE(u.weight_class_kg, 75)             AS bodyweight_kg,
    e.lift_id,
    -- Best estimated 1RM across all sets for this exercise
    MAX(
        CASE
            WHEN s.reps = 1 THEN s.weight_kg
            ELSE s.weight_kg * (1 + s.reps::float / 30.0)   -- Epley E1RM
        END
    )                                           AS best_one_rm_kg,
    -- Account creation date — used by cohort-graduation cron
    u.created_at
FROM users u
JOIN workouts w ON w.user_id = u.id
JOIN sets s     ON s.workout_id = w.id
JOIN exercises e ON e.id = s.exercise_id
WHERE s.weight_kg > 0
  AND s.reps >= 1
  AND e.lift_id IS NOT NULL
GROUP BY u.id, u.sex, u.primary_discipline, u.birth_date,
         u.years_in_sport, u.weight_class_kg, e.lift_id, u.created_at;


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
