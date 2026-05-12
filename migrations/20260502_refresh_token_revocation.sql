-- Peak Fettle — Refresh token revocation table
-- Author: dev-backend
-- Date: 2026-05-02
-- Ticket: T-02 (DEV_ROADMAP_2026-05-02.md §B-0)
--
-- Problem: Without a revocation list, stolen refresh tokens are valid for 30 days.
-- Solution: Store a SHA-256 hash of each issued refresh token.
--   - On /auth/refresh: verify hash exists and is not expired; rotate token.
--   - On /auth/logout: DELETE the row (token revoked immediately).
--
-- Why hash, not plaintext?
--   If this table is ever read by an attacker, raw tokens would let them impersonate
--   users. A SHA-256 hash is one-way — the original token cannot be recovered from it.
--
-- Cleanup: a cron job (or Supabase scheduled function) should periodically DELETE
-- rows WHERE expires_at < NOW() to prevent unbounded table growth.

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,   -- SHA-256(rawToken), hex-encoded
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash    ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- Cleanup function: called by a weekly cron to prune expired rows.
CREATE OR REPLACE FUNCTION prune_expired_refresh_tokens()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM refresh_tokens WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
