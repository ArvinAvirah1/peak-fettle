-- migrations/20260518_notification_prefs.sql
-- Adds per-user notification preference flags.
-- streak_notifications_enabled: opt-out of streak milestone pushes (default ON).
-- plan_notifications_enabled: opt-out of plan-ready pushes (default ON).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS streak_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS plan_notifications_enabled   BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN users.streak_notifications_enabled
    IS 'When FALSE, push-dispatcher skips streak_milestone notifications for this user.';
COMMENT ON COLUMN users.plan_notifications_enabled
    IS 'When FALSE, push-dispatcher skips plan_ready notifications for this user.';
