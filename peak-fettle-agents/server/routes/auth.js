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
             RETURNING id, email, display_name, tier, is_paid, unit_pref, score_pref,
                       experience_level, weight_class_kg, sex, age_band`,
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
            `SELECT id, email, display_name, password_hash, tier, is_paid, unit_pref, score_pref,
                    experience_level, weight_class_kg, sex, age_band
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

module.exports = router;
