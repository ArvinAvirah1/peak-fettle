-- migrations/20260503_exercise_prs.sql
-- Phase: D (PR badges feature — TICKET-008)
-- Author: dev-database
-- Date: 2026-05-03
--
-- PURPOSE
-- -------
-- Introduces exercise_prs: a derived, maintained table that stores each user's
-- personal record (PR) per exercise per rep count.  It backs the PR badge
-- overlay on the recent-sets list (TICKET-008).
--
-- One row per (user_id, exercise_id, rep_count):
--   rep_count = 0   → best estimated 1-Rep Max (E1RM)
--                     Epley formula: weight_kg * (1 + reps / 30)
--                     Exception: singles (reps = 1) → E1RM = weight_kg
--                     (Per CTO guardrail #12)
--   rep_count = 1–N → best weight lifted at exactly that rep count
--
-- MAINTENANCE MODEL
-- -----------------
-- This table is NOT self-maintaining via triggers on sets.  The application
-- layer (WorkoutTracker C++ model) is responsible for issuing an upsert after
-- every new set is logged.  The migration defines only the table structure and
-- constraints.  See "Application layer upsert" section in the migration header
-- for the expected logic.
--
-- Conventions (matching 20260430_initial_schema.sql):
--   * UUID foreign keys; no surrogate PK (composite PK is meaningful here)
--   * TIMESTAMPTZ for all timestamps
--   * Weights stored in kg only; UI converts at render time
--   * RLS enabled; set_updated_at() trigger function already exists from
--     initial_schema.sql
--   * DROP POLICY IF EXISTS before each CREATE POLICY (idempotent)
--
-- AA-02 (2026-05-11): WEIGHT COLUMN NAMING — IMPORTANT FOR FUTURE TRIGGERS
-- -----------------------------------------------------------------------
-- This doc-block (and parts of the body below) still refers to
-- `sets.weight_kg`. As of the 2026-05-05 weight_raw migration, the canonical
-- on-disk column is `sets.weight_raw` (SMALLINT, ÷8 fixed-point). The
-- application layer (`server/routes/sets.js::decodeWeight`) decodes
-- `weight_raw / 8.0` back to a float weight_kg for clients. Any new SQL
-- trigger or query that needs the kg value must use `(weight_raw / 8.0)`
-- directly; selecting `sets.weight_kg` will fail with a column-not-found
-- error. Application-layer upserts remain unchanged because they pass
-- decoded weight values.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- TABLE: exercise_prs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercise_prs (
    user_id       UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    exercise_id   UUID        NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,

    -- 0 = E1RM PR (Epley: weight_kg * (1 + reps/30); singles: weight_kg exactly)
    -- 1–N = weight PR at that exact rep count
    rep_count     SMALLINT    NOT NULL,

    -- Best weight in kg at this rep count, OR best E1RM kg equivalent (rep_count=0)
    weight_kg     NUMERIC(6,2) NOT NULL,

    -- The set that achieved this PR (ON DELETE CASCADE keeps the table clean if
    -- raw logs are ever purged — PR history goes with the source set)
    set_id        UUID        NOT NULL REFERENCES sets(id) ON DELETE CASCADE,

    -- Denormalised timestamp of the achieving set; avoids a join for badge display
    achieved_at   TIMESTAMPTZ NOT NULL,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, exercise_id, rep_count)
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

-- Fast lookup of all PRs for a single user (profile screen, dashboard)
CREATE INDEX IF NOT EXISTS idx_exercise_prs_user
    ON exercise_prs (user_id);

-- Dominant query: all PRs for one user + one exercise (exercise detail screen,
-- PR badge rendering on the recent-sets list — TICKET-008)
CREATE INDEX IF NOT EXISTS idx_exercise_prs_user_exercise
    ON exercise_prs (user_id, exercise_id);

-- ---------------------------------------------------------------------------
-- ROW-LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE exercise_prs ENABLE ROW LEVEL SECURITY;

-- Users can only read, insert, and update their own PR rows.
-- The application layer always supplies user_id = auth.uid() in upserts.
DROP POLICY IF EXISTS "exercise_prs_self_only" ON exercise_prs;
CREATE POLICY "exercise_prs_self_only" ON exercise_prs
    FOR ALL
    USING     (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- set_updated_at() is defined in 20260430_initial_schema.sql
-- DROP first for idempotency (safe to re-run this migration).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_exercise_prs_updated ON exercise_prs;
CREATE TRIGGER trg_exercise_prs_updated
    BEFORE UPDATE ON exercise_prs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- APPLICATION LAYER UPSERT SPEC
-- WorkoutTracker (C++) must call this logic after every logSet() for lift sets.
--
-- After saving a lift set (exercise_id E, reps R, weight_kg W, set_id S, logged_at T):
--
--   // Step 1 — weight PR at this rep count
--   e1rm = (R == 1) ? W : W * (1.0 + R / 30.0)   // Epley, guardrail #12
--   SELECT weight_kg INTO cur_weight
--     FROM exercise_prs WHERE user_id=U AND exercise_id=E AND rep_count=R;
--   IF NOT FOUND OR W > cur_weight:
--     INSERT INTO exercise_prs (user_id,exercise_id,rep_count,weight_kg,set_id,achieved_at)
--     VALUES (U, E, R, W, S, T)
--     ON CONFLICT (user_id,exercise_id,rep_count) DO UPDATE
--       SET weight_kg=EXCLUDED.weight_kg, set_id=EXCLUDED.set_id,
--           achieved_at=EXCLUDED.achieved_at, updated_at=NOW();
--
--   // Step 2 — E1RM PR (rep_count = 0)
--   SELECT weight_kg INTO cur_e1rm
--     FROM exercise_prs WHERE user_id=U AND exercise_id=E AND rep_count=0;
--   IF NOT FOUND OR e1rm > cur_e1rm:
--     INSERT INTO exercise_prs (user_id,exercise_id,rep_count,weight_kg,set_id,achieved_at)
--     VALUES (U, E, 0, e1rm, S, T)
--     ON CONFLICT (user_id,exercise_id,rep_count) DO UPDATE
--       SET weight_kg=EXCLUDED.weight_kg, set_id=EXCLUDED.set_id,
--           achieved_at=EXCLUDED.achieved_at, updated_at=NOW();
--
-- recentSets() JOIN to set isPr:
--   LEFT JOIN exercise_prs pr
--          ON pr.user_id    = s.user_id
--         AND pr.exercise_id = s.exercise_id
--         AND pr.set_id      = s.id
--   -- isPr = (pr.set_id IS NOT NULL)
--   -- A row appears in exercise_prs only when it is the current record holder,
--   -- so the join naturally marks only the PR set in the list.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- SUMMARY
-- 1 table   : exercise_prs
-- 2 indexes : idx_exercise_prs_user, idx_exercise_prs_user_exercise
-- 1 policy  : exercise_prs_self_only (FOR ALL, self-scoped)
-- 1 trigger : trg_exercise_prs_updated
-- ---------------------------------------------------------------------------
