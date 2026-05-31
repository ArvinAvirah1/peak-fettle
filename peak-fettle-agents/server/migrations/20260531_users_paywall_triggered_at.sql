-- 20260531_users_paywall_triggered_at.sql
-- GAP found via full prod-schema audit (2026-05-31):
-- routes/workouts.js (POST /workouts paywall block) does
--   SELECT paywall_triggered_at FROM users ...
--   UPDATE users SET paywall_triggered_at = NOW() ...
-- but the users table has no paywall_triggered_at column. The block is a
-- fire-and-forget IIFE with its own try/catch (logs "[paywall-trigger] error
-- (non-fatal)"), so it does NOT 500 the request -- but the session-count paywall
-- trigger is silently broken (never persists, never enqueues the upgrade push).
--
-- Nullable timestamp: NULL = never triggered; set once to NOW(), never cleared.
-- Idempotent. Apply in the Supabase SQL Editor.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS paywall_triggered_at TIMESTAMPTZ;
