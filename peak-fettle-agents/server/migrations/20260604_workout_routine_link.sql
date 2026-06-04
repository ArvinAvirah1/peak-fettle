-- 20260604 — Link a workout to the routine it was performed from.
--
-- Recent Activity needs to label a session "Leg Day 6/4/26" when it came from a
-- routine, and fall back to a plain date for free (ad-hoc) sessions. Workouts are
-- stored one-per-(user, day_key) and previously had no routine reference.
--
-- We store BOTH:
--   routine_id   — FK to the routine (nullable; ON DELETE SET NULL so deleting a
--                  routine does not delete history, it just drops the link).
--   routine_name — denormalised snapshot of the routine name at session time, so
--                  the historical label survives a later rename or delete of the
--                  routine. routine_name is what the UI renders.
--
-- Both are NULL for ad-hoc / free sessions, which keep their date-only label.
--
-- Idempotent: safe to re-run.

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS routine_id   UUID REFERENCES routines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routine_name TEXT;
