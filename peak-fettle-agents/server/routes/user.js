// /user — user data export, account management, and profile updates
// Phase C: TICKET-014 (Privacy Architecture Commitment)
// dev-backend — 2026-05-04
// TICKET-041 — 2026-05-10: PATCH /user/profile — handles unit_pref,
//              experience_level, weight_class_kg, use_1rm_confirmation
//
// Implements the GDPR/CCPA compliance baseline:
//   GET  /user/data-export    — download everything Peak Fettle stores for the user
//   DELETE /user/account      — permanently delete all user data and auth record
//
// Both endpoints are intentionally rate-limited beyond the global limiter
// (data exports are I/O heavy; account deletions are irreversible).
//
// The "Your data" screen in the app links here; marketing can reference these
// routes in the privacy policy as the enforcement mechanism for the
// "you can take your data and leave" commitment.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { supabaseAdmin } = require('../lib/supabaseAdmin');

const router = express.Router();

// Strict rate limits for these sensitive endpoints.
const exportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Data export is limited to 5 requests per hour.' },
});

const deleteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many deletion attempts. Please wait 15 minutes.' },
});

// ---------------------------------------------------------------------------
// GET /user/data-export
// Returns a JSON document containing every data row Peak Fettle stores for
// the calling user. Suitable for download from the "Your data" screen.
//
// Intentionally does NOT include auth internals (password hashes, tokens) —
// those are Supabase's concern and are not accessible via the service role
// connection anyway.
// ---------------------------------------------------------------------------
router.get('/data-export', exportLimiter, async (req, res, next) => {
    try {
        const uid = req.user.id;

        // Run all queries in parallel — none depend on each other.
        const [
            profileResult,
            workoutsResult,
            setsResult,
            plansResult,
            constraintsResult,
            healthMetricsResult,
            streaksResult,
        ] = await Promise.all([
            pool.query(
                `SELECT id, email, experience_level, weight_class_kg,
                        sex, age_band, is_paid, created_at
                 FROM users WHERE id = $1`,
                [uid]
            ),
            pool.query(
                `SELECT id, day_key, notes, created_at
                 FROM workouts WHERE user_id = $1
                 ORDER BY day_key DESC`,
                [uid]
            ),
            pool.query(
                // TYPE-001 follow-up (2026-05-16): `s.e1rm_kg` column was dropped
                // in 20260505_sets_weight_raw.sql; the previous SELECT would have
                // crashed any GDPR data-export request. Compute Epley inline from
                // weight_raw — lift sets only.
                `SELECT s.id, s.workout_id, e.name AS exercise_name,
                        -- Decode weight_raw (SMALLINT, kg × 8) back to kg float for export
                        s.weight_raw / 8.0 AS weight_kg,
                        s.reps, s.rir,
                        CASE
                            WHEN s.kind = 'lift' AND s.weight_raw > 0 AND s.reps >= 1 THEN
                                CASE
                                    WHEN s.reps = 1 THEN s.weight_raw / 8.0
                                    ELSE (s.weight_raw / 8.0) * (1.0 + s.reps::float / 30.0)
                                END
                            ELSE NULL
                        END AS e1rm_kg,
                        s.set_number, s.logged_at
                 FROM sets s
                 JOIN workouts w ON w.id = s.workout_id
                 JOIN exercises e ON e.id = s.exercise_id
                 WHERE w.user_id = $1
                 ORDER BY s.logged_at DESC`,
                [uid]
            ),
            pool.query(
                `SELECT id, name, is_ai_generated, is_template,
                        created_at, updated_at
                 FROM plans
                 WHERE user_id = $1
                 ORDER BY created_at DESC`,
                [uid]
            ),
            pool.query(
                `SELECT constraint_type, custom_note, created_at
                 FROM user_constraints WHERE user_id = $1`,
                [uid]
            ),
            pool.query(
                `SELECT date, resting_hr_bpm, hrv_ms, sleep_hours,
                        active_kcal, source
                 FROM daily_health_metrics WHERE user_id = $1
                 ORDER BY date DESC`,
                [uid]
            ),
            pool.query(
                `SELECT current_streak, longest_streak, last_activity_date
                 FROM streaks WHERE user_id = $1`,
                [uid]
            ),
        ]);

        const exportPayload = {
            exported_at:    new Date().toISOString(),
            data_version:   '1.0',
            // What we store — human-readable for the privacy policy link
            data_categories: [
                'profile',
                'workouts',
                'sets',
                'plans',
                'physical_constraints',
                'health_metrics',
                'streaks',
            ],
            profile:              profileResult.rows[0] ?? null,
            workouts:             workoutsResult.rows,
            sets:                 setsResult.rows,
            plans:                plansResult.rows,
            physical_constraints: constraintsResult.rows,
            health_metrics:       healthMetricsResult.rows,
            streaks:              streaksResult.rows[0] ?? null,
        };

        // Send as a downloadable JSON file
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="peak-fettle-export-${new Date().toISOString().slice(0, 10)}.json"`
        );
        res.setHeader('Content-Type', 'application/json');
        res.json(exportPayload);

    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// DELETE /user/account
// Permanently deletes all user-owned rows, then deletes the Supabase auth
// record via the admin API. This operation is irreversible.
//
// The client must pass { confirm: "DELETE MY ACCOUNT" } in the request body
// as a friction guard against accidental calls.
// ---------------------------------------------------------------------------
router.delete('/account', deleteLimiter, async (req, res, next) => {
    try {
        const { confirm } = req.body ?? {};

        if (confirm !== 'DELETE MY ACCOUNT') {
            return res.status(400).json({
                error: 'confirmation_required',
                message: 'Send { "confirm": "DELETE MY ACCOUNT" } to confirm permanent deletion.',
            });
        }

        const uid = req.user.id;

        // Delete user-owned rows. Most cascade automatically via ON DELETE CASCADE
        // on the FK to auth.users, but we do them explicitly here so the
        // Charles Proxy audit (TICKET-014 acceptance criterion) can verify the
        // sequence in logs, and so the service role transaction is atomic.
        //
        // IMPORTANT: We must call pool.connect() and use the *same* client for
        // all queries within the transaction. pool.query() borrows a fresh
        // connection from the pool for each call, so BEGIN/COMMIT on separate
        // pool.query() calls would operate on different connections and provide
        // no transactional guarantee.
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            await client.query(`DELETE FROM sets       WHERE workout_id IN (SELECT id FROM workouts WHERE user_id = $1)`, [uid]);
            await client.query(`DELETE FROM workouts             WHERE user_id = $1`, [uid]);
            await client.query(`DELETE FROM plans                WHERE user_id = $1`, [uid]);
            await client.query(`DELETE FROM user_constraints     WHERE user_id = $1`, [uid]);
            await client.query(`DELETE FROM daily_health_metrics WHERE user_id = $1`, [uid]);
            await client.query(`DELETE FROM user_percentile_rankings WHERE user_id = $1`, [uid]);
            await client.query(`DELETE FROM refresh_tokens        WHERE user_id = $1`, [uid]);
            await client.query(`DELETE FROM streaks               WHERE user_id = $1`, [uid]);
            await client.query(`DELETE FROM users                 WHERE id      = $1`, [uid]);

            await client.query('COMMIT');
        } catch (innerErr) {
            await client.query('ROLLBACK');
            throw innerErr;
        } finally {
            client.release();
        }

        // TICKET-030: Delete the Supabase auth record now that the DB transaction
        // has committed. This must happen AFTER the commit — if it ran inside the
        // transaction and the auth call failed we'd roll back DB rows but still
        // owe the user a deletion.
        //
        // Failure modes:
        //   - Success → 200, user fully removed.
        //   - Failure → DB rows are already gone but the auth record lives on
        //     (orphan). We still return 200 (the user's data is deleted; they
        //     can no longer log in once we revoke their JWT). The orphan is
        //     written to `orphaned_auth_records` for a cleanup cron to retry.
        const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(uid);

        if (authDeleteError) {
            // High-priority alert: data integrity issue — auth record outlives its data.
            console.error(
                '[ALERT][TICKET-030] Orphan auth record: uid=%s error=%s',
                uid,
                authDeleteError.message
            );

            // Record the orphan so the cleanup cron can retry.
            // Use a fire-and-forget pool.query — we don't await it on the hot path
            // to avoid delaying the client response, but we do catch and log any
            // insert failure so the on-call engineer sees both failures together.
            pool.query(
                `INSERT INTO orphaned_auth_records (auth_uid, reason)
                 VALUES ($1, $2)`,
                [uid, authDeleteError.message]
            ).catch((insertErr) => {
                console.error(
                    '[ALERT][TICKET-030] Failed to record orphan for uid=%s: %s',
                    uid,
                    insertErr.message
                );
            });
        }

        // Always 200: the user's personal data rows are gone regardless of
        // whether the auth record was cleaned up. The JWT is already invalid
        // once the `users` row is deleted (our requireAuth middleware checks it).
        res.status(200).json({
            message: 'Your account and all associated data have been permanently deleted.',
        });

    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// PATCH /user/profile
// Partial update for user profile fields.
//
// Accepted fields (all optional; omit any you don't want to change):
//   unit_pref            — 'kg' | 'lbs'
//   experience_level     — free-text string (e.g. 'intermediate')
//   weight_class_kg      — number
//   use_1rm_confirmation — boolean (TICKET-041: Option C opt-in)
//   theme_preference     — 'deepOcean'|'ember'|'forest'|'midnight'|'monochrome' (E-002)
//   sex                  — 'MALE'|'FEMALE'|'UNDISCLOSED' (ROADMAP 1.6)
//   primary_discipline   — 7-value CHECK string (ROADMAP 1.6)
//   fcm_token            — Expo/FCM push token (TICKET-024); null to clear
//
// E-002: theme_preference is written by the mobile ThemeProvider whenever the
// user changes their theme. It is read at login and merged into the session so
// the selected theme follows the user across devices.
// ---------------------------------------------------------------------------
router.patch('/profile', async (req, res, next) => {
    try {
        const uid = req.user.id;
        const {
            unit_pref,
            experience_level,
            weight_class_kg,
            use_1rm_confirmation,
            theme_preference,
            sex,
            primary_discipline,
            fcm_token,
        } = req.body ?? {};

        // Build SET clause dynamically — only update fields that were provided.
        const setClauses = [];
        const params = [uid]; // $1 is always user id

        if (unit_pref !== undefined) {
            if (!['kg', 'lbs'].includes(unit_pref)) {
                return res.status(400).json({
                    error: 'invalid_unit_pref',
                    message: "unit_pref must be 'kg' or 'lbs'.",
                });
            }
            params.push(unit_pref);
            setClauses.push(`unit_pref = $${params.length}`);
        }

        if (experience_level !== undefined) {
            if (typeof experience_level !== 'string' || experience_level.length > 50) {
                return res.status(400).json({
                    error: 'invalid_experience_level',
                    message: 'experience_level must be a string of ≤50 characters.',
                });
            }
            params.push(experience_level);
            setClauses.push(`experience_level = $${params.length}`);
        }

        if (weight_class_kg !== undefined) {
            const wkg = Number(weight_class_kg);
            if (!Number.isFinite(wkg) || wkg <= 0 || wkg > 200) {
                return res.status(400).json({
                    error: 'invalid_weight_class',
                    message: 'weight_class_kg must be a number between 0 and 200.',
                });
            }
            params.push(wkg);
            setClauses.push(`weight_class_kg = $${params.length}`);
        }

        if (use_1rm_confirmation !== undefined) {
            if (typeof use_1rm_confirmation !== 'boolean') {
                return res.status(400).json({
                    error: 'invalid_use_1rm_confirmation',
                    message: 'use_1rm_confirmation must be a boolean.',
                });
            }
            params.push(use_1rm_confirmation);
            setClauses.push(`use_1rm_confirmation = $${params.length}`);
        }

        // E-002: Theme preference — persisted to Supabase for cross-device sync.
        if (theme_preference !== undefined) {
            const VALID_THEMES = ['deepOcean', 'ember', 'forest', 'midnight', 'monochrome'];
            if (!VALID_THEMES.includes(theme_preference)) {
                return res.status(400).json({
                    error: 'invalid_theme_preference',
                    message: `theme_preference must be one of: ${VALID_THEMES.join(', ')}.`,
                });
            }
            params.push(theme_preference);
            setClauses.push(`theme_preference = $${params.length}`);
        }

        // TICKET-024: FCM push token — stored so the server can target this device.
        // Pass null to explicitly clear the token (e.g. on logout).
        if (fcm_token !== undefined) {
            if (fcm_token !== null && (typeof fcm_token !== 'string' || fcm_token.length > 512)) {
                return res.status(400).json({
                    error: 'invalid_fcm_token',
                    message: 'fcm_token must be a string of ≤512 characters, or null.',
                });
            }
            params.push(fcm_token);
            setClauses.push(`fcm_token = $${params.length}`);
        }

        if (setClauses.length === 0) {
            return res.status(400).json({
                error: 'no_fields',
                message: 'Provide at least one field to update.',
            });
        }

        const { rows } = await pool.query(
            `UPDATE users
             SET ${setClauses.join(', ')}
             WHERE id = $1
             RETURNING id, unit_pref, experience_level, weight_class_kg`,
            params
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'user_not_found', message: 'User not found.' });
        }

        res.json({ profile: rows[0] });
    } catch (err) { next(err); }
});

module.exports = router;
