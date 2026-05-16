-- migrations/20260505_sets_weight_raw.sql
-- Phase D — minimal set storage
-- Author: dev-database
-- Date: 2026-05-05
--
-- Changes:
--   1. Replace weight_kg NUMERIC(6,2) with weight_raw SMALLINT
--        storage unit: 1 unit = 0.125 kg  (i.e. stored value = actual_kg × 8)
--        precision:    0.125 kg (covers all standard plates including 1.25 kg micro)
--        max value:    32767 units = 4,095.875 kg
--   2. Add CHECK constraint on rir: NULL | -1 (not recorded) … 10
--   3. Rebuild the kind/fields CHECK that referenced weight_kg → weight_raw
--   4. Recreate v_user_lift_inputs so the percentile batch sees the correct kg value
--
-- Backward-compatible API contract:
--   The application layer (routes/sets.js) encodes on write  (weight_kg × 8 → weight_raw)
--   and decodes on read  (weight_raw ÷ 8 → weight_kg).  No client-visible change.
--
-- Idempotent: safe to re-run (column/constraint existence checks prevent duplicate errors).

-- ---------------------------------------------------------------------------
-- STEP 1 — Add weight_raw column (nullable initially to allow data migration)
-- ---------------------------------------------------------------------------
ALTER TABLE sets
    ADD COLUMN IF NOT EXISTS weight_raw SMALLINT;

-- ---------------------------------------------------------------------------
-- STEP 2 — Migrate existing data
--   Round to nearest eighth-kg unit.  NULL weight_kg (cardio rows) stays NULL.
-- ---------------------------------------------------------------------------
UPDATE sets
   SET weight_raw = ROUND(weight_kg * 8)::SMALLINT
 WHERE weight_kg IS NOT NULL
   AND weight_raw IS NULL;   -- skip if re-running after a partial run

-- ---------------------------------------------------------------------------
-- STEP 3 — Drop the old CHECK constraint that references weight_kg
--   The constraint was created inline in 20260430_initial_schema.sql without an
--   explicit name, so Postgres assigned one automatically.  We find it by
--   inspecting pg_constraint rather than hard-coding the generated name.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    _cname TEXT;
BEGIN
    SELECT conname INTO _cname
      FROM pg_constraint
     WHERE conrelid = 'sets'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) LIKE '%weight_kg%';
    IF _cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE sets DROP CONSTRAINT %I', _cname);
        RAISE NOTICE 'Dropped constraint % (referenced weight_kg)', _cname;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- STEP 4 — Drop weight_kg
--   CASCADE drops v_user_lift_inputs, which references this column.
--   Step 7 recreates the view using weight_raw instead.
-- ---------------------------------------------------------------------------
ALTER TABLE sets
    DROP COLUMN IF EXISTS weight_kg CASCADE;

-- ---------------------------------------------------------------------------
-- STEP 5 — Add the rebuilt kind/fields CHECK using weight_raw
-- ---------------------------------------------------------------------------
ALTER TABLE sets
    ADD CONSTRAINT sets_kind_fields_check CHECK (
        (kind = 'lift'   AND reps IS NOT NULL AND weight_raw IS NOT NULL)
        OR
        (kind = 'cardio' AND duration_sec IS NOT NULL)
    );

-- ---------------------------------------------------------------------------
-- STEP 6 — Add rir range CHECK
--   -1 = not recorded  |  0 = to failure  |  1–10 = reps in reserve
--   NULL is allowed for cardio sets.
-- ---------------------------------------------------------------------------
ALTER TABLE sets
    ADD CONSTRAINT sets_rir_range_check CHECK (
        rir IS NULL OR rir BETWEEN -1 AND 10
    );

-- ---------------------------------------------------------------------------
-- STEP 7 — Recreate v_user_lift_inputs
--   Divides weight_raw by 8.0 so the percentile batch continues to receive
--   a float kg value without any change to compute_percentile().
--   This supersedes the definition in 20260502_percentile_engine.sql and
--   20260503_lift_inputs_view.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_lift_inputs AS
SELECT
    u.id                                                            AS user_id,
    s.exercise_id,
    e.name                                                          AS exercise_name,
    REPLACE(LOWER(e.name), ' ', '_')                                AS lift_id,
    u.sex,
    COALESCE(
        u.weight_class_kg,
        CASE u.sex WHEN 'M' THEN 83 ELSE 66 END
    )::DOUBLE PRECISION                                             AS bodyweight_kg,
    EXTRACT(YEAR FROM AGE(NOW(), u.birth_date))::INTEGER            AS age,
    COALESCE(u.years_in_sport, 0)::DOUBLE PRECISION                 AS training_years,
    -- Decode weight_raw → actual kg before applying the Epley formula.
    -- Per CTO guardrail #12: singles (reps = 1) return raw weight — no multiplier.
    MAX(
        CASE
            WHEN s.reps = 1 THEN s.weight_raw / 8.0
            ELSE (s.weight_raw / 8.0) * (1.0 + s.reps / 30.0)
        END
    )                                                               AS best_one_rm_kg
FROM sets s
JOIN users     u ON u.id  = s.user_id
JOIN exercises e ON e.id  = s.exercise_id
WHERE
    s.kind          = 'lift'
    AND s.reps      >= 1
    AND s.weight_raw > 0
    AND u.sex        IN ('M', 'F')
    AND u.deleted_at   IS NULL
    AND u.birth_date   IS NOT NULL
GROUP BY
    u.id,
    s.exercise_id,
    e.name,
    u.sex,
    u.weight_class_kg,
    u.birth_date,
    u.years_in_sport;

-- ---------------------------------------------------------------------------
-- VERIFICATION QUERIES (run manually after applying)
-- ---------------------------------------------------------------------------
-- 1. Confirm column types:
--      SELECT column_name, data_type, numeric_precision, numeric_scale
--      FROM information_schema.columns
--      WHERE table_name = 'sets'
--      ORDER BY ordinal_position;
--
-- 2. Confirm weight_kg is gone:
--      SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'sets' AND column_name = 'weight_kg';
--      -- should return 0 rows
--
-- 3. Spot-check a lift set (replace <uuid> with a real set id):
--      SELECT weight_raw, weight_raw / 8.0 AS weight_kg_decoded FROM sets
--      WHERE kind = 'lift' LIMIT 5;
--
-- 4. Confirm v_user_lift_inputs still resolves:
--      SELECT * FROM v_user_lift_inputs LIMIT 1;
