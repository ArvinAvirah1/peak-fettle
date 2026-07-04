/**
 * wave531ThreeDay.ts — "Wave 531 3-day" (percentage-of-training-max wave method).
 *
 * Trademark-safe generic description: a 3-week wave off a training max (~90%
 * of true 1RM) per main lift, with the classic 5/5/5 → 3/3/3 → 5/3/1 rep-scheme
 * wave, each week's final set an AMRAP top set. One main lift per day, rotating
 * across the week; a 4th lift folded into a 3-day layout by rotating across
 * the 3 sessions/week (some weeks a lift is skipped — see source_notes).
 *
 * We encode ONE representative week (week 1: 5/5/5 @ ~65/75/85% TM) as the
 * bundled "week 1 preview" per spec — this is what a "week" means for a
 * wave-style program on this shelf (adoption maps week-1 to routines; the
 * wave's later weeks are a load progression the engine's per-session
 * increments approximate, documented below).
 *
 * Weight fields are omitted (target_reps only) — this app's routine shape has
 * no numeric weight field (weights are chosen at log time), so the "% of TM"
 * detail lives in the exercise name/rep-range copy instead of a stored number,
 * consistent with every other bundled/adopted routine in this codebase.
 */

import type { Program } from './types';

const program: Program = {
  id: 'wave-531-3day',
  name: 'Wave 531 3-day',
  subtitle: 'Percentage-based wave off a training max — 3 main lifts, 3x/week',
  daysPerWeek: 3,
  level: 'intermediate',
  progressionStyle: 'wave',
  progressionLabel: 'Wave (3-week intensity wave off training max)',
  days: [
    {
      slug: 'day-1-squat',
      name: 'Day 1 — Squat wave + volume',
      exercises: [
        { exercise_id: null, name: 'Back Squat', target_sets: 3, target_reps: '5' },
        { exercise_id: null, name: 'Back Squat', target_sets: 5, target_reps: '10' },
        { exercise_id: null, name: 'Barbell Row', target_sets: 5, target_reps: '10' },
        { exercise_id: null, name: 'Plank', target_sets: 3, target_reps: '30-45s' },
      ],
    },
    {
      slug: 'day-2-bench',
      name: 'Day 2 — Bench wave + volume',
      exercises: [
        { exercise_id: null, name: 'Bench Press', target_sets: 3, target_reps: '5' },
        { exercise_id: null, name: 'Bench Press', target_sets: 5, target_reps: '10' },
        { exercise_id: null, name: 'Lat Pulldown', target_sets: 5, target_reps: '10' },
        { exercise_id: null, name: 'Cable Tricep Pushdown', target_sets: 3, target_reps: '12-15' },
      ],
    },
    {
      slug: 'day-3-deadlift-ohp',
      name: 'Day 3 — Deadlift wave + OHP volume',
      exercises: [
        { exercise_id: null, name: 'Conventional Deadlift', target_sets: 3, target_reps: '5' },
        { exercise_id: null, name: 'Overhead Press', target_sets: 5, target_reps: '10' },
        { exercise_id: null, name: 'Dumbbell Row', target_sets: 5, target_reps: '10' },
        { exercise_id: null, name: 'Dumbbell Curl', target_sets: 3, target_reps: '12-15' },
      ],
    },
  ],
  source_notes:
    'Encodes week 1 of the classic 3-week percentage wave off a training max: main-lift ' +
    'top sets at 5/5/5 (week 1), then 3/3/3 (week 2), then 5/3/1 (week 3) with the final set ' +
    'each week an AMRAP top set, plus a fixed 5x10 "boring but big" volume set of the SAME ' +
    'lift and a complementary volume movement. This bundle stores WEEK 1\'s rep scheme (5s); ' +
    'weeks 2-3 rep-scheme changes (3s, then 1/3/5) are NOT separately encoded as distinct plan ' +
    'weeks (the shelf/adoption model here maps one repeating week, per spec) — DELTA: the true ' +
    'method waves the REP SCHEME week-to-week off a fixed training max %, not a per-session ' +
    'flat-load increment. The closest deterministic rule the engine supports is per-session ' +
    'linear load increases on the logged weight; the user will not see the 5/3/1 rep-scheme ' +
    'rotation automatically — this is the documented simplification for v1. Numeric %TM ' +
    'targets are intentionally omitted (no weight field on routine exercises in this app); ' +
    'the AMRAP top-set intent lives in the rep target and the athlete\'s own RPE/RIR log.',
};

export default program;
