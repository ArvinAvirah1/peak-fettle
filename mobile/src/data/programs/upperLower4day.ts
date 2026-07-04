/**
 * upperLower4day.ts — "Upper/Lower 4-day" (compound-based, heavy/light split).
 *
 * Distinct from the existing bundled beginner Upper/Lower-4 (src/data/
 * beginnerTemplates.ts, id 'upper-lower-4', which deliberately avoids barbell
 * back squat/deadlift for beginner safety). This shelf program is the
 * standard heavy/light Upper/Lower split for intermediate lifters using free
 * barbell compounds, with an accessory superset on each day.
 */

import type { Program } from './types';

const program: Program = {
  id: 'upper-lower-4day',
  name: 'Upper/Lower 4-day',
  subtitle: 'Heavy + light upper, heavy + light lower — compound-focused',
  daysPerWeek: 4,
  level: 'intermediate',
  progressionStyle: 'dup',
  progressionLabel: 'DUP (heavy day + light/volume day per region)',
  days: [
    {
      slug: 'upper-heavy',
      name: 'Upper — Heavy',
      exercises: [
        { exercise_id: null, name: 'Bench Press', target_sets: 4, target_reps: '4-6' },
        { exercise_id: null, name: 'Barbell Row', target_sets: 4, target_reps: '5-8' },
        { exercise_id: null, name: 'Overhead Press', target_sets: 3, target_reps: '6-8' },
        {
          exercise_id: null,
          name: 'Lateral Raise',
          target_sets: 3,
          target_reps: '12-15',
          superset_group: 'A',
          superset_rounds: 3,
        },
        {
          exercise_id: null,
          name: 'Dumbbell Curl',
          target_sets: 3,
          target_reps: '12-15',
          superset_group: 'A',
          superset_rounds: 3,
        },
      ],
    },
    {
      slug: 'lower-heavy',
      name: 'Lower — Heavy',
      exercises: [
        { exercise_id: null, name: 'Back Squat', target_sets: 4, target_reps: '4-6' },
        { exercise_id: null, name: 'Conventional Deadlift', target_sets: 3, target_reps: '4-6' },
        { exercise_id: null, name: 'Leg Extension', target_sets: 3, target_reps: '10-12' },
        { exercise_id: null, name: 'Standing Calf Raise', target_sets: 4, target_reps: '10-12' },
      ],
    },
    {
      slug: 'upper-light',
      name: 'Upper — Light/Volume',
      exercises: [
        { exercise_id: null, name: 'Dumbbell Bench Press', target_sets: 4, target_reps: '10-15' },
        { exercise_id: null, name: 'Lat Pulldown', target_sets: 4, target_reps: '10-15' },
        { exercise_id: null, name: 'Dumbbell Shoulder Press', target_sets: 3, target_reps: '10-15' },
        {
          exercise_id: null,
          name: 'Cable Lateral Raise',
          target_sets: 3,
          target_reps: '15-20',
          superset_group: 'B',
          superset_rounds: 3,
        },
        {
          exercise_id: null,
          name: 'Cable Tricep Pushdown',
          target_sets: 3,
          target_reps: '15-20',
          superset_group: 'B',
          superset_rounds: 3,
        },
      ],
    },
    {
      slug: 'lower-light',
      name: 'Lower — Light/Volume',
      exercises: [
        { exercise_id: null, name: 'Leg Press', target_sets: 4, target_reps: '12-15' },
        { exercise_id: null, name: 'Romanian Deadlift', target_sets: 3, target_reps: '10-12' },
        { exercise_id: null, name: 'Leg Curl', target_sets: 3, target_reps: '12-15' },
        { exercise_id: null, name: 'Seated Calf Raise', target_sets: 4, target_reps: '12-15' },
      ],
    },
  ],
  source_notes:
    'Encodes the standard heavy/light Upper/Lower-4 split: a heavy compound-focused day and a ' +
    'lighter volume day for each of upper and lower body, with isolation supersets on the ' +
    'accessory work (superset_group "A" on Upper-Heavy\'s last two exercises, "B" on Upper-' +
    'Light\'s). REAL DUP method variants typically prescribe the heavy day by %1RM (e.g. 80-90%) ' +
    'and the light day by RPE-capped volume. DELTA: this bundle uses fixed rep RANGES per ' +
    'exercise (this app\'s existing routine shape) rather than %1RM or RPE targets — the engine ' +
    'progresses these with its standard linear per-session load increment while reps stay in ' +
    'range, the closest deterministic analogue already supported. Distinct from the existing ' +
    'bundled beginner Upper/Lower-4 (beginnerTemplates.ts, "upper-lower-4") which intentionally ' +
    'excludes barbell back squat/deadlift for beginner safety; this program is not a duplicate.',
};

export default program;
