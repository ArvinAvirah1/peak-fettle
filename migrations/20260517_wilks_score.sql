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
