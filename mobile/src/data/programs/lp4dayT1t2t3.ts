/**
 * lp4dayT1t2t3.ts — "LP 4-day T1/T2/T3" (GZCLP-style linear progression).
 *
 * Trademark-safe generic description of the tiered-linear-progression method:
 * a main compound lift each day (T1, 5×3+ AMRAP-style top set), a secondary
 * compound (T2, 3×10), and 2 accessory movements (T3, 3×15). Days rotate
 * Squat / Bench / Deadlift / Overhead Press, each as T1 on its own day with
 * one other main lift as T2.
 *
 * source_notes documents the encoded rule + the delta from the "real" method.
 */

import type { Program } from './types';

const program: Program = {
  id: 'lp-4day-t1t2t3',
  name: 'LP 4-day T1/T2/T3',
  subtitle: 'Tiered linear progression — 1 main lift + 1 secondary + accessories, 4x/week',
  daysPerWeek: 4,
  level: 'beginner',
  progressionStyle: 'linear',
  progressionLabel: 'Linear (add load every session on T1/T2)',
  days: [
    {
      slug: 'day-1-squat',
      name: 'Day 1 — Squat T1',
      exercises: [
        { exercise_id: null, name: 'Back Squat', target_sets: 5, target_reps: '3' },
        { exercise_id: null, name: 'Bench Press', target_sets: 3, target_reps: '10' },
        { exercise_id: null, name: 'Lat Pulldown', target_sets: 3, target_reps: '15' },
        { exercise_id: null, name: 'Plank', target_sets: 3, target_reps: '30-45s' },
      ],
    },
    {
      slug: 'day-2-ohp',
      name: 'Day 2 — Overhead Press T1',
      exercises: [
        { exercise_id: null, name: 'Overhead Press', target_sets: 5, target_reps: '3' },
        { exercise_id: null, name: 'Conventional Deadlift', target_sets: 3, target_reps: '10' },
        { exercise_id: null, name: 'Dumbbell Row', target_sets: 3, target_reps: '15' },
        { exercise_id: null, name: 'Dumbbell Curl', target_sets: 3, target_reps: '15' },
      ],
    },
    {
      slug: 'day-3-bench',
      name: 'Day 3 — Bench T1',
      exercises: [
        { exercise_id: null, name: 'Bench Press', target_sets: 5, target_reps: '3' },
        { exercise_id: null, name: 'Back Squat', target_sets: 3, target_reps: '10' },
        { exercise_id: null, name: 'Barbell Row', target_sets: 3, target_reps: '15' },
        { exercise_id: null, name: 'Cable Tricep Pushdown', target_sets: 3, target_reps: '15' },
      ],
    },
    {
      slug: 'day-4-deadlift',
      name: 'Day 4 — Deadlift T1',
      exercises: [
        { exercise_id: null, name: 'Conventional Deadlift', target_sets: 5, target_reps: '3' },
        { exercise_id: null, name: 'Overhead Press', target_sets: 3, target_reps: '10' },
        { exercise_id: null, name: 'Lateral Raise', target_sets: 3, target_reps: '15' },
        { exercise_id: null, name: 'Hanging Leg Raise', target_sets: 3, target_reps: '15' },
      ],
    },
  ],
  source_notes:
    'Encodes the tiered-linear-progression method (T1 main lift 5x3, T2 secondary 3x10, ' +
    'T3 accessories 3x15). REAL method: T1 top set is "5+"/AMRAP and drives a stall-based ' +
    'swap from 5s→3s→1s rep schemes across mesocycles, and T3 accessories progress by ' +
    'ADDING REPS (not load) until a rep ceiling, then adding load. DELTA (documented, not ' +
    'special-cased): this app\'s engine progresses adopted routines by fixed load increments ' +
    'per session (linear model) rather than AMRAP-triggered rep-scheme swaps or rep-ceiling-' +
    'triggered accessory jumps — the closest deterministic rule the engine already supports. ' +
    'Users who stall on T1 should manually drop to a lighter set of 5s via the routine editor; ' +
    'this is a known, intentional simplification, not an engine bug.',
};

export default program;
