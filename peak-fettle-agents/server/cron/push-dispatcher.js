/**
 * cron/push-dispatcher.js — Expo push notification dispatcher
 *
 * Polls notification_queue WHERE sent_at IS NULL AND NOT failed_permanently,
 * batches up to 100 messages per Expo API request, then marks each row as
 * sent or increments its retry_count (failing permanently after MAX_RETRIES).
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
 * Fixes applied:
 *   NEW-003 (2026-05-24): added retry cap — failed rows are retried at most
 *     MAX_RETRIES (5) times; failed_permanently=TRUE after that (or immediately
 *     on DeviceNotRegistered). Requires migration 20260524_notification_queue_retry_cap.sql.
 *   NEW-004 (2026-05-24): batched sends — up to EXPO_CHUNK_SIZE (100) messages
 *     per API request instead of one request per notification.
 *
 * Manual invocation for testing:
 *   node cron/push-dispatcher.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../db');

const EXPO_PUSH_URL    = 'https://exp.host/--/api/v2/push/send';
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN; // optional
const BATCH_SIZE       = 500;  // rows fetched per cron run
const EXPO_CHUNK_SIZE  = 100;  // max messages per Expo API request (Expo enforced limit)
const MAX_RETRIES      = 5;    // mark failed_permanently after this many failed attempts

// ---------------------------------------------------------------------------
// Stale-token check
// ---------------------------------------------------------------------------

/**
 * Returns true if the Expo error code / message indicates the device token
 * is no longer valid and should be cleared from the users table.
 */
function isStaleTokenError(errMsg) {
    return (
        errMsg.includes('DeviceNotRegistered') ||
        errMsg.includes('NotRegistered') ||
        errMsg.includes('InvalidRegistration')
    );
}

// ---------------------------------------------------------------------------
// Expo Push API batch sender
// ---------------------------------------------------------------------------

/**
 * Build the shared HTTP headers for Expo Push API requests.
 */
function expoHeaders() {
    const h = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
    };
    if (EXPO_ACCESS_TOKEN) h.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;
    return h;
}

/**
 * Send a chunk of notifications to the Expo Push API in a single request.
 * Returns an array of ticket objects positionally aligned with `messages`.
 *
 * Each ticket is one of:
 *   { status: 'ok', id: '...' }
 *   { status: 'error', message: '...', details: { error: 'DeviceNotRegistered' | ... } }
 *
 * Throws on HTTP-level failure (network error, 4xx/5xx) so the caller can
 * mark the entire chunk as failed and retry next run.
 *
 * @param {Array<{to,title,body,sound,priority,data}>} messages
 * @returns {Promise<Array<object>>} tickets
 */
async function sendExpoChunk(messages) {
    const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: expoHeaders(),
        body: JSON.stringify(messages),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Expo push HTTP ${response.status}: ${text}`);
    }

    const result = await response.json();

    // Request-level errors (malformed payload, auth, rate limit, etc.)
    if (Array.isArray(result.errors) && result.errors.length > 0) {
        const first = result.errors[0];
        throw new Error(`Expo push request error: ${first.code ?? 'unknown'} — ${first.message ?? ''}`);
    }

    if (!Array.isArray(result.data) || result.data.length !== messages.length) {
        throw new Error(
            `Expo push: expected ${messages.length} tickets, got ${result.data?.length ?? 0}`
        );
    }

    return result.data;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/**
 * Mark a notification as successfully sent.
 */
async function markSent(client, id) {
    await client.query(
        `UPDATE notification_queue
         SET sent_at = NOW(), error = NULL
         WHERE id = $1`,
        [id]
    );
}

/**
 * Record a delivery failure. Increments retry_count and sets failed_permanently
 * if MAX_RETRIES is reached or the error indicates a stale token.
 *
 * @param {object} client   - pg client
 * @param {object} notif    - row from notification_queue (must include retry_count)
 * @param {string} errMsg   - error message to store
 */
async function markFailed(client, notif, errMsg) {
    const stale      = isStaleTokenError(errMsg);
    const newCount   = (notif.retry_count ?? 0) + 1;
    const permanent  = stale || newCount >= MAX_RETRIES;

    await client.query(
        `UPDATE notification_queue
         SET error             = $1,
             retry_count       = $2,
             failed_permanently = $3
         WHERE id = $4`,
        [errMsg.slice(0, 500), newCount, permanent, notif.id]
    );

    if (stale) {
        // Clear the stale device token so future runs skip this user
        // until they re-register on a new device install.
        await client.query(
            `UPDATE users SET fcm_token = NULL WHERE id = $1`,
            [notif.user_id]
        );
        console.log(`[push-dispatcher] cleared stale token for user ${notif.user_id}`);
    }

    if (permanent) {
        console.warn(
            `[push-dispatcher] permanently failed ${notif.id} ` +
            `(retries: ${newCount}, stale: ${stale}): ${errMsg.slice(0, 120)}`
        );
    }
}

// ---------------------------------------------------------------------------
// Main batch run
// ---------------------------------------------------------------------------

async function run() {
    const startedAt = new Date();
    console.log(`[push-dispatcher] started at ${startedAt.toISOString()}`);

    const client = await pool.connect();
    let sent = 0, failed = 0;

    try {
        // Fetch pending notifications joined with each user's push token.
        // Skips rows marked failed_permanently (NEW-003) and users without tokens.
        const { rows: pending } = await client.query(`
            SELECT
                nq.id,
                nq.user_id,
                nq.title,
                nq.body,
                nq.data,
                nq.retry_count,
                u.fcm_token
            FROM notification_queue nq
            JOIN users u ON u.id = nq.user_id
            WHERE nq.sent_at IS NULL
              AND NOT nq.failed_permanently
              AND u.fcm_token IS NOT NULL
              AND u.fcm_token <> ''
            ORDER BY nq.created_at ASC
            LIMIT $1
        `, [BATCH_SIZE]);

        if (pending.length === 0) {
            console.log('[push-dispatcher] no pending notifications — exiting');
            return { sent: 0, failed: 0 };
        }

        console.log(`[push-dispatcher] dispatching ${pending.length} notification(s)`);

        // NEW-004: was one HTTP request per notification; now one per chunk.
        for (let i = 0; i < pending.length; i += EXPO_CHUNK_SIZE) {
            const chunk = pending.slice(i, i + EXPO_CHUNK_SIZE);
            const messages = chunk.map((notif) => ({
                to: notif.fcm_token,
                title: notif.title,
                body: notif.body,
                sound: 'default',
                priority: 'high',
                data: { ...(notif.data ?? {}) },
            }));

            let tickets;
            try {
                tickets = await sendExpoChunk(messages);
            } catch (err) {
                // HTTP-level failure: the entire chunk failed to send. Record the
                // error on every row so each is retried next run (or fails
                // permanently once it crosses MAX_RETRIES).
                const errMsg = String(err?.message ?? err).slice(0, 500);
                console.warn(
                    `[push-dispatcher] chunk of ${chunk.length} failed at HTTP level: ${errMsg}`
                );
                for (const notif of chunk) {
                    await markFailed(client, notif, errMsg);
                    failed++;
                }
                continue;
            }

            // Tickets are positionally aligned with `messages` (verified by
            // sendExpoChunk), so map each ticket back to its notification by index.
            for (let j = 0; j < chunk.length; j++) {
                const notif  = chunk[j];
                const ticket = tickets[j];

                if (ticket && ticket.status === 'ok') {
                    await markSent(client, notif.id);
                    sent++;
                } else {
                    // details.error ∈ { DeviceNotRegistered, MessageTooBig,
                    //   MessageRateExceeded, MismatchSenderId, InvalidCredentials }
                    const code   = ticket?.details?.error ?? 'unknown';
                    const errMsg = `Expo push delivery error: ${code} — ${ticket?.message ?? ''}`;
                    await markFailed(client, notif, errMsg);
                    failed++;
                }
            }
        }

        console.log(
            `[push-dispatcher] done — sent: ${sent}, failed: ${failed}` +
            ` — elapsed: ${Date.now() - startedAt.getTime()}ms`
        );

        return { sent, failed };
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
