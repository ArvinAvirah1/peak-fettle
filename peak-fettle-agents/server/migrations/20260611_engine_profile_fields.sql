-- 20260611 — Training Engine: user profile fields (TICKET-engine spec §2)
--
-- Adds the survey columns required by the Training Engine to the users table.
-- These fields are collected in the onboarding survey and the training-survey
-- screen (Agent C) and consumed by generatePlan() (Agent A) to select the
-- correct template, scale-down session count, and prescribe loading targets.
--
-- Idempotent: every clause uses ADD COLUMN IF NOT EXISTS, safe to re-run.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS training_goal TEXT
    CHECK (training_goal IN ('strength','hypertrophy','endurance','sport_performance','general_fitness')),
  ADD COLUMN IF NOT EXISTS sessions_per_week SMALLINT
    CHECK (sessions_per_week BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS session_minutes SMALLINT
    CHECK (session_minutes IN (15,30,45,60,90)),
  ADD COLUMN IF NOT EXISTS goal_weight_kg NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS equipment_profile TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS season_phase TEXT
    CHECK (season_phase IN ('off_season','in_season')),
  ADD COLUMN IF NOT EXISTS last_deload_at DATE;
