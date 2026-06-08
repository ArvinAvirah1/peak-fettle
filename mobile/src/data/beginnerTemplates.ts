/**
 * beginnerTemplates — TICKET-098
 *
 * Beginner training programs shipped *with the app* (bundled, not DB-fetched) so
 * they ALWAYS load — even offline / when the templates API is down. This removes
 * the network/DB dependency that made the server-served templates fail to load,
 * and aligns with the local-first direction (TICKET-094).
 *
 * Three splits (founder, 2026-06-06): 3-day PPL, 6-day PPL, Upper/Lower 4-day.
 *
 * Safe-swap policy (ALL templates):
 *   • NO barbell back squat        → Leg Press / Hack Squat
 *   • NO conventional (barbell) deadlift → DB Romanian Deadlift / Hip Thrust
 * No exercise here requires a spotter (machine / dumbbell variants).
 *
 * Identifier scheme (the one open blocker, now resolved): the global exercise
 * library identifies rows by UUID `id` + `name` — there is NO slug column
 * (see mobile/src/types/api.ts + db/schema.sql). So each bundled exercise carries
 * a STABLE local `slug` (used by the app + future backup) AND a `libraryName`
 * that matches a real seeded row, which the resolver maps slug → library UUID at
 * load. If the library can't be reached (offline) or a name is missing, we degrade
 * gracefully to a name-only session (exerciseId ''), which the stepper accepts —
 * a set logged that way is still valid (TICKET-088 made exercise_id optional).
 */

import type { RoutineSession, RoutineSessionExercise } from '../components/RoutineStrip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BundledExerciseMeta {
  /** Exact name of a seeded row in the global exercise library (for UUID resolution). */
  libraryName: string;
  /** What to show the user, if different from libraryName (e.g. a variant cue). */
  display?: string;
  category: 'lift' | 'cardio';
}

export interface BundledExerciseRef {
  /** Stable local key into BEGINNER_EXERCISE_CATALOG. */
  slug: string;
  sets: number;
  /** Rep target, e.g. "8-12". ASCII hyphen to match the app's target_reps. */
  reps: string;
}

export interface BundledDay {
  /** Stable local key, e.g. 'push-a'. */
  slug: string;
  /** Display name, e.g. 'Push' / 'Push A'. */
  name: string;
  exercises: BundledExerciseRef[];
}

export interface BundledProgram {
  /** Stable local key, e.g. 'ppl-3'. */
  id: string;
  name: string;
  subtitle: string;
  daysPerWeek: number;
  days: BundledDay[];
}

// ---------------------------------------------------------------------------
// Exercise catalog — slug → real library row. NO back squat / conventional DL.
// Every libraryName below exists in the db/schema.sql exercises seed.
// ---------------------------------------------------------------------------

export const BEGINNER_EXERCISE_CATALOG: Record<string, BundledExerciseMeta> = {
  // Push
  'machine-chest-press':       { libraryName: 'Machine Chest Press',          category: 'lift' },
  'incline-db-press':          { libraryName: 'Incline Dumbbell Press',       category: 'lift' },
  'flat-db-press':             { libraryName: 'Dumbbell Bench Press',         category: 'lift', display: 'Flat Dumbbell Press' },
  'machine-shoulder-press':    { libraryName: 'Machine Shoulder Press',       category: 'lift' },
  'db-shoulder-press':         { libraryName: 'Dumbbell Shoulder Press',      category: 'lift' },
  'lateral-raise':             { libraryName: 'Lateral Raise',                category: 'lift' },
  'cable-lateral-raise':       { libraryName: 'Cable Lateral Raise',          category: 'lift' },
  'triceps-pushdown':          { libraryName: 'Triceps Pushdown',             category: 'lift' },
  'overhead-triceps-extension':{ libraryName: 'Overhead Triceps Extension',   category: 'lift' },
  // Pull
  'lat-pulldown':              { libraryName: 'Lat Pulldown',                 category: 'lift' },
  'close-grip-lat-pulldown':   { libraryName: 'Lat Pulldown',                 category: 'lift', display: 'Close-Grip Lat Pulldown' },
  'seated-cable-row':          { libraryName: 'Seated Cable Row',             category: 'lift' },
  'chest-supported-row':       { libraryName: 'Chest-Supported Dumbbell Row', category: 'lift', display: 'Chest-Supported Row' },
  'face-pull':                 { libraryName: 'Face Pull',                     category: 'lift' },
  'rear-delt-fly':             { libraryName: 'Bent-Over Reverse Fly',         category: 'lift', display: 'Rear-Delt Fly' },
  'db-curl':                   { libraryName: 'Dumbbell Curl',                 category: 'lift' },
  'hammer-curl':               { libraryName: 'Hammer Curl',                   category: 'lift' },
  // Legs — safe swaps for back squat & conventional deadlift
  'leg-press':                 { libraryName: 'Leg Press',                     category: 'lift' },
  'hack-squat':                { libraryName: 'Hack Squat',                    category: 'lift' },
  'db-rdl':                    { libraryName: 'Romanian Deadlift',             category: 'lift', display: 'DB Romanian Deadlift' },
  'hip-thrust':                { libraryName: 'Hip Thrust',                    category: 'lift' },
  'seated-leg-curl':           { libraryName: 'Seated Leg Curl',              category: 'lift' },
  'lying-leg-curl':            { libraryName: 'Lying Leg Curl',               category: 'lift' },
  'leg-extension':             { libraryName: 'Leg Extension',                 category: 'lift' },
  'standing-calf-raise':       { libraryName: 'Standing Calf Raise',          category: 'lift', display: 'Calf Raise' },
  'seated-calf-raise':         { libraryName: 'Seated Calf Raise',            category: 'lift' },
};

// ---------------------------------------------------------------------------
// Day definitions (reused across splits where the spec says "= the 3-day day").
// ---------------------------------------------------------------------------

const PUSH_A: BundledDay = {
  slug: 'push-a',
  name: 'Push',
  exercises: [
    { slug: 'machine-chest-press',    sets: 3, reps: '8-12' },
    { slug: 'incline-db-press',       sets: 3, reps: '8-12' },
    { slug: 'machine-shoulder-press', sets: 3, reps: '8-12' },
    { slug: 'lateral-raise',          sets: 3, reps: '12-15' },
    { slug: 'triceps-pushdown',       sets: 3, reps: '10-15' },
  ],
};

const PULL_A: BundledDay = {
  slug: 'pull-a',
  name: 'Pull',
  exercises: [
    { slug: 'lat-pulldown',     sets: 3, reps: '8-12' },
    { slug: 'seated-cable-row', sets: 3, reps: '8-12' },
    { slug: 'face-pull',        sets: 3, reps: '12-15' },
    { slug: 'db-curl',          sets: 3, reps: '10-15' },
  ],
};

const LEGS_A: BundledDay = {
  slug: 'legs-a',
  name: 'Legs',
  exercises: [
    { slug: 'leg-press',       sets: 3, reps: '8-12' },
    { slug: 'db-rdl',          sets: 3, reps: '8-12' },
    { slug: 'seated-leg-curl', sets: 3, reps: '10-15' },
    { slug: 'leg-extension',   sets: 3, reps: '10-15' },
    { slug: 'standing-calf-raise', sets: 3, reps: '12-15' },
  ],
};

const PUSH_B: BundledDay = {
  slug: 'push-b',
  name: 'Push B',
  exercises: [
    { slug: 'incline-db-press',           sets: 3, reps: '8-12' },
    { slug: 'flat-db-press',              sets: 3, reps: '8-12' },
    { slug: 'db-shoulder-press',          sets: 3, reps: '8-12' },
    { slug: 'cable-lateral-raise',        sets: 3, reps: '12-15' },
    { slug: 'overhead-triceps-extension', sets: 3, reps: '10-15' },
  ],
};

const PULL_B: BundledDay = {
  slug: 'pull-b',
  name: 'Pull B',
  exercises: [
    { slug: 'chest-supported-row',     sets: 3, reps: '8-12' },
    { slug: 'close-grip-lat-pulldown', sets: 3, reps: '8-12' },
    { slug: 'rear-delt-fly',           sets: 3, reps: '12-15' },
    { slug: 'hammer-curl',             sets: 3, reps: '10-15' },
  ],
};

const LEGS_B: BundledDay = {
  slug: 'legs-b',
  name: 'Legs B',
  exercises: [
    { slug: 'hack-squat',       sets: 3, reps: '8-12' },
    { slug: 'hip-thrust',       sets: 3, reps: '8-12' },
    { slug: 'lying-leg-curl',   sets: 3, reps: '10-15' },
    { slug: 'leg-extension',    sets: 3, reps: '10-15' },
    { slug: 'seated-calf-raise', sets: 3, reps: '12-15' },
  ],
};

const UPPER_A: BundledDay = {
  slug: 'upper-a',
  name: 'Upper A',
  exercises: [
    { slug: 'machine-chest-press',    sets: 3, reps: '8-12' },
    { slug: 'lat-pulldown',           sets: 3, reps: '8-12' },
    { slug: 'machine-shoulder-press', sets: 3, reps: '8-12' },
    { slug: 'seated-cable-row',       sets: 3, reps: '8-12' },
    { slug: 'triceps-pushdown',       sets: 3, reps: '10-15' },
    { slug: 'db-curl',                sets: 3, reps: '10-15' },
  ],
};

const LOWER_A: BundledDay = {
  slug: 'lower-a',
  name: 'Lower A',
  exercises: [
    { slug: 'leg-press',           sets: 3, reps: '8-12' },
    { slug: 'seated-leg-curl',     sets: 3, reps: '10-15' },
    { slug: 'leg-extension',       sets: 3, reps: '10-15' },
    { slug: 'hip-thrust',          sets: 3, reps: '8-12' },
    { slug: 'standing-calf-raise', sets: 3, reps: '12-15' },
  ],
};

const UPPER_B: BundledDay = {
  slug: 'upper-b',
  name: 'Upper B',
  exercises: [
    { slug: 'incline-db-press',           sets: 3, reps: '8-12' },
    { slug: 'chest-supported-row',        sets: 3, reps: '8-12' },
    { slug: 'lateral-raise',              sets: 3, reps: '12-15' },
    { slug: 'close-grip-lat-pulldown',    sets: 3, reps: '8-12' },
    { slug: 'hammer-curl',                sets: 3, reps: '10-15' },
    { slug: 'overhead-triceps-extension', sets: 3, reps: '10-15' },
  ],
};

const LOWER_B: BundledDay = {
  slug: 'lower-b',
  name: 'Lower B',
  exercises: [
    { slug: 'hack-squat',        sets: 3, reps: '8-12' },
    { slug: 'db-rdl',            sets: 3, reps: '8-12' },
    { slug: 'lying-leg-curl',    sets: 3, reps: '10-15' },
    { slug: 'leg-extension',     sets: 3, reps: '10-15' },
    { slug: 'seated-calf-raise', sets: 3, reps: '12-15' },
  ],
};

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export const BEGINNER_PROGRAMS: BundledProgram[] = [
  {
    id: 'ppl-3',
    name: 'PPL — 3-day',
    subtitle: 'Push / Pull / Legs, once each per week',
    daysPerWeek: 3,
    days: [PUSH_A, PULL_A, LEGS_A],
  },
  {
    id: 'ppl-6',
    name: 'PPL — 6-day',
    subtitle: 'Push/Pull/Legs ×2 with A/B variation',
    daysPerWeek: 6,
    days: [PUSH_A, PULL_A, LEGS_A, PUSH_B, PULL_B, LEGS_B],
  },
  {
    id: 'upper-lower-4',
    name: 'Upper / Lower — 4-day',
    subtitle: 'Upper A · Lower A · Upper B · Lower B',
    daysPerWeek: 4,
    days: [UPPER_A, LOWER_A, UPPER_B, LOWER_B],
  },
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function listBeginnerPrograms(): BundledProgram[] {
  return BEGINNER_PROGRAMS;
}

export function getBeginnerProgram(id: string): BundledProgram | undefined {
  return BEGINNER_PROGRAMS.find((p) => p.id === id);
}

/** Display name for a bundled exercise slug (variant cue if present). */
export function bundledExerciseName(slug: string): string {
  const meta = BEGINNER_EXERCISE_CATALOG[slug];
  if (!meta) return slug;
  return meta.display ?? meta.libraryName;
}

// ---------------------------------------------------------------------------
// Library resolution (slug → library UUID), graceful offline fallback.
// ---------------------------------------------------------------------------

/** name (lowercased) → exercise UUID. Built from the fetched library. */
export type LibraryNameIndex = Map<string, string>;

/**
 * Build a name→id index from whatever shape the exercises library is in.
 * Accepts the ExerciseLibrary ({ exercises: { lift: [...], ... } }) or a flat list.
 */
export function buildLibraryNameIndex(
  library: { exercises?: Record<string, Array<{ id: string; name: string }>> } | Array<{ id: string; name: string }> | null | undefined,
): LibraryNameIndex {
  const idx: LibraryNameIndex = new Map();
  if (!library) return idx;
  const lists: Array<Array<{ id: string; name: string }>> = Array.isArray(library)
    ? [library]
    : Object.values(library.exercises ?? {});
  for (const list of lists) {
    for (const ex of list ?? []) {
      if (ex && ex.name && ex.id) idx.set(ex.name.toLowerCase(), ex.id);
    }
  }
  return idx;
}

/**
 * Build a RoutineSession for one day of a bundled program, ready for
 * WorkoutLoggerHost.startSession(). `libIndex` is optional — when absent (e.g.
 * offline) every exercise falls back to a name-only entry (exerciseId ''), which
 * the stepper handles. Returns null if the program/day doesn't exist.
 */
export function buildBundledSession(
  programId: string,
  dayIndex: number,
  libIndex?: LibraryNameIndex,
): RoutineSession | null {
  const program = getBeginnerProgram(programId);
  if (!program) return null;
  const day = program.days[dayIndex];
  if (!day) return null;

  const exercises: RoutineSessionExercise[] = day.exercises.map((ref) => {
    const meta = BEGINNER_EXERCISE_CATALOG[ref.slug];
    const libraryName = meta?.libraryName ?? ref.slug;
    const display = meta?.display ?? libraryName;
    const resolvedId = libIndex?.get(libraryName.toLowerCase());
    if (!resolvedId) {
      // Graceful, logged fallback — set still logs by name (TICKET-088).
      console.warn(
        `[beginnerTemplates] no library id for "${libraryName}" (slug ${ref.slug}); logging by name only`,
      );
    }
    return {
      exerciseId: resolvedId ?? '',
      name: display,
      targetSets: ref.sets,
      targetReps: ref.reps,
      loggedSetCount: 0,
      done: false,
      category: meta?.category ?? 'lift',
    };
  });

  return {
    source: 'template',
    name: `${program.name} · ${day.name}`,
    exercises,
    currentIndex: 0,
  };
}
