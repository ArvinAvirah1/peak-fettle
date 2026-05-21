-- Migration: 20260517_template_library.sql
-- PL-1: Template Library — curated workout programs

CREATE TABLE IF NOT EXISTS workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  discipline TEXT NOT NULL CHECK (discipline IN ('powerlifting','weightlifting','general_strength','running','cycling','swimming','other_mixed')),
  experience_level TEXT NOT NULL CHECK (experience_level IN ('beginner','intermediate','advanced')),
  days_per_week INTEGER NOT NULL,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  session_name TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES template_sessions(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps TEXT NOT NULL,
  rest_seconds INTEGER,
  form_cue TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- RLS: templates are public read, no user write
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_templates" ON workout_templates FOR SELECT USING (true);
CREATE POLICY "public_read_sessions" ON template_sessions FOR SELECT USING (true);
CREATE POLICY "public_read_exercises" ON template_exercises FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- Seed data: 6 templates with hardcoded UUIDs
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  -- Template UUIDs
  t1 UUID := 'a1000000-0000-0000-0000-000000000001'; -- Beginner Full Body 3-Day
  t2 UUID := 'a2000000-0000-0000-0000-000000000002'; -- PPL 3-Day
  t3 UUID := 'a3000000-0000-0000-0000-000000000003'; -- PPL 6-Day
  t4 UUID := 'a4000000-0000-0000-0000-000000000004'; -- Upper/Lower 4-Day
  t5 UUID := 'a5000000-0000-0000-0000-000000000005'; -- Powerlifting Beginner
  t6 UUID := 'a6000000-0000-0000-0000-000000000006'; -- Running Beginner

  -- Session UUIDs — t1
  s1_1 UUID := 'b1010000-0000-0000-0000-000000000001'; -- T1 Day 1
  s1_2 UUID := 'b1020000-0000-0000-0000-000000000002'; -- T1 Day 2
  s1_3 UUID := 'b1030000-0000-0000-0000-000000000003'; -- T1 Day 3

  -- Session UUIDs — t2
  s2_1 UUID := 'b2010000-0000-0000-0000-000000000001'; -- T2 Push
  s2_2 UUID := 'b2020000-0000-0000-0000-000000000002'; -- T2 Pull
  s2_3 UUID := 'b2030000-0000-0000-0000-000000000003'; -- T2 Legs

  -- Session UUIDs — t3
  s3_1 UUID := 'b3010000-0000-0000-0000-000000000001'; -- T3 Push A
  s3_2 UUID := 'b3020000-0000-0000-0000-000000000002'; -- T3 Pull A
  s3_3 UUID := 'b3030000-0000-0000-0000-000000000003'; -- T3 Legs A
  s3_4 UUID := 'b3040000-0000-0000-0000-000000000004'; -- T3 Push B
  s3_5 UUID := 'b3050000-0000-0000-0000-000000000005'; -- T3 Pull B
  s3_6 UUID := 'b3060000-0000-0000-0000-000000000006'; -- T3 Legs B

  -- Session UUIDs — t4
  s4_1 UUID := 'b4010000-0000-0000-0000-000000000001'; -- T4 Upper A
  s4_2 UUID := 'b4020000-0000-0000-0000-000000000002'; -- T4 Lower A
  s4_3 UUID := 'b4030000-0000-0000-0000-000000000003'; -- T4 Upper B
  s4_4 UUID := 'b4040000-0000-0000-0000-000000000004'; -- T4 Lower B

  -- Session UUIDs — t5
  s5_1 UUID := 'b5010000-0000-0000-0000-000000000001'; -- T5 Workout A
  s5_2 UUID := 'b5020000-0000-0000-0000-000000000002'; -- T5 Workout B

  -- Session UUIDs — t6
  s6_1 UUID := 'b6010000-0000-0000-0000-000000000001'; -- T6 Day 1
  s6_2 UUID := 'b6020000-0000-0000-0000-000000000002'; -- T6 Day 2
  s6_3 UUID := 'b6030000-0000-0000-0000-000000000003'; -- T6 Day 3

BEGIN

-- -----------------------------------------------------------------------
-- TEMPLATES
-- -----------------------------------------------------------------------
INSERT INTO workout_templates (id, name, description, discipline, experience_level, days_per_week, is_featured)
VALUES
  (t1, 'Beginner Full Body 3-Day',
   'Classic three-day full-body program hitting squat, press, and pull every session. Ideal for building the movement patterns and strength base.',
   'general_strength', 'beginner', 3, TRUE),

  (t2, 'Push/Pull/Legs 3-Day',
   'One push session, one pull session, one leg session per week. Each session is focused and efficient — great for intermediate lifters on a tighter schedule.',
   'general_strength', 'intermediate', 3, FALSE),

  (t3, 'Push/Pull/Legs 6-Day',
   'Full PPL split run twice per week. Higher volume than the 3-day variant; suited for intermediate lifters who can recover from 6 sessions.',
   'general_strength', 'intermediate', 6, TRUE),

  (t4, 'Upper/Lower 4-Day',
   'Four-day upper/lower split with two upper and two lower sessions per week, varying rep ranges for strength and hypertrophy stimulus.',
   'general_strength', 'intermediate', 4, FALSE),

  (t5, 'Powerlifting Beginner (SL5×5-style)',
   'Two alternating workouts (A and B) run three times per week. Linear progression on squat, bench, overhead press, barbell row, and deadlift.',
   'powerlifting', 'beginner', 3, TRUE),

  (t6, 'Running Beginner Plan',
   'Three-day run/walk plan for new runners. Builds aerobic base with easy runs and walk/run intervals before progressing to a longer easy run.',
   'running', 'beginner', 3, FALSE)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------
-- SESSIONS
-- -----------------------------------------------------------------------
INSERT INTO template_sessions (id, template_id, day_number, session_name, notes) VALUES
  -- T1
  (s1_1, t1, 1, 'Full Body A', 'Mon — squat, bench, deadlift, lat pulldown'),
  (s1_2, t1, 2, 'Full Body B', 'Wed — squat, overhead press, barbell row, curl'),
  (s1_3, t1, 3, 'Full Body A (repeat)', 'Fri — repeat Day 1 workout'),

  -- T2
  (s2_1, t2, 1, 'Push', 'Chest, shoulders, triceps'),
  (s2_2, t2, 2, 'Pull', 'Back, biceps, rear delts'),
  (s2_3, t2, 3, 'Legs', 'Quads, hamstrings, calves'),

  -- T3
  (s3_1, t3, 1, 'Push A', 'Heavy push — bench focus'),
  (s3_2, t3, 2, 'Pull A', 'Heavy pull — deadlift focus'),
  (s3_3, t3, 3, 'Legs A', 'Heavy legs — squat focus'),
  (s3_4, t3, 4, 'Push B', 'Volume push — slightly higher reps'),
  (s3_5, t3, 5, 'Pull B', 'Volume pull — slightly higher reps'),
  (s3_6, t3, 6, 'Legs B', 'Volume legs — slightly higher reps'),

  -- T4
  (s4_1, t4, 1, 'Upper A', 'Strength-focused upper — heavy bench and row'),
  (s4_2, t4, 2, 'Lower A', 'Strength-focused lower — heavy squat'),
  (s4_3, t4, 3, 'Upper B', 'Hypertrophy-focused upper — incline and cables'),
  (s4_4, t4, 4, 'Lower B', 'Hypertrophy-focused lower — deadlift + accessories'),

  -- T5
  (s5_1, t5, 1, 'Workout A', 'Squat, Bench, Barbell Row — alternate with Workout B each session'),
  (s5_2, t5, 2, 'Workout B', 'Squat, Overhead Press, Deadlift — alternate with Workout A each session'),

  -- T6
  (s6_1, t6, 1, 'Easy Run', 'Conversational effort, build aerobic base'),
  (s6_2, t6, 2, 'Walk/Run Intervals', 'Structured intervals — build run tolerance'),
  (s6_3, t6, 3, 'Long Run', 'Longest run of the week at easy effort')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------
-- EXERCISES
-- -----------------------------------------------------------------------
INSERT INTO template_exercises (session_id, exercise_name, sets, reps, rest_seconds, form_cue, order_index) VALUES

  -- T1 Day 1 (Full Body A)
  (s1_1, 'Barbell Back Squat', 3, '5', 180, 'Brace core, sit to depth, drive knees out', 0),
  (s1_1, 'Barbell Bench Press', 3, '5', 180, 'Retract shoulder blades, touch chest, press in a slight arc', 1),
  (s1_1, 'Barbell Deadlift', 1, '5', 240, 'Hinge at hips, bar over mid-foot, neutral spine throughout', 2),
  (s1_1, 'Lat Pulldown', 3, '8', 90, 'Pull elbows to pockets, keep chest tall', 3),

  -- T1 Day 2 (Full Body B)
  (s1_2, 'Barbell Back Squat', 3, '5', 180, 'Brace core, sit to depth, drive knees out', 0),
  (s1_2, 'Overhead Press', 3, '5', 180, 'Stack bar over heels, lock out overhead, squeeze glutes', 1),
  (s1_2, 'Barbell Row', 3, '5', 120, 'Hinge to ~45°, pull bar to lower chest, controlled lower', 2),
  (s1_2, 'Dumbbell Curl', 3, '10', 60, 'Supinate at the top, avoid swinging', 3),

  -- T1 Day 3 (Full Body A repeat)
  (s1_3, 'Barbell Back Squat', 3, '5', 180, 'Brace core, sit to depth, drive knees out', 0),
  (s1_3, 'Barbell Bench Press', 3, '5', 180, 'Retract shoulder blades, touch chest, press in a slight arc', 1),
  (s1_3, 'Barbell Deadlift', 1, '5', 240, 'Hinge at hips, bar over mid-foot, neutral spine throughout', 2),
  (s1_3, 'Lat Pulldown', 3, '8', 90, 'Pull elbows to pockets, keep chest tall', 3),

  -- T2 Push
  (s2_1, 'Barbell Bench Press', 4, '6', 180, 'Control the descent, explode up', 0),
  (s2_1, 'Overhead Press', 3, '8', 120, 'Full lockout, tight core, no back arch', 1),
  (s2_1, 'Tricep Pushdown', 3, '12', 60, 'Elbows pinned at sides, full extension', 2),
  (s2_1, 'Lateral Raise', 3, '15', 45, 'Lead with elbows, stop at shoulder height', 3),

  -- T2 Pull
  (s2_2, 'Barbell Deadlift', 3, '5', 240, 'Bar over mid-foot, lat engagement before pull', 0),
  (s2_2, 'Barbell Row', 4, '6', 120, 'Pull bar into lower chest, squeeze at top', 1),
  (s2_2, 'Pull-up', 3, 'AMRAP', 90, 'Full hang to chin over bar, controlled negative', 2),
  (s2_2, 'Face Pull', 3, '15', 45, 'Pull to forehead, external rotate at end range', 3),

  -- T2 Legs
  (s2_3, 'Barbell Back Squat', 4, '6', 180, 'Knees track toes, full depth if mobility allows', 0),
  (s2_3, 'Romanian Deadlift', 3, '10', 90, 'Soft knee, push hips back, feel hamstring stretch', 1),
  (s2_3, 'Leg Press', 3, '12', 90, 'Full range, feet hip-width, do not lock out aggressively', 2),
  (s2_3, 'Calf Raise', 3, '15', 45, 'Full stretch at bottom, hold squeeze at top', 3),

  -- T3 Push A (heavy)
  (s3_1, 'Barbell Bench Press', 4, '6', 180, 'Retract shoulder blades, controlled descent', 0),
  (s3_1, 'Overhead Press', 3, '8', 120, 'Full lockout, bar path slightly back at top', 1),
  (s3_1, 'Tricep Pushdown', 3, '12', 60, 'Elbows pinned, squeeze at bottom', 2),
  (s3_1, 'Lateral Raise', 3, '15', 45, 'Lead with elbows, stop at shoulder height', 3),

  -- T3 Pull A (heavy)
  (s3_2, 'Barbell Deadlift', 3, '5', 240, 'Bar over mid-foot, neutral spine', 0),
  (s3_2, 'Barbell Row', 4, '6', 120, 'Hinge, pull to lower chest', 1),
  (s3_2, 'Pull-up', 3, 'AMRAP', 90, 'Full range, control the negative', 2),
  (s3_2, 'Face Pull', 3, '15', 45, 'External rotate, pull to forehead', 3),

  -- T3 Legs A (heavy)
  (s3_3, 'Barbell Back Squat', 4, '6', 180, 'Depth, knees out, braced', 0),
  (s3_3, 'Romanian Deadlift', 3, '10', 90, 'Hinge, feel stretch, no rounding', 1),
  (s3_3, 'Leg Press', 3, '12', 90, 'Full ROM, feet hip-width', 2),
  (s3_3, 'Calf Raise', 3, '15', 45, 'Full stretch and squeeze', 3),

  -- T3 Push B (volume)
  (s3_4, 'Incline Dumbbell Press', 4, '10', 90, 'Slight incline, touch chest, press up and in', 0),
  (s3_4, 'Dumbbell Shoulder Press', 3, '12', 75, 'Full range, core tight, no flare', 1),
  (s3_4, 'Cable Tricep Extension', 3, '15', 45, 'Elbows fixed, full extension', 2),
  (s3_4, 'Lateral Raise', 3, '20', 30, 'Light weight, feel the burn at shoulder height', 3),

  -- T3 Pull B (volume)
  (s3_5, 'Lat Pulldown', 4, '10', 90, 'Pull elbows to pockets, arch slightly', 0),
  (s3_5, 'Cable Row', 4, '12', 75, 'Neutral spine, pull to navel, squeeze', 1),
  (s3_5, 'Dumbbell Curl', 3, '15', 45, 'Supinate, no swing', 2),
  (s3_5, 'Face Pull', 3, '20', 30, 'High anchor, external rotate', 3),

  -- T3 Legs B (volume)
  (s3_6, 'Hack Squat', 4, '10', 90, 'Feet shoulder-width, full depth', 0),
  (s3_6, 'Walking Lunge', 3, '12', 75, 'Long stride, upright torso', 1),
  (s3_6, 'Leg Curl', 3, '15', 60, 'Controlled, squeeze at top', 2),
  (s3_6, 'Calf Raise', 4, '20', 30, 'Full stretch, big squeeze', 3),

  -- T4 Upper A (strength)
  (s4_1, 'Barbell Bench Press', 4, '5', 180, 'Heavy, retract scapula, controlled descent', 0),
  (s4_1, 'Barbell Row', 4, '5', 180, 'Hinge, pull to lower chest, stay tight', 1),
  (s4_1, 'Overhead Press', 3, '8', 120, 'Full lockout, bar over heels', 2),
  (s4_1, 'Chin-up', 3, 'AMRAP', 90, 'Supinated grip, chin over bar, full hang', 3),

  -- T4 Lower A (strength)
  (s4_2, 'Barbell Back Squat', 4, '5', 180, 'Depth, brace, drive through floor', 0),
  (s4_2, 'Romanian Deadlift', 3, '8', 120, 'Hip hinge, hamstring stretch, neutral back', 1),
  (s4_2, 'Leg Press', 3, '10', 90, 'Full ROM, feet hip-width', 2),
  (s4_2, 'Leg Curl', 3, '12', 60, 'Controlled, full range', 3),

  -- T4 Upper B (hypertrophy)
  (s4_3, 'Incline Dumbbell Press', 4, '8', 90, 'Touch chest, press up and in, control descent', 0),
  (s4_3, 'Cable Row', 4, '10', 75, 'Neutral spine, squeeze at end', 1),
  (s4_3, 'Dumbbell Shoulder Press', 3, '12', 75, 'Full range, no flare', 2),
  (s4_3, 'Lat Pulldown', 3, '12', 75, 'Wide grip, pull to upper chest', 3),

  -- T4 Lower B (hypertrophy)
  (s4_4, 'Barbell Deadlift', 4, '4', 240, 'Bar over mid-foot, lats engaged before pull', 0),
  (s4_4, 'Front Squat', 3, '6', 180, 'Upright torso, elbows up, full depth', 1),
  (s4_4, 'Leg Extension', 3, '15', 60, 'Full extension, controlled return', 2),
  (s4_4, 'Calf Raise', 4, '15', 45, 'Full stretch, pause at bottom', 3),

  -- T5 Workout A
  (s5_1, 'Barbell Back Squat', 5, '5', 180, 'Add 2.5 kg each session while form holds', 0),
  (s5_1, 'Barbell Bench Press', 5, '5', 180, 'Controlled descent, drive up, retract scapula', 1),
  (s5_1, 'Barbell Row', 5, '5', 120, 'Strict form — pull to lower chest, no jerking', 2),

  -- T5 Workout B
  (s5_2, 'Barbell Back Squat', 5, '5', 180, 'Same weight as last squat session, add 2.5 kg each time', 0),
  (s5_2, 'Overhead Press', 5, '5', 180, 'Full lockout, squeeze glutes, no back arch', 1),
  (s5_2, 'Barbell Deadlift', 1, '5', 300, 'Add 5 kg each session — the fastest lift to progress', 2),

  -- T6 Day 1 (Easy Run)
  (s6_1, 'Easy Run', 1, '20 min', NULL, 'Land midfoot, keep cadence ~170 spm, conversational pace', 0),

  -- T6 Day 2 (Intervals)
  (s6_2, 'Walk/Run Intervals', 8, '1 min run / 2 min walk', NULL, 'Run at a comfortable effort — you should be able to speak short sentences', 0),

  -- T6 Day 3 (Long Run)
  (s6_3, 'Easy Run', 1, '30 min', NULL, 'Easy effort throughout — slower than you think, nasal breathing helps', 0);

END $$;
