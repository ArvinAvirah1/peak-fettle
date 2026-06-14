// Peak Fettle — Percentile Batch Job
// dev-backend — 2026-04-30 (upgraded 2026-05-02 from stub to live implementation)
// TICKET-032 — 2026-05-10: upgraded to model_version 2; stores percentile_simple
//
// What this does:
//   Calls the Postgres compute_percentile_batch() function (defined in
//   migrations/20260502_percentile_engine.sql, updated in
//   migrations/20260510_percentile_engine_v2.sql), which reads v_user_lift_inputs
//   and returns (user_id, lift_id, percentile, percentile_simple) for every
//   qualifying user × lift combination. We then upsert those rows into
//   user_percentile_rankings.
//
//   V2 changes (TICKET-032):
//     - Default model_version changed 1 → 2 (corrected μ asymptote, per-lift f₀,
//       inheritance fix, pop_mu/pop_sigma for the simple comparison)
//     - percentile_simple column added to the upsert (gender + BW only, no age
//       or experience adjustment; shown as "vs. all strength trainees" in the UI)
//
// Why batch, not real-time?
//   CTO guardrail #2: a single user logging a set should not trigger a full
//   cohort re-rank. The weekly batch is cheap on expected data volumes for
//   months 1–12. The user doesn't need a millisecond-fresh percentile — seeing
//   "you're top 18% this week" the next morning is motivating enough.
//
// Schedule:
//   Deploy this as a Sunday 03:00 UTC scheduled task (node-cron or your
//   deployment scheduler). It can also be invoked manually for backfills:
//     node cron/percentile.js
//
// Environment:
//   Reads DATABASE_URL (or PG* env vars) from .env via dotenv.

// 2026-06-12 (Agent O, SPEC_094A): DISABLED -- percentile computation moved on-device.
// This file is retained for reference. Do NOT schedule it.
// Remove after 20260612_drop_percentile_rankings.sql is applied (founder-gated).
if (require.main === module) {
    console.log('[percentile-cron] DISABLED: computation moved on-device (SPEC_094A). Exiting.');
    process.exit(0);
}

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../db');

// ---------------------------------------------------------------------------
// Main batch function
// ---------------------------------------------------------------------------
async function run() {
    const startedAt = new Date();
    console.log(`[percentile-cron] started at ${startedAt.toISOString()}`);

    let rowsComputed = 0;
    let rowsUpserted = 0;
    let rowsNull = 0;

    const client = await pool.connect();

    try {
        // Run the full batch computation inside a transaction.
        // If anything fails we roll back so user_percentile_rankings is never
        // left in a half-written state.
        await client.query('BEGIN');

        // compute_percentile_batch() reads v_user_lift_inputs, calls
        // compute_percentile() / compute_undisclosed_percentile() for each row,
        // and streams results back. Model version 2 is the active model.
        // TICKET-036 (1.6 arch): now also returns cohort_size_internal.
        // TICKET-041: now also returns is_estimated.
        const { rows } = await client.query(
            `SELECT user_id, lift_id, percentile, percentile_simple,
                    cohort_size_internal, is_estimated, computed_at
             FROM compute_percentile_batch(2)`
        );

        rowsComputed = rows.length;
        console.log(`[percentile-cron] batch computed ${rowsComputed} user×lift pairs (model_version=2)`);

        if (rowsComputed === 0) {
            console.log('[percentile-cron] no data to upsert — committing empty transaction');
            await client.query('COMMIT');
            return;
        }

        // Count NULLs (users with incomplete profiles — missing birth_date, etc.)
        rowsNull = rows.filter(r => r.percentile === null).length;
        if (rowsNull > 0) {
            console.log(`[percentile-cron] ${rowsNull} rows have NULL percentile (incomplete profiles)`);
        }

        // Bulk upsert using a VALUES list.
        // We build it in chunks of 500 to keep query size manageable.
        // TICKET-032: 5 params per row — percentile_simple added.
        // TICKET-036 (1.6 arch): 6 params per row — cohort_size_internal added.
        // TICKET-041: 7 params per row — is_estimated added.
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const chunk = rows.slice(i, i + CHUNK);
            const values = [];
            const params = [];

            chunk.forEach((row, idx) => {
                const base = idx * 7;
                values.push(
                    `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, 2)`
                );
                params.push(
                    row.user_id,
                    row.lift_id,
                    row.percentile,
                    row.percentile_simple,
                    row.cohort_size_internal,
                    row.is_estimated,
                    row.computed_at,
                );
            });

            await client.query(
                `INSERT INTO user_percentile_rankings
                    (user_id, lift_id, percentile, percentile_simple,
                     cohort_size_internal, is_estimated, computed_at, model_version)
                 VALUES ${values.join(', ')}
                 ON CONFLICT (user_id, lift_id, model_version)
                 DO UPDATE SET
                    percentile           = EXCLUDED.percentile,
                    percentile_simple    = EXCLUDED.percentile_simple,
                    cohort_size_internal = EXCLUDED.cohort_size_internal,
                    is_estimated         = EXCLUDED.is_estimated,
                    computed_at          = EXCLUDED.computed_at`,
                params
            );
            rowsUpserted += chunk.length;
        }

        await client.query('COMMIT');

        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(
            `[percentile-cron] finished. ` +
            `computed=${rowsComputed} upserted=${rowsUpserted} ` +
            `null_skipped=${rowsNull} elapsed=${elapsed}s`
        );

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[percentile-cron] ERROR — rolled back:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

// ---------------------------------------------------------------------------
// Legacy helpers — kept for tests and the ageBand/yearsBand/nearestWeightClass
// exports used by other modules. These are no longer called by the batch job
// itself (the SQL model handles bucketing), but remain exported for compat.
// ---------------------------------------------------------------------------

/** Returns an age-band string like "25-34" from a birth date. */
function ageBand(birthDate) {
    if (!birthDate) return 'unknown';
    const today = new Date();
    const age = today.getFullYear() - new Date(birthDate).getFullYear();
    if (age < 18)  return 'under-18';
    if (age < 25)  return '18-24';
    if (age < 35)  return '25-34';
    if (age < 45)  return '35-44';
    if (age < 55)  return '45-54';
    return '55+';
}

/** Returns a years-in-sport band like "1-3" from integer years. */
// Band labels must match SQL lift_vectors.exp_band CHECK constraint values.
function yearsBand(years) {
    if (years == null) return 'unknown';
    if (years < 1) return '<1';
    if (years < 3) return '1-3';
    if (years < 7) return '3-7';   // was '3-5' — corrected to match SQL CHECK constraint
    return '7+';                    // was '5+'  — corrected to match SQL CHECK constraint
}

/** Returns nearest standard weight class for simple cohort bucketing. */
function nearestWeightClass(weightKg) {
    if (!weightKg) return null;
    const classes = [52, 59, 66, 74, 83, 93, 105, 120];
    for (const c of classes) {
        if (weightKg <= c + 3) return c;
    }
    return 999;
}

module.exports = { run, ageBand, yearsBand, nearestWeightClass };

if (require.main === module) {
    run();
}
