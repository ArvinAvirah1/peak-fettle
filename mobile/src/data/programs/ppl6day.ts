/**
 * ppl6day.ts — "PPL 6-day" (Push/Pull/Legs x2, compound-based).
 *
 * Distinct from the existing bundled beginner PPL-6 (src/data/beginnerTemplates.ts,
 * id 'ppl-6', which deliberately avoids barbell back squat/deadlift for
 * beginner safety). This shelf program is the standard compound-lift PPL for
 * intermediate lifters, with an isolation superset pair on each day (per spec:
 * "include superset/dropset fields where the program calls for them").
 */

import type { Program } from './types';

const program: Program = {
  id: 'ppl-6day',
  name: 'PPL 6-day',
  subtitle: 'Push / Pull / Legs, twice per week, compound-focused',
  daysPerWeek: 6,
  level: 'intermediate',
  progressionStyle: 'linear',
  progressionLabel: 'Linear (add load/reps each session while form holds)',
  days: [
    {
      slug: 'push-a',
      name: 'Push A',
      exercises: [
        { exercise_id: null, name: 'Bench Press', target_sets: 4, target_reps: '5-8' },
        { exercise_id: null, name: 'Overhead Press', target_sets: 3, target_reps: '6-10' },
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
          name: 'Cable Tricep Pushdown',
          target_sets: 3,
          target_reps: '12-15',
          superset_group: 'A',
          superset_rounds: 3,
        },
      ],
    },
    {
      slug: 'pull-a',
      name: 'Pull A',
      exercises: [
        { exercise_id: null, name: 'Conventional Deadlift', target_sets: 3, target_reps: '5' },
        { exercise_id: null, name: 'Pull-Up', target_sets: 4, target_reps: '6-10' },
        { exercise_id: null, name: 'Barbell Row', target_sets: 3, target_reps: '8-10' },
        {
          exercise_id: null,
          name: 'Dumbbell Curl',
          target_sets: 3,
          target_reps: '10-12',
          dropset: { last_n: 1, drops: 1, drop_pct: 20 },
        },
      ],
    },
    {
      slug: 'legs-a',
      name: 'Legs A',
      exercises: [
        { exercise_id: null, name: 'Back Squat', target_sets: 4, target_reps: '5-8' },
        { exercise_id: null, name: 'Romanian Deadlift', target_sets: 3, target_reps: '8-10' },
        { exercise_id: null, name: 'Leg Extension', target_sets: 3, target_reps: '12-15' },
        { exercise_id: null, name: 'Standing Calf Raise', target_sets: 4, target_reps: '12-15' },
      ],
    },
    {
      slug: 'push-b',
      name: 'Push B',
      exercises: [
        { exercise_id: null, name: 'Dumbbell Shoulder Press', target_sets: 4, target_reps: '8-10' },
        { exercise_id: null, name: 'Dumbbell Bench Press', target_sets: 3, target_reps: '8-12' },
        {
          exercise_id: null,
          name: 'Cable Lateral Raise',
          target_sets: 3,
          target_reps: '15',
          superset_group: 'B',
          superset_rounds: 3,
        },
        {
          exercise_id: null,
          name: 'Cable Tricep Pushdown',
          target_sets: 3,
          target_reps: '12-15',
          superset_group: 'B',
          superset_rounds: 3,
        },
      ],
    },
    {
      slug: 'pull-b',
      name: 'Pull B',
      exercises: [
        { exercise_id: null, name: 'Lat Pulldown', target_sets: 4, target_reps: '8-12' },
        { exercise_id: null, name: 'Seated Cable Row', target_sets: 3, target_reps: '10-12' },
        { exercise_id: null, name: 'Dumbbell Row', target_sets: 3, target_reps: '10-12' },
        {
          exercise_id: null,
          name: 'Barbell Curl',
          target_sets: 3,
          target_reps: '10-12',
          dropset: { last_n: 1, drops: 1, drop_pct: 20 },
        },
      ],
    },
    {
      slug: 'legs-b',
      name: 'Legs B',
      exercises: [
        { exercise_id: null, name: 'Leg Press', target_sets: 4, target_reps: '10-12' },
        { exercise_id: null, name: 'Bulgarian Split Squat', target_sets: 3, target_reps: '8-10' },
        { exercise_id: null, name: 'Leg Curl', target_sets: 3, target_reps: '12-15' },
        { exercise_id: null, name: 'Seated Calf Raise', target_sets: 4, target_reps: '12-15' },
      ],
    },
  ],
  source_notes:
    'Encodes the classic 6-day Push/Pull/Legs x2 split with compound lifts prioritized ' +
    'first each day and isolation supersets/dropsets on accessory work (superset_group "A"/"B" ' +
    'on the last two Push-day accessories; a single-drop dropset on the final arm-isolation set ' +
    'each Pull day). REAL method variants often prescribe autoregulated top sets (RPE-based) ' +
    'on the main lift and a "as many quality reps as possible" back-off set. DELTA: this bundle ' +
    'uses a fixed rep RANGE per exercise (the shape every routine in this app already supports) ' +
    'rather than an RPE-gated top set — the engine progresses these via its standard linear ' +
    'per-session load increment while reps stay in range, which is the closest deterministic ' +
    'analogue. Distinct from the existing bundled beginner PPL-6 (beginnerTemplates.ts, ' +
    '"ppl-6") which intentionally excludes barbell back squat/deadlift for beginner safety; ' +
    'this program is not a duplicate of that one.',
};

export default program;
