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

// jwt-secret-no-startup-guard (2026-06-14): fail loud at module load if the
// secret is absent.  jwt.sign/verify both silently accept undefined as the
// secret, making every token trivially forgeable.  Unlike SUPABASE_URL which
// throws in supabaseAdmin.js, JWT_SECRET has no other guard — add it here.
if (!process.env.JWT_SECRET) {
    console.error('[peak-fettle-api] FATAL: JWT_SECRET env var must be set.');
    process.exit(1);
}

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
 * Derive a human-friendly display name from an email's local-part, or return
 * null when the local-part is an opaque/random handle that should NOT be shown
 * as a name (e.g. Apple "Hide My Email" relay addresses).
 *
 * Heuristic — treat as opaque (→ null) when the local-part:
 *   • belongs to a known private-relay domain (appleid relay, gmail privaterelay), OR
 *   • has no separators (., _, -, +) AND mixes letters+digits AND is long (≥8),
 *     which is the shape of a generated token like "64t9tvkymn" — while still
 *     accepting normal handles like "arvin", "arvin.avirah", "john_doe", "jdoe23".
 */
function deriveDisplayNameFromEmail(email) {
    const at = String(email || '').indexOf('@');
    if (at <= 0) return null;
    const local = email.slice(0, at);
    const domain = email.slice(at + 1).toLowerCase();

    // Known opaque relay domains → always treat the local-part as a random token.
    if (/(?:^|\.)privaterelay\.appleid\.com$/.test(domain) ||
        /(?:^|\.)privaterelay\.gmail\.com$/.test(domain)) {
        return null;
    }

    const hasSeparator = /[._+\-]/.test(local);
    const hasLetter = /[a-z]/i.test(local);
    const hasDigit = /\d/.test(local);
    // Long, separator-less, letter+digit mash → looks generated (e.g. 64t9tvkymn).
    if (!hasSeparator && hasLetter && hasDigit && local.length >= 8) {
        return null;
    }
    return local;
}

// ---------------------------------------------------------------------------
// refresh-rotation-race grace window (AUTH-RELIABILITY, 2026-06-19)
//
// Single-use rotation means /refresh DELETEs the presented token and issues a
// fresh pair. But the client legitimately fires /refresh from TWO places that
// can race with the SAME stored token within a few hundred ms:
//   • AuthContext cold-start bootstrap (silent refresh), and
//   • the apiClient 401 interceptor (a Pro data call that went out before the
//     bootstrap had set the in-memory access token).
// Whichever hits the DELETE first wins; the loser found 0 rows and got a 401,
// which tripped the client's onLogout → the refresh token was WIPED → the user
// was forced to sign in on the NEXT launch. This was the #1 forced-relogin bug.
//
// Fix: when a token is successfully rotated, remember its hash -> the freshly
// issued pair for a short grace window. If the SAME token is presented again
// inside that window (the racing caller), replay the SAME new pair instead of
// 401ing. This keeps rotation single-use against attackers (a token reused
// AFTER the window, or a *different* already-rotated token, still 401s) while
// making the two concurrent honest callers converge on one pair.
//
// In-memory only (no schema change — drift-tolerant per CLAUDE.md). A replay is
// only useful for a few seconds anyway; a multi-instance deployment just means
// the racing call falls through to the normal 401 → the client's bootstrap path
// still holds the session via the cached user, so this degrades safely.
// ---------------------------------------------------------------------------
const ROTATION_GRACE_MS = 30 * 1000;
const _recentlyRotated = new Map(); // tokenHash -> { tokens, at }

function _rememberRotation(oldHash, tokens) {
    _recentlyRotated.set(oldHash, { tokens, at: Date.now() });
    // Opportunistic prune so the map can't grow unbounded.
    if (_recentlyRotated.size > 5000) {
        const cutoff = Date.now() - ROTATION_GRACE_MS;
        for (const [k, v] of _recentlyRotated) {
            if (v.at < cutoff) _recentlyRotated.delete(k);
        }
    }
}

function _replayRotation(oldHash) {
    const hit = _recentlyRotated.get(oldHash);
    if (!hit) return null;
    if (Date.now() - hit.at > ROTATION_GRACE_MS) {
        _recentlyRotated.delete(oldHash);
        return null;
    }
    return hit.tokens;
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
    // jti: a random unique id so two refresh tokens minted for the same user in
    // the same second are NOT byte-identical. Without it, the payload
    // {sub,type,iat,exp} collides → identical SHA-256 → the ON CONFLICT below
    // silently dropped the second insert, leaving a freshly-issued token whose
    // hash was never stored (instant invalid_token on its first use).
    const refreshToken = jwt.sign(
        { sub: user.id, type: 'refresh', jti: crypto.randomBytes(16).toString('hex') },
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
        const payload = jwt.verify(refreshToken, process.env.JWT_SECRET, { algorithms: ['HS256'] }); // SRV-AUTH-03
        if (payload.type !== 'refresh') {
            return res.status(401).json({ error: 'invalid_token' });
        }

        // T-02: verify the token hash is in the active-tokens list and rotate
        // it (single-use). The DELETE…RETURNING atomically consumes the token —
        // exactly one concurrent caller can win.
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
            // We didn't win the DELETE. Two honest cases land here:
            //   1. This exact token was rotated moments ago by the racing caller
            //      (bootstrap vs 401 interceptor). Replay the pair we issued for
            //      it so both callers converge instead of forcing a re-login.
            //   2. Genuinely already-used / revoked / expired token → 401.
            const replay = _replayRotation(hash);
            if (replay) {
                return res.json(replay);
            }
            return res.status(401).json({ error: 'invalid_token' });
        }

        const { rows: userRows } = await pool.query(
            `SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL`,
            [payload.sub]
        );
        if (!userRows[0]) return res.status(401).json({ error: 'invalid_token' });

        // Issue a new rotated pair and remember it against the just-consumed
        // token hash, so a racing duplicate of THIS request (the other honest
        // caller) replays the same pair within the grace window.
        const tokens = await issueTokens(userRows[0]);
        _rememberRotation(hash, tokens);
        res.json(tokens);
    } catch (err) {
        // INVARIANT 5 (AUTH-RELIABILITY, 2026-06-19): a 401 is a *definitive*
        // auth failure to the client and makes it WIPE the refresh token →
        // forced re-login. Only genuine bad-token cases may return 401.
        // jsonwebtoken throws TokenExpiredError / JsonWebTokenError /
        // NotBeforeError (all subclasses of JsonWebTokenError) for a bad,
        // expired, or malformed token — those are real auth failures → 401.
        if (err instanceof jwt.JsonWebTokenError ||
            err instanceof jwt.TokenExpiredError ||
            err instanceof jwt.NotBeforeError) {
            return res.status(401).json({ error: 'invalid_token' });
        }
        // Everything else (DB outage, pool timeout, unexpected exception) is
        // TRANSIENT — delegate to the app error handler (→ 500) so the client
        // keeps the session and retries, instead of being logged out.
        return next(err);
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
        // Explicit logout must also drop any grace-window replay for this token
        // so it can't be revived after the user signed out.
        _recentlyRotated.delete(hash);

        res.status(204).end();
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /auth/oauth — Sign in with Apple / Google (TICKET-099, relay-aware 2026-07-07)
// ---------------------------------------------------------------------------
// Verifies the provider id_token server-side (lib/oauthVerify), then resolves
// the account and issues the SAME session/refresh pair as password login.
// INERT until GOOGLE_OAUTH_AUDIENCE / APPLE_OAUTH_AUDIENCE are configured
// (returns 501), so shipping it changes nothing until credentials are added.
//
// Resolution order (Hide My Email fix):
//   1. oauth_identities by (provider, sub) — the provider's stable subject id.
//      This is the ONLY match that works for Apple "Hide My Email" users after
//      their first sign-in, because the relay email never equals the email on
//      an account created by password/Google.
//   2. users by the token's verified email — legacy path; on a hit the
//      identity row is backfilled so step 1 wins next time.
//   3. No account: for a private-relay email, do NOT auto-create. The person
//      very likely owns an existing account under their real email (that is
//      the founder's Pro-account lockout), and a silently created shadow
//      account strands them. Return 409 private_relay_no_account so the client
//      can offer "link existing account" (POST /auth/oauth/link) or retry with
//      intent:'create'. Non-relay emails keep the create-on-first-sign-in flow.
const OAuthSchema = z.object({
    provider: z.enum(['google', 'apple']),
    idToken: z.string().min(10),
    // 'create' = caller confirmed a brand-new account is wanted even though the
    // provider email is a private relay that matches nothing.
    intent: z.enum(['create']).optional(),
});

const PRIVATE_RELAY_RE = /@privaterelay\.appleid\.com$/i;

/** users row for a linked provider identity, or null (incl. when the
 *  oauth_identities table has not been migrated yet — drift-tolerant). */
async function findUserByOAuthIdentity(provider, sub) {
    try {
        const { rows } = await pool.query(
            `SELECT ${USER_PROFILE_SELECT} FROM users
             WHERE id = (SELECT user_id FROM oauth_identities
                         WHERE provider = $1 AND provider_sub = $2)
               AND deleted_at IS NULL`,
            [provider, sub]
        );
        return rows[0] || null;
    } catch (err) {
        if (err.code === '42P01') return null; // table missing on prod — degrade
        throw err;
    }
}

/**
 * Record provider identity -> user. `reassign` re-points an existing mapping
 * (used by /oauth/link, where the caller just proved BOTH the provider identity
 * AND the target account's password — e.g. rescuing a sub that got attached to
 * an accidental shadow account). Returns false when the table is missing.
 */
async function linkOAuthIdentity(userId, provider, sub, { reassign = false } = {}) {
    const conflictAction = reassign
        ? 'DO UPDATE SET user_id = EXCLUDED.user_id'
        : 'DO NOTHING';
    try {
        await pool.query(
            `INSERT INTO oauth_identities (user_id, provider, provider_sub)
             VALUES ($1, $2, $3)
             ON CONFLICT (provider, provider_sub) ${conflictAction}`,
            [userId, provider, sub]
        );
        return true;
    } catch (err) {
        if (err.code === '42P01') return false; // table missing on prod — degrade
        throw err;
    }
}

router.post('/oauth', async (req, res, next) => {
    try {
        const { provider, idToken, intent } = OAuthSchema.parse(req.body);

        let claims;
        try {
            claims = await verifyOAuthIdToken(provider, idToken);
        } catch (err) {
            if (err.code === 'not_configured') {
                return res.status(501).json({ error: 'oauth_not_configured' });
            }
            return res.status(401).json({ error: 'invalid_provider_token' });
        }

        // 1. Linked identity — works regardless of what email the token carries.
        const linkedUser = await findUserByOAuthIdentity(provider, claims.sub);
        if (linkedUser) {
            const tokens = await issueTokens(linkedUser);
            return res.json({ user: linkedUser, isNew: false, ...tokens });
        }

        const email = (claims.email || '').toLowerCase();
        if (!email) return res.status(400).json({ error: 'provider_no_email' });

        // SRV-AUTH-02: never find-or-create on an UNVERIFIED provider email. An
        // attacker holding a token whose email is unverified could otherwise take
        // over an existing account that owns that same email address.
        if (!claims.emailVerified) {
            return res.status(401).json({ error: 'provider_email_not_verified' });
        }

        const isPrivateRelay = claims.isPrivateEmail === true || PRIVATE_RELAY_RE.test(email);

        // 2. Email match — backfill the identity link so future sign-ins use it.
        const { rows } = await pool.query(
            `SELECT ${USER_PROFILE_SELECT} FROM users WHERE email = $1 AND deleted_at IS NULL`,
            [email]
        );
        let user = rows[0];
        let isNew = false;

        if (!user) {
            // 3. No account for this identity.
            if (isPrivateRelay && intent !== 'create') {
                return res.status(409).json({
                    error: 'private_relay_no_account',
                    message:
                        'This Apple ID hides its email, so it cannot be matched to an ' +
                        'existing account automatically. Link it by signing in once ' +
                        'with email + password (POST /auth/oauth/link), or retry with ' +
                        "intent:'create' to start a new account.",
                });
            }
            // OAuth accounts have no usable password: store a random hash so the
            // NOT-NULL column is satisfied and password login is impossible.
            const randomHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
            // display_name: prefer the provider's real name. Otherwise derive a
            // sensible default from the email local-part — BUT never store an
            // opaque random token. Apple "Hide My Email" addresses look like
            // 64t9tvkymn@privaterelay.appleid.com, whose local-part is a random
            // handle; using it verbatim is exactly the "64t9tvkymn" greeting bug.
            // For those, store NULL and let the client onboarding ask for a name
            // (greeting falls back to "there" until then).
            const displayName = claims.name || deriveDisplayNameFromEmail(email);
            const created = await pool.query(
                `INSERT INTO users (email, password_hash, display_name)
                 VALUES ($1, $2, $3)
                 RETURNING ${USER_PROFILE_SELECT}`,
                [email, randomHash, displayName]
            );
            user = created.rows[0];
            isNew = true;
        }

        await linkOAuthIdentity(user.id, provider, claims.sub);

        const tokens = await issueTokens(user);
        res.json({ user, isNew, ...tokens });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /auth/oauth/link — attach a provider identity to an EXISTING account
// ---------------------------------------------------------------------------
// The Hide My Email escape hatch: the client holds a fresh provider id_token
// whose (relay) email matched no account, and the person also supplies their
// Peak Fettle email + password. Both proofs verified => write the
// (provider, sub) -> user mapping and sign them in. From then on plain
// Sign in with Apple resolves via the identity row.
const OAuthLinkSchema = z.object({
    provider: z.enum(['google', 'apple']),
    idToken: z.string().min(10),
    email: z.string().email(),
    password: z.string().min(1),
});

router.post('/oauth/link', async (req, res, next) => {
    try {
        const { provider, idToken, email, password } = OAuthLinkSchema.parse(req.body);

        let claims;
        try {
            claims = await verifyOAuthIdToken(provider, idToken);
        } catch (err) {
            if (err.code === 'not_configured') {
                return res.status(501).json({ error: 'oauth_not_configured' });
            }
            return res.status(401).json({ error: 'invalid_provider_token' });
        }

        // Password proof of the target account — identical to /auth/login.
        const { rows } = await pool.query(
            `SELECT ${USER_PROFILE_SELECT}, password_hash
             FROM users WHERE email = $1 AND deleted_at IS NULL`,
            [email]
        );
        const user = rows[0];
        if (!user) return res.status(401).json({ error: 'invalid_credentials' });
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
        delete user.password_hash;

        // reassign: password + provider-token proof together authorize moving the
        // mapping off a previously-created shadow account onto this one.
        const linked = await linkOAuthIdentity(user.id, provider, claims.sub, { reassign: true });
        if (!linked) {
            // oauth_identities not migrated on this DB — nothing to persist, so
            // the link would silently not stick. Tell the client honestly.
            return res.status(501).json({ error: 'oauth_linking_unavailable' });
        }

        const tokens = await issueTokens(user);
        res.json({ user, isNew: false, linked: true, ...tokens });
    } catch (err) { next(err); }
});

module.exports = router;
