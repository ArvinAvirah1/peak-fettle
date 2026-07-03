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
//
// TICKET-127 security pass (2026-07-02): paused pairings also go dark here —
// same 404 body as a revoked/unknown code, so a partner (or anyone probing the
// URL) can't distinguish "revoked" from "paused" from "never existed". Also
// adds a friendly HTML view for browsers (the link is meant to be opened by a
// human, not just consumed as JSON) with strict escaping — summary_text is
// user-controlled, so this is a public stored-XSS surface if not escaped.

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// Same capability-token shape the writer validates (URL-safe, ≥128-bit).
const CODE_RE = /^[A-Za-z0-9_-]{32,64}$/;

// Minimal, dependency-free HTML escaper. summary_text and updated_date are
// user/DB controlled and rendered into a PUBLIC page — never skip this.
const esc = (s) =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'";

const wantsHtml = (req) => req.accepts(['json', 'html']) === 'html';

function renderSummaryPage({ summaryText, updatedDate }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Peak Fettle LifeOS</title>
<style>
  :root { color-scheme: dark light; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f1115;
    color: #f2f3f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 24px;
    box-sizing: border-box;
  }
  .card {
    max-width: 420px;
    width: 100%;
    background: #171a21;
    border: 1px solid #262b36;
    border-radius: 16px;
    padding: 28px 24px;
    text-align: center;
  }
  h1 {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #9aa3b2;
    margin: 0 0 18px;
    text-transform: uppercase;
  }
  .summary {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.4;
    margin: 0 0 14px;
    color: #f2f3f5;
  }
  .updated {
    font-size: 13px;
    color: #7d8695;
    margin: 0;
  }
  footer {
    margin-top: 22px;
    font-size: 12px;
    color: #5b6472;
    line-height: 1.5;
  }
</style>
</head>
<body>
  <div class="card">
    <h1>Peak Fettle LifeOS</h1>
    <p class="summary">&ldquo;${esc(summaryText)}&rdquo;</p>
    <p class="updated">Updated ${esc(updatedDate)}</p>
    <footer>Shared with you privately. Only this summary is ever shared — never raw data.</footer>
  </div>
</body>
</html>`;
}

function renderNotFoundPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Peak Fettle LifeOS</title>
<style>
  :root { color-scheme: dark light; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f1115;
    color: #f2f3f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 24px;
    box-sizing: border-box;
  }
  .card {
    max-width: 420px;
    width: 100%;
    background: #171a21;
    border: 1px solid #262b36;
    border-radius: 16px;
    padding: 28px 24px;
    text-align: center;
  }
  p {
    font-size: 15px;
    color: #9aa3b2;
    margin: 0;
  }
</style>
</head>
<body>
  <div class="card">
    <p>This link is no longer active.</p>
  </div>
</body>
</html>`;
}

function sendNotFound(req, res) {
    if (wantsHtml(req)) {
        res.set('Content-Security-Policy', HTML_CSP);
        return res.status(404).type('html').send(renderNotFoundPage());
    }
    return res.status(404).json({ error: 'not_found' });
}

// GET /partner/:code — latest summary for a code, or 404. No PII in the response.
router.get('/:code', async (req, res, next) => {
    try {
        const { code } = req.params;
        if (typeof code !== 'string' || !CODE_RE.test(code)) {
            // Reject malformed codes without touching the DB (cheap enumeration guard).
            return sendNotFound(req, res);
        }
        // Return the update DATE only (not the microsecond timestamp): a raw
        // timestamp would let a code-holder poll and reconstruct the user's
        // daily activity/sleep pattern — a side-channel beyond the "counts +
        // streak" contract (TICKET-127 security pass).
        let rows;
        try {
            ({ rows } = await pool.query(
                `SELECT summary_text, paused, to_char(updated_at, 'YYYY-MM-DD') AS updated_date
                   FROM lifeos_partner_summaries
                  WHERE code = $1`,
                [code]
            ));
        } catch (err) {
            // Drift-tolerant: the paused column may not be deployed yet on an
            // older prod DB (42703). Retry the legacy query without it rather
            // than 500 (CLAUDE.md #4).
            if (err && err.code === '42703') {
                ({ rows } = await pool.query(
                    `SELECT summary_text, to_char(updated_at, 'YYYY-MM-DD') AS updated_date
                       FROM lifeos_partner_summaries
                      WHERE code = $1`,
                    [code]
                ));
            } else {
                throw err;
            }
        }
        if (rows.length === 0) {
            return sendNotFound(req, res);
        }
        // Paused pairings go dark — identical response to a revoked/unknown
        // code so a partner can't distinguish "paused" from "gone" (TICKET-127).
        if (rows[0].paused === true) {
            return sendNotFound(req, res);
        }
        if (wantsHtml(req)) {
            res.set('Content-Security-Policy', HTML_CSP);
            return res.status(200).type('html').send(
                renderSummaryPage({ summaryText: rows[0].summary_text, updatedDate: rows[0].updated_date })
            );
        }
        res.json({ summary: rows[0].summary_text, updatedDate: rows[0].updated_date });
    } catch (err) {
        // Degrade gracefully if the table isn't deployed yet (42P01) rather than 500.
        if (err && err.code === '42P01') {
            return sendNotFound(req, res);
        }
        next(err);
    }
});

module.exports = router;
