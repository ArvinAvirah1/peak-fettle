/**
 * highFreq5day.ts — "High-Frequency 5-day" (nSuns-style AMRAP-percentage program).
 *
 * Trademark-safe generic description: a 5-day, high-frequency percentage-of-
 * training-max program where each of the 4 main lifts is trained 2x/week
 * (one heavy AMRAP-topped day, one lighter volume day) via a descending-
 * percentage straight-set ladder, plus an accessory block each day.
 *
 * The hallmark 9-set descending-percentage ladder (e.g. 5/5/3/3/3/5+/3/3/3 at
 * stepped %TM) doesn't have a first-class representation in this app's
 * routine shape (no per-set percentage field) — see source_notes for exactly
 * how it's approximated with 5 flat working sets at a widening rep target.
 */

import type { Program } from './types';

const program: Program = {
  id: 'high-freq-5day',
  name: 'High-Frequency 5-day',
  subtitle: 'Each main lift trained 2x/week — descending-set ladder + accessories',
  daysPerWeek: 5,
  level: 'advanced',
  progressionStyle: 'linear',
  progressionLabel: 'Linear (weekly training-max bump off AMRAP top set)',
  days: [
    {
      slug: 'day-1-bench-heavy',
      name: 'Day 1 — Bench (heavy) + Squat (volume)',
      exercises: [
        { exercise_id: null, name: 'Bench Press', target_sets: 5, target_reps: '3-5' },
        { exercise_id: null, name: 'Back Squat', target_sets: 4, target_reps: '5-8' },
        { exercise_id: null, name: 'Barbell Row', target_sets: 3, target_reps: '8-10' },
        { exercise_id: null, name: 'Cable Tricep Pushdown', target_sets: 3, target_reps: '12-15' },
      ],
    },
    {
      slug: 'day-2-squat-heavy',
      name: 'Day 2 — Squat (heavy) + OHP (volume)',
      exercises: [
        { exercise_id: null, name: 'Back Squat', target_sets: 5, target_reps: '3-5' },
        { exercise_id: null, name: 'Overhead Press', target_sets: 4, target_reps: '5-8' },
        { exercise_id: null, name: 'Pull-Up', target_sets: 3, target_reps: '8-10' },
        { exercise_id: null, name: 'Dumbbell Curl', target_sets: 3, target_reps: '12-15' },
      ],
    },
    {
      slug: 'day-3-ohp-heavy',
      name: 'Day 3 — OHP (heavy) + Deadlift (volume)',
      exercises: [
        { exercise_id: null, name: 'Overhead Press', target_sets: 5, target_reps: '3-5' },
        { exercise_id: null, name: 'Conventional Deadlift', target_sets: 3, target_reps: '5-6' },
        { exercise_id: null, name: 'Dumbbell Row', target_sets: 3, target_reps: '8-10' },
        { exercise_id: null, name: 'Lateral Raise', target_sets: 3, target_reps: '12-15' },
      ],
    },
    {
      slug: 'day-4-deadlift-heavy',
      name: 'Day 4 — Deadlift (heavy) + Bench (volume)',
      exercises: [
        { exercise_id: null, name: 'Conventional Deadlift', target_sets: 5, target_reps: '3-5' },
        { exercise_id: null, name: 'Bench Press', target_sets: 4, target_reps: '5-8' },
        { exercise_id: null, name: 'Seated Cable Row', target_sets: 3, target_reps: '8-10' },
        { exercise_id: null, name: 'Cable Tricep Pushdown', target_sets: 3, target_reps: '12-15' },
      ],
    },
    {
      slug: 'day-5-accessory',
      name: 'Day 5 — Full-body accessory',
      exercises: [
        { exercise_id: null, name: 'Leg Press', target_sets: 3, target_reps: '10-12' },
        { exercise_id: null, name: 'Lat Pulldown', target_sets: 3, target_reps: '10-12' },
        { exercise_id: null, name: 'Dumbbell Bench Press', target_sets: 3, target_reps: '10-12' },
        { exercise_id: null, name: 'Standing Calf Raise', target_sets: 3, target_reps: '12-15' },
        { exercise_id: null, name: 'Hanging Leg Raise', target_sets: 3, target_reps: '12-15' },
      ],
    },
  ],
  source_notes:
    'Encodes the high-frequency structure of the method (each of the 4 main lifts hit twice ' +
    'a week — once as a heavy AMRAP-topped day, once as a lighter volume day — plus a 5th ' +
    'full-body accessory day). REAL method: each main-lift session is a 9-set DESCENDING-' +
    'PERCENTAGE ladder off a training max (e.g. roughly 5/5/3/3/3/5+/3/3/3 at stepped %TM, ' +
    'with the 6th set an AMRAP and the training max increasing weekly off that AMRAP rep ' +
    'count via a lookup table). DELTA (this app has no per-set percentage or per-set-count-' +
    'to-TM-delta lookup, and no AMRAP-count-driven load formula): the ladder is approximated ' +
    'as 5 flat working sets at a rep-range target per lift (5x3-5 heavy day, 3-4x5-8 volume ' +
    'day) with linear per-session progression — the closest deterministic rule the engine ' +
    'already executes. This is a materially simpler progression curve than the source method; ' +
    'flagged here rather than adding a percentage-ladder concept to engine v2 in this ticket.',
};

export default program;
