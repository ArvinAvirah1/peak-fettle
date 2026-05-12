-- migrations/20260504_daily_health_metrics.sql
-- Phase: C (TICKET-013 — Smartwatch Integration, Phase C backend/DB layer)
-- Author: dev-database
-- Date: 2026-05-04
--
-- PURPOSE
-- -------
-- Creates the daily_health_metrics table that stores wearable-sourced health
-- signals used to contextualise AI plan generation (TICKET-011).
--
-- Phase C scope: Apple HealthKit read path (resting HR, HRV, sleep, active
-- calories). The mobile team's HealthKit background-refresh task writes rows
-- via POST /health-metrics. The AI plan prompt reads the last 7 days of metrics
-- per user to inform intensity and volume recommendations.
--
-- Phase D additions (do not add yet):
--   - Garmin Connect IQ read path (source = 'garmin')
--   - Galaxy Watch / Wear OS (source = 'wear_os')
--
-- UNIQUE constraint on (user_id, date, source) allows a single upsert per
-- source per day. If HealthKit syncs twice on the same day the later write wins.
--
-- Safe to re-run: all DDL uses IF NOT EXISTS / IF EXISTS guards.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS daily_health_metrics (
    metric_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date            DATE        NOT NULL,
    resting_hr_bpm  INT         CHECK (resting_hr_bpm IS NULL OR (resting_hr_bpm BETWEEN 20 AND 250)),
    hrv_ms          NUMERIC(6,2) CHECK (hrv_ms IS NULL OR hrv_ms >= 0),
    sleep_hours     NUMERIC(4,2) CHECK (sleep_hours IS NULL OR (sleep_hours BETWEEN 0 AND 24)),
    active_kcal     INT         CHECK (active_kcal IS NULL OR active_kcal >= 0),
    source          TEXT        NOT NULL DEFAULT 'apple_healthkit'
                                CHECK (source IN ('apple_healthkit', 'garmin', 'wear_os', 'manual')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, date, source)
);

CREATE INDEX IF NOT EXISTS idx_daily_health_metrics_user_date
    ON daily_health_metrics(user_id, date DESC);

-- RLS: users read and write only their own health metrics.
-- The mobile client writes rows directly via the API (not Supabase realtime)
-- so we only need a standard user-scoped policy here.
ALTER TABLE daily_health_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own health metrics"   ON daily_health_metrics;
DROP POLICY IF EXISTS "users insert own health metrics" ON daily_health_metrics;
DROP POLICY IF EXISTS "users update own health metrics" ON daily_health_metrics;

CREATE POLICY "users read own health metrics"
    ON daily_health_metrics FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "users insert own health metrics"
    ON daily_health_metrics FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own health metrics"
    ON daily_health_metrics FOR UPDATE
    USING (auth.uid() = user_id);
