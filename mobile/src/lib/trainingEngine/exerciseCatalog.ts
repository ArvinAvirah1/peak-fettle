// exerciseCatalog.ts — Training Engine v1 (mobile, on-device)
// -----------------------------------------------------------------------------
// A compact, dependency-free exercise catalogue so the engine can fill slots
// ENTIRELY ON-DEVICE — no /exercises round-trip. This is the local-first source
// the engine consumes for ALL tiers when generating a plan from the phone.
//
// Why this file exists:
//   exerciseFill() needs an `exercises[]` array shaped { movement_pattern,
//   equipment, contraindications, is_compound, … }. That taxonomy lives only on
//   the server's exercises table; there is no on-device catalogue. Without it,
//   every slot is dropped and a generated plan has zero exercises. This bundle
//   covers every movement_pattern the templates reference (17 patterns) with a
//   couple of equipment variants each, so a plan always fills.
//
// Vocabularies (kept consistent so the engine's filters actually bite):
//   • movement_pattern — the 17 enum values used in templates.ts.
//   • equipment        — the survey EquipmentItem set (barbell, dumbbell,
//                        kettlebell, machine, cable, bodyweight, bench, rack,
//                        pullup_bar, bands, …). equipmentCompatible() keeps an
//                        exercise when ANY of its equipment ∈ the user profile.
//   • contraindications — the PRESET_CONSTRAINTS region tokens from the profile
//                        screen (lower_back, knees, shoulders, wrists, ankles,
//                        neck, hip, upper_back, elbows). isContraindicated()
//                        drops an exercise when one of these matches an active
//                        user constraint_type.
//
// IDs are stable, valid UUID v4 strings (deterministic per name) but are
// engine-local — they are NOT guaranteed to be rows in the production exercises
// table, so they are for display/sequencing only, never for logging a set.
// -----------------------------------------------------------------------------

import type { Exercise } from './exerciseFill';

// A namespaced, deterministic UUID v4 so the same name always yields the same id
// (helps de-dup if this catalogue is ever merged with server exercises by id).
function localUuid(name: string): string {
  const str = `pf-engine-catalog:${name.toLowerCase()}`;
  // FNV-1a 32-bit, expanded into 128 bits via a small xorshift, formatted v4.
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const rng = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const hex = (n: number) =>
    Math.floor(rng() * 16 ** n)
      .toString(16)
      .padStart(n, '0');
  // version 4, variant 8-b
  const y = '89ab'[Math.floor(rng() * 4)];
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${y}${hex(3)}-${hex(8)}${hex(4)}`;
}

interface CatalogEntry {
  name: string;
  movement_pattern: string;
  is_compound: boolean;
  equipment: string[];
  muscle_groups: string[];
  contraindications: string[];
}

// The raw catalogue. ≥2 equipment variants for the major compound patterns so a
// constrained equipment profile (e.g. dumbbell-only) still fills the slot.
const RAW: CatalogEntry[] = [
  // ── squat ──
  { name: 'Back Squat', movement_pattern: 'squat', is_compound: true, equipment: ['barbell', 'rack'], muscle_groups: ['quads', 'glutes', 'hamstrings'], contraindications: ['knees', 'lower_back'] },
  { name: 'Goblet Squat', movement_pattern: 'squat', is_compound: true, equipment: ['dumbbell', 'kettlebell'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'] },
  { name: 'Leg Press', movement_pattern: 'squat', is_compound: true, equipment: ['machine'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'] },
  { name: 'Bodyweight Squat', movement_pattern: 'squat', is_compound: true, equipment: ['bodyweight'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'] },

  // ── hinge ──
  { name: 'Conventional Deadlift', movement_pattern: 'hinge', is_compound: true, equipment: ['barbell'], muscle_groups: ['hamstrings', 'glutes', 'back'], contraindications: ['lower_back'] },
  { name: 'Romanian Deadlift', movement_pattern: 'hinge', is_compound: true, equipment: ['barbell', 'dumbbell'], muscle_groups: ['hamstrings', 'glutes'], contraindications: ['lower_back'] },
  { name: 'Kettlebell Swing', movement_pattern: 'hinge', is_compound: true, equipment: ['kettlebell'], muscle_groups: ['hamstrings', 'glutes'], contraindications: ['lower_back'] },
  { name: 'Hip Thrust', movement_pattern: 'hinge', is_compound: true, equipment: ['barbell', 'bench'], muscle_groups: ['glutes', 'hamstrings'], contraindications: [] },

  // ── lunge ──
  { name: 'Walking Lunge', movement_pattern: 'lunge', is_compound: true, equipment: ['dumbbell', 'bodyweight'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'] },
  { name: 'Bulgarian Split Squat', movement_pattern: 'lunge', is_compound: true, equipment: ['dumbbell', 'bench'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'] },
  { name: 'Reverse Lunge', movement_pattern: 'lunge', is_compound: true, equipment: ['barbell', 'bodyweight'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'] },

  // ── horizontal_push ──
  { name: 'Bench Press', movement_pattern: 'horizontal_push', is_compound: true, equipment: ['barbell', 'bench', 'rack'], muscle_groups: ['chest', 'triceps', 'shoulders'], contraindications: ['shoulders', 'wrists'] },
  { name: 'Dumbbell Bench Press', movement_pattern: 'horizontal_push', is_compound: true, equipment: ['dumbbell', 'bench'], muscle_groups: ['chest', 'triceps'], contraindications: ['shoulders'] },
  { name: 'Push-Up', movement_pattern: 'horizontal_push', is_compound: true, equipment: ['bodyweight'], muscle_groups: ['chest', 'triceps'], contraindications: ['wrists'] },
  { name: 'Machine Chest Press', movement_pattern: 'horizontal_push', is_compound: true, equipment: ['machine'], muscle_groups: ['chest', 'triceps'], contraindications: ['shoulders'] },

  // ── vertical_push ──
  { name: 'Overhead Press', movement_pattern: 'vertical_push', is_compound: true, equipment: ['barbell', 'rack'], muscle_groups: ['shoulders', 'triceps'], contraindications: ['shoulders', 'lower_back'] },
  { name: 'Dumbbell Shoulder Press', movement_pattern: 'vertical_push', is_compound: true, equipment: ['dumbbell', 'bench'], muscle_groups: ['shoulders', 'triceps'], contraindications: ['shoulders'] },
  { name: 'Pike Push-Up', movement_pattern: 'vertical_push', is_compound: true, equipment: ['bodyweight'], muscle_groups: ['shoulders', 'triceps'], contraindications: ['shoulders', 'wrists'] },

  // ── horizontal_pull ──
  { name: 'Barbell Row', movement_pattern: 'horizontal_pull', is_compound: true, equipment: ['barbell'], muscle_groups: ['back', 'biceps'], contraindications: ['lower_back'] },
  { name: 'Dumbbell Row', movement_pattern: 'horizontal_pull', is_compound: true, equipment: ['dumbbell', 'bench'], muscle_groups: ['back', 'biceps'], contraindications: [] },
  { name: 'Seated Cable Row', movement_pattern: 'horizontal_pull', is_compound: true, equipment: ['cable', 'machine'], muscle_groups: ['back', 'biceps'], contraindications: [] },
  { name: 'Inverted Row', movement_pattern: 'horizontal_pull', is_compound: true, equipment: ['bodyweight', 'rack'], muscle_groups: ['back', 'biceps'], contraindications: [] },

  // ── vertical_pull ──
  { name: 'Pull-Up', movement_pattern: 'vertical_pull', is_compound: true, equipment: ['bodyweight', 'pullup_bar'], muscle_groups: ['back', 'biceps'], contraindications: ['elbows'] },
  { name: 'Lat Pulldown', movement_pattern: 'vertical_pull', is_compound: true, equipment: ['cable', 'machine'], muscle_groups: ['back', 'biceps'], contraindications: [] },
  { name: 'Assisted Pull-Up', movement_pattern: 'vertical_pull', is_compound: true, equipment: ['machine', 'bands'], muscle_groups: ['back', 'biceps'], contraindications: [] },

  // ── olympic ──
  { name: 'Power Clean', movement_pattern: 'olympic', is_compound: true, equipment: ['barbell'], muscle_groups: ['full_body'], contraindications: ['lower_back', 'wrists', 'knees'] },
  { name: 'Hang Snatch', movement_pattern: 'olympic', is_compound: true, equipment: ['barbell'], muscle_groups: ['full_body'], contraindications: ['lower_back', 'shoulders', 'wrists'] },
  { name: 'Kettlebell Clean', movement_pattern: 'olympic', is_compound: true, equipment: ['kettlebell'], muscle_groups: ['full_body'], contraindications: ['lower_back', 'wrists'] },

  // ── plyometric ──
  { name: 'Box Jump', movement_pattern: 'plyometric', is_compound: true, equipment: ['bodyweight'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees', 'ankles'] },
  { name: 'Broad Jump', movement_pattern: 'plyometric', is_compound: true, equipment: ['bodyweight'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees', 'ankles'] },

  // ── carry ──
  { name: "Farmer's Carry", movement_pattern: 'carry', is_compound: true, equipment: ['dumbbell', 'kettlebell'], muscle_groups: ['grip', 'core'], contraindications: [] },
  { name: 'Suitcase Carry', movement_pattern: 'carry', is_compound: true, equipment: ['dumbbell', 'kettlebell'], muscle_groups: ['core', 'grip'], contraindications: [] },

  // ── core ──
  { name: 'Plank', movement_pattern: 'core', is_compound: false, equipment: ['bodyweight'], muscle_groups: ['core'], contraindications: [] },
  { name: 'Hanging Leg Raise', movement_pattern: 'core', is_compound: false, equipment: ['bodyweight', 'pullup_bar'], muscle_groups: ['core'], contraindications: [] },
  { name: 'Cable Crunch', movement_pattern: 'core', is_compound: false, equipment: ['cable', 'machine'], muscle_groups: ['core'], contraindications: ['neck'] },
  { name: 'Dead Bug', movement_pattern: 'core', is_compound: false, equipment: ['bodyweight'], muscle_groups: ['core'], contraindications: [] },

  // ── isolation_arms ──
  { name: 'Dumbbell Curl', movement_pattern: 'isolation_arms', is_compound: false, equipment: ['dumbbell'], muscle_groups: ['biceps'], contraindications: ['elbows'] },
  { name: 'Cable Tricep Pushdown', movement_pattern: 'isolation_arms', is_compound: false, equipment: ['cable', 'machine'], muscle_groups: ['triceps'], contraindications: ['elbows'] },
  { name: 'Barbell Curl', movement_pattern: 'isolation_arms', is_compound: false, equipment: ['barbell'], muscle_groups: ['biceps'], contraindications: ['elbows', 'wrists'] },
  { name: 'Band Curl', movement_pattern: 'isolation_arms', is_compound: false, equipment: ['bands'], muscle_groups: ['biceps'], contraindications: [] },

  // ── isolation_shoulders ──
  { name: 'Lateral Raise', movement_pattern: 'isolation_shoulders', is_compound: false, equipment: ['dumbbell'], muscle_groups: ['shoulders'], contraindications: ['shoulders'] },
  { name: 'Cable Lateral Raise', movement_pattern: 'isolation_shoulders', is_compound: false, equipment: ['cable', 'machine'], muscle_groups: ['shoulders'], contraindications: ['shoulders'] },
  { name: 'Band Pull-Apart', movement_pattern: 'isolation_shoulders', is_compound: false, equipment: ['bands'], muscle_groups: ['shoulders', 'upper_back'], contraindications: [] },

  // ── isolation_chest ──
  { name: 'Dumbbell Fly', movement_pattern: 'isolation_chest', is_compound: false, equipment: ['dumbbell', 'bench'], muscle_groups: ['chest'], contraindications: ['shoulders'] },
  { name: 'Cable Crossover', movement_pattern: 'isolation_chest', is_compound: false, equipment: ['cable', 'machine'], muscle_groups: ['chest'], contraindications: ['shoulders'] },

  // ── isolation_back ──
  { name: 'Straight-Arm Pulldown', movement_pattern: 'isolation_back', is_compound: false, equipment: ['cable', 'machine'], muscle_groups: ['back'], contraindications: [] },
  { name: 'Reverse Dumbbell Fly', movement_pattern: 'isolation_back', is_compound: false, equipment: ['dumbbell', 'bench'], muscle_groups: ['upper_back'], contraindications: [] },

  // ── isolation_legs ──
  { name: 'Leg Extension', movement_pattern: 'isolation_legs', is_compound: false, equipment: ['machine'], muscle_groups: ['quads'], contraindications: ['knees'] },
  { name: 'Leg Curl', movement_pattern: 'isolation_legs', is_compound: false, equipment: ['machine'], muscle_groups: ['hamstrings'], contraindications: [] },
  { name: 'Nordic Curl', movement_pattern: 'isolation_legs', is_compound: false, equipment: ['bodyweight'], muscle_groups: ['hamstrings'], contraindications: ['knees'] },

  // ── isolation_calves ──
  { name: 'Standing Calf Raise', movement_pattern: 'isolation_calves', is_compound: false, equipment: ['machine', 'bodyweight'], muscle_groups: ['calves'], contraindications: ['ankles'] },
  { name: 'Seated Calf Raise', movement_pattern: 'isolation_calves', is_compound: false, equipment: ['machine'], muscle_groups: ['calves'], contraindications: ['ankles'] },
];

/**
 * The on-device exercise catalogue the engine consumes. Frozen so callers can't
 * mutate the shared bundle. Every Exercise has a stable id + the four taxonomy
 * fields exerciseFill() filters on.
 */
export const ENGINE_EXERCISE_CATALOG: Exercise[] = Object.freeze(
  RAW.map((e) => ({
    id: localUuid(e.name),
    name: e.name,
    muscle_groups: e.muscle_groups,
    is_compound: e.is_compound,
    movement_pattern: e.movement_pattern,
    equipment: e.equipment,
    contraindications: e.contraindications,
  }))
) as Exercise[];

/** Convenience accessor (returns the shared frozen array). */
export function getEngineExerciseCatalog(): Exercise[] {
  return ENGINE_EXERCISE_CATALOG;
}

export default ENGINE_EXERCISE_CATALOG;
