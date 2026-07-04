/**
 * minimalist2day.ts — "Minimalist 2-day" (full-body, low time-cost).
 *
 * Two full-body sessions per week, ~5 exercises each, one working-set block
 * per movement pattern — for users who can only commit to 2 gym days but
 * still want the engine's auto-progression/deload.
 */

import type { Program } from './types';

const program: Program = {
  id: 'minimalist-2day',
  name: 'Minimalist 2-day',
  subtitle: 'Two full-body sessions per week — low time cost, still auto-progresses',
  daysPerWeek: 2,
  level: 'beginner',
  progressionStyle: 'linear',
  progressionLabel: 'Linear (add load/reps each session while form holds)',
  days: [
    {
      slug: 'full-body-a',
      name: 'Full Body A',
      exercises: [
        { exercise_id: null, name: 'Back Squat', target_sets: 3, target_reps: '6-10' },
        { exercise_id: null, name: 'Bench Press', target_sets: 3, target_reps: '6-10' },
        { exercise_id: null, name: 'Barbell Row', target_sets: 3, target_reps: '8-12' },
        { exercise_id: null, name: 'Romanian Deadlift', target_sets: 2, target_reps: '10-12' },
        { exercise_id: null, name: 'Plank', target_sets: 2, target_reps: '30-45s' },
      ],
    },
    {
      slug: 'full-body-b',
      name: 'Full Body B',
      exercises: [
        { exercise_id: null, name: 'Conventional Deadlift', target_sets: 2, target_reps: '5' },
        { exercise_id: null, name: 'Overhead Press', target_sets: 3, target_reps: '6-10' },
        { exercise_id: null, name: 'Lat Pulldown', target_sets: 3, target_reps: '8-12' },
        { exercise_id: null, name: 'Walking Lunge', target_sets: 2, target_reps: '10-12' },
        { exercise_id: null, name: 'Hanging Leg Raise', target_sets: 2, target_reps: '12-15' },
      ],
    },
  ],
  source_notes:
    'Encodes a minimalist full-body A/B split covering all major movement patterns (squat, ' +
    'horizontal push/pull, hinge, vertical push/pull, core) across just 2 sessions/week, so a ' +
    'time-constrained user still gets balanced coverage. Progression is a straightforward ' +
    'linear per-session load/rep increase while form holds — no delta from a "real" named ' +
    'method here since this is an original, deliberately simple 2-day template (not a port of ' +
    'an external program), authored to fill the low-frequency slot on the shelf. Deload timing ' +
    'is left to the engine\'s existing deload cadence — no special-casing added for this program.',
};

export default program;
