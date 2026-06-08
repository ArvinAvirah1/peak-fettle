-- 20260607 — Expand the exercise library (TICKET-098).
--
-- (a) Adds the one bundled-template exercise that had no exact library row
--     ("Close-Grip Lat Pulldown") so the beginner templates resolve 1:1 instead
--     of falling back to "Lat Pulldown".
-- (b) Deeper pass: common machine/cable/dumbbell/bodyweight variants that were
--     missing from the seed, across every muscle group + a couple of cardio.
--
-- Idempotent: ON CONFLICT (name) DO NOTHING relies on idx_exercises_name_unique.
-- Safe to re-run; only inserts names that don't already exist.

INSERT INTO exercises (name, category, muscle_groups, is_compound) VALUES
  -- Back / lats
  ('Close-Grip Lat Pulldown',      'lift', ARRAY['lats','biceps','back'],            TRUE),
  ('Reverse-Grip Lat Pulldown',    'lift', ARRAY['lats','biceps','back'],            TRUE),
  ('Neutral-Grip Lat Pulldown',    'lift', ARRAY['lats','biceps','back'],            TRUE),
  ('Seal Row',                     'lift', ARRAY['back','lats','biceps'],            TRUE),
  ('Meadows Row',                  'lift', ARRAY['back','lats','biceps'],            TRUE),
  ('Landmine Row',                 'lift', ARRAY['back','lats','biceps'],            TRUE),
  ('Assisted Pull-Up',             'lift', ARRAY['lats','back','biceps'],            TRUE),
  -- Chest
  ('Smith Machine Bench Press',    'lift', ARRAY['chest','triceps','anterior_deltoid'], TRUE),
  ('Dumbbell Pullover',            'lift', ARRAY['chest','lats'],                    FALSE),
  ('Incline Cable Fly',            'lift', ARRAY['chest','anterior_deltoid'],        FALSE),
  -- Shoulders
  ('Smith Machine Shoulder Press', 'lift', ARRAY['anterior_deltoid','triceps'],      TRUE),
  ('Cable Front Raise',            'lift', ARRAY['anterior_deltoid'],                FALSE),
  ('Cuban Press',                  'lift', ARRAY['shoulders','rotator_cuff'],        FALSE),
  -- Legs / glutes
  ('Smith Machine Squat',          'lift', ARRAY['quads','glutes','hamstrings'],     TRUE),
  ('Sissy Squat',                  'lift', ARRAY['quads'],                           FALSE),
  ('Pendulum Squat',               'lift', ARRAY['quads','glutes'],                  TRUE),
  ('Hip Abduction Machine',        'lift', ARRAY['glutes','abductors'],              FALSE),
  ('Hip Adduction Machine',        'lift', ARRAY['adductors'],                       FALSE),
  ('Cable Kickback',               'lift', ARRAY['glutes'],                          FALSE),
  ('Reverse Hyperextension',       'lift', ARRAY['glutes','hamstrings','lower_back'], FALSE),
  ('Dumbbell Lunge',               'lift', ARRAY['quads','glutes','hamstrings'],     TRUE),
  ('Goblet Lunge',                 'lift', ARRAY['quads','glutes'],                  TRUE),
  -- Arms
  ('Cable Rope Hammer Curl',       'lift', ARRAY['biceps','forearms'],              FALSE),
  ('Preacher Curl Machine',        'lift', ARRAY['biceps'],                          FALSE),
  ('Cable Reverse Curl',           'lift', ARRAY['forearms','biceps'],              FALSE),
  ('Tricep Dip Machine',           'lift', ARRAY['triceps','chest'],                FALSE),
  -- Core
  ('Bicycle Crunch',               'lift', ARRAY['core','obliques'],                FALSE),
  ('Decline Crunch',               'lift', ARRAY['core'],                            FALSE),
  ('Cable Woodchopper',            'lift', ARRAY['core','obliques'],                FALSE),
  ('Mountain Climbers',            'lift', ARRAY['core','hip_flexors'],             FALSE),
  ('Suitcase Carry',               'lift', ARRAY['core','obliques','forearms'],     TRUE),
  ('Hanging Knee Raise',           'lift', ARRAY['core','hip_flexors'],             FALSE),
  -- Cardio / conditioning
  ('Battle Ropes',                 'cardio', ARRAY['shoulders','core'],             FALSE),
  ('Ski Erg',                      'cardio', ARRAY['lats','triceps','core'],        FALSE)
ON CONFLICT (name) DO NOTHING;
