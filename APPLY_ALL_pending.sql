-- APPLY_ALL_pending.sql — pending Supabase migrations, made fully idempotent.
-- Safe to run multiple times. Run in the Supabase SQL Editor (this is the Supabase DB).
-- The only non-idempotent statement (CREATE POLICY) is guarded with DROP ... IF EXISTS.

-- ====================================================================
-- notification_queue (absent from prod dump; written by workouts.js paywall/
-- streak enqueues + plans.js + cohort cron, polled by push-dispatcher cron).
-- Schema matches the dispatcher: pending = sent_at IS NULL; retry_count +
-- failed_permanently for the retry cap. All enqueues are swallowed try/catch so
-- this never 500s a screen, but push delivery can't work without the table.
-- ====================================================================
CREATE TABLE IF NOT EXISTS notification_queue (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type               TEXT         NOT NULL,
    title              TEXT         NOT NULL,
    body               TEXT         NOT NULL,
    data               JSONB,
    sent_at            TIMESTAMPTZ,            -- NULL = pending
    error              TEXT,                   -- last dispatch error if any
    retry_count        INTEGER      NOT NULL DEFAULT 0,
    failed_permanently BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
    ON notification_queue (created_at ASC)
    WHERE sent_at IS NULL AND failed_permanently = FALSE;

-- ====================================================================
-- 20260526_routines_table.sql
-- ====================================================================
CREATE TABLE IF NOT EXISTS routines (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    exercises    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);

ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS routines_user_policy ON routines;
CREATE POLICY routines_user_policy ON routines
    FOR ALL USING (auth.uid() = user_id);

-- ====================================================================
-- 20260529_show_wilks.sql
-- ====================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_wilks BOOLEAN NOT NULL DEFAULT FALSE;

-- ====================================================================
-- 20260530_template_library.sql
-- ====================================================================
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
    reps          TEXT        NOT NULL,
    rest_seconds  INT,
    form_cue      TEXT,
    order_index   INT         NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_template_exercises_session ON template_exercises(session_id);

-- Seed — PLACEHOLDER starter content (FOUNDER: review / expand / replace).
DO $$
DECLARE
    fb_id UUID;
    ul_id UUID;
    s_id  UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM workout_templates) THEN

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

-- ====================================================================
-- 20260530_workouts_session_type.sql
-- ====================================================================
ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'workout';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'workouts_session_type_check'
    ) THEN
        ALTER TABLE workouts
            ADD CONSTRAINT workouts_session_type_check
            CHECK (session_type IN ('workout', 'rest_day', 'emergency_override', 'cardio_import'));
    END IF;
END $$;

-- ====================================================================
-- 20260531_workouts_cardio_columns.sql
-- ====================================================================
-- csvImport.js inserts these + workouts.js mileage/pace analytics GROUP BY
-- activity_type; none existed on workouts (CSV import + cardio analytics 500'd).
ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS activity_type       TEXT,
    ADD COLUMN IF NOT EXISTS duration_seconds    INTEGER,
    ADD COLUMN IF NOT EXISTS distance_m          INTEGER,
    ADD COLUMN IF NOT EXISTS avg_pace_sec_per_km INTEGER,
    ADD COLUMN IF NOT EXISTS source              TEXT;

-- ====================================================================
-- 20260531_users_paywall_triggered_at.sql
-- ====================================================================
-- routes/workouts.js paywall block reads/writes users.paywall_triggered_at,
-- which was missing (silently broke paywall persistence; non-fatal — swallowed).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS paywall_triggered_at TIMESTAMPTZ;

-- ====================================================================
-- 20260531_workouts_unique_day.sql
-- ====================================================================
-- POST /workouts uses ON CONFLICT (user_id, day_key); needs a unique index there.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'workouts'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef ILIKE '%(user_id, day_key)%'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'workouts'
          AND c.contype IN ('u', 'p')
          AND pg_get_constraintdef(c.oid) ILIKE '%(user_id, day_key)%'
    )
    THEN
        CREATE UNIQUE INDEX workouts_user_day_key_uniq
            ON workouts (user_id, day_key);
    END IF;
END $$;
