// /workouts — CRUD on the per-day workout container
// dev-backend — 2026-04-30

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { supabaseAdmin } = require('../lib/supabaseAdmin');

const router = express.Router();

const CreateSchema = z.object({
    dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().max(500).optional(),
    // Routine link (2026-06-04): set when the session is started from a routine
    // or template so Recent Activity can label it "Leg Day 6/4/26". routineName
    // is a denormalised snapshot used for display; both NULL for ad-hoc sessions.
    routineId: z.string().uuid().optional(),
    routineName: z.string().max(120).optional(),
});

// ---------------------------------------------------------------------------
// 1.5 Paywall: session-count trigger
// Free-tier users who reach FREE_SESSION_LIMIT real workout sessions receive a
// paywall nudge in the API response so the client can surface the upgrade prompt
// immediately — no extra round-trip required.
// ---------------------------------------------------------------------------
const FREE_SESSION_LIMIT = 5;

/**
 * Count the total number of real workout sessions logged by a user.
 * Excludes rest days and CSV cardio imports — only genuine logged sessions.
 */
async function countRealSessions(userId) {
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM workouts
         WHERE user_id     = $1
           -- FIX (data-audit 2026-05-27): the workouts table has no soft-delete column,
           -- and session_type is 'workout'|'rest_day'|'emergency_override'|'cardio_import'
           -- per the DB CHECK constraint (never 'lift'). Count real training days only.
           AND session_type = 'workout'`,
        [userId]
    );
    return rows[0]?.total ?? 0;
}

// POST /workouts — idempotent on (user_id, day_key)
// T-04 (2026-05-02): return 201 on create, 200 on update so clients can
// distinguish a brand-new workout from an upsert hit on an existing one.
// We use the Postgres xmax trick: xmax = 0 means the row was just inserted;
// xmax != 0 means the row existed and was updated.
router.post('/', async (req, res, next) => {
    try {
        const { dayKey, notes, routineId, routineName } = CreateSchema.parse(req.body);
        const { rows } = await pool.query(
            `INSERT INTO workouts (user_id, day_key, notes, routine_id, routine_name)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, day_key) DO UPDATE
                SET notes = COALESCE(EXCLUDED.notes, workouts.notes),
                    -- Latest routine started that day wins; a free re-open
                    -- (routine_* NULL) leaves an existing routine label intact.
                    routine_id   = COALESCE(EXCLUDED.routine_id, workouts.routine_id),
                    routine_name = COALESCE(EXCLUDED.routine_name, workouts.routine_name),
                    updated_at = NOW()
             RETURNING id, user_id, day_key, notes, routine_id, routine_name,
                       session_type, created_at, updated_at,
                       (xmax = 0) AS inserted`,
            [req.user.id, dayKey, notes || null, routineId || null, routineName || null]
        );
        const row = rows[0];
        const wasInserted = row.inserted;
        delete row.inserted; // don't leak internal flag to clients

        // ── 1.5 Paywall: check session count for free-tier users ─────────────
        // Only check on new inserts (not upsert hits) to avoid repeat triggers.
        let paywallTrigger = false;
        if (wasInserted) {
            try {
                const { data: userData } = await supabaseAdmin
                    .from('users')
                    .select('tier')
                    .eq('id', req.user.id)
                    .single();

                if (userData?.tier === 'free') {
                    const sessionCount = await countRealSessions(req.user.id);
                    if (sessionCount >= FREE_SESSION_LIMIT) {
                        paywallTrigger = true;
                        // Push notification is handled by the post-response async block
                        // below (Path B), which deduplicates via paywall_triggered_at.
                        // NEW-002 fix: removed Path A push enqueue to prevent double
                        // notification when both paths fire on the same session.
                    }
                }
            } catch (e) {
                // Paywall check failure must never block the workout response.
                console.warn('[paywall] session count check failed:', e?.message);
            }
        }

        res.status(wasInserted ? 201 : 200).json({ ...row, paywall_trigger: paywallTrigger });

        // Phase 1.5: session-count paywall trigger (persisted)
        // Fire-and-forget — never delays the response or throws to the client.
        // Sets paywall_triggered_at on users table (once, never cleared) and
        // enqueues a push notification via the notification_queue table.
        (async () => {
          try {
            // Only check if paywall hasn't already been persisted for this user
            const { rows: [userRow] } = await pool.query(
              'SELECT paywall_triggered_at FROM users WHERE id = $1',
              [req.user.id]
            );
            if (userRow?.paywall_triggered_at) return; // already triggered

            // Count real workout sessions only (same logic as countRealSessions()).
            // NEW-002 fix: was COUNT(*) which incorrectly counted rest days, cardio
            // imports, and soft-deleted rows — could trigger paywall before the user
            // hit FREE_SESSION_LIMIT real workouts.
            const { rows: [{ count }] } = await pool.query(
              `SELECT COUNT(*)::int AS count FROM workouts
               WHERE user_id = $1
                 -- FIX (data-audit 2026-05-27): no soft-delete column; real session = 'workout'
                 AND session_type = 'workout'`,
              [req.user.id]
            );

            if (parseInt(count, 10) >= FREE_SESSION_LIMIT) {
              // Mark paywall triggered (set once, never cleared)
              await pool.query(
                'UPDATE users SET paywall_triggered_at = NOW() WHERE id = $1',
                [req.user.id]
              );

              // Enqueue push notification (if notification_queue table exists)
              await pool.query(`
                INSERT INTO notification_queue (user_id, type, title, body, data)
                VALUES ($1, 'paywall_trigger',
                  'You''re on a roll! 🔥',
                  'You''ve logged 5 sessions. Unlock premium for unlimited AI plans, advanced analytics, and more.',
                  $2::jsonb)
              `, [req.user.id, JSON.stringify({ screen: 'upgrade' })]);
            }
          } catch (err) {
            console.warn('[paywall-trigger] error (non-fatal):', err?.message);
          }
        })();

        // Push notification: streak milestone check
        try {
            const MILESTONES = [7, 30, 100];
            // Fetch current streak and notification preference from users table
            const { data: streakData } = await supabaseAdmin
                .from('users')
                .select('streak_days, streak_notifications_enabled')
                .eq('id', req.user.id)
                .single();
            const streak = streakData?.streak_days;
            const notifEnabled = streakData?.streak_notifications_enabled !== false; // default true if null
            if (streak && MILESTONES.includes(streak) && notifEnabled) {
                await supabaseAdmin.from('notification_queue').insert({
                    user_id: req.user.id,
                    type: 'streak_milestone',
                    title: `${streak}-day streak! 🔥`,
                    body: `You've logged workouts for ${streak} days in a row. Keep it going!`,
                    data: { streak_days: streak },
                });
            }
        } catch (_e) {
            // Notification enqueue failure must never break the workout response
            console.warn('[push] streak milestone enqueue failed:', _e?.message);
        }
    } catch (err) { next(err); }
});

// GET /workouts?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req, res, next) => {
    try {
        const { from, to } = req.query;
        const conditions = ['w.user_id = $1'];
        const params = [req.user.id];

        if (from) {
            params.push(from);
            conditions.push(`w.day_key >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            conditions.push(`w.day_key <= $${params.length}`);
        }

        const { rows } = await pool.query(
            `SELECT
                w.id,
                w.user_id,
                w.day_key,
                w.notes,
                w.routine_id,
                w.routine_name,
                w.session_type,
                w.created_at,
                w.updated_at,
                -- Aggregated stats used by the workout history list UI.
                -- total_sets / exercise_count count lift sets only.
                COUNT(s.id)          FILTER (WHERE s.kind = 'lift')              AS total_sets,
                COUNT(DISTINCT s.exercise_id) FILTER (WHERE s.kind = 'lift')     AS exercise_count,
                COALESCE(
                    SUM(s.weight_raw) FILTER (WHERE s.kind = 'lift' AND s.weight_raw > 0),
                    0
                ) / 8.0                                                           AS total_volume_kg
             FROM workouts w
             LEFT JOIN sets s ON s.workout_id = w.id
             WHERE ${conditions.join(' AND ')}
             GROUP BY w.id, w.user_id, w.day_key, w.notes, w.routine_id, w.routine_name, w.session_type, w.created_at, w.updated_at
             ORDER BY w.day_key DESC
             LIMIT 90`,
            params
        );
        res.json(rows);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// ROADMAP §2.4 — Cardio analytics endpoints
// Both routes MUST stay above /:id to avoid the catch-all matching them.
// ---------------------------------------------------------------------------

// POST /workouts/rest-day
// Logs an intentional rest day for the current user (streak-preserved).
// session_type = 'rest_day' is counted as an active day by the streak cron.
router.post('/rest-day', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        const { rows: existing } = await pool.query(
            `SELECT id FROM workouts
             WHERE user_id = $1
               AND session_type = 'rest_day'
               AND day_key = $2
             LIMIT 1`,
            [userId, today]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: 'Rest day already logged for today.' });
        }

        const { rows } = await pool.query(
            `INSERT INTO workouts (user_id, day_key, session_type)
             VALUES ($1, $2, 'rest_day')
             ON CONFLICT (user_id, day_key) DO UPDATE
                SET session_type = 'rest_day',
                    updated_at = NOW()
             RETURNING id, user_id, day_key, session_type, created_at, updated_at`,
            [userId, today]
        );

        return res.status(201).json({ message: 'Rest day logged.', workout: rows[0] });
    } catch (err) { next(err); }
});

// DELETE /workouts/rest-day/today
// Undo a rest day logged today (user changes their mind and actually works out).
router.delete('/rest-day/today', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const today = new Date().toISOString().split('T')[0];
        await pool.query(
            `DELETE FROM workouts
             WHERE user_id = $1
               AND session_type = 'rest_day'
               AND day_key = $2`,
            [userId, today]
        );
        return res.json({ message: 'Rest day removed.' });
    } catch (err) { next(err); }
});

// GET /workouts/mileage-weekly
// Returns the last 8 ISO weeks of cardio distance per activity type, plus a
// boolean flag indicating whether the most-recent complete week exceeded the
// prior week by more than 10% (the "10% rule" overshoot warning).
//
// Response: { weeks: MileageWeekRow[], ten_pct_warning: boolean }
// MileageWeekRow: { week_start: string (YYYY-MM-DD), activity_type: string,
//                   total_distance_m: number, session_count: number }
router.get('/mileage-weekly', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT
               date_trunc('week', day_key::date)::date::text AS week_start,
               activity_type,
               SUM(distance_m)::int                          AS total_distance_m,
               COUNT(*)::int                                  AS session_count
             FROM workouts
             WHERE user_id      = $1
               AND session_type = 'cardio_import'
               AND distance_m   IS NOT NULL
               AND day_key::date >= (CURRENT_DATE - INTERVAL '8 weeks')
             GROUP BY date_trunc('week', day_key::date), activity_type
             ORDER BY week_start ASC`,
            [req.user.id]
        );

        // Compute 10% overshoot: compare the two most-recent calendar weeks
        // (summed across all activity types) so cross-type weeks are treated as
        // one total-load number.
        const weekTotals = new Map();
        for (const r of rows) {
            weekTotals.set(r.week_start, (weekTotals.get(r.week_start) ?? 0) + r.total_distance_m);
        }
        const sortedWeeks = [...weekTotals.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
        let tenPctWarning = false;
        if (sortedWeeks.length >= 2) {
            const prev = sortedWeeks[sortedWeeks.length - 2][1];
            const curr = sortedWeeks[sortedWeeks.length - 1][1];
            if (prev > 0 && curr > prev * 1.10) tenPctWarning = true;
        }

        res.json({ weeks: rows, ten_pct_warning: tenPctWarning });
    } catch (err) { next(err); }
});

// GET /workouts/pace-trend
// Returns monthly average pace (sec/km) per activity type for the last 6
// months. Used by the Progress screen pace-trend line chart.
//
// Response: { months: PaceTrendRow[] }
// PaceTrendRow: { month_start: string (YYYY-MM-DD), activity_type: string,
//                 avg_pace_sec_per_km: number, session_count: number }
router.get('/pace-trend', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT
               date_trunc('month', day_key::date)::date::text AS month_start,
               activity_type,
               ROUND(AVG(avg_pace_sec_per_km))::int           AS avg_pace_sec_per_km,
               COUNT(*)::int                                   AS session_count
             FROM workouts
             WHERE user_id             = $1
               AND session_type        = 'cardio_import'
               AND avg_pace_sec_per_km IS NOT NULL
               AND day_key::date       >= (CURRENT_DATE - INTERVAL '6 months')
             GROUP BY date_trunc('month', day_key::date), activity_type
             ORDER BY month_start ASC`,
            [req.user.id]
        );
        res.json({ months: rows });
    } catch (err) { next(err); }
});

// GET /workouts/:id
router.get('/:id', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, user_id, day_key, notes, routine_id, routine_name, session_type, created_at, updated_at
             FROM workouts
             WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'not_found' });
        res.json(rows[0]);
    } catch (err) { next(err); }
});

// DELETE /workouts/:id
// N-13 (2026-05-03): delete endpoint with ownership check.
router.delete('/:id', async (req, res, next) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM workouts WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
        res.status(204).end();
    } catch (err) { next(err); }
});

module.exports = router;
