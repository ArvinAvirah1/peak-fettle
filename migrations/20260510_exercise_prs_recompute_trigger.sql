-- migrations/20260510_exercise_prs_recompute_trigger.sql
-- Phase: B (Y-03 — stale PR recompute on set delete / downward weight edit)
-- Author: dev-database
-- Date: 2026-05-10
--
-- PROBLEM (Y-03)
-- --------------
-- exercise_prs uses an app-layer upsert model (see 20260503_exercise_prs.sql).
-- The upsert only fires on new-set writes — it has no recompute path for:
--   1. Set DELETE:  set_id FK ON DELETE CASCADE removes the PR row, but the
--      *next-best* set for that (user_id, exercise_id, rep_count) tuple is
--      never promoted. The user's PR silently disappears.
--   2. Weight-edit downward (UPDATE sets SET weight_kg = lower_value): the PR
--      row still points to the same set_id, but its weight_kg is now stale-high.
--      The badge engine reads a PR that no longer reflects real performance.
--
-- FIX
-- ---
-- Two database-layer triggers on `sets`:
--
--   trg_sets_pr_recompute_delete  (AFTER DELETE)
--     Called for every deleted set row. Recomputes the PR for every
--     (user_id, exercise_id, rep_count) tuple that could have been held by
--     the deleted set: rep_count = OLD.reps (weight PR) and rep_count = 0
--     (E1RM PR). Finds the current best remaining set via a ranked scan and
--     upserts it; if no sets remain for that tuple the PR row stays gone
--     (already cleared by the FK cascade).
--
--   trg_sets_pr_recompute_update  (AFTER UPDATE)
--     Fires only when weight_kg decreases OR reps changes -- the two edits
--     that can invalidate a held PR. Same recompute logic as above applied
--     to all affected tuples from OLD and NEW.
--
-- NOTES
-- -----
-- * recompute_exercise_pr() is SECURITY DEFINER so it bypasses RLS and can
--   read all sets + write exercise_prs regardless of calling context.
-- * Idempotent: DROP IF EXISTS before every CREATE; safe to re-run.
-- * E1RM formula: weight_kg * (1 + reps/30). Singles (reps=1) => weight_kg
--   exactly (per CTO guardrail #12 from 20260503_exercise_prs.sql).
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- HELPER: recompute_exercise_pr
-- Finds the best remaining set for a given (user, exercise, rep_count) tuple
-- and upserts exercise_prs. If no sets remain and no PR row exists, is a no-op.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_exercise_pr(
    p_user_id     UUID,
    p_exercise_id UUID,
    p_rep_count   SMALLINT          -- 0 = E1RM bucket; 1-N = weight at that rep count
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER                   -- bypass RLS; runs as table owner
SET search_path = public
AS $$
DECLARE
    v_best_weight_kg  NUMERIC(6,2);
    v_best_set_id     UUID;
    v_best_logged_at  TIMESTAMPTZ;
BEGIN
    IF p_rep_count > 0 THEN
        -- Weight PR: highest weight_kg at this exact rep count
        SELECT weight_kg, id, logged_at
          INTO v_best_weight_kg, v_best_set_id, v_best_logged_at
          FROM sets
         WHERE user_id     = p_user_id
           AND exercise_id = p_exercise_id
           AND kind        = 'lift'
           AND reps        = p_rep_count
           AND weight_kg   IS NOT NULL
         ORDER BY weight_kg DESC, logged_at ASC
         LIMIT 1;

    ELSE
        -- E1RM PR: best Epley estimate across all rep counts
        -- Singles (reps=1) => E1RM = weight_kg (guardrail #12)
        SELECT
            CASE WHEN reps = 1
                 THEN weight_kg
                 ELSE weight_kg * (1.0 + reps::NUMERIC / 30.0)
            END,
            id,
            logged_at
          INTO v_best_weight_kg, v_best_set_id, v_best_logged_at
          FROM sets
         WHERE user_id     = p_user_id
           AND exercise_id = p_exercise_id
           AND kind        = 'lift'
           AND reps        IS NOT NULL
           AND weight_kg   IS NOT NULL
         ORDER BY
            CASE WHEN reps = 1
                 THEN weight_kg
                 ELSE weight_kg * (1.0 + reps::NUMERIC / 30.0)
            END DESC,
            logged_at ASC
         LIMIT 1;
    END IF;

    IF v_best_set_id IS NULL THEN
        -- No sets remain for this tuple; the CASCADE already removed the PR row.
        -- Explicit DELETE is a no-op if the row is already gone, but covers the
        -- update-downward case where the FK cascade did NOT fire.
        DELETE FROM exercise_prs
         WHERE user_id     = p_user_id
           AND exercise_id = p_exercise_id
           AND rep_count   = p_rep_count;
    ELSE
        -- Upsert the new best-set as the current PR
        INSERT INTO exercise_prs
            (user_id, exercise_id, rep_count, weight_kg, set_id, achieved_at)
        VALUES
            (p_user_id, p_exercise_id, p_rep_count,
             v_best_weight_kg, v_best_set_id, v_best_logged_at)
        ON CONFLICT (user_id, exercise_id, rep_count) DO UPDATE
            SET weight_kg   = EXCLUDED.weight_kg,
                set_id      = EXCLUDED.set_id,
                achieved_at = EXCLUDED.achieved_at,
                updated_at  = NOW();
    END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- TRIGGER FUNCTION: sets_pr_recompute_after_delete
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sets_pr_recompute_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only lift sets can hold PRs
    IF OLD.kind <> 'lift' OR OLD.reps IS NULL OR OLD.weight_kg IS NULL THEN
        RETURN OLD;
    END IF;

    -- Recompute weight-PR bucket for the specific rep count
    PERFORM recompute_exercise_pr(OLD.user_id, OLD.exercise_id, OLD.reps::SMALLINT);

    -- Recompute E1RM bucket (rep_count = 0) — this set may have held the best Epley value
    PERFORM recompute_exercise_pr(OLD.user_id, OLD.exercise_id, 0::SMALLINT);

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sets_pr_recompute_delete ON sets;
CREATE TRIGGER trg_sets_pr_recompute_delete
    AFTER DELETE ON sets
    FOR EACH ROW
    EXECUTE FUNCTION sets_pr_recompute_after_delete();


-- ---------------------------------------------------------------------------
-- TRIGGER FUNCTION: sets_pr_recompute_after_update
-- Only fires when weight_kg decreases or reps changes — the two edits that
-- can invalidate a held PR. Upward edits are handled by the app-layer upsert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sets_pr_recompute_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_weight_decreased BOOLEAN;
    v_reps_changed     BOOLEAN;
BEGIN
    -- Quick-exit for cardio sets
    IF NEW.kind <> 'lift' THEN
        RETURN NEW;
    END IF;

    v_weight_decreased := (
        NEW.weight_kg IS NOT NULL AND OLD.weight_kg IS NOT NULL
        AND NEW.weight_kg < OLD.weight_kg
    );
    v_reps_changed := (
        NEW.reps IS DISTINCT FROM OLD.reps
    );

    IF NOT v_weight_decreased AND NOT v_reps_changed THEN
        -- Neither condition met; no PR can have been invalidated
        RETURN NEW;
    END IF;

    -- OLD rep bucket may now have a better set
    IF OLD.reps IS NOT NULL THEN
        PERFORM recompute_exercise_pr(OLD.user_id, OLD.exercise_id, OLD.reps::SMALLINT);
    END IF;

    -- NEW rep bucket (if reps changed, the new bucket might now lack a proper PR)
    IF v_reps_changed AND NEW.reps IS NOT NULL AND NEW.reps <> OLD.reps THEN
        PERFORM recompute_exercise_pr(NEW.user_id, NEW.exercise_id, NEW.reps::SMALLINT);
    END IF;

    -- E1RM bucket always needs a recheck when weight or reps shift
    PERFORM recompute_exercise_pr(OLD.user_id, OLD.exercise_id, 0::SMALLINT);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sets_pr_recompute_update ON sets;
CREATE TRIGGER trg_sets_pr_recompute_update
    AFTER UPDATE OF weight_kg, reps ON sets
    FOR EACH ROW
    EXECUTE FUNCTION sets_pr_recompute_after_update();


-- ---------------------------------------------------------------------------
-- SUMMARY
-- 1 helper function : recompute_exercise_pr(uuid, uuid, smallint)
-- 2 trigger functions: sets_pr_recompute_after_delete
--                      sets_pr_recompute_after_update
-- 2 triggers         : trg_sets_pr_recompute_delete  (AFTER DELETE ON sets)
--                      trg_sets_pr_recompute_update  (AFTER UPDATE OF weight_kg, reps ON sets)
-- All objects are idempotent (CREATE OR REPLACE / DROP IF EXISTS).
-- ---------------------------------------------------------------------------
