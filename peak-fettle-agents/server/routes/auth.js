// /auth — signup, login, refresh, logout
// dev-backend — 2026-04-30
// T-02 (2026-05-02): refresh token revocation — store SHA-256 hash on issue,
//   validate against DB on /refresh, DELETE on /logout.
//   Migration: migrations/20260502_refresh_token_revocation.sql

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { pool } = require('../db');
const { verifyOAuthIdToken } = require('../lib/oauthVerify'); // TICKET-099

const router = express.Router();

const SignupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    displayName: z.string().min(1).max(64).optional(),
});

const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

const USER_PROFILE_SELECT = `
    id,
    email,
    display_name,
    tier,
    (tier = 'paid') AS is_paid,
    unit_pref,
    score_pref,
    experience_level,
    weight_class_kg,
    sex,
    CASE
        WHEN birth_date IS NULL THEN NULL
        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 18 THEN 'under-18'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 25 THEN '18-24'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 35 THEN '25-34'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 45 THEN '35-44'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 55 THEN '45-54'
        ELSE '55+'
    END AS age_band`;

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/** SHA-256 hash of a raw refresh token — stored in DB, never the raw token. */
function hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Issue a new access + refresh token pair.
 * Stores the refresh token hash in the refresh_tokens table.
 * Refresh tokens expire in 30 days (matching the JWT expiresIn).
 */
async function issueTokens(user) {
    const accessToken = jwt.sign(
        { sub: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
        { sub: user.id, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );

    // Persist hash so logout can revoke it.
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (token_hash) DO NOTHING`,
        [user.id, hashToken(refreshToken), expiresAt]
    );

    return { accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------
router.post('/signup', async (req, res, next) => {
    try {
        const { email, password, displayName } = SignupSchema.parse(req.body);
        const passwordHash = await bcrypt.hash(password, 12);
        const { rows } = await pool.query(
            `INSERT INTO users (email, password_hash, display_name)
             VALUES ($1, $2, $3)
             RETURNING ${USER_PROFILE_SELECT}`,
            [email, passwordHash, displayName || null]
        );
        const user = rows[0];
        const tokens = await issueTokens(user);
        res.status(201).json({ user, ...tokens });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = LoginSchema.parse(req.body);
        const { rows } = await pool.query(
            `SELECT ${USER_PROFILE_SELECT}, password_hash
             FROM users WHERE email = $1 AND deleted_at IS NULL`,
            [email]
        );
        const user = rows[0];
        if (!user) return res.status(401).json({ error: 'invalid_credentials' });

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

        const tokens = await issueTokens(user);
        delete user.password_hash;
        res.json({ user, ...tokens });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------
// Validates the refresh token against the revocation list, then rotates:
// issues a new pair, deletes the old hash, so each refresh token is
// single-use (token rotation hardening).
router.post('/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = req.body || {};
        if (!refreshToken) return res.status(400).json({ error: 'missing_refresh_token' });

        // Verify JWT signature and type before hitting the DB.
        const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
        if (payload.type !== 'refresh') {
            return res.status(401).json({ error: 'invalid_token' });
        }

        // T-02: verify the token hash is in the active-tokens list.
        const hash = hashToken(refreshToken);
        const { rows: tokenRows } = await pool.query(
            `DELETE FROM refresh_tokens
             WHERE token_hash = $1
               AND user_id    = $2
               AND expires_at > NOW()
             RETURNING user_id`,
            [hash, payload.sub]
        );
        if (tokenRows.length === 0) {
            // Token was already used, revoked, or expired.
            return res.status(401).json({ error: 'invalid_token' });
        }

        const { rows: userRows } = await pool.query(
            `SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL`,
            [payload.sub]
        );
        if (!userRows[0]) return res.status(401).json({ error: 'invalid_token' });

        // Issue a new rotated pair.
        const tokens = await issueTokens(userRows[0]);
        res.json(tokens);
    } catch (_err) {
        return res.status(401).json({ error: 'invalid_token' });
    }
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
// T-02: revoke the supplied refresh token immediately.
// The client should discard both the access token and the refresh token
// after calling this endpoint. The access token will expire naturally (15 min).
router.post('/logout', async (req, res, next) => {
    try {
        const { refreshToken } = req.body || {};
        if (!refreshToken) {
            // No token supplied — treat as already logged out.
            return res.status(204).end();
        }

        // We don't need to verify the JWT signature here — if it's syntactically
        // invalid it was never stored in our table, so the DELETE is a no-op.
        // We hash it and delete it either way (prevents timing oracle).
        let hash;
        try {
            hash = hashToken(refreshToken);
        } catch (_) {
            return res.status(204).end();
        }

        await pool.query(
            `DELETE FROM refresh_tokens WHERE token_hash = $1`,
            [hash]
        );

        res.status(204).end();
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /auth/oauth — Sign in with Apple / Google (TICKET-099)
// ---------------------------------------------------------------------------
// Verifies the provider id_token server-side (lib/oauthVerify), then find-or-
// creates the user by verified email and issues the SAME session/refresh pair as
// password login. INERT until GOOGLE_OAUTH_AUDIENCE / APPLE_OAUTH_AUDIENCE are
// configured (returns 501), so shipping it changes nothing until credentials are
// added + a dev/EAS build wires the client buttons.
const OAuthSchema = z.object({
    provider: z.enum(['google', 'apple']),
    idToken: z.string().min(10),
});

router.post('/oauth', async (req, res, next) => {
    try {
        const { provider, idToken } = OAuthSchema.parse(req.body);

        let claims;
        try {
            claims = await verifyOAuthIdToken(provider, idToken);
        } catch (err) {
            if (err.code === 'not_configured') {
                return res.status(501).json({ error: 'oauth_not_configured' });
            }
            return res.status(401).json({ error: 'invalid_provider_token' });
        }

        const email = (claims.email || '').toLowerCase();
        if (!email) return res.status(400).json({ error: 'provider_no_email' });

        // Find-or-create by verified email. NOTE: a dedicated oauth_identities
        // table mapping provider `sub` -> account is the proper long-term store
        // (and the account-linking follow-up that TICKET-099 scopes OUT). That
        // needs its own migration + review before it ships.
        let { rows } = await pool.query(
            `SELECT ${USER_PROFILE_SELECT} FROM users WHERE email = $1 AND deleted_at IS NULL`,
            [email]
        );
        let user = rows[0];
        let isNew = false;

        if (!user) {
            // OAuth accounts have no usable password: store a random hash so the
            // NOT-NULL column is satisfied and password login is impossible.
            const randomHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
            const displayName = claims.name || email.split('@')[0];
            const created = await pool.query(
                `INSERT INTO users (email, password_hash, display_name)
                 VALUES ($1, $2, $3)
                 RETURNING ${USER_PROFILE_SELECT}`,
                [email, randomHash, displayName]
            );
            user = created.rows[0];
            isNew = true;
        }

        const tokens = await issueTokens(user);
        res.json({ user, isNew, ...tokens });
    } catch (err) { next(err); }
});

module.exports = router;
