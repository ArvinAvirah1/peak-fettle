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
