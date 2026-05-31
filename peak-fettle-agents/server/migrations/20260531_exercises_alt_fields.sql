-- 20260531_exercises_alt_fields.sql
-- Foundation for the Pro "alternative exercise" feature (machine-busy swap).
--
-- muscle_heads: granular muscle targets (e.g. 'lower_chest', 'front_delt',
--   'side_delt') — finer than the existing coarse muscle_groups ('chest',
--   'shoulders'). Enables accurate same-muscle alternative matching. The
--   frontend taxonomy already exists in mobile/src/constants/muscles.ts; this is
--   the server-side column it was always meant to populate.
-- equipment: 'barbell'|'dumbbell'|'cable'|'machine'|'bodyweight'|'other' — lets
--   the swap prefer a free-weight alternative when a machine is occupied.
--
-- Both NULLable and additive: existing rows + all current queries are unaffected,
-- and the /alternatives endpoint will simply return nothing until rows are tagged
-- (accurate tagging is a deliberate data pass, not auto-derived — see plan).
-- Idempotent. Apply in the Supabase SQL Editor.

ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS muscle_heads TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS equipment    TEXT;
