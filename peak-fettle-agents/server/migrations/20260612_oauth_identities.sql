-- 20260612 — TICKET-099: oauth_identities table
--
-- One row per (user, provider) identity from Apple or Google sign-in.
-- The user_id FK links back to the users row created or located by
-- POST /auth/oauth. A user may have both an apple and a google identity.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS; UNIQUE constraint prevents
-- duplicate (provider, provider_sub) pairs on repeated runs.

CREATE TABLE IF NOT EXISTS oauth_identities (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider     TEXT        NOT NULL CHECK (provider IN ('apple', 'google')),
    provider_sub TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (provider, provider_sub)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_user
    ON oauth_identities (user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_provider_sub
    ON oauth_identities (provider, provider_sub);
