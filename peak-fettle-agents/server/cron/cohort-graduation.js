// Peak Fettle — Cohort Graduation Batch Job
// TICKET-037 | ROADMAP item 2.8 | dev-backend | 2026-05-10
//
// What this does:
//   Runs weekly (recommended: Sunday 04:00 UTC, after the percentile cron at 03:00).
//   For every user whose account is >=90 days old AND who has >=90 days of logged
//   workout data, it compares the user's self-reported experience band (derived from
//   users.years_in_sport) to their inferred experience band (derived from the
//   actual training_years in v_user_lift_inputs — which reflects logged history).
//
//   If the inferred band is HIGHER than the self-reported band, the user is
//   "graduated": their years_in_sport is updated to the floor of the new band,
//   and a push notification + in-app event is queued.
//
//   We never demote: if inferred < self-reported we leave the user where they are.
//   (A plateau in logged data is not evidence of lower experience — it may be
//   a training break, injury, or change in exercise selection.)
//
// Band definitions (must match compute_percentile_batch() in the migration):
//   '0-1': < 1 year
//   '1-3': 1–3 years
//   '3-7': 3–7 years
//   '7+' : >= 7 years
//
// CEO decision (exec-percentile-decisions.md §3):
//   "Cohort promotion is a retention event — push notification + in-app animation."
//   The CTO must scope the compute cost at 100k users before this ships at scale.
//
// Environment:
//   DATABASE_URL (or PG* env vars) via dotenv.
//   FCM_SERVER_KEY — for push notification delivery.
//   If FCM_SERVER_KEY is not set, notifications are queued in the
//   `notification_queue` table for a separate delivery service to pick up.
//
// Manual invocation:
//   node cron/cohort-graduation.js

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../db');
const { NOTIFICATION_TYPES } = require('../lib/notificationTypes');

// ---------------------------------------------------------------------------
// Band helpers — exported for tests
// ---------------------------------------------------------------------------

const BANDS = ['0-1', '1-3', '3-7', '7+'];

/** Returns the experience band string for a given years-in-sport value. */
function bandFromYears(years) {
    if (years == null || years < 0) return '0-1';
    if (years < 1) return '0-1';
    if (years < 3) return '1-3';
    if (years < 7) return '3-7';
    return '7+';
}

/** Returns the integer order of a band string (higher = more experienced). */
function bandOrder(band) {
    return BANDS.indexOf(band);
}

/**
 * Infers the experience band from the median training_years across all lifts
 * for this user (from v_user_lift_inputs).  Returns null if no data.
 */
function inferExperienceLevel(trainingYears) {
    if (trainingYears == null) return null;
    return bandFromYears(trainingYears);
}

// ---------------------------------------------------------------------------
// Notification queue helper
// ---------------------------------------------------------------------------

/**
 * Queues a cohort-promotion push notification into notification_queue.
 * The push-dispatcher cron polls this table and sends via the Expo Push API.
 *
 * Schema (migration 20260517_notification_queue.sql):
 *   user_id, type, title, body, data (jsonb), sent_at, error, created_at
 *
 * F-001 fix (TICKET-065, 2026-05-29): the previous version inserted a `payload`
 * column that does not exist in the schema — every graduation notification
 * silently failed with "column payload does not exist". Fixed by writing the
 * correct columns (type, title, body, data) that match both the migration and
 * the push-dispatcher's SELECT.
 */
async function queueGraduationNotification(client, userId, oldBand, newBand) {
    const title = "You've leveled up 🏋️";
    const body  = `Based on your logged progress, we've moved you into the ${bandLabel(newBand)} cohort — you're ranking against stronger competition now.`;
    const data  = JSON.stringify({ old_band: oldBand, new_band: newBand });

    try {
        await client.query(
            `INSERT INTO notification_queue (user_id, type, title, body, data, created_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, now())`,
            [userId, NOTIFICATION_TYPES.COHORT_GRADUATION, title, body, data]
        );
    } catch (err) {
        console.warn(
            `[cohort-graduation] failed to queue notification for user ${userId}: ${err.message}`
        );
    }
}

/** Human-readable label for a band string. */
function bandLabel(band) {
    const labels = {
        '0-1': 'beginner (under 1 year)',
        '1-3': 'intermediate (1–3 years)',
        '3-7': 'advanced (3–7 years)',
        '7+':  'elite (7+ years)',
    };
    return labels[band] || band;
}

// ---------------------------------------------------------------------------
// Main batch function
// ---------------------------------------------------------------------------

async function run() {
    const startedAt = new Date();
    console.log(`[cohort-graduation] started at ${startedAt.toISOString()}`);

    let usersChecked = 0;
    let usersGraduated = 0;
    let usersSkipped = 0;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Guard: if the drop-percentile migration has run, v_user_lift_inputs
        // will not exist (it was dropped by 20260612_drop_percentile_rankings.sql).
        // In that case, exit cleanly rather than crashing with 42P01.
        const { rows: viewCheck } = await client.query(
            "SELECT to_regclass('public.v_user_lift_inputs') AS oid"
        );
        if (!viewCheck[0] || viewCheck[0].oid === null) {
            console.warn(
                '[cohort-graduation] v_user_lift_inputs view does not exist ' +
                '(drop-percentile migration may have run). Skipping run.'
            );
            await client.query('ROLLBACK');
            return;
        }

        // Pull every user whose account is >=90 days old, alongside their
        // self-reported years_in_sport and the median training_years inferred
        // from their lift history.
        //
        // We use the median (PERCENTILE_CONT 0.5) across lifts so that a
        // single recently-added exercise with training_years=0 doesn't drag
        // down a veteran's inferred experience.
        const { rows: candidates } = await client.query(`
            SELECT
                u.id                                     AS user_id,
                u.years_in_sport                         AS self_reported_years,
                PERCENTILE_CONT(0.5) WITHIN GROUP (
                    ORDER BY v.training_years
                )::NUMERIC(5,2)                          AS inferred_years,
                COUNT(DISTINCT v.lift_id)                AS lifts_logged,
                u.created_at
            FROM users u
            JOIN v_user_lift_inputs v ON v.user_id = u.id
            WHERE u.created_at <= NOW() - INTERVAL '90 days'
              AND v.training_years IS NOT NULL
            GROUP BY u.id, u.years_in_sport, u.created_at
            HAVING COUNT(DISTINCT v.lift_id) >= 2
        `);

        console.log(`[cohort-graduation] ${candidates.length} users eligible for review`);

        for (const row of candidates) {
            usersChecked++;

            const selfBand    = bandFromYears(row.self_reported_years);
            const inferredBand = inferExperienceLevel(parseFloat(row.inferred_years));

            if (!inferredBand) {
                usersSkipped++;
                continue;
            }

            // Only promote, never demote.
            if (bandOrder(inferredBand) <= bandOrder(selfBand)) {
                usersSkipped++;
                continue;
            }

            // Graduation: update years_in_sport to the floor of the inferred band.
            const newYears = { '1-3': 1, '3-7': 3, '7+': 7 }[inferredBand] ?? row.self_reported_years;

            await client.query(
                `UPDATE users SET years_in_sport = $1 WHERE id = $2`,
                [newYears, row.user_id]
            );

            await queueGraduationNotification(client, row.user_id, selfBand, inferredBand);

            console.log(
                `[cohort-graduation] graduated user ${row.user_id}: ` +
                `${selfBand} → ${inferredBand} (inferred_years=${row.inferred_years})`
            );
            usersGraduated++;
        }

        await client.query('COMMIT');

        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(
            `[cohort-graduation] finished. ` +
            `checked=${usersChecked} graduated=${usersGraduated} ` +
            `skipped=${usersSkipped} elapsed=${elapsed}s`
        );

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[cohort-graduation] ERROR — rolled back:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

// ---------------------------------------------------------------------------
// Exports (for tests)
// ---------------------------------------------------------------------------

module.exports = { run, bandFromYears, bandOrder, bandLabel, inferExperienceLevel };

if (require.main === module) {
    run();
}
