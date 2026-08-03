-- =============================================================================
-- Peak Fettle — pending live-DB apply (2026-06-10)
-- Paste this WHOLE file into the Supabase SQL editor and run ONCE.
--
-- Contains the two server migrations written after the 2026-06-01 schema.sql
-- consolidation. Both are idempotent — safe to run even if one (e.g. the
-- exercise expansion) was already applied:
--   * 20260604_workout_routine_link.sql  — workouts.routine_id / routine_name
--     (REQUIRED: routes/workouts.js at HEAD INSERTs these columns on every
--     workout save; without them every save 500s)
--   * 20260607_expand_exercise_library.sql — 34 exercises incl. the bundled
--     template gap "Close-Grip Lat Pulldown"
--
-- After running, the live DB matches db/schema.sql (folded same day).
-- =============================================================================

-- ---- 20260604: workout → routine link --------------------------------------
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS routine_id   UUID REFERENCES routines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routine_name TEXT;

-- ---- 20260607: exercise library expansion -----------------------------------
INSERT INTO exercises (name, category, muscle_groups, is_compound) VALUES
  ('Close-Grip Lat Pulldown',      'lift', ARRAY['lats','biceps','back'],            TRUE),
  ('Reverse-Grip Lat Pulldown',    'lift', ARRAY['lats','biceps','back'],            TRUE),
  ('Neutral-Grip Lat Pulldown',    'lift', ARRAY['lats','biceps','back'],            TRUE),
  ('Seal Row',                     'lift', ARRAY['back','lats','biceps'],            TRUE),
  ('Meadows Row',                  'lift', ARRAY['back','lats','biceps'],            TRUE),
  ('Landmine Row',                 'lift', ARRAY['back','lats','biceps'],            TRUE),
  ('Assisted Pull-Up',             'lift', ARRAY['lats','back','biceps'],            TRUE),
  ('Smith Machine Bench Press',    'lift', ARRAY['chest','triceps','anterior_deltoid'], TRUE),
  ('Dumbbell Pullover',            'lift', ARRAY['chest','lats'],                    FALSE),
  ('Incline Cable Fly',            'lift', ARRAY['chest','anterior_deltoid'],        FALSE),
  ('Smith Machine Shoulder Press', 'lift', ARRAY['anterior_deltoid','triceps'],      TRUE),
  ('Cable Front Raise',            'lift', ARRAY['anterior_deltoid'],                FALSE),
  ('Cuban Press',                  'lift', ARRAY['shoulders','rotator_cuff'],        FALSE),
  ('Smith Machine Squat',          'lift', ARRAY['quads','glutes','hamstrings'],     TRUE),
  ('Sissy Squat',                  'lift', ARRAY['quads'],                           FALSE),
  ('Pendulum Squat',               'lift', ARRAY['quads','glutes'],                  TRUE),
  ('Hip Abduction Machine',        'lift', ARRAY['glutes','abductors'],              FALSE),
  ('Hip Adduction Machine',        'lift', ARRAY['adductors'],                       FALSE),
  ('Cable Kickback',               'lift', ARRAY['glutes'],                          FALSE),
  ('Reverse Hyperextension',       'lift', ARRAY['glutes','hamstrings','lower_back'], FALSE),
  ('Dumbbell Lunge',               'lift', ARRAY['quads','glutes','hamstrings'],     TRUE),
  ('Goblet Lunge',                 'lift', ARRAY['quads','glutes'],                  TRUE),
  ('Cable Rope Hammer Curl',       'lift', ARRAY['biceps','forearms'],              FALSE),
  ('Preacher Curl Machine',        'lift', ARRAY['biceps'],                          FALSE),
  ('Cable Reverse Curl',           'lift', ARRAY['forearms','biceps'],              FALSE),
  ('Tricep Dip Machine',           'lift', ARRAY['triceps','chest'],                FALSE),
  ('Bicycle Crunch',               'lift', ARRAY['core','obliques'],                FALSE),
  ('Decline Crunch',               'lift', ARRAY['core'],                            FALSE),
  ('Cable Woodchopper',            'lift', ARRAY['core','obliques'],                FALSE),
  ('Mountain Climbers',            'lift', ARRAY['core','hip_flexors'],             FALSE),
  ('Suitcase Carry',               'lift', ARRAY['core','obliques','forearms'],     TRUE),
  ('Hanging Knee Raise',           'lift', ARRAY['core','hip_flexors'],             FALSE),
  ('Battle Ropes',                 'cardio', ARRAY['shoulders','core'],             FALSE),
  ('Ski Erg',                      'cardio', ARRAY['lats','triceps','core'],        FALSE)
ON CONFLICT (name) DO NOTHING;

-- ---- verification -----------------------------------------------------------
-- Expect 2 rows:
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'workouts' AND column_name IN ('routine_id','routine_name');
-- Expect 1 row:
SELECT name FROM exercises WHERE name = 'Close-Grip Lat Pulldown';
