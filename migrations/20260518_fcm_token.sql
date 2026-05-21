-- migrations/20260518_fcm_token.sql
-- Adds fcm_token to users for FCM push dispatch (TICKET-024 mobile registers tokens).
-- push-dispatcher.js cron reads this column to look up device tokens.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS fcm_token TEXT;

COMMENT ON COLUMN users.fcm_token
    IS 'FCM device registration token. Written by mobile after push permission granted '
       '(PATCH /user/profile {fcm_token}). Cleared by push-dispatcher on NotRegistered error. '
       'NULL = user has not granted push permission or token is stale.';

-- Index for the dispatcher JOIN: users WHERE fcm_token IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_users_fcm_token_not_null
    ON users (id)
    WHERE fcm_token IS NOT NULL AND fcm_token <> '';
