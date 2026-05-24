-- Migration: 20260524_notification_queue_retry_cap
-- NEW-003 fix: add retry_count and failed_permanently columns to notification_queue.
--
-- Without these columns the push-dispatcher retries failed notifications every
-- 5 minutes indefinitely. A corrupt payload, MessageTooBig, or misclassified
-- transient error creates an infinite retry loop that wastes DB connections
-- and Expo API quota at scale.
--
-- After this migration the dispatcher:
--   • Skips rows where failed_permanently = TRUE
--   • Increments retry_count on each failed attempt
--   • Sets failed_permanently = TRUE after MAX_RETRIES (5) attempts
--   • Sets failed_permanently = TRUE immediately on DeviceNotRegistered

ALTER TABLE notification_queue
    ADD COLUMN IF NOT EXISTS retry_count        INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS failed_permanently BOOLEAN     NOT NULL DEFAULT FALSE;

-- Index so the dispatcher's WHERE NOT failed_permanently filter is fast
CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
    ON notification_queue (created_at ASC)
    WHERE sent_at IS NULL AND failed_permanently = FALSE;

COMMENT ON COLUMN notification_queue.retry_count IS
    'Number of delivery attempts made (incremented on each failure).';

COMMENT ON COLUMN notification_queue.failed_permanently IS
    'TRUE when the notification should no longer be retried (DeviceNotRegistered, '
    'or retry_count exceeded MAX_RETRIES). Dispatcher skips these rows.';
