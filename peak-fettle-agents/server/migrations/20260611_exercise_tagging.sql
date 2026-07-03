-- 20260611 — Training Engine: exercise movement_pattern + equipment tagging (TICKET-engine spec §2)
--
-- (a) Adds movement_pattern TEXT and equipment TEXT[] columns to exercises.
-- (b) Tags every seeded exercise with a movement_pattern from the closed taxonomy:
--     squat, hinge, lunge, horizontal_push, vertical_push, horizontal_pull,
--     vertical_pull, isolation_arms, isolation_shoulders, isolation_chest,
--     isolation_back, isolation_legs, isolation_calves, core, carry,
--     olympic, plyometric, cardio
--     and equipment from the closed vocabulary:
--     barbell, dumbbell, kettlebell, machine, cable, bodyweight, bands,
--     bench, rack, pullup_bar, bike, treadmill, pool, track
--
-- Sources: db/schema.sql seed + migrations/20260611_expand_exercise_library.sql
-- Default for unrecognised exercises: movement_pattern = NULL, equipment = ARRAY['machine']
--
-- Idempotent: column adds use IF NOT EXISTS; UPDATE rows are guarded by
--   WHERE movement_pattern IS NULL so repeated runs never overwrite
--   manually-set values.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS movement_pattern TEXT,
  ADD COLUMN IF NOT EXISTS equipment        TEXT[];

-- ---------------------------------------------------------------------------
-- CHEST — horizontal_push family
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','bench','rack']
  WHERE name = 'Barbell Bench Press'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','bench','rack']
  WHERE name = 'Incline Barbell Bench Press'      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','bench','rack']
  WHERE name = 'Decline Barbell Bench Press'      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','bench','rack']
  WHERE name = 'Close-Grip Bench Press'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Dumbbell Bench Press'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Incline Dumbbell Press'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Decline Dumbbell Press'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Flat Dumbbell Fly'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Incline Dumbbell Fly'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['cable']
  WHERE name = 'Cable Crossover'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['cable']
  WHERE name = 'Cable Fly (Low to High)'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['cable']
  WHERE name = 'Cable Fly (High to Low)'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['machine']
  WHERE name = 'Pec Deck'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['machine']
  WHERE name = 'Machine Chest Press'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['bodyweight']
  WHERE name = 'Push-Up'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['bodyweight']
  WHERE name = 'Diamond Push-Up'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['bodyweight','rack']
  WHERE name = 'Dip (Chest-Focused)'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['bodyweight','rack']
  WHERE name = 'Weighted Dip'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','bench']
  WHERE name = 'Floor Press'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['barbell','rack']
  WHERE name = 'Landmine Press'                   AND movement_pattern IS NULL;
-- Smith Machine Bench Press
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['machine','bench']
  WHERE name = 'Smith Machine Bench Press'        AND movement_pattern IS NULL;
-- Dumbbell Pullover (lats+chest — treat as isolation_chest per primary muscle_groups)
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Dumbbell Pullover'                AND movement_pattern IS NULL;
-- Incline Cable Fly
UPDATE exercises SET movement_pattern = 'isolation_chest', equipment = ARRAY['cable','bench']
  WHERE name = 'Incline Cable Fly'                AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- BACK — horizontal_pull / vertical_pull / hinge / isolation_back
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Deadlift'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell']
  WHERE name = 'Sumo Deadlift'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell']
  WHERE name = 'Trap Bar Deadlift'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell']
  WHERE name = 'Stiff-Leg Deadlift'               AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Rack Pull'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Pull-Up'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Chin-Up'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Wide-Grip Pull-Up'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Weighted Pull-Up'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['machine','cable']
  WHERE name = 'Lat Pulldown'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['machine','cable']
  WHERE name = 'Wide-Grip Lat Pulldown'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['cable']
  WHERE name = 'Straight-Arm Pulldown'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['barbell']
  WHERE name = 'Barbell Row'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['barbell']
  WHERE name = 'Pendlay Row'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['barbell']
  WHERE name = 'T-Bar Row'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['cable','machine']
  WHERE name = 'Seated Cable Row'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Single-Arm Dumbbell Row'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Chest-Supported Dumbbell Row'     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['bodyweight']
  WHERE name = 'Inverted Row'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['machine']
  WHERE name = 'Machine Row'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_back',  equipment = ARRAY['bodyweight','machine']
  WHERE name = 'Hyperextension'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell']
  WHERE name = 'Good Morning'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['barbell']
  WHERE name = 'Shrug (Barbell)'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['dumbbell']
  WHERE name = 'Shrug (Dumbbell)'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'carry',           equipment = ARRAY['dumbbell','barbell','kettlebell']
  WHERE name = 'Farmer''s Carry'                  AND movement_pattern IS NULL;
-- Expanded back exercises
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['cable','machine']
  WHERE name = 'Close-Grip Lat Pulldown'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['cable','machine']
  WHERE name = 'Reverse-Grip Lat Pulldown'        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['cable','machine']
  WHERE name = 'Neutral-Grip Lat Pulldown'        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['barbell','bench']
  WHERE name = 'Seal Row'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['dumbbell']
  WHERE name = 'Meadows Row'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_pull', equipment = ARRAY['barbell']
  WHERE name = 'Landmine Row'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_pull',   equipment = ARRAY['machine','pullup_bar','bodyweight']
  WHERE name = 'Assisted Pull-Up'                 AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- SHOULDERS — vertical_push / isolation_shoulders
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['barbell','rack']
  WHERE name = 'Overhead Press'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['barbell','rack']
  WHERE name = 'Push Press'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['barbell','bench']
  WHERE name = 'Seated Barbell Press'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['dumbbell']
  WHERE name = 'Dumbbell Shoulder Press'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['dumbbell']
  WHERE name = 'Arnold Press'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['machine']
  WHERE name = 'Machine Shoulder Press'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['dumbbell']
  WHERE name = 'Lateral Raise'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['cable']
  WHERE name = 'Cable Lateral Raise'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['machine']
  WHERE name = 'Machine Lateral Raise'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['dumbbell','barbell']
  WHERE name = 'Front Raise'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['dumbbell']
  WHERE name = 'Bent-Over Reverse Fly'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['machine']
  WHERE name = 'Reverse Pec Deck'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['cable']
  WHERE name = 'Face Pull'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['barbell','cable']
  WHERE name = 'Upright Row'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['bodyweight']
  WHERE name = 'Handstand Push-Up'                AND movement_pattern IS NULL;
-- Expanded shoulder exercises
UPDATE exercises SET movement_pattern = 'vertical_push',   equipment = ARRAY['machine','bench']
  WHERE name = 'Smith Machine Shoulder Press'     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['cable']
  WHERE name = 'Cable Front Raise'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['dumbbell','barbell']
  WHERE name = 'Cuban Press'                      AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- BICEPS — isolation_arms
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell']
  WHERE name = 'Barbell Curl'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell']
  WHERE name = 'EZ-Bar Curl'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Dumbbell Curl'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Alternating Dumbbell Curl'        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Hammer Curl'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Incline Dumbbell Curl'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['machine','barbell']
  WHERE name = 'Preacher Curl'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Spider Curl'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Concentration Curl'               AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Cable Curl'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Reverse Curl'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Zottman Curl'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['machine']
  WHERE name = 'Machine Curl'                     AND movement_pattern IS NULL;
-- Expanded arm exercises
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Cable Rope Hammer Curl'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['machine']
  WHERE name = 'Preacher Curl Machine'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Cable Reverse Curl'               AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- TRICEPS — isolation_arms
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Triceps Pushdown'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Rope Pushdown'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell','cable','barbell']
  WHERE name = 'Overhead Triceps Extension'       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','bench']
  WHERE name = 'Skull Crusher'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','bench']
  WHERE name = 'EZ-Bar Skull Crusher'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell','bench']
  WHERE name = 'Dumbbell Skull Crusher'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['cable']
  WHERE name = 'Cable Overhead Extension'         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['dumbbell']
  WHERE name = 'Triceps Kickback'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['bench','bodyweight']
  WHERE name = 'Bench Dip'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'horizontal_push', equipment = ARRAY['bodyweight','rack']
  WHERE name = 'Parallel Bar Dip (Triceps)'       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','bench']
  WHERE name = 'JM Press'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['machine']
  WHERE name = 'Machine Triceps Extension'        AND movement_pattern IS NULL;
-- Expanded tricep
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['machine']
  WHERE name = 'Tricep Dip Machine'               AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- FOREARMS — isolation_arms
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Wrist Curl'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Reverse Wrist Curl'               AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Dead Hang'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['bodyweight']
  WHERE name = 'Plate Pinch Hold'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_arms',  equipment = ARRAY['bodyweight']
  WHERE name = 'Wrist Roller'                     AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- QUADS / SQUAT FAMILY — squat, lunge
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Back Squat'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Front Squat'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack']
  WHERE name = 'High-Bar Squat'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Low-Bar Squat'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack']
  WHERE name = 'Pause Squat'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','rack','bench']
  WHERE name = 'Box Squat'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['dumbbell','kettlebell']
  WHERE name = 'Goblet Squat'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['machine']
  WHERE name = 'Hack Squat'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['machine','barbell']
  WHERE name = 'Belt Squat'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['machine']
  WHERE name = 'Leg Press'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Leg Extension'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['barbell','dumbbell','bodyweight']
  WHERE name = 'Walking Lunge'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['barbell','dumbbell','bodyweight']
  WHERE name = 'Reverse Lunge'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['dumbbell','barbell','bodyweight']
  WHERE name = 'Bulgarian Split Squat'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['dumbbell','barbell','bodyweight']
  WHERE name = 'Step-Up'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['bodyweight']
  WHERE name = 'Pistol Squat'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['bodyweight']
  WHERE name = 'Bodyweight Squat'                 AND movement_pattern IS NULL;
-- Expanded squat/lunge
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['machine']
  WHERE name = 'Smith Machine Squat'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['bodyweight']
  WHERE name = 'Sissy Squat'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['machine']
  WHERE name = 'Pendulum Squat'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['dumbbell']
  WHERE name = 'Dumbbell Lunge'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['dumbbell','kettlebell']
  WHERE name = 'Goblet Lunge'                     AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- HAMSTRINGS — hinge, isolation_legs
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Romanian Deadlift'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Single-Leg Romanian Deadlift'     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Lying Leg Curl'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Seated Leg Curl'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['bodyweight']
  WHERE name = 'Nordic Curl'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['machine','bodyweight']
  WHERE name = 'Glute-Ham Raise'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['kettlebell','dumbbell']
  WHERE name = 'Kettlebell Swing'                 AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- GLUTES — hinge, isolation_legs, lunge
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','dumbbell','bench']
  WHERE name = 'Hip Thrust'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['barbell','bench']
  WHERE name = 'Barbell Hip Thrust'               AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['bodyweight']
  WHERE name = 'Glute Bridge'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['bodyweight','dumbbell']
  WHERE name = 'Single-Leg Hip Thrust'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['cable']
  WHERE name = 'Cable Pull-Through'               AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['bodyweight']
  WHERE name = 'Frog Pump'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'lunge',           equipment = ARRAY['dumbbell','barbell','bodyweight']
  WHERE name = 'Curtsy Lunge'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Glute Kickback Machine'           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['bands','bodyweight']
  WHERE name = 'Banded Clamshell'                 AND movement_pattern IS NULL;
-- Expanded glute/leg exercises
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Hip Abduction Machine'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['machine']
  WHERE name = 'Hip Adduction Machine'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_legs',  equipment = ARRAY['cable']
  WHERE name = 'Cable Kickback'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'hinge',           equipment = ARRAY['machine','bodyweight']
  WHERE name = 'Reverse Hyperextension'           AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- CALVES — isolation_calves
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['machine','barbell','dumbbell']
  WHERE name = 'Standing Calf Raise'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['machine']
  WHERE name = 'Seated Calf Raise'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['machine','bodyweight']
  WHERE name = 'Donkey Calf Raise'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['machine']
  WHERE name = 'Leg Press Calf Raise'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['bodyweight']
  WHERE name = 'Single-Leg Calf Raise'            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_calves', equipment = ARRAY['bodyweight']
  WHERE name = 'Tibialis Raise'                   AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- CORE — core
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Plank'                            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Side Plank'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Hollow Hold'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Dead Bug'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Hanging Leg Raise'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Toes-to-Bar'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['cable']
  WHERE name = 'Cable Crunch'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Crunch'                           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['dumbbell','bodyweight']
  WHERE name = 'Russian Twist'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['cable']
  WHERE name = 'Pallof Press'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Ab Wheel Rollout'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Dragon Flag'                      AND movement_pattern IS NULL;
-- Expanded core
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Bicycle Crunch'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight','bench']
  WHERE name = 'Decline Crunch'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['cable']
  WHERE name = 'Cable Woodchopper'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Mountain Climbers'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'carry',           equipment = ARRAY['dumbbell','kettlebell']
  WHERE name = 'Suitcase Carry'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['pullup_bar','bodyweight']
  WHERE name = 'Hanging Knee Raise'               AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- FULL BODY / CONDITIONING — plyometric, carry
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bodyweight']
  WHERE name = 'Burpee'                           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell','dumbbell']
  WHERE name = 'Thruster'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'carry',           equipment = ARRAY['dumbbell','kettlebell']
  WHERE name = 'Turkish Get-Up'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'carry',           equipment = ARRAY['machine']
  WHERE name = 'Sled Push'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'carry',           equipment = ARRAY['machine']
  WHERE name = 'Sled Pull'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bodyweight']
  WHERE name = 'Tire Flip'                        AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- OLYMPIC — olympic
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Snatch'                           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Power Snatch'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'squat',           equipment = ARRAY['barbell']
  WHERE name = 'Overhead Squat'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Clean'                            AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Power Clean'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Hang Clean'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Clean and Jerk'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'olympic',         equipment = ARRAY['barbell']
  WHERE name = 'Jerk'                             AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- PLYOMETRICS — plyometric
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bench','bodyweight']
  WHERE name = 'Box Jump'                         AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bodyweight']
  WHERE name = 'Broad Jump'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bodyweight']
  WHERE name = 'Jump Squat'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'plyometric',      equipment = ARRAY['bodyweight']
  WHERE name = 'Medicine Ball Slam'               AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- CARDIO — cardio
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['track']
  WHERE name = 'Running (Outdoor)'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['treadmill']
  WHERE name = 'Treadmill Run'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['treadmill']
  WHERE name = 'Treadmill Walk'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['treadmill']
  WHERE name = 'Incline Walk'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['track']
  WHERE name = 'Sprint Intervals'                 AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['track']
  WHERE name = '5K Run'                           AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['track']
  WHERE name = '10K Run'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['bike']
  WHERE name = 'Cycling (Outdoor)'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['bike']
  WHERE name = 'Stationary Bike'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['bike']
  WHERE name = 'Assault Bike'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['machine']
  WHERE name = 'Rowing (Erg)'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['pool']
  WHERE name = 'Swimming (Freestyle)'             AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['machine']
  WHERE name = 'Stair Climber'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['machine']
  WHERE name = 'Elliptical'                       AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['bodyweight']
  WHERE name = 'Jump Rope'                        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['track']
  WHERE name = 'Hike'                             AND movement_pattern IS NULL;
-- Expanded cardio/conditioning
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['bodyweight']
  WHERE name = 'Battle Ropes'                     AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'cardio',          equipment = ARRAY['machine']
  WHERE name = 'Ski Erg'                          AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- MOBILITY — core (mobility patterns don't map to a strength pattern;
--            core is the closest catch-all; equipment = bodyweight)
-- ---------------------------------------------------------------------------
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Couch Stretch'                    AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = '90-90 Hip Stretch'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Pigeon Pose'                      AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'World''s Greatest Stretch'        AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Cat-Cow'                          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Thoracic Spine Rotation'          AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Foam Roll Quads'                  AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Foam Roll Back'                   AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'isolation_shoulders', equipment = ARRAY['bodyweight']
  WHERE name = 'Shoulder Dislocates'              AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Hamstring Stretch'                AND movement_pattern IS NULL;
UPDATE exercises SET movement_pattern = 'core',            equipment = ARRAY['bodyweight']
  WHERE name = 'Calf Stretch'                     AND movement_pattern IS NULL;

-- ---------------------------------------------------------------------------
-- FALLBACK: any exercise still untagged gets equipment = ARRAY['machine']
--           movement_pattern remains NULL (discoverable via IS NULL query)
-- ---------------------------------------------------------------------------
UPDATE exercises
  SET equipment = ARRAY['machine']
  WHERE equipment IS NULL;
