/**
 * useStreak — pure hook that computes the current week-streak from a list of
 * Workout objects.
 *
 * Definition: count consecutive ISO weeks (Monday–Sunday) going backward from
 * the current week where at least one workout was logged.
 *
 * Special rule: the current week is NOT penalised for having 0 workouts yet —
 * it is still "live". The streak can only be broken by a fully elapsed week
 * with 0 workouts.
 *
 * Extracted as a standalone hook so it can be unit-tested without any API
 * layer involvement.
 */

import { useMemo } from 'react';
import { Workout } from '../types/api';
import { isoWeekKey } from '../utils/dateHelpers';

/**
 * Returns the current week-streak given a list of workouts.
 * @param workouts - Any array of Workout objects (order irrelevant).
 * @returns Number of consecutive weeks with ≥1 workout ending with the most
 *          recent completed week that has a workout (or 0 if none).
 */
export function computeStreak(workouts: Workout[]): number {
  if (workouts.length === 0) return 0;

  // Build a Set of ISO week keys that have at least one workout.
  const weeksWithWorkout = new Set<string>();
  for (const w of workouts) {
    const [year, month, day] = w.day_key.split('-').map(Number);
    weeksWithWorkout.add(isoWeekKey(new Date(year, month - 1, day)));
  }

  const currentWeekKey = isoWeekKey(new Date());

  let streak = 0;
  // Walk backwards week by week starting from the current week.
  const cursor = new Date();

  // Move cursor to Monday of the current week.
  const dayOfWeek = (cursor.getDay() + 6) % 7; // 0=Mon … 6=Sun
  cursor.setDate(cursor.getDate() - dayOfWeek);

  // The current week is always counted as "live" — skip it for break-checking
  // but include it in the streak if it has a workout.
  let firstIteration = true;

  while (true) {
    const weekKey = isoWeekKey(cursor);
    const hasWorkout = weeksWithWorkout.has(weekKey);

    if (firstIteration) {
      // Current week: include in streak if it has a workout, but don't break
      // the streak if it doesn't (week is still in progress).
      if (hasWorkout) streak++;
      firstIteration = false;
    } else {
      if (!hasWorkout) break; // Gap found — streak ends
      streak++;
    }

    // Move cursor back 7 days to the previous Monday.
    cursor.setDate(cursor.getDate() - 7);

    // Safety: stop after 520 weeks (10 years) to prevent infinite loops.
    if (streak > 520) break;
  }

  return streak;
}

/**
 * React hook wrapper around computeStreak — memoises the result so it only
 * recomputes when the workouts array reference changes.
 */
export function useStreak(workouts: Workout[]): number {
  return useMemo(() => computeStreak(workouts), [workouts]);
}
