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

// ---------------------------------------------------------------------------
// TICKET-134 -- media-only entries: full-catalog coverage (2026-07-04)
// ---------------------------------------------------------------------------
// The 51 entries above are the engine-catalog exercises (also used by
// exerciseFill() to generate plans). The acceptance criterion for TICKET-134
// is broader: EVERY seeded exercise in db/schema.sql (220 unique names across
// the two `INSERT INTO exercises` blocks) needs primary/secondary muscles +
// cues so ExerciseDetailSheet has content no matter which catalog an exercise
// came from. These entries are MEDIA-ONLY: they are deliberately NOT added to
// RAW/ENGINE_EXERCISE_CATALOG (they have no movement_pattern/equipment/
// contraindications tagging and must never be selected by exerciseFill()).
// They exist purely so getExerciseMedia() resolves by normalized name for a
// server-sourced Exercise row that shares a name with one of these.
//
// Coverage check: mobile/scripts/pf_ticket134_coverage.js regex-extracts every
// seed name from db/schema.sql and every normalized key from this file and
// exits nonzero if any seed exercise has no media entry (engine catalog OR
// this block). Keep this list and that script in sync.
//
// Same coaching-claim caveat as the file header: cue content is bulk-authored
// and PENDING FOUNDER REVIEW before ship (see audits/TICKET-134-animation-
// shortlist.md for the ~20 exercises flagged for a v2 animation instead of
// relying on text cues alone).
interface MediaOnlyEntry {
  name: string;
  primary_muscles: MuscleHeatmapRegion[];
  secondary_muscles: MuscleHeatmapRegion[];
  cues: [string, string, string];
}

const MEDIA_ONLY_RAW: MediaOnlyEntry[] = [
  { name: 'Barbell Bench Press', primary_muscles: ['chest'], secondary_muscles: ['triceps', 'front_delts'],
    cues: ['Set shoulder blades back and down before unracking.', 'Lower the bar under control to mid-chest, elbows at about 45 degrees.', 'Press up and slightly back, driving your feet into the floor.'] },
  { name: 'Incline Barbell Bench Press', primary_muscles: ['chest', 'front_delts'], secondary_muscles: ['triceps'],
    cues: ['Set the bench to a moderate incline, around 30 to 45 degrees.', 'Lower the bar to your upper chest, elbows at about 45 degrees.', 'Press up and slightly back without flaring your elbows out.'] },
  { name: 'Decline Barbell Bench Press', primary_muscles: ['chest'], secondary_muscles: ['triceps'],
    cues: ['Secure your legs and set shoulder blades back on the decline bench.', 'Lower the bar to your lower chest under control.', 'Press up and slightly back, keeping wrists stacked over elbows.'] },
  { name: 'Close-Grip Bench Press', primary_muscles: ['triceps'], secondary_muscles: ['chest', 'front_delts'],
    cues: ['Grip the bar just inside shoulder width.', 'Lower the bar to your lower chest, keeping elbows tucked close.', 'Press up by driving through your triceps, not flaring your elbows.'] },
  { name: 'Incline Dumbbell Press', primary_muscles: ['chest', 'front_delts'], secondary_muscles: ['triceps'],
    cues: ['Set the bench to a moderate incline and plant your feet.', 'Lower the dumbbells to the top of your chest with control.', 'Press up and slightly inward without clashing the dumbbells.'] },
  { name: 'Decline Dumbbell Press', primary_muscles: ['chest'], secondary_muscles: ['triceps'],
    cues: ['Secure your legs and hold dumbbells at your lower chest.', 'Lower under control, keeping elbows around 45 degrees.', 'Press up and slightly inward to full arm extension.'] },
  { name: 'Flat Dumbbell Fly', primary_muscles: ['chest'], secondary_muscles: ['front_delts'],
    cues: ['Lie back with a slight bend in your elbows throughout.', 'Lower the dumbbells out to the sides until you feel a chest stretch.', 'Bring them back together over your chest in a hugging motion.'] },
  { name: 'Incline Dumbbell Fly', primary_muscles: ['chest', 'front_delts'], secondary_muscles: [],
    cues: ['Set a moderate incline and start with dumbbells over your chest.', 'Lower with a slight elbow bend until you feel a stretch across the chest.', 'Squeeze your pecs to bring the dumbbells back together.'] },
  { name: 'Cable Fly (Low to High)', primary_muscles: ['chest'], secondary_muscles: ['front_delts'],
    cues: ['Set both pulleys low and step forward into a slight lean.', 'Sweep your hands up and together in an arc to chest height.', 'Control the return, keeping constant tension on the chest.'] },
  { name: 'Cable Fly (High to Low)', primary_muscles: ['chest'], secondary_muscles: [],
    cues: ['Set both pulleys high and step forward into a slight lean.', 'Sweep your hands down and together in an arc toward your hips.', 'Control the return without letting the weight stacks touch down hard.'] },
  { name: 'Pec Deck', primary_muscles: ['chest'], secondary_muscles: ['front_delts'],
    cues: ['Adjust the seat so handles sit at chest height.', 'Bring your arms together in front of your chest, squeezing the pecs.', 'Return under control, stopping just short of a full stretch snap.'] },
  { name: 'Diamond Push-Up', primary_muscles: ['triceps'], secondary_muscles: ['chest', 'front_delts'],
    cues: ['Form a diamond shape with your hands under your chest.', 'Lower your chest to your hands, keeping elbows close to your body.', 'Push back up to full extension without letting hips sag.'] },
  { name: 'Dip (Chest-Focused)', primary_muscles: ['chest'], secondary_muscles: ['triceps', 'front_delts'],
    cues: ['Lean your torso forward and let elbows flare slightly.', 'Lower until you feel a stretch across the chest.', 'Press back up while keeping the forward lean.'] },
  { name: 'Weighted Dip', primary_muscles: ['chest'], secondary_muscles: ['triceps', 'front_delts'],
    cues: ['Attach the weight securely and set your torso lean for the target muscle.', 'Lower under control to a comfortable depth.', 'Press back up to full lockout without swinging your legs.'] },
  { name: 'Floor Press', primary_muscles: ['chest'], secondary_muscles: ['triceps', 'front_delts'],
    cues: ['Lie on the floor with knees bent, bar over your chest.', 'Lower until your elbows touch the floor, then pause briefly.', 'Press back up without using the floor to bounce the weight.'] },
  { name: 'Landmine Press', primary_muscles: ['chest', 'front_delts'], secondary_muscles: ['triceps'],
    cues: ['Hold the bar end at shoulder height, staggered stance.', 'Press the bar up and slightly forward along its natural arc.', 'Lower with control back to the shoulder.'] },
  { name: 'Deadlift', primary_muscles: ['hamstrings', 'glutes'], secondary_muscles: ['lower_back', 'lats', 'forearms'],
    cues: ['Set up with the bar over mid-foot and shins nearly touching it.', 'Grip the bar, flatten your back, and pull the slack out before lifting.', 'Drive the floor away, keeping the bar close as hips and shoulders rise together.'] },
  { name: 'Sumo Deadlift', primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['lower_back', 'quads'],
    cues: ['Set a wide stance with toes turned out, gripping inside your knees.', 'Push your knees out as you drive the bar off the floor.', 'Finish by driving hips through, standing tall at the top.'] },
  { name: 'Trap Bar Deadlift', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings', 'lower_back'],
    cues: ['Step inside the trap bar, feet hip-width, chest up.', 'Grip the handles and drive through the floor to stand.', 'Keep the bar path vertical and close to your body throughout.'] },
  { name: 'Stiff-Leg Deadlift', primary_muscles: ['hamstrings'], secondary_muscles: ['glutes', 'lower_back'],
    cues: ['Start standing with knees only slightly bent.', 'Lower the bar along your legs by hinging at the hips, back flat.', 'Feel the hamstring stretch, then drive hips forward to stand.'] },
  { name: 'Rack Pull', primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['hamstrings', 'glutes', 'forearms'],
    cues: ['Set the bar at knee height or just below inside a rack.', 'Grip the bar, brace hard, and pull by driving your hips forward.', 'Lock out tall at the top without shrugging or leaning back.'] },
  { name: 'Chin-Up', primary_muscles: ['lats', 'biceps'], secondary_muscles: ['upper_back'],
    cues: ['Grip the bar with palms facing you, shoulder-width or closer.', 'Pull your chin over the bar, leading with your chest.', 'Lower under control to a full hang.'] },
  { name: 'Wide-Grip Pull-Up', primary_muscles: ['lats'], secondary_muscles: ['upper_back'],
    cues: ['Grip the bar wider than shoulder width.', 'Pull your chest toward the bar without kipping your legs.', 'Lower under control to a full hang before the next rep.'] },
  { name: 'Weighted Pull-Up', primary_muscles: ['lats'], secondary_muscles: ['biceps', 'upper_back'],
    cues: ['Attach the weight securely before starting from a dead hang.', 'Pull your chest to the bar, driving elbows down and back.', 'Lower fully under control to protect your shoulders.'] },
  { name: 'Wide-Grip Lat Pulldown', primary_muscles: ['lats'], secondary_muscles: ['upper_back'],
    cues: ['Grip the bar near the ends, wider than shoulder-width.', 'Pull down to your upper chest without leaning back excessively.', 'Control the return to a full stretch overhead.'] },
  { name: 'Pendlay Row', primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps'],
    cues: ['Set up with your torso parallel to the floor, bar on the ground.', 'Pull explosively to your lower ribs from a dead stop each rep.', 'Return the bar fully to the floor before the next pull.'] },
  { name: 'T-Bar Row', primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps', 'rear_delts'],
    cues: ['Straddle the bar, hinge forward with a flat back.', 'Pull the handle to your chest, squeezing your shoulder blades together.', 'Lower under control without rounding your lower back.'] },
  { name: 'Single-Arm Dumbbell Row', primary_muscles: ['lats', 'upper_back'], secondary_muscles: ['biceps'],
    cues: ['Support yourself on a bench with a flat back.', 'Pull the dumbbell to your hip, keeping your elbow close to your body.', 'Lower with control and avoid rotating your torso.'] },
  { name: 'Chest-Supported Dumbbell Row', primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps', 'rear_delts'],
    cues: ['Lie chest-down on an incline bench, arms hanging.', 'Pull the dumbbells to your ribs, squeezing shoulder blades together.', 'Lower under control without lifting your chest off the pad.'] },
  { name: 'Machine Row', primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps'],
    cues: ['Adjust the seat and chest pad so handles sit at chest height.', 'Pull the handles back, squeezing your shoulder blades together.', 'Return under control without letting the stack slam.'] },
  { name: 'Hyperextension', primary_muscles: ['lower_back'], secondary_muscles: ['glutes', 'hamstrings'],
    cues: ['Set your hips at the pad edge, ankles secured.', 'Lower your torso under control until you feel a stretch.', 'Raise back to a flat line without hyperextending past neutral.'] },
  { name: 'Good Morning', primary_muscles: ['hamstrings'], secondary_muscles: ['lower_back', 'glutes'],
    cues: ['Set the bar across your upper back like a squat.', 'Hinge at the hips, pushing them back with a soft knee bend.', 'Drive hips forward to return to standing, keeping your back flat.'] },
  { name: 'Shrug (Barbell)', primary_muscles: ['upper_back'], secondary_muscles: ['forearms'],
    cues: ['Hold the bar at arm\'s length in front of your thighs.', 'Shrug your shoulders straight up toward your ears.', 'Lower under control without rolling your shoulders.'] },
  { name: 'Shrug (Dumbbell)', primary_muscles: ['upper_back'], secondary_muscles: ['forearms'],
    cues: ['Hold dumbbells at your sides, arms straight.', 'Shrug straight up, squeezing at the top briefly.', 'Lower with control back to a full stretch.'] },
  { name: 'Farmer\'s Carry', primary_muscles: ['forearms', 'abs'], secondary_muscles: ['upper_back', 'lower_back'],
    cues: ['Pick the weights up with a flat back, then stand tall.', 'Walk with short, controlled steps, shoulders back and down.', 'Keep your core braced so your torso does not lean side to side.'] },
  { name: 'Push Press', primary_muscles: ['side_delts', 'front_delts'], secondary_muscles: ['triceps', 'quads'],
    cues: ['Set the bar on your shoulders with a slight knee bend.', 'Dip and drive through your legs to launch the bar upward.', 'Finish by pressing to lockout overhead, bar over your ears.'] },
  { name: 'Seated Barbell Press', primary_muscles: ['side_delts', 'front_delts'], secondary_muscles: ['triceps'],
    cues: ['Sit tall with the bar at shoulder height, back supported.', 'Press the bar straight up without arching your lower back.', 'Lower under control back to shoulder height.'] },
  { name: 'Arnold Press', primary_muscles: ['side_delts', 'front_delts'], secondary_muscles: ['triceps'],
    cues: ['Start with dumbbells at shoulder height, palms facing you.', 'Rotate your palms outward as you press overhead.', 'Reverse the rotation as you lower back to the start.'] },
  { name: 'Machine Shoulder Press', primary_muscles: ['side_delts', 'front_delts'], secondary_muscles: ['triceps'],
    cues: ['Adjust the seat so handles start at shoulder height.', 'Press up without shrugging your shoulders toward your ears.', 'Lower under control back to the starting position.'] },
  { name: 'Machine Lateral Raise', primary_muscles: ['side_delts'], secondary_muscles: [],
    cues: ['Adjust the seat so the pad sits at your upper arm.', 'Raise your arms out to the sides to about shoulder height.', 'Lower with control rather than letting the weight drop.'] },
  { name: 'Front Raise', primary_muscles: ['front_delts'], secondary_muscles: [],
    cues: ['Hold weights in front of your thighs, slight elbow bend.', 'Raise one or both arms forward to about shoulder height.', 'Lower under control without swinging your torso.'] },
  { name: 'Bent-Over Reverse Fly', primary_muscles: ['rear_delts'], secondary_muscles: ['upper_back'],
    cues: ['Hinge forward with a flat back, dumbbells hanging below you.', 'Raise your arms out to the sides, squeezing your shoulder blades together.', 'Lower with control back to the start position.'] },
  { name: 'Reverse Pec Deck', primary_muscles: ['rear_delts'], secondary_muscles: ['upper_back'],
    cues: ['Sit facing the pad with arms extended in front of you.', 'Pull your arms out and back, squeezing your shoulder blades.', 'Return under control without letting the stack slam.'] },
  { name: 'Face Pull', primary_muscles: ['rear_delts'], secondary_muscles: ['upper_back'],
    cues: ['Set the cable at head height with a rope attachment.', 'Pull toward your face, leading with your elbows high.', 'Squeeze your shoulder blades together at the end range.'] },
  { name: 'Upright Row', primary_muscles: ['side_delts'], secondary_muscles: ['upper_back', 'forearms'],
    cues: ['Hold the bar with a shoulder-width or slightly narrower grip.', 'Pull the bar up along your body, leading with your elbows.', 'Lower under control to full arm extension.'] },
  { name: 'Handstand Push-Up', primary_muscles: ['side_delts', 'front_delts'], secondary_muscles: ['triceps'],
    cues: ['Kick up into a stable handstand against a wall.', 'Lower your head toward the floor under control.', 'Press back up to full arm extension without flaring elbows wide.'] },
  { name: 'EZ-Bar Curl', primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Grip the EZ-bar on the angled grips, elbows at your sides.', 'Curl the bar up without swinging your torso.', 'Lower under control to full arm extension.'] },
  { name: 'Alternating Dumbbell Curl', primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Stand tall with dumbbells at your sides, palms forward.', 'Curl one arm up at a time, keeping the elbow pinned.', 'Lower under control before starting the other side.'] },
  { name: 'Hammer Curl', primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Hold dumbbells with a neutral, palms-in grip.', 'Curl straight up while keeping your wrists neutral throughout.', 'Lower slowly to full arm extension.'] },
  { name: 'Incline Dumbbell Curl', primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Sit back on an incline bench, arms hanging straight down.', 'Curl the dumbbells up without letting your elbows drift forward.', 'Lower under control to feel a full stretch at the bottom.'] },
  { name: 'Preacher Curl', primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Rest your upper arms flat on the preacher pad.', 'Curl the weight up without lifting your elbows off the pad.', 'Lower slowly to near-full extension.'] },
  { name: 'Spider Curl', primary_muscles: ['biceps'], secondary_muscles: [],
    cues: ['Lie chest-down on an incline bench, arms hanging.', 'Curl the weight up, squeezing at the top of the movement.', 'Lower under control to a full stretch.'] },
  { name: 'Concentration Curl', primary_muscles: ['biceps'], secondary_muscles: [],
    cues: ['Sit and brace your elbow against your inner thigh.', 'Curl the weight up toward your shoulder with control.', 'Lower slowly to full arm extension.'] },
  { name: 'Cable Curl', primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Stand tall, elbows pinned to your sides, low pulley.', 'Curl the handle up without swinging your body.', 'Lower under control to full arm extension.'] },
  { name: 'Reverse Curl', primary_muscles: ['forearms'], secondary_muscles: ['biceps'],
    cues: ['Grip the bar with palms facing down, shoulder-width.', 'Curl the bar up while keeping your wrists flat and firm.', 'Lower under control to full arm extension.'] },
  { name: 'Zottman Curl', primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Curl the dumbbells up with palms facing forward.', 'Rotate your palms down at the top of the curl.', 'Lower slowly in the rotated, palms-down position.'] },
  { name: 'Machine Curl', primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Adjust the seat so your elbows line up with the pivot.', 'Curl the handles up without lifting off the pad.', 'Lower under control to a full stretch.'] },
  { name: 'Triceps Pushdown', primary_muscles: ['triceps'], secondary_muscles: [],
    cues: ['Keep your elbows tucked at your sides and stationary.', 'Push the bar down to full elbow extension without leaning forward.', 'Control the return, keeping tension on the triceps.'] },
  { name: 'Rope Pushdown', primary_muscles: ['triceps'], secondary_muscles: [],
    cues: ['Grip the rope with elbows pinned to your sides.', 'Push down and spread the rope apart at the bottom.', 'Control the return without letting your elbows flare out.'] },
  { name: 'Overhead Triceps Extension', primary_muscles: ['triceps'], secondary_muscles: [],
    cues: ['Hold the weight overhead with elbows pointing forward.', 'Lower behind your head by bending only at the elbows.', 'Press back up to full extension without flaring your elbows.'] },
  { name: 'Skull Crusher', primary_muscles: ['triceps'], secondary_muscles: [],
    cues: ['Lie on a bench with the bar over your forehead, elbows fixed.', 'Lower the bar toward your forehead by bending only your elbows.', 'Press back up to full extension without moving your upper arms.'] },
  { name: 'EZ-Bar Skull Crusher', primary_muscles: ['triceps'], secondary_muscles: [],
    cues: ['Grip the EZ-bar on the angled grips, arms extended overhead.', 'Lower toward your forehead, keeping upper arms still.', 'Press back up to full lockout.'] },
  { name: 'Dumbbell Skull Crusher', primary_muscles: ['triceps'], secondary_muscles: [],
    cues: ['Hold dumbbells overhead with elbows pointed at the ceiling.', 'Lower toward your ears by bending only the elbows.', 'Press back up to full extension.'] },
  { name: 'Cable Overhead Extension', primary_muscles: ['triceps'], secondary_muscles: [],
    cues: ['Face away from the cable stack, weight overhead.', 'Lower behind your head by bending only your elbows.', 'Press back up to full extension, keeping upper arms fixed.'] },
  { name: 'Triceps Kickback', primary_muscles: ['triceps'], secondary_muscles: [],
    cues: ['Hinge forward with your upper arm parallel to the floor.', 'Extend your forearm back until your arm is straight.', 'Return under control without swinging your shoulder.'] },
  { name: 'Bench Dip', primary_muscles: ['triceps'], secondary_muscles: ['chest'],
    cues: ['Set your hands on a bench behind you, legs extended.', 'Lower your hips toward the floor by bending your elbows.', 'Press back up to full extension without shrugging your shoulders.'] },
  { name: 'Parallel Bar Dip (Triceps)', primary_muscles: ['triceps'], secondary_muscles: ['chest'],
    cues: ['Keep your torso upright to bias the triceps over the chest.', 'Lower until your elbows reach about 90 degrees.', 'Press back up to full lockout.'] },
  { name: 'JM Press', primary_muscles: ['triceps'], secondary_muscles: ['chest'],
    cues: ['Set up like a close-grip bench press, elbows tucked.', 'Lower the bar toward your neck, bending elbows and dropping slightly.', 'Press back up to full extension in one smooth motion.'] },
  { name: 'Machine Triceps Extension', primary_muscles: ['triceps'], secondary_muscles: [],
    cues: ['Adjust the seat so your elbows align with the machine pivot.', 'Extend your arms fully without lifting off the pad.', 'Return under control, keeping tension on the triceps.'] },
  { name: 'Wrist Curl', primary_muscles: ['forearms'], secondary_muscles: [],
    cues: ['Rest your forearms on a bench, wrists hanging off the edge.', 'Curl your wrists up, lifting the bar as high as you can.', 'Lower slowly to a full stretch before the next rep.'] },
  { name: 'Reverse Wrist Curl', primary_muscles: ['forearms'], secondary_muscles: [],
    cues: ['Rest your forearms on a bench, palms facing down.', 'Raise your knuckles up by extending your wrists.', 'Lower slowly to a full stretch.'] },
  { name: 'Dead Hang', primary_muscles: ['forearms'], secondary_muscles: ['lats'],
    cues: ['Grip the bar and let your body hang fully relaxed.', 'Keep your shoulder blades slightly set, not fully shrugged up.', 'Hold for time, breathing steadily throughout.'] },
  { name: 'Plate Pinch Hold', primary_muscles: ['forearms'], secondary_muscles: [],
    cues: ['Pinch two plates together smooth-side out.', 'Hold at your sides with a straight, tall posture.', 'Hold for time without letting the plates slide apart.'] },
  { name: 'Wrist Roller', primary_muscles: ['forearms'], secondary_muscles: [],
    cues: ['Hold the roller at arm\'s length in front of you.', 'Roll the handle to wind the weight up, one wrist rotation at a time.', 'Reverse the motion under control to lower the weight back down.'] },
  { name: 'Front Squat', primary_muscles: ['quads'], secondary_muscles: ['abs', 'glutes'],
    cues: ['Rack the bar across your front shoulders, elbows high.', 'Sit down between your knees, keeping your torso upright.', 'Drive through your feet to stand, elbows staying high throughout.'] },
  { name: 'High-Bar Squat', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Set the bar high on your traps, feet shoulder-width.', 'Sit down and back, keeping your torso relatively upright.', 'Drive through the whole foot to stand.'] },
  { name: 'Low-Bar Squat', primary_muscles: ['glutes', 'quads'], secondary_muscles: ['hamstrings', 'lower_back'],
    cues: ['Set the bar lower on your rear delts, slightly wider grip.', 'Sit back with more forward torso lean than a high-bar squat.', 'Drive your hips forward and up together to stand.'] },
  { name: 'Pause Squat', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['abs'],
    cues: ['Set up exactly as you would for a regular back squat.', 'Lower to depth and pause for a full count without bouncing.', 'Drive out of the pause through your whole foot to stand.'] },
  { name: 'Box Squat', primary_muscles: ['glutes', 'quads'], secondary_muscles: ['hamstrings'],
    cues: ['Set a box at or just below your normal squat depth.', 'Sit back onto the box under control, keeping tension in your legs.', 'Drive through your feet to stand without rocking off the box.'] },
  { name: 'Hack Squat', primary_muscles: ['quads'], secondary_muscles: ['glutes'],
    cues: ['Set your shoulders and back flat against the pads.', 'Lower under control until your knees reach about 90 degrees.', 'Press through your whole foot to stand without locking out hard.'] },
  { name: 'Belt Squat', primary_muscles: ['quads', 'glutes'], secondary_muscles: [],
    cues: ['Attach the belt and stand tall on the platform.', 'Squat down by sitting your hips back and down.', 'Drive through your feet to stand, keeping your torso upright.'] },
  { name: 'Step-Up', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Place your whole foot on a box in front of you.', 'Drive through that foot to stand fully on top of the box.', 'Step down under control and repeat, alternating legs evenly.'] },
  { name: 'Pistol Squat', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['abs'],
    cues: ['Stand on one leg with the other extended in front of you.', 'Lower under control as far as balance and mobility allow.', 'Drive through the standing foot to return to full standing.'] },
  { name: 'Single-Leg Romanian Deadlift', primary_muscles: ['hamstrings', 'glutes'], secondary_muscles: ['lower_back'],
    cues: ['Stand on one leg with a soft bend in the knee.', 'Hinge forward, letting your free leg rise behind you for balance.', 'Drive your hips forward to return to standing tall.'] },
  { name: 'Lying Leg Curl', primary_muscles: ['hamstrings'], secondary_muscles: ['glutes'],
    cues: ['Lie face down with the pad just above your heels.', 'Curl your heels toward your glutes without lifting your hips.', 'Lower with control back to the starting position.'] },
  { name: 'Seated Leg Curl', primary_muscles: ['hamstrings'], secondary_muscles: ['glutes'],
    cues: ['Sit with the pad resting against the back of your lower legs.', 'Curl your heels down and under without lifting off the seat.', 'Return with control back to the starting position.'] },
  { name: 'Glute-Ham Raise', primary_muscles: ['hamstrings'], secondary_muscles: ['glutes', 'lower_back'],
    cues: ['Anchor your feet and kneel tall, hips and shoulders in line.', 'Lower your torso forward as slowly as you can control it.', 'Curl back up by driving through your hamstrings and glutes.'] },
  { name: 'Barbell Hip Thrust', primary_muscles: ['glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Set your upper back on the bench with the bar over your hips.', 'Drive through your heels, squeezing glutes hard at the top.', 'Keep your chin tucked and ribs down to avoid overarching your lower back.'] },
  { name: 'Glute Bridge', primary_muscles: ['glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Lie on your back, knees bent, feet flat near your glutes.', 'Drive through your heels to lift your hips toward the ceiling.', 'Squeeze your glutes at the top, then lower under control.'] },
  { name: 'Single-Leg Hip Thrust', primary_muscles: ['glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Set your upper back on a bench, one foot planted.', 'Drive through the planted heel to raise your hips level.', 'Lower under control without letting your hips rotate.'] },
  { name: 'Cable Pull-Through', primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['lower_back'],
    cues: ['Face away from the low cable, feet shoulder-width apart.', 'Hinge at the hips, letting the cable pull between your legs.', 'Drive your hips forward to stand, squeezing your glutes.'] },
  { name: 'Frog Pump', primary_muscles: ['glutes'], secondary_muscles: [],
    cues: ['Lie on your back with the soles of your feet together.', 'Drive your hips up by squeezing your glutes hard.', 'Lower under control back to the floor.'] },
  { name: 'Curtsy Lunge', primary_muscles: ['glutes', 'quads'], secondary_muscles: ['hamstrings'],
    cues: ['Step one leg behind and across the other in a curtsy pattern.', 'Lower until both knees are bent to a comfortable depth.', 'Push through the front heel to return to standing.'] },
  { name: 'Glute Kickback Machine', primary_muscles: ['glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Set the pad against your working leg, hips level.', 'Extend your leg back and up by squeezing your glute.', 'Return under control without letting your lower back arch.'] },
  { name: 'Banded Clamshell', primary_muscles: ['glutes'], secondary_muscles: [],
    cues: ['Lie on your side with a band above your knees, knees bent.', 'Keep your feet together and raise your top knee against the band.', 'Lower under control without rolling your hips back.'] },
  { name: 'Donkey Calf Raise', primary_muscles: ['calves'], secondary_muscles: [],
    cues: ['Hinge forward with hips higher than your shoulders.', 'Rise onto your toes as high as possible.', 'Lower under control until you feel a full stretch.'] },
  { name: 'Leg Press Calf Raise', primary_muscles: ['calves'], secondary_muscles: [],
    cues: ['Place the balls of your feet on the lower edge of the platform.', 'Press through your toes to extend your ankles fully.', 'Lower under control to a full stretch before the next rep.'] },
  { name: 'Single-Leg Calf Raise', primary_muscles: ['calves'], secondary_muscles: [],
    cues: ['Stand on one foot with the ball of your foot on a raised edge.', 'Rise as high onto your toes as you can.', 'Lower under control to a full stretch, then repeat.'] },
  { name: 'Tibialis Raise', primary_muscles: ['calves'], secondary_muscles: [],
    cues: ['Lean your back against a wall, heels a step away from it.', 'Raise your toes up toward your shins as high as you can.', 'Lower under control back to the floor.'] },
  { name: 'Side Plank', primary_muscles: ['obliques'], secondary_muscles: ['abs'],
    cues: ['Stack your feet and prop up on one forearm.', 'Lift your hips so your body forms a straight line.', 'Hold steady, breathing evenly, without letting your hips drop.'] },
  { name: 'Hollow Hold', primary_muscles: ['abs'], secondary_muscles: ['obliques'],
    cues: ['Lie on your back and press your lower back into the floor.', 'Raise your shoulders and legs off the ground into a shallow curve.', 'Hold the position, keeping your lower back pinned down.'] },
  { name: 'Toes-to-Bar', primary_muscles: ['abs'], secondary_muscles: ['forearms'],
    cues: ['Hang from the bar with shoulder blades set.', 'Raise your legs by curling your pelvis up toward the bar.', 'Lower with control to avoid swinging into the next rep.'] },
  { name: 'Crunch', primary_muscles: ['abs'], secondary_muscles: [],
    cues: ['Lie on your back with knees bent, hands lightly behind your head.', 'Curl your shoulders up off the floor by contracting your abs.', 'Lower under control without pulling on your neck.'] },
  { name: 'Russian Twist', primary_muscles: ['obliques'], secondary_muscles: ['abs'],
    cues: ['Sit with knees bent, torso leaning back slightly, feet off the floor.', 'Rotate your torso to tap the floor on each side.', 'Keep the movement controlled rather than using momentum.'] },
  { name: 'Pallof Press', primary_muscles: ['obliques'], secondary_muscles: ['abs'],
    cues: ['Stand side-on to the cable, handle at chest height.', 'Press the handle straight out, resisting the pull to rotate.', 'Return under control while keeping your hips and shoulders square.'] },
  { name: 'Ab Wheel Rollout', primary_muscles: ['abs'], secondary_muscles: ['obliques', 'lower_back'],
    cues: ['Kneel and grip the wheel with your arms extended.', 'Roll forward as far as you can control without your hips sagging.', 'Pull back to the start by contracting your abs.'] },
  { name: 'Dragon Flag', primary_muscles: ['abs'], secondary_muscles: ['obliques'],
    cues: ['Anchor your upper back on a bench, hands gripping behind your head.', 'Raise your legs and hips into a straight line off the bench.', 'Lower as slowly as you can control, keeping your body rigid.'] },
  { name: 'Burpee', primary_muscles: ['quads', 'chest'], secondary_muscles: ['abs', 'glutes'],
    cues: ['Drop into a squat and place your hands on the floor.', 'Kick your feet back into a plank, then return them to your hands.', 'Explode upward into a jump to finish the rep.'] },
  { name: 'Thruster', primary_muscles: ['quads', 'side_delts'], secondary_muscles: ['glutes', 'triceps'],
    cues: ['Hold the weight at your shoulders in a front-squat position.', 'Squat down, then drive up explosively into a press overhead.', 'Return the weight to your shoulders under control before the next rep.'] },
  { name: 'Turkish Get-Up', primary_muscles: ['abs', 'side_delts'], secondary_muscles: ['glutes', 'quads'],
    cues: ['Start lying down with the weight pressed straight up in one hand.', 'Move through each step slowly, keeping your eyes on the weight.', 'Stand fully upright, then reverse the sequence back to the floor.'] },
  { name: 'Sled Push', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['calves'],
    cues: ['Set your hands on the sled handles, arms mostly extended.', 'Drive with short, powerful steps, staying low and leaning in.', 'Keep your core braced and pushes steady through the whole set.'] },
  { name: 'Sled Pull', primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps'],
    cues: ['Attach the strap or rope and face the sled.', 'Pull hand over hand, leaning back slightly for leverage.', 'Keep steady tension rather than jerking the rope.'] },
  { name: 'Tire Flip', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['upper_back', 'abs'],
    cues: ['Squat down and get your hands under the tire\'s edge.', 'Drive through your legs and hips to lift and flip the tire.', 'Follow through with your hands to push it over fully.'] },
  { name: 'Snatch', primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['side_delts', 'upper_back'],
    cues: ['Start with the bar over mid-foot, hips higher than the knees.', 'Extend explosively through hips, knees, and ankles as the bar rises.', 'Pull under the bar fast into an overhead squat catch, arms locked.'] },
  { name: 'Power Snatch', primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['side_delts', 'forearms'],
    cues: ['Start from a hang or the floor, hips back and chest up.', 'Extend violently through the hips, keeping the bar close to your body.', 'Catch the bar overhead in a quarter-squat position, arms locked.'] },
  { name: 'Overhead Squat', primary_muscles: ['quads', 'abs'], secondary_muscles: ['glutes', 'side_delts'],
    cues: ['Press the bar overhead with a wide, stable grip.', 'Squat down while keeping the bar stacked over your ears.', 'Drive up through your feet, bar staying locked out overhead.'] },
  { name: 'Clean', primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['quads', 'upper_back'],
    cues: ['Start with the bar over mid-foot, hips higher than the knees.', 'Extend explosively through hips, knees, and ankles as the bar rises.', 'Pull yourself under the bar fast, catching it on your shoulders.'] },
  { name: 'Hang Clean', primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['quads', 'forearms'],
    cues: ['Start from a hang just above the knees, hips pushed back.', 'Extend explosively through the hips as the bar rises along your thighs.', 'Catch the bar on your shoulders in a quarter-squat position.'] },
  { name: 'Clean and Jerk', primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['quads', 'side_delts'],
    cues: ['Clean the bar to your shoulders with an explosive hip extension.', 'Dip slightly, then drive the bar overhead and split or squat under it.', 'Stand tall to finish with the bar locked out overhead.'] },
  { name: 'Jerk', primary_muscles: ['side_delts', 'quads'], secondary_muscles: ['triceps'],
    cues: ['Start with the bar racked on your shoulders, feet set.', 'Dip and drive the bar upward, then punch under it into a split or squat.', 'Stand to finish with the bar locked out overhead.'] },
  { name: 'Jump Squat', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['calves'],
    cues: ['Start in a quarter squat, arms ready to swing.', 'Explode upward into a jump, extending fully in the air.', 'Land softly with bent knees, absorbing the impact before the next rep.'] },
  { name: 'Medicine Ball Slam', primary_muscles: ['abs', 'lats'], secondary_muscles: ['obliques'],
    cues: ['Hold the ball overhead with a strong, tall posture.', 'Slam the ball down forcefully in front of your feet, hinging at the hips.', 'Catch the bounce or reset the ball and repeat with control.'] },
  { name: 'Running (Outdoor)', primary_muscles: ['quads', 'calves'], secondary_muscles: ['hamstrings', 'glutes'],
    cues: ['Keep a tall, relaxed posture with a slight forward lean.', 'Land under your hips rather than reaching out in front.', 'Settle into a steady, sustainable rhythm for the distance.'] },
  { name: 'Treadmill Run', primary_muscles: ['quads', 'calves'], secondary_muscles: ['hamstrings', 'glutes'],
    cues: ['Set a pace you can sustain for the planned duration.', 'Keep your posture tall, avoiding leaning on the front rail.', 'Land lightly under your hips rather than overstriding.'] },
  { name: 'Treadmill Walk', primary_muscles: ['quads', 'calves'], secondary_muscles: ['glutes'],
    cues: ['Set an incline and pace that keeps you working comfortably.', 'Keep your posture upright, arms swinging naturally.', 'Maintain a steady stride length throughout the session.'] },
  { name: 'Incline Walk', primary_muscles: ['glutes', 'calves'], secondary_muscles: ['quads', 'hamstrings'],
    cues: ['Set an incline that raises your heart rate without straining your stride.', 'Drive through your whole foot on each step, especially the toes.', 'Keep your torso upright rather than leaning heavily on the rail.'] },
  { name: 'Sprint Intervals', primary_muscles: ['quads', 'hamstrings'], secondary_muscles: ['calves', 'glutes'],
    cues: ['Warm up thoroughly before your first hard effort.', 'Drive your knees and arms explosively during each sprint.', 'Use the full rest interval to recover before the next rep.'] },
  { name: '5K Run', primary_muscles: ['quads', 'calves'], secondary_muscles: ['hamstrings', 'glutes'],
    cues: ['Start conservatively to avoid burning out early.', 'Settle into a pace you can hold steadily for the distance.', 'Finish strong over the last stretch if you have pace in reserve.'] },
  { name: '10K Run', primary_muscles: ['quads', 'calves'], secondary_muscles: ['hamstrings', 'glutes'],
    cues: ['Pace conservatively over the first couple of kilometers.', 'Settle into a steady, sustainable rhythm for the middle miles.', 'Save a controlled effort increase for the final stretch.'] },
  { name: 'Cycling (Outdoor)', primary_muscles: ['quads', 'hamstrings'], secondary_muscles: ['calves', 'glutes'],
    cues: ['Set your seat height so your knee has a slight bend at full extension.', 'Pedal in smooth circles rather than just pushing down.', 'Keep a steady cadence appropriate to the terrain.'] },
  { name: 'Stationary Bike', primary_muscles: ['quads', 'hamstrings'], secondary_muscles: ['calves'],
    cues: ['Adjust the seat so your knee has a slight bend at full extension.', 'Pedal in smooth circles at a controlled, steady cadence.', 'Keep your upper body relaxed rather than gripping the bars tightly.'] },
  { name: 'Assault Bike', primary_muscles: ['quads', 'hamstrings'], secondary_muscles: ['front_delts', 'triceps'],
    cues: ['Set a pace you can sustain for the planned interval or duration.', 'Drive with both arms and legs together for full effort.', 'Keep steady form even as fatigue builds toward the finish.'] },
  { name: 'Rowing (Erg)', primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['quads', 'hamstrings'],
    cues: ['Drive first with your legs, then lean back, then pull the arms.', 'Reverse the order on the return: arms, then hinge, then legs.', 'Keep the stroke smooth and controlled rather than rushed.'] },
  { name: 'Swimming (Freestyle)', primary_muscles: ['lats', 'chest'], secondary_muscles: ['triceps', 'quads'],
    cues: ['Keep your body long and horizontal in the water.', 'Rotate your torso with each stroke rather than staying flat.', 'Breathe in a steady rhythm that matches your stroke count.'] },
  { name: 'Stair Climber', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['calves'],
    cues: ['Stand tall rather than leaning on the handrails.', 'Take full steps and drive through your whole foot.', 'Keep a steady, sustainable cadence for the duration.'] },
  { name: 'Elliptical', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings', 'calves'],
    cues: ['Stand tall with a light grip on the handles.', 'Drive through your legs rather than relying on the machine\'s momentum.', 'Keep a steady, sustainable pace for the planned duration.'] },
  { name: 'Jump Rope', primary_muscles: ['calves'], secondary_muscles: ['quads', 'front_delts'],
    cues: ['Keep your elbows close to your body, turning the rope with your wrists.', 'Jump just high enough to clear the rope, landing softly.', 'Keep a steady rhythm rather than jumping unnecessarily high.'] },
  { name: 'Hike', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings', 'calves'],
    cues: ['Set a sustainable pace for the terrain and distance.', 'Use trekking poles or arm swing to help on steeper sections.', 'Shorten your stride on descents to protect your knees.'] },
  { name: 'Couch Stretch', primary_muscles: ['quads'], secondary_muscles: [],
    cues: ['Kneel with your back foot propped against a wall or couch.', 'Sink your hips forward and down to deepen the stretch.', 'Hold steady, keeping your torso upright rather than leaning forward.'] },
  { name: '90-90 Hip Stretch', primary_muscles: ['glutes'], secondary_muscles: [],
    cues: ['Sit with both legs bent at 90 degrees, one in front, one to the side.', 'Lean your torso forward over the front leg to deepen the stretch.', 'Hold steady, then switch sides evenly.'] },
  { name: 'Pigeon Pose', primary_muscles: ['glutes'], secondary_muscles: [],
    cues: ['Bring one shin forward across your body, back leg extended.', 'Lower your hips toward the floor, keeping them square.', 'Hold steady, breathing deeply, then switch sides.'] },
  { name: 'World\'s Greatest Stretch', primary_muscles: ['hamstrings', 'quads'], secondary_muscles: ['glutes'],
    cues: ['Step into a long lunge with one hand on the floor.', 'Rotate your torso and reach the opposite arm toward the ceiling.', 'Return and repeat on the other side with control.'] },
  { name: 'Cat-Cow', primary_muscles: ['lower_back'], secondary_muscles: ['abs'],
    cues: ['Start on hands and knees with a neutral spine.', 'Arch your back and drop your belly, lifting your gaze.', 'Round your spine up toward the ceiling, tucking your chin.'] },
  { name: 'Thoracic Spine Rotation', primary_muscles: ['upper_back'], secondary_muscles: [],
    cues: ['Start on hands and knees, one hand behind your head.', 'Rotate your elbow up toward the ceiling, following it with your eyes.', 'Return under control, then repeat on the other side.'] },
  { name: 'Foam Roll Quads', primary_muscles: ['quads'], secondary_muscles: [],
    cues: ['Lie face down with the roller under your thighs.', 'Roll slowly from just above the knee toward your hip.', 'Pause on tender spots for a few breaths before continuing.'] },
  { name: 'Foam Roll Back', primary_muscles: ['upper_back'], secondary_muscles: ['lower_back'],
    cues: ['Lie with the roller under your upper back, knees bent.', 'Roll slowly between your shoulder blades and mid-back.', 'Avoid rolling directly over your lower spine.'] },
  { name: 'Shoulder Dislocates', primary_muscles: ['side_delts'], secondary_muscles: ['rear_delts'],
    cues: ['Hold a band or dowel with a wide, comfortable grip.', 'Raise your arms overhead and rotate them behind your back.', 'Reverse the motion under control back to the front.'] },
  { name: 'Hamstring Stretch', primary_muscles: ['hamstrings'], secondary_muscles: [],
    cues: ['Sit or stand with one leg extended in front of you.', 'Hinge forward from the hips, keeping your back reasonably flat.', 'Hold steady without bouncing, then switch sides.'] },
  { name: 'Calf Stretch', primary_muscles: ['calves'], secondary_muscles: [],
    cues: ['Stand facing a wall with one foot behind the other.', 'Keep your back heel down and lean forward to feel the stretch.', 'Hold steady, then switch sides.'] },
  { name: 'Close-Grip Lat Pulldown', primary_muscles: ['lats'], secondary_muscles: ['biceps', 'upper_back'],
    cues: ['Grip the close handle attachment, palms facing each other.', 'Pull down to your upper chest, driving elbows down and back.', 'Let the bar rise with control, keeping tension in your lats.'] },
  { name: 'Reverse-Grip Lat Pulldown', primary_muscles: ['lats'], secondary_muscles: ['biceps'],
    cues: ['Grip the bar with palms facing you, shoulder-width.', 'Pull down to your upper chest, leading with your elbows.', 'Control the return to a full overhead stretch.'] },
  { name: 'Neutral-Grip Lat Pulldown', primary_muscles: ['lats'], secondary_muscles: ['biceps', 'upper_back'],
    cues: ['Grip the neutral handles, palms facing each other.', 'Pull down to your upper chest, elbows driving down and back.', 'Control the return to a full stretch overhead.'] },
  { name: 'Seal Row', primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps'],
    cues: ['Lie face down on a raised bench, arms hanging to the floor.', 'Pull the bar to the bench, squeezing your shoulder blades together.', 'Lower under control without lifting your chest off the bench.'] },
  { name: 'Meadows Row', primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps'],
    cues: ['Stand perpendicular to a landmine bar, hinged forward.', 'Pull the bar to your hip, leading with your elbow.', 'Lower under control without twisting your torso.'] },
  { name: 'Landmine Row', primary_muscles: ['upper_back', 'lats'], secondary_muscles: ['biceps'],
    cues: ['Straddle the landmine bar, hinged forward with a flat back.', 'Pull the bar to your torso, squeezing your shoulder blades.', 'Lower under control without rounding your lower back.'] },
  { name: 'Smith Machine Bench Press', primary_muscles: ['chest'], secondary_muscles: ['triceps', 'front_delts'],
    cues: ['Set the bar path and bench so it lowers to mid-chest.', 'Lower the bar under control, elbows at about 45 degrees.', 'Press up smoothly along the fixed bar path.'] },
  { name: 'Dumbbell Pullover', primary_muscles: ['chest'], secondary_muscles: ['lats'],
    cues: ['Lie across a bench with a dumbbell held over your chest.', 'Lower the dumbbell back behind your head, keeping a slight elbow bend.', 'Pull it back over your chest, feeling your lats and chest work.'] },
  { name: 'Incline Cable Fly', primary_muscles: ['chest', 'front_delts'], secondary_muscles: [],
    cues: ['Set the bench to an incline between the low pulleys.', 'Sweep your hands up and together in an arc above your chest.', 'Control the return, keeping constant tension on the chest.'] },
  { name: 'Smith Machine Shoulder Press', primary_muscles: ['side_delts', 'front_delts'], secondary_muscles: ['triceps'],
    cues: ['Set the bench under the fixed bar path, handles at shoulder height.', 'Press up along the fixed path without arching your lower back.', 'Lower under control back to shoulder height.'] },
  { name: 'Cable Front Raise', primary_muscles: ['front_delts'], secondary_muscles: [],
    cues: ['Stand facing away from a low pulley, handle at your thigh.', 'Raise your arm forward to about shoulder height.', 'Lower under control without swinging your torso.'] },
  { name: 'Cuban Press', primary_muscles: ['side_delts'], secondary_muscles: ['rear_delts', 'triceps'],
    cues: ['Hold light dumbbells at your sides, elbows bent to 90 degrees.', 'Rotate your arms up so forearms point overhead, then press to lockout.', 'Reverse the sequence under control back to the start.'] },
  { name: 'Smith Machine Squat', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Set your feet slightly forward of the fixed bar path.', 'Lower under control until your knees reach about 90 degrees.', 'Drive through your feet to stand along the fixed path.'] },
  { name: 'Sissy Squat', primary_muscles: ['quads'], secondary_muscles: [],
    cues: ['Hold onto a support with your heels anchored or raised.', 'Lean back and bend your knees, lowering your torso in a straight line.', 'Drive through your quads to return to standing.'] },
  { name: 'Pendulum Squat', primary_muscles: ['quads', 'glutes'], secondary_muscles: [],
    cues: ['Set your shoulders against the pad, feet on the platform.', 'Lower along the machine\'s arc until your knees reach depth.', 'Drive through your feet to return to the top.'] },
  { name: 'Hip Abduction Machine', primary_muscles: ['glutes'], secondary_muscles: [],
    cues: ['Sit with the pads against the outside of your knees.', 'Push your knees outward against the resistance.', 'Return under control without letting the weight slam.'] },
  { name: 'Hip Adduction Machine', primary_muscles: ['glutes'], secondary_muscles: [],
    cues: ['Sit with the pads against the inside of your knees.', 'Squeeze your knees together against the resistance.', 'Return under control to a full stretch.'] },
  { name: 'Cable Kickback', primary_muscles: ['glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Attach an ankle strap to a low cable, hinge slightly forward.', 'Kick your leg back and up by squeezing your glute.', 'Return under control without arching your lower back.'] },
  { name: 'Reverse Hyperextension', primary_muscles: ['glutes', 'hamstrings'], secondary_muscles: ['lower_back'],
    cues: ['Lie face down on the pad with your legs hanging off the end.', 'Raise your legs up to hip height by squeezing your glutes.', 'Lower under control without swinging for momentum.'] },
  { name: 'Dumbbell Lunge', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Hold dumbbells at your sides, torso upright.', 'Step forward and lower until both knees are near 90 degrees.', 'Push through the front heel to return to standing.'] },
  { name: 'Goblet Lunge', primary_muscles: ['quads', 'glutes'], secondary_muscles: ['hamstrings'],
    cues: ['Hold the weight close to your chest, elbows tucked.', 'Step forward and lower until both knees are near 90 degrees.', 'Push through the front heel to return to standing.'] },
  { name: 'Cable Rope Hammer Curl', primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Attach a rope to a low pulley, elbows pinned to your sides.', 'Curl up with a neutral grip, keeping wrists straight.', 'Lower under control to full arm extension.'] },
  { name: 'Preacher Curl Machine', primary_muscles: ['biceps'], secondary_muscles: ['forearms'],
    cues: ['Rest your upper arms on the pad, seat adjusted to fit.', 'Curl the handles up without lifting your elbows off the pad.', 'Lower slowly to near-full extension.'] },
  { name: 'Cable Reverse Curl', primary_muscles: ['forearms'], secondary_muscles: ['biceps'],
    cues: ['Grip the bar with palms facing down, low pulley.', 'Curl up while keeping your wrists flat and firm.', 'Lower under control to full arm extension.'] },
  { name: 'Tricep Dip Machine', primary_muscles: ['triceps'], secondary_muscles: ['chest'],
    cues: ['Adjust the seat so your shoulders line up with the pivot.', 'Push the handles down to full arm extension.', 'Return under control, keeping tension on the triceps.'] },
  { name: 'Bicycle Crunch', primary_muscles: ['abs'], secondary_muscles: ['obliques'],
    cues: ['Lie on your back, hands lightly behind your head.', 'Bring opposite elbow to opposite knee in a pedaling motion.', 'Keep the movement controlled rather than rushed.'] },
  { name: 'Decline Crunch', primary_muscles: ['abs'], secondary_muscles: [],
    cues: ['Secure your legs on a decline bench, hands behind your head.', 'Curl your shoulders up off the bench by contracting your abs.', 'Lower under control without pulling on your neck.'] },
  { name: 'Cable Woodchopper', primary_muscles: ['obliques'], secondary_muscles: ['abs'],
    cues: ['Set the pulley high or low and stand side-on to the stack.', 'Rotate your torso to pull the handle across your body.', 'Control the return, keeping your hips relatively stable.'] },
  { name: 'Mountain Climbers', primary_muscles: ['abs'], secondary_muscles: ['quads'],
    cues: ['Start in a high plank with shoulders over your wrists.', 'Drive one knee toward your chest, then switch quickly.', 'Keep your hips low and steady rather than bouncing up.'] },
  { name: 'Hanging Knee Raise', primary_muscles: ['abs'], secondary_muscles: ['forearms'],
    cues: ['Hang from the bar with shoulder blades set.', 'Raise your knees toward your chest by curling your pelvis up.', 'Lower under control to avoid swinging into the next rep.'] },
  { name: 'Battle Ropes', primary_muscles: ['side_delts'], secondary_muscles: ['abs', 'forearms'],
    cues: ['Take an athletic stance, gripping a rope end in each hand.', 'Whip the ropes in steady waves, driving from your shoulders.', 'Keep your core braced throughout the interval.'] },
  { name: 'Ski Erg', primary_muscles: ['lats', 'triceps'], secondary_muscles: ['abs'],
    cues: ['Grip the handles with arms extended overhead.', 'Pull down by hinging at the hips and driving your arms down.', 'Return under control to the starting position and repeat.'] },
];

const MEDIA_ONLY: ExerciseMedia[] = MEDIA_ONLY_RAW.map((e) => ({
  id: localUuid(e.name),
  name: e.name,
  equipment: [],
  is_compound: false,
  primary_muscles: e.primary_muscles,
  secondary_muscles: e.secondary_muscles,
  cues: e.cues,
}));

for (const m of MEDIA_ONLY) {
  const key = normalizeExerciseName(m.name);
  if (!MEDIA_BY_NAME.has(key)) {
    MEDIA_BY_NAME.set(key, m);
    MEDIA_BY_ID.set(m.id, m);
  }
}

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
