// /percentile — read a user's precomputed percentile rankings
// dev-backend — 2026-05-02
// TICKET-032 — 2026-05-10: v2 response shape — both percentile fields surfaced
// TICKET-036 — 2026-05-10: 1.6 arch — cohort_size_internal added; DOTS note
//              added to cohort_note per ROADMAP 2.3 (Marcus transparency requirement).
// TICKET-041 — 2026-05-10: 1RM confirmation — is_estimated, epley_estimate_kg,
//              confirmed_1rm_kg surfaced per ranking; POST /percentile/confirm-1rm added.
//
// Phase D: cohort percentile UI (Phase B adds this route as a read-only stub
// against user_percentile_rankings, which is populated by the weekly cron job).
//
// CTO guardrail #2: percentile rankings are read from the batch-computed table;
// no live math happens here. compute_percentile() is called only by the cron.
// The lightweight Epley estimate (w × (1 + reps/30)) computed in GET /percentile
// is simple arithmetic — not a percentile computation — and is exempt.
//
// PERCENTILE STRATEGY (v2 — current implementation):
//   • Ranking formula: DOTS (exec decision, 2026-05-10). DOTS normalises for
//     bodyweight using a polynomial fit to competition data. Wilks and the Peak
//     Fettle Score are available as display preferences but do not drive the rank.
//   • Undisclosed sex: ranked against μ_mid=(μ_M+μ_F)/2, σ_mid=sqrt((σ_M²+σ_F²)/2).
//   • Cohort dimensions: age band × biological sex × primary discipline × experience band.
//   • Reference population: Open Powerlifting database + race result datasets (strength
//     and cardio respectively) seed the percentile model on Day 1 — external rows do
//     NOT count toward cohort_size_internal (confidence ring uses internal only).
//   • Future (TICKET-016): cohort-based percentiles conditional on 500+ internal users
//     per cohort. v2 log-normal model remains the fallback indefinitely.
//
// Response shape (TICKET-036):
//   percentile            — experience-adjusted (sex × BW × age × training years)
//                           interpretation: "vs. lifters at your level"
//   percentile_simple     — gender + BW only (no age or experience factor)
//                           interpretation: "vs. all strength trainees"
//   cohort_size_internal  — count of internal Peak Fettle users in this cohort
//                           (drives the confidence ring; excludes reference data)
//   All three fields are nullable — null means the batch job has not yet run.
//
// Routes:
//   GET  /percentile              — all rankings for the calling user
//   GET  /percentile/:liftId      — one ranking for a specific lift
//   GET  /percentile/lift/:liftId — alias (more REST-friendly)
//   POST /percentile/confirm-1rm  — upsert a user-confirmed 1RM for a lift

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// DOTS note constant — used in cohort_note and /:liftId response.
// Satisfies ROADMAP 2.3: Marcus transparency requirement — the modal must
// explicitly confirm that DOTS drives the percentile rank.
const DOTS_NOTE =
    'Your percentile is calculated using your DOTS score — a formula that ' +
    'normalises your lift for bodyweight and is used by international ' +
    'powerlifting federations. Wilks and the Peak Fettle Score are available ' +
    'as display options in settings but do not change your rank.';

const WILKS_NOTE = 'Wilks2 (2020) score — compares strength across bodyweight classes. Higher = stronger relative to bodyweight.';

const COHORT_NOTE =
    'Rankings compare you against athletes in your age group, experience tier, ' +
    'and primary discipline. ' + DOTS_NOTE + ' Updated every Sunday night (UTC).';

// ---------------------------------------------------------------------------
// GET /percentile
// Returns all of the calling user's percentile rankings, sorted by lift_id.
// Reads only model_version = 2 rows (v1 rows preserved for one audit cycle
// but not surfaced to clients — TICKET-032).
//
// Response:
//   {
//     rankings: [
//       {
//         lift_id,
//         percentile,            — experience-adjusted (null if not yet computed)
//         percentile_simple,     — gender + BW only   (null if not yet computed)
//         cohort_size_internal,  — internal Peak Fettle users in cohort (for ring)
//         is_estimated,          — true if ranking used an Epley estimate (TICKET-041)
//         epley_estimate_kg,     — best Epley estimate from logged sets (for confirm UI)
//         confirmed_1rm_kg,      — user's confirmed value if set, else null
//         computed_at,
//         model_version
//       },
//       ...
//     ],
//     cohort_note: "...",     — includes explicit DOTS attribution (ROADMAP 2.3)
//     dots_note:   "..."      — standalone DOTS explanation for the transparency modal
//   }
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT
                upr.lift_id,
                upr.percentile,
                upr.percentile_simple,
                upr.cohort_size_internal,
                upr.is_estimated,
                upr.computed_at,
                upr.model_version,
                -- User's confirmed 1RM (null if not confirmed)
                ucr.confirmed_kg                                        AS confirmed_1rm_kg,
                -- Best Epley estimate from the user's logged sets for this lift.
                -- Lightweight arithmetic — not a percentile computation (CTO guardrail exempt).
                -- BUG-002 fix: e1rm_kg column was dropped; compute Epley inline from
                -- weight_raw (SMALLINT, kg × 8). reps == 1 returns the raw weight directly.
                -- EPLEY-001 fix (2026-05-16): explicit s.kind = 'lift' guard.
                (
                    SELECT MAX(
                        CASE
                            WHEN s.reps = 1 THEN s.weight_raw / 8.0
                            ELSE (s.weight_raw / 8.0) * (1.0 + s.reps::float / 30.0)
                        END
                    )
                    FROM sets s
                    JOIN workouts w ON w.id = s.workout_id
                    WHERE w.user_id = upr.user_id
                      AND s.exercise_id = upr.lift_id
                      AND s.kind = 'lift'
                      AND s.weight_raw > 0
                      AND s.reps >= 1
                )                                                       AS epley_estimate_kg,
                -- OD-2: wilks_score deferred — compute_wilks_score() DB function not
                -- yet deployed. Returns NULL until the migration lands. Clients should
                -- treat null wilks_score as "not yet available" (spec §OD-2).
                NULL::DOUBLE PRECISION                                  AS wilks_score
             FROM user_percentile_rankings upr
             LEFT JOIN user_confirmed_1rm ucr
                ON  ucr.user_id = upr.user_id
                AND ucr.lift_id = upr.lift_id
             WHERE upr.user_id = $1
               AND upr.model_version = 2
             ORDER BY upr.lift_id`,
            [req.user.id]
        );

        res.json({
            rankings: rows,
            cohort_note: COHORT_NOTE,
            // Standalone DOTS note for the 2.3 "How is this calculated?" modal.
            dots_note: DOTS_NOTE,
            wilks_note: WILKS_NOTE,
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /percentile/:liftId
// Returns one ranking for the calling user × a specific lift (model_version 2).
// liftId format: snake_case string, e.g. "back_squat", "bench_press".
// 404 if no ranking exists yet (user hasn't logged that lift, or cron
// hasn't run since they started logging it).
//
// Response includes is_estimated, epley_estimate_kg, confirmed_1rm_kg,
// and dots_note for the 2.3 transparency modal. (TICKET-041)
//
// Handler is extracted as a named function so the REST-friendly alias
// GET /percentile/lift/:liftId (BUG-012) can share the exact same logic.
// ---------------------------------------------------------------------------
async function percentileByLift(req, res, next) {
    try {
        const { rows } = await pool.query(
            `SELECT
                upr.lift_id,
                upr.percentile,
                upr.percentile_simple,
                upr.cohort_size_internal,
                upr.is_estimated,
                upr.computed_at,
                upr.model_version,
                ucr.confirmed_kg AS confirmed_1rm_kg,
                -- BUG-002 fix: compute Epley inline from weight_raw (e1rm_kg dropped).
                -- EPLEY-001 fix (2026-05-16): explicit s.kind = 'lift' guard.
                (
                    SELECT MAX(
                        CASE
                            WHEN s.reps = 1 THEN s.weight_raw / 8.0
                            ELSE (s.weight_raw / 8.0) * (1.0 + s.reps::float / 30.0)
                        END
                    )
                    FROM sets s
                    JOIN workouts w ON w.id = s.workout_id
                    WHERE w.user_id = upr.user_id
                      AND s.exercise_id = upr.lift_id
                      AND s.kind = 'lift'
                      AND s.weight_raw > 0
                      AND s.reps >= 1
                )                AS epley_estimate_kg,
                -- OD-2: wilks_score deferred — compute_wilks_score() not yet deployed.
                NULL::DOUBLE PRECISION AS wilks_score
             FROM user_percentile_rankings upr
             LEFT JOIN user_confirmed_1rm ucr
                ON  ucr.user_id = upr.user_id
                AND ucr.lift_id = upr.lift_id
             WHERE upr.user_id = $1
               AND upr.lift_id = $2
               AND upr.model_version = 2`,
            [req.user.id, req.params.liftId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: 'no_ranking',
                message: 'No percentile ranking found for this lift. ' +
                         'Log at least one set with this exercise and ' +
                         'check back after the next weekly update.',
            });
        }

        res.json({ ...rows[0], dots_note: DOTS_NOTE, wilks_note: WILKS_NOTE });
    } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Alias: GET /percentile/lift/:liftId → same handler as GET /percentile/:liftId
// More REST-friendly path; registered BEFORE /:liftId so Express does not
// capture the literal string "lift" as a liftId param value. (BUG-012)
// ---------------------------------------------------------------------------
router.get('/lift/:liftId', percentileByLift);

router.get('/:liftId', percentileByLift);

// ---------------------------------------------------------------------------
// POST /percentile/confirm-1rm
// Upserts a user-confirmed 1RM for a specific lift.
//
// Body: { lift_id: string, confirmed_kg: number }
//
// The confirmed value is stored in user_confirmed_1rm and will be used in
// place of the Epley estimate on the next batch run.  The ranking will
// show is_estimated=false after the next Sunday 03:00 UTC cron.
//
// The caller should show "Saved — your ranking updates on the next weekly
// run" after a successful response.
//
// Validation:
//   lift_id must be a non-empty string
//   confirmed_kg must be > 0 and ≤ 1000 (reasonable 1RM ceiling for safety)
// ---------------------------------------------------------------------------
router.post('/confirm-1rm', async (req, res, next) => {
    try {
        const { lift_id, confirmed_kg } = req.body ?? {};

        // Validate lift_id
        if (!lift_id || typeof lift_id !== 'string' || lift_id.trim().length === 0) {
            return res.status(400).json({
                error: 'invalid_lift_id',
                message: 'lift_id is required and must be a non-empty string.',
            });
        }

        // Validate confirmed_kg
        const kg = Number(confirmed_kg);
        if (!Number.isFinite(kg) || kg <= 0 || kg > 1000) {
            return res.status(400).json({
                error: 'invalid_confirmed_kg',
                message: 'confirmed_kg must be a number between 0 and 1000.',
            });
        }

        const { rows } = await pool.query(
            `INSERT INTO user_confirmed_1rm (user_id, lift_id, confirmed_kg, confirmed_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, lift_id) DO UPDATE
               SET confirmed_kg  = EXCLUDED.confirmed_kg,
                   confirmed_at  = EXCLUDED.confirmed_at
             RETURNING lift_id, confirmed_kg, confirmed_at`,
            [req.user.id, lift_id.trim(), kg]
        );

        res.status(200).json({
            lift_id:      rows[0].lift_id,
            confirmed_kg: rows[0].confirmed_kg,
            confirmed_at: rows[0].confirmed_at,
            message:      'Confirmed. Your ranking will update on the next weekly run.',
        });
    } catch (err) { next(err); }
});

module.exports = router;
