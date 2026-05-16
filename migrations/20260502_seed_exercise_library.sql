-- Peak Fettle — Exercise library seed (Phase B)
-- Author: dev-database
-- Date: 2026-05-02
-- Source: DEV_ROADMAP_2026-05-01.md Phase B, TICKET-007
--
-- Seeds ~160 exercises across all categories into the `exercises` table,
-- then seeds common aliases/synonyms into `exercise_aliases` so the
-- GET /exercises/search endpoint can surface canonical names from colloquial
-- queries ("OHP" → Overhead Press, "RDL" → Romanian Deadlift, etc.).
--
-- Safe to re-run: uses INSERT … ON CONFLICT DO NOTHING throughout.
-- Requires: 20260430_initial_schema.sql has been applied.

-- Enable pg_trgm if not already enabled (needed for the GIN index on exercises.name).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- EXERCISES
-- ---------------------------------------------------------------------------
-- Unique index on exercises.name required for the ON CONFLICT (name) clause
-- in the INSERT below. Must be created before the INSERT runs.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'exercises'
          AND indexname  = 'idx_exercises_name_unique'
    ) THEN
        CREATE UNIQUE INDEX idx_exercises_name_unique ON exercises (name);
    END IF;
END $$;

INSERT INTO exercises (name, category, muscle_groups, is_compound) VALUES
-- ======================== CHEST ========================
('Barbell Bench Press',            'lift', ARRAY['chest','triceps','anterior_deltoid'], TRUE),
('Incline Barbell Bench Press',    'lift', ARRAY['chest','triceps','anterior_deltoid'], TRUE),
('Decline Barbell Bench Press',    'lift', ARRAY['chest','triceps'],                   TRUE),
('Close-Grip Bench Press',         'lift', ARRAY['triceps','chest'],                   TRUE),
('Dumbbell Bench Press',           'lift', ARRAY['chest','triceps','anterior_deltoid'], TRUE),
('Incline Dumbbell Press',         'lift', ARRAY['chest','anterior_deltoid'],          TRUE),
('Decline Dumbbell Press',         'lift', ARRAY['chest','triceps'],                   TRUE),
('Flat Dumbbell Fly',              'lift', ARRAY['chest'],                             FALSE),
('Incline Dumbbell Fly',           'lift', ARRAY['chest','anterior_deltoid'],          FALSE),
('Cable Crossover',                'lift', ARRAY['chest'],                             FALSE),
('Cable Fly (Low to High)',        'lift', ARRAY['chest'],                             FALSE),
('Cable Fly (High to Low)',        'lift', ARRAY['chest'],                             FALSE),
('Pec Deck',                       'lift', ARRAY['chest'],                             FALSE),
('Machine Chest Press',            'lift', ARRAY['chest','triceps'],                   TRUE),
('Push-Up',                        'lift', ARRAY['chest','triceps','anterior_deltoid'], TRUE),
('Diamond Push-Up',                'lift', ARRAY['triceps','chest'],                   TRUE),
('Dip (Chest-Focused)',            'lift', ARRAY['chest','triceps'],                   TRUE),
('Weighted Dip',                   'lift', ARRAY['chest','triceps'],                   TRUE),
('Floor Press',                    'lift', ARRAY['chest','triceps'],                   TRUE),
('Landmine Press',                 'lift', ARRAY['chest','anterior_deltoid'],          TRUE),

-- ======================== BACK ========================
('Deadlift',                        'lift', ARRAY['back','glutes','hamstrings'],         TRUE),
('Sumo Deadlift',                   'lift', ARRAY['glutes','hamstrings','back'],         TRUE),
('Trap Bar Deadlift',               'lift', ARRAY['back','glutes','quads'],              TRUE),
('Stiff-Leg Deadlift',              'lift', ARRAY['hamstrings','back'],                  TRUE),
('Rack Pull',                       'lift', ARRAY['back','traps'],                       TRUE),
('Pull-Up',                         'lift', ARRAY['latissimus_dorsi','biceps'],          TRUE),
('Chin-Up',                         'lift', ARRAY['latissimus_dorsi','biceps'],          TRUE),
('Wide-Grip Pull-Up',               'lift', ARRAY['latissimus_dorsi'],                   TRUE),
('Weighted Pull-Up',                'lift', ARRAY['latissimus_dorsi','biceps'],          TRUE),
('Lat Pulldown',                    'lift', ARRAY['latissimus_dorsi','biceps'],          FALSE),
('Wide-Grip Lat Pulldown',          'lift', ARRAY['latissimus_dorsi'],                   FALSE),
('Straight-Arm Pulldown',           'lift', ARRAY['latissimus_dorsi'],                   FALSE),
('Barbell Row',                     'lift', ARRAY['upper_back','biceps'],                TRUE),
('Pendlay Row',                     'lift', ARRAY['upper_back'],                         TRUE),
('T-Bar Row',                       'lift', ARRAY['upper_back','biceps'],                TRUE),
('Seated Cable Row',                'lift', ARRAY['upper_back','biceps'],                FALSE),
('Single-Arm Dumbbell Row',         'lift', ARRAY['latissimus_dorsi','biceps'],          FALSE),
('Chest-Supported Dumbbell Row',    'lift', ARRAY['upper_back'],                         FALSE),
('Inverted Row',                    'lift', ARRAY['upper_back','biceps'],                TRUE),
('Machine Row',                     'lift', ARRAY['upper_back'],                         FALSE),
('Hyperextension',                  'lift', ARRAY['lower_back','glutes'],                FALSE),
('Good Morning',                    'lift', ARRAY['hamstrings','lower_back'],             TRUE),
('Shrug (Barbell)',                  'lift', ARRAY['traps'],                              FALSE),
('Shrug (Dumbbell)',                 'lift', ARRAY['traps'],                              FALSE),
('Farmer''s Carry',                  'lift', ARRAY['traps','forearms','core'],            TRUE),

-- ======================== SHOULDERS ========================
('Overhead Press',                  'lift', ARRAY['anterior_deltoid','triceps','traps'],  TRUE),
('Push Press',                      'lift', ARRAY['anterior_deltoid','triceps','quads'],  TRUE),
('Seated Barbell Press',            'lift', ARRAY['anterior_deltoid','triceps'],          TRUE),
('Dumbbell Shoulder Press',         'lift', ARRAY['anterior_deltoid','triceps'],          TRUE),
('Arnold Press',                    'lift', ARRAY['deltoids','triceps'],                  FALSE),
('Machine Shoulder Press',          'lift', ARRAY['anterior_deltoid','triceps'],          FALSE),
('Lateral Raise',                   'lift', ARRAY['medial_deltoid'],                     FALSE),
('Cable Lateral Raise',             'lift', ARRAY['medial_deltoid'],                     FALSE),
('Machine Lateral Raise',           'lift', ARRAY['medial_deltoid'],                     FALSE),
('Front Raise',                     'lift', ARRAY['anterior_deltoid'],                   FALSE),
('Bent-Over Reverse Fly',           'lift', ARRAY['posterior_deltoid','upper_back'],     FALSE),
('Reverse Pec Deck',                'lift', ARRAY['posterior_deltoid','upper_back'],     FALSE),
('Face Pull',                       'lift', ARRAY['posterior_deltoid','rotator_cuff'],   FALSE),
('Upright Row',                     'lift', ARRAY['traps','medial_deltoid'],              FALSE),
('Handstand Push-Up',               'lift', ARRAY['anterior_deltoid','triceps'],          TRUE),

-- ======================== BICEPS ========================
('Barbell Curl',                    'lift', ARRAY['biceps'],                             FALSE),
('EZ-Bar Curl',                     'lift', ARRAY['biceps'],                             FALSE),
('Dumbbell Curl',                   'lift', ARRAY['biceps'],                             FALSE),
('Alternating Dumbbell Curl',       'lift', ARRAY['biceps'],                             FALSE),
('Hammer Curl',                     'lift', ARRAY['biceps','brachialis'],                FALSE),
('Incline Dumbbell Curl',           'lift', ARRAY['biceps'],                             FALSE),
('Preacher Curl',                   'lift', ARRAY['biceps'],                             FALSE),
('Spider Curl',                     'lift', ARRAY['biceps'],                             FALSE),
('Concentration Curl',              'lift', ARRAY['biceps'],                             FALSE),
('Cable Curl',                      'lift', ARRAY['biceps'],                             FALSE),
('Reverse Curl',                    'lift', ARRAY['brachialis','forearms'],              FALSE),
('Zottman Curl',                    'lift', ARRAY['biceps','forearms'],                  FALSE),
('Machine Curl',                    'lift', ARRAY['biceps'],                             FALSE),

-- ======================== TRICEPS ========================
('Triceps Pushdown',                'lift', ARRAY['triceps'],                            FALSE),
('Rope Pushdown',                   'lift', ARRAY['triceps'],                            FALSE),
('Overhead Triceps Extension',      'lift', ARRAY['triceps'],                            FALSE),
('Skull Crusher',                   'lift', ARRAY['triceps'],                            FALSE),
('EZ-Bar Skull Crusher',            'lift', ARRAY['triceps'],                            FALSE),
('Dumbbell Skull Crusher',          'lift', ARRAY['triceps'],                            FALSE),
('Cable Overhead Extension',        'lift', ARRAY['triceps'],                            FALSE),
('Triceps Kickback',                'lift', ARRAY['triceps'],                            FALSE),
('Bench Dip',                       'lift', ARRAY['triceps'],                            FALSE),
('Parallel Bar Dip (Triceps)',       'lift', ARRAY['triceps','chest'],                   TRUE),
('JM Press',                        'lift', ARRAY['triceps'],                            FALSE),
('Machine Triceps Extension',       'lift', ARRAY['triceps'],                            FALSE),

-- ======================== FOREARMS ========================
('Wrist Curl',                      'lift', ARRAY['forearms'],                           FALSE),
('Reverse Wrist Curl',              'lift', ARRAY['forearms'],                           FALSE),
('Dead Hang',                       'lift', ARRAY['forearms','grip'],                    FALSE),
('Plate Pinch Hold',                'lift', ARRAY['forearms','grip'],                    FALSE),
('Wrist Roller',                    'lift', ARRAY['forearms'],                           FALSE),

-- ======================== QUADS ========================
('Back Squat',                      'lift', ARRAY['quads','glutes'],                     TRUE),
('Front Squat',                     'lift', ARRAY['quads','core'],                       TRUE),
('High-Bar Squat',                  'lift', ARRAY['quads','glutes'],                     TRUE),
('Low-Bar Squat',                   'lift', ARRAY['quads','glutes','hamstrings'],        TRUE),
('Pause Squat',                     'lift', ARRAY['quads','glutes'],                     TRUE),
('Box Squat',                       'lift', ARRAY['quads','glutes'],                     TRUE),
('Goblet Squat',                    'lift', ARRAY['quads','core'],                       TRUE),
('Hack Squat',                      'lift', ARRAY['quads'],                              FALSE),
('Belt Squat',                      'lift', ARRAY['quads','glutes'],                     TRUE),
('Leg Press',                       'lift', ARRAY['quads','glutes'],                     FALSE),
('Leg Extension',                   'lift', ARRAY['quads'],                              FALSE),
('Walking Lunge',                   'lift', ARRAY['quads','glutes'],                     TRUE),
('Reverse Lunge',                   'lift', ARRAY['quads','glutes'],                     TRUE),
('Bulgarian Split Squat',           'lift', ARRAY['quads','glutes'],                     TRUE),
('Step-Up',                         'lift', ARRAY['quads','glutes'],                     TRUE),
('Pistol Squat',                    'lift', ARRAY['quads','core'],                       TRUE),
('Bodyweight Squat',                'lift', ARRAY['quads','glutes'],                     TRUE),

-- ======================== HAMSTRINGS ========================
('Romanian Deadlift',               'lift', ARRAY['hamstrings','glutes'],                TRUE),
('Single-Leg Romanian Deadlift',    'lift', ARRAY['hamstrings','glutes'],                TRUE),
('Lying Leg Curl',                  'lift', ARRAY['hamstrings'],                         FALSE),
('Seated Leg Curl',                 'lift', ARRAY['hamstrings'],                         FALSE),
('Nordic Curl',                     'lift', ARRAY['hamstrings'],                         FALSE),
('Glute-Ham Raise',                 'lift', ARRAY['hamstrings','glutes'],                TRUE),
('Kettlebell Swing',                'lift', ARRAY['hamstrings','glutes','lower_back'],   TRUE),

-- ======================== GLUTES ========================
('Hip Thrust',                      'lift', ARRAY['glutes'],                             FALSE),
('Barbell Hip Thrust',              'lift', ARRAY['glutes'],                             FALSE),
('Glute Bridge',                    'lift', ARRAY['glutes'],                             FALSE),
('Single-Leg Hip Thrust',           'lift', ARRAY['glutes'],                             FALSE),
('Cable Pull-Through',              'lift', ARRAY['glutes','hamstrings'],                FALSE),
('Frog Pump',                       'lift', ARRAY['glutes'],                             FALSE),
('Curtsy Lunge',                    'lift', ARRAY['glutes','quads'],                     TRUE),
('Glute Kickback Machine',          'lift', ARRAY['glutes'],                             FALSE),
('Banded Clamshell',                'lift', ARRAY['glutes','hip_abductors'],             FALSE),

-- ======================== CALVES ========================
('Standing Calf Raise',             'lift', ARRAY['calves'],                             FALSE),
('Seated Calf Raise',               'lift', ARRAY['calves'],                             FALSE),
('Donkey Calf Raise',               'lift', ARRAY['calves'],                             FALSE),
('Leg Press Calf Raise',            'lift', ARRAY['calves'],                             FALSE),
('Single-Leg Calf Raise',           'lift', ARRAY['calves'],                             FALSE),
('Tibialis Raise',                  'lift', ARRAY['tibialis_anterior'],                  FALSE),

-- ======================== CORE ========================
('Plank',                           'lift', ARRAY['core'],                               FALSE),
('Side Plank',                      'lift', ARRAY['core','obliques'],                    FALSE),
('Hollow Hold',                     'lift', ARRAY['core'],                               FALSE),
('Dead Bug',                        'lift', ARRAY['core'],                               FALSE),
('Hanging Leg Raise',               'lift', ARRAY['core','hip_flexors'],                 FALSE),
('Toes-to-Bar',                     'lift', ARRAY['core','hip_flexors'],                 FALSE),
('Cable Crunch',                    'lift', ARRAY['core'],                               FALSE),
('Crunch',                          'lift', ARRAY['core'],                               FALSE),
('Russian Twist',                   'lift', ARRAY['core','obliques'],                    FALSE),
('Pallof Press',                    'lift', ARRAY['core','obliques'],                    FALSE),
('Ab Wheel Rollout',                'lift', ARRAY['core'],                               FALSE),
('Dragon Flag',                     'lift', ARRAY['core'],                               FALSE),

-- ======================== FULL BODY ========================
('Burpee',                          'lift', ARRAY['full_body'],                          TRUE),
('Thruster',                        'lift', ARRAY['quads','shoulders','triceps'],        TRUE),
('Turkish Get-Up',                  'lift', ARRAY['full_body','core'],                   TRUE),
('Sled Push',                       'lift', ARRAY['quads','glutes','calves'],            TRUE),
('Sled Pull',                       'lift', ARRAY['back','biceps'],                      TRUE),
('Tire Flip',                       'lift', ARRAY['full_body'],                          TRUE),

-- ======================== OLYMPIC ========================
('Snatch',                          'lift', ARRAY['full_body'],                          TRUE),
('Power Snatch',                    'lift', ARRAY['full_body'],                          TRUE),
('Overhead Squat',                  'lift', ARRAY['quads','core'],                       TRUE),
('Clean',                           'lift', ARRAY['full_body'],                          TRUE),
('Power Clean',                     'lift', ARRAY['full_body'],                          TRUE),
('Hang Clean',                      'lift', ARRAY['full_body'],                          TRUE),
('Clean and Jerk',                  'lift', ARRAY['full_body'],                          TRUE),
('Jerk',                            'lift', ARRAY['shoulders','triceps','quads'],        TRUE),

-- ======================== PLYOMETRICS ========================
('Box Jump',                        'lift', ARRAY['quads','glutes'],                     TRUE),
('Broad Jump',                      'lift', ARRAY['quads','glutes'],                     TRUE),
('Jump Squat',                      'lift', ARRAY['quads','glutes'],                     TRUE),
('Medicine Ball Slam',              'lift', ARRAY['core','full_body'],                   TRUE),

-- ======================== CARDIO ========================
('Running (Outdoor)',               'cardio', ARRAY['full_body'],                        TRUE),
('Treadmill Run',                   'cardio', ARRAY['full_body'],                        TRUE),
('Treadmill Walk',                  'cardio', ARRAY['full_body'],                        TRUE),
('Incline Walk',                    'cardio', ARRAY['glutes','calves'],                  TRUE),
('Sprint Intervals',                'cardio', ARRAY['full_body'],                        TRUE),
('5K Run',                          'cardio', ARRAY['full_body'],                        TRUE),
('10K Run',                         'cardio', ARRAY['full_body'],                        TRUE),
('Cycling (Outdoor)',               'cardio', ARRAY['quads','hamstrings'],               TRUE),
('Stationary Bike',                 'cardio', ARRAY['quads','hamstrings'],               TRUE),
('Assault Bike',                    'cardio', ARRAY['full_body'],                        TRUE),
('Rowing (Erg)',                    'cardio', ARRAY['back','legs','core'],               TRUE),
('Swimming (Freestyle)',            'cardio', ARRAY['full_body'],                        TRUE),
('Stair Climber',                   'cardio', ARRAY['quads','glutes','calves'],          TRUE),
('Elliptical',                      'cardio', ARRAY['full_body'],                        TRUE),
('Jump Rope',                       'cardio', ARRAY['calves','full_body'],               TRUE),
('Hike',                            'cardio', ARRAY['full_body'],                        TRUE),

-- ======================== MOBILITY ========================
('Couch Stretch',                   'mobility', ARRAY['hip_flexors','quads'],            FALSE),
('90-90 Hip Stretch',               'mobility', ARRAY['glutes','hip_rotators'],          FALSE),
('Pigeon Pose',                     'mobility', ARRAY['glutes','hip_flexors'],           FALSE),
('World''s Greatest Stretch',       'mobility', ARRAY['full_body'],                      FALSE),
('Cat-Cow',                         'mobility', ARRAY['lower_back','core'],              FALSE),
('Thoracic Spine Rotation',         'mobility', ARRAY['upper_back'],                     FALSE),
('Foam Roll Quads',                 'mobility', ARRAY['quads'],                          FALSE),
('Foam Roll Back',                  'mobility', ARRAY['upper_back','lower_back'],        FALSE),
('Shoulder Dislocates',             'mobility', ARRAY['shoulders'],                      FALSE),
('Hamstring Stretch',               'mobility', ARRAY['hamstrings'],                     FALSE),
('Calf Stretch',                    'mobility', ARRAY['calves'],                         FALSE)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- EXERCISE ALIASES (TICKET-007)
-- ---------------------------------------------------------------------------
-- Inserts common colloquial names, abbreviations, and alternate spellings.
-- The /exercises/search endpoint JOIN on this table so users can type their
-- gym-floor vocabulary and land on the canonical name.

INSERT INTO exercise_aliases (exercise_id, alias)
SELECT e.id, a.alias
FROM exercises e
JOIN (VALUES
    -- Bench Press variants
    ('Barbell Bench Press',         'bench press'),
    ('Barbell Bench Press',         'flat bench'),
    ('Barbell Bench Press',         'bench'),
    ('Barbell Bench Press',         'bp'),
    ('Barbell Bench Press',         'chest press barbell'),
    ('Incline Barbell Bench Press', 'incline bench'),
    ('Incline Barbell Bench Press', 'incline press'),
    ('Dumbbell Bench Press',        'db bench'),
    ('Dumbbell Bench Press',        'dumbbell press'),
    ('Incline Dumbbell Press',      'incline db press'),

    -- Overhead Press
    ('Overhead Press',              'OHP'),
    ('Overhead Press',              'ohp'),
    ('Overhead Press',              'strict press'),
    ('Overhead Press',              'military press'),
    ('Overhead Press',              'shoulder press'),
    ('Overhead Press',              'standing press'),
    ('Push Press',                  'push press barbell'),
    ('Dumbbell Shoulder Press',     'db shoulder press'),
    ('Dumbbell Shoulder Press',     'seated db press'),

    -- Deadlift
    ('Deadlift',                    'conventional deadlift'),
    ('Deadlift',                    'dl'),
    ('Deadlift',                    'DL'),
    ('Romanian Deadlift',           'RDL'),
    ('Romanian Deadlift',           'rdl'),
    ('Romanian Deadlift',           'romanian'),
    ('Romanian Deadlift',           'romanian dl'),
    ('Stiff-Leg Deadlift',          'SLDL'),
    ('Stiff-Leg Deadlift',          'straight leg deadlift'),
    ('Trap Bar Deadlift',           'hex bar deadlift'),
    ('Trap Bar Deadlift',           'trap bar dl'),

    -- Squat
    ('Back Squat',                  'squat'),
    ('Back Squat',                  'barbell squat'),
    ('Back Squat',                  'BS'),
    ('Front Squat',                 'FS'),
    ('Front Squat',                 'front squat barbell'),
    ('Bulgarian Split Squat',       'BSS'),
    ('Bulgarian Split Squat',       'bss'),
    ('Bulgarian Split Squat',       'split squat'),
    ('Goblet Squat',                'kb squat'),

    -- Pull movements
    ('Pull-Up',                     'pullup'),
    ('Pull-Up',                     'pull up'),
    ('Chin-Up',                     'chinup'),
    ('Chin-Up',                     'chin up'),
    ('Lat Pulldown',                'pulldown'),
    ('Lat Pulldown',                'lats pulldown'),
    ('Barbell Row',                 'bent over row'),
    ('Barbell Row',                 'BOR'),
    ('Barbell Row',                 'barbell bent-over row'),
    ('Single-Arm Dumbbell Row',     'db row'),
    ('Single-Arm Dumbbell Row',     'one arm row'),
    ('Seated Cable Row',            'cable row'),
    ('Seated Cable Row',            'low cable row'),

    -- Curl / biceps
    ('Barbell Curl',                'bb curl'),
    ('Dumbbell Curl',               'db curl'),
    ('Hammer Curl',                 'neutral grip curl'),
    ('Preacher Curl',               'scott curl'),
    ('EZ-Bar Curl',                 'ez curl'),
    ('EZ-Bar Curl',                 'EZ bar curl'),

    -- Triceps
    ('Skull Crusher',               'lying tricep extension'),
    ('Skull Crusher',               'french press'),
    ('Triceps Pushdown',            'pushdown'),
    ('Overhead Triceps Extension',  'french curl'),
    ('Overhead Triceps Extension',  'tricep overhead extension'),
    ('EZ-Bar Skull Crusher',        'EZ skull crusher'),

    -- Glutes / hips
    ('Barbell Hip Thrust',          'hip thrust'),
    ('Barbell Hip Thrust',          'HT'),
    ('Glute Bridge',                'bridge'),
    ('Romanian Deadlift',           'hip hinge'),
    ('Cable Pull-Through',          'pull through'),

    -- Calf
    ('Standing Calf Raise',         'calf raise'),
    ('Standing Calf Raise',         'SCR'),
    ('Seated Calf Raise',           'seated calf'),

    -- Core
    ('Ab Wheel Rollout',            'ab roller'),
    ('Ab Wheel Rollout',            'rollout'),
    ('Hanging Leg Raise',           'HLR'),
    ('Hanging Leg Raise',           'hanging raises'),
    ('Toes-to-Bar',                 'T2B'),
    ('Toes-to-Bar',                 'toes to bar'),
    ('Pallof Press',                'palloff press'),

    -- Olympic
    ('Snatch',                      'full snatch'),
    ('Clean and Jerk',              'C&J'),
    ('Clean and Jerk',              'clean jerk'),
    ('Power Clean',                 'PC'),
    ('Power Clean',                 'power clean barbell'),
    ('Overhead Squat',              'OHS'),

    -- Cardio
    ('Running (Outdoor)',           'run'),
    ('Running (Outdoor)',           'outdoor run'),
    ('Running (Outdoor)',           'jogging'),
    ('Treadmill Run',               'treadmill'),
    ('Rowing (Erg)',                'rowing machine'),
    ('Rowing (Erg)',                'erg'),
    ('Rowing (Erg)',                'concept 2'),
    ('Assault Bike',                'airdyne'),
    ('Assault Bike',                'echo bike'),
    ('Stationary Bike',             'spin bike'),
    ('Jump Rope',                   'skipping'),
    ('Jump Rope',                   'jump rope skipping'),

    -- Face pull / rear delt
    ('Face Pull',                   'face pulls'),
    ('Face Pull',                   'rear delt cable'),
    ('Bent-Over Reverse Fly',       'reverse fly'),
    ('Bent-Over Reverse Fly',       'rear delt fly'),
    ('Reverse Pec Deck',            'rear delt pec deck'),

    -- Plyometrics
    ('Box Jump',                    'box jumps'),
    ('Medicine Ball Slam',          'med ball slam'),
    ('Medicine Ball Slam',          'slam ball'),

    -- Lateral raise
    ('Lateral Raise',               'lat raise'),
    ('Lateral Raise',               'side raise'),
    ('Cable Lateral Raise',         'cable side raise'),

    -- Misc compounds
    ('Kettlebell Swing',            'KB swing'),
    ('Kettlebell Swing',            'swing'),
    ('Farmer''s Carry',              'farmer carry'),
    ('Farmer''s Carry',              'farmer walk'),
    ('Shrug (Barbell)',              'barbell shrug'),
    ('Shrug (Barbell)',              'shrugs'),
    ('Shrug (Dumbbell)',             'dumbbell shrug'),
    ('Sled Push',                   'prowler push'),
    ('Sled Pull',                   'sled drag')
) AS a(exercise_name, alias) ON e.name = a.exercise_name
WHERE NOT EXISTS (
    SELECT 1 FROM exercise_aliases ea
    WHERE ea.exercise_id = e.id AND ea.alias = a.alias
);

-- ---------------------------------------------------------------------------
-- DEV-DATABASE OUTPUT
-- 1. Migration: migrations/20260502_seed_exercise_library.sql (this file).
-- 2. Rows inserted: ~160 exercises across all categories.
-- 3. Aliases inserted: ~100 common colloquial names for the most popular movements.
-- 4. Idempotent: INSERT ... ON CONFLICT DO NOTHING; WHERE NOT EXISTS.
-- 5. Breaking changes for backend-dev: none. New rows only.
-- 6. Notes:
--    - The ON CONFLICT clause requires a unique index on exercises.name.
--      The migration adds it if missing (DO block above).
--    - pg_trgm extension is required for the existing GIN index on exercises.name.
--      CREATE EXTENSION IF NOT EXISTS pg_trgm added at top for safety.
-- ---------------------------------------------------------------------------
