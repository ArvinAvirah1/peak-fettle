/**
 * muscleRegions.ts
 *
 * Maps canonical MuscleMap label strings (chest, back, lats, shoulders,
 * biceps, triceps, forearms, quads, hamstrings, glutes, calves, abs,
 * obliques, traps, legs) to the SVG region id(s) used by MuscleMap.tsx.
 *
 * Also exports two aggregation helpers used by ExercisePicker, the exercise
 * library detail modal, and TemplateDetailSheet.
 */

import { muscleGroupForExercise } from '../utils/smartSuggest';

// ---------------------------------------------------------------------------
// Canonical label → SVG region id(s)
// ---------------------------------------------------------------------------

/**
 * Each canonical label maps to one or more SVG <Path>/<Ellipse> id strings
 * that MuscleMap highlights. A label may map to both a front and back region.
 */
export const MUSCLE_REGION_IDS: Record<string, string[]> = {
  chest:       ['chest_l', 'chest_r'],
  back:        ['upper_back_l', 'upper_back_r', 'lower_back'],
  lats:        ['lats_l', 'lats_r'],
  shoulders:   ['shoulder_l', 'shoulder_r'],
  biceps:      ['bicep_l', 'bicep_r'],
  triceps:     ['tricep_l', 'tricep_r'],
  forearms:    ['forearm_l', 'forearm_r'],
  quads:       ['quad_l', 'quad_r'],
  hamstrings:  ['hamstring_l', 'hamstring_r'],
  glutes:      ['glute_l', 'glute_r'],
  calves:      ['calf_l', 'calf_r'],
  abs:         ['abs'],
  obliques:    ['oblique_l', 'oblique_r'],
  traps:       ['trap_l', 'trap_r'],
  // Alias: 'legs' activates all leg regions
  legs:        ['quad_l', 'quad_r', 'hamstring_l', 'hamstring_r', 'glute_l', 'glute_r', 'calf_l', 'calf_r'],
  // smartSuggest 'core' → abs + obliques
  core:        ['abs', 'oblique_l', 'oblique_r'],
  // smartSuggest 'other' → no region
  other:       [],
};

// ---------------------------------------------------------------------------
// Normalise incoming muscle group strings to canonical labels
// ---------------------------------------------------------------------------

/** Lower-case keyword → canonical MuscleMap label */
const ALIAS_MAP: Record<string, string> = {
  // chest
  chest: 'chest', pec: 'chest', pecs: 'chest', pectoral: 'chest', pectorals: 'chest',
  // back
  back: 'back', 'upper back': 'back', 'upper_back': 'back', rhomboid: 'back', rhomboids: 'back',
  erectors: 'back', 'lower back': 'back', 'lower_back': 'back',
  // lats
  lats: 'lats', lat: 'lats', latissimus: 'lats', 'latissimus dorsi': 'lats',
  // shoulders
  shoulders: 'shoulders', shoulder: 'shoulders', deltoid: 'shoulders', delts: 'shoulders',
  delt: 'shoulders', 'anterior deltoid': 'shoulders', 'lateral deltoid': 'shoulders',
  'rear delt': 'shoulders', 'rear delts': 'shoulders', 'front delt': 'shoulders',
  'side delt': 'shoulders', 'front_delts': 'shoulders', 'side_delts': 'shoulders',
  'rear_delts': 'shoulders',
  // biceps
  biceps: 'biceps', bicep: 'biceps', brachialis: 'biceps',
  // triceps
  triceps: 'triceps', tricep: 'triceps',
  // forearms
  forearms: 'forearms', forearm: 'forearms',
  // quads
  quads: 'quads', quad: 'quads', quadriceps: 'quads', quadricep: 'quads',
  // hamstrings
  hamstrings: 'hamstrings', hamstring: 'hamstrings',
  // glutes
  glutes: 'glutes', glute: 'glutes', 'gluteus maximus': 'glutes',
  // calves
  calves: 'calves', calf: 'calves', gastrocnemius: 'calves',
  // abs
  abs: 'abs', abdominals: 'abs', core: 'core', 'sit-up': 'abs',
  // obliques
  obliques: 'obliques', oblique: 'obliques',
  // traps
  traps: 'traps', trap: 'traps', trapezius: 'traps',
  // legs alias
  legs: 'legs',
};

function normaliseToCanonical(raw: string): string {
  const key = raw.toLowerCase().trim().replace(/_/g, ' ');
  return ALIAS_MAP[key] ?? raw.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Return the canonical MuscleMap label(s) for a single exercise.
 *
 * Strategy (in order):
 *  1. Normalise each entry in muscleGroups[] (Exercise.muscle_groups from the
 *     server) if provided — these are the most accurate.
 *  2. Fall back to muscleGroupForExercise(name) from smartSuggest (keyword
 *     regex on the exercise name).
 *
 * Returns a de-duplicated array of canonical labels.
 */
export function muscleGroupsForExercise(
  name: string,
  muscleGroups?: string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  function add(label: string): void {
    const canonical = normaliseToCanonical(label);
    if (canonical && canonical !== 'other' && !seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }

  if (muscleGroups && muscleGroups.length > 0) {
    for (const mg of muscleGroups) {
      add(mg);
    }
  }

  // Always also run the keyword fallback so we get at least one group
  const kw = muscleGroupForExercise(name);
  add(kw);

  return result;
}

/**
 * Return the union of highlighted muscle labels across all exercises in a
 * routine/template/session. Accepts any objects with at least a `name` field
 * and an optional `muscle_groups` array.
 *
 * Used by TemplateDetailSheet to pass the aggregated groups to <MuscleMap>.
 */
export function muscleGroupsForRoutine(
  exercises: Array<{ name: string; muscle_groups?: string[] }>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const ex of exercises) {
    const labels = muscleGroupsForExercise(ex.name, ex.muscle_groups);
    for (const label of labels) {
      if (!seen.has(label)) {
        seen.add(label);
        result.push(label);
      }
    }
  }

  return result;
}
