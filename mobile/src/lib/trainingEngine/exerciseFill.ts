// exerciseFill.ts — Training Engine v1 (mobile port)
// Fills each slot in a session with a concrete exercise.
// Faithfully ported from server/lib/trainingEngine/exerciseFill.js
//
// Algorithm per spec §3 step 4:
//   matching movement_pattern
//   → equipment ⊆ profile
//   → not contraindicated
//   → prefer exercise present in history/PBs (stickiness)
//   → is_compound for priority 1
//   → deterministic tiebreak by seeded shuffle (seed = userId + weekISO)
//
// Pure function; no DB access.

import type { ExerciseSlot } from './templates';
import type { SequencedSession } from './sequence';

// ---------------------------------------------------------------------------
// Exercise and context types
// ---------------------------------------------------------------------------

export interface Exercise {
  id: string;
  name: string;
  muscle_groups: string[];
  is_compound: boolean;
  movement_pattern: string;
  equipment: string[];
  contraindications: string[];
}

export interface HistoryRow {
  exercise_name: string;
  weight_kg?: number;
  reps?: number;
  rir?: number;
  e1rm_kg?: number;
  day_key?: string;
}

export interface PBRow {
  exercise_name: string;
  weight_kg?: number;
  reps?: number;
}

export interface ConstraintRow {
  constraint_type: string;
  custom_note?: string | null;
}

export interface FilledSlot extends ExerciseSlot {
  exercise_id?: string;
  name?: string;
  muscle_groups?: string[];
  is_compound?: boolean;
  weight_kg?: number | null;
  warmup?: Array<{ weight_kg: number; reps: number }>;
  coaching_note?: string;
}

export interface FilledSession extends Omit<SequencedSession, 'slots'> {
  slots: FilledSlot[];
}

// ---------------------------------------------------------------------------
// Seeded pseudo-random (mulberry32 — small, deterministic, good distribution)
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const result = [...(arr || [])];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    // Indices i and j are always in-range here; the temp swap (instead of a
    // destructuring swap) keeps tsc happy under noUncheckedIndexedAccess.
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}

export function buildSeed(userId: string | number, weekISO: string): number {
  const str = String(userId) + String(weekISO);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Equipment compatibility check
// ---------------------------------------------------------------------------
function equipmentCompatible(
  exerciseEquipment: string[],
  userProfile: string[]
): boolean {
  if (!exerciseEquipment || exerciseEquipment.length === 0) return true;
  if (!userProfile || userProfile.length === 0) return true;
  return exerciseEquipment.some((eq) => userProfile.includes(eq));
}

// ---------------------------------------------------------------------------
// Check contraindications
// ---------------------------------------------------------------------------
function isContraindicated(
  exercise: Exercise,
  constraints: ConstraintRow[]
): boolean {
  if (!constraints || constraints.length === 0) return false;
  if (
    !exercise.contraindications ||
    exercise.contraindications.length === 0
  )
    return false;
  const blockedTypes = constraints
    .map((c) => c.constraint_type)
    .filter((t) => t !== 'custom');
  return exercise.contraindications.some((ci) => blockedTypes.includes(ci));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
/**
 * Does an exercise hit any prioritised muscle group? Survey priorities are
 * canonical labels (e.g. 'chest','legs'); the catalogue tags muscle_groups with
 * the same vocabulary (plus the 'legs' alias covering quads/hams/glutes/calves).
 */
function matchesPriority(
  exercise: Exercise,
  priorities: Set<string>,
): boolean {
  if (priorities.size === 0) return false;
  const groups = exercise.muscle_groups || [];
  for (const g of groups) {
    const gl = (g || '').toLowerCase();
    if (priorities.has(gl)) return true;
    // 'legs' priority covers the individual leg groups.
    if (
      priorities.has('legs') &&
      ['quads', 'hamstrings', 'glutes', 'calves'].includes(gl)
    ) {
      return true;
    }
  }
  return false;
}

export function exerciseFill(
  sessions: SequencedSession[],
  exercises: Exercise[],
  history: HistoryRow[],
  pbs: PBRow[],
  equipmentProfile: string[],
  constraints: ConstraintRow[],
  userId: string | number,
  weekISO: string,
  ruleTrace: string[],
  musclePriorities?: string[] | null
): FilledSession[] {
  const seed = buildSeed(userId, weekISO);

  const historyNames = new Set(
    (history || []).map((h) => (h.exercise_name || '').toLowerCase())
  );
  const pbNames = new Set(
    (pbs || []).map((p) => (p.exercise_name || '').toLowerCase())
  );
  const priorities = new Set(
    (musclePriorities || []).map((m) => (m || '').toLowerCase()).filter(Boolean)
  );

  const shuffled = seededShuffle(exercises || [], seed);

  return sessions.map((session) => {
    const usedInSession = new Set<string>();

    const filledSlots = (session.slots || [])
      .map((slot: ExerciseSlot): FilledSlot | null => {
        if (!slot) return null;
        const patternMatch = shuffled.filter(
          (ex) => ex && ex.movement_pattern === slot.pattern
        );

        const equipMatch = patternMatch.filter((ex) =>
          equipmentCompatible(ex.equipment, equipmentProfile)
        );

        const safePool = equipMatch.filter(
          (ex) => !isContraindicated(ex, constraints)
        );

        const sticky = safePool.filter(
          (ex) =>
            historyNames.has((ex.name || '').toLowerCase()) ||
            pbNames.has((ex.name || '').toLowerCase())
        );

        let pool = (sticky.length > 0 ? sticky : safePool).filter(
          (ex) => !usedInSession.has(ex.id)
        );

        // Muscle-priority bias: if the user flagged priority groups and any
        // candidate in the pool hits one, narrow to those so prioritised areas
        // get the selection (and, via accessory slots, extra volume). Skipped
        // when it would empty the pool, so it never blocks a valid slot.
        if (priorities.size > 0) {
          const prioritised = pool.filter((ex) => matchesPriority(ex, priorities));
          if (prioritised.length > 0) pool = prioritised;
        }

        if (slot.priority === 1) {
          const compound = pool.filter((ex) => ex.is_compound);
          if (compound.length > 0) pool = compound;
        }

        let fallbackUsed = false;
        if (pool.length === 0) {
          const bwFallback = patternMatch.filter(
            (ex) =>
              (ex.equipment || []).includes('bodyweight') &&
              !isContraindicated(ex, constraints) &&
              !usedInSession.has(ex.id)
          );
          if (bwFallback.length > 0) {
            pool = bwFallback;
            fallbackUsed = true;
            ruleTrace.push(
              `Equipment fallback: no ${slot.pattern} exercise found in equipment profile; ` +
                `relaxed to bodyweight for slot in "${session.archetype}".`
            );
          }
        }

        const chosen = pool[0];
        if (!chosen) {
          ruleTrace.push(
            `Slot dropped: no viable exercise for pattern "${slot.pattern}" in "${session.archetype}" ` +
              `after constraint/equipment filtering.`
          );
          return null;
        }

        usedInSession.add(chosen.id);

        const stickyNote =
          historyNames.has((chosen.name || '').toLowerCase()) ||
          pbNames.has((chosen.name || '').toLowerCase())
            ? ' (preferred: in your history/PBs)'
            : '';
        if (fallbackUsed || stickyNote) {
          ruleTrace.push(
            `Selected "${chosen.name}" for ${slot.pattern} slot in "${session.archetype}"${stickyNote}.`
          );
        }

        return {
          ...slot,
          exercise_id: chosen.id,
          name: chosen.name,
          muscle_groups: chosen.muscle_groups || [],
          is_compound: chosen.is_compound,
        };
      })
      .filter((s): s is FilledSlot => s !== null);

    return { ...session, slots: filledSlots };
  });
}
