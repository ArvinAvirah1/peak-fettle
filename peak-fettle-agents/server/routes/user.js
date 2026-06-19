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

// users has NO stored age_band / is_paid columns — both are derived (see
// USER_PROFILE_SELECT in auth.js). Selecting them bare crashes with 42703.
// (Found 2026-06-12 by the LIFEOS review sweep; bug predates the Life OS work
// — both GDPR export endpoints below were selecting nonexistent columns.)
const AGE_BAND_SQL = `CASE
        WHEN birth_date IS NULL THEN NULL
        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 18 THEN 'under-18'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 25 THEN '18-24'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 35 THEN '25-34'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 45 THEN '35-44'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 55 THEN '45-54'
        ELSE '55+'
    END AS age_band`;

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
                        sex, ${AGE_BAND_SQL}, (tier = 'paid') AS is_paid, created_at
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
                        s.set_index, s.logged_at
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
                // streak-col-mismatch fix (2026-06-14): actual column names per schema are
                // current_streak_days, longest_streak_days, last_session_date.
                `SELECT current_streak_days, longest_streak_days, last_session_date
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
            // account-delete-orphan-silent-failure fix (2026-06-14): await the INSERT
            // so that a failure is logged before we return 200. The 200 is still sent
            // because the user's data is already deleted; the auth orphan is a cleanup
            // concern, not a reason to report failure to the user.
            try {
                await pool.query(
                    `INSERT INTO orphaned_auth_records (auth_uid, reason)
                     VALUES ($1, $2)`,
                    [uid, authDeleteError.message]
                );
            } catch (insertErr) {
                console.error(
                    '[ALERT][TICKET-030] Failed to record orphan for uid=%s: %s',
                    uid,
                    insertErr.message
                );
            }
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
// POST /user/push-token
// Register a device push token for this user.
// Body: { token: string, platform: 'ios' | 'android' }
// Upserts users.fcm_token — the push-dispatcher reads this column.
// Safe to call multiple times (idempotent).
// ---------------------------------------------------------------------------
router.post('/push-token', async (req, res, next) => {
    try {
        const { token, platform } = req.body ?? {};

        if (typeof token !== 'string' || token.length === 0 || token.length > 512) {
            return res.status(400).json({
                error: 'invalid_token',
                message: 'token must be a non-empty string of ≤512 characters.',
            });
        }
        if (!['ios', 'android'].includes(platform)) {
            return res.status(400).json({
                error: 'invalid_platform',
                message: "platform must be 'ios' or 'android'.",
            });
        }

        await pool.query(
            `UPDATE users SET fcm_token = $1 WHERE id = $2`,
            [token, req.user.id]
        );

        res.status(204).end();
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// DELETE /user/push-token
// Unregister the device push token (call on logout).
// Body: { token: string } — only clears the token if it matches the stored value
// so concurrent logouts from multiple devices don't clobber each other.
// ---------------------------------------------------------------------------
router.delete('/push-token', async (req, res, next) => {
    try {
        const { token } = req.body ?? {};

        if (typeof token !== 'string' || token.length === 0) {
            return res.status(400).json({
                error: 'invalid_token',
                message: 'token must be a non-empty string.',
            });
        }

        await pool.query(
            `UPDATE users SET fcm_token = NULL WHERE id = $1 AND fcm_token = $2`,
            [req.user.id, token]
        );

        res.status(204).end();
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
//   training_goal        — 'strength'|'hypertrophy'|'endurance'|'sport_performance'|'general_fitness'
//   sessions_per_week    — integer 1–7
//   session_minutes      — 15|30|45|60|90
//   goal_weight_kg       — number 20–400 (nullable)
//   equipment_profile    — TEXT[] from the closed equipment vocabulary (spec §2)
//   season_phase         — 'off_season'|'in_season' (nullable)
//
// E-002: theme_preference is written by the mobile ThemeProvider whenever the
// user changes their theme. It is read at login and merged into the session so
// the selected theme follows the user across devices.
//
// Push token registration is handled by the dedicated POST /user/push-token
// endpoint — do not pass fcm_token here.
// ---------------------------------------------------------------------------
router.patch('/profile', async (req, res, next) => {
    try {
        const uid = req.user.id;
        const {
            display_name,
            unit_pref,
            experience_level,
            weight_class_kg,
            use_1rm_confirmation,
            theme_preference,
            sex,
            primary_discipline,
            show_wilks,
            // Training Engine spec §2 survey fields (2026-06-11)
            training_goal,
            sessions_per_week,
            session_minutes,
            goal_weight_kg,
            equipment_profile,
            season_phase,
        } = req.body ?? {};

        // Build SET clause dynamically — only update fields that were provided.
        const setClauses = [];
        const params = [uid]; // $1 is always user id

        // Display name — the username shown in the greeting + profile card. A Pro
        // user renaming themselves PATCHes ONLY { display_name }; before this
        // branch existed the handler recognised nothing, setClauses stayed empty,
        // and the request 400'd with `no_fields` (the confirmed root cause of the
        // "changing username returns 400" bug). Trim, then enforce 1–50 chars and
        // reject control characters so a stray newline/tab can't land in the name.
        if (display_name !== undefined) {
            if (typeof display_name !== 'string') {
                return res.status(400).json({
                    error: 'invalid_display_name',
                    message: 'display_name must be a string.',
                });
            }
            const trimmed = display_name.trim();
            // eslint-disable-next-line no-control-regex
            if (trimmed.length < 1 || trimmed.length > 50 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
                return res.status(400).json({
                    error: 'invalid_display_name',
                    message: 'display_name must be 1–50 characters and contain no control characters.',
                });
            }
            params.push(trimmed);
            setClauses.push(`display_name = $${params.length}`);
        }

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

        // TICKET-066: per-user Wilks2 display preference.
        if (show_wilks !== undefined) {
            if (typeof show_wilks !== 'boolean') {
                return res.status(400).json({
                    error: 'invalid_show_wilks',
                    message: 'show_wilks must be a boolean.',
                });
            }
            params.push(show_wilks);
            setClauses.push(`show_wilks = $${params.length}`);
        }

        // ROADMAP 1.6 fix (2026-06-11): sex and primary_discipline were
        // destructured + documented but never persisted — silent no-op bug.
        if (sex !== undefined) {
            if (!['MALE', 'FEMALE', 'UNDISCLOSED'].includes(sex)) {
                return res.status(400).json({
                    error: 'invalid_sex',
                    message: "sex must be 'MALE', 'FEMALE' or 'UNDISCLOSED'.",
                });
            }
            params.push(sex);
            setClauses.push(`sex = $${params.length}`);
        }

        const VALID_DISCIPLINES = ['powerlifting', 'weightlifting', 'general_strength',
                                   'running', 'cycling', 'swimming', 'other'];
        if (primary_discipline !== undefined) {
            if (!VALID_DISCIPLINES.includes(primary_discipline)) {
                return res.status(400).json({
                    error: 'invalid_primary_discipline',
                    message: `primary_discipline must be one of: ${VALID_DISCIPLINES.join(', ')}.`,
                });
            }
            params.push(primary_discipline);
            setClauses.push(`primary_discipline = $${params.length}`);
        }

        // ── Training Engine survey fields (spec §2, 2026-06-11) ─────────────
        if (training_goal !== undefined) {
            const VALID_GOALS = ['strength', 'hypertrophy', 'endurance',
                                 'sport_performance', 'general_fitness'];
            if (training_goal !== null && !VALID_GOALS.includes(training_goal)) {
                return res.status(400).json({
                    error: 'invalid_training_goal',
                    message: `training_goal must be one of: ${VALID_GOALS.join(', ')}.`,
                });
            }
            params.push(training_goal);
            setClauses.push(`training_goal = $${params.length}`);
        }

        if (sessions_per_week !== undefined) {
            const spw = Number(sessions_per_week);
            if (sessions_per_week !== null &&
                (!Number.isInteger(spw) || spw < 1 || spw > 7)) {
                return res.status(400).json({
                    error: 'invalid_sessions_per_week',
                    message: 'sessions_per_week must be an integer between 1 and 7.',
                });
            }
            params.push(sessions_per_week === null ? null : spw);
            setClauses.push(`sessions_per_week = $${params.length}`);
        }

        if (session_minutes !== undefined) {
            const sm = Number(session_minutes);
            if (session_minutes !== null && ![15, 30, 45, 60, 90].includes(sm)) {
                return res.status(400).json({
                    error: 'invalid_session_minutes',
                    message: 'session_minutes must be one of: 15, 30, 45, 60, 90.',
                });
            }
            params.push(session_minutes === null ? null : sm);
            setClauses.push(`session_minutes = $${params.length}`);
        }

        if (goal_weight_kg !== undefined) {
            const gw = Number(goal_weight_kg);
            if (goal_weight_kg !== null &&
                (!Number.isFinite(gw) || gw < 20 || gw > 400)) {
                return res.status(400).json({
                    error: 'invalid_goal_weight_kg',
                    message: 'goal_weight_kg must be a number between 20 and 400, or null.',
                });
            }
            params.push(goal_weight_kg === null ? null : gw);
            setClauses.push(`goal_weight_kg = $${params.length}`);
        }

        if (equipment_profile !== undefined) {
            const VALID_EQUIPMENT = ['barbell', 'dumbbell', 'kettlebell', 'machine',
                                     'cable', 'bodyweight', 'bands', 'bench', 'rack',
                                     'pullup_bar', 'bike', 'treadmill', 'pool', 'track'];
            if (equipment_profile !== null &&
                (!Array.isArray(equipment_profile) ||
                 equipment_profile.some(e => !VALID_EQUIPMENT.includes(e)))) {
                return res.status(400).json({
                    error: 'invalid_equipment_profile',
                    message: `equipment_profile must be null or an array drawn from: ${VALID_EQUIPMENT.join(', ')}.`,
                });
            }
            params.push(equipment_profile);
            setClauses.push(`equipment_profile = $${params.length}`);
        }

        if (season_phase !== undefined) {
            if (season_phase !== null && !['off_season', 'in_season'].includes(season_phase)) {
                return res.status(400).json({
                    error: 'invalid_season_phase',
                    message: "season_phase must be 'off_season', 'in_season' or null.",
                });
            }
            params.push(season_phase);
            setClauses.push(`season_phase = $${params.length}`);
        }

        if (setClauses.length === 0) {
            return res.status(400).json({
                error: 'no_fields',
                message: 'Provide at least one field to update.',
            });
        }

        // SERVER-2 (2026-06-13): build the RETURNING list from ONLY the columns
        // actually being updated (derived from the dynamic SET clause) plus id.
        // Previously this RETURNed a fixed superset of optional survey columns,
        // so on an account whose schema predates one of them (before the
        // ensure-everything migration runs) a single unrelated field update —
        // e.g. PATCH { unit_pref } — would 500 with 42703 because RETURNING
        // referenced a column that does not exist. Returning only the touched
        // columns means a missing optional column can never break an update
        // that does not involve it. `id` and `unit_pref` are always included so
        // the response always carries the user's unit preference.
        const updatedColumns = setClauses.map((clause) => clause.split('=')[0].trim());
        const returningSet = new Set(['id', 'unit_pref', ...updatedColumns]);
        const returningList = [...returningSet].join(', ');

        const { rows } = await pool.query(
            `UPDATE users
             SET ${setClauses.join(', ')}
             WHERE id = $1
             RETURNING ${returningList}`,
            params
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'user_not_found', message: 'User not found.' });
        }

        res.json({ profile: rows[0] });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /user/export
// Full JSON data dump — Training Engine spec §4.
// Returns profile (minus internal flags), workouts+sets (decoded weight_kg =
// weight_raw/8.0), plans, constraints, health metrics, PBs.
// NOT paid-gated — export is a user-data-rights feature for all tiers.
//
// Uses the existing exportLimiter (5 requests/hour) to throttle heavy I/O.
// ---------------------------------------------------------------------------
router.get('/export', exportLimiter, async (req, res, next) => {
    try {
        const uid = req.user.id;

        const [
            profileResult,
            workoutsResult,
            setsResult,
            plansResult,
            constraintsResult,
            healthMetricsResult,
            pbsResult,
        ] = await Promise.all([
            pool.query(
                `SELECT id, email, experience_level, weight_class_kg,
                        sex, ${AGE_BAND_SQL}, unit_pref, training_goal,
                        sessions_per_week, session_minutes, goal_weight_kg,
                        equipment_profile, season_phase, primary_discipline,
                        created_at
                 FROM users WHERE id = $1`,
                [uid]
            ),
            pool.query(
                `SELECT id, day_key, notes, routine_name, created_at
                 FROM workouts WHERE user_id = $1
                 ORDER BY day_key DESC`,
                [uid]
            ),
            pool.query(
                `SELECT s.id, s.workout_id, w.day_key,
                        e.name AS exercise,
                        s.weight_raw / 8.0 AS weight_kg,
                        s.reps, s.rir, s.kind, s.set_index, s.logged_at
                 FROM sets s
                 JOIN workouts w ON w.id = s.workout_id
                 JOIN exercises e ON e.id = s.exercise_id
                 WHERE w.user_id = $1
                 ORDER BY s.logged_at DESC`,
                [uid]
            ),
            pool.query(
                `SELECT id, name, is_ai_generated, is_template, created_at, updated_at
                 FROM plans WHERE user_id = $1
                 ORDER BY created_at DESC`,
                [uid]
            ),
            pool.query(
                `SELECT constraint_type, custom_note, created_at
                 FROM user_constraints WHERE user_id = $1`,
                [uid]
            ),
            pool.query(
                `SELECT date, resting_hr_bpm, hrv_ms, sleep_hours, active_kcal, source
                 FROM daily_health_metrics WHERE user_id = $1
                 ORDER BY date DESC`,
                [uid]
            ),
            // Personal bests: best e1RM per exercise (Epley, reps capped 12)
            pool.query(
                `SELECT e.name AS exercise,
                        MAX(
                            CASE
                                WHEN s.reps = 1 THEN s.weight_raw / 8.0
                                ELSE (s.weight_raw / 8.0) * (1.0 + LEAST(s.reps, 12)::float / 30.0)
                            END
                        ) AS best_e1rm_kg,
                        MAX(s.weight_raw / 8.0) AS best_weight_kg
                 FROM sets s
                 JOIN workouts w ON w.id = s.workout_id
                 JOIN exercises e ON e.id = s.exercise_id
                 WHERE w.user_id = $1
                   AND s.kind = 'lift'
                   AND s.weight_raw > 0
                   AND s.reps >= 1
                 GROUP BY e.name
                 ORDER BY e.name`,
                [uid]
            ),
        ]);

        const exportPayload = {
            exported_at:    new Date().toISOString(),
            data_version:   '2.0',
            data_categories: ['profile', 'workouts', 'sets', 'plans', 'constraints', 'health_metrics', 'personal_bests'],
            profile:              profileResult.rows[0] ?? null,
            workouts:             workoutsResult.rows,
            sets:                 setsResult.rows,
            plans:                plansResult.rows,
            constraints:          constraintsResult.rows,
            health_metrics:       healthMetricsResult.rows,
            personal_bests:       pbsResult.rows,
        };

        res.setHeader(
            'Content-Disposition',
            `attachment; filename="peak-fettle-export-${new Date().toISOString().slice(0, 10)}.json"`
        );
        res.setHeader('Content-Type', 'application/json');
        res.json(exportPayload);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /user/export.csv
// Sets flattened as CSV: day_key,exercise,weight_kg,reps,rir,kind
// Stream-friendly: rows written individually via res.write.
// NOT paid-gated.
// ---------------------------------------------------------------------------
router.get('/export.csv', exportLimiter, async (req, res, next) => {
    try {
        const uid = req.user.id;

        const { rows } = await pool.query(
            `SELECT w.day_key,
                    e.name AS exercise,
                    s.weight_raw / 8.0 AS weight_kg,
                    s.reps,
                    s.rir,
                    s.kind
             FROM sets s
             JOIN workouts w ON w.id = s.workout_id
             JOIN exercises e ON e.id = s.exercise_id
             WHERE w.user_id = $1
               AND s.kind = 'lift'
             ORDER BY w.day_key DESC, s.logged_at DESC`,
            [uid]
        );

        res.setHeader(
            'Content-Disposition',
            `attachment; filename="peak-fettle-sets-${new Date().toISOString().slice(0, 10)}.csv"`
        );
        res.setHeader('Content-Type', 'text/csv');

        // Write header
        res.write('day_key,exercise,weight_kg,reps,rir,kind\n');

        // Write rows — stream-friendly
        for (const row of rows) {
            // Escape any commas or quotes in the exercise name
            const exercise = `"${String(row.exercise ?? '').replace(/"/g, '""')}"`;
            const weight = row.weight_kg != null ? parseFloat(row.weight_kg).toFixed(2) : '';
            const reps   = row.reps     != null ? row.reps    : '';
            const rir    = row.rir      != null ? row.rir     : '';
            const kind   = row.kind     != null ? row.kind    : '';
            res.write(`${row.day_key},${exercise},${weight},${reps},${rir},${kind}\n`);
        }

        res.end();
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /user/profile — core profile + entitlements (LIFEOS TICKET-101 #3).
//
// `lifeos_access` is DERIVED server-side from users.tier — never stored, never
// computed client-side, so a manipulated JWT or client build cannot grant it
// (pen-test item in LIFEOS TICKET-113). Plumbing stays separable (Q31): a
// future standalone SKU only changes this derivation.
// ---------------------------------------------------------------------------
router.get('/profile', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, email, display_name, tier, unit_pref, experience_level
             FROM users WHERE id = $1 AND deleted_at IS NULL`,
            [req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'user_not_found' });
        }
        const user = rows[0];
        res.json({
            ...user,
            lifeos_access: user.tier === 'paid',
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /user/upgrade  — flip the current user to Pro (tier='paid').
// POST /user/downgrade — flip the current user to Free (tier='free').
//
// PHASE-6 (per-user Pro toggle): the canonical tier flag is `users.tier`
// ('free'|'paid'); there is NO `is_paid` column — it is DERIVED as `(tier =
// 'paid')` (see requirePaid.js + auth.js USER_PROFILE_SELECT). Both routes set
// `tier` and RETURN the SAME shape GET /user/profile returns (id, email,
// display_name, tier, unit_pref, experience_level, + derived is_paid /
// lifeos_access) so the client can drop the result straight into its `User`.
//
// Both are IDEMPOTENT: re-calling on an already-paid / already-free user is a
// harmless no-op that still returns the current user object. The `updated_at`
// bump is also handled by the trg_users_updated trigger; we set it explicitly
// to match scripts/grant-pro.js and stay correct even if the trigger is absent
// on a drifted DB.
//
// Drift tolerance: the RETURNING list uses only core `users` columns that exist
// in both the canonical schema and GET /user/profile's own SELECT, so a 42703
// is not expected — but per the PHASE-6 mandate we still catch 42P01/42703 and
// degrade to a minimal UPDATE + re-SELECT rather than 500. Any other DB error
// propagates via next(err).
//
// upgrade() deliberately does NOT touch `comp_pro` (comps are managed only by
// scripts/grant-pro.js); downgrade() likewise leaves `comp_pro` as-is and NEVER
// deletes any server data — Free mode simply stops reading/writing the server
// (local-first), so all rows are retained for a later re-upgrade.
// ---------------------------------------------------------------------------

// Columns returned by both tier-toggle routes — mirrors GET /user/profile and
// the client `User` shape. `is_paid` is derived; never selected as a column.
const TIER_RETURNING = `id, email, display_name, tier, unit_pref, experience_level,
                        (tier = 'paid') AS is_paid`;

// Bare fallback used only if the full RETURNING above hits a drifted/missing
// column (42703) — still enough to drive the client's is_paid/tier flip.
const TIER_RETURNING_MIN = `id, tier, (tier = 'paid') AS is_paid`;

async function setTier(req, res, next, nextTier) {
    try {
        let rows;
        try {
            ({ rows } = await pool.query(
                `UPDATE users SET tier = $2, updated_at = NOW()
                 WHERE id = $1 AND deleted_at IS NULL
                 RETURNING ${TIER_RETURNING}`,
                [req.user.id, nextTier]
            ));
        } catch (colErr) {
            // 42703 undefined_column / 42P01 undefined_table → degrade: perform a
            // minimal update that cannot reference a drifted optional column.
            if (colErr && (colErr.code === '42703' || colErr.code === '42P01')) {
                ({ rows } = await pool.query(
                    `UPDATE users SET tier = $2
                     WHERE id = $1 AND deleted_at IS NULL
                     RETURNING ${TIER_RETURNING_MIN}`,
                    [req.user.id, nextTier]
                ));
            } else {
                throw colErr;
            }
        }

        if (rows.length === 0) {
            return res.status(404).json({ error: 'user_not_found' });
        }

        const user = rows[0];
        res.json({
            user: {
                ...user,
                // Match GET /user/profile exactly so the client can reuse either field.
                lifeos_access: user.tier === 'paid',
            },
        });
    } catch (err) { next(err); }
}

// POST /user/upgrade — set tier='paid'. Idempotent. Does NOT touch comp_pro.
router.post('/upgrade', (req, res, next) => setTier(req, res, next, 'paid'));

// POST /user/downgrade — set tier='free'. Idempotent. KEEPS all server data
// (no DELETE); Free mode is local-first and simply stops touching the server.
router.post('/downgrade', (req, res, next) => setTier(req, res, next, 'free'));

module.exports = router;
