-- migrations/20260721_sets_weight_centi.sql
-- Fixed-point exact weight entry ("dollars and cents") — server side.
-- Author: dev-backend
-- Date: 2026-07-21
--
-- Why: the server stores lift weight ONLY as weight_raw SMALLINT (kg × 8,
-- 0.125 kg resolution). Every Pro-tier set therefore quantizes the entered
-- value: 186.7 lb → 84.68 kg → raw 677 → reads back 84.625 kg → 186.58 lb.
-- The mobile app (local schema v18) now stores the EXACT typed value as an
-- integer alongside canonical kg:
--   weight_centi INTEGER = typed value × 100 in the TYPED unit
--                          (50 lb → 5000, 82.5 kg → 8250)
--   weight_unit  TEXT    = 'kg' | 'lbs' — the unit the user typed in
-- These two columns mirror that on the server so POST /sets can persist the
-- exact entry verbatim and GET /sets returns it for exact display on Pro.
-- weight_raw stays the computational/legacy-percentile column — unchanged.
--
-- Drift rules (CLAUDE.md §4): guarded with to_regclass; ADD COLUMN IF NOT
-- EXISTS; no temp tables; idempotent — safe to re-run. routes/sets.js
-- degrades to the pre-centi INSERT on 42703 until this runs on prod.
--
-- No backfill: the entry unit of historical rows is unknowable. Legacy rows
-- keep weight_centi NULL and clients fall back to weight_kg (= weight_raw/8).

DO $$
BEGIN
    IF to_regclass('public.sets') IS NOT NULL THEN
        ALTER TABLE sets ADD COLUMN IF NOT EXISTS weight_centi INTEGER;
        ALTER TABLE sets ADD COLUMN IF NOT EXISTS weight_unit  TEXT;
    END IF;
END $$;

-- Value sanity (nullable columns; only constrain when present). Added via
-- NOT VALID so a re-run over existing rows can never fail mid-migration,
-- then validated separately (both statements are idempotent-guarded).
DO $$
BEGIN
    IF to_regclass('public.sets') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
            WHERE conname = 'sets_weight_unit_check'
              AND conrelid = 'public.sets'::regclass
       ) THEN
        ALTER TABLE sets
            ADD CONSTRAINT sets_weight_unit_check
            CHECK (weight_unit IS NULL OR weight_unit IN ('kg', 'lbs'))
            NOT VALID;
        ALTER TABLE sets VALIDATE CONSTRAINT sets_weight_unit_check;
    END IF;
END $$;
