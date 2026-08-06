-- 20260805_sets_qualifiers.sql
-- Exercise qualifiers (schema v21) — server side, for Pro sync.
-- Spec: docs/archive/SPEC_2026-08-05_EXERCISE_QUALIFIERS.md §2.5
--
-- Records HOW a set was performed: grip width, cable attachment, pulley
-- height/ratio, and so on. Additive and FORWARD-ONLY — two nullable columns,
-- no rewrite of any existing row, no FK changes, no index on a hot path.
--
-- SEQUENCING (spec §2.5): this must be applied BEFORE the OTA that enables v21
-- on devices. Local SQLite migrates per-device on the second launch after an
-- `eas update`, so there is a window where clients are ahead of the server; a
-- client that sends a column the server lacks would 42703 on every set write.
-- Applying this first makes that window harmless. Nothing here breaks older
-- clients, which simply never send the columns.
--
-- DRIFT TOLERANCE (CLAUDE.md #4): prod was built incrementally and does not
-- exactly match db/schema.sql, so every statement is guarded and re-runnable.
-- Deliberately NOT using CREATE TEMP TABLE ... ON COMMIT DROP: the SQL editor
-- autocommits between statements and the temp table vanishes (42P01).

DO $$
BEGIN
    IF to_regclass('public.sets') IS NULL THEN
        RAISE NOTICE 'sets table absent — skipping qualifier columns';
        RETURN;
    END IF;

    -- The raw qualifier map, mirroring the on-device sets.qualifiers_json.
    -- TEXT rather than JSONB on purpose: the server never queries inside it.
    -- All qualifier interpretation (coefficients, exclusions, the percentile
    -- filter) happens on-device in the shipped TS catalog, which moves
    -- independently over the air. Parsing it here would create a second source
    -- of truth that drifts from the client's.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'sets'
           AND column_name = 'qualifiers_json'
    ) THEN
        ALTER TABLE public.sets ADD COLUMN qualifiers_json TEXT;
    END IF;

    -- Felt load after the pulley ratio, in the server's kg x 8 convention.
    --
    -- NOTE FOR ANYONE WRITING SQL AGAINST THIS TABLE: `sets` has NO weight_kg
    -- column — weight_kg is an API alias for weight_raw/8.0, and referencing
    -- s.weight_kg in server SQL 500s with 42703 even inside a COALESCE. So this
    -- mirrors weight_raw's integer convention rather than inventing a float.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'sets'
           AND column_name = 'load_effective_raw'
    ) THEN
        ALTER TABLE public.sets ADD COLUMN load_effective_raw INTEGER;
    END IF;
END $$;

-- Verification (safe to run repeatedly):
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'sets'
--      AND column_name IN ('qualifiers_json', 'load_effective_raw')
--    ORDER BY column_name;
-- Expect exactly two rows: load_effective_raw | integer, qualifiers_json | text.
