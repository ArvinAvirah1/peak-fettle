/**
 * smartSuggest — TICKET-062
 * Algorithmic "next exercise" suggestions for non-routine stepper sessions.
 * NO AI / Haiku calls — pure muscle-balance + session-history heuristics.
 *
 * Algorithm:
 *   1. Map each logged exercise to a muscle-group bucket.
 *   2. Count sets per bucket in the current session.
 *   3. Pick the bucket with the fewest sets (least worked / most needs attention).
 *   4. Score candidate exercises by: (a) matches underworked bucket, (b) appears
 *      in recent workout history for the current weekday, (c) not already logged
 *      this session.
 *   5. Return the top candidate with a human-readable reason string.
 */

// ── Muscle group taxonomy ─────────────────────────────────────────────────────

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'core'
  | 'calves'
  | 'other';

// Coarse keyword→muscle mapping.  Checked in order; first match wins.
const KEYWORD_MAP: [RegExp, MuscleGroup][] = [
  [/bench|fly|flye|pec|chest/i,                    'chest'],
  [/row|pulldown|pull.?up|chin|lat\b|rhomboid|back/i, 'back'],
  [/shoulder|press.*overhead|ohp|lateral raise|delt/i, 'shoulders'],
  [/curl|bicep/i,                                  'biceps'],
  [/tricep|pushdown|skull|dip/i,                   'triceps'],
  [/squat|leg press|hack|quad|lunge/i,             'quads'],
  [/deadlift|rdl|leg curl|hamstring|nordic/i,      'hamstrings'],
  [/glute|hip thrust|bridge/i,                     'glutes'],
  [/plank|crunch|ab\b|core|sit.?up/i,              'core'],
  [/calf|calves|raise.*calf/i,                     'calves'],
];

export function muscleGroupForExercise(exerciseName: string): MuscleGroup {
  for (const [re, group] of KEYWORD_MAP) {
    if (re.test(exerciseName)) return group;
  }
  return 'other';
}

// ── Push/Pull/Legs balance hints ──────────────────────────────────────────────

const COMPLEMENTARY: Partial<Record<MuscleGroup, MuscleGroup[]>> = {
  chest:      ['back', 'shoulders', 'triceps'],
  back:       ['biceps', 'core'],
  shoulders:  ['chest', 'triceps'],
  biceps:     ['back', 'chest'],
  triceps:    ['chest', 'shoulders'],
  quads:      ['hamstrings', 'glutes', 'core'],
  hamstrings: ['quads', 'glutes'],
  glutes:     ['hamstrings', 'quads', 'core'],
  core:       ['back', 'glutes'],
  calves:     ['quads', 'hamstrings'],
};

// ── Main API ──────────────────────────────────────────────────────────────────

export interface SessionExercise {
  exerciseId: string;
  name: string;
  setCount: number;
}

export interface SuggestCandidate {
  exerciseId: string;
  name: string;
  /** Human-readable one-line reason shown in the suggestion card */
  reason: string;
}

/**
 * Suggest the next exercise for an unstructured (non-routine) session.
 *
 * @param sessionLog  Exercises + set counts logged so far THIS session.
 * @param historyNames Exercise names from the user's recent workouts on the
 *                    same day-of-week (ordered most-recent first).
 * @param allExercises Full exercise catalogue [{id, name}].
 * @returns           Top candidate, or null if no good match found.
 */
export function suggestNextExercise(
  sessionLog: SessionExercise[],
  historyNames: string[],
  allExercises: { id: string; name: string }[],
): SuggestCandidate | null {
  if (allExercises.length === 0) return null;

  const loggedNames = new Set(sessionLog.map((e) => e.name.toLowerCase()));

  // ── Step 1: tally sets per muscle group ──────────────────────────────────
  const groupSets: Partial<Record<MuscleGroup, number>> = {};
  for (const ex of sessionLog) {
    const g = muscleGroupForExercise(ex.name);
    groupSets[g] = (groupSets[g] ?? 0) + ex.setCount;
  }

  // ── Step 2: find most recently worked group ───────────────────────────────
  const lastEx = sessionLog[sessionLog.length - 1];
  const lastWorked: MuscleGroup | null = lastEx ? muscleGroupForExercise(lastEx.name) : null;

  // ── Step 3: determine target groups ──────────────────────────────────────
  // Priority: complementary to the last worked group → then least-worked overall.
  const targetGroups: MuscleGroup[] = [];

  if (lastWorked) {
    const complements = COMPLEMENTARY[lastWorked] ?? [];
    // Sort complements by fewest sets logged
    const sorted = [...complements].sort(
      (a, b) => (groupSets[a] ?? 0) - (groupSets[b] ?? 0),
    );
    targetGroups.push(...sorted);
  }

  // Fallback: any group with 0 sets that isn't 'other'
  const allGroups: MuscleGroup[] = [
    'chest', 'back', 'shoulders', 'biceps', 'triceps',
    'quads', 'hamstrings', 'glutes', 'core', 'calves',
  ];
  for (const g of allGroups) {
    if (!targetGroups.includes(g) && !(groupSets[g] ?? 0)) {
      targetGroups.push(g);
    }
  }

  // ── Step 4: score candidates ──────────────────────────────────────────────
  type Scored = { ex: { id: string; name: string }; score: number; reason: string };
  const scored: Scored[] = [];

  const historySet = new Set(historyNames.map((n) => n.toLowerCase()));

  for (const ex of allExercises) {
    if (loggedNames.has(ex.name.toLowerCase())) continue; // already done this session

    const group = muscleGroupForExercise(ex.name);
    let score = 0;
    let reason = '';

    const targetIdx = targetGroups.indexOf(group);
    if (targetIdx !== -1) {
      score += 10 - targetIdx; // higher score for earlier priority groups
      reason = `balances ${lastWorked ? lastWorked + ' volume' : 'your session'}`;
    }

    if (historySet.has(ex.name.toLowerCase())) {
      score += 3; // bonus for appearing in same-weekday history
      if (!reason) reason = "you usually do this day";
    }

    if (score > 0) scored.push({ ex, score, reason: reason || 'complements your session' });
  }

  if (scored.length === 0) {
    // Last resort: first history exercise not yet logged
    for (const name of historyNames) {
      const match = allExercises.find(
        (e) => e.name.toLowerCase() === name.toLowerCase() && !loggedNames.has(name.toLowerCase()),
      );
      if (match) {
        return { exerciseId: match.id, name: match.name, reason: 'from your usual routine' };
      }
    }
    return null;
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  return { exerciseId: best.ex.id, name: best.ex.name, reason: best.reason };
}

/**
 * PRO smart-suggest (image §3c): return the top N ranked candidates, not just
 * one. The mock shows a single placeholder card; the real build "enumerates
 * more" — a primary suggestion plus a few ranked alternatives the user can pick.
 *
 * Same scoring as suggestNextExercise; this returns the ranked list so the
 * stepper can render the primary card + "or try" rows.
 */
export function suggestNextExercises(
  sessionLog: SessionExercise[],
  historyNames: string[],
  allExercises: { id: string; name: string }[],
  limit = 3,
): SuggestCandidate[] {
  if (allExercises.length === 0) return [];

  const loggedNames = new Set(sessionLog.map((e) => e.name.toLowerCase()));

  const groupSets: Partial<Record<MuscleGroup, number>> = {};
  for (const ex of sessionLog) {
    const g = muscleGroupForExercise(ex.name);
    groupSets[g] = (groupSets[g] ?? 0) + ex.setCount;
  }

  const lastEx = sessionLog[sessionLog.length - 1];
  const lastWorked: MuscleGroup | null = lastEx ? muscleGroupForExercise(lastEx.name) : null;

  const targetGroups: MuscleGroup[] = [];
  if (lastWorked) {
    const complements = COMPLEMENTARY[lastWorked] ?? [];
    const sorted = [...complements].sort(
      (a, b) => (groupSets[a] ?? 0) - (groupSets[b] ?? 0),
    );
    targetGroups.push(...sorted);
  }
  const allGroups: MuscleGroup[] = [
    'chest', 'back', 'shoulders', 'biceps', 'triceps',
    'quads', 'hamstrings', 'glutes', 'core', 'calves',
  ];
  for (const g of allGroups) {
    if (!targetGroups.includes(g) && !(groupSets[g] ?? 0)) targetGroups.push(g);
  }

  const historySet = new Set(historyNames.map((n) => n.toLowerCase()));
  type Scored = { ex: { id: string; name: string }; score: number; reason: string };
  const scored: Scored[] = [];

  for (const ex of allExercises) {
    if (loggedNames.has(ex.name.toLowerCase())) continue;
    const group = muscleGroupForExercise(ex.name);
    let score = 0;
    let reason = '';
    const targetIdx = targetGroups.indexOf(group);
    if (targetIdx !== -1) {
      score += 10 - targetIdx;
      reason = `balances ${lastWorked ? lastWorked + ' volume' : 'your session'}`;
    }
    if (historySet.has(ex.name.toLowerCase())) {
      score += 3;
      if (!reason) reason = 'you usually do this day';
    }
    if (score > 0) scored.push({ ex, score, reason: reason || 'complements your session' });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored
    .slice(0, Math.max(1, limit))
    .map((s) => ({ exerciseId: s.ex.id, name: s.ex.name, reason: s.reason }));
}
