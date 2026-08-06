/**
 * exerciseQualifierMap.ts — GENERATED FILE, DO NOT EDIT BY HAND.
 *
 *   Regenerate:  node scripts/gen-qualifier-map.js
 *   Source:      docs/archive/qualifiers/corrected.json
 *
 * Which qualifier axes apply to which exercise, with each axis's applicable
 * values and this exercise's default. Produced by researching all 241 library
 * exercises and corrected after three adversarial reviews (a fabricated
 * coefficient and a misattributed study were removed — see the spec).
 *
 * Keyed by NORMALIZED EXERCISE NAME, not id: local sets store server-assigned
 * UUIDs that differ per environment, and the research is name-based. This is the
 * same convention muscleGroupsForExercise / classifyCompetitionLift already use.
 *
 * DEFAULTS ARE SEMI-FROZEN. The default is what canonicalQualifierKey OMITS, so
 * changing one re-buckets that exercise's historical sets. Treat a default
 * change as a data migration, never a cosmetic tweak.
 *
 * Spec: docs/archive/SPEC_2026-08-05_EXERCISE_QUALIFIERS.md
 */

import type { QualifierAxisId } from './qualifiers';

/** Percentile treatment: 'n' normalize, 'p' passthrough, 'x' exclude. */
export type CoeffTreatment = 'n' | 'p' | 'x';

export interface ExerciseAxisSpec {
  /** Axis id. */
  a: QualifierAxisId;
  /** Applicable value ids, in display order. */
  v: string[];
  /** This exercise's default value (always a member of `v`). */
  d: string;
  /** May the user add their own options here? */
  c: boolean;
}

export interface ExerciseCoeffSpec {
  a: string;
  v: string;
  t: CoeffTreatment;
  /** Ratio (variant 1RM / reference 1RM). Present only when t === 'n'. */
  r?: number;
}

export interface ExerciseQualifierSpec {
  /** Canonical display name as it appears in the library. */
  name: string;
  axes: ExerciseAxisSpec[];
  coeffs: ExerciseCoeffSpec[];
}

/**
 * Normalize an exercise name for lookup. MUST stay in sync with the
 * normalizeName() in scripts/gen-qualifier-map.js.
 */
export function normalizeExerciseName(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[_\-–—]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ');
}

export const EXERCISE_QUALIFIERS: Record<string, ExerciseQualifierSpec> = {
  "ab wheel rollout": {name:"Ab Wheel Rollout",axes:[{a:'rom',v:['full','partial_top'],d:'partial_top',c:false},{a:'body_position',v:['kneeling','standing'],d:'kneeling',c:false}],coeffs:[]},
  "alternating dumbbell curl": {name:"Alternating Dumbbell Curl",axes:[{a:'laterality',v:['bilateral','alternating','unilateral'],d:'alternating',c:false},{a:'grip_orientation',v:['supinated','neutral','mixed'],d:'supinated',c:false}],coeffs:[{a:'laterality',v:'alternating',t:'p'},{a:'grip_orientation',v:'neutral',t:'x'}]},
  "arnold press": {name:"Arnold Press",axes:[{a:'body_position',v:['seated','standing'],d:'seated',c:false},{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'body_position',v:'standing',t:'x'}]},
  "assisted pull up": {name:"Assisted Pull-Up",axes:[{a:'load_mode',v:['assisted','bodyweight'],d:'assisted',c:false},{a:'grip_orientation',v:['pronated','supinated','neutral'],d:'pronated',c:false},{a:'grip_width',v:['close','shoulder','wide'],d:'shoulder',c:false}],coeffs:[{a:'load_mode',v:'assisted',t:'x'},{a:'grip_orientation',v:'supinated',t:'x'}]},
  "back squat": {name:"Back Squat",axes:[{a:'stance',v:['narrow','shoulder','wide'],d:'shoulder',c:false},{a:'bar_type',v:['straight_barbell','safety_squat_bar','smith'],d:'straight_barbell',c:false},{a:'rom',v:['full','paused','deficit','block','partial_top','partial_bottom'],d:'full',c:false},{a:'load_mode',v:['straight_weight','banded','chains','weighted_vest'],d:'straight_weight',c:false}],coeffs:[{a:'bar_type',v:'safety_squat_bar',t:'x'}]},
  "band curl": {name:"Band Curl",axes:[{a:'grip_orientation',v:['supinated','neutral'],d:'supinated',c:false},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'grip_orientation',v:'neutral',t:'x'}]},
  "band pull apart": {name:"Band Pull-Apart",axes:[{a:'grip_width',v:['close','shoulder','wide'],d:'shoulder',c:false}],coeffs:[]},
  "barbell bench press": {name:"Barbell Bench Press",axes:[{a:'grip_width',v:['close','medium','wide'],d:'medium',c:false},{a:'load_mode',v:['straight_weight','banded','chains'],d:'straight_weight',c:false}],coeffs:[{a:'grip_width',v:'close',t:'n',r:0.95}]},
  "barbell curl": {name:"Barbell Curl",axes:[{a:'grip_width',v:['close','shoulder','wide'],d:'shoulder',c:false},{a:'bar_type',v:['straight_barbell','ez_bar'],d:'straight_barbell',c:false}],coeffs:[{a:'grip_width',v:'close',t:'x'},{a:'bar_type',v:'ez_bar',t:'p'}]},
  "barbell hip thrust": {name:"Barbell Hip Thrust",axes:[{a:'stance',v:['narrow','shoulder','wide'],d:'shoulder',c:false},{a:'load_mode',v:['straight_weight','banded','chains'],d:'straight_weight',c:false},{a:'rom',v:['full','paused'],d:'full',c:false}],coeffs:[{a:'load_mode',v:'banded',t:'x'}]},
  "barbell row": {name:"Barbell Row",axes:[{a:'grip_orientation',v:['pronated','supinated','neutral'],d:'pronated',c:false},{a:'grip_width',v:['shoulder','wide'],d:'shoulder',c:false}],coeffs:[{a:'grip_orientation',v:'supinated',t:'x'}]},
  "battle ropes": {name:"Battle Ropes",axes:[{a:'laterality',v:['bilateral','alternating'],d:'alternating',c:false}],coeffs:[]},
  "belt squat": {name:"Belt Squat",axes:[{a:'stance',v:['narrow','shoulder','wide','sumo'],d:'shoulder',c:false},{a:'load_mode',v:['straight_weight','banded','chains'],d:'straight_weight',c:false}],coeffs:[{a:'stance',v:'sumo',t:'x'}]},
  "bench dip": {name:"Bench Dip",axes:[{a:'load_mode',v:['bodyweight','weighted_vest','assisted'],d:'bodyweight',c:true}],coeffs:[{a:'load_mode',v:'assisted',t:'x'}]},
  "bench press": {name:"Bench Press",axes:[{a:'grip_width',v:['close','medium','wide'],d:'medium',c:false},{a:'bench_angle',v:['decline','flat','incline_15','incline_30','incline_45'],d:'flat',c:false},{a:'bar_type',v:['straight_barbell','smith','dumbbell'],d:'straight_barbell',c:false},{a:'load_mode',v:['straight_weight','chains','banded'],d:'straight_weight',c:true}],coeffs:[{a:'grip_width',v:'close',t:'n',r:0.95},{a:'grip_width',v:'wide',t:'p'},{a:'bench_angle',v:'incline_30',t:'x'},{a:'bench_angle',v:'incline_15',t:'x'},{a:'bench_angle',v:'incline_45',t:'x'},{a:'bench_angle',v:'decline',t:'x'},{a:'bar_type',v:'dumbbell',t:'x'}]},
  "bent over reverse fly": {name:"Bent-Over Reverse Fly",axes:[{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false}],coeffs:[]},
  "bodyweight squat": {name:"Bodyweight Squat",axes:[{a:'stance',v:['narrow','shoulder','wide','sumo'],d:'shoulder',c:false},{a:'rom',v:['full','partial_bottom'],d:'full',c:false}],coeffs:[]},
  "box jump": {name:"Box Jump",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false},{a:'load_mode',v:['bodyweight','weighted_vest'],d:'bodyweight',c:false}],coeffs:[]},
  "box squat": {name:"Box Squat",axes:[{a:'stance',v:['narrow','shoulder','wide','sumo'],d:'wide',c:false},{a:'bar_type',v:['straight_barbell','safety_squat_bar'],d:'straight_barbell',c:false},{a:'load_mode',v:['straight_weight','banded','chains'],d:'straight_weight',c:false}],coeffs:[]},
  "bulgarian split squat": {name:"Bulgarian Split Squat",axes:[{a:'bar_type',v:['dumbbell','kettlebell','straight_barbell','smith'],d:'dumbbell',c:false},{a:'load_mode',v:['bodyweight','straight_weight','weighted_vest'],d:'straight_weight',c:false}],coeffs:[{a:'bar_type',v:'dumbbell',t:'x'}]},
  "cable crossover": {name:"Cable Crossover",axes:[{a:'pulley_height',v:['high','mid_chest','shoulder','floor'],d:'high',c:false},{a:'attachment',v:['single_d','dual_d','stirrup'],d:'single_d',c:true},{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[{a:'pulley_height',v:'floor',t:'x'}]},
  "cable crunch": {name:"Cable Crunch",axes:[{a:'attachment',v:['rope','straight_bar','dual_d'],d:'rope',c:true},{a:'pulley_height',v:['high','overhead'],d:'high',c:false},{a:'body_position',v:['kneeling','standing'],d:'kneeling',c:false}],coeffs:[{a:'attachment',v:'straight_bar',t:'p'}]},
  "cable curl": {name:"Cable Curl",axes:[{a:'attachment',v:['straight_bar','ez_bar','rope','single_d'],d:'straight_bar',c:true},{a:'pulley_height',v:['floor','knee'],d:'floor',c:false},{a:'grip_orientation',v:['supinated','pronated','neutral'],d:'supinated',c:false}],coeffs:[{a:'attachment',v:'rope',t:'p'},{a:'grip_orientation',v:'pronated',t:'x'}]},
  "cable fly high to low": {name:"Cable Fly (High to Low)",axes:[{a:'attachment',v:['single_d','stirrup','straight_bar'],d:'single_d',c:true},{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'pulley_height',v:'high',t:'p'}]},
  "cable fly low to high": {name:"Cable Fly (Low to High)",axes:[{a:'pulley_height',v:['floor','knee','mid_chest','shoulder'],d:'floor',c:false},{a:'attachment',v:['single_d','stirrup','dual_d'],d:'single_d',c:true},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'attachment',v:'stirrup',t:'p'},{a:'pulley_height',v:'knee',t:'x'}]},
  "cable front raise": {name:"Cable Front Raise",axes:[{a:'attachment',v:['straight_bar','single_d','rope'],d:'single_d',c:true},{a:'pulley_height',v:['floor','knee','hip'],d:'floor',c:false},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'unilateral',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "cable kickback": {name:"Cable Kickback",axes:[{a:'attachment',v:['ankle_strap'],d:'ankle_strap',c:false},{a:'pulley_height',v:['floor','knee'],d:'floor',c:false},{a:'laterality',v:['unilateral'],d:'unilateral',c:false}],coeffs:[]},
  "cable lateral raise": {name:"Cable Lateral Raise",axes:[{a:'pulley_height',v:['floor','knee','hip'],d:'floor',c:false},{a:'attachment',v:['single_d','stirrup','ankle_strap'],d:'single_d',c:true},{a:'laterality',v:['unilateral','bilateral'],d:'unilateral',c:false}],coeffs:[]},
  "cable overhead extension": {name:"Cable Overhead Extension",axes:[{a:'attachment',v:['rope','straight_bar','single_d','dual_d'],d:'rope',c:true},{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false},{a:'body_position',v:['standing','kneeling'],d:'standing',c:false}],coeffs:[{a:'attachment',v:'straight_bar',t:'x'},{a:'laterality',v:'unilateral',t:'x'}]},
  "cable pull through": {name:"Cable Pull-Through",axes:[{a:'attachment',v:['rope','dual_d','single_d'],d:'rope',c:true},{a:'stance',v:['shoulder','wide','sumo'],d:'shoulder',c:false}],coeffs:[]},
  "cable reverse curl": {name:"Cable Reverse Curl",axes:[{a:'attachment',v:['straight_bar','ez_bar'],d:'straight_bar',c:false},{a:'grip_width',v:['shoulder','wide'],d:'shoulder',c:false}],coeffs:[{a:'grip_orientation',v:'pronated',t:'x'}]},
  "cable rope hammer curl": {name:"Cable Rope Hammer Curl",axes:[{a:'attachment',v:['rope','dual_d','single_d'],d:'rope',c:false},{a:'grip_orientation',v:['neutral','supinated'],d:'neutral',c:false},{a:'pulley_height',v:['floor','knee'],d:'floor',c:false},{a:'laterality',v:['bilateral','alternating','unilateral'],d:'bilateral',c:false}],coeffs:[{a:'grip_orientation',v:'neutral',t:'x'}]},
  "cable woodchopper": {name:"Cable Woodchopper",axes:[{a:'pulley_height',v:['high','knee'],d:'high',c:false},{a:'stance',v:['shoulder','staggered','split'],d:'shoulder',c:false},{a:'laterality',v:['unilateral','alternating'],d:'unilateral',c:false},{a:'attachment',v:['single_d','dual_d','rope'],d:'single_d',c:true}],coeffs:[{a:'pulley_height',v:'low',t:'x'}]},
  "chest supported dumbbell row": {name:"Chest-Supported Dumbbell Row",axes:[{a:'body_position',v:['chest_supported','bent_over'],d:'chest_supported',c:false},{a:'bench_angle',v:['incline_15','incline_30','incline_45'],d:'incline_30',c:false},{a:'grip_orientation',v:['neutral','pronated'],d:'neutral',c:false},{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'body_position',v:'chest_supported',t:'x'}]},
  "chest supported row": {name:"Chest-Supported Row",axes:[{a:'bar_type',v:['dumbbell','machine'],d:'dumbbell',c:false},{a:'grip_orientation',v:['neutral','pronated','supinated'],d:'neutral',c:false},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[]},
  "chin up": {name:"Chin-Up",axes:[{a:'grip_orientation',v:['supinated','pronated','neutral','mixed'],d:'supinated',c:false},{a:'grip_width',v:['close','shoulder','medium','wide'],d:'shoulder',c:false},{a:'load_mode',v:['bodyweight','weighted_vest','assisted'],d:'bodyweight',c:false}],coeffs:[{a:'grip_orientation',v:'supinated',t:'x'}]},
  "clean": {name:"Clean",axes:[{a:'bar_type',v:['straight_barbell'],d:'straight_barbell',c:false},{a:'rom',v:['full','partial_top'],d:'full',c:false}],coeffs:[{a:'rom',v:'partial_top',t:'x'}]},
  "close grip bench press": {name:"Close-Grip Bench Press",axes:[{a:'grip_width',v:['close','shoulder','medium'],d:'close',c:false}],coeffs:[{a:'grip_width',v:'close',t:'n',r:0.95}]},
  "close grip lat pulldown": {name:"Close-Grip Lat Pulldown",axes:[{a:'grip_width',v:['close','shoulder','medium','wide'],d:'close',c:false},{a:'attachment',v:['straight_bar','v_bar','mag_grip','single_d','dual_d'],d:'v_bar',c:true}],coeffs:[{a:'grip_width',v:'close',t:'x'}]},
  "concentration curl": {name:"Concentration Curl",axes:[{a:'body_position',v:['seated','standing','bent_over'],d:'seated',c:false}],coeffs:[{a:'body_position',v:'seated',t:'x'}]},
  "conventional deadlift": {name:"Conventional Deadlift",axes:[{a:'grip_orientation',v:['pronated','mixed','hook'],d:'pronated',c:false},{a:'load_mode',v:['straight_weight','banded','chains'],d:'straight_weight',c:false},{a:'rom',v:['full','deficit','block','paused'],d:'full',c:true}],coeffs:[{a:'grip_orientation',v:'mixed',t:'p'},{a:'rom',v:'deficit',t:'x'},{a:'rom',v:'block',t:'x'}]},
  "crunch": {name:"Crunch",axes:[{a:'load_mode',v:['bodyweight','straight_weight'],d:'bodyweight',c:false}],coeffs:[]},
  "curtsy lunge": {name:"Curtsy Lunge",axes:[{a:'load_mode',v:['bodyweight','straight_weight'],d:'bodyweight',c:false},{a:'bar_type',v:['dumbbell','kettlebell','straight_barbell'],d:'dumbbell',c:false},{a:'laterality',v:['alternating','unilateral'],d:'alternating',c:false}],coeffs:[]},
  "dead hang": {name:"Dead Hang",axes:[{a:'grip_orientation',v:['pronated','supinated','neutral','mixed','hook','thumbless'],d:'pronated',c:false},{a:'grip_width',v:['close','shoulder','medium','wide'],d:'shoulder',c:false}],coeffs:[]},
  "deadlift": {name:"Deadlift",axes:[{a:'stance',v:['shoulder','sumo'],d:'shoulder',c:false},{a:'bar_type',v:['straight_barbell','trap_bar','safety_squat_bar'],d:'straight_barbell',c:false},{a:'rom',v:['full','deficit','block'],d:'full',c:false}],coeffs:[{a:'stance',v:'sumo',t:'p'},{a:'bar_type',v:'trap_bar',t:'x'},{a:'bar_type',v:'safety_squat_bar',t:'x'},{a:'rom',v:'deficit',t:'x'},{a:'rom',v:'block',t:'x'}]},
  "decline barbell bench press": {name:"Decline Barbell Bench Press",axes:[{a:'bench_angle',v:['decline','flat'],d:'decline',c:false},{a:'grip_width',v:['close','shoulder','medium','wide'],d:'medium',c:false},{a:'bar_type',v:['straight_barbell','smith'],d:'straight_barbell',c:false}],coeffs:[{a:'bench_angle',v:'decline',t:'x'}]},
  "decline crunch": {name:"Decline Crunch",axes:[{a:'bench_angle',v:['decline'],d:'decline',c:false},{a:'load_mode',v:['bodyweight','straight_weight','weighted_vest'],d:'bodyweight',c:false}],coeffs:[]},
  "decline dumbbell press": {name:"Decline Dumbbell Press",axes:[{a:'bench_angle',v:['decline','flat'],d:'flat',c:false}],coeffs:[{a:'bench_angle',v:'decline',t:'x'}]},
  "depth jump": {name:"Depth Jump",axes:[{a:'stance',v:['high_platform','low_platform'],d:'low_platform',c:false}],coeffs:[]},
  "diamond push up": {name:"Diamond Push-Up",axes:[{a:'load_mode',v:['bodyweight','weighted_vest'],d:'bodyweight',c:false},{a:'rom',v:['full','partial_top'],d:'full',c:false}],coeffs:[{a:'grip_width',v:'close',t:'x'}]},
  "dip chest focused": {name:"Dip (Chest-Focused)",axes:[{a:'load_mode',v:['bodyweight','weighted_vest','straight_weight','assisted'],d:'bodyweight',c:false},{a:'grip_width',v:['shoulder','wide','extra_wide'],d:'wide',c:false}],coeffs:[{a:'grip_width',v:'wide',t:'x'}]},
  "donkey calf raise": {name:"Donkey Calf Raise",axes:[{a:'body_position',v:['standing','bent_over','seated'],d:'standing',c:false},{a:'load_mode',v:['bodyweight','straight_weight','assisted'],d:'bodyweight',c:false}],coeffs:[{a:'body_position',v:'bent_over',t:'x'}]},
  "dumbbell bench press": {name:"Dumbbell Bench Press",axes:[{a:'bench_angle',v:['flat','incline_15','incline_30','incline_45','decline'],d:'flat',c:false},{a:'grip_orientation',v:['pronated','neutral'],d:'pronated',c:false},{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'bench_angle',v:'incline_30',t:'x'}]},
  "dumbbell curl": {name:"Dumbbell Curl",axes:[{a:'grip_orientation',v:['supinated','neutral','pronated'],d:'supinated',c:false},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'alternating',c:false}],coeffs:[{a:'grip_orientation',v:'neutral',t:'x'},{a:'grip_orientation',v:'pronated',t:'x'}]},
  "dumbbell fly": {name:"Dumbbell Fly",axes:[{a:'bench_angle',v:['decline','flat','incline_15','incline_30'],d:'flat',c:false},{a:'rom',v:['full','lengthened_partial'],d:'full',c:false}],coeffs:[{a:'bench_angle',v:'incline_30',t:'x'}]},
  "dumbbell lunge": {name:"Dumbbell Lunge",axes:[{a:'bar_type',v:['dumbbell','kettlebell','straight_barbell','trap_bar'],d:'dumbbell',c:false},{a:'stance',v:['split','staggered'],d:'split',c:false},{a:'laterality',v:['alternating','unilateral'],d:'alternating',c:false}],coeffs:[]},
  "dumbbell pullover": {name:"Dumbbell Pullover",axes:[{a:'bench_angle',v:['flat','decline'],d:'flat',c:false}],coeffs:[]},
  "dumbbell row": {name:"Dumbbell Row",axes:[{a:'body_position',v:['bent_over','chest_supported','kneeling'],d:'bent_over',c:false},{a:'laterality',v:['unilateral','bilateral','alternating'],d:'unilateral',c:false}],coeffs:[{a:'body_position',v:'chest_supported',t:'x'},{a:'laterality',v:'bilateral',t:'x'}]},
  "dumbbell shoulder press": {name:"Dumbbell Shoulder Press",axes:[{a:'body_position',v:['seated','standing'],d:'seated',c:false},{a:'grip_orientation',v:['neutral','pronated'],d:'pronated',c:false}],coeffs:[{a:'body_position',v:'standing',t:'x'}]},
  "dumbbell skull crusher": {name:"Dumbbell Skull Crusher",axes:[{a:'bench_angle',v:['flat','incline_15','incline_30','decline'],d:'flat',c:false},{a:'grip_orientation',v:['neutral','pronated'],d:'neutral',c:false},{a:'rom',v:['full','lengthened_partial'],d:'full',c:false}],coeffs:[{a:'bench_angle',v:'incline_15',t:'x'}]},
  "ez bar curl": {name:"EZ-Bar Curl",axes:[{a:'bar_type',v:['straight_barbell','ez_bar'],d:'straight_barbell',c:false},{a:'grip_width',v:['close','medium','wide'],d:'medium',c:false}],coeffs:[{a:'bar_type',v:'ez_bar',t:'x'}]},
  "ez bar skull crusher": {name:"EZ-Bar Skull Crusher",axes:[{a:'bar_type',v:['ez_bar','straight_barbell','dumbbell','swiss_bar'],d:'ez_bar',c:false},{a:'bench_angle',v:['flat','decline','incline_15'],d:'flat',c:false},{a:'grip_width',v:['close','medium'],d:'close',c:false}],coeffs:[{a:'bar_type',v:'straight_barbell',t:'x'}]},
  "face pull": {name:"Face Pull",axes:[{a:'pulley_height',v:['mid_chest','shoulder','high'],d:'shoulder',c:false},{a:'attachment',v:['rope','dual_d'],d:'rope',c:true}],coeffs:[{a:'pulley_height',v:'high',t:'p'}]},
  "flat dumbbell fly": {name:"Flat Dumbbell Fly",axes:[{a:'bench_angle',v:['flat','incline_15','incline_30','decline'],d:'flat',c:false},{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false}],coeffs:[]},
  "floor press": {name:"Floor Press",axes:[{a:'bar_type',v:['straight_barbell','ez_bar','swiss_bar','dumbbell'],d:'straight_barbell',c:false},{a:'grip_width',v:['close','medium','wide'],d:'medium',c:false},{a:'load_mode',v:['straight_weight','banded','chains'],d:'straight_weight',c:false}],coeffs:[{a:'grip_width',v:'close',t:'x'}]},
  "foam roll quads": {name:"Foam Roll Quads",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[]},
  "frog pump": {name:"Frog Pump",axes:[{a:'load_mode',v:['bodyweight','banded','straight_weight'],d:'bodyweight',c:false}],coeffs:[]},
  "front foot elevated split squat": {name:"Front-Foot-Elevated Split Squat",axes:[{a:'load_mode',v:['bodyweight','straight_weight','weighted_vest'],d:'straight_weight',c:false}],coeffs:[]},
  "front raise": {name:"Front Raise",axes:[{a:'bar_type',v:['dumbbell','straight_barbell','ez_bar','kettlebell'],d:'dumbbell',c:false},{a:'attachment',v:['straight_bar','single_d','rope'],d:'single_d',c:true},{a:'laterality',v:['bilateral','alternating','unilateral'],d:'alternating',c:false}],coeffs:[]},
  "front squat": {name:"Front Squat",axes:[{a:'stance',v:['narrow','shoulder','wide'],d:'shoulder',c:false},{a:'bar_type',v:['straight_barbell','safety_squat_bar'],d:'straight_barbell',c:false}],coeffs:[]},
  "glute bridge": {name:"Glute Bridge",axes:[{a:'load_mode',v:['bodyweight','straight_weight','banded'],d:'bodyweight',c:false},{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "glute ham raise": {name:"Glute-Ham Raise",axes:[{a:'load_mode',v:['bodyweight','weighted_vest','straight_weight','assisted'],d:'bodyweight',c:false},{a:'rom',v:['full','partial_top','partial_bottom'],d:'full',c:false}],coeffs:[]},
  "goblet lunge": {name:"Goblet Lunge",axes:[{a:'stance',v:['split','staggered'],d:'split',c:false},{a:'laterality',v:['alternating','unilateral'],d:'alternating',c:false}],coeffs:[]},
  "goblet squat": {name:"Goblet Squat",axes:[{a:'bar_type',v:['dumbbell','kettlebell'],d:'dumbbell',c:false},{a:'stance',v:['shoulder','wide'],d:'shoulder',c:false}],coeffs:[{a:'bar_type',v:'kettlebell',t:'p'}]},
  "good morning": {name:"Good Morning",axes:[{a:'bar_type',v:['straight_barbell','safety_squat_bar'],d:'straight_barbell',c:false},{a:'stance',v:['shoulder','narrow','wide'],d:'shoulder',c:false}],coeffs:[]},
  "hack squat": {name:"Hack Squat",axes:[{a:'stance',v:['narrow','shoulder','wide','high_platform','low_platform'],d:'shoulder',c:false}],coeffs:[{a:'stance',v:'high_platform',t:'x'}]},
  "hammer curl": {name:"Hammer Curl",axes:[{a:'laterality',v:['bilateral','alternating','unilateral'],d:'alternating',c:false}],coeffs:[{a:'laterality',v:'alternating',t:'p'}]},
  "hamstring stretch": {name:"Hamstring Stretch",axes:[{a:'laterality',v:['unilateral','bilateral'],d:'unilateral',c:false}],coeffs:[]},
  "handstand push up": {name:"Handstand Push-Up",axes:[{a:'body_position',v:['standing','kneeling'],d:'standing',c:false},{a:'rom',v:['full','partial_top','deficit'],d:'full',c:false},{a:'load_mode',v:['bodyweight','weighted_vest'],d:'bodyweight',c:false}],coeffs:[]},
  "hang clean": {name:"Hang Clean",axes:[{a:'bar_type',v:['straight_barbell','dumbbell'],d:'straight_barbell',c:false}],coeffs:[]},
  "hang power clean": {name:"Hang Power Clean",axes:[{a:'grip_orientation',v:['pronated','hook'],d:'hook',c:false}],coeffs:[{a:'grip_orientation',v:'pronated',t:'x'}]},
  "hanging knee raise": {name:"Hanging Knee Raise",axes:[{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false},{a:'rom',v:['full','partial_top'],d:'full',c:false}],coeffs:[]},
  "hanging leg raise": {name:"Hanging Leg Raise",axes:[{a:'rom',v:['full','partial_top'],d:'full',c:false}],coeffs:[]},
  "high bar squat": {name:"High-Bar Squat",axes:[{a:'stance',v:['narrow','shoulder','wide'],d:'shoulder',c:false},{a:'rom',v:['full','partial_bottom','paused','deficit','block'],d:'full',c:false},{a:'bar_type',v:['straight_barbell','smith'],d:'straight_barbell',c:false}],coeffs:[{a:'bar_type',v:'smith',t:'x'}]},
  "hip abduction machine": {name:"Hip Abduction Machine",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[]},
  "hip adduction machine": {name:"Hip Adduction Machine",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false},{a:'rom',v:['full','partial_top'],d:'full',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "hip thrust": {name:"Hip Thrust",axes:[{a:'bar_type',v:['straight_barbell','machine','smith'],d:'straight_barbell',c:false},{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false},{a:'load_mode',v:['straight_weight','banded','bodyweight'],d:'straight_weight',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "hyperextension": {name:"Hyperextension",axes:[{a:'bench_angle',v:['incline_45','upright_90'],d:'incline_45',c:false},{a:'load_mode',v:['bodyweight','straight_weight','weighted_vest'],d:'bodyweight',c:false}],coeffs:[]},
  "incline barbell bench press": {name:"Incline Barbell Bench Press",axes:[{a:'bench_angle',v:['incline_15','incline_30','incline_45'],d:'incline_30',c:false},{a:'grip_width',v:['close','shoulder','medium','wide'],d:'medium',c:false},{a:'bar_type',v:['straight_barbell','smith'],d:'straight_barbell',c:false}],coeffs:[{a:'bench_angle',v:'incline_30',t:'x'}]},
  "incline cable fly": {name:"Incline Cable Fly",axes:[{a:'bench_angle',v:['flat','incline_15','incline_30','incline_45'],d:'incline_30',c:false},{a:'attachment',v:['single_d','stirrup'],d:'single_d',c:true},{a:'pulley_height',v:['floor','knee','hip'],d:'floor',c:false}],coeffs:[]},
  "incline dumbbell curl": {name:"Incline Dumbbell Curl",axes:[{a:'bench_angle',v:['incline_45','incline_30','incline_60'],d:'incline_45',c:false}],coeffs:[{a:'bench_angle',v:'incline_45',t:'x'}]},
  "incline dumbbell fly": {name:"Incline Dumbbell Fly",axes:[{a:'bench_angle',v:['flat','incline_15','incline_30','incline_45'],d:'incline_30',c:false}],coeffs:[{a:'bench_angle',v:'incline_30',t:'x'}]},
  "incline dumbbell press": {name:"Incline Dumbbell Press",axes:[{a:'bench_angle',v:['incline_15','incline_30','incline_45','incline_60'],d:'incline_30',c:false},{a:'grip_orientation',v:['neutral','pronated'],d:'pronated',c:false},{a:'laterality',v:['bilateral','alternating','unilateral'],d:'bilateral',c:false}],coeffs:[{a:'bench_angle',v:'incline_30',t:'x'}]},
  "inverted row": {name:"Inverted Row",axes:[{a:'grip_orientation',v:['pronated','supinated','neutral'],d:'pronated',c:false},{a:'body_position',v:['lying_supine','incline_supported'],d:'lying_supine',c:false},{a:'load_mode',v:['bodyweight','weighted_vest'],d:'bodyweight',c:false}],coeffs:[{a:'grip_orientation',v:'supinated',t:'x'}]},
  "jerk": {name:"Jerk",axes:[{a:'stance',v:['split','feet_together'],d:'split',c:false},{a:'load_mode',v:['straight_weight'],d:'straight_weight',c:false}],coeffs:[{a:'stance',v:'feet_together',t:'x'}]},
  "jm press": {name:"JM Press",axes:[{a:'grip_width',v:['close','medium'],d:'close',c:false},{a:'bar_type',v:['straight_barbell','ez_bar','smith'],d:'straight_barbell',c:false}],coeffs:[]},
  "jump rope": {name:"Jump Rope",axes:[{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false}],coeffs:[]},
  "jump squat": {name:"Jump Squat",axes:[{a:'load_mode',v:['straight_weight','bodyweight','weighted_vest','banded'],d:'bodyweight',c:false},{a:'stance',v:['shoulder','narrow','wide'],d:'shoulder',c:false}],coeffs:[]},
  "kettlebell swing": {name:"Kettlebell Swing",axes:[{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "landmine press": {name:"Landmine Press",axes:[{a:'laterality',v:['unilateral','bilateral'],d:'unilateral',c:false},{a:'body_position',v:['standing','half_kneeling','kneeling'],d:'standing',c:false},{a:'stance',v:['staggered','split'],d:'staggered',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "landmine row": {name:"Landmine Row",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false},{a:'stance',v:['staggered','shoulder','split'],d:'shoulder',c:false},{a:'attachment',v:['v_bar','single_d'],d:'v_bar',c:true}],coeffs:[]},
  "lat pulldown": {name:"Lat Pulldown",axes:[{a:'grip_width',v:['close','shoulder','medium','wide'],d:'wide',c:false},{a:'grip_orientation',v:['pronated','supinated','neutral'],d:'pronated',c:false},{a:'attachment',v:['lat_bar_wide','straight_bar','v_bar','mag_grip','single_d','rope'],d:'lat_bar_wide',c:true},{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[]},
  "lateral raise": {name:"Lateral Raise",axes:[{a:'bar_type',v:['dumbbell','machine'],d:'dumbbell',c:false},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false},{a:'body_position',v:['standing','seated'],d:'standing',c:false}],coeffs:[]},
  "leg curl": {name:"Leg Curl",axes:[{a:'body_position',v:['seated','lying_prone'],d:'lying_prone',c:false},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'body_position',v:'seated',t:'x'}]},
  "leg extension": {name:"Leg Extension",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false},{a:'rom',v:['full','partial_top','lengthened_partial'],d:'full',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "leg press": {name:"Leg Press",axes:[{a:'stance',v:['narrow','shoulder','wide','high_platform','low_platform'],d:'shoulder',c:false},{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[{a:'stance',v:'narrow',t:'x'},{a:'stance',v:'high_platform',t:'x'}]},
  "leg press calf raise": {name:"Leg Press Calf Raise",axes:[{a:'stance',v:['narrow','shoulder','wide','high_platform','low_platform'],d:'shoulder',c:false},{a:'rom',v:['full','partial_top'],d:'full',c:false},{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[]},
  "lying leg curl": {name:"Lying Leg Curl",axes:[{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "machine chest press": {name:"Machine Chest Press",axes:[{a:'grip_orientation',v:['pronated','neutral'],d:'pronated',c:false},{a:'bench_angle',v:['flat','incline_30'],d:'flat',c:false},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[]},
  "machine curl": {name:"Machine Curl",axes:[{a:'grip_orientation',v:['supinated','neutral'],d:'supinated',c:false}],coeffs:[]},
  "machine lateral raise": {name:"Machine Lateral Raise",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[]},
  "machine row": {name:"Machine Row",axes:[{a:'grip_orientation',v:['neutral','pronated','supinated'],d:'neutral',c:false},{a:'body_position',v:['seated','chest_supported'],d:'chest_supported',c:false}],coeffs:[{a:'grip_orientation',v:'supinated',t:'x'}]},
  "machine shoulder press": {name:"Machine Shoulder Press",axes:[{a:'grip_orientation',v:['neutral','pronated'],d:'neutral',c:false}],coeffs:[]},
  "machine triceps extension": {name:"Machine Triceps Extension",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[]},
  "meadows row": {name:"Meadows Row",axes:[{a:'stance',v:['staggered','split'],d:'staggered',c:false},{a:'grip_orientation',v:['pronated','neutral'],d:'pronated',c:false}],coeffs:[]},
  "medicine ball slam": {name:"Medicine Ball Slam",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false},{a:'stance',v:['shoulder','split'],d:'shoulder',c:false}],coeffs:[]},
  "neutral grip db press": {name:"Neutral-Grip DB Press",axes:[],coeffs:[{a:'grip_orientation',v:'neutral',t:'x'}]},
  "neutral grip db shoulder press": {name:"Neutral-Grip DB Shoulder Press",axes:[{a:'grip_orientation',v:['neutral','pronated'],d:'neutral',c:false},{a:'body_position',v:['seated','standing'],d:'seated',c:false}],coeffs:[{a:'grip_orientation',v:'neutral',t:'x'}]},
  "neutral grip lat pulldown": {name:"Neutral-Grip Lat Pulldown",axes:[{a:'attachment',v:['v_bar','dual_d','mag_grip'],d:'v_bar',c:true},{a:'grip_width',v:['close','shoulder'],d:'close',c:false},{a:'laterality',v:['bilateral','alternating','unilateral'],d:'bilateral',c:false}],coeffs:[]},
  "neutral grip pulldown": {name:"Neutral-Grip Pulldown",axes:[{a:'grip_orientation',v:['neutral','pronated','supinated'],d:'neutral',c:false},{a:'attachment',v:['v_bar','dual_d','single_d'],d:'v_bar',c:true},{a:'grip_width',v:['close','medium'],d:'close',c:false}],coeffs:[{a:'grip_width',v:'close',t:'x'}]},
  "nordic curl": {name:"Nordic Curl",axes:[{a:'load_mode',v:['bodyweight','banded','assisted','weighted_vest'],d:'bodyweight',c:false},{a:'rom',v:['full','partial_top'],d:'full',c:false}],coeffs:[{a:'load_mode',v:'assisted',t:'x'}]},
  "overhead cable extension": {name:"Overhead Cable Extension",axes:[{a:'attachment',v:['rope','straight_bar','single_d','dual_d'],d:'rope',c:true},{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false},{a:'body_position',v:['standing','kneeling'],d:'standing',c:false}],coeffs:[{a:'attachment',v:'straight_bar',t:'x'},{a:'laterality',v:'unilateral',t:'x'}]},
  "overhead press": {name:"Overhead Press",axes:[{a:'body_position',v:['standing','seated'],d:'standing',c:false},{a:'grip_width',v:['close','shoulder','wide'],d:'shoulder',c:false},{a:'bar_type',v:['straight_barbell','smith'],d:'straight_barbell',c:false}],coeffs:[{a:'body_position',v:'seated',t:'x'},{a:'grip_width',v:'wide',t:'x'}]},
  "overhead squat": {name:"Overhead Squat",axes:[{a:'grip_width',v:['wide','extra_wide'],d:'extra_wide',c:false},{a:'stance',v:['shoulder','wide'],d:'shoulder',c:false}],coeffs:[{a:'grip_width',v:'extra_wide',t:'x'}]},
  "overhead triceps extension": {name:"Overhead Triceps Extension",axes:[{a:'bar_type',v:['dumbbell','ez_bar','machine'],d:'dumbbell',c:false},{a:'attachment',v:['rope','straight_bar','single_d'],d:'rope',c:true},{a:'body_position',v:['standing','seated'],d:'standing',c:false},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "pallof press": {name:"Pallof Press",axes:[{a:'pulley_height',v:['mid_chest','hip'],d:'mid_chest',c:false},{a:'attachment',v:['single_d','straight_bar','dual_d'],d:'single_d',c:true},{a:'body_position',v:['standing','kneeling','half_kneeling'],d:'standing',c:false},{a:'stance',v:['shoulder','staggered'],d:'shoulder',c:false}],coeffs:[]},
  "parallel bar dip triceps": {name:"Parallel Bar Dip (Triceps)",axes:[{a:'load_mode',v:['bodyweight','weighted_vest','straight_weight','assisted'],d:'bodyweight',c:false}],coeffs:[{a:'load_mode',v:'assisted',t:'x'}]},
  "pause squat": {name:"Pause Squat",axes:[],coeffs:[{a:'rom',v:'paused',t:'x'}]},
  "pec deck": {name:"Pec Deck",axes:[{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "pendlay row": {name:"Pendlay Row",axes:[{a:'grip_orientation',v:['pronated','supinated'],d:'pronated',c:false},{a:'grip_width',v:['shoulder','wide'],d:'shoulder',c:false},{a:'bar_type',v:['straight_barbell','ez_bar'],d:'straight_barbell',c:false}],coeffs:[{a:'grip_orientation',v:'supinated',t:'x'}]},
  "pendulum squat": {name:"Pendulum Squat",axes:[{a:'stance',v:['shoulder','wide','narrow'],d:'shoulder',c:false},{a:'rom',v:['full','partial_bottom','lengthened_partial'],d:'full',c:false}],coeffs:[]},
  "pike push up": {name:"Pike Push-Up",axes:[{a:'load_mode',v:['bodyweight','weighted_vest'],d:'bodyweight',c:false}],coeffs:[]},
  "pistol squat": {name:"Pistol Squat",axes:[{a:'load_mode',v:['bodyweight','straight_weight','assisted','weighted_vest'],d:'bodyweight',c:false}],coeffs:[{a:'load_mode',v:'assisted',t:'x'}]},
  "plank": {name:"Plank",axes:[{a:'load_mode',v:['bodyweight','weighted_vest'],d:'bodyweight',c:false}],coeffs:[]},
  "plate pinch hold": {name:"Plate Pinch Hold",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'unilateral',c:false}],coeffs:[]},
  "preacher curl": {name:"Preacher Curl",axes:[{a:'bar_type',v:['ez_bar','straight_barbell','dumbbell','machine'],d:'ez_bar',c:false},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[]},
  "preacher curl machine": {name:"Preacher Curl Machine",axes:[{a:'grip_orientation',v:['supinated','neutral'],d:'supinated',c:false},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'grip_orientation',v:'neutral',t:'x'}]},
  "pull up": {name:"Pull-Up",axes:[{a:'grip_width',v:['close','shoulder','wide'],d:'shoulder',c:false},{a:'grip_orientation',v:['pronated','supinated','neutral','mixed'],d:'pronated',c:false},{a:'load_mode',v:['bodyweight','weighted_vest','assisted','banded'],d:'bodyweight',c:false}],coeffs:[{a:'grip_orientation',v:'supinated',t:'x'}]},
  "push press": {name:"Push Press",axes:[{a:'bar_type',v:['straight_barbell','dumbbell','kettlebell','trap_bar'],d:'straight_barbell',c:false},{a:'load_mode',v:['straight_weight','chains','banded'],d:'straight_weight',c:false}],coeffs:[]},
  "push up": {name:"Push-Up",axes:[{a:'grip_width',v:['close','shoulder','medium','wide'],d:'shoulder',c:false},{a:'load_mode',v:['bodyweight','weighted_vest','banded'],d:'bodyweight',c:false}],coeffs:[]},
  "rack pull": {name:"Rack Pull",axes:[{a:'rom',v:['partial_top'],d:'partial_top',c:false},{a:'bar_type',v:['straight_barbell','trap_bar'],d:'straight_barbell',c:false}],coeffs:[{a:'rom',v:'partial_top',t:'x'}]},
  "reverse curl": {name:"Reverse Curl",axes:[{a:'grip_orientation',v:['pronated','supinated'],d:'pronated',c:false},{a:'bar_type',v:['straight_barbell','ez_bar','dumbbell'],d:'straight_barbell',c:false}],coeffs:[{a:'grip_orientation',v:'pronated',t:'x'}]},
  "reverse grip lat pulldown": {name:"Reverse-Grip Lat Pulldown",axes:[],coeffs:[{a:'grip_orientation',v:'supinated',t:'x'}]},
  "reverse hyperextension": {name:"Reverse Hyperextension",axes:[{a:'load_mode',v:['bodyweight','straight_weight'],d:'bodyweight',c:false},{a:'rom',v:['full','partial_top'],d:'full',c:false}],coeffs:[]},
  "reverse lunge": {name:"Reverse Lunge",axes:[{a:'bar_type',v:['dumbbell','kettlebell','straight_barbell','trap_bar','smith','machine'],d:'dumbbell',c:false},{a:'laterality',v:['alternating','unilateral'],d:'alternating',c:false},{a:'load_mode',v:['bodyweight','straight_weight','weighted_vest'],d:'straight_weight',c:false}],coeffs:[]},
  "reverse pec deck": {name:"Reverse Pec Deck",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false},{a:'grip_orientation',v:['neutral','pronated'],d:'neutral',c:false}],coeffs:[]},
  "reverse wrist curl": {name:"Reverse Wrist Curl",axes:[{a:'bar_type',v:['straight_barbell','ez_bar','dumbbell'],d:'straight_barbell',c:false},{a:'laterality',v:['bilateral','unilateral','alternating'],d:'bilateral',c:false}],coeffs:[]},
  "ring row": {name:"Ring Row",axes:[{a:'grip_orientation',v:['supinated','neutral','pronated'],d:'neutral',c:false},{a:'load_mode',v:['bodyweight','weighted_vest'],d:'bodyweight',c:false}],coeffs:[{a:'grip_orientation',v:'pronated',t:'x'}]},
  "romanian deadlift": {name:"Romanian Deadlift",axes:[{a:'bar_type',v:['straight_barbell','dumbbell','trap_bar'],d:'straight_barbell',c:false},{a:'stance',v:['shoulder','sumo'],d:'shoulder',c:false},{a:'rom',v:['full','partial_top'],d:'full',c:false}],coeffs:[{a:'bar_type',v:'dumbbell',t:'x'}]},
  "rope pushdown": {name:"Rope Pushdown",axes:[{a:'attachment',v:['rope','straight_bar','ez_bar','v_bar','single_d'],d:'rope',c:true},{a:'pulley_height',v:['high','overhead'],d:'high',c:false},{a:'grip_orientation',v:['neutral','pronated'],d:'neutral',c:false}],coeffs:[{a:'attachment',v:'rope',t:'x'}]},
  "rope tricep pushdown": {name:"Rope Tricep Pushdown",axes:[{a:'attachment',v:['rope','straight_bar','v_bar','single_d'],d:'rope',c:true},{a:'pulley_height',v:['overhead','high'],d:'overhead',c:false}],coeffs:[{a:'attachment',v:'rope',t:'x'}]},
  "russian twist": {name:"Russian Twist",axes:[{a:'load_mode',v:['bodyweight','straight_weight'],d:'bodyweight',c:false}],coeffs:[]},
  "seal row": {name:"Seal Row",axes:[{a:'grip_width',v:['close','shoulder','wide'],d:'shoulder',c:false},{a:'grip_orientation',v:['pronated','neutral','supinated'],d:'pronated',c:false},{a:'bar_type',v:['straight_barbell','dumbbell','ez_bar'],d:'straight_barbell',c:false}],coeffs:[]},
  "seated barbell press": {name:"Seated Barbell Press",axes:[{a:'grip_width',v:['shoulder','medium','wide'],d:'shoulder',c:false},{a:'bar_type',v:['straight_barbell','smith'],d:'straight_barbell',c:false}],coeffs:[{a:'body_position',v:'seated',t:'x'}]},
  "seated cable row": {name:"Seated Cable Row",axes:[{a:'attachment',v:['v_bar','straight_bar','rope','single_d','dual_d','lat_bar_wide'],d:'v_bar',c:true},{a:'grip_orientation',v:['neutral','pronated','supinated'],d:'neutral',c:false},{a:'pulley_height',v:['floor','knee'],d:'floor',c:false}],coeffs:[{a:'attachment',v:'straight_bar',t:'p'}]},
  "seated calf raise": {name:"Seated Calf Raise",axes:[{a:'rom',v:['full','partial_top'],d:'full',c:false},{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[]},
  "seated leg curl": {name:"Seated Leg Curl",axes:[{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[{a:'body_position',v:'seated',t:'x'}]},
  "shrug barbell": {name:"Shrug (Barbell)",axes:[{a:'grip_width',v:['shoulder','medium','wide'],d:'shoulder',c:false},{a:'grip_orientation',v:['pronated','mixed','hook'],d:'pronated',c:false},{a:'load_mode',v:['straight_weight','banded','chains'],d:'straight_weight',c:false}],coeffs:[{a:'grip_width',v:'wide',t:'x'}]},
  "shrug dumbbell": {name:"Shrug (Dumbbell)",axes:[{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false},{a:'rom',v:['full','partial_top'],d:'full',c:false}],coeffs:[{a:'bar_type',v:'dumbbell',t:'x'}]},
  "side plank": {name:"Side Plank",axes:[{a:'laterality',v:['unilateral'],d:'unilateral',c:false},{a:'rom',v:['full','paused'],d:'full',c:false},{a:'load_mode',v:['bodyweight','weighted_vest'],d:'bodyweight',c:false}],coeffs:[]},
  "single arm dumbbell row": {name:"Single-Arm Dumbbell Row",axes:[{a:'laterality',v:['unilateral'],d:'unilateral',c:false},{a:'body_position',v:['bent_over','chest_supported'],d:'bent_over',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "single leg calf raise": {name:"Single-Leg Calf Raise",axes:[{a:'laterality',v:['unilateral','bilateral'],d:'unilateral',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "single leg hip thrust": {name:"Single-Leg Hip Thrust",axes:[{a:'load_mode',v:['bodyweight','straight_weight','banded'],d:'bodyweight',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "single leg romanian deadlift": {name:"Single-Leg Romanian Deadlift",axes:[{a:'bar_type',v:['dumbbell','kettlebell'],d:'dumbbell',c:false},{a:'load_mode',v:['straight_weight','bodyweight'],d:'straight_weight',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "sissy squat": {name:"Sissy Squat",axes:[{a:'load_mode',v:['bodyweight','weighted_vest','assisted'],d:'bodyweight',c:false},{a:'rom',v:['full','partial_bottom'],d:'full',c:false}],coeffs:[]},
  "ski erg": {name:"Ski Erg",axes:[{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false}],coeffs:[]},
  "skull crusher": {name:"Skull Crusher",axes:[{a:'bar_type',v:['ez_bar','straight_barbell','dumbbell','swiss_bar'],d:'ez_bar',c:false},{a:'bench_angle',v:['flat','decline','incline_15'],d:'flat',c:false},{a:'grip_width',v:['close','medium'],d:'close',c:false}],coeffs:[{a:'bar_type',v:'straight_barbell',t:'x'},{a:'bar_type',v:'dumbbell',t:'x'}]},
  "sled pull": {name:"Sled Pull",axes:[{a:'body_position',v:['standing','bent_over'],d:'standing',c:false},{a:'attachment',v:['sled_strap','rope','single_d'],d:'sled_strap',c:true},{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false}],coeffs:[]},
  "smith machine bench press": {name:"Smith Machine Bench Press",axes:[{a:'bar_type',v:['smith','straight_barbell'],d:'smith',c:false},{a:'bench_angle',v:['decline','flat','incline_15','incline_30','incline_45'],d:'flat',c:false},{a:'grip_width',v:['close','medium','wide'],d:'medium',c:false}],coeffs:[{a:'bar_type',v:'smith',t:'x'}]},
  "smith machine shoulder press": {name:"Smith Machine Shoulder Press",axes:[{a:'body_position',v:['seated','standing'],d:'seated',c:false},{a:'grip_width',v:['shoulder','wide'],d:'shoulder',c:false}],coeffs:[{a:'bar_type',v:'smith',t:'x'}]},
  "smith machine squat": {name:"Smith Machine Squat",axes:[{a:'stance',v:['shoulder','narrow','wide','sumo'],d:'shoulder',c:false},{a:'bar_type',v:['smith'],d:'smith',c:false}],coeffs:[{a:'bar_type',v:'smith',t:'x'}]},
  "spider curl": {name:"Spider Curl",axes:[{a:'bar_type',v:['ez_bar','straight_barbell','dumbbell'],d:'ez_bar',c:false},{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false}],coeffs:[{a:'bar_type',v:'ez_bar',t:'p'}]},
  "standing calf raise": {name:"Standing Calf Raise",axes:[{a:'bar_type',v:['machine','smith','dumbbell'],d:'machine',c:false},{a:'rom',v:['full','partial_top'],d:'full',c:false},{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false}],coeffs:[{a:'laterality',v:'unilateral',t:'x'}]},
  "stationary bike": {name:"Stationary Bike",axes:[{a:'body_position',v:['seated','standing'],d:'seated',c:false}],coeffs:[]},
  "step up": {name:"Step-Up",axes:[{a:'stance',v:['low_platform','high_platform'],d:'low_platform',c:true},{a:'laterality',v:['alternating','unilateral'],d:'alternating',c:false},{a:'load_mode',v:['bodyweight','straight_weight','weighted_vest'],d:'straight_weight',c:false}],coeffs:[{a:'stance',v:'high_platform',t:'x'}]},
  "stiff leg deadlift": {name:"Stiff-Leg Deadlift",axes:[{a:'bar_type',v:['straight_barbell','dumbbell','trap_bar'],d:'straight_barbell',c:false},{a:'stance',v:['narrow','shoulder','wide'],d:'shoulder',c:false},{a:'rom',v:['full','deficit','block','paused'],d:'full',c:false}],coeffs:[{a:'rom',v:'deficit',t:'x'}]},
  "straight arm pulldown": {name:"Straight-Arm Pulldown",axes:[{a:'attachment',v:['straight_bar','rope','lat_bar_wide'],d:'straight_bar',c:true},{a:'pulley_height',v:['high','overhead'],d:'high',c:false},{a:'grip_orientation',v:['pronated','neutral'],d:'pronated',c:false}],coeffs:[{a:'attachment',v:'rope',t:'p'}]},
  "suitcase carry": {name:"Suitcase Carry",axes:[{a:'laterality',v:['unilateral','alternating'],d:'unilateral',c:false},{a:'bar_type',v:['dumbbell','kettlebell'],d:'dumbbell',c:false}],coeffs:[]},
  "sumo deadlift": {name:"Sumo Deadlift",axes:[],coeffs:[{a:'stance',v:'sumo',t:'p'}]},
  "t bar row": {name:"T-Bar Row",axes:[{a:'attachment',v:['v_bar','straight_bar','single_d','dual_d'],d:'v_bar',c:true},{a:'grip_orientation',v:['neutral','pronated'],d:'neutral',c:false}],coeffs:[{a:'attachment',v:'straight_bar',t:'x'}]},
  "thoracic spine rotation": {name:"Thoracic Spine Rotation",axes:[{a:'body_position',v:['kneeling','seated'],d:'kneeling',c:false}],coeffs:[]},
  "thruster": {name:"Thruster",axes:[{a:'bar_type',v:['straight_barbell','dumbbell','kettlebell'],d:'straight_barbell',c:false}],coeffs:[{a:'bar_type',v:'dumbbell',t:'x'}]},
  "tibialis raise": {name:"Tibialis Raise",axes:[{a:'stance',v:['shoulder','staggered'],d:'shoulder',c:false},{a:'laterality',v:['bilateral','unilateral'],d:'bilateral',c:false},{a:'load_mode',v:['bodyweight','banded','straight_weight'],d:'bodyweight',c:false}],coeffs:[]},
  "toes to bar": {name:"Toes-to-Bar",axes:[{a:'load_mode',v:['bodyweight','weighted_vest'],d:'bodyweight',c:false}],coeffs:[]},
  "trap bar deadlift": {name:"Trap-Bar Deadlift",axes:[{a:'load_mode',v:['straight_weight','chains'],d:'straight_weight',c:false},{a:'stance',v:['narrow','shoulder','wide'],d:'shoulder',c:false},{a:'rom',v:['full','block'],d:'full',c:false}],coeffs:[{a:'bar_type',v:'trap_bar',t:'x'}]},
  "trap bar jump": {name:"Trap-Bar Jump",axes:[{a:'load_mode',v:['bodyweight','straight_weight'],d:'straight_weight',c:false}],coeffs:[]},
  "tricep dip machine": {name:"Tricep Dip Machine",axes:[{a:'grip_orientation',v:['neutral','pronated'],d:'neutral',c:false}],coeffs:[]},
  "triceps kickback": {name:"Triceps Kickback",axes:[{a:'bar_type',v:['dumbbell','machine'],d:'dumbbell',c:false},{a:'attachment',v:['single_d','stirrup'],d:'single_d',c:true},{a:'body_position',v:['bent_over','chest_supported'],d:'bent_over',c:false},{a:'laterality',v:['unilateral','bilateral'],d:'unilateral',c:false}],coeffs:[]},
  "triceps pushdown": {name:"Triceps Pushdown",axes:[{a:'attachment',v:['straight_bar','rope','v_bar','ez_bar','single_d'],d:'straight_bar',c:true},{a:'grip_orientation',v:['pronated','supinated','neutral'],d:'pronated',c:false},{a:'pulley_height',v:['high','overhead'],d:'high',c:false}],coeffs:[{a:'attachment',v:'rope',t:'x'},{a:'grip_orientation',v:'supinated',t:'x'}]},
  "turkish get up": {name:"Turkish Get-Up",axes:[{a:'bar_type',v:['kettlebell','dumbbell'],d:'kettlebell',c:false}],coeffs:[{a:'bar_type',v:'dumbbell',t:'x'}]},
  "upright row": {name:"Upright Row",axes:[{a:'grip_width',v:['close','shoulder','wide'],d:'shoulder',c:false},{a:'bar_type',v:['straight_barbell','ez_bar','dumbbell'],d:'straight_barbell',c:false},{a:'attachment',v:['straight_bar','rope'],d:'straight_bar',c:true}],coeffs:[{a:'grip_width',v:'close',t:'x'}]},
  "walking lunge": {name:"Walking Lunge",axes:[{a:'bar_type',v:['dumbbell','straight_barbell','kettlebell','trap_bar'],d:'dumbbell',c:false},{a:'load_mode',v:['straight_weight','bodyweight','weighted_vest'],d:'straight_weight',c:false},{a:'laterality',v:['alternating'],d:'alternating',c:false}],coeffs:[]},
  "weighted dip": {name:"Weighted Dip",axes:[{a:'load_mode',v:['weighted_vest','straight_weight','bodyweight','assisted'],d:'straight_weight',c:false},{a:'grip_orientation',v:['neutral','pronated'],d:'neutral',c:false}],coeffs:[]},
  "weighted pull up": {name:"Weighted Pull-Up",axes:[{a:'load_mode',v:['bodyweight','weighted'],d:'weighted',c:false},{a:'grip_orientation',v:['pronated','supinated','neutral'],d:'pronated',c:false}],coeffs:[{a:'load_mode',v:'weighted',t:'x'}]},
  "wide grip lat pulldown": {name:"Wide-Grip Lat Pulldown",axes:[{a:'grip_width',v:['close','shoulder','medium','wide','extra_wide'],d:'wide',c:false},{a:'attachment',v:['lat_bar_wide','straight_bar','v_bar'],d:'lat_bar_wide',c:true}],coeffs:[{a:'grip_width',v:'wide',t:'x'}]},
  "wide grip pull up": {name:"Wide-Grip Pull-Up",axes:[{a:'grip_width',v:['close','shoulder','medium','wide','extra_wide'],d:'medium',c:false},{a:'grip_orientation',v:['pronated','supinated','neutral','mixed'],d:'pronated',c:false},{a:'load_mode',v:['bodyweight','weighted_vest','assisted'],d:'bodyweight',c:false}],coeffs:[{a:'grip_width',v:'wide',t:'x'}]},
  "wrist curl": {name:"Wrist Curl",axes:[{a:'grip_orientation',v:['supinated','pronated'],d:'supinated',c:false},{a:'bar_type',v:['straight_barbell','ez_bar','dumbbell'],d:'straight_barbell',c:false},{a:'body_position',v:['seated','kneeling'],d:'seated',c:false}],coeffs:[{a:'grip_orientation',v:'pronated',t:'x'}]},
  "wrist roller": {name:"Wrist Roller",axes:[{a:'grip_orientation',v:['pronated','supinated','neutral'],d:'pronated',c:false}],coeffs:[]},
  "zottman curl": {name:"Zottman Curl",axes:[{a:'laterality',v:['bilateral','alternating'],d:'bilateral',c:false}],coeffs:[]},
};

/** Spec for an exercise by display name, or null when it has no qualifiers. */
export function qualifierSpecForExercise(
  name: string | null | undefined,
): ExerciseQualifierSpec | null {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  return EXERCISE_QUALIFIERS[key] ?? null;
}

/** This exercise's default value per axis — the input to canonicalQualifierKey. */
export function defaultsForExercise(name: string | null | undefined): Record<string, string> {
  const spec = qualifierSpecForExercise(name);
  if (!spec) return {};
  const out: Record<string, string> = {};
  for (const a of spec.axes) out[a.a] = a.d;
  return out;
}
