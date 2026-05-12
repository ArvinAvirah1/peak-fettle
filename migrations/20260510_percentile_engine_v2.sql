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
