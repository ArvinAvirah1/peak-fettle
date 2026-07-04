/**
 * nameMapping — exercise-name → catalog fuzzy mapping for CSV import (TICKET-135).
 *
 * Candidates come from whatever names are ALREADY known on-device:
 *   • mobile/src/lib/trainingEngine/exerciseCatalog.ts (ENGINE_EXERCISE_CATALOG)
 *     — read-only, on-device, no network. This is the only exercise taxonomy
 *     guaranteed available to a free/local-first user with zero REST calls
 *     (the full ~194-entry server catalogue is fetched via GET /exercises,
 *     a global/non-personal call some screens best-effort cache into the
 *     local `exercise_names` table — see mobile/src/data/exerciseNames.ts).
 *   • the local `exercise_names` cache (id → name), if the caller supplies it —
 *     covers exercises the user has already logged/selected, including
 *     anything created as "custom" in a previous session or import.
 *
 * Matching pipeline, in order:
 *   1. Exact match (normalized) against a candidate name.
 *   2. Alias-table lookup (~100 common Strong/Hevy exercise names mapped to
 *      the closest canonical name in ENGINE_EXERCISE_CATALOG).
 *   3. Fuzzy match (token-overlap + edit-distance ratio) against all
 *      candidates, accepted only above a similarity threshold.
 *   4. Unmatched → caller shows manual match / "create custom exercise" UI.
 *
 * "Mapping remembered for the rest of the file" (spec point 2): this module is
 * pure and stateless per call — the CALLER (csv-import.tsx) keeps a
 * Map<rawName, NameMatchResult> for the duration of one import and consults it
 * before calling matchExerciseName again, so a name resolved (by fuzzy match OR
 * manual pick) once is reused for every subsequent row with the same raw text.
 *
 * Pure module: no RN/db imports, no Date.now()/Math.random(). Deterministic:
 * the same (rawName, candidates) always produces the same result.
 */

import type { NameMatchResult } from './types';

export interface MatchCandidate {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Lowercase, strip punctuation, collapse whitespace, drop common noise words
 * ("barbell", "dumbbell" prefixes are KEPT — they disambiguate variants — but
 * filler like "(barbell)" parens, trailing "- warmup", equipment counts like
 * "(2x)" are stripped). */
export function normalizeExerciseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, ' $1 ') // unwrap parens rather than dropping content
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Alias table — top ~100 competitor exercise names → canonical catalog name.
//
// Keys are normalized (see normalizeExerciseName) common names as they appear
// in Strong/Hevy exports; values are the canonical name as it appears in
// ENGINE_EXERCISE_CATALOG (mobile/src/lib/trainingEngine/exerciseCatalog.ts).
// Where the engine catalog has no equivalent entry (isolation/machine variants
// it doesn't model), the alias maps to the closest canonical movement so the
// fuzzy layer isn't needed for the common case; anything left over falls
// through to fuzzy matching or manual resolution.
// ---------------------------------------------------------------------------

const ALIAS_TABLE: Record<string, string> = {
  // squat
  'squat': 'Back Squat',
  'barbell squat': 'Back Squat',
  'back squat': 'Back Squat',
  'high bar squat': 'Back Squat',
  'low bar squat': 'Back Squat',
  'front squat': 'Back Squat',
  'goblet squat': 'Goblet Squat',
  'dumbbell squat': 'Goblet Squat',
  'leg press': 'Leg Press',
  'hack squat': 'Leg Press',
  'smith machine squat': 'Leg Press',
  'bodyweight squat': 'Bodyweight Squat',
  'air squat': 'Bodyweight Squat',
  'box squat': 'Back Squat',

  // hinge
  'deadlift': 'Conventional Deadlift',
  'conventional deadlift': 'Conventional Deadlift',
  'barbell deadlift': 'Conventional Deadlift',
  'sumo deadlift': 'Conventional Deadlift',
  'trap bar deadlift': 'Conventional Deadlift',
  'romanian deadlift': 'Romanian Deadlift',
  'rdl': 'Romanian Deadlift',
  'stiff leg deadlift': 'Romanian Deadlift',
  'stiff legged deadlift': 'Romanian Deadlift',
  'dumbbell romanian deadlift': 'Romanian Deadlift',
  'kettlebell swing': 'Kettlebell Swing',
  'russian kettlebell swing': 'Kettlebell Swing',
  'hip thrust': 'Hip Thrust',
  'barbell hip thrust': 'Hip Thrust',
  'glute bridge': 'Hip Thrust',

  // lunge
  'walking lunge': 'Walking Lunge',
  'lunge': 'Walking Lunge',
  'dumbbell lunge': 'Walking Lunge',
  'bulgarian split squat': 'Bulgarian Split Squat',
  'rear foot elevated split squat': 'Bulgarian Split Squat',
  'reverse lunge': 'Reverse Lunge',
  'step up': 'Reverse Lunge',
  'step ups': 'Reverse Lunge',

  // horizontal push
  'bench press': 'Bench Press',
  'barbell bench press': 'Bench Press',
  'flat bench press': 'Bench Press',
  'incline bench press': 'Bench Press',
  'incline barbell bench press': 'Bench Press',
  'decline bench press': 'Bench Press',
  'dumbbell bench press': 'Dumbbell Bench Press',
  'incline dumbbell bench press': 'Dumbbell Bench Press',
  'decline dumbbell bench press': 'Dumbbell Bench Press',
  'push up': 'Push-Up',
  'push ups': 'Push-Up',
  'pushup': 'Push-Up',
  'pushups': 'Push-Up',
  'machine chest press': 'Machine Chest Press',
  'chest press machine': 'Machine Chest Press',
  'smith machine bench press': 'Machine Chest Press',

  // vertical push
  'overhead press': 'Overhead Press',
  'ohp': 'Overhead Press',
  'barbell overhead press': 'Overhead Press',
  'military press': 'Overhead Press',
  'standing barbell press': 'Overhead Press',
  'dumbbell shoulder press': 'Dumbbell Shoulder Press',
  'seated dumbbell press': 'Dumbbell Shoulder Press',
  'arnold press': 'Dumbbell Shoulder Press',
  'pike push up': 'Pike Push-Up',
  'handstand push up': 'Pike Push-Up',

  // horizontal pull
  'barbell row': 'Barbell Row',
  'bent over row': 'Barbell Row',
  'bent over barbell row': 'Barbell Row',
  'pendlay row': 'Barbell Row',
  'dumbbell row': 'Dumbbell Row',
  'single arm dumbbell row': 'Dumbbell Row',
  'one arm dumbbell row': 'Dumbbell Row',
  'seated cable row': 'Seated Cable Row',
  'cable row': 'Seated Cable Row',
  'chest supported row': 'Dumbbell Row',
  't bar row': 'Barbell Row',
  'inverted row': 'Inverted Row',
  'bodyweight row': 'Inverted Row',

  // vertical pull
  'pull up': 'Pull-Up',
  'pull ups': 'Pull-Up',
  'pullup': 'Pull-Up',
  'pullups': 'Pull-Up',
  'chin up': 'Pull-Up',
  'chin ups': 'Pull-Up',
  'lat pulldown': 'Lat Pulldown',
  'wide grip lat pulldown': 'Lat Pulldown',
  'close grip lat pulldown': 'Lat Pulldown',
  'assisted pull up': 'Assisted Pull-Up',
  'assisted pullup machine': 'Assisted Pull-Up',
  'band assisted pull up': 'Assisted Pull-Up',

  // olympic
  'power clean': 'Power Clean',
  'clean': 'Power Clean',
  'hang clean': 'Power Clean',
  'hang snatch': 'Hang Snatch',
  'snatch': 'Hang Snatch',
  'kettlebell clean': 'Kettlebell Clean',

  // plyometric
  'box jump': 'Box Jump',
  'box jumps': 'Box Jump',
  'broad jump': 'Broad Jump',
  'standing long jump': 'Broad Jump',

  // carry
  'farmers carry': "Farmer's Carry",
  "farmer's carry": "Farmer's Carry",
  'farmers walk': "Farmer's Carry",
  'suitcase carry': 'Suitcase Carry',

  // core
  'plank': 'Plank',
  'front plank': 'Plank',
  'hanging leg raise': 'Hanging Leg Raise',
  'leg raise': 'Hanging Leg Raise',
  'hanging knee raise': 'Hanging Leg Raise',
  'cable crunch': 'Cable Crunch',
  'kneeling cable crunch': 'Cable Crunch',
  'dead bug': 'Dead Bug',
  'crunch': 'Cable Crunch',
  'sit up': 'Cable Crunch',
  'sit ups': 'Cable Crunch',

  // arms
  'bicep curl': 'Dumbbell Curl',
  'dumbbell curl': 'Dumbbell Curl',
  'dumbbell bicep curl': 'Dumbbell Curl',
  'hammer curl': 'Dumbbell Curl',
  'concentration curl': 'Dumbbell Curl',
  'preacher curl': 'Barbell Curl',
  'barbell curl': 'Barbell Curl',
  'ez bar curl': 'Barbell Curl',
  'band curl': 'Band Curl',
  'tricep pushdown': 'Cable Tricep Pushdown',
  'cable tricep pushdown': 'Cable Tricep Pushdown',
  'triceps pushdown': 'Cable Tricep Pushdown',
  'rope pushdown': 'Cable Tricep Pushdown',
  'skull crusher': 'Cable Tricep Pushdown',
  'tricep extension': 'Cable Tricep Pushdown',
  'overhead tricep extension': 'Cable Tricep Pushdown',
  'dip': 'Cable Tricep Pushdown',
  'dips': 'Cable Tricep Pushdown',
  'triceps dip': 'Cable Tricep Pushdown',

  // shoulders
  'lateral raise': 'Lateral Raise',
  'dumbbell lateral raise': 'Lateral Raise',
  'side lateral raise': 'Lateral Raise',
  'cable lateral raise': 'Cable Lateral Raise',
  'front raise': 'Lateral Raise',
  'band pull apart': 'Band Pull-Apart',
  'face pull': 'Band Pull-Apart',
  'rear delt fly': 'Reverse Dumbbell Fly',

  // chest isolation
  'dumbbell fly': 'Dumbbell Fly',
  'chest fly': 'Dumbbell Fly',
  'pec deck': 'Dumbbell Fly',
  'cable crossover': 'Cable Crossover',
  'cable fly': 'Cable Crossover',
  'low cable crossover': 'Cable Crossover',

  // back isolation
  'straight arm pulldown': 'Straight-Arm Pulldown',
  'reverse dumbbell fly': 'Reverse Dumbbell Fly',
  'chest supported reverse fly': 'Reverse Dumbbell Fly',

  // legs isolation
  'leg extension': 'Leg Extension',
  'leg curl': 'Leg Curl',
  'lying leg curl': 'Leg Curl',
  'seated leg curl': 'Leg Curl',
  'nordic curl': 'Nordic Curl',
  'nordic hamstring curl': 'Nordic Curl',

  // calves
  'standing calf raise': 'Standing Calf Raise',
  'calf raise': 'Standing Calf Raise',
  'seated calf raise': 'Seated Calf Raise',
};

/** Number of entries in the alias table — sanity check for tests/coverage. */
export function aliasTableSize(): number {
  return Object.keys(ALIAS_TABLE).length;
}

// ---------------------------------------------------------------------------
// Fuzzy match — token overlap (Jaccard-ish) + Levenshtein ratio, whichever is
// stronger. Cheap, dependency-free, good enough for short exercise names.
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = tmp;
    }
  }
  return dp[n]!;
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Combined similarity score in [0, 1]. Weighted toward token overlap since
 * exercise names are short and word-order/prefix variants are common
 * ("Dumbbell Bench Press" vs "Bench Press Dumbbell"). */
function similarity(a: string, b: string): number {
  const jac = jaccard(tokenSet(a), tokenSet(b));
  const lev = levenshteinRatio(a, b);
  return jac * 0.6 + lev * 0.4;
}

/** Minimum similarity to accept a fuzzy match without asking the user. */
const FUZZY_THRESHOLD = 0.55;

// ---------------------------------------------------------------------------
// Public matcher
// ---------------------------------------------------------------------------

/**
 * Resolve a raw source exercise name against the given candidates.
 * Order: exact → alias → fuzzy → unmatched.
 *
 * `candidates` should be the union of ENGINE_EXERCISE_CATALOG entries and any
 * locally-cached exercise_names rows the caller wants considered (e.g. from
 * getExerciseNameMap()) — passed in so this module stays pure/DB-free.
 */
export function matchExerciseName(
  rawName: string,
  candidates: MatchCandidate[],
): NameMatchResult {
  const normalizedRaw = normalizeExerciseName(rawName);

  // 1. Exact match against a candidate (normalized).
  for (const c of candidates) {
    if (normalizeExerciseName(c.name) === normalizedRaw) {
      return { rawName, exerciseId: c.id, resolvedName: c.name, method: 'alias' };
    }
  }

  // 2. Alias table → canonical name → find that canonical name among candidates.
  const aliasTarget = ALIAS_TABLE[normalizedRaw];
  if (aliasTarget) {
    const normalizedTarget = normalizeExerciseName(aliasTarget);
    const hit = candidates.find((c) => normalizeExerciseName(c.name) === normalizedTarget);
    if (hit) {
      return { rawName, exerciseId: hit.id, resolvedName: hit.name, method: 'alias' };
    }
  }

  // 3. Fuzzy match — best-scoring candidate above threshold.
  let best: { c: MatchCandidate; score: number } | null = null;
  for (const c of candidates) {
    const score = similarity(normalizedRaw, normalizeExerciseName(c.name));
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
      best = { c, score };
    }
  }
  if (best) {
    return { rawName, exerciseId: best.c.id, resolvedName: best.c.name, method: 'fuzzy' };
  }

  // 4. Unmatched — caller offers manual match / create-custom-exercise UI.
  return { rawName, exerciseId: null, resolvedName: null, method: 'unmatched' };
}

/**
 * Convenience: derive RIR from an RPE value. RIR = 10 - RPE, clamped to the
 * valid [0, 10] RIR range (spec point 4). Returns null when rpe is null/NaN.
 */
export function rirFromRpe(rpe: number | null): number | null {
  if (rpe == null || !Number.isFinite(rpe)) return null;
  const rir = Math.round(10 - rpe);
  if (rir < 0) return 0;
  if (rir > 10) return 10;
  return rir;
}
