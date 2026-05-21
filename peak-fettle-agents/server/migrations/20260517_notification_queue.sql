-- migrations/20260517_notification_queue.sql
-- Server-side notification queue for FCM push dispatch.
-- TICKET-037 cron references this table; this migration creates it.
-- Worker (future): polls this table and sends via FCM HTTP v1 API.

CREATE TABLE IF NOT EXISTS notification_queue (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          TEXT NOT NULL,           -- 'streak_milestone' | 'plan_ready' | 'cohort_graduation'
    title         TEXT NOT NULL,
    body          TEXT NOT NULL,
    data          JSONB,
    sent_at       TIMESTAMPTZ,             -- NULL = pending
    error         TEXT,                    -- last dispatch error if any
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_user_pending
    ON notification_queue (user_id, created_at)
    WHERE sent_at IS NULL;

-- RLS: users can read their own notifications; server uses service role to insert
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_notifications"
    ON notification_queue FOR SELECT
    USING (auth.uid() = user_id);

COMMENT ON TABLE notification_queue IS 'Pending FCM push notifications. Dispatcher cron polls sent_at IS NULL rows.';
