/**
 * collapseMap.ts — GENERATED FILE, DO NOT EDIT BY HAND.
 *
 *   Regenerate: node scripts/reconcile-collapse-map.js
 *   Rationale:  docs/archive/qualifiers/collapse-report.md
 *
 * The reviewed variant->base collapse plan, consumed by the v22 migration.
 * Keyed and targeted by NORMALIZED EXERCISE NAME, never by id: local sets carry
 * server-assigned UUIDs that differ per environment, and a free device only
 * caches ids for exercises the user has actually touched. Name is the only key
 * that is guaranteed present on-device.
 */

export interface CollapseEntry {
  /** Canonical display name of the variant being merged away. */
  from: string;
  /** Canonical display name of the surviving base. */
  to: string;
  /** Qualifiers that reconstruct the variant. Empty = pure rename merge. */
  q: Record<string, string>;
}

/** Bases that do not exist as library rows yet and are created by the collapse. */
export const COLLAPSE_CREATE_BASES: string[] = ["Cable Fly","Lunge","Shrug"];

export const COLLAPSE_ENTRIES: CollapseEntry[] = [
  { from: "Alternating Dumbbell Curl", to: "Dumbbell Curl", q: {"laterality":"alternating"} },
  { from: "Assisted Pull-Up", to: "Pull-Up", q: {"load_mode":"assisted"} },
  { from: "Barbell Bench Press", to: "Bench Press", q: {} },
  { from: "Barbell Hip Thrust", to: "Hip Thrust", q: {"bar_type":"straight_barbell"} },
  { from: "Cable Fly (High to Low)", to: "Cable Fly", q: {"pulley_height":"high"} },
  { from: "Cable Fly (Low to High)", to: "Cable Fly", q: {"pulley_height":"floor"} },
  { from: "Cable Overhead Extension", to: "Overhead Cable Extension", q: {} },
  { from: "Cable Reverse Curl", to: "Cable Curl", q: {"grip_orientation":"pronated"} },
  { from: "Cable Rope Hammer Curl", to: "Cable Curl", q: {"attachment":"rope","grip_orientation":"neutral"} },
  { from: "Chest-Supported Dumbbell Row", to: "Dumbbell Row", q: {"body_position":"chest_supported"} },
  { from: "Chin-Up", to: "Pull-Up", q: {"grip_orientation":"supinated"} },
  { from: "Close-Grip Bench Press", to: "Bench Press", q: {"grip_width":"close"} },
  { from: "Close-Grip Lat Pulldown", to: "Lat Pulldown", q: {"grip_width":"close"} },
  { from: "Conventional Deadlift", to: "Deadlift", q: {} },
  { from: "Decline Barbell Bench Press", to: "Bench Press", q: {"bench_angle":"decline"} },
  { from: "Decline Crunch", to: "Crunch", q: {"bench_angle":"decline"} },
  { from: "Decline Dumbbell Press", to: "Dumbbell Bench Press", q: {"bench_angle":"decline"} },
  { from: "Diamond Push-Up", to: "Push-Up", q: {"grip_width":"close"} },
  { from: "Donkey Calf Raise", to: "Standing Calf Raise", q: {"body_position":"bent_over"} },
  { from: "Dumbbell Lunge", to: "Lunge", q: {"bar_type":"dumbbell"} },
  { from: "Dumbbell Skull Crusher", to: "Skull Crusher", q: {"bar_type":"dumbbell"} },
  { from: "EZ-Bar Curl", to: "Barbell Curl", q: {"bar_type":"ez_bar"} },
  { from: "EZ-Bar Skull Crusher", to: "Skull Crusher", q: {"bar_type":"ez_bar"} },
  { from: "Flat Dumbbell Fly", to: "Dumbbell Fly", q: {"bench_angle":"flat"} },
  { from: "Hammer Curl", to: "Dumbbell Curl", q: {"grip_orientation":"neutral"} },
  { from: "High-Bar Squat", to: "Back Squat", q: {"bar_position":"high_bar"} },
  { from: "Incline Barbell Bench Press", to: "Bench Press", q: {"bench_angle":"incline_30"} },
  { from: "Incline Cable Fly", to: "Cable Fly", q: {"bench_angle":"incline_30","pulley_height":"floor"} },
  { from: "Incline Dumbbell Curl", to: "Dumbbell Curl", q: {"bench_angle":"incline_45"} },
  { from: "Incline Dumbbell Fly", to: "Dumbbell Fly", q: {"bench_angle":"incline_30"} },
  { from: "Incline Dumbbell Press", to: "Dumbbell Bench Press", q: {"bench_angle":"incline_30"} },
  { from: "Low-Bar Squat", to: "Back Squat", q: {"bar_position":"low_bar"} },
  { from: "Lying Leg Curl", to: "Leg Curl", q: {"body_position":"lying_prone"} },
  { from: "Neutral-Grip DB Press", to: "Dumbbell Bench Press", q: {"grip_orientation":"neutral"} },
  { from: "Neutral-Grip DB Shoulder Press", to: "Dumbbell Shoulder Press", q: {"grip_orientation":"neutral"} },
  { from: "Neutral-Grip Lat Pulldown", to: "Lat Pulldown", q: {"grip_orientation":"neutral"} },
  { from: "Neutral-Grip Pulldown", to: "Lat Pulldown", q: {"grip_orientation":"neutral"} },
  { from: "Pause Squat", to: "Back Squat", q: {"rom":"paused"} },
  { from: "Rack Pull", to: "Deadlift", q: {"rom":"partial_top"} },
  { from: "Reverse Curl", to: "Barbell Curl", q: {"grip_orientation":"pronated"} },
  { from: "Reverse-Grip Lat Pulldown", to: "Lat Pulldown", q: {"grip_orientation":"supinated"} },
  { from: "Rope Pushdown", to: "Triceps Pushdown", q: {"attachment":"rope"} },
  { from: "Rope Tricep Pushdown", to: "Triceps Pushdown", q: {"attachment":"rope"} },
  { from: "Seated Barbell Press", to: "Overhead Press", q: {"body_position":"seated"} },
  { from: "Seated Leg Curl", to: "Leg Curl", q: {"body_position":"seated"} },
  { from: "Shrug (Barbell)", to: "Shrug", q: {"bar_type":"straight_barbell"} },
  { from: "Shrug (Dumbbell)", to: "Shrug", q: {"bar_type":"dumbbell"} },
  { from: "Single-Arm Dumbbell Row", to: "Dumbbell Row", q: {"laterality":"unilateral"} },
  { from: "Single-Leg Calf Raise", to: "Standing Calf Raise", q: {"laterality":"unilateral"} },
  { from: "Single-Leg Hip Thrust", to: "Hip Thrust", q: {"laterality":"unilateral"} },
  { from: "Single-Leg Romanian Deadlift", to: "Romanian Deadlift", q: {"laterality":"unilateral"} },
  { from: "Smith Machine Bench Press", to: "Bench Press", q: {"bar_type":"smith"} },
  { from: "Smith Machine Shoulder Press", to: "Overhead Press", q: {"bar_type":"smith"} },
  { from: "Sumo Deadlift", to: "Deadlift", q: {"stance":"sumo"} },
  { from: "Trap-Bar Deadlift", to: "Trap Bar Deadlift", q: {} },
  { from: "Walking Lunge", to: "Lunge", q: {"stance":"staggered"} },
  { from: "Weighted Dip", to: "Parallel Bar Dip (Triceps)", q: {"load_mode":"weighted"} },
  { from: "Weighted Pull-Up", to: "Pull-Up", q: {"load_mode":"weighted"} },
  { from: "Wide-Grip Lat Pulldown", to: "Lat Pulldown", q: {"grip_width":"wide"} },
  { from: "Wide-Grip Pull-Up", to: "Pull-Up", q: {"grip_width":"wide","grip_orientation":"pronated"} },
];

/** Old names that must stay searchable, base name -> aliases it now owns. */
export const COLLAPSE_ALIASES: Record<string, string[]> = {
 "Ab Wheel Rollout": [
  "ab wheel",
  "wheel rollout",
  "abdominal wheel rollout"
 ],
 "Barbell Row": [
  "bent-over row",
  "BB row",
  "barbell bent over row"
 ],
 "Burpee": [
  "burpees"
 ],
 "Cable Curl": [
  "cable bicep curl",
  "low pulley curl",
  "standing cable curl"
 ],
 "Deadlift": [
  "conventional deadlift",
  "barbell deadlift",
  "DL",
  "rack deadlift",
  "partial deadlift",
  "block pull",
  "Rack Pull"
 ],
 "Push-Up": [
  "pushups",
  "press-up",
  "standard push-up"
 ],
 "Skull Crusher": [
  "lying tricep extension",
  "skullcrushers",
  "french press (lying)",
  "lying triceps extension"
 ],
 "Glute Kickback Machine": [
  "cable kickback machine",
  "glute kickback",
  "hip extension machine"
 ],
 "Hanging Leg Raise": [
  "hanging leg lift",
  "toes to bar (strict)",
  "HLR"
 ],
 "Dumbbell Bench Press": [
  "db bench",
  "dumbbell chest press",
  "flat dumbbell press",
  "neutral grip db bench",
  "hammer grip dumbbell press",
  "Neutral-Grip DB Press",
  "decline DB press",
  "decline dumbbell bench press",
  "Decline Dumbbell Press"
 ],
 "Leg Curl": [
  "hamstring curl",
  "leg curl machine",
  "lying leg curl",
  "seated leg curl",
  "seated hamstring curl",
  "seated ham curl",
  "Seated Leg Curl",
  "lying hamstring curl",
  "prone leg curl",
  "prone hamstring curl",
  "Lying Leg Curl"
 ],
 "Machine Triceps Extension": [
  "triceps extension machine",
  "machine triceps press",
  "seated triceps extension machine"
 ],
 "Overhead Squat": [
  "OHS",
  "overhead squat snatch grip"
 ],
 "Plate Pinch Hold": [
  "plate pinch",
  "pinch grip hold",
  "plate pinch grip"
 ],
 "Reverse Hyperextension": [
  "reverse hyper",
  "reverse hyperextension machine"
 ],
 "Overhead Press": [
  "OHP",
  "military press",
  "standing barbell press",
  "shoulder press"
 ],
 "Romanian Deadlift": [
  "RDL",
  "Romanian deadlifts",
  "stiff-leg-style RDL"
 ],
 "Step-Up": [
  "box step-up",
  "weighted step-up",
  "step ups"
 ],
 "Trap Bar Deadlift": [
  "trap bar deadlifts",
  "hex bar deadlift",
  "hex deadlift"
 ],
 "Pull-Up": [
  "pullups",
  "pull ups",
  "wide-grip pull-up",
  "weighted pullups",
  "weighted chin-up",
  "belt pull-up",
  "Weighted Pull-Up"
 ],
 "Dumbbell Curl": [
  "DB curl",
  "dumbbell bicep curl",
  "standing dumbbell curl",
  "alternating dumbbell curl",
  "hammer curls",
  "neutral-grip dumbbell curl",
  "Hammer Curl",
  "incline curl",
  "incline DB curl",
  "Incline Dumbbell Curl"
 ],
 "Belt Squat": [
  "belt squat machine",
  "hip belt squat",
  "dip belt squat"
 ],
 "Cable Crossover": [
  "cable fly crossover",
  "standing cable crossover",
  "high cable crossover",
  "low cable crossover"
 ],
 "Crunch": [
  "ab crunch",
  "floor crunch",
  "sit-up crunch",
  "decline sit-up crunch",
  "decline bench crunch",
  "decline ab crunch",
  "Decline Crunch"
 ],
 "Dip (Chest-Focused)": [
  "chest dip",
  "wide grip dip",
  "forward-lean dip"
 ],
 "Barbell Curl": [
  "straight bar curl",
  "standing barbell curl",
  "BB curl",
  "reverse grip curl",
  "reverse bicep curl",
  "pronated curl",
  "overhand curl",
  "Reverse Curl"
 ],
 "Glute-Ham Raise": [
  "GHR",
  "GHD raise",
  "glute ham developer raise"
 ],
 "Back Squat": [
  "squat",
  "barbell squat",
  "high-bar squat",
  "low bar back squat",
  "powerlifting squat",
  "Low-Bar Squat",
  "paused squat",
  "dead-stop squat",
  "Pause Squat"
 ],
 "Inverted Row": [
  "bodyweight row",
  "supine row",
  "reverse row",
  "horizontal pull-up"
 ],
 "Leg Extension": [
  "quad extension",
  "knee extension machine"
 ],
 "Meadows Row": [
  "Meadows landmine row"
 ],
 "Overhead Triceps Extension": [
  "overhead tricep extension",
  "French press",
  "skull crusher (overhead variant)",
  "triceps extension overhead"
 ],
 "Pogo Hops": [
  "ankle pogos",
  "pogo jumps",
  "pogo hop drill"
 ],
 "Reverse Lunge": [
  "backward lunge",
  "step-back lunge",
  "reverse lunges"
 ],
 "Seated Box Jump": [
  "seated box jumps",
  "dead-stop box jump"
 ],
 "Sissy Squat": [
  "sissy squats",
  "quad squat"
 ],
 "Stiff-Leg Deadlift": [
  "SLDL",
  "stiff legged deadlift",
  "straight leg deadlift"
 ],
 "Trap-Bar Jump": [
  "trap bar jump squat",
  "hex bar jump"
 ],
 "Wrist Curl": [
  "barbell wrist curl",
  "seated wrist curl",
  "palms-up wrist curl"
 ],
 "Arnold Press": [
  "arnold dumbbell press",
  "rotational shoulder press",
  "arnold shoulder press"
 ],
 "Bench Dip": [
  "tricep bench dip",
  "bench dips",
  "floor dip"
 ],
 "Cable Crunch": [
  "cable kneeling crunch",
  "rope crunch",
  "kneeling cable crunch"
 ],
 "Cable Woodchopper": [
  "cable chop",
  "high-to-low woodchopper",
  "low-to-high woodchopper",
  "wood chop"
 ],
 "Cuban Press": [
  "cuban rotation press",
  "3-way shoulder press",
  "cuban rotation"
 ],
 "Standing Calf Raise": [
  "calf raises",
  "standing calf raise machine",
  "standing calves"
 ],
 "Goblet Lunge": [
  "goblet lunges",
  "kettlebell goblet lunge",
  "dumbbell goblet lunge"
 ],
 "Hip Abduction Machine": [
  "seated hip abductor machine",
  "abductor machine",
  "hip abductor"
 ],
 "JM Press": [
  "jm press tricep",
  "blakley press"
 ],
 "Leg Press": [
  "leg press machine",
  "45-degree leg press",
  "horizontal leg press",
  "seated leg press"
 ],
 "Medicine Ball Slam": [
  "med ball slam",
  "slam ball throw",
  "ball slams"
 ],
 "Pallof Press": [
  "anti-rotation press",
  "cable pallof press",
  "pallof hold"
 ],
 "Power Clean": [
  "power clean (barbell)",
  "clean (power)"
 ],
 "Reverse Pec Deck": [
  "rear delt fly machine",
  "pec deck reverse fly",
  "machine reverse fly",
  "rear delt machine"
 ],
 "Seated Cable Row": [
  "cable row",
  "seated row",
  "low cable row",
  "close-grip seated row"
 ],
 "Straight-Arm Pulldown": [
  "straight arm lat pulldown",
  "cable lat pushdown (straight arm)",
  "lat prayer",
  "pulldown lat prayer"
 ],
 "Tricep Dip Machine": [
  "assisted dip machine (triceps)",
  "seated dip machine",
  "dip machine"
 ],
 "Wrist Roller": [
  "forearm roller",
  "wrist roller device",
  "rope and weight roller"
 ],
 "Bench Press": [
  "flat bench press",
  "BB bench press",
  "barbell bench press",
  "bench",
  "smith bench press",
  "smith machine chest press",
  "smith press",
  "Smith Machine Bench Press",
  "decline bench press",
  "decline bench",
  "Decline Barbell Bench Press",
  "incline bench press",
  "incline bench",
  "Incline Barbell Bench Press",
  "BB bench",
  "competition bench press",
  "Barbell Bench Press",
  "CGBP",
  "close grip bench",
  "narrow grip bench press",
  "tricep bench press",
  "Close-Grip Bench Press"
 ],
 "Dumbbell Row": [
  "one-arm dumbbell row",
  "single-arm row",
  "DB row",
  "bent-over dumbbell row"
 ],
 "Curtsy Lunge": [
  "curtsy lunges",
  "cross-behind lunge",
  "curtsey lunge"
 ],
 "Dragon Flag": [
  "dragon flags"
 ],
 "Face Pull": [
  "cable face pull",
  "rope face pull"
 ],
 "Goblet Squat": [
  "dumbbell goblet squat",
  "kettlebell goblet squat"
 ],
 "Hip Adduction Machine": [
  "adductor machine",
  "inner thigh machine",
  "hip adductor machine"
 ],
 "Jerk": [
  "push jerk",
  "power jerk",
  "split jerk",
  "squat jerk"
 ],
 "Leg Press Calf Raise": [
  "calf press on leg press",
  "leg press toe press"
 ],
 "Mountain Climbers": [
  "mountain climber",
  "running planks"
 ],
 "Parallel Bar Dip (Triceps)": [
  "tricep dips",
  "parallel bar dips",
  "bar dips (upright)",
  "weighted dips",
  "dip with belt",
  "loaded dip",
  "Weighted Dip"
 ],
 "Power Snatch": [
  "power snatches"
 ],
 "Reverse Wrist Curl": [
  "wrist extension curl",
  "reverse wrist curls"
 ],
 "Seated Calf Raise": [
  "seated calf raise machine",
  "seated calves"
 ],
 "Sled Pull": [
  "sled drag",
  "sled rope pull",
  "backward sled pull"
 ],
 "Suitcase Carry": [
  "suitcase walk",
  "one-arm farmer carry",
  "offset carry"
 ],
 "Triceps Kickback": [
  "tricep kickback",
  "dumbbell kickback",
  "cable tricep kickback"
 ],
 "Zottman Curl": [
  "zottman curls"
 ],
 "Jump Squat": [
  "squat jump",
  "loaded jump squat"
 ],
 "Hip Thrust": [
  "barbell hip thrust",
  "glute bridge with load",
  "barbell hip thrusts",
  "BB hip thrust",
  "hip thrusters",
  "weighted hip thrust",
  "Barbell Hip Thrust",
  "single leg hip thrusts",
  "one-leg hip thrust",
  "unilateral hip thrust",
  "SL hip thrust",
  "Single-Leg Hip Thrust"
 ],
 "Good Morning": [
  "barbell good morning",
  "GM"
 ],
 "Sled Push": [
  "prowler push",
  "prowler sled"
 ],
 "Dead Bug": [
  "dead bugs",
  "dead bug hold"
 ],
 "Dumbbell Fly": [
  "DB fly",
  "chest fly",
  "dumbbell flye",
  "pec fly",
  "incline dumbbell flyes",
  "incline fly",
  "incline chest fly",
  "incline flye",
  "Incline Dumbbell Fly"
 ],
 "Chest-Supported Row": [
  "chest supported db row",
  "incline bench row"
 ],
 "Bent-Over Reverse Fly": [
  "rear delt fly",
  "bent-over rear lateral raise",
  "reverse flyes"
 ],
 "Cable Fly": [
  "high to low cable fly",
  "cable crossover high to low",
  "decline cable fly",
  "Cable Fly (High to Low)",
  "low to high cable fly",
  "upward cable fly",
  "low pulley fly",
  "low cable fly",
  "Cable Fly (Low to High)",
  "incline cable chest fly",
  "low-to-high cable fly",
  "incline cable crossover",
  "Incline Cable Fly"
 ],
 "Lat Pulldown": [
  "lat pull down",
  "pulldown",
  "pulldowns",
  "cable pulldown",
  "close grip pulldown",
  "narrow grip lat pulldown",
  "CG lat pulldown",
  "Close-Grip Lat Pulldown",
  "wide grip pulldown",
  "wide-grip pulldowns",
  "wide lat pulldown",
  "wide grip lat pull down",
  "Wide-Grip Lat Pulldown"
 ],
 "Triceps Pushdown": [
  "tricep pushdown",
  "cable pushdown",
  "triceps extension (cable)",
  "cable rope pushdown",
  "tricep rope extension",
  "Rope Pushdown",
  "tricep rope pushdown",
  "cable rope extension",
  "Rope Tricep Pushdown"
 ],
 "Preacher Curl": [
  "preacher bench curl",
  "preacher bicep curl"
 ],
 "Band Curl": [
  "resistance band curl",
  "band bicep curl",
  "band curls"
 ],
 "Bicycle Crunch": [
  "bicycle crunches",
  "cross-body bicycle crunch"
 ],
 "Dead Hang": [
  "bar hang",
  "passive hang",
  "active hang"
 ],
 "Floor Press": [
  "barbell floor press",
  "floor bench press"
 ],
 "Hack Squat": [
  "hack squat machine",
  "45-degree hack squat",
  "sled hack squat"
 ],
 "Hollow Hold": [
  "hollow body hold"
 ],
 "Kettlebell Swing": [
  "KB swing",
  "Russian swing",
  "hardstyle swing",
  "two-hand kettlebell swing"
 ],
 "Dumbbell Shoulder Press": [
  "DB shoulder press",
  "seated dumbbell press",
  "standing dumbbell shoulder press",
  "dumbbell press"
 ],
 "Pec Deck": [
  "pec deck machine",
  "chest fly machine",
  "butterfly machine",
  "machine chest fly"
 ],
 "Preacher Curl Machine": [
  "machine preacher curl",
  "preacher curl machine bicep curl",
  "seated preacher curl machine"
 ],
 "Ring Row": [
  "gymnastic ring row",
  "suspension row",
  "TRX row"
 ],
 "Shrug": [
  "barbell shrug",
  "barbell trap shrug",
  "barbell shoulder shrug",
  "Shrug (Barbell)",
  "dumbbell shrug",
  "DB shrugs",
  "shrugs (dumbbell)",
  "Shrug (Dumbbell)"
 ],
 "T-Bar Row": [
  "T bar rows",
  "T-bar rowing",
  "chest-supported T-bar row"
 ],
 "Turkish Get-Up": [
  "TGU",
  "Turkish getup",
  "Turkish get up"
 ],
 "Band Pull-Apart": [
  "band pull aparts",
  "resistance band pull-apart",
  "rear delt pull-apart"
 ],
 "Bodyweight Squat": [
  "air squat",
  "BW squat",
  "bodyweight squats"
 ],
 "Cable Front Raise": [
  "cable front delt raise",
  "low cable front raise"
 ],
 "Clean": [
  "squat clean",
  "clean (from floor)"
 ],
 "Frog Pump": [
  "frog pumps",
  "butterfly hip thrust",
  "banded frog pump"
 ],
 "Hyperextension": [
  "back extension",
  "hyperextensions",
  "45-degree back extension",
  "GHD back extension",
  "Roman chair back extension"
 ],
 "Landmine Press": [
  "landmine shoulder press",
  "single-arm landmine press",
  "landmine strict press"
 ],
 "Machine Chest Press": [
  "chest press machine",
  "seated chest press",
  "plate-loaded chest press"
 ],
 "Pendlay Row": [
  "Pendlay row",
  "dead-stop row",
  "explosive barbell row"
 ],
 "Thruster": [
  "barbell thruster",
  "thrusters",
  "squat-to-press"
 ],
 "Upright Row": [
  "barbell upright row",
  "cable upright row",
  "EZ-bar upright row"
 ],
 "Banded Clamshell": [
  "clamshell",
  "band clamshell",
  "hip abduction clamshell"
 ],
 "Box Jump": [
  "box jumps",
  "plyo box jump"
 ],
 "Cable Kickback": [
  "cable glute kickback",
  "glute kickback"
 ],
 "Clean and Jerk": [
  "clean & jerk",
  "C&J"
 ],
 "Lunge": [
  "dumbbell lunges",
  "DB lunge",
  "Dumbbell Lunge",
  "walking lunges",
  "traveling lunge",
  "Walking Lunge"
 ],
 "Front Raise": [
  "front raises",
  "shoulder front raise",
  "anterior deltoid raise"
 ],
 "Handstand Push-Up": [
  "HSPU",
  "handstand pushup"
 ],
 "Landmine Row": [
  "landmine rows",
  "single-arm landmine row",
  "T-bar landmine row"
 ],
 "Machine Curl": [
  "preacher machine curl",
  "bicep curl machine",
  "seated machine curl"
 ],
 "Pendulum Squat": [
  "pendulum squat machine"
 ],
 "Push Press": [
  "push presses",
  "barbell push press"
 ],
 "Side Plank": [
  "side planks",
  "lateral plank",
  "side plank hold"
 ],
 "Smith Machine Squat": [
  "smith squat",
  "guided squat"
 ],
 "Tibialis Raise": [
  "tib raise",
  "tibialis anterior raise",
  "wall tib raise"
 ],
 "Box Squat": [
  "box squats",
  "squat to box",
  "westside box squat"
 ],
 "Cable Lateral Raise": [
  "cable lat raise",
  "cable side raise",
  "low cable lateral raise"
 ],
 "Dumbbell Pullover": [
  "DB pullover",
  "lat pullover",
  "straight-arm pullover"
 ],
 "Front Squat": [
  "barbell front squat",
  "clean grip front squat",
  "cross-arm front squat"
 ],
 "Hang Clean": [
  "clean from the hang"
 ],
 "Machine Lateral Raise": [
  "lateral raise machine",
  "seated lateral raise machine",
  "delt machine"
 ],
 "Nordic Curl": [
  "Nordic hamstring curl",
  "NHC",
  "glute-ham raise negative",
  "Nordic ham curl"
 ],
 "Pike Push-Up": [
  "pike pushups",
  "pike press",
  "elevated pike push-up"
 ],
 "Snatch": [
  "squat snatch",
  "barbell snatch"
 ],
 "Tire Flip": [
  "tyre flip",
  "tire flips"
 ],
 "Broad Jump": [
  "standing broad jump",
  "standing long jump"
 ],
 "Overhead Cable Extension": [
  "overhead cable tricep extension",
  "rope overhead extension",
  "standing overhead cable extension"
 ],
 "Front-Foot-Elevated Split Squat": [
  "FFE split squat",
  "front foot elevated lunge"
 ],
 "Lateral Bound": [
  "skater jump",
  "lateral hop",
  "side bound"
 ],
 "Machine Row": [
  "seated machine row",
  "chest-supported machine row",
  "iso-lateral row"
 ],
 "Pistol Squat": [
  "single-leg squat",
  "one-leg squat"
 ],
 "Russian Twist": [
  "seated twist",
  "weighted russian twist",
  "oblique twist"
 ],
 "Spider Curl": [
  "spider bicep curl",
  "prone incline curl"
 ],
 "Toes-to-Bar": [
  "TTB",
  "toes to bar"
 ],
 "Bulgarian Split Squat": [
  "BSS",
  "rear foot elevated split squat",
  "RFESS",
  "Bulgarian split squats",
  "rear-elevated split squat"
 ],
 "Cable Pull-Through": [
  "cable pull throughs",
  "pull-through",
  "rope pull-through",
  "cable pull thru"
 ],
 "Concentration Curl": [
  "concentration curls",
  "seated concentration curl",
  "one-arm concentration curl"
 ],
 "Depth Jump": [
  "depth jumps",
  "drop jump",
  "box depth jump"
 ],
 "Glute Bridge": [
  "glute bridges",
  "hip bridge",
  "floor bridge",
  "supine bridge"
 ],
 "Hanging Knee Raise": [
  "hanging knee raises",
  "hanging knee tucks",
  "knee-ups"
 ],
 "Lateral Raise": [
  "lateral raises",
  "side raise",
  "dumbbell lateral raise",
  "DB lateral raise"
 ],
 "Machine Shoulder Press": [
  "machine press",
  "shoulder press machine",
  "seated machine press"
 ],
 "Plank": [
  "planks",
  "front plank",
  "forearm plank"
 ],
 "Seal Row": [
  "seal rows",
  "bench row (prone)",
  "chest-supported prone row"
 ],
 "10K Run": [
  "10k",
  "10 km run",
  "ten kilometer run",
  "10k race"
 ],
 "5K Run": [
  "5k",
  "5 km run",
  "five kilometer run",
  "5k race"
 ],
 "90-90 Hip Stretch": [
  "90/90 hip stretch",
  "90 90 stretch",
  "hip 90-90"
 ],
 "Assault Bike": [
  "air bike",
  "airdyne",
  "fan bike"
 ],
 "Battle Ropes": [
  "battling ropes",
  "rope waves",
  "battle rope slams"
 ],
 "Calf Stretch": [
  "standing calf stretch",
  "wall calf stretch",
  "gastrocnemius stretch"
 ],
 "Cat-Cow": [
  "cat cow stretch",
  "cat-camel"
 ],
 "Couch Stretch": [
  "rear-foot-elevated hip flexor stretch",
  "couch hip flexor stretch"
 ],
 "Cycling (Outdoor)": [
  "road cycling",
  "outdoor bike ride",
  "biking"
 ],
 "Elliptical": [
  "elliptical trainer",
  "cross trainer"
 ],
 "Foam Roll Back": [
  "foam rolling back",
  "back foam roll",
  "SMR back"
 ],
 "Foam Roll Quads": [
  "foam rolling quads",
  "quad foam roll",
  "SMR quads"
 ],
 "Hamstring Stretch": [
  "seated hamstring stretch",
  "standing hamstring stretch",
  "forward fold"
 ],
 "Hike": [
  "hiking",
  "trail hike"
 ],
 "Incline Walk": [
  "incline treadmill walk",
  "hill walk"
 ],
 "Jump Rope": [
  "skipping rope",
  "rope skipping",
  "double unders"
 ],
 "Pigeon Pose": [
  "pigeon stretch",
  "one-legged king pigeon prep"
 ],
 "Rowing (Erg)": [
  "rowing machine",
  "row erg",
  "concept2 row",
  "indoor rowing"
 ],
 "Running (Outdoor)": [
  "outdoor run",
  "road run",
  "jogging"
 ],
 "Shoulder Dislocates": [
  "shoulder dislocations",
  "overhead shoulder pass-through",
  "PVC pass-through"
 ],
 "Ski Erg": [
  "ski ergometer",
  "ski erg machine"
 ],
 "Sprint Intervals": [
  "sprints",
  "interval sprints",
  "HIIT sprints"
 ],
 "Stair Climber": [
  "stairmaster",
  "stair mill",
  "stepmill"
 ],
 "Stationary Bike": [
  "exercise bike",
  "spin bike",
  "indoor cycling"
 ],
 "Swimming (Freestyle)": [
  "freestyle swim",
  "front crawl",
  "swim laps"
 ],
 "Thoracic Spine Rotation": [
  "thoracic rotation",
  "open book stretch",
  "quadruped thoracic rotation"
 ],
 "Treadmill Run": [
  "treadmill running",
  "indoor run"
 ],
 "Treadmill Walk": [
  "treadmill walking",
  "indoor walk"
 ]
};
