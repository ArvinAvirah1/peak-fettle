/**
 * liftNames.ts — converts a snake_case lift_id to a human-readable lift name.
 *
 * "back_squat"   → "Back Squat"
 * "bench_press"  → "Bench Press"
 *
 * Falls back to title-casing the ID if the lift is not in the known map.
 * This handles custom lifts and any future additions without requiring a code
 * change.
 */

const LIFT_NAME_MAP: Record<string, string> = {
  // Big barbell compounds
  back_squat: 'Back Squat',
  front_squat: 'Front Squat',
  bench_press: 'Bench Press',
  incline_bench_press: 'Incline Bench Press',
  deadlift: 'Deadlift',
  sumo_deadlift: 'Sumo Deadlift',
  overhead_press: 'Overhead Press',
  barbell_row: 'Barbell Row',
  // Common accessory barbell lifts
  romanian_deadlift: 'Romanian Deadlift',
  deficit_deadlift: 'Deficit Deadlift',
  pause_squat: 'Pause Squat',
  close_grip_bench: 'Close-Grip Bench Press',
  // Common dumbbell / cable lifts that show up in rankings
  dumbbell_press: 'Dumbbell Press',
  dumbbell_row: 'Dumbbell Row',
  lat_pulldown: 'Lat Pulldown',
  cable_row: 'Cable Row',
  leg_press: 'Leg Press',
  hip_thrust: 'Hip Thrust',
};

/**
 * Returns a human-readable name for the given lift_id.
 * Checks the static map first; falls back to title-casing the raw ID.
 */
export function liftIdToName(liftId: string | null | undefined): string {
  if (!liftId) return 'Unknown lift';
  if (LIFT_NAME_MAP[liftId]) {
    return LIFT_NAME_MAP[liftId];
  }
  // Fallback: replace underscores with spaces, title-case each word.
  return liftId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
