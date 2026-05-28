/**
 * cron/push-dispatcher.js — FCM push notification dispatcher
 *
 * Polls notification_queue WHERE sent_at IS NULL, sends each via the
 * FCM Legacy HTTP API, then marks sent_at on success or stores the
 * error string on failure so the next run can retry.
 *
 * Schedule: every 5 minutes  "*/5 * * * *"
 *   Add a GitHub Actions workflow or node-cron entry alongside the
 *   weekly percentile job.
 *
 * Required env var:
 *   FCM_SERVER_KEY — Firebase Cloud Messaging server key
 *     (Firebase Console → Project settings → Cloud Messaging → Server key)
 *
 * Users' device tokens are stored in users.fcm_token, written by the
 * mobile app after requesting push permission (TICKET-024).
 * See migrations/20260518_fcm_token.sql for the column definition.
 *
 * Manual invocation for testing:
 *   node cron/push-dispatcher.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../db');

const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;
const BATCH_SIZE     = 50;  // notifications per run — keeps each invocation snappy

// ---------------------------------------------------------------------------
// FCM send helper (Legacy HTTP API)
// ---------------------------------------------------------------------------

/**
 * Send a single FCM push notification via the legacy HTTP API.
 * Throws on any delivery failure so the caller can record the error.
 *
 * @param {string} fcmToken  - Device registration token
 * @param {string} title     - Notification title
 * @param {string} body      - Notification body
 * @param {object} data      - Optional key-value data payload
 */
async function sendFcm(fcmToken, title, body, data = {}) {
    if (!FCM_SERVER_KEY) {
        throw new Error('FCM_SERVER_KEY env var not set — cannot dispatch push notifications');
    }

    const payload = {
        to: fcmToken,
        notification: { title, body, sound: 'default' },
        data: { ...data, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
        priority: 'high',
        content_available: true,
    };

    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `key=${FCM_SERVER_KEY}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`FCM HTTP ${response.status}: ${text}`);
    }

    const result = await response.json();

    // FCM returns 200 even on delivery failure — check the results array
    if (result.failure > 0) {
        const firstError = result.results?.[0]?.error ?? 'unknown';
        // NotRegistered / InvalidRegistration = stale token; caller should clear it
        throw new Error(`FCM delivery failure: ${firstError}`);
    }
}

// ---------------------------------------------------------------------------
// Main batch run
// ---------------------------------------------------------------------------

async function run() {
    const startedAt = new Date();
    console.log(`[push-dispatcher] started at ${startedAt.toISOString()}`);

    if (!FCM_SERVER_KEY) {
        console.warn('[push-dispatcher] FCM_SERVER_KEY not set — skipping dispatch');
        return { sent: 0, failed: 0, skipped: 0 };
    }

    const client = await pool.connect();
    let sent = 0, failed = 0, skipped = 0;

    try {
        // Fetch pending notifications joined with each user's FCM token.
        // Users without a token are excluded — they haven't granted permission yet.
        const { rows: pending } = await client.query(`
            SELECT
                nq.id,
                nq.user_id,
                nq.title,
                nq.body,
                nq.data,
                u.fcm_token
            FROM notification_queue nq
            JOIN users u ON u.id = nq.user_id
            WHERE nq.sent_at IS NULL
              AND u.fcm_token IS NOT NULL
              AND u.fcm_token <> ''
            ORDER BY nq.created_at ASC
            LIMIT $1
        `, [BATCH_SIZE]);

        if (pending.length === 0) {
            console.log('[push-dispatcher] no pending notifications — exiting');
            return { sent: 0, failed: 0, skipped: 0 };
        }

        console.log(`[push-dispatcher] dispatching ${pending.length} notification(s)`);

        for (const notif of pending) {
            try {
                await sendFcm(
                    notif.fcm_token,
                    notif.title,
                    notif.body,
                    notif.data ?? {}
                );

                await client.query(
                    `UPDATE notification_queue
                     SET sent_at = NOW(), error = NULL
                     WHERE id = $1`,
                    [notif.id]
                );

                sent++;
            } catch (err) {
                const errMsg = String(err?.message ?? err).slice(0, 500);
                console.warn(`[push-dispatcher] failed to send ${notif.id}: ${errMsg}`);

                await client.query(
                    `UPDATE notification_queue
                     SET error = $1
                     WHERE id = $2`,
                    [errMsg, notif.id]
                );

                // If the token is stale, clear it so future runs skip this user
                // until they re-register (NotRegistered = uninstalled or re-installed app)
                if (errMsg.includes('NotRegistered') || errMsg.includes('InvalidRegistration')) {
                    await client.query(
                        `UPDATE users SET fcm_token = NULL WHERE id = $1`,
                        [notif.user_id]
                    );
                    console.log(`[push-dispatcher] cleared stale token for user ${notif.user_id}`);
                }

                failed++;
            }
        }

        console.log(
            `[push-dispatcher] done — sent: ${sent}, failed: ${failed}, skipped: ${skipped}` +
            ` — elapsed: ${Date.now() - startedAt.getTime()}ms`
        );

        return { sent, failed, skipped };
    } finally {
        client.release();
    }
}

module.exports = { run };

// ---------------------------------------------------------------------------
// Direct invocation: node cron/push-dispatcher.js
// ---------------------------------------------------------------------------
if (require.main === module) {
    run()
        .then((stats) => {
            console.log('[push-dispatcher] completed:', stats);
            process.exit(0);
        })
        .catch((err) => {
            console.error('[push-dispatcher] fatal error:', err);
            process.exit(1);
        });
}
