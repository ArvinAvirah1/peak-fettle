-- 20260530_template_library.sql
-- FIX (IOS-RELEASE / TEMPLATES-500, 2026-05-30):
-- GET /templates and GET /templates/:id (routes/templates.js) query
-- workout_templates / template_sessions / template_exercises, but NO migration
-- ever created those tables. The route comment cited
-- "migrations/20260517_template_library.sql" — that file was never written or
-- committed (confirmed: not in git history). In the deployed DB the SELECT hit a
-- non-existent relation, Postgres errored, and the whole /templates tab returned
-- 500 ("Could not load templates" on the Templates screen and on the Log tab's
-- "Starter Splits"). This migration creates the missing schema.
--
-- Column set matches routes/templates.js exactly:
--   workout_templates : id, name, description, discipline, experience_level,
--                       days_per_week, is_featured, created_at
--   template_sessions : id, template_id, day_number, session_name, notes
--   template_exercises: id, session_id, exercise_name, sets, reps,
--                       rest_seconds, form_cue, order_index
-- and the frontend WorkoutTemplate type (mobile/src/api/templates.ts) — note
-- reps is TEXT ("8-12"), experience_level is one of beginner|intermediate|advanced|elite.
--
-- Migrations here are applied MANUALLY (no runner in package.json): run this file
-- against the Railway production Postgres to clear the 500.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workout_templates (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    description      TEXT        NOT NULL DEFAULT '',
    discipline       TEXT        NOT NULL,
    experience_level TEXT        NOT NULL
                     CHECK (experience_level IN ('beginner','intermediate','advanced','elite')),
    days_per_week    INT         NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
    is_featured      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_sessions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id   UUID        NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
    day_number    INT         NOT NULL,
    session_name  TEXT        NOT NULL,
    notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_template_sessions_template ON template_sessions(template_id);

CREATE TABLE IF NOT EXISTS template_exercises (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID        NOT NULL REFERENCES template_sessions(id) ON DELETE CASCADE,
    exercise_name TEXT        NOT NULL,
    sets          INT         NOT NULL CHECK (sets BETWEEN 1 AND 20),
    reps          TEXT        NOT NULL,            -- TEXT on purpose: "5", "8-12", "AMRAP"
    rest_seconds  INT,
    form_cue      TEXT,
    order_index   INT         NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_template_exercises_session ON template_exercises(session_id);

-- ---------------------------------------------------------------------------
-- Seed — PLACEHOLDER starter content (FOUNDER: review / expand / replace).
-- Generic, non-proprietary strength splits so the feature works out of the box.
-- Guarded by NOT EXISTS so re-running is safe and won't duplicate.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    fb_id    UUID;
    ul_id    UUID;
    s_id     UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM workout_templates) THEN

        -- 1) Full Body 3-Day (beginner, featured) --------------------------------
        INSERT INTO workout_templates (name, description, discipline, experience_level, days_per_week, is_featured)
        VALUES ('Full Body 3-Day',
                'A simple full-body routine three days a week. Great first program for building the main lifts.',
                'weightlifting', 'beginner', 3, TRUE)
        RETURNING id INTO fb_id;

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (fb_id, 1, 'Day A', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Back Squat',     3, '5',    180, 0),
            (s_id, 'Bench Press',    3, '5',    180, 1),
            (s_id, 'Barbell Row',    3, '8-10', 120, 2),
            (s_id, 'Plank',          3, '30-60s', 60, 3);

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (fb_id, 2, 'Day B', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Deadlift',          3, '5',    180, 0),
            (s_id, 'Overhead Press',    3, '5',    180, 1),
            (s_id, 'Lat Pulldown',      3, '8-12', 120, 2),
            (s_id, 'Hanging Knee Raise', 3, '10-15', 60, 3);

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (fb_id, 3, 'Day C', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Front Squat',     3, '6-8',  150, 0),
            (s_id, 'Incline Bench Press', 3, '6-8', 150, 1),
            (s_id, 'Seated Cable Row', 3, '10-12', 120, 2),
            (s_id, 'Back Extension',  3, '12-15', 60, 3);

        -- 2) Upper / Lower 4-Day (intermediate, featured) ------------------------
        INSERT INTO workout_templates (name, description, discipline, experience_level, days_per_week, is_featured)
        VALUES ('Upper / Lower 4-Day',
                'Four-day upper/lower split balancing strength and hypertrophy across the week.',
                'weightlifting', 'intermediate', 4, TRUE)
        RETURNING id INTO ul_id;

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (ul_id, 1, 'Upper A', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Bench Press',     4, '5-6',  180, 0),
            (s_id, 'Barbell Row',     4, '6-8',  150, 1),
            (s_id, 'Overhead Press',  3, '8-10', 120, 2),
            (s_id, 'Pull-Up',         3, 'AMRAP', 120, 3);

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (ul_id, 2, 'Lower A', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Back Squat',      4, '5-6',  180, 0),
            (s_id, 'Romanian Deadlift', 3, '8-10', 150, 1),
            (s_id, 'Leg Press',       3, '10-12', 120, 2),
            (s_id, 'Standing Calf Raise', 4, '12-15', 60, 3);

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (ul_id, 3, 'Upper B', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Incline Dumbbell Press', 4, '8-10', 120, 0),
            (s_id, 'Lat Pulldown',    4, '10-12', 120, 1),
            (s_id, 'Lateral Raise',   3, '12-15', 60, 2),
            (s_id, 'Face Pull',       3, '15-20', 60, 3);

        INSERT INTO template_sessions (template_id, day_number, session_name, notes)
        VALUES (ul_id, 4, 'Lower B', NULL) RETURNING id INTO s_id;
        INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, order_index) VALUES
            (s_id, 'Deadlift',        3, '5',    180, 0),
            (s_id, 'Front Squat',     3, '8-10', 150, 1),
            (s_id, 'Walking Lunge',   3, '10-12', 90, 2),
            (s_id, 'Hanging Leg Raise', 3, '10-15', 60, 3);

    END IF;
END $$;
