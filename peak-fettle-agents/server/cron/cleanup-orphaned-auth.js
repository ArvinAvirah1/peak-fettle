// Peak Fettle — Orphaned Auth Record Cleanup Cron
// TICKET-030 (Phase D — belt-and-suspenders for DELETE /user/account)
// dev-backend — 2026-05-05
//
// Background:
//   When DELETE /user/account runs, it:
//     1. Deletes all DB rows for the user in a transaction (atomic).
//     2. Calls supabaseAdmin.auth.admin.deleteUser() AFTER commit.
//   If step 2 fails (Supabase Admin API outage, transient network issue, etc.),
//   the DB data is gone but the auth record lives on. The user's account is
//   functionally deleted (requireAuth rejects their JWT since the users row is
//   gone), but the orphaned auth record wastes Supabase quota and could confuse
//   audit tooling.
//
//   This cron retries deleteUser() for any unresolved orphans.
//
// Schedule:
//   Run every 6 hours (e.g. cron expression: "0 */6 * * *").
//   Can also be triggered manually: node cron/cleanup-orphaned-auth.js
//
// Environment:
//   Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env via dotenv.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool }          = require('../db');
const { supabaseAdmin } = require('../lib/supabaseAdmin');

// Maximum number of orphans to process per run (safety cap — prevents an
// unexpectedly large backlog from hammering the Supabase Admin API).
const MAX_PER_RUN = 50;

// ---------------------------------------------------------------------------
// Main cleanup function
// ---------------------------------------------------------------------------
async function run() {
    const startedAt = new Date();
    console.log(`[cleanup-orphaned-auth] started at ${startedAt.toISOString()}`);

    let resolved   = 0;
    let failed     = 0;
    let total      = 0;

    const client = await pool.connect();

    try {
        // Fetch unresolved orphans — oldest first (FIFO retry order).
        const { rows: orphans } = await client.query(
            `SELECT id, auth_uid, reason, created_at
             FROM orphaned_auth_records
             WHERE resolved_at IS NULL
             ORDER BY created_at ASC
             LIMIT $1`,
            [MAX_PER_RUN]
        );

        total = orphans.length;

        if (total === 0) {
            console.log('[cleanup-orphaned-auth] no unresolved orphans — nothing to do');
            return;
        }

        console.log(`[cleanup-orphaned-auth] found ${total} unresolved orphan(s)`);

        for (const orphan of orphans) {
            const { auth_uid } = orphan;

            // SRV-AUTH-05: never delete a Supabase auth record whose users row
            // still exists — a bad orphan insert must not destroy a live account.
            const { rows: liveRows } = await client.query(
                `SELECT 1 FROM users WHERE id = $1`,
                [auth_uid]
            );
            if (liveRows.length > 0) {
                console.warn(`[cleanup-orphaned-auth] SKIP auth_uid=${auth_uid}: users row still present — leaving resolved_at NULL for manual review`);
                failed++;
                continue;
            }

            // Attempt to delete the Supabase auth record.
            const { error } = await supabaseAdmin.auth.admin.deleteUser(auth_uid);

            if (!error) {
                // Mark the orphan as resolved.
                await client.query(
                    `UPDATE orphaned_auth_records
                     SET resolved_at = NOW()
                     WHERE id = $1`,
                    [orphan.id]
                );
                resolved++;
                console.log(`[cleanup-orphaned-auth] resolved auth_uid=${auth_uid}`);

            } else {
                // Deletion still failing — leave resolved_at NULL so the next
                // run retries. Log so on-call engineers see the recurring failure.
                failed++;
                console.error(
                    `[cleanup-orphaned-auth] FAILED to delete auth_uid=${auth_uid}: ${error.message}`,
                    `(originally orphaned ${orphan.created_at.toISOString()}, original reason: ${orphan.reason})`
                );
            }
        }

    } catch (err) {
        console.error('[cleanup-orphaned-auth] ERROR:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(
            `[cleanup-orphaned-auth] finished. ` +
            `total=${total} resolved=${resolved} still_failing=${failed} elapsed=${elapsed}s`
        );
        await pool.end();
    }
}

module.exports = { run };

if (require.main === module) {
    run();
}
