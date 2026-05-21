-- ===========================================================================
-- Peak Fettle — Strength Percentile Calculator
-- Model version: 2
-- Author:        Data Analyst Subteam
-- Last reviewed: 2026-05-10
-- Pairs with:    strength_curve_model.md, lift_vectors_seed.sql
--
-- V2 CHANGES vs V1:
--   1. bw_ref_kg and training_floor are now nullable so inherited lifts can
--      correctly fall through to the parent's values via COALESCE.  In v1 both
--      columns were NOT NULL with defaults (0.55 for training_floor), which
--      silently broke the inheritance chain for all accessory lifts.
--   2. Per-lift training_floor (f₀) is now set explicitly in the seed file;
--      default 0.55 replaced by NULL (inherit from parent or set per lift).
--   3. pop_mu / pop_sigma added: population-level parameters (no experience or
--      age adjustment) used by compute_percentile_simple().
--   4. compute_percentile_simple() added: gender + bodyweight only comparison
--      against the full trained-population distribution.
--   5. Calibration anchors corrected — see strength_curve_model.md §4.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. lift_vectors — the per (lift × sex) coefficient table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lift_vectors (
    lift_id              TEXT     NOT NULL,
    sex                  CHAR(1)  NOT NULL CHECK (sex IN ('M','F')),
    model_version        INTEGER  NOT NULL DEFAULT 2,

    -- ---- Experience-adjusted distribution (log-normal) ----
    mu                   DOUBLE PRECISION,          -- log of 50th-pctile lift at reference profile (asymptote)
    sigma                DOUBLE PRECISION,          -- log-scale SD: within-experience-level variation only

    -- ---- Simple / population distribution (log-normal, no age or experience adjustment) ----
    -- These represent the full trained-population distribution (all experience levels pooled).
    -- pop_mu  = log(intermediate_standard × bw_ref_kg)  [= population median at reference BW]
    -- pop_sigma = log(elite / beginner) / 3.290          [5th–95th percentile span of all trainees]
    -- Source: intermediate/elite/beginner standards; validated against Bielik 2024 and Strength Level (n>2M).
    pop_mu               DOUBLE PRECISION,
    pop_sigma            DOUBLE PRECISION,

    -- ---- Bodyweight scaling ----
    alpha                DOUBLE PRECISION NOT NULL DEFAULT 0.667,
    bw_ref_kg            DOUBLE PRECISION,                         -- 75 for M, 65 for F; nullable for inherited rows

    -- ---- Age curve (piecewise linear, calibrated to McCulloch/Foster USAPL tables) ----
    age_peak_lo          INTEGER  NOT NULL DEFAULT 23,
    age_peak_hi          INTEGER  NOT NULL DEFAULT 35,
    youth_decay_per_year DOUBLE PRECISION NOT NULL DEFAULT 0.012,
    age_decay_per_year   DOUBLE PRECISION NOT NULL DEFAULT 0.010,

    -- ---- Training-experience curve (first-order kinetics, M6 in skill file) ----
    -- training_floor (f₀): fraction of asymptote at t=0 (never trained).
    --   Calibrated per lift so T(0)×exp(μ) ≈ beginner standard.
    --   NULL for inherited lifts → inherits from parent via resolve_lift_vector.
    training_floor       DOUBLE PRECISION,                         -- nullable; no default (v1 had DEFAULT 0.55, which broke inheritance)
    training_tau_years   DOUBLE PRECISION NOT NULL DEFAULT 3.0,

    -- ---- Inheritance (for accessories that aren't directly fit) ----
    parent_lift_id       TEXT,
    inheritance_ratio    DOUBLE PRECISION,

    -- ---- Provenance ----
    fit_source           TEXT,
    fit_sample_size      INTEGER,
    notes                TEXT,

    PRIMARY KEY (lift_id, sex, model_version),
    CHECK (
        (mu IS NOT NULL AND sigma IS NOT NULL AND pop_mu IS NOT NULL AND pop_sigma IS NOT NULL)
         OR
        (parent_lift_id IS NOT NULL AND inheritance_ratio IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS lift_vectors_lookup_idx
    ON lift_vectors (lift_id, sex, model_version);

-- Schema migration for existing deployments (idempotent — ALTER IF NEEDED):
-- If upgrading from v1, run the following to make the columns nullable:
--   ALTER TABLE lift_vectors ALTER COLUMN bw_ref_kg    DROP NOT NULL;
--   ALTER TABLE lift_vectors ALTER COLUMN training_floor DROP NOT NULL;
--   ALTER TABLE lift_vectors ALTER COLUMN training_floor DROP DEFAULT;
--   ALTER TABLE lift_vectors ADD COLUMN IF NOT EXISTS pop_mu    DOUBLE PRECISION;
--   ALTER TABLE lift_vectors ADD COLUMN IF NOT EXISTS pop_sigma DOUBLE PRECISION;


-- ---------------------------------------------------------------------------
-- 2. Helper: standard normal CDF (Abramowitz & Stegun 26.2.17, max err 7.5e-8)
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
-- 3. Helper: resolve_lift_vector — handles inheritance, returns full param set
-- ---------------------------------------------------------------------------
-- For direct-fit lifts: returns the stored row values.
-- For inherited lifts:  mu_child  = mu_parent  + ln(inheritance_ratio)
--                       pop_mu_child = pop_mu_parent + ln(inheritance_ratio)
--                       sigma, pop_sigma, alpha, bw_ref_kg, age params,
--                       training_floor, training_tau_years all inherited via COALESCE.
--
-- NOTE: training_floor is nullable for inherited rows (no default in v2 schema),
-- so COALESCE(rec.training_floor, parent_rec.training_floor) correctly falls
-- through to the parent — the v1 bug where DEFAULT 0.55 short-circuited this.

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

    -- Inherited: pull parent row, offset mu and pop_mu by ln(ratio)
    SELECT * INTO parent_rec
      FROM resolve_lift_vector(rec.parent_lift_id, p_sex, p_model_version);

    RETURN QUERY SELECT
        parent_rec.mu     + ln(rec.inheritance_ratio)   AS mu,
        parent_rec.sigma                                AS sigma,
        parent_rec.pop_mu + ln(rec.inheritance_ratio)   AS pop_mu,
        parent_rec.pop_sigma                            AS pop_sigma,
        COALESCE(rec.alpha,                parent_rec.alpha)           AS alpha,
        COALESCE(rec.bw_ref_kg,            parent_rec.bw_ref_kg)       AS bw_ref_kg,
        COALESCE(rec.age_peak_lo,          parent_rec.age_peak_lo),
        COALESCE(rec.age_peak_hi,          parent_rec.age_peak_hi),
        COALESCE(rec.youth_decay_per_year, parent_rec.youth_decay_per_year),
        COALESCE(rec.age_decay_per_year,   parent_rec.age_decay_per_year),
        COALESCE(rec.training_floor,       parent_rec.training_floor),  -- v2 fix: training_floor now nullable
        COALESCE(rec.training_tau_years,   parent_rec.training_tau_years);
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. compute_percentile — experience-adjusted (sex × BW × age × training_yrs)
-- ---------------------------------------------------------------------------
-- Inputs:
--   p_lift_id       text    — e.g., 'back_squat', 'bench_press'
--   p_sex           char(1) — 'M' or 'F'
--   p_bodyweight_kg double  — user bodyweight in kg
--   p_age           integer — user age in years
--   p_training_yrs  double  — years of consistent strength training (0 = novice)
--   p_lift_kg       double  — the user's lift weight (1RM equivalent) in kg
--   p_model_version integer — defaults to 2
--
-- Returns: percentile [0, 100]; null on invalid input.
-- Interpretation: "Where do I rank among lifters of the same sex, bodyweight,
-- age, and training experience?"

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

    -- Factor 3: Training experience (first-order kinetics, M6 in skill file)
    -- training_floor (f₀) is now per-lift, calibrated so that the beginner
    -- standard is the expected median at t=0 and the intermediate standard is
    -- the expected median at t=2 years.  See strength_curve_model.md §2.3.
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
-- 5. compute_percentile_simple — gender + bodyweight only (no age, no experience)
-- ---------------------------------------------------------------------------
-- Inputs:
--   p_lift_id       text    — lift identifier
--   p_sex           char(1) — 'M' or 'F'
--   p_bodyweight_kg double  — user bodyweight in kg
--   p_lift_kg       double  — the user's lift weight (1RM equivalent) in kg
--   p_model_version integer — defaults to 2
--
-- Returns: percentile [0, 100]; null on invalid input.
-- Interpretation: "Where do I rank among ALL strength trainees of my gender at
-- my bodyweight, regardless of age or how long I have been training?"
--
-- Equation:
--   z = (ln(lift_kg) − (pop_mu + α·ln(BW / BW₀))) / pop_sigma
--
-- Parameters:
--   pop_mu    = ln(intermediate_standard × BW₀)  [population median at reference BW]
--   pop_sigma = ln(elite / beginner) / 3.290      [5th–95th pctile span of all trainees]
--
-- Sources: intermediate/beginner/elite standards from Strength Level (n>2,000,000,
-- all experience levels), validated against Bielik 2024 (n=809,986 competition
-- entries) which maps to the ~97th–98th percentile of the trained population.

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

    -- Bodyweight adjustment (same allometric scaling as main model)
    bw_factor := power(bw_clamped / v.bw_ref_kg, v.alpha);

    -- No age factor, no training factor — population comparison only
    log_expected := v.pop_mu + ln(bw_factor);

    z := GREATEST(-4.0, LEAST(4.0, (ln(p_lift_kg) - log_expected) / v.pop_sigma));

    RETURN 100.0 * norm_cdf(z);
END;
$$;


-- ---------------------------------------------------------------------------
-- 6. Bulk batch function (weekly job)
-- ---------------------------------------------------------------------------

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
-- 7. Convenience view — resolved parameters (for dev inspection)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_lift_vector_summary AS
SELECT
    lift_id,
    sex,
    model_version,
    CASE
        WHEN mu IS NOT NULL THEN 'direct_fit'
        ELSE 'inherited_from_' || parent_lift_id || ' (×' || inheritance_ratio || ')'
    END AS fit_type,
    round(mu::numeric, 4)       AS mu,
    round(sigma::numeric, 4)    AS sigma,
    round(pop_mu::numeric, 4)   AS pop_mu,
    round(pop_sigma::numeric, 4) AS pop_sigma,
    training_floor,
    fit_sample_size,
    notes
FROM lift_vectors
WHERE model_version = 2
ORDER BY sex, lift_id;

-- ===========================================================================
-- End of compute_percentile.sql
-- ===========================================================================
