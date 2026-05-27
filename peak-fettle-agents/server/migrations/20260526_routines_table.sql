-- TICKET-055/056: User-saved workout routines
-- Routines are simple, repeatable single-session workouts distinct from:
--   • workout_templates (global curated multi-day programs)
--   • plans (AI-generated multi-week blocks)
-- A routine is just an ordered list of exercises with per-exercise targets.

CREATE TABLE IF NOT EXISTS routines (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    -- exercises: [{exercise_id, name, target_sets, target_reps}]
    exercises    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);

-- RLS (Supabase)
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY routines_user_policy ON routines
    FOR ALL USING (auth.uid() = user_id);
