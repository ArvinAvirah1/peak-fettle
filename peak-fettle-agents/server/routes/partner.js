// /partner — PUBLIC accountability-partner view (LIFEOS TICKET-121, Q33 option a).
//
// This is the ONE deliberately-unauthenticated LifeOS endpoint: the partner the
// user invited has no account, so the high-entropy `code` IS the capability. It
// is mounted in index.js OUTSIDE requireAuth, behind a strict rate limiter to
// make code enumeration infeasible. It returns ONLY the opaque, client-composed
// summary string + when it was updated — never a user id, name, or any raw data.
//
// Revocation is immediate: the user rotates/deletes the code (routes/lifeos.js
// DELETE /lifeos/partner/summary), after which this lookup 404s.

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// Same capability-token shape the writer validates (URL-safe, ≥128-bit).
const CODE_RE = /^[A-Za-z0-9_-]{32,64}$/;

// GET /partner/:code — latest summary for a code, or 404. No PII in the response.
router.get('/:code', async (req, res, next) => {
    try {
        const { code } = req.params;
        if (typeof code !== 'string' || !CODE_RE.test(code)) {
            // Reject malformed codes without touching the DB (cheap enumeration guard).
            return res.status(404).json({ error: 'not_found' });
        }
        // Return the update DATE only (not the microsecond timestamp): a raw
        // timestamp would let a code-holder poll and reconstruct the user's
        // daily activity/sleep pattern — a side-channel beyond the "counts +
        // streak" contract (TICKET-127 security pass).
        const { rows } = await pool.query(
            `SELECT summary_text, to_char(updated_at, 'YYYY-MM-DD') AS updated_date
               FROM lifeos_partner_summaries
              WHERE code = $1`,
            [code]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'not_found' });
        }
        res.json({ summary: rows[0].summary_text, updatedDate: rows[0].updated_date });
    } catch (err) {
        // Degrade gracefully if the table isn't deployed yet (42P01) rather than 500.
        if (err && err.code === '42P01') {
            return res.status(404).json({ error: 'not_found' });
        }
        next(err);
    }
});

module.exports = router;
