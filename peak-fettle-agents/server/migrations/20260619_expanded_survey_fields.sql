-- 20260619 — Pro server sync for the expanded Training-Engine survey (Task 3)
--
-- Adds the expanded survey columns collected by mobile/app/training-survey.tsx
-- and stored on-device in user_profile (mobile/src/db/localSchema.ts, schema v8)
-- to the server `users` table, so a PRO user's answers persist + sync via
-- PATCH /user/profile (peak-fettle-agents/server/routes/user.js).
--
-- FREE users are local-first and need none of this (no server row is written).
--
-- birth_date already exists on users (DATE, see db/schema.sql CREATE TABLE users)
-- and is intentionally NOT re-added here — it is only newly *whitelisted* in the
-- PATCH handler.
--
-- Shapes mirror the on-device JSON columns:
--   primary_focus     TEXT        — chosen discipline string
--   injuries          TEXT[]      — string[] of injury/limitation tokens
--   muscle_priorities TEXT[]      — string[] of prioritised muscle labels
--   bodyweight_kg     NUMERIC(5,2)— current body weight, canonical exact kg
--                                   (units invariant: never the legacy kg×8)
--   training_days     INTEGER[]   — weekday indices 0=Sun … 6=Sat
--
-- Idempotent: every clause uses ADD COLUMN IF NOT EXISTS, safe to re-run. No
-- CHECK constraints on the discipline/array vocab so the survey can evolve
-- without a brittle DB migration (the route validates types + caps).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS primary_focus     TEXT,
  ADD COLUMN IF NOT EXISTS injuries          TEXT[],
  ADD COLUMN IF NOT EXISTS muscle_priorities TEXT[],
  ADD COLUMN IF NOT EXISTS bodyweight_kg     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS training_days     INTEGER[];
