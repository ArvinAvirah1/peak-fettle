-- ============================================================================
-- Migration: 20260430_add_habits.sql
-- Phase:     Health Suite Expansion — Phase 1 (Data Layer Prep)
-- Author:    dev-database (delegated by dev-lead)
-- Reviewed:  Workflow Coordinator brief 2026-04-30
-- ----------------------------------------------------------------------------
-- Purpose:
--   Define `habits` now so the Phase 2 Wellbeing tab does not require a
--   second migration. No UI reads from this yet.
--
-- Open exec questions (do NOT block this migration — daily_only is the
-- conservative default until exec confirms):
--   * Should habit frequency support 'weekly' and 'custom' at Phase 2, or
--     daily only? Default left as 'daily' here; the column is TEXT so future
--     values can be added without an ALTER.
-- ============================================================================

CREATE TABLE IF NOT EXISTS habits (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT         NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    frequency   TEXT         NOT NULL DEFAULT 'daily'
                              CHECK (frequency IN ('daily', 'weekly')),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Active-habits-for-user is the dominant Phase 2 query.
CREATE INDEX IF NOT EXISTS idx_habits_user_active
    ON habits (user_id)
    WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own habits" ON habits;
CREATE POLICY "Users can manage own habits"
    ON habits
    FOR ALL
    USING      (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- End of migration 20260430_add_habits.sql
-- ============================================================================
