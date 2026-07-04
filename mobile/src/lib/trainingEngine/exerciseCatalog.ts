// exerciseCatalog.ts -- Training Engine v1 (mobile, on-device)
// -----------------------------------------------------------------------------
// A compact, dependency-free exercise catalogue so the engine can fill slots
// ENTIRELY ON-DEVICE -- no /exercises round-trip. This is the local-first source
// the engine consumes for ALL tiers when generating a plan from the phone.
//
// Why this file exists:
//   exerciseFill() needs an `exercises[]` array shaped { movement_pattern,
//   equipment, contraindications, is_compound, ... }. That taxonomy lives only on
//   the server's exercises table; there is no on-device catalogue. Without it,
//   every slot is dropped and a generated plan has zero exercises. This bundle
//   covers every movement_pattern the templates reference (17 patterns) with a
//   couple of equipment variants each, so a plan always fills.
//
// Vocabularies (kept consistent so the engine's filters actually bite):
//   - movement_pattern -- the 17 enum values used in templates.ts.
//   - equipment        -- the survey EquipmentItem set (barbell, dumbbell,
//                        kettlebell, machine, cable, bodyweight, bench, rack,
//                        pullup_bar, bands, ...). equipmentCompatible() keeps an
//                        exercise when ANY of its equipment is in the user profile.
//   - contraindications -- the PRESET_CONSTRAINTS region tokens from the profile
//                        screen (lower_back, knees, shoulders, wrists, ankles,
//                        neck, hip, upper_back, elbows). isContraindicated()
//                        drops an exercise when one of these matches an active
//                        user constraint_type.
//
// IDs are stable, valid UUID v4 strings (deterministic per name) but are
// engine-local -- they are NOT guaranteed to be rows in the production exercises
// table, so they are for display/sequencing only, never for logging a set.
//
// TICKET-134 (exercise media v1, added 2026-07-03): every entry also carries
//   - primary_muscles[] / secondary_muscles[] -- REGION KEYS from the
//     MuscleHeatmap taxonomy (mobile/src/components/MuscleHeatmap.tsx REGIONS),
//     NOT the looser `muscle_groups` strings above (those feed the engine's
//     volume/pattern filters and use a different, coarser vocabulary -- e.g.
//     'back', 'shoulders', 'core', 'full_body', 'grip' -- that MuscleHeatmap does
//     not know how to render). The 16 valid region keys are exactly:
//       chest, front_delts, side_delts, rear_delts, biceps, triceps, forearms,
//       abs, obliques, quads, hamstrings, glutes, calves, upper_back, lats,
//       lower_back
//     ExerciseDetailSheet renders primary_muscles with an accent fill and
//     secondary_muscles dimmed, reusing MuscleHeatmap's REGIONS/ALL_REGIONS
//     layout so the highlighted dots land in the same place on the same body
//     outline (no new art).
//   - cues -- EXACTLY 3 short written form cues per exercise. Bulk-authored;
//     COACHING-CLAIM CONTENT -- founder review pass required before ship
//     (these are read by users as instructional advice, not just labels).
//     Static strings only: no network, no schema migration, no personal data.
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

/**
 * MuscleHeatmap region taxonomy -- MUST stay aligned with REGIONS/MIRRORED keys
 * in mobile/src/components/MuscleHeatmap.tsx. Exported so a lint/test can
 * assert every primary_muscles/secondary_muscles entry below is a member.
 */
export const MUSCLE_HEATMAP_REGIONS = [
  'chest', 'front_delts', 'side_delts', 'rear_delts',
  'biceps', 'triceps', 'forearms',
  'abs', 'obliques',
  'quads', 'hamstrings', 'glutes', 'calves',
  'upper_back', 'lats', 'lower_back',
] as const;

export type MuscleHeatmapRegion = (typeof MUSCLE_HEATMAP_REGIONS)[number];

interface CatalogEntry {
  name: string;
  movement_pattern: string;
  is_compound: boolean;
  equipment: string[];
  muscle_groups: string[];
  contraindications: string[];
  /** MuscleHeatmap region keys -- the muscle(s) this lift trains hardest. */
  primary_muscles: MuscleHeatmapRegion[];
  /** MuscleHeatmap region keys -- meaningfully worked but not the driver. */
  secondary_muscles: MuscleHeatmapRegion[];
  /** Exactly 3 short written form cues. Coaching-claim content -- see file header. */
  cues: [string, string, string];
}

// The raw catalogue. >=2 equipment variants for the major compound patterns so a
// constrained equipment profile (e.g. dumbbell-only) still fills the slot.
const RAW: CatalogEntry[] = [
  // -- squat --
  { name: 'Back Squat', movement_pattern: 'squat', is_compound: true, equipment: ['barbell', 'rack'], muscle_groups: ['quads', 'glutes', 'hamstrings'], contraindications: ['knees', 'lower_back'],
    primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings', 'lower_back', 'abs'],
    cues: ['Brace your core and unrack with the bar over mid-foot.', 'Sit hips back and down, keeping knees tracking over your toes.', 'Drive through the whole foot to stand, hips and chest rising together.'] },
  { name: 'Goblet Squat', movement_pattern: 'squat', is_compound: true, equipment: ['dumbbell', 'kettlebell'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'],
    primary_muscles: ['quads', 'glutes'], secondary_muscles: ['abs'],
    cues: ['Hold the weight close to your chest with elbows tucked.', 'Squat between your knees, keeping your torso tall.', 'Push the floor away to stand, exhaling at the top.'] },
  { name: 'Leg Press', movement_pattern: 'squat', is_compound: true, equipment: ['machine'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'],
    primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Set your feet shoulder-width on the platform, toes slightly out.', 'Lower under control until knees reach about 90 degrees.', 'Press through your heels without locking knees out hard at the top.'] },
  { name: 'Bodyweight Squat', movement_pattern: 'squat', is_compound: true, equipment: ['bodyweight'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'],
    primary_muscles: ['quads', 'glutes'], secondary_muscles: ['abs'],
    cues: ['Stand with feet shoulder-width, toes turned out slightly.', 'Lower by bending knees and hips together, chest up.', 'Drive up through your heels to full standing.'] },

  // -- hinge --
  { name: 'Conventional Deadlift', movement_pattern: 'hinge', is_compound: true, equipment: ['barbell'], muscle_groups: ['hamstrings', 'glutes', 'back'], contraindications: ['lower_back'],
    primary_muscles: ['hamstrings', 'glutes'], secondary_muscles: ['lower_back', 'lats', 'forearms'],
    cues: ['Set up with the bar over mid-foot and shins nearly touching it.', 'Grip the bar, flatten your back, and pull the slack out before lifting.', 'Drive the floor away, keeping the bar close as hips and shoulders rise together.'] },
  { name: 'Romanian Deadlift', movement_pattern: 'hinge', is_compound: true, equipment: ['barbell', 'dumbbell'], muscle_groups: ['hamstrings', 'glutes'], contraindications: ['lower_back'],
    primary_muscles: ['hamstrings', 'glutes'], secondary_muscles: ['lower_back'],
    cues: ['Start standing tall with a soft bend in the knees.', 'Push your hips back, lowering the weight along your legs.', 'Feel a hamstring stretch, then drive hips forward to stand.'] },
  { name: 'Kettlebell Swing', movement_pattern: 'hinge', is_compound: true, equipment: ['kettlebell'], muscle_groups: ['hamstrings', 'glutes'], contraindications: ['lower_back'],
    primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['abs', 'lower_back'],
    cues: ['Hinge at the hips to hike the bell back between your legs.', 'Snap your hips forward explosively to float the bell to chest height.', 'Let the bell float and pull you back into the next hinge -- do not lift with your arms.'] },
  { name: 'Hip Thrust', movement_pattern: 'hinge', is_compound: true, equipment: ['barbell', 'bench'], muscle_groups: ['glutes', 'hamstrings'], contraindications: [],
    primary_muscles: ['glutes'], secondary_muscles: ['hamstrings', 'abs'],
    cues: ['Set your upper back on the bench with the bar over your hips.', 'Drive through your heels, squeezing glutes hard at the top.', 'Keep your chin tucked and ribs down to avoid overarching your lower back.'] },

  // -- lunge --
  { name: 'Walking Lunge', movement_pattern: 'lunge', is_compound: true, equipment: ['dumbbell', 'bodyweight'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'],
    primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Step forward into a long stride, keeping your torso upright.', 'Lower until both knees are near 90 degrees, front knee over the ankle.', 'Push through the front heel to bring your back foot through to the next step.'] },
  { name: 'Bulgarian Split Squat', movement_pattern: 'lunge', is_compound: true, equipment: ['dumbbell', 'bench'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'],
    primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Rest your rear foot on the bench, front foot far enough forward to stay balanced.', 'Lower straight down, keeping most of your weight on the front leg.', 'Drive through the front heel to stand back up.'] },
  { name: 'Reverse Lunge', movement_pattern: 'lunge', is_compound: true, equipment: ['barbell', 'bodyweight'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees'],
    primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Step backward into a controlled stride rather than dropping fast.', 'Lower your back knee toward the floor, front shin staying vertical.', 'Push through the front foot to return to standing.'] },

  // -- horizontal_push --
  { name: 'Bench Press', movement_pattern: 'horizontal_push', is_compound: true, equipment: ['barbell', 'bench', 'rack'], muscle_groups: ['chest', 'triceps', 'shoulders'], contraindications: ['shoulders', 'wrists'],
    primary_muscles: ['chest'], secondary_muscles: ['triceps', 'front_delts'],
    cues: ['Set shoulder blades back and down before unracking.', 'Lower the bar under control to mid-chest, elbows at about 45 degrees.', 'Press up and slightly back, driving your feet into the floor.'] },
  { name: 'Dumbbell Bench Press', movement_pattern: 'horizontal_push', is_compound: true, equipment: ['dumbbell', 'bench'], muscle_groups: ['chest', 'triceps'], contraindications: ['shoulders'],
    primary_muscles: ['chest'], secondary_muscles: ['triceps', 'front_delts'],
    cues: ['Plant your feet and keep shoulder blades pinned to the bench.', 'Lower the dumbbells to chest level with control.', 'Press up and slightly inward without banging the dumbbells together.'] },
  { name: 'Push-Up', movement_pattern: 'horizontal_push', is_compound: true, equipment: ['bodyweight'], muscle_groups: ['chest', 'triceps'], contraindications: ['wrists'],
    primary_muscles: ['chest'], secondary_muscles: ['triceps', 'front_delts', 'abs'],
    cues: ['Keep a straight line from head to heels -- brace your core.', 'Lower your chest toward the floor with elbows around 45 degrees.', 'Push the floor away to full arm extension without letting hips sag.'] },
  { name: 'Machine Chest Press', movement_pattern: 'horizontal_push', is_compound: true, equipment: ['machine'], muscle_groups: ['chest', 'triceps'], contraindications: ['shoulders'],
    primary_muscles: ['chest'], secondary_muscles: ['triceps', 'front_delts'],
    cues: ['Adjust the seat so handles sit at mid-chest height.', 'Press forward smoothly without shrugging your shoulders up.', 'Control the return, stopping just short of the stack touching down.'] },

  // -- vertical_push --
  { name: 'Overhead Press', movement_pattern: 'vertical_push', is_compound: true, equipment: ['barbell', 'rack'], muscle_groups: ['shoulders', 'triceps'], contraindications: ['shoulders', 'lower_back'],
    primary_muscles: ['side_delts', 'front_delts'], secondary_muscles: ['triceps', 'abs'],
    cues: ['Brace your core and glutes so you do not lean back.', 'Press the bar straight up, tucking your head through once it clears your face.', 'Finish with the bar stacked over your shoulders and ears.'] },
  { name: 'Dumbbell Shoulder Press', movement_pattern: 'vertical_push', is_compound: true, equipment: ['dumbbell', 'bench'], muscle_groups: ['shoulders', 'triceps'], contraindications: ['shoulders'],
    primary_muscles: ['side_delts', 'front_delts'], secondary_muscles: ['triceps'],
    cues: ['Start with dumbbells at shoulder height, palms forward.', 'Press up and slightly in without arching your lower back.', 'Lower with control back to the starting position.'] },
  { name: 'Pike Push-Up', movement_pattern: 'vertical_push', is_compound: true, equipment: ['bodyweight'], muscle_groups: ['shoulders', 'triceps'], contraindications: ['shoulders', 'wrists'],
    primary_muscles: ['side_delts', 'front_delts'], secondary_muscles: ['triceps'],
    cues: ['Set up in a pike position with hips high, hands under shoulders.', 'Lower the crown of your head toward the floor between your hands.', 'Push back up to the starting pike position.'] },

  // -- horizontal_pull --
  { name: 'Barbell Row', movement_pattern: 'horizontal_pull', is_compound: true, equipment: ['barbell'], muscle_groups: ['back', 'biceps'], contraindications: ['lower_back'],
    primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps', 'rear_delts'],
    cues: ['Hinge forward to about 45 degrees with a flat back.', 'Pull the bar to your lower ribs, leading with your elbows.', 'Lower under control without letting your torso swing.'] },
  { name: 'Dumbbell Row', movement_pattern: 'horizontal_pull', is_compound: true, equipment: ['dumbbell', 'bench'], muscle_groups: ['back', 'biceps'], contraindications: [],
    primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps', 'rear_delts'],
    cues: ['Support yourself on the bench with a flat back.', 'Pull the dumbbell to your hip, keeping your elbow close to your body.', 'Lower with control and avoid rotating your torso.'] },
  { name: 'Seated Cable Row', movement_pattern: 'horizontal_pull', is_compound: true, equipment: ['cable', 'machine'], muscle_groups: ['back', 'biceps'], contraindications: [],
    primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps', 'rear_delts'],
    cues: ['Sit tall with knees slightly bent, chest up.', 'Pull the handle to your torso, squeezing shoulder blades together.', 'Extend arms fully with control, avoiding rounding your lower back.'] },
  { name: 'Inverted Row', movement_pattern: 'horizontal_pull', is_compound: true, equipment: ['bodyweight', 'rack'], muscle_groups: ['back', 'biceps'], contraindications: [],
    primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps', 'rear_delts', 'abs'],
    cues: ['Set the bar at a height that matches your strength level.', 'Keep your body in a straight line as you pull your chest to the bar.', 'Lower under control without letting your hips sag.'] },

  // -- vertical_pull --
  { name: 'Pull-Up', movement_pattern: 'vertical_pull', is_compound: true, equipment: ['bodyweight', 'pullup_bar'], muscle_groups: ['back', 'biceps'], contraindications: ['elbows'],
    primary_muscles: ['lats'], secondary_muscles: ['biceps', 'upper_back'],
    cues: ['Start from a dead hang with shoulder blades set.', 'Pull your chest toward the bar, driving elbows down and back.', 'Lower under control to a full hang before the next rep.'] },
  { name: 'Lat Pulldown', movement_pattern: 'vertical_pull', is_compound: true, equipment: ['cable', 'machine'], muscle_groups: ['back', 'biceps'], contraindications: [],
    primary_muscles: ['lats'], secondary_muscles: ['biceps', 'upper_back'],
    cues: ['Grip the bar slightly wider than shoulder-width.', 'Pull to your upper chest, leading with your elbows down.', 'Let the bar rise with control, keeping some tension in your lats.'] },
  { name: 'Assisted Pull-Up', movement_pattern: 'vertical_pull', is_compound: true, equipment: ['machine', 'bands'], muscle_groups: ['back', 'biceps'], contraindications: [],
    primary_muscles: ['lats'], secondary_muscles: ['biceps', 'upper_back'],
    cues: ['Set assistance so the last rep or two feels challenging, not easy.', 'Pull your chest toward the bar with control, avoiding kipping.', 'Lower fully between reps to keep the range of motion honest.'] },

  // -- olympic --
  { name: 'Power Clean', movement_pattern: 'olympic', is_compound: true, equipment: ['barbell'], muscle_groups: ['full_body'], contraindications: ['lower_back', 'wrists', 'knees'],
    primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['quads', 'upper_back', 'forearms'],
    cues: ['Start with the bar over mid-foot and hips higher than the knees.', 'Extend explosively through hips, knees, and ankles as the bar passes your thighs.', 'Pull yourself under the bar fast, catching it on your shoulders in a quarter squat.'] },
  { name: 'Hang Snatch', movement_pattern: 'olympic', is_compound: true, equipment: ['barbell'], muscle_groups: ['full_body'], contraindications: ['lower_back', 'shoulders', 'wrists'],
    primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['side_delts', 'upper_back', 'forearms'],
    cues: ['Start from a hang position just above the knees, hips back.', 'Extend violently through the hips while keeping the bar close to your body.', 'Punch under the bar into an overhead squat catch, arms locked out.'] },
  { name: 'Kettlebell Clean', movement_pattern: 'olympic', is_compound: true, equipment: ['kettlebell'], muscle_groups: ['full_body'], contraindications: ['lower_back', 'wrists'],
    primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['forearms', 'upper_back'],
    cues: ['Hike the bell back like the start of a swing.', 'Drive your hips forward and pull the bell close to your body as it rises.', 'Rotate your hand through so the bell rests softly on your forearm at the rack.'] },

  // -- plyometric --
  { name: 'Box Jump', movement_pattern: 'plyometric', is_compound: true, equipment: ['bodyweight'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees', 'ankles'],
    primary_muscles: ['quads', 'glutes'], secondary_muscles: ['calves'],
    cues: ['Start in a quarter squat with arms back, ready to swing.', 'Swing your arms forward and jump, landing softly with bent knees.', 'Stand fully upright on the box before stepping back down -- do not jump down.'] },
  { name: 'Broad Jump', movement_pattern: 'plyometric', is_compound: true, equipment: ['bodyweight'], muscle_groups: ['quads', 'glutes'], contraindications: ['knees', 'ankles'],
    primary_muscles: ['quads', 'glutes'], secondary_muscles: ['calves', 'hamstrings'],
    cues: ['Load into a quarter squat with arms swung back.', 'Explode forward and up, swinging your arms for momentum.', 'Land softly with bent knees, absorbing the impact before standing tall.'] },

  // -- carry --
  { name: "Farmer's Carry", movement_pattern: 'carry', is_compound: true, equipment: ['dumbbell', 'kettlebell'], muscle_groups: ['grip', 'core'], contraindications: [],
    primary_muscles: ['forearms', 'abs'], secondary_muscles: ['upper_back', 'lower_back'],
    cues: ['Pick the weights up with a flat back, then stand tall.', 'Walk with short, controlled steps, shoulders back and down.', 'Keep your core braced so your torso does not lean side to side.'] },
  { name: 'Suitcase Carry', movement_pattern: 'carry', is_compound: true, equipment: ['dumbbell', 'kettlebell'], muscle_groups: ['core', 'grip'], contraindications: [],
    primary_muscles: ['obliques', 'forearms'], secondary_muscles: ['abs', 'lower_back'],
    cues: ['Hold the weight in one hand, standing tall before you move.', 'Resist leaning toward the loaded side as you walk.', 'Keep steps short and controlled, switching sides evenly.'] },

  // -- core --
  { name: 'Plank', movement_pattern: 'core', is_compound: false, equipment: ['bodyweight'], muscle_groups: ['core'], contraindications: [],
    primary_muscles: ['abs'], secondary_muscles: ['obliques', 'lower_back'],
    cues: ['Stack elbows under shoulders and squeeze your glutes.', 'Keep a straight line from head to heels -- no sagging hips.', 'Breathe steadily while holding the brace, not just at the start.'] },
  { name: 'Hanging Leg Raise', movement_pattern: 'core', is_compound: false, equipment: ['bodyweight', 'pullup_bar'], muscle_groups: ['core'], contraindications: [],
    primary_muscles: ['abs'], secondary_muscles: ['obliques', 'forearms'],
    cues: ['Hang with shoulder blades set, avoiding a full dead hang swing.', 'Raise your legs by curling your pelvis up, not just swinging your feet.', 'Lower with control to avoid using momentum on the next rep.'] },
  { name: 'Cable Crunch', movement_pattern: 'core', is_compound: false, equipment: ['cable', 'machine'], muscle_groups: ['core'], contraindications: ['neck'],
    primary_muscles: ['abs'], secondary_muscles: ['obliques'],
    cues: ['Kneel below the cable with the rope at the back of your neck.', 'Curl your torso down by contracting your abs, not pulling with your arms.', 'Return under control, keeping tension on the abs throughout.'] },
  { name: 'Dead Bug', movement_pattern: 'core', is_compound: false, equipment: ['bodyweight'], muscle_groups: ['core'], contraindications: [],
    primary_muscles: ['abs'], secondary_muscles: ['obliques', 'lower_back'],
    cues: ['Lie on your back with arms up and knees bent at 90 degrees.', 'Press your lower back into the floor and keep it there throughout.', 'Extend opposite arm and leg slowly, then return and switch sides.'] },

  // -- isolation_arms --
  { name: 'Dumbbell Curl', movement_pattern: 'isolation_arms', is_compound: false, equipment: ['dumbbell'], muscle_groups: ['biceps'], contraindications: ['elbows'],
    primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Keep your elbows pinned to your sides throughout.', 'Curl the weight up without swinging your torso.', 'Lower slowly to full arm extension before the next rep.'] },
  { name: 'Cable Tricep Pushdown', movement_pattern: 'isolation_arms', is_compound: false, equipment: ['cable', 'machine'], muscle_groups: ['triceps'], contraindications: ['elbows'],
    primary_muscles: ['triceps'], secondary_muscles: [],
    cues: ['Keep your elbows tucked at your sides and stationary.', 'Push the bar down to full elbow extension without leaning forward.', 'Control the return, keeping tension on the triceps.'] },
  { name: 'Barbell Curl', movement_pattern: 'isolation_arms', is_compound: false, equipment: ['barbell'], muscle_groups: ['biceps'], contraindications: ['elbows', 'wrists'],
    primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Stand tall with elbows close to your torso.', 'Curl the bar up without swinging your hips or shoulders forward.', 'Lower under control to full arm extension.'] },
  { name: 'Band Curl', movement_pattern: 'isolation_arms', is_compound: false, equipment: ['bands'], muscle_groups: ['biceps'], contraindications: [],
    primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Stand on the band with feet set for even tension.', 'Curl your hands up while keeping elbows fixed at your sides.', 'Lower slowly to control the band pull back down.'] },

  // -- isolation_shoulders --
  { name: 'Lateral Raise', movement_pattern: 'isolation_shoulders', is_compound: false, equipment: ['dumbbell'], muscle_groups: ['shoulders'], contraindications: ['shoulders'],
    primary_muscles: ['side_delts'], secondary_muscles: [],
    cues: ['Start with dumbbells at your sides, a slight bend in the elbows.', 'Raise your arms out to the sides until roughly shoulder height.', 'Lower with control rather than dropping the weight.'] },
  { name: 'Cable Lateral Raise', movement_pattern: 'isolation_shoulders', is_compound: false, equipment: ['cable', 'machine'], muscle_groups: ['shoulders'], contraindications: ['shoulders'],
    primary_muscles: ['side_delts'], secondary_muscles: [],
    cues: ['Stand side-on to the cable stack, arm across your body to start.', 'Raise your arm out to the side, leading with the elbow.', 'Lower under control to keep constant tension on the shoulder.'] },
  { name: 'Band Pull-Apart', movement_pattern: 'isolation_shoulders', is_compound: false, equipment: ['bands'], muscle_groups: ['shoulders', 'upper_back'], contraindications: [],
    primary_muscles: ['rear_delts'], secondary_muscles: ['upper_back'],
    cues: ['Hold the band at shoulder height with arms extended.', 'Pull the band apart by driving your shoulder blades together.', 'Return with control rather than letting the band snap back.'] },

  // -- isolation_chest --
  { name: 'Dumbbell Fly', movement_pattern: 'isolation_chest', is_compound: false, equipment: ['dumbbell', 'bench'], muscle_groups: ['chest'], contraindications: ['shoulders'],
    primary_muscles: ['chest'], secondary_muscles: ['front_delts'],
    cues: ['Lie back with a slight bend in your elbows throughout.', 'Lower the dumbbells out to the sides until you feel a chest stretch.', 'Bring them back together over your chest in a hugging motion.'] },
  { name: 'Cable Crossover', movement_pattern: 'isolation_chest', is_compound: false, equipment: ['cable', 'machine'], muscle_groups: ['chest'], contraindications: ['shoulders'],
    primary_muscles: ['chest'], secondary_muscles: ['front_delts'],
    cues: ['Set cables high and step forward into a slight lean.', 'Bring your hands together in front of your chest with a slight bend in the elbows.', 'Control the return, keeping constant tension on the chest.'] },

  // -- isolation_back --
  { name: 'Straight-Arm Pulldown', movement_pattern: 'isolation_back', is_compound: false, equipment: ['cable', 'machine'], muscle_groups: ['back'], contraindications: [],
    primary_muscles: ['lats'], secondary_muscles: ['abs'],
    cues: ['Stand tall with a slight hinge and arms extended overhead.', 'Pull the bar down to your thighs, keeping your elbows nearly straight.', 'Let it rise back with control, feeling the stretch through your lats.'] },
  { name: 'Reverse Dumbbell Fly', movement_pattern: 'isolation_back', is_compound: false, equipment: ['dumbbell', 'bench'], muscle_groups: ['upper_back'], contraindications: [],
    primary_muscles: ['rear_delts'], secondary_muscles: ['upper_back'],
    cues: ['Hinge forward with a flat back, dumbbells hanging below you.', 'Raise your arms out to the sides, squeezing your shoulder blades together.', 'Lower with control back to the start position.'] },

  // -- isolation_legs --
  { name: 'Leg Extension', movement_pattern: 'isolation_legs', is_compound: false, equipment: ['machine'], muscle_groups: ['quads'], contraindications: ['knees'],
    primary_muscles: ['quads'], secondary_muscles: [],
    cues: ['Adjust the pad to sit just above your ankles.', 'Extend your legs fully without lifting your hips off the seat.', 'Lower under control rather than letting the weight drop.'] },
  { name: 'Leg Curl', movement_pattern: 'isolation_legs', is_compound: false, equipment: ['machine'], muscle_groups: ['hamstrings'], contraindications: [],
    primary_muscles: ['hamstrings'], secondary_muscles: ['glutes'],
    cues: ['Position the pad just above your heels.', 'Curl your heels toward your glutes without lifting your hips.', 'Lower with control back to the starting position.'] },
  { name: 'Nordic Curl', movement_pattern: 'isolation_legs', is_compound: false, equipment: ['bodyweight'], muscle_groups: ['hamstrings'], contraindications: ['knees'],
    primary_muscles: ['hamstrings'], secondary_muscles: ['glutes'],
    cues: ['Anchor your ankles and kneel tall, hips and shoulders in line.', 'Lower your torso forward as slowly as you can control it.', 'Use your hands to catch and push back up if you cannot control the descent.'] },

  // -- isolation_calves --
  { name: 'Standing Calf Raise', movement_pattern: 'isolation_calves', is_compound: false, equipment: ['machine', 'bodyweight'], muscle_groups: ['calves'], contraindications: ['ankles'],
    primary_muscles: ['calves'], secondary_muscles: [],
    cues: ['Stand with the balls of your feet on the platform edge.', 'Rise as high onto your toes as possible, pausing at the top.', 'Lower under control until you feel a stretch in your calves.'] },
  { name: 'Seated Calf Raise', movement_pattern: 'isolation_calves', is_compound: false, equipment: ['machine'], muscle_groups: ['calves'], contraindications: ['ankles'],
    primary_muscles: ['calves'], secondary_muscles: [],
    cues: ['Sit with the pad resting just above your knees.', 'Raise your heels as high as you can, squeezing at the top.', 'Lower slowly for a full stretch before the next rep.'] },
];

/**
 * The on-device exercise catalogue the engine consumes. Frozen so callers can't
 * mutate the shared bundle. Every Exercise has a stable id + the four taxonomy
 * fields exerciseFill() filters on. (primary_muscles/secondary_muscles/cues are
 * extra runtime fields carried on each object for TICKET-134 -- see
 * ENGINE_EXERCISE_MEDIA for a typed accessor; the Exercise[] contract itself is
 * unchanged so the engine's filters keep working exactly as before.)
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
    primary_muscles: e.primary_muscles,
    secondary_muscles: e.secondary_muscles,
    cues: e.cues,
  }))
) as unknown as Exercise[];

/** Convenience accessor (returns the shared frozen array). */
export function getEngineExerciseCatalog(): Exercise[] {
  return ENGINE_EXERCISE_CATALOG;
}

// ---------------------------------------------------------------------------
// TICKET-134 -- exercise media v1 (muscle diagrams + form cues)
// ---------------------------------------------------------------------------

/** The media fields ExerciseDetailSheet needs, keyed for O(1) lookup. */
export interface ExerciseMedia {
  id: string;
  name: string;
  equipment: string[];
  is_compound: boolean;
  primary_muscles: MuscleHeatmapRegion[];
  secondary_muscles: MuscleHeatmapRegion[];
  cues: [string, string, string];
}

/** Same objects as ENGINE_EXERCISE_CATALOG, typed to expose the media fields. */
export const ENGINE_EXERCISE_MEDIA: ExerciseMedia[] = Object.freeze(
  RAW.map((e, i) => ({
    id: ENGINE_EXERCISE_CATALOG[i]!.id,
    name: e.name,
    equipment: e.equipment,
    is_compound: e.is_compound,
    primary_muscles: e.primary_muscles,
    secondary_muscles: e.secondary_muscles,
    cues: e.cues,
  }))
) as ExerciseMedia[];

const MEDIA_BY_ID: Map<string, ExerciseMedia> = new Map(
  ENGINE_EXERCISE_MEDIA.map((m) => [m.id, m]),
);

function normalizeExerciseName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const MEDIA_BY_NAME: Map<string, ExerciseMedia> = new Map(
  ENGINE_EXERCISE_MEDIA.map((m) => [normalizeExerciseName(m.name), m]),
);

/**
 * Look up media (muscles + cues) for an exercise by catalog id first, then by
 * normalized name (handles server-sourced Exercise rows that share a name with
 * a local catalog entry but carry a different UUID). Returns null when this
 * exercise has no authored media yet (caller should fall back gracefully --
 * e.g. render only the equipment tag / history, no diagram/cues section).
 */
export function getExerciseMedia(idOrName: { id?: string | null; name?: string | null }): ExerciseMedia | null {
  if (idOrName.id) {
    const byId = MEDIA_BY_ID.get(idOrName.id);
    if (byId) return byId;
  }
  if (idOrName.name) {
    const byName = MEDIA_BY_NAME.get(normalizeExerciseName(idOrName.name));
    if (byName) return byName;
  }
  return null;
}

export default ENGINE_EXERCISE_CATALOG;
