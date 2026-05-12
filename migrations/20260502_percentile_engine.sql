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
