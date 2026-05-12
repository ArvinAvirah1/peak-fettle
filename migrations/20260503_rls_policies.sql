-- migrations/20260503_rls_policies.sql
-- Phase: D (RLS completeness pass)
-- Author: dev-database
-- Date: 2026-05-03
--
-- PURPOSE
-- -------
-- Fills the RLS gaps left by earlier migration files.
-- All prior table-specific migrations (20260430_initial_schema.sql,
-- 20260502_percentile_engine.sql, 20260502_refresh_token_revocation.sql, etc.)
-- already enable RLS and define policies on user-scoped tables.
-- This migration covers the two tables that were missed:
--
--   user_percentile_rankings  — users should read only their own ranking rows
--   refresh_tokens            — users should read/delete only their own tokens
--
-- It also enables RLS on the four global read-only tables and adds a
-- permissive SELECT policy to each.  This is defence-in-depth: those tables
-- hold no user-private data, but enabling RLS now prevents any accidental
-- write policy being added later without review.
--
--   exercises        — global library; any authenticated user can read
--   exercise_aliases — same
--   percentile_vectors — batch distribution data; any authenticated user can read
--   lift_vectors     — model coefficients; any authenticated user can read
--
-- cosmetic_items is deliberately omitted: cosmetics.sql documents that it is
-- intentionally public (no RLS) so the unauthenticated shop preview works.
-- Revisit at Phase E if anonymous browsing policy changes.
--
-- !!  WRITE-GUARD for cosmetic_items  !!
-- DO NOT add INSERT / UPDATE / DELETE policies to cosmetic_items here or in
-- any future migration without a security review. The absence of write RLS is
-- intentional: all catalog mutations go through the service role. Adding a
-- write policy — even FOR SELECT — could allow users to flip is_default = TRUE
-- on paid items, granting free access to premium cosmetics.
-- See 20260503_cosmetics.sql for the full rationale.
--
-- All statements use DROP POLICY IF EXISTS before CREATE POLICY so this
-- migration is safe to re-run (idempotent).
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. user_percentile_rankings
-- ===========================================================================
-- Cron job writes (INSERT / UPDATE) via the service role — no client write
-- policy is needed or desirable.
-- Users may only read their own ranking rows.
-- ---------------------------------------------------------------------------
ALTER TABLE user_percentile_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "percentile_rankings_self_select" ON user_percentile_rankings;
CREATE POLICY "percentile_rankings_self_select" ON user_percentile_rankings
    FOR SELECT
    USING (auth.uid() = user_id);


-- ===========================================================================
-- 2. refresh_tokens
-- ===========================================================================
-- Token issuance (INSERT) is done by the auth service layer via the service
-- role — no client INSERT policy.
-- Users may SELECT their own tokens (for active-session display, if ever
-- surfaced) and DELETE their own token on logout.
-- The /auth/refresh endpoint operates via the service role and is unaffected
-- by client-tier policies.
-- ---------------------------------------------------------------------------
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refresh_tokens_self_select" ON refresh_tokens;
CREATE POLICY "refresh_tokens_self_select" ON refresh_tokens
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "refresh_tokens_self_delete" ON refresh_tokens;
CREATE POLICY "refresh_tokens_self_delete" ON refresh_tokens
    FOR DELETE
    USING (auth.uid() = user_id);


-- ===========================================================================
-- 3. exercises  (global read-only, defence-in-depth)
-- ===========================================================================
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercises_public_read" ON exercises;
CREATE POLICY "exercises_public_read" ON exercises
    FOR SELECT
    USING (TRUE);

-- No INSERT / UPDATE / DELETE policies for authenticated clients.
-- All writes come through the service role (seeding + admin tooling).


-- ===========================================================================
-- 4. exercise_aliases  (global read-only, defence-in-depth)
-- ===========================================================================
ALTER TABLE exercise_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercise_aliases_public_read" ON exercise_aliases;
CREATE POLICY "exercise_aliases_public_read" ON exercise_aliases
    FOR SELECT
    USING (TRUE);


-- ===========================================================================
-- 5. percentile_vectors  (global read-only, defence-in-depth)
-- ===========================================================================
-- Batch-computed distribution data; holds no user PII.
-- Any authenticated client may read; writes are service-role only.
-- ---------------------------------------------------------------------------
ALTER TABLE percentile_vectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "percentile_vectors_public_read" ON percentile_vectors;
CREATE POLICY "percentile_vectors_public_read" ON percentile_vectors
    FOR SELECT
    USING (TRUE);


-- ===========================================================================
-- 6. lift_vectors  (global read-only, defence-in-depth)
-- ===========================================================================
-- Model coefficients; holds no user PII.
-- Any authenticated client may read (needed by the mobile app to display
-- lift descriptions and inheritance info); writes are service-role only.
-- ---------------------------------------------------------------------------
ALTER TABLE lift_vectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lift_vectors_public_read" ON lift_vectors;
CREATE POLICY "lift_vectors_public_read" ON lift_vectors
    FOR SELECT
    USING (TRUE);


-- ===========================================================================
-- SUMMARY
-- 6 tables touched:
--   user_percentile_rankings  — RLS enabled; 1 policy (self SELECT)
--   refresh_tokens            — RLS enabled; 2 policies (self SELECT, self DELETE)
--   exercises                 — RLS enabled; 1 policy (public SELECT)
--   exercise_aliases          — RLS enabled; 1 policy (public SELECT)
--   percentile_vectors        — RLS enabled; 1 policy (public SELECT)
--   lift_vectors              — RLS enabled; 1 policy (public SELECT)
--
-- Tables explicitly NOT touched (already handled in prior migrations):
--   users, workouts, sets, plans, streaks, streak_overrides,
--   daily_health_log, habits, user_weekly_goals, groups,
--   group_memberships, group_week_evaluations, credit_ledger,
--   user_cosmetics, user_equipped_cosmetics
--
-- Tables explicitly NOT touched (intentional no-RLS design):
--   cosmetic_items  — public catalog; anonymous shop preview requires it;
--                     see cosmetics.sql for rationale.
-- ===========================================================================
