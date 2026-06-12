// exerciseFill.js — Training Engine v1
// Fills each slot in a session with a concrete exercise from the exercises array.
//
// Algorithm per spec §3 step 4:
//   matching movement_pattern
//   → equipment ⊆ profile
//   → not contraindicated
//   → prefer exercise present in history/PBs (stickiness)
//   → is_compound for priority-1 slots
//   → deterministic tiebreak by seeded shuffle (seed = userId + weekISO)
//
// Pure function; no DB access.

'use strict';

// ---------------------------------------------------------------------------
// Seeded pseudo-random (mulberry32 — small, deterministic, good distribution)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seed) {
  const rng    = mulberry32(seed);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Build a numeric seed from a user ID string (or number) + ISO week string.
 */
function buildSeed(userId, weekISO) {
  const str = String(userId) + String(weekISO);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  }
  return hash >>> 0; // unsigned 32-bit
}

// ---------------------------------------------------------------------------
// Equipment compatibility check
// ---------------------------------------------------------------------------
function equipmentCompatible(exerciseEquipment, userProfile) {
  if (!exerciseEquipment || exerciseEquipment.length === 0) return true;
  if (!userProfile || userProfile.length === 0) return true;
  // Exercise is compatible if at least one of its required equipment items
  // is in the user's profile (OR semantics — "any one piece suffices").
  return exerciseEquipment.some(eq => userProfile.includes(eq));
}

// ---------------------------------------------------------------------------
// Check contraindications
// ---------------------------------------------------------------------------
function isContraindicated(exercise, constraints) {
  if (!constraints || constraints.length === 0) return false;
  if (!exercise.contraindications || exercise.contraindications.length === 0) return false;
  const blockedTypes = constraints.map(c => c.constraint_type).filter(t => t !== 'custom');
  return exercise.contraindications.some(ci => blockedTypes.includes(ci));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
/**
 * exerciseFill(sessions, exercises, history, pbs, equipmentProfile, constraints, userId, weekISO, ruleTrace)
 *
 * @param {object[]} sessions        – sequenced sessions (with slots)
 * @param {object[]} exercises       – candidate exercises from DB (id,name,muscle_groups,is_compound,movement_pattern,equipment,contraindications)
 * @param {object[]} history         – recent history rows (exercise_name, ...)
 * @param {object[]} pbs             – personal bests (exercise_name, ...)
 * @param {string[]} equipmentProfile – user's equipment list
 * @param {object[]} constraints     – user_constraints rows
 * @param {string}   userId          – user ID (string or number) for seed
 * @param {string}   weekISO         – ISO week string, e.g. "2026-W24"
 * @param {string[]} ruleTrace       – mutable array
 * @returns {object[]} sessions with slots resolved to { ...slot, exercise_id, name, muscle_groups, is_compound, ... }
 */
function exerciseFill(sessions, exercises, history, pbs, equipmentProfile, constraints, userId, weekISO, ruleTrace) {
  const seed = buildSeed(userId, weekISO);

  // Sets for sticky lookup (exercises the user has logged or has PBs for).
  const historyNames = new Set(
    (history || []).map(h => (h.exercise_name || '').toLowerCase())
  );
  const pbNames = new Set(
    (pbs || []).map(p => (p.exercise_name || '').toLowerCase())
  );

  // Pre-shuffle the exercises once per session (stable within week).
  const shuffled = seededShuffle(exercises || [], seed);

  // Track which exercise IDs have already been assigned in a session
  // to avoid duplicates.
  return sessions.map(session => {
    const usedInSession = new Set();

    const filledSlots = (session.slots || []).map(slot => {
      // Filter candidates:
      // 1. movement_pattern matches
      const patternMatch = shuffled.filter(
        ex => ex.movement_pattern === slot.pattern
      );

      // 2. equipment compatible with profile
      const equipMatch = patternMatch.filter(
        ex => equipmentCompatible(ex.equipment, equipmentProfile)
      );

      // 3. not contraindicated
      const safePool = equipMatch.filter(
        ex => !isContraindicated(ex, constraints)
      );

      // 4. prefer sticky (in history/PBs)
      const sticky = safePool.filter(
        ex => historyNames.has((ex.name || '').toLowerCase()) ||
              pbNames.has((ex.name || '').toLowerCase())
      );

      // 5. for priority-1 slots prefer compound
      let pool = (sticky.length > 0 ? sticky : safePool).filter(
        ex => !usedInSession.has(ex.id)
      );

      if (slot.priority === 1) {
        const compound = pool.filter(ex => ex.is_compound);
        if (compound.length > 0) pool = compound;
      }

      // 6. Fallback: relax equipment constraint → bodyweight equivalents
      let fallbackUsed = false;
      if (pool.length === 0) {
        const bwFallback = patternMatch.filter(
          ex => (ex.equipment || []).includes('bodyweight') &&
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

      if (pool.length === 0) {
        // No candidate at all — drop slot and note it.
        ruleTrace.push(
          `Slot dropped: no viable exercise for pattern "${slot.pattern}" in "${session.archetype}" ` +
          `after constraint/equipment filtering.`
        );
        return null;
      }

      // Pick the first element (already seeded-shuffled for determinism).
      const chosen = pool[0];
      usedInSession.add(chosen.id);

      const stickyNote = historyNames.has((chosen.name || '').toLowerCase()) ||
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
        exercise_id:   chosen.id,
        name:          chosen.name,
        muscle_groups: chosen.muscle_groups || [],
        is_compound:   chosen.is_compound,
      };
    }).filter(Boolean); // remove dropped null slots

    return { ...session, slots: filledSlots };
  });
}

module.exports = { exerciseFill, buildSeed, seededShuffle };
