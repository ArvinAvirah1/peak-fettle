// /revenuecat + /purchases — RevenueCat billing integration (2026-08-01)
//
// Two routers:
//
//   webhookRouter  (mounted PUBLIC at /revenuecat — auth is the shared secret)
//     POST /revenuecat/webhook — RevenueCat server-to-server event receiver.
//       • Verifies the Authorization header against REVENUECAT_WEBHOOK_AUTH
//         (the exact value the founder pastes into the RevenueCat webhook
//         config; a "Bearer <secret>" form is also accepted). If the env var
//         is UNSET the webhook logs a warning and ACCEPTS — deliberate
//         bootstrap behaviour so events aren't dropped before ops wiring, but
//         the secret must be set in production.
//       • Entitlement-driving events (INITIAL_PURCHASE, RENEWAL,
//         UNCANCELLATION, PRODUCT_CHANGE) → users.tier = 'paid'.
//         EXPIRATION → users.tier = 'free' (comped users are NEVER
//         downgraded — comp_pro guard, drift-tolerant).
//         CANCELLATION (auto-renew off, still entitled until period end) →
//         deliberately NO tier change. Everything else is logged and ignored.
//       • app_user_id is the Peak Fettle users.id UUID — the mobile app calls
//         Purchases.logIn(user.id) with exactly that id. RevenueCat may also
//         send its own $RCAnonymousID:* ids in the alias list; we pick the
//         first UUID-shaped candidate.
//       • ALWAYS answers 200 fast (RevenueCat retries on non-2xx; a permanent
//         processing error must not cause an endless retry storm) — except
//         the 401 secret mismatch, which SHOULD retry after ops fixes config.
//
//   purchasesRouter (mounted at /purchases behind requireAuth)
//     POST /purchases/sync — client-called after a purchase/restore.
//       • If REVENUECAT_SECRET_KEY is set: verifies the "PeakFettle Pro"
//         entitlement via the RevenueCat REST API
//         (GET /v1/subscribers/{app_user_id}) and flips tier='paid' when
//         active. Never auto-downgrades here (EXPIRATION webhook owns that).
//       • If unset: the webhook is the source of truth — just returns the
//         current user/tier.
//
// The canonical tier flag is users.tier ('free'|'paid'); there is NO is_paid
// column — it is DERIVED as (tier = 'paid') (see routes/user.js PHASE-6 docs).
// All SQL is drift-tolerant per CLAUDE.md #4: 42P01/42703 degrade, never 500.

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');

const webhookRouter = express.Router();
const purchasesRouter = express.Router();

// ---------------------------------------------------------------------------
// Shared constants / helpers
// ---------------------------------------------------------------------------

/** Entitlement identifier exactly as configured in RevenueCat (space included). */
const PRO_ENTITLEMENT_ID = 'PeakFettle Pro';

/** Mirrors routes/user.js TIER_RETURNING — is_paid is derived, never a column. */
const TIER_RETURNING = `id, email, display_name, tier, unit_pref, experience_level,
                        (tier = 'paid') AS is_paid`;
const TIER_RETURNING_MIN = `id, tier, (tier = 'paid') AS is_paid`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDriftError(e) {
    return !!e && (e.code === '42P01' || e.code === '42703');
}

/** Constant-time string equality (length-guarded). */
function safeEqual(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Set users.tier for a user id, drift-tolerantly. When guardComp is true the
 * update skips manually-comped users (comp_pro) — used for downgrades so an
 * EXPIRATION event never strips a comped account; the comp_pro column may be
 * absent on a drifted prod DB (42703 → retry without the guard).
 * Returns the updated row (TIER_RETURNING shape) or null when no row matched.
 */
async function setUserTier(userId, nextTier, { guardComp = false } = {}) {
    const compClause = guardComp ? 'AND COALESCE(comp_pro, FALSE) = FALSE' : '';
    try {
        const { rows } = await pool.query(
            `UPDATE users SET tier = $2, updated_at = NOW()
             WHERE id = $1 AND deleted_at IS NULL ${compClause}
             RETURNING ${TIER_RETURNING}`,
            [userId, nextTier]
        );
        return rows[0] || null;
    } catch (e) {
        if (!isDriftError(e)) throw e;
        // Drifted DB — retry with the minimal column set and no comp guard
        // (a missing comp_pro column means nobody is comped on that DB).
        const { rows } = await pool.query(
            `UPDATE users SET tier = $2
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING ${TIER_RETURNING_MIN}`,
            [userId, nextTier]
        );
        return rows[0] || null;
    }
}

/** Read the current user in the TIER_RETURNING shape (drift-tolerant). */
async function readUserTier(userId) {
    try {
        const { rows } = await pool.query(
            `SELECT ${TIER_RETURNING} FROM users
             WHERE id = $1 AND deleted_at IS NULL`,
            [userId]
        );
        return rows[0] || null;
    } catch (e) {
        if (!isDriftError(e)) throw e;
        const { rows } = await pool.query(
            `SELECT ${TIER_RETURNING_MIN} FROM users
             WHERE id = $1 AND deleted_at IS NULL`,
            [userId]
        );
        return rows[0] || null;
    }
}

/** Shape a users row the way the client User expects (matches routes/user.js). */
function toClientUser(row) {
    return { ...row, lifeos_access: row.tier === 'paid' };
}

// ---------------------------------------------------------------------------
// POST /revenuecat/webhook
// ---------------------------------------------------------------------------

/** Event types that mean "the Pro entitlement is (still) paid for". */
const PAID_EVENT_TYPES = new Set([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'UNCANCELLATION',
    'PRODUCT_CHANGE',
    // pf_pro_yearly is a 1-Year-Upfront (non-renewing) ASC product —
    // RevenueCat delivers its purchase as NON_RENEWING_PURCHASE, not
    // INITIAL_PURCHASE. Without this, annual buyers pay and never get Pro.
    'NON_RENEWING_PURCHASE',
]);

/**
 * Pick the Peak Fettle users.id out of the event. RevenueCat sends
 * app_user_id (the id the SDK logged in with), original_app_user_id, and an
 * aliases list which can include $RCAnonymousID:* ids from before logIn — the
 * first UUID-shaped candidate is ours.
 */
function extractUserId(event) {
    const candidates = [
        event.app_user_id,
        event.original_app_user_id,
        ...(Array.isArray(event.aliases) ? event.aliases : []),
    ];
    for (const c of candidates) {
        if (typeof c === 'string' && UUID_RE.test(c)) return c.toLowerCase();
    }
    return null;
}

webhookRouter.post('/webhook', async (req, res) => {
    // --- Shared-secret check (Authorization header, exact value) -----------
    const secret = process.env.REVENUECAT_WEBHOOK_AUTH || '';
    if (secret.length > 0) {
        const provided = req.get('authorization') || '';
        if (!safeEqual(provided, secret) && !safeEqual(provided, `Bearer ${secret}`)) {
            return res.status(401).json({ error: 'unauthorized' });
        }
    } else if (process.env.REVENUECAT_WEBHOOK_ALLOW_UNVERIFIED === 'true') {
        // Explicit dev-only escape hatch. Never set this in production.
        console.warn(
            '[revenuecat] REVENUECAT_WEBHOOK_ALLOW_UNVERIFIED=true — webhook accepted WITHOUT verification.'
        );
    } else {
        // FAIL CLOSED. An unverified webhook on a public mount lets anyone
        // POST a forged INITIAL_PURCHASE/EXPIRATION and flip any user's tier
        // (client ships users.id; group members can see peer UUIDs). 503 (not
        // 401) so RevenueCat retries: events delivered while the secret is
        // missing re-deliver once ops sets it. Set REVENUECAT_WEBHOOK_AUTH on
        // Railway BEFORE enabling the webhook in the RevenueCat dashboard.
        console.error(
            '[revenuecat] REVENUECAT_WEBHOOK_AUTH unset — webhook REJECTED (503). ' +
            'Set the env var on Railway and paste the same value into the ' +
            "RevenueCat webhook's Authorization header field."
        );
        return res.status(503).json({ error: 'webhook_not_configured' });
    }

    const event = req.body && req.body.event;
    if (!event || typeof event.type !== 'string') {
        // Malformed payload — 200 so RevenueCat doesn't retry it forever.
        console.warn('[revenuecat] webhook payload missing event — ignored');
        return res.json({ ok: true, ignored: 'no_event' });
    }

    const userId = extractUserId(event);

    try {
        if (PAID_EVENT_TYPES.has(event.type)) {
            if (!userId) {
                console.warn('[revenuecat] %s with no UUID app_user_id — ignored', event.type);
                return res.json({ ok: true, ignored: 'no_user_id' });
            }
            const row = await setUserTier(userId, 'paid');
            if (!row) console.warn('[revenuecat] %s for unknown user %s', event.type, userId);
            else console.log('[revenuecat] %s → tier=paid for %s', event.type, userId);
        } else if (event.type === 'EXPIRATION') {
            if (!userId) {
                console.warn('[revenuecat] EXPIRATION with no UUID app_user_id — ignored');
                return res.json({ ok: true, ignored: 'no_user_id' });
            }
            // guardComp: never strip a manually-comped account on store expiry.
            const row = await setUserTier(userId, 'free', { guardComp: true });
            if (!row) console.log('[revenuecat] EXPIRATION skipped (comped or unknown) for %s', userId);
            else console.log('[revenuecat] EXPIRATION → tier=free for %s', userId);
        } else if (event.type === 'CANCELLATION') {
            // Auto-renew turned off but the user is entitled until period end —
            // deliberately NO tier change; EXPIRATION will arrive at period end.
            console.log('[revenuecat] CANCELLATION (still entitled) for %s — no change', userId || '?');
        } else {
            // BILLING_ISSUE, TRANSFER, SUBSCRIBER_ALIAS, TEST, NON_RENEWING_PURCHASE, …
            console.log('[revenuecat] unhandled event type %s — logged only', event.type);
        }
    } catch (err) {
        // 22P02 invalid uuid / any other DB error: log and still 200 (retrying the
        // same broken payload can never succeed; /purchases/sync + the next
        // renewal event self-heal the tier).
        console.error('[revenuecat] webhook processing error:', err.code || '', err.message);
    }

    // Always fast-ACK.
    return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /purchases/sync  (behind requireAuth — req.user.id is the subscriber)
// ---------------------------------------------------------------------------

/**
 * Ask RevenueCat whether the authed user's "PeakFettle Pro" entitlement is
 * active. Returns true/false, or null when verification was not possible
 * (no secret key, network error, RC 5xx) — null means "don't change anything".
 */
async function verifyEntitlementWithRevenueCat(userId) {
    const key = process.env.REVENUECAT_SECRET_KEY;
    if (!key) return null;
    if (typeof fetch !== 'function') {
        // Node < 18 has no global fetch — treat as "cannot verify" (webhook
        // remains the source of truth) rather than crashing the route.
        console.warn('[revenuecat] global fetch unavailable — skipping verification');
        return null;
    }
    try {
        const resp = await fetch(
            `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
            { headers: { Authorization: `Bearer ${key}` } }
        );
        if (!resp.ok) {
            console.warn('[revenuecat] subscriber lookup %s → HTTP %d', userId, resp.status);
            return null;
        }
        const data = await resp.json();
        const ent = data && data.subscriber && data.subscriber.entitlements
            ? data.subscriber.entitlements[PRO_ENTITLEMENT_ID]
            : undefined;
        if (!ent) return false;
        // Active = no expiry, or expiry in the future.
        if (!ent.expires_date) return true;
        return Date.parse(ent.expires_date) > Date.now();
    } catch (err) {
        console.warn('[revenuecat] verification failed:', err.message);
        return null;
    }
}

purchasesRouter.post('/sync', async (req, res, next) => {
    try {
        const userId = req.user.id;

        const verified = await verifyEntitlementWithRevenueCat(userId);
        if (verified === true) {
            const row = await setUserTier(userId, 'paid');
            if (!row) return res.status(404).json({ error: 'user_not_found' });
            return res.json({ user: toClientUser(row), verified: true });
        }

        // verified === false → entitlement not active per RC: do NOT
        // auto-downgrade (comp users, webhook race) — just report current.
        // verified === null → couldn't verify (no key / RC unreachable): the
        // webhook is the source of truth; report current tier.
        const row = await readUserTier(userId);
        if (!row) return res.status(404).json({ error: 'user_not_found' });
        return res.json({ user: toClientUser(row), verified: verified === false ? false : null });
    } catch (err) { next(err); }
});

module.exports = { webhookRouter, purchasesRouter };
