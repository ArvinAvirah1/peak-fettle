// /health-metrics — wearable health data ingestion and retrieval
// Phase C: TICKET-013 (Smartwatch Integration — backend/DB layer)
// dev-backend — 2026-05-04
//
// Phase C scope: Apple HealthKit read path only.
// Phase D will add Garmin Connect IQ and watch-native set logging.
//
// Open decisions resolved (2026-05-04):
//   - Garmin deferred to Phase D entirely.
//   - Intensity adjustment is surfaced as a suggestion in plan reasoning
//     (TICKET-011), not auto-applied.
//
// Routes:
//   GET  /health-metrics          — list the calling user's recent metrics
//   POST /health-metrics          — upsert one day's metrics from HealthKit sync
//   GET  /health-metrics/summary  — 7-day summary used by the AI plan prompt

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');

const router = express.Router();

const VALID_SOURCES = ['apple_healthkit', 'garmin', 'wear_os', 'manual'];

const UpsertMetricsSchema = z.object({
    date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    resting_hr_bpm: z.number().int().min(20).max(250).nullable().optional(),
    hrv_ms:         z.number().min(0).max(500).nullable().optional(),
    sleep_hours:    z.number().min(0).max(24).nullable().optional(),
    active_kcal:    z.number().int().min(0).nullable().optional(),
    source:         z.enum(['apple_healthkit', 'garmin', 'wear_os', 'manual'])
                     .optional().default('apple_healthkit'),
});

// ---------------------------------------------------------------------------
// GET /health-metrics
// Returns the calling user's health metrics for the last N days (default 30).
// Accepts ?days=N query param (max 365).
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        // SRV-USER-04: clamp to >=1 so a negative ?days can't become a future date.
        const days = Math.max(1, Math.min(parseInt(req.query.days ?? '30', 10) || 30, 365));

        const { rows } = await pool.query(
            `SELECT metric_id, date, resting_hr_bpm, hrv_ms, sleep_hours,
                    active_kcal, source, created_at
             FROM daily_health_metrics
             WHERE user_id = $1
               AND date >= CURRENT_DATE - ($2::int || ' days')::INTERVAL
             ORDER BY date DESC`,
            [req.user.id, days]
        );

        res.json({ metrics: rows, days_requested: days });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /health-metrics/summary
// Returns 7-day averages used directly by the AI plan generation prompt.
// Response shape mirrors what POST /plans/generate reads from the DB.
// ---------------------------------------------------------------------------
router.get('/summary', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT
                ROUND(AVG(resting_hr_bpm))   AS avg_resting_hr_bpm,
                ROUND(AVG(hrv_ms)::numeric, 1) AS avg_hrv_ms,
                ROUND(AVG(sleep_hours)::numeric, 1) AS avg_sleep_hours,
                ROUND(AVG(active_kcal))      AS avg_active_kcal,
                MIN(date)                    AS period_start,
                MAX(date)                    AS period_end,
                COUNT(*)                     AS days_with_data
             FROM daily_health_metrics
             WHERE user_id = $1
               AND date >= CURRENT_DATE - INTERVAL '7 days'`,
            [req.user.id]
        );

        const summary = rows[0];
        const hasSufficientData = parseInt(summary.days_with_data, 10) >= 3;

        res.json({
            summary,
            has_sufficient_data: hasSufficientData,
            // Low-data signal surfaced so the UI can prompt HealthKit permission
            note: hasSufficientData
                ? null
                : 'Connect Apple Health to improve plan personalisation. ' +
                  'We read resting heart rate, HRV, and sleep — nothing else.',
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /health-metrics
// Upsert one day's metrics from HealthKit background sync.
// ON CONFLICT updates all non-null fields so a partial sync doesn't clobber
// a previous complete sync.
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
    try {
        const {
            date, resting_hr_bpm, hrv_ms, sleep_hours, active_kcal, source,
        } = UpsertMetricsSchema.parse(req.body);

        const { rows } = await pool.query(
            `INSERT INTO daily_health_metrics
                (user_id, date, resting_hr_bpm, hrv_ms, sleep_hours, active_kcal, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id, date, source) DO UPDATE SET
                resting_hr_bpm = COALESCE(EXCLUDED.resting_hr_bpm, daily_health_metrics.resting_hr_bpm),
                hrv_ms         = COALESCE(EXCLUDED.hrv_ms,         daily_health_metrics.hrv_ms),
                sleep_hours    = COALESCE(EXCLUDED.sleep_hours,    daily_health_metrics.sleep_hours),
                active_kcal    = COALESCE(EXCLUDED.active_kcal,    daily_health_metrics.active_kcal)
             RETURNING metric_id, date, resting_hr_bpm, hrv_ms,
                       sleep_hours, active_kcal, source`,
            [
                req.user.id, date,
                resting_hr_bpm ?? null,
                hrv_ms         ?? null,
                sleep_hours    ?? null,
                active_kcal    ?? null,
                source,
            ]
        );

        res.status(201).json(rows[0]);
    } catch (err) { next(err); }
});

module.exports = router;
