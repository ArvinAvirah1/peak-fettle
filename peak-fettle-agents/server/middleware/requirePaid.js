/**
 * requirePaid — gate an endpoint behind the paid ("Pro") tier.
 *
 * MUST run AFTER requireAuth (needs req.user.id). The tier is read from the DB
 * on every call — the server NEVER trusts a client-supplied is_paid/tier value.
 * This is the single source of truth for paid-feature enforcement: every Pro
 * endpoint should use this middleware instead of an ad-hoc inline check, so the
 * gate can never drift between features.
 *
 * NOTE: the users table has a `tier` column ('free' | 'paid') — there is NO
 * `is_paid` column. is_paid is a DERIVED value (`tier = 'paid'`). Querying
 * `is_paid` as a column throws 42703; always derive it as below.
 *
 * Responses:
 *   401 auth_required      — no authenticated user (requireAuth missing/failed)
 *   402 paid_tier_required — authenticated but on the free tier
 *   (passes through)       — paid tier
 */

const { pool } = require('../db');

async function requirePaid(req, res, next) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'auth_required' });
        }

        const { rows } = await pool.query(
            `SELECT (tier = 'paid') AS is_paid FROM users WHERE id = $1`,
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'user_not_found' });
        }

        if (!rows[0].is_paid) {
            return res.status(402).json({
                error: 'paid_tier_required',
                message: 'This is a Peak Fettle Pro feature. Upgrade to unlock it.',
            });
        }

        return next();
    } catch (err) {
        return next(err);
    }
}

module.exports = { requirePaid };
