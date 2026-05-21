-- Phase 1.5: session-count paywall trigger
-- Adds a timestamp column to track when a user first hits the free-tier session limit.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS paywall_triggered_at TIMESTAMPTZ;

COMMENT ON COLUMN users.paywall_triggered_at IS
  'Timestamp when the free-tier session limit (5 sessions) was first reached. '
  'NULL = user has not yet hit the limit. Set once, never cleared. '
  'Frontend gates upgrade prompt on this value being non-null.';
