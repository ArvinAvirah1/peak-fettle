// catalog.ts — Engine v2 exercise catalogue (typed port of catalog.mjs).
// -----------------------------------------------------------------------------
// Distilled from mobile/src/lib/trainingEngine/exerciseCatalog.ts, EXTENDED with:
//   • primaryMuscle / muscles[]  — for the per-muscle volume model
//   • is_compound                — role hint (compound vs isolation)
//   • contraindications[]        — region tokens that BLOCK this exercise
//   • safeFor[]                  — region tokens this exercise is a SAFER SWAP for
//   • plyo / power flags         — for athletic & team-sport branches
// Vocabularies match the app: movement_pattern (closed set), equipment (closed set),
// injury region tokens (lower_back, knees, shoulders, wrists, elbows, ankles, neck,
// hip, upper_back). IDs are deterministic (name-hashed) — display/sequencing only.
// -----------------------------------------------------------------------------

import type { CatalogExerciseV2, MovementPattern, MuscleBucket, MuscleRegion } from './types';

// Deterministic name-hashed id (FNV-1a). No clock/random — display/sequencing only.
function localId(name: string): string {
  let h = 0x811c9dc5;
  const s = `pf-v2:${name.toLowerCase()}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'ex_' + (h >>> 0).toString(16).padStart(8, '0');
}

interface RawExercise {
  name: string;
  pattern: MovementPattern;
  is_compound?: boolean;
  power?: boolean;
  plyo?: boolean;
  equipment: string[];
  primary: MuscleBucket;
  muscles: string[];
  contra?: string[];
  safeFor?: string[];
  // Stage 3 (addendum §5): region-level target for quick-swap ranking. Chosen
  // per standard exercise science — incline press -> upper_chest, flat press ->
  // mid_chest, dips/decline -> lower_chest, rows split lats vs mid_back by pull
  // angle, etc. Read ONLY by quickSwap.ts; the engine never reads it.
  region: MuscleRegion;
}

// muscles[] uses canonical labels (see MuscleBucket). primaryMuscle drives the
// volume tally (1.0); synergists count 0.5 (RESEARCH.md §1.1 counting convention).
const RAW: RawExercise[] = [
  // ── squat pattern ──
  { name: 'Back Squat', region: 'quads', pattern: 'squat', is_compound: true, equipment: ['barbell', 'rack'], primary: 'quads', muscles: ['quads', 'glutes', 'hamstrings'], contra: ['knees', 'lower_back'], safeFor: [] },
  { name: 'Front Squat', region: 'quads', pattern: 'squat', is_compound: true, equipment: ['barbell', 'rack'], primary: 'quads', muscles: ['quads', 'glutes'], contra: ['knees', 'wrists'], safeFor: ['lower_back'] },
  { name: 'Box Squat', region: 'quads', pattern: 'squat', is_compound: true, equipment: ['barbell', 'rack', 'bench'], primary: 'quads', muscles: ['quads', 'glutes', 'hamstrings'], contra: [], safeFor: ['knees', 'hip'] },
  { name: 'Leg Press', region: 'quads', pattern: 'squat', is_compound: true, equipment: ['machine'], primary: 'quads', muscles: ['quads', 'glutes'], contra: [], safeFor: ['lower_back', 'knees'] },
  { name: 'Goblet Squat', region: 'quads', pattern: 'squat', is_compound: true, equipment: ['dumbbell', 'kettlebell'], primary: 'quads', muscles: ['quads', 'glutes'], contra: [], safeFor: ['lower_back'] },
  { name: 'Bodyweight Squat', region: 'quads', pattern: 'squat', is_compound: true, equipment: ['bodyweight'], primary: 'quads', muscles: ['quads', 'glutes'], contra: [], safeFor: ['knees'] },
  { name: 'Belt Squat', region: 'quads', pattern: 'squat', is_compound: true, equipment: ['machine'], primary: 'quads', muscles: ['quads', 'glutes'], contra: [], safeFor: ['lower_back'] },

  // ── hinge pattern ──
  { name: 'Conventional Deadlift', region: 'hamstrings', pattern: 'hinge', is_compound: true, equipment: ['barbell'], primary: 'hamstrings', muscles: ['hamstrings', 'glutes', 'back'], contra: ['lower_back'], safeFor: [] },
  { name: 'Trap-Bar Deadlift', region: 'hamstrings', pattern: 'hinge', is_compound: true, equipment: ['barbell'], primary: 'hamstrings', muscles: ['hamstrings', 'glutes', 'quads', 'back'], contra: [], safeFor: ['lower_back'] },
  { name: 'Romanian Deadlift', region: 'hamstrings', pattern: 'hinge', is_compound: true, equipment: ['barbell', 'dumbbell'], primary: 'hamstrings', muscles: ['hamstrings', 'glutes'], contra: ['lower_back'], safeFor: [] },
  { name: 'Hip Thrust', region: 'glutes', pattern: 'hinge', is_compound: true, equipment: ['barbell', 'bench'], primary: 'glutes', muscles: ['glutes', 'hamstrings'], contra: [], safeFor: ['lower_back', 'knees'] },
  { name: 'Glute Bridge', region: 'glutes', pattern: 'hinge', is_compound: true, equipment: ['barbell', 'bodyweight'], primary: 'glutes', muscles: ['glutes', 'hamstrings'], contra: [], safeFor: ['lower_back', 'knees'] },
  { name: 'Cable Pull-Through', region: 'glutes', pattern: 'hinge', is_compound: false, equipment: ['cable', 'machine'], primary: 'glutes', muscles: ['glutes', 'hamstrings'], contra: [], safeFor: ['lower_back'] },
  { name: 'Kettlebell Swing', region: 'glutes', pattern: 'hinge', is_compound: true, equipment: ['kettlebell'], primary: 'glutes', muscles: ['glutes', 'hamstrings'], contra: ['lower_back'], safeFor: [] },

  // ── lunge / unilateral ──
  { name: 'Bulgarian Split Squat', region: 'quads', pattern: 'lunge', is_compound: true, equipment: ['dumbbell', 'bench'], primary: 'quads', muscles: ['quads', 'glutes'], contra: ['knees'], safeFor: [] },
  { name: 'Front-Foot-Elevated Split Squat', region: 'quads', pattern: 'lunge', is_compound: true, equipment: ['dumbbell'], primary: 'quads', muscles: ['quads', 'glutes'], contra: [], safeFor: ['lower_back', 'knees'] },
  { name: 'Walking Lunge', region: 'quads', pattern: 'lunge', is_compound: true, equipment: ['dumbbell', 'bodyweight'], primary: 'quads', muscles: ['quads', 'glutes'], contra: ['knees'], safeFor: [] },
  { name: 'Step-Up', region: 'quads', pattern: 'lunge', is_compound: true, equipment: ['dumbbell', 'bench'], primary: 'quads', muscles: ['quads', 'glutes'], contra: [], safeFor: ['knees', 'lower_back'] },
  { name: 'Reverse Lunge', region: 'glutes', pattern: 'lunge', is_compound: true, equipment: ['dumbbell', 'bodyweight'], primary: 'quads', muscles: ['quads', 'glutes'], contra: [], safeFor: ['knees'] },

  // ── horizontal_push ──
  { name: 'Bench Press', region: 'mid_chest', pattern: 'horizontal_push', is_compound: true, equipment: ['barbell', 'bench', 'rack'], primary: 'chest', muscles: ['chest', 'triceps', 'front_delts'], contra: ['shoulders', 'wrists'], safeFor: [] },
  { name: 'Close-Grip Bench Press', region: 'mid_chest', pattern: 'horizontal_push', is_compound: true, equipment: ['barbell', 'bench'], primary: 'chest', muscles: ['chest', 'triceps'], contra: ['wrists'], safeFor: ['shoulders'] },
  { name: 'Floor Press', region: 'mid_chest', pattern: 'horizontal_push', is_compound: true, equipment: ['barbell', 'dumbbell'], primary: 'chest', muscles: ['chest', 'triceps'], contra: [], safeFor: ['shoulders'] },
  { name: 'Dumbbell Bench Press', region: 'mid_chest', pattern: 'horizontal_push', is_compound: true, equipment: ['dumbbell', 'bench'], primary: 'chest', muscles: ['chest', 'triceps', 'front_delts'], contra: ['shoulders'], safeFor: [] },
  { name: 'Neutral-Grip DB Press', region: 'mid_chest', pattern: 'horizontal_push', is_compound: true, equipment: ['dumbbell', 'bench'], primary: 'chest', muscles: ['chest', 'triceps'], contra: [], safeFor: ['shoulders', 'wrists'] },
  { name: 'Machine Chest Press', region: 'mid_chest', pattern: 'horizontal_push', is_compound: true, equipment: ['machine'], primary: 'chest', muscles: ['chest', 'triceps'], contra: [], safeFor: ['shoulders'] },
  { name: 'Push-Up', region: 'mid_chest', pattern: 'horizontal_push', is_compound: true, equipment: ['bodyweight'], primary: 'chest', muscles: ['chest', 'triceps'], contra: ['wrists'], safeFor: [] },

  // ── vertical_push ──
  { name: 'Overhead Press', region: 'front_delt', pattern: 'vertical_push', is_compound: true, equipment: ['barbell', 'rack'], primary: 'shoulders', muscles: ['shoulders', 'front_delts', 'triceps'], contra: ['shoulders', 'lower_back'], safeFor: [] },
  { name: 'Landmine Press', region: 'front_delt', pattern: 'vertical_push', is_compound: true, equipment: ['barbell'], primary: 'shoulders', muscles: ['shoulders', 'front_delts', 'triceps'], contra: [], safeFor: ['shoulders'] },
  { name: 'Neutral-Grip DB Shoulder Press', region: 'front_delt', pattern: 'vertical_push', is_compound: true, equipment: ['dumbbell', 'bench'], primary: 'shoulders', muscles: ['shoulders', 'front_delts', 'triceps'], contra: [], safeFor: ['shoulders'] },
  { name: 'Machine Shoulder Press', region: 'front_delt', pattern: 'vertical_push', is_compound: true, equipment: ['machine'], primary: 'shoulders', muscles: ['shoulders', 'triceps'], contra: [], safeFor: ['shoulders'] },
  { name: 'Pike Push-Up', region: 'front_delt', pattern: 'vertical_push', is_compound: true, equipment: ['bodyweight'], primary: 'shoulders', muscles: ['shoulders', 'triceps'], contra: ['shoulders', 'wrists'], safeFor: [] },

  // ── horizontal_pull ──
  { name: 'Barbell Row', region: 'mid_back', pattern: 'horizontal_pull', is_compound: true, equipment: ['barbell'], primary: 'back', muscles: ['back', 'biceps', 'rear_delts'], contra: ['lower_back'], safeFor: [] },
  { name: 'Chest-Supported Row', region: 'mid_back', pattern: 'horizontal_pull', is_compound: true, equipment: ['dumbbell', 'bench', 'machine'], primary: 'back', muscles: ['back', 'biceps', 'rear_delts'], contra: [], safeFor: ['lower_back'] },
  { name: 'Seated Cable Row', region: 'mid_back', pattern: 'horizontal_pull', is_compound: true, equipment: ['cable', 'machine'], primary: 'back', muscles: ['back', 'biceps'], contra: [], safeFor: ['lower_back'] },
  { name: 'Dumbbell Row', region: 'lats', pattern: 'horizontal_pull', is_compound: true, equipment: ['dumbbell', 'bench'], primary: 'back', muscles: ['back', 'biceps'], contra: [], safeFor: ['lower_back'] },
  { name: 'Ring Row', region: 'mid_back', pattern: 'horizontal_pull', is_compound: true, equipment: ['bodyweight', 'rack'], primary: 'back', muscles: ['back', 'biceps'], contra: [], safeFor: ['lower_back', 'shoulders'] },

  // ── vertical_pull ──
  { name: 'Pull-Up', region: 'lats', pattern: 'vertical_pull', is_compound: true, equipment: ['bodyweight', 'pullup_bar'], primary: 'back', muscles: ['back', 'biceps'], contra: ['elbows'], safeFor: [] },
  { name: 'Lat Pulldown', region: 'lats', pattern: 'vertical_pull', is_compound: true, equipment: ['cable', 'machine'], primary: 'back', muscles: ['back', 'biceps'], contra: [], safeFor: ['elbows', 'shoulders'] },
  { name: 'Neutral-Grip Pulldown', region: 'lats', pattern: 'vertical_pull', is_compound: true, equipment: ['cable', 'machine'], primary: 'back', muscles: ['back', 'biceps'], contra: [], safeFor: ['elbows', 'shoulders'] },
  { name: 'Assisted Pull-Up', region: 'lats', pattern: 'vertical_pull', is_compound: true, equipment: ['machine', 'bands'], primary: 'back', muscles: ['back', 'biceps'], contra: [], safeFor: ['elbows'] },

  // ── olympic / power ──
  { name: 'Power Clean', region: 'full_body', pattern: 'olympic', is_compound: true, power: true, equipment: ['barbell'], primary: 'full_body', muscles: ['full_body', 'traps', 'glutes'], contra: ['lower_back', 'wrists', 'knees'], safeFor: [] },
  { name: 'Hang Power Clean', region: 'full_body', pattern: 'olympic', is_compound: true, power: true, equipment: ['barbell'], primary: 'full_body', muscles: ['full_body', 'traps'], contra: ['lower_back', 'wrists'], safeFor: [] },
  { name: 'Push Press', region: 'front_delt', pattern: 'vertical_push', is_compound: true, power: true, equipment: ['barbell', 'rack'], primary: 'shoulders', muscles: ['shoulders', 'triceps', 'quads'], contra: ['shoulders'], safeFor: [] },
  { name: 'Trap-Bar Jump', region: 'quads', pattern: 'olympic', is_compound: true, power: true, equipment: ['barbell'], primary: 'full_body', muscles: ['quads', 'glutes', 'full_body'], contra: [], safeFor: ['lower_back'] },
  { name: 'Medicine Ball Slam', region: 'full_body', pattern: 'olympic', is_compound: true, power: true, equipment: ['bodyweight'], primary: 'full_body', muscles: ['full_body', 'abs'], contra: [], safeFor: [] },

  // ── plyometric ──
  { name: 'Box Jump', region: 'quads', pattern: 'plyometric', is_compound: true, plyo: true, equipment: ['bodyweight'], primary: 'quads', muscles: ['quads', 'glutes'], contra: ['knees', 'ankles'], safeFor: [] },
  { name: 'Broad Jump', region: 'quads', pattern: 'plyometric', is_compound: true, plyo: true, equipment: ['bodyweight'], primary: 'quads', muscles: ['quads', 'glutes', 'hamstrings'], contra: ['knees', 'ankles'], safeFor: [] },
  { name: 'Pogo Hops', region: 'calves', pattern: 'plyometric', is_compound: true, plyo: true, equipment: ['bodyweight'], primary: 'calves', muscles: ['calves', 'quads'], contra: ['ankles'], safeFor: ['knees'] },
  { name: 'Lateral Bound', region: 'glutes', pattern: 'plyometric', is_compound: true, plyo: true, equipment: ['bodyweight'], primary: 'glutes', muscles: ['glutes', 'quads'], contra: ['knees', 'ankles'], safeFor: [] },
  { name: 'Depth Jump', region: 'quads', pattern: 'plyometric', is_compound: true, plyo: true, equipment: ['bodyweight'], primary: 'quads', muscles: ['quads', 'glutes'], contra: ['knees', 'ankles'], safeFor: [] },
  { name: 'Seated Box Jump', region: 'quads', pattern: 'plyometric', is_compound: true, plyo: true, equipment: ['bodyweight', 'bench'], primary: 'quads', muscles: ['quads', 'glutes'], contra: [], safeFor: ['knees', 'ankles'] },

  // ── carry / core ──
  { name: "Farmer's Carry", region: 'forearms', pattern: 'carry', is_compound: true, equipment: ['dumbbell', 'kettlebell'], primary: 'forearms', muscles: ['forearms', 'traps', 'abs'], contra: [], safeFor: [] },
  { name: 'Suitcase Carry', region: 'obliques', pattern: 'carry', is_compound: true, equipment: ['dumbbell', 'kettlebell'], primary: 'abs', muscles: ['abs', 'forearms'], contra: [], safeFor: ['lower_back'] },
  { name: 'Plank', region: 'abs', pattern: 'core', is_compound: false, equipment: ['bodyweight'], primary: 'abs', muscles: ['abs'], contra: [], safeFor: ['lower_back'] },
  { name: 'Hanging Leg Raise', region: 'abs', pattern: 'core', is_compound: false, equipment: ['bodyweight', 'pullup_bar'], primary: 'abs', muscles: ['abs'], contra: [], safeFor: [] },
  { name: 'Cable Crunch', region: 'abs', pattern: 'core', is_compound: false, equipment: ['cable', 'machine'], primary: 'abs', muscles: ['abs'], contra: ['neck'], safeFor: [] },
  { name: 'Dead Bug', region: 'abs', pattern: 'core', is_compound: false, equipment: ['bodyweight'], primary: 'abs', muscles: ['abs'], contra: [], safeFor: ['lower_back', 'neck'] },
  { name: 'Pallof Press', region: 'obliques', pattern: 'core', is_compound: false, equipment: ['cable', 'bands'], primary: 'abs', muscles: ['abs'], contra: [], safeFor: ['lower_back'] },

  // ── isolation: arms ──
  { name: 'Dumbbell Curl', region: 'biceps', pattern: 'isolation_arms', is_compound: false, equipment: ['dumbbell'], primary: 'biceps', muscles: ['biceps'], contra: ['elbows'], safeFor: [] },
  { name: 'Hammer Curl', region: 'biceps', pattern: 'isolation_arms', is_compound: false, equipment: ['dumbbell'], primary: 'biceps', muscles: ['biceps', 'forearms'], contra: [], safeFor: ['elbows', 'wrists'] },
  { name: 'Cable Curl', region: 'biceps', pattern: 'isolation_arms', is_compound: false, equipment: ['cable', 'machine'], primary: 'biceps', muscles: ['biceps'], contra: [], safeFor: ['elbows'] },
  { name: 'Barbell Curl', region: 'biceps', pattern: 'isolation_arms', is_compound: false, equipment: ['barbell'], primary: 'biceps', muscles: ['biceps'], contra: ['elbows', 'wrists'], safeFor: [] },
  { name: 'Rope Tricep Pushdown', region: 'triceps', pattern: 'isolation_arms', is_compound: false, equipment: ['cable', 'machine'], primary: 'triceps', muscles: ['triceps'], contra: [], safeFor: ['elbows'] },
  { name: 'Overhead Cable Extension', region: 'triceps', pattern: 'isolation_arms', is_compound: false, equipment: ['cable'], primary: 'triceps', muscles: ['triceps'], contra: ['elbows'], safeFor: [] },
  { name: 'Band Curl', region: 'biceps', pattern: 'isolation_arms', is_compound: false, equipment: ['bands'], primary: 'biceps', muscles: ['biceps'], contra: [], safeFor: ['elbows'] },

  // ── isolation: shoulders ──
  { name: 'Lateral Raise', region: 'side_delt', pattern: 'isolation_shoulders', is_compound: false, equipment: ['dumbbell'], primary: 'side_delts', muscles: ['side_delts'], contra: [], safeFor: [] },
  { name: 'Cable Lateral Raise', region: 'side_delt', pattern: 'isolation_shoulders', is_compound: false, equipment: ['cable', 'machine'], primary: 'side_delts', muscles: ['side_delts'], contra: [], safeFor: [] },
  { name: 'Face Pull', region: 'rear_delt', pattern: 'isolation_shoulders', is_compound: false, equipment: ['cable', 'bands'], primary: 'rear_delts', muscles: ['rear_delts', 'upper_back'], contra: [], safeFor: ['shoulders'] },
  { name: 'Band Pull-Apart', region: 'rear_delt', pattern: 'isolation_shoulders', is_compound: false, equipment: ['bands'], primary: 'rear_delts', muscles: ['rear_delts', 'upper_back'], contra: [], safeFor: ['shoulders'] },
  { name: 'Reverse Pec Deck', region: 'rear_delt', pattern: 'isolation_shoulders', is_compound: false, equipment: ['machine'], primary: 'rear_delts', muscles: ['rear_delts'], contra: [], safeFor: ['shoulders'] },

  // ── isolation: chest / back / legs / calves ──
  { name: 'Dumbbell Fly', region: 'mid_chest', pattern: 'isolation_chest', is_compound: false, equipment: ['dumbbell', 'bench'], primary: 'chest', muscles: ['chest'], contra: ['shoulders'], safeFor: [] },
  { name: 'Cable Crossover', region: 'mid_chest', pattern: 'isolation_chest', is_compound: false, equipment: ['cable', 'machine'], primary: 'chest', muscles: ['chest'], contra: [], safeFor: ['shoulders'] },
  { name: 'Straight-Arm Pulldown', region: 'lats', pattern: 'isolation_back', is_compound: false, equipment: ['cable', 'machine'], primary: 'back', muscles: ['back'], contra: [], safeFor: ['elbows'] },
  { name: 'Leg Extension', region: 'quads', pattern: 'isolation_legs', is_compound: false, equipment: ['machine'], primary: 'quads', muscles: ['quads'], contra: ['knees'], safeFor: [] },
  { name: 'Leg Curl', region: 'hamstrings', pattern: 'isolation_legs', is_compound: false, equipment: ['machine'], primary: 'hamstrings', muscles: ['hamstrings'], contra: [], safeFor: ['lower_back', 'knees'] },
  { name: 'Nordic Curl', region: 'hamstrings', pattern: 'isolation_legs', is_compound: false, equipment: ['bodyweight'], primary: 'hamstrings', muscles: ['hamstrings'], contra: ['knees'], safeFor: [] },
  { name: 'Standing Calf Raise', region: 'calves', pattern: 'isolation_calves', is_compound: false, equipment: ['machine', 'bodyweight'], primary: 'calves', muscles: ['calves'], contra: ['ankles'], safeFor: [] },
  { name: 'Seated Calf Raise', region: 'calves', pattern: 'isolation_calves', is_compound: false, equipment: ['machine'], primary: 'calves', muscles: ['calves'], contra: [], safeFor: ['ankles'] },
];

export const CATALOG_V2: readonly CatalogExerciseV2[] = Object.freeze(
  RAW.map((e): CatalogExerciseV2 => ({
    id: localId(e.name),
    name: e.name,
    movement_pattern: e.pattern,
    is_compound: !!e.is_compound,
    equipment: e.equipment,
    primaryMuscle: e.primary,
    muscles: e.muscles,
    contraindications: e.contra || [],
    safeFor: e.safeFor || [],
    plyo: !!e.plyo,
    power: !!e.power,
    region: e.region,
  }))
);

export function getCatalogV2(): readonly CatalogExerciseV2[] {
  return CATALOG_V2;
}
