-- migrations/20260510_exercise_prs_delete_trigger.sql
-- Phase B — Y-03: exercise_prs stale-PR recompute on set delete / downward edit
-- Author: dev-database (pf-1am-dev-ops automated session)
-- Date: 2026-05-10
--
-- PROBLEM (Y-03)
-- ──────────────
-- exercise_prs stores one row per (user_id, exercise_id, rep_count) pointing at
-- the set that achieved the current PR.  The application layer upserts this table
-- on every new logSet() call (upward path only).
--
-- Two silent-corruption cases exist when the DELETE /sets/:id endpoint is used
-- (or a weight/rep correction goes downward):
--
--   A. SET DELETE  — exercise_prs.set_id has ON DELETE CASCADE, so the PR row
--      vanishes with the set.  If a second-best set existed, it never becomes the
--      recorded PR.  The user's badge disappears silently.
--
--   B. DOWNWARD EDIT  — a PATCH /sets/:id lowers weight_raw or reps.  The PR row
--      still points to that set but now stores a value that another set may beat.
--      Stale PR remains on display.
--
-- SOLUTION
-- ────────
-- Two SECURITY DEFINER trigger functions (bypass RLS; only called from internal
-- trigger context, never from client code):
--
--   recompute_exercise_pr_after_set_delete()
--     Fires: AFTER DELETE ON sets FOR EACH ROW
--     Action:
--       • Re-scan sets for the new best weight at OLD.reps → upsert or no-op
--       • Re-scan all sets for best E1RM → upsert or delete rep_count=0 row
--
--   recompute_exercise_pr_after_set_update()
--     Fires: AFTER UPDATE ON sets FOR EACH ROW
--     Guard: skips if weight_raw did not decrease AND reps did not change
--            (upward edits are already handled by app-layer upsert)
--     Action: same recompute as delete function, for both old-reps bucket and
--             new-reps bucket, plus E1RM recompute.
--
-- IDEMPOTENCY
-- ───────────
-- Uses CREATE OR REPLACE FUNCTION and DROP TRIGGER IF EXISTS / CREATE TRIGGER.
-- Safe to re-run.
--
-- COMPATIBILITY
-- ─────────────
-- weight_raw column (SMALLINT, kg × 8) introduced in 20260505_sets_weight_raw.sql.
-- E1RM formula per CTO guardrail #12: singles (reps = 1) → weight_raw / 8.0 exactly;
-- others → (weight_raw / 8.0) * (1.0 + reps / 30.0)  [Epley].
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. Trigger function: recompute after DELETE
-- ===========================================================================
CREATE OR REPLACE FUNCTION recompute_exercise_pr_after_set_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as function owner (postgres); bypasses client-tier RLS
SET search_path = public
AS $$
DECLARE
    v_best_rep  RECORD;
    v_best_e1rm RECORD;
BEGIN
    -- Only lift sets participate in exercise_prs.
    IF OLD.kind <> 'lift' THEN
        RETURN OLD;
    END IF;

    -- ── A. Weight PR at this exact rep count ─────────────────────────────────
    -- The ON DELETE CASCADE on exercise_prs.set_id has already removed the PR row
    -- if this set was the record holder.  Find the next-best set, if any.
    SELECT s.id,
           s.weight_raw / 8.0 AS weight_kg,
           s.logged_at
    INTO   v_best_rep
    FROM   sets s
    WHERE  s.user_id     = OLD.user_id
      AND  s.exercise_id = OLD.exercise_id
      AND  s.reps        = OLD.reps
      AND  s.kind        = 'lift'
    ORDER  BY s.weight_raw DESC, s.logged_at ASC
    LIMIT  1;

    IF FOUND THEN
        INSERT INTO exercise_prs
               (user_id, exercise_id, rep_count, weight_kg, set_id, achieved_at)
        VALUES (OLD.user_id, OLD.exercise_id, OLD.reps,
                v_best_rep.weight_kg, v_best_rep.id, v_best_rep.logged_at)
        ON CONFLICT (user_id, exercise_id, rep_count) DO UPDATE
            SET weight_kg   = EXCLUDED.weight_kg,
                set_id      = EXCLUDED.set_id,
                achieved_at = EXCLUDED.achieved_at,
                updated_at  = NOW();
    END IF;
    -- If NOT FOUND: CASCADE already removed the PR row — no new record exists.

    -- ── B. E1RM PR (rep_count = 0) ────────────────────────────────────────────
    -- The deleted set may have held the E1RM PR.  Recompute across all remaining
    -- lift sets for this (user, exercise).
    SELECT s.id,
           s.logged_at,
           CASE
               WHEN s.reps = 1 THEN s.weight_raw / 8.0
               ELSE (s.weight_raw / 8.0) * (1.0 + s.reps / 30.0)
           END AS e1rm_kg
    INTO   v_best_e1rm
    FROM   sets s
    WHERE  s.user_id     = OLD.user_id
      AND  s.exercise_id = OLD.exercise_id
      AND  s.kind        = 'lift'
      AND  s.reps       >= 1
    ORDER  BY
           CASE
               WHEN s.reps = 1 THEN s.weight_raw / 8.0
               ELSE (s.weight_raw / 8.0) * (1.0 + s.reps / 30.0)
           END DESC,
           s.logged_at ASC
    LIMIT  1;

    IF FOUND THEN
        INSERT INTO exercise_prs
               (user_id, exercise_id, rep_count, weight_kg, set_id, achieved_at)
        VALUES (OLD.user_id, OLD.exercise_id, 0,
                v_best_e1rm.e1rm_kg, v_best_e1rm.id, v_best_e1rm.logged_at)
        ON CONFLICT (user_id, exercise_id, rep_count) DO UPDATE
            SET weight_kg   = EXCLUDED.weight_kg,
                set_id      = EXCLUDED.set_id,
                achieved_at = EXCLUDED.achieved_at,
                updated_at  = NOW();
    ELSE
        -- No lift sets remain for this exercise: remove the E1RM row if it exists.
        DELETE FROM exercise_prs
        WHERE  user_id     = OLD.user_id
          AND  exercise_id = OLD.exercise_id
          AND  rep_count   = 0;
    END IF;

    RETURN OLD;
END;
$$;

-- Register the DELETE trigger
DROP TRIGGER IF EXISTS trg_exercise_prs_recompute_on_delete ON sets;
CREATE TRIGGER trg_exercise_prs_recompute_on_delete
    AFTER DELETE ON sets
    FOR EACH ROW
    EXECUTE FUNCTION recompute_exercise_pr_after_set_delete();


-- ===========================================================================
-- 2. Helper: recompute both rep-count PR and E1RM PR for a given
--    (user_id, exercise_id, reps) tuple.
--    Called by the UPDATE trigger for OLD.reps and NEW.reps buckets.
-- ===========================================================================
CREATE OR REPLACE FUNCTION _recompute_pr_bucket(
    p_user_id     UUID,
    p_exercise_id UUID,
    p_reps        SMALLINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_best RECORD;
BEGIN
    -- Weight PR at p_reps
    SELECT s.id,
           s.weight_raw / 8.0 AS weight_kg,
           s.logged_at
    INTO   v_best
    FROM   sets s
    WHERE  s.user_id     = p_user_id
      AND  s.exercise_id = p_exercise_id
      AND  s.reps        = p_reps
      AND  s.kind        = 'lift'
    ORDER  BY s.weight_raw DESC, s.logged_at ASC
    LIMIT  1;

    IF FOUND THEN
        INSERT INTO exercise_prs
               (user_id, exercise_id, rep_count, weight_kg, set_id, achieved_at)
        VALUES (p_user_id, p_exercise_id, p_reps,
                v_best.weight_kg, v_best.id, v_best.logged_at)
        ON CONFLICT (user_id, exercise_id, rep_count) DO UPDATE
            SET weight_kg   = EXCLUDED.weight_kg,
                set_id      = EXCLUDED.set_id,
                achieved_at = EXCLUDED.achieved_at,
                updated_at  = NOW();
    ELSE
        DELETE FROM exercise_prs
        WHERE  user_id     = p_user_id
          AND  exercise_id = p_exercise_id
          AND  rep_count   = p_reps;
    END IF;
END;
$$;


-- ===========================================================================
-- 3. Trigger function: recompute after downward UPDATE
-- ===========================================================================
CREATE OR REPLACE FUNCTION recompute_exercise_pr_after_set_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_best_e1rm RECORD;
BEGIN
    -- Only lift sets with a weight or reps change that could dethrone a PR.
    IF NEW.kind <> 'lift' THEN
        RETURN NEW;
    END IF;

    -- Fast-path: upward edits are handled by the application-layer upsert.
    -- Only trigger a recompute when weight went DOWN or reps changed.
    IF NEW.weight_raw >= OLD.weight_raw AND NEW.reps = OLD.reps THEN
        RETURN NEW;
    END IF;

    -- ── Recompute rep-count PR buckets ───────────────────────────────────────
    -- If reps changed, the OLD rep bucket needs a full recompute (this set may
    -- no longer be its best).
    IF NEW.reps <> OLD.reps THEN
        PERFORM _recompute_pr_bucket(OLD.user_id, OLD.exercise_id, OLD.reps);
    END IF;

    -- The NEW rep bucket always needs a recompute (weight may have dropped).
    PERFORM _recompute_pr_bucket(NEW.user_id, NEW.exercise_id, NEW.reps);

    -- ── Recompute E1RM PR (rep_count = 0) ────────────────────────────────────
    SELECT s.id,
           s.logged_at,
           CASE
               WHEN s.reps = 1 THEN s.weight_raw / 8.0
               ELSE (s.weight_raw / 8.0) * (1.0 + s.reps / 30.0)
           END AS e1rm_kg
    INTO   v_best_e1rm
    FROM   sets s
    WHERE  s.user_id     = NEW.user_id
      AND  s.exercise_id = NEW.exercise_id
      AND  s.kind        = 'lift'
      AND  s.reps       >= 1
    ORDER  BY
           CASE
               WHEN s.reps = 1 THEN s.weight_raw / 8.0
               ELSE (s.weight_raw / 8.0) * (1.0 + s.reps / 30.0)
           END DESC,
           s.logged_at ASC
    LIMIT  1;

    IF FOUND THEN
        INSERT INTO exercise_prs
               (user_id, exercise_id, rep_count, weight_kg, set_id, achieved_at)
        VALUES (NEW.user_id, NEW.exercise_id, 0,
                v_best_e1rm.e1rm_kg, v_best_e1rm.id, v_best_e1rm.logged_at)
        ON CONFLICT (user_id, exercise_id, rep_count) DO UPDATE
            SET weight_kg   = EXCLUDED.weight_kg,
                set_id      = EXCLUDED.set_id,
                achieved_at = EXCLUDED.achieved_at,
                updated_at  = NOW();
    ELSE
        DELETE FROM exercise_prs
        WHERE  user_id     = NEW.user_id
          AND  exercise_id = NEW.exercise_id
          AND  rep_count   = 0;
    END IF;

    RETURN NEW;
END;
$$;

-- Register the UPDATE trigger
DROP TRIGGER IF EXISTS trg_exercise_prs_recompute_on_update ON sets;
CREATE TRIGGER trg_exercise_prs_recompute_on_update
    AFTER UPDATE OF weight_raw, reps ON sets
    FOR EACH ROW
    EXECUTE FUNCTION recompute_exercise_pr_after_set_update();


-- ===========================================================================
-- SUMMARY
-- ───────
-- 3 new functions:
--   recompute_exercise_pr_after_set_delete()  — AFTER DELETE trigger handler
--   _recompute_pr_bucket(user, exercise, reps) — shared helper (SECURITY DEFINER)
--   recompute_exercise_pr_after_set_update()  — AFTER UPDATE trigger handler
--
-- 2 new triggers on the `sets` table:
--   trg_exercise_prs_recompute_on_delete  — fires AFTER DELETE FOR EACH ROW
--   trg_exercise_prs_recompute_on_update  — fires AFTER UPDATE OF weight_raw, reps
--
-- Closes Y-03: stale exercise_prs rows on set-delete and downward weight/rep edit.
-- All functions are SECURITY DEFINER to bypass RLS in the trigger context.
-- No changes to existing tables, indexes, or policies.
-- ===========================================================================
