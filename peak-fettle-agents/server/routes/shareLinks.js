// /routines/share and /share — routine share links + public preview
// TICKET-138 (2026-07-03, Wave-2 agent W2-D)
//
// "Send my routine to a friend" — a validated routine blob stored behind a
// short, unlisted id. The creating user must be authenticated (free OR Pro —
// see tierPolicy.ts comment: creating/serving a share link is an explicit
// user-initiated network action, the SAME carve-out class as the group
// weekly-signal POST, so it is allowed on the free-tier local-first path).
// The GET preview is intentionally PUBLIC (the recipient has no account) —
// mirrors the routes/partner.js pattern: rate-limited at the app.use() mount,
// drift-tolerant (catch 42P01/42703 → degrade instead of 500), minimal PII
// (no user id / name is ever returned), escaped HTML for the browser preview.
//
// Endpoints (two routers, mounted in index.js):
//   routineShareRouter → mounted at /routines (index.js already wraps the
//                        whole /routines prefix in requireAuth):
//     POST   /routines/:id/share   — create/refresh a share link for a
//                                    routine the caller owns.
//     DELETE /routines/:id/share   — revoke (delete) the caller's link.
//   shareRouter → mounted at /share, PUBLIC + rate-limited (own limiter,
//                 recipients have no account):
//     GET    /share/:linkId        — minimal preview (name, days, exercise
//                                    list) + JSON blob for the app's
//                                    deep-link import, or an HTML preview for
//                                    a browser. 404 if missing/expired/revoked
//                                    (same body for all three — no oracle).
//
// Links expire (default 90 days) and are unlisted (no discovery / listing
// endpoint in v1). Revoke = delete the row.
//
// Server-side validation reuses the EXACT same ExerciseEntrySchema as
// routes/routines.js (S2 supersets/dropsets included) — the DATA-01 allowlist
// contract holds end-to-end: untrusted routine JSON is Zod-validated here
// before being stored, and the CLIENT allowlists again via allowlistExercise
// on import (never a blind spread on either side).

'use strict';

const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { pool } = require('../db');

// Two routers, mirroring the groups.js pattern (one file, several mount
// points registered in index.js):
//   routineShareRouter → mounted at /routines, ALONGSIDE the existing
//                         requireAuth-gated routines router (index.js already
//                         applies requireAuth to the whole /routines prefix).
//   shareRouter        → mounted at /share, PUBLIC (no requireAuth) behind its
//                         own strict rate limiter (recipients have no account).
const routineShareRouter = express.Router();
const shareRouter = express.Router();

// SOCIAL-03-style guard (see routes/groups.js): validate :id as a UUID once
// for every routineShareRouter route so a malformed id 400s instead of 22P02.
routineShareRouter.param('id', (req, res, next, val) => {
    if (!z.string().uuid().safeParse(val).success) {
        return res.status(400).json({ error: 'invalid_routine_id' });
    }
    return next();
});

// Default lifetime for a new/refreshed share link.
const DEFAULT_EXPIRY_DAYS = 90;

// Same optional S2 superset/dropset bounds as routes/routines.js — kept in
// sync deliberately (see that file's ExerciseEntrySchema comment); a routine
// blob that already lives in `routines.exercises` has already passed this
// exact schema once, so re-validating here is a cheap defensive copy, not a
// stricter gate.
const ExerciseEntrySchema = z.object({
    exercise_id: z.string().uuid().nullable().optional(),
    name:        z.string().min(1).max(100),
    target_sets: z.number().int().min(1).max(20).optional(),
    target_reps: z.string().max(20).optional(),
    superset_group:  z.string().min(1).max(40).nullable().optional(),
    superset_rounds: z.number().int().min(1).max(10).nullable().optional(),
    dropset: z
        .object({
            last_n:   z.union([z.number().int().min(1).max(10), z.literal('all')]),
            drops:    z.number().int().min(1).max(3).optional(),
            drop_pct: z.number().int().min(5).max(40).optional(),
        })
        .nullable()
        .optional(),
});

const ShareRoutineBlobSchema = z.object({
    name:      z.string().min(1).max(100),
    exercises: z.array(ExerciseEntrySchema).max(30).optional().default([]),
});

// URL-safe (base64url), 12-byte → 16 chars — long enough that GET enumeration
// is infeasible even though the endpoint is public (mirrors the >=128-bit
// capability-token guidance in routes/partner.js; ours is closer to 96 bits,
// intentionally shorter since a share link is meant to be sent by the owner,
// not memorized, and is auth-gated to CREATE, only the read is public).
const LINK_ID_RE = /^[A-Za-z0-9_-]{16,32}$/;

function newLinkId() {
    return crypto.randomBytes(12).toString('base64url');
}

// ---------------------------------------------------------------------------
// Minimal, dependency-free HTML escaper — summary fields are user-controlled
// and rendered into a PUBLIC page (mirrors routes/partner.js).
// ---------------------------------------------------------------------------
const esc = (s) =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'";
const wantsHtml = (req) => req.accepts(['json', 'html']) === 'html';

// Web origin used to compose the store/website preview URL; falls back to the
// same default the main server uses in dev (index.js already fails loud in
// prod if this is unset, so by the time this route runs in prod it is set).
const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:3000';
const APP_SCHEME = 'peak-fettle'; // mobile/app.json "scheme" — keep in sync

function deepLinkFor(linkId) {
    return `${APP_SCHEME}://routine/${linkId}`;
}

function webPreviewUrlFor(linkId) {
    return `${WEB_ORIGIN.replace(/\/$/, '')}/share/${linkId}`;
}

function renderNotFoundPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Peak Fettle</title>
<style>
  :root { color-scheme: dark light; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; background: #0f1115; color: #f2f3f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 24px; box-sizing: border-box;
  }
  .card {
    max-width: 420px; width: 100%; background: #171a21; border: 1px solid #262b36;
    border-radius: 16px; padding: 28px 24px; text-align: center;
  }
  p { font-size: 15px; color: #9aa3b2; margin: 0; }
</style>
</head>
<body><div class="card"><p>This routine link is no longer active.</p></div></body>
</html>`;
}

function renderPreviewPage({ name, exerciseNames, deepLink }) {
    const rows = exerciseNames
        .slice(0, 30)
        .map((n) => `<li>${esc(n)}</li>`)
        .join('');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} — Peak Fettle</title>
<style>
  :root { color-scheme: dark light; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; background: #0f1115; color: #f2f3f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 24px; box-sizing: border-box;
  }
  .card {
    max-width: 460px; width: 100%; background: #171a21; border: 1px solid #262b36;
    border-radius: 16px; padding: 28px 24px;
  }
  h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px; color: #f2f3f5; }
  .meta { font-size: 13px; color: #7d8695; margin: 0 0 18px; }
  ul { margin: 0 0 22px; padding-left: 18px; color: #d7dbe3; font-size: 14px; line-height: 1.7; }
  a.cta {
    display: block; text-align: center; text-decoration: none; font-weight: 600;
    font-size: 15px; color: #0f1115; background: #7ee0c1; border-radius: 10px;
    padding: 14px 18px;
  }
  footer { margin-top: 16px; font-size: 12px; color: #5b6472; text-align: center; }
</style>
</head>
<body>
  <div class="card">
    <h1>${esc(name)}</h1>
    <p class="meta">${exerciseNames.length} exercise${exerciseNames.length === 1 ? '' : 's'}</p>
    <ul>${rows}</ul>
    <a class="cta" href="${esc(deepLink)}">Open in Peak Fettle</a>
    <footer>Shared with you privately. Import adds this routine to your own account.</footer>
  </div>
</body>
</html>`;
}

function sendGone(req, res) {
    if (wantsHtml(req)) {
        res.set('Content-Security-Policy', HTML_CSP);
        return res.status(404).type('html').send(renderNotFoundPage());
    }
    return res.status(404).json({ error: 'not_found' });
}

// ---------------------------------------------------------------------------
// POST /routines/:id/share — create (or refresh) a share link for a routine
// the caller owns. Auth'd (index.js already applies requireAuth to the whole
// /routines prefix); NOT gated behind requirePaid (free users may also share
// — this is the explicit user-initiated network carve-out, see tierPolicy.ts).
// Re-POSTing rotates the link id and resets the expiry.
// ---------------------------------------------------------------------------
routineShareRouter.post('/:id/share', async (req, res, next) => {
    try {
        const routineId = req.params.id; // already UUID-validated by the .param() guard above

        const { rows: routineRows } = await pool.query(
            `SELECT id, name, exercises FROM routines WHERE id = $1 AND user_id = $2`,
            [routineId, req.user.id]
        );
        if (routineRows.length === 0) {
            return res.status(404).json({ error: 'routine_not_found' });
        }
        const routine = routineRows[0];

        // Re-validate the stored blob through the same schema the create/update
        // routes enforce — belt-and-braces against any pre-Zod legacy row.
        const parsed = ShareRoutineBlobSchema.parse({
            name: routine.name,
            exercises: routine.exercises,
        });

        const linkId = newLinkId();
        const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

        let row;
        try {
            ({ rows: [row] } = await pool.query(
                `INSERT INTO routine_share_links
                     (id, routine_id, user_id, name, exercises, expires_at)
                 VALUES ($1, $2, $3, $4, $5::jsonb, $6)
                 ON CONFLICT (routine_id) DO UPDATE
                    SET id         = EXCLUDED.id,
                        name       = EXCLUDED.name,
                        exercises  = EXCLUDED.exercises,
                        expires_at = EXCLUDED.expires_at,
                        created_at = NOW(),
                        revoked_at = NULL
                 RETURNING id, expires_at`,
                [linkId, routineId, req.user.id, parsed.name, JSON.stringify(parsed.exercises), expiresAt.toISOString()]
            ));
        } catch (err) {
            // Drift guard (CLAUDE.md §4): the migration may not have landed on an
            // older prod DB yet. Degrade instead of a raw 500.
            if (err && (err.code === '42P01' || err.code === '42703')) {
                return res.status(404).json({ error: 'share_links_unavailable' });
            }
            throw err;
        }

        res.status(201).json({
            link_id:      row.id,
            expires_at:   row.expires_at,
            deep_link:    deepLinkFor(row.id),
            preview_url:  webPreviewUrlFor(row.id),
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// DELETE /routines/:id/share — revoke (delete) the caller's share link.
// Idempotent: deleting an already-gone link still returns { revoked: true }.
// ---------------------------------------------------------------------------
routineShareRouter.delete('/:id/share', async (req, res, next) => {
    try {
        const routineId = req.params.id; // already UUID-validated by the .param() guard above
        try {
            await pool.query(
                `DELETE FROM routine_share_links WHERE routine_id = $1 AND user_id = $2`,
                [routineId, req.user.id]
            );
        } catch (err) {
            if (err && (err.code === '42P01' || err.code === '42703')) {
                return res.json({ revoked: true }); // nothing to revoke if the table doesn't exist yet
            }
            throw err;
        }
        res.json({ revoked: true });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /share/:linkId — PUBLIC minimal preview + import blob.
// No discovery/listing surface — this is the ONLY read path, by exact id.
// Expired or revoked (row deleted) links 404 with the SAME body (no oracle).
// ---------------------------------------------------------------------------
shareRouter.get('/:linkId', async (req, res, next) => {
    try {
        const { linkId } = req.params;
        if (typeof linkId !== 'string' || !LINK_ID_RE.test(linkId)) {
            return sendGone(req, res);
        }

        let rows;
        try {
            ({ rows } = await pool.query(
                `SELECT name, exercises, expires_at
                   FROM routine_share_links
                  WHERE id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
                [linkId]
            ));
        } catch (err) {
            if (err && (err.code === '42P01' || err.code === '42703')) {
                return sendGone(req, res); // table not deployed yet — degrade, don't 500
            }
            throw err;
        }

        if (rows.length === 0) {
            return sendGone(req, res);
        }
        const link = rows[0];
        const exercises = Array.isArray(link.exercises) ? link.exercises : [];
        const exerciseNames = exercises.map((e) => (e && typeof e.name === 'string' ? e.name : '')).filter(Boolean);

        if (wantsHtml(req)) {
            res.set('Content-Security-Policy', HTML_CSP);
            return res.status(200).type('html').send(
                renderPreviewPage({ name: link.name, exerciseNames, deepLink: deepLinkFor(linkId) })
            );
        }

        // JSON: minimal preview fields PLUS the full validated blob the mobile
        // app's deep-link import path consumes (fetch blob → allowlistExercise
        // per entry → save as a new LOCAL routine — src/data/shareLinks.ts).
        res.json({
            name: link.name,
            days: 1, // a shared routine is always a single session in v1
            exercise_count: exerciseNames.length,
            exercises,
            deep_link: deepLinkFor(linkId),
        });
    } catch (err) {
        if (err && err.code === '42P01') {
            return sendGone(req, res);
        }
        next(err);
    }
});

module.exports = { routineShareRouter, shareRouter };
