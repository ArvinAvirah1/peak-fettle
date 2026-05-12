-- ============================================================================
-- Migration: 20260430_add_daily_health_log.sql
-- Phase:     Health Suite Expansion — Phase 1 (Data Layer Prep)
-- Author:    dev-database (delegated by dev-lead)
-- Reviewed:  Workflow Coordinator brief 2026-04-30
-- ----------------------------------------------------------------------------
-- Purpose:
--   Foundation table for cross-domain health primitives. No UI reads from this
--   yet. We are paying a small migration cost now so the Phase 2 Wellbeing tab
--   does not require a second invasive migration over a populated workout
--   dataset.
--
-- Notes:
--   * Encryption-at-rest is provided by Supabase storage (project default).
--   * Per-row access control is enforced by RLS below — auth.uid() must match
--     the row's user_id for any read or write.
--   * Phase 3 may add a `source` column for Apple Health / Google Fit imports;
--     left out for now to keep the row narrow.
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_health_log (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    log_date             DATE         NOT NULL,

    -- Sleep
    sleep_hours          NUMERIC(4,2),                  -- e.g. 7.50
    sleep_quality        SMALLINT     CHECK (sleep_quality   BETWEEN 1 AND 5),

    -- Mood / stress (self-reported, 1–5 Likert)
    mood_score           SMALLINT     CHECK (mood_score      BETWEEN 1 AND 5),
    stress_score         SMALLINT     CHECK (stress_score    BETWEEN 1 AND 5),

    -- Screen time (manual entry now; Phase 3 wires OS APIs)
    screen_time_minutes  INTEGER      CHECK (screen_time_minutes >= 0),

    -- Habit completions for the day (FK enforcement deferred — array of habit IDs)
    habits_completed     UUID[]       DEFAULT '{}',

    -- Meditation
    meditation_minutes   INTEGER      CHECK (meditation_minutes >= 0),

    -- Free-form
    notes                TEXT,

    -- Bookkeeping
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Invariant: one log row per user per calendar day
    UNIQUE (user_id, log_date)
);

-- Time-series read pattern: latest N days for a user.
CREATE INDEX IF NOT EXISTS idx_daily_health_log_user_date
    ON daily_health_log (user_id, log_date DESC);

-- ----------------------------------------------------------------------------
-- updated_at trigger (mirrors the convention used elsewhere in the schema)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_daily_health_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_health_log_updated_at ON daily_health_log;
CREATE TRIGGER trg_daily_health_log_updated_at
    BEFORE UPDATE ON daily_health_log
    FOR EACH ROW
    EXECUTE FUNCTION set_daily_health_log_updated_at();

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE daily_health_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own health logs" ON daily_health_log;
CREATE POLICY "Users can manage own health logs"
    ON daily_health_log
    FOR ALL
    USING      (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- End of migration 20260430_add_daily_health_log.sql
-- ============================================================================
