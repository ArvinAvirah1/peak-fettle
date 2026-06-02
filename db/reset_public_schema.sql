-- =============================================================================
-- db/reset_public_schema.sql — RESET THE EXISTING SUPABASE PROJECT IN PLACE
-- =============================================================================
--
-- Use this to replace the current (drifted, non-functional) schema on the
-- EXISTING Supabase project WITHOUT creating a new project. Same project →
-- same SUPABASE_DB_URL, same API keys, same server .env. Zero reconfiguration.
--
-- ⚠️  DESTRUCTIVE: this DROPS every table, view, function, and row in the
--     `public` schema. Only run it because there is NO user data worth keeping
--     (founder confirmed 2026-06-01: nothing worked but sign-in).
--     It does NOT touch Supabase's `auth`, `storage`, or `extensions` schemas.
--
-- HOW TO USE (Supabase SQL editor, on the existing project):
--   STEP 1 — paste and run THIS file (resets `public` + restores default grants).
--   STEP 2 — paste and run `db/schema.sql` (rebuilds the whole schema + seed).
--   Done. No app/env changes needed.
-- =============================================================================

-- 1. Wipe and recreate the public schema.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- 2. Restore Supabase's default privileges on the fresh public schema, so the
--    auto-generated REST API + the anon/authenticated/service_role roles work.
--    (The app itself connects via the direct Postgres URL / service role and
--    bypasses RLS, but these grants keep everything else behaving normally.)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL   ON SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES    TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- 3. (Optional safety) ensure the schema is owned by postgres.
ALTER SCHEMA public OWNER TO postgres;

-- =============================================================================
-- ▶ NOW RUN db/schema.sql IN THE SAME SQL EDITOR.
-- =============================================================================
