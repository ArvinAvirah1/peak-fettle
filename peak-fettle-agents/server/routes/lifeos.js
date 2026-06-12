// /lifeos — minimal server surface for the Life OS companion app.
// LIFEOS TICKET-111 (cross-app loop) — 2026-06-12.
//
// Local-first posture (Q30): the app's content NEVER reaches this server.
// The only thing stored here is a per-day boolean presence marker
// (lifeos_activity_days) used for the cross-app "whole-person" streak —
// no habit names, no counts, no detail.
//
// Deviation from the spec's sketch (recorded in LIFEOS_BUILD_STATUS):
// the whole-person streak is COMPUTED ON READ from the union of workout
// days and activity-ping days, instead of a stored counter updated by two
// writers. One source of truth, no write coupling into the workouts route,
// no cron drift.

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');

const router = express.Router();

const requirePaid = (req, res, next) => {
    // Mirrors the entitlement derivation in GET /user/profile: tier gates
    // every lifeos route so free users can't hit them directly (TICKET-113).
    pool.query(`SELECT tier FROM users WHERE id = $1 AND deleted_at IS NULL`, [req.user.id])
        .then(({ rows }) => {
            if (rows.length === 0 || rows[0].tier !== 'paid') {
                return res.status(403).json({ error: 'lifeos_access_required' });
            }
            next();
        })
        .catch(next);
};

router.use(requirePaid);

const PingSchema = z.object({
    date: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        // No future days (clients run local-first and may have skewed clocks;
        // allow +1 day of slack for timezones ahead of server UTC).
        .refine((dateStr) => {
            const submitted = Date.parse(`${dateStr}T00:00:00Z`);
            return Number.isFinite(submitted) && submitted <= Date.now() + 86_400_000;
        }, { message: 'date cannot be in the future' }),
});

// POST /lifeos/activity-ping — "at least one habit was active on <date>".
// Idempotent upsert; body carries nothing but the date. The INSERT…SELECT
// re-checks tier atomically in the same statement, closing the (tiny)
// check-then-act window left by the middleware (review finding 2026-06-12).
router.post('/activity-ping', async (req, res, next) => {
    try {
        const parsed = PingSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'invalid_date', message: 'date must be YYYY-MM-DD, not in the future' });
        }
        await pool.query(
            `INSERT INTO lifeos_activity_days (user_id, date)
             SELECT $1, $2
             WHERE EXISTS (
                 SELECT 1 FROM users
                 WHERE id = $1 AND tier = 'paid' AND deleted_at IS NULL
             )
             ON CONFLICT (user_id, date) DO NOTHING`,
            [req.user.id, parsed.data.date]
        );
        res.status(204).end();
    } catch (err) { next(err); }
});

// GET /lifeos/whole-person-streak — consecutive days (ending today or
// yesterday) with a workout OR a lifeos activity ping. Forgiving rule kept
// deliberately simple at the server: a single-day gap does not break the
// chain (mirrors the on-device forgiving model's spirit without duplicating
// its full semantics).
router.get('/whole-person-streak', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT DISTINCT d::date AS day FROM (
                 SELECT day_key::date AS d FROM workouts WHERE user_id = $1
                 UNION
                 SELECT date AS d FROM lifeos_activity_days WHERE user_id = $1
             ) merged
             ORDER BY day DESC
             LIMIT 730`,
            [req.user.id]
        );

        const days = rows.map((r) => {
            const d = r.day instanceof Date ? r.day : new Date(r.day);
            return Math.floor(d.getTime() / 86400000);
        });

        let streak = 0;
        if (days.length > 0) {
            const todayEpoch = Math.floor(Date.now() / 86400000);
            // Chain may end today or yesterday (today is pending, not a miss).
            let cursor = days[0] === todayEpoch || days[0] === todayEpoch - 1 ? days[0] : null;
            if (cursor != null) {
                streak = 1;
                let gapUsed = false;
                for (let i = 1; i < days.length; i++) {
                    const diff = cursor - days[i];
                    if (diff === 1) {
                        streak += 1;
                        cursor = days[i];
                        gapUsed = false;
                    } else if (diff === 2 && !gapUsed) {
                        streak += 1;
                        cursor = days[i];
                        gapUsed = true;
                    } else {
                        break;
                    }
                }
            }
        }

        res.json({ whole_person_streak: streak });
    } catch (err) { next(err); }
});

module.exports = router;
