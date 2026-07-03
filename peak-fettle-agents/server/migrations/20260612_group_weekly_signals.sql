-- 20260612 — Group weekly signals table (Agent O, SPEC_094A §"Agent O")
--
-- Clients send a tiny weekly signal instead of the server reading personal
-- workout logs for group evaluation. The server's weekly evaluation job
-- (cron/group-streaks.js) prefers signals when they exist; it falls back to
-- the legacy log-query path if no signals are present for the evaluated week.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS + idempotent index creation.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS group_weekly_signals (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id     UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    week_start   DATE        NOT NULL,  -- ISO Monday, YYYY-MM-DD
    hit_goal     BOOLEAN     NOT NULL,
    workouts_done SMALLINT   NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT group_weekly_signals_unique
        UNIQUE (group_id, user_id, week_start)
);

-- Index for the evaluation cron: fetch all signals for a group × week
CREATE INDEX IF NOT EXISTS idx_gws_group_week
    ON group_weekly_signals (group_id, week_start);

-- Index for the write path: find existing row to upsert
CREATE INDEX IF NOT EXISTS idx_gws_user_group_week
    ON group_weekly_signals (user_id, group_id, week_start);
