/**
 * cron/push-dispatcher.js — Expo push notification dispatcher
 *
 * Polls notification_queue WHERE sent_at IS NULL, sends each via the
 * Expo Push API, then marks sent_at on success or stores the error
 * string on failure so the next run can retry.
 *
 * Schedule: every 5 minutes  "*\/5 * * * *"
 *   Add a GitHub Actions workflow or node-cron entry alongside the
 *   weekly percentile job.
 *
 * Token format:
 *   The mobile app registers with Notifications.getExpoPushTokenAsync()
 *   (mobile/src/services/pushNotifications.ts), which yields an Expo push
 *   token: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]". These are handles
 *   into Expo's push relay (https://exp.host/--/api/v2/push/send), which
 *   routes to APNs (iOS) and FCM (Android) internally. We therefore send
 *   through the Expo Push API rather than calling FCM directly — sending an
 *   Expo token to FCM's `to` field is rejected as InvalidRegistration.
 *   (PUSH-001, 2026-05-22.)
 *
 *   No FCM_SERVER_KEY / google-services.json is required for this path —
 *   Expo's build infrastructure owns the FCM credentials.
 *
 * Optional env var:
 *   EXPO_ACCESS_TOKEN — only needed if the Expo project has "Enhanced
 *     push security" enabled. Sent as a Bearer token when present.
 *
 * Users' device tokens are stored in users.fcm_token (column name retained
 * for migration compatibility — see migrations/20260518_fcm_token.sql).
 *
 * Manual invocation for testing:
 *   node cron/push-dispatcher.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../db');

const EXPO_PUSH_URL    = 'https://exp.host/--/api/v2/push/send';
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN; // optional
const BATCH_SIZE       = 50;  // notifications per run — keeps each invocation snappy

// ---------------------------------------------------------------------------
// Expo Push API send helper
// ---------------------------------------------------------------------------

/**
 * Send a single push notification via the Expo Push API.
 * Throws on any delivery failure so the caller can record the error.
 *
 * The Expo relay accepts the "ExponentPushToken[...]" format directly and
 * handles APNs/FCM routing internally. The response contains a "ticket"
 * per message; a ticket with status "error" and details.error
 * "DeviceNotRegistered" indicates a stale token that should be cleared.
 *
 * @param {string} expoToken - Expo push token ("ExponentPushToken[...]")
 * @param {string} title     - Notification title
 * @param {string} body      - Notification body
 * @param {object} data      - Optional key-value data payload
 */
async function sendExpoPush(expoToken, title, body, data = {}) {
    const message = {
        to: expoToken,
        title,
        body,
        sound: 'default',
        priority: 'high',
        data: { ...data },
    };

    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
    };
    if (EXPO_ACCESS_TOKEN) {
        headers.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;
    }

    const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify([message]),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Expo push HTTP ${response.status}: ${text}`);
    }

    const result = await response.json();

    // Request-level errors (malformed payload, auth, etc.)
    if (Array.isArray(result.errors) && result.errors.length > 0) {
        const first = result.errors[0];
        throw new Error(`Expo push request error: ${first.code ?? 'unknown'} — ${first.message ?? ''}`);
    }

    // Per-message tickets — we sent exactly one message, so inspect data[0].
    const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!ticket) {
        throw new Error('Expo push: no ticket returned in response');
    }
    if (ticket.status === 'error') {
        // details.error ∈ { DeviceNotRegistered, MessageTooBig,
        //   MessageRateExceeded, MismatchSenderId, InvalidCredentials }
        const code = ticket.details?.error ?? 'unknown';
        throw new Error(`Expo push delivery error: ${code} — ${ticket.message ?? ''}`);
    }
}

// ---------------------------------------------------------------------------
// Main batch run
// ---------------------------------------------------------------------------

async function run() {
    const startedAt = new Date();
    console.log(`[push-dispatcher] started at ${startedAt.toISOString()}`);

    const client = await pool.connect();
    let sent = 0, failed = 0, skipped = 0;

    try {
        // Fetch pending notifications joined with each user's push token.
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
                await sendExpoPush(
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
                // until they re-register. Expo returns "DeviceNotRegistered" when
                // the app was uninstalled or the token was invalidated; the FCM
                // legacy strings are kept for backward compatibility with old rows.
                if (
                    errMsg.includes('DeviceNotRegistered') ||
                    errMsg.includes('NotRegistered') ||
                    errMsg.includes('InvalidRegistration')
                ) {
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
