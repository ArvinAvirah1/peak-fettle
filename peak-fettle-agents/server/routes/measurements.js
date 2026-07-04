// /measurements — TICKET-130: body measurements module (Pro sync).
// dev-fullstack — 2026-07-03
//
// Free-tier users are local-first (on-device SQLite `body_measurements` table,
// schema v12 — see mobile/src/db/localSchema.ts + mobile/src/data/measurements.ts).
// This route is the additive, drift-guarded Pro-tier sync surface: one row per
// logged entry (preset metric or custom), mirroring the local table shape so a
// Pro user's history round-trips unchanged.
//
// Drift-tolerant per CLAUDE.md §4: `body_measurements` is a NEW table (fold
// into db/schema.sql via CREATE TABLE IF NOT EXISTS), so a bare/older prod DB
// that hasn't run the migration yet must degrade (empty list / 404) rather
// than 500 — same isMissingSchema guard used by routes/percentile.js and
// routes/sets.js.

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');

const router = express.Router();

function isMissingSchema(err) {
    return err && (err.code === '42P01' || err.code === '42703');
}

// Preset metric keys mirror mobile/src/data/measurements.ts PRESET_METRICS.
// Custom metrics are any other non-empty string, capped in length below.
const PRESET_METRICS = [
    'waist', 'chest', 'hips', 'arms', 'thighs', 'calves', 'neck', 'body_fat_pct',
];

const UpsertMeasurementSchema = z.object({
    id: z.string().min(1).max(64), // client-generated id (genId()) — enables idempotent upsert
    metric: z.string().min(1).max(64),
    value: z.number().finite(),
    unit: z.enum(['cm', 'in', 'pct']),
    loggedAt: z.string().min(1), // ISO datetime, validated loosely (client is the source of truth)
});

// ---------------------------------------------------------------------------
// GET /measurements?metric=<key>
// Returns the calling user's measurement history, optionally filtered to one
// metric (for a single trend chart). Ordered oldest-first, matching the local
// SELECT ... ORDER BY logged_at ASC convention in data/measurements.ts.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        const metric = typeof req.query.metric === 'string' ? req.query.metric : null;
        const params = [req.user.id];
        let metricClause = '';
        if (metric) {
            params.push(metric);
            metricClause = `AND metric = $${params.length}`;
        }
        const { rows } = await pool.query(
            `SELECT id, metric, value, unit, logged_at
             FROM body_measurements
             WHERE user_id = $1 ${metricClause}
             ORDER BY logged_at ASC`,
            params
        );
        res.json({ measurements: rows });
    } catch (err) {
        if (isMissingSchema(err)) return res.json({ measurements: [] });
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /measurements — upsert one logged entry.
// Idempotent on (id) so a retried client write never double-inserts (the
// client generates the id locally via genId(), same pattern as `sets`/`workouts`).
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
    try {
        const body = UpsertMeasurementSchema.parse(req.body);
        // Preset metrics are trusted; custom metrics are free text but capped —
        // no further validation needed since the value is always a plain float,
        // never interpolated into SQL.
        const { rows } = await pool.query(
            `INSERT INTO body_measurements (id, user_id, metric, value, unit, logged_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE SET
                metric    = EXCLUDED.metric,
                value     = EXCLUDED.value,
                unit      = EXCLUDED.unit,
                logged_at = EXCLUDED.logged_at
             RETURNING id, metric, value, unit, logged_at`,
            [body.id, req.user.id, body.metric, body.value, body.unit, body.loggedAt]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (isMissingSchema(err)) {
            return res.status(503).json({ error: 'measurements_not_available' });
        }
        next(err);
    }
});

// ---------------------------------------------------------------------------
// DELETE /measurements/:id — ownership-checked delete.
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM body_measurements WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
        res.status(204).end();
    } catch (err) {
        if (isMissingSchema(err)) return res.status(404).json({ error: 'not_found' });
        next(err);
    }
});

module.exports = router;
module.exports.PRESET_METRICS = PRESET_METRICS;
