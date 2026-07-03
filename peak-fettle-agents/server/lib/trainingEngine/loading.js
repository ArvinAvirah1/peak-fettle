// loading.js — Training Engine v1
// Epley-based loading for each filled slot.
//
// Spec §3 step 5:
//   e1RM = weight * (1 + min(reps,12)/30)  [Epley, same cap as plans.js pbMap]
//   Working weight = e1rm / (1 + targetReps/30) × [0.85-0.90]  (week 1)
//   Rounded to 2.5kg.
//   No history for that lift → RPE-only note.
//   3-week progression:
//     linear: +2.5kg/wk lower body, +1.25-2.5kg upper body
//     dup:    varies by session (heavy/volume)
//     block:  week 3 = peak or deload per template

'use strict';

// ---------------------------------------------------------------------------
// Epley helpers
// ---------------------------------------------------------------------------
/**
 * Compute estimated 1RM from a set.
 * reps capped at 12 per spec.
 */
function epley1RM(weightKg, reps) {
  const cappedReps = Math.min(reps, 12);
  if (cappedReps <= 1) return weightKg;
  return weightKg * (1 + cappedReps / 30);
}

/**
 * Derive working weight for a given rep target from e1RM.
 * targetWeight = e1rm / (1 + reps/30)
 */
function workingWeightFromE1RM(e1rm, targetReps) {
  const denom = 1 + targetReps / 30;
  return e1rm / denom;
}

/**
 * Round weight to nearest 2.5kg (standard plate rounding).
 */
function roundTo2_5(kg) {
  return Math.round(kg / 2.5) * 2.5;
}

/**
 * Parse the first numeric value from a rep string like "8-12" or "5" or "3-5".
 */
function parseTargetReps(repsStr) {
  const match = String(repsStr).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 8;
}

/**
 * Is this a lower-body movement pattern?
 */
function isLowerBody(pattern) {
  return ['squat', 'hinge', 'lunge', 'isolation_legs', 'isolation_calves'].includes(pattern);
}

// ---------------------------------------------------------------------------
// Warm-up ladder for a given working weight
// Rungs: 40%, 55%, 70%, 85% of working weight; skip rungs < 20kg above bar (20kg).
// ---------------------------------------------------------------------------
function warmupLadder(workingWeightKg) {
  const barWeight = 20; // standard barbell
  const rungs = [0.40, 0.55, 0.70, 0.85];
  return rungs
    .map(pct => ({
      weight_kg: roundTo2_5(workingWeightKg * pct),
      reps: pct <= 0.55 ? 5 : pct <= 0.70 ? 3 : 1,
    }))
    .filter(r => r.weight_kg > barWeight + 20);
}

// ---------------------------------------------------------------------------
// 3-week progression per model
// Returns array of 3 weekly load adjustments (delta from week-1 base)
// ---------------------------------------------------------------------------
function weeklyDeltas(progressionModel, pattern) {
  const lower = isLowerBody(pattern);
  const baseIncrement = lower ? 2.5 : 1.25;

  switch (progressionModel) {
    case 'linear':
      return [0, baseIncrement, baseIncrement * 2];
    case 'dup':
      // DUP: week 1 moderate, week 2 heavier, week 3 peak or slightly back off
      return [0, baseIncrement * 1.5, baseIncrement * 0.5];
    case 'block':
      // Block: accumulation → intensification → peak/deload
      return [0, baseIncrement, baseIncrement * 2];
    default:
      return [0, baseIncrement, baseIncrement * 2];
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
/**
 * loading(filledSessions, history, pbs, progressionModel, ruleTrace)
 *
 * @param {object[]} filledSessions  – sessions with slots already exercise-filled
 * @param {object[]} history         – recent history rows (exercise_name, weight_kg, reps, e1rm_kg)
 * @param {object[]} pbs             – PB rows (exercise_name, weight_kg, reps)
 * @param {string}   progressionModel – 'linear'|'dup'|'block'
 * @param {string[]} ruleTrace       – mutable array
 * @returns {object[]} 3-week array; each element has sessions[] with slots[] augmented with
 *                     weight_kg, coaching_note, warmup?
 */
function loading(filledSessions, history, pbs, progressionModel, ruleTrace) {
  // Build a lookup: exercise_name (lowercase) → best e1RM seen in history
  const e1rmMap = new Map();
  for (const row of (history || [])) {
    if (!row.exercise_name || row.e1rm_kg == null) continue;
    const key  = row.exercise_name.toLowerCase();
    const prev = e1rmMap.get(key);
    if (prev == null || row.e1rm_kg > prev) {
      e1rmMap.set(key, parseFloat(row.e1rm_kg));
    }
  }

  // Also check PBs for e1RM (PBs might be better than recent 14-day history).
  for (const pb of (pbs || [])) {
    if (!pb.exercise_name || !pb.weight_kg || !pb.reps) continue;
    const key  = pb.exercise_name.toLowerCase();
    const e1rm = epley1RM(parseFloat(pb.weight_kg), parseInt(pb.reps, 10));
    const prev = e1rmMap.get(key);
    if (prev == null || e1rm > prev) {
      e1rmMap.set(key, e1rm);
    }
  }

  const model = progressionModel || 'linear';

  // Build 3 weeks.
  const weeks = [1, 2, 3].map(weekNum => {
    const sessions = filledSessions.map(session => {
      const slots = (session.slots || []).map(slot => {
        if (!slot.exercise_id && !slot.name) return slot;

        const targetReps = parseTargetReps(slot.reps);
        const e1rm = e1rmMap.get((slot.name || '').toLowerCase());
        const deltas = weeklyDeltas(model, slot.pattern);
        const delta = deltas[weekNum - 1] || 0;

        let weight_kg    = null;
        let coaching_note = null;
        let warmup       = undefined;

        if (e1rm != null && e1rm > 0) {
          // Derive week-1 working weight from e1RM.
          const rawWeek1 = workingWeightFromE1RM(e1rm, targetReps) * 0.875; // midpoint 85-90%
          const week1W   = roundTo2_5(rawWeek1);
          weight_kg      = roundTo2_5(week1W + delta);

          ruleTrace.push(
            `Loading "${slot.name}": e1RM ${e1rm.toFixed(1)}kg → week-1 working weight ` +
            `${week1W}kg (87.5% of target); week ${weekNum} = ${weight_kg}kg (+${delta}kg progression, ${model} model).`
          );

          // Warm-up ladder for compound, priority-1 slots.
          if (slot.priority === 1 && slot.is_compound && weekNum === 1) {
            warmup = warmupLadder(weight_kg);
          }
        } else {
          ruleTrace.push(
            `Loading "${slot.name}": no history or PB found — prescribing RPE-only. ` +
            `Start light (RPE 7), find your level over first 2 sessions.`
          );
        }

        return {
          ...slot,
          weight_kg,
          warmup,
          coaching_note, // will be filled by reasoning.js
        };
      });

      return { ...session, slots };
    });

    return { week_number: weekNum, sessions };
  });

  return weeks;
}

module.exports = { loading, epley1RM, workingWeightFromE1RM, roundTo2_5, warmupLadder };
