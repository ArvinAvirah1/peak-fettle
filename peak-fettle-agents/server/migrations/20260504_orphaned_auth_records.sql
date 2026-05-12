-- Migration: 20260504_orphaned_auth_records
-- Cleanup table for Supabase auth records that failed to delete via the admin
-- API after the corresponding DB rows were already removed (TICKET-030).
--
-- A cleanup cron job should periodically:
--   1. SELECT auth_uid FROM orphaned_auth_records WHERE resolved_at IS NULL
--   2. Call supabaseAdmin.auth.admin.deleteUser(auth_uid) for each row
--   3. UPDATE orphaned_auth_records SET resolved_at = NOW() on success
--
-- The cron is the belt-and-suspenders guarantee referenced in TICKET-030.

CREATE TABLE IF NOT EXISTS orphaned_auth_records (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_uid    UUID        NOT NULL,
    -- Human-readable error from the failed deleteUser() call.
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Set by the cleanup cron once deleteUser() succeeds on retry.
    resolved_at TIMESTAMPTZ
);

-- Only the service role / backend can write to this table.
-- RLS: no SELECT / INSERT / UPDATE / DELETE for authenticated or anon users.
ALTER TABLE orphaned_auth_records ENABLE ROW LEVEL SECURITY;
-- No policies = deny all for normal roles. The service role bypasses RLS
-- entirely (Supabase default), so the backend can still insert rows.

-- Index for the cron query (unresolved orphans only).
CREATE INDEX IF NOT EXISTS idx_orphaned_auth_records_unresolved
    ON orphaned_auth_records (created_at)
    WHERE resolved_at IS NULL;
