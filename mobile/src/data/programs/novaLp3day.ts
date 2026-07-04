/**
 * novaLp3day.ts — "Novice LP 3-day" (Starting-Strength-style barbell linear progression).
 *
 * Trademark-safe generic description: the classic novice barbell linear-
 * progression method — 3x/week, alternating A/B full-body sessions of 3x5 on
 * a small set of compound barbell lifts, adding load every session.
 */

import type { Program } from './types';

const program: Program = {
  id: 'novice-lp-3day',
  name: 'Novice LP 3-day',
  subtitle: 'Classic barbell linear progression — alternating A/B full-body, 3x/week',
  daysPerWeek: 3,
  level: 'beginner',
  progressionStyle: 'linear',
  progressionLabel: 'Linear (add load every session)',
  days: [
    {
      slug: 'workout-a',
      name: 'Workout A',
      exercises: [
        { exercise_id: null, name: 'Back Squat', target_sets: 3, target_reps: '5' },
        { exercise_id: null, name: 'Bench Press', target_sets: 3, target_reps: '5' },
        { exercise_id: null, name: 'Conventional Deadlift', target_sets: 1, target_reps: '5' },
      ],
    },
    {
      slug: 'workout-b',
      name: 'Workout B',
      exercises: [
        { exercise_id: null, name: 'Back Squat', target_sets: 3, target_reps: '5' },
        { exercise_id: null, name: 'Overhead Press', target_sets: 3, target_reps: '5' },
        { exercise_id: null, name: 'Conventional Deadlift', target_sets: 1, target_reps: '5' },
      ],
    },
  ],
  source_notes:
    'Encodes the novice barbell linear-progression method exactly as commonly taught: ' +
    'squat every session (3x5), alternating bench press / overhead press (3x5), and a once-' +
    'per-week deadlift top single set of 5, adding a small fixed load increment every session ' +
    'while all reps are hit with good form. `days` holds the two DISTINCT sessions (A, B) — ' +
    'true 3x/week frequency is A/B/A one week then B/A/B the next. Since this shelf/adoption ' +
    'model maps a repeating set of routines (not a literal 7-day calendar) to the schedule, we ' +
    'bundle A and B as two separate saved routines and let `planAdoption`\'s cycle-mode schedule ' +
    'alternate them session-to-session (A, B, A, B, …) — the existing cycle schedule already ' +
    'does exactly this; no third "repeat" routine is created (that would have produced two ' +
    'identically-named "Workout A" routines, which is why this bundle intentionally lists only ' +
    'the 2 unique days rather than 3). Reactive deloads (drop 10% after three-straight stalled ' +
    'sessions) are NOT automated — this is a documented simplification; the user is expected to ' +
    'drop weight manually via the routine editor if a lift stalls.',
};

export default program;
