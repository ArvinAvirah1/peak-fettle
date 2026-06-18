// loading.ts — Training Engine v1 (mobile port)
// Epley-based loading for each filled slot.
// Faithfully ported from server/lib/trainingEngine/loading.js
//
// Spec §3 step 5:
//   e1RM = weight * (1 + min(reps,12)/30)  [Epley, same cap as plans.js pbMap]
//   Working weight = e1rm / (1 + targetReps/30) × [0.85-0.90]  (week 1)
//   Rounded to 2.5kg.
//   No history for that lift → RPE-only note.
//   3-week progression: linear / dup / block

import type { FilledSession, FilledSlot, HistoryRow, PBRow } from './exerciseFill';

// ---------------------------------------------------------------------------
// Epley helpers
// ---------------------------------------------------------------------------

export function epley1RM(weightKg: number, reps: number): number {
  const cappedReps = Math.min(reps, 12);
  if (cappedReps <= 1) return weightKg;
  return weightKg * (1 + cappedReps / 30);
}

export function workingWeightFromE1RM(e1rm: number, targetReps: number): number {
  const denom = 1 + targetReps / 30;
  return e1rm / denom;
}

export function roundTo2_5(kg: number): number {
  return Math.round(kg / 2.5) * 2.5;
}

function parseTargetReps(repsStr: string | number): number {
  const match = String(repsStr ?? '').match(/(\d+)/);
  const parsed = match && match[1] != null ? parseInt(match[1], 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}

function isLowerBody(pattern: string): boolean {
  return ['squat', 'hinge', 'lunge', 'isolation_legs', 'isolation_calves'].includes(
    pattern
  );
}

// ---------------------------------------------------------------------------
// Warm-up ladder
// Rungs: 40%, 55%, 70%, 85% of working weight; skip rungs ≤ bar+20kg (20kg).
// ---------------------------------------------------------------------------
export function warmupLadder(
  workingWeightKg: number
): Array<{ weight_kg: number; reps: number }> {
  const barWeight = 20;
  const rungs = [0.4, 0.55, 0.7, 0.85];
  return rungs
    .map((pct) => ({
      weight_kg: roundTo2_5(workingWeightKg * pct),
      reps: pct <= 0.55 ? 5 : pct <= 0.7 ? 3 : 1,
    }))
    .filter((r) => r.weight_kg > barWeight + 20);
}

// ---------------------------------------------------------------------------
// 3-week progression per model
// ---------------------------------------------------------------------------
function weeklyDeltas(
  progressionModel: string,
  pattern: string
): [number, number, number] {
  const lower = isLowerBody(pattern);
  const baseIncrement = lower ? 2.5 : 1.25;

  switch (progressionModel) {
    case 'linear':
      return [0, baseIncrement, baseIncrement * 2];
    case 'dup':
      return [0, baseIncrement * 1.5, baseIncrement * 0.5];
    case 'block':
      return [0, baseIncrement, baseIncrement * 2];
    default:
      return [0, baseIncrement, baseIncrement * 2];
  }
}

// ---------------------------------------------------------------------------
// Week output types
// ---------------------------------------------------------------------------
export interface WeekOutput {
  week_number: number;
  sessions: FilledSession[];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function loading(
  filledSessions: FilledSession[],
  history: HistoryRow[],
  pbs: PBRow[],
  progressionModel: string,
  ruleTrace: string[]
): WeekOutput[] {
  // Build a lookup: exercise_name (lowercase) → best e1RM seen in history
  const e1rmMap = new Map<string, number>();

  for (const row of history || []) {
    if (!row.exercise_name || row.e1rm_kg == null) continue;
    const key = row.exercise_name.toLowerCase();
    const prev = e1rmMap.get(key);
    if (prev == null || row.e1rm_kg > prev) {
      e1rmMap.set(key, parseFloat(String(row.e1rm_kg)));
    }
  }

  for (const pb of pbs || []) {
    if (!pb.exercise_name || pb.weight_kg == null || pb.reps == null) continue;
    const key = pb.exercise_name.toLowerCase();
    const e1rm = epley1RM(
      parseFloat(String(pb.weight_kg)),
      parseInt(String(pb.reps), 10)
    );
    const prev = e1rmMap.get(key);
    if (prev == null || e1rm > prev) {
      e1rmMap.set(key, e1rm);
    }
  }

  const model = progressionModel || 'linear';

  return [1, 2, 3].map((weekNum) => {
    const sessions: FilledSession[] = filledSessions.map((session) => {
      const slots: FilledSlot[] = (session.slots || []).map((slot: FilledSlot) => {
        if (!slot.exercise_id && !slot.name) return slot;

        const targetReps = parseTargetReps(slot.reps);
        const e1rm = e1rmMap.get((slot.name || '').toLowerCase());
        const deltas = weeklyDeltas(model, slot.pattern);
        const delta = deltas[weekNum - 1] || 0;

        let weight_kg: number | null = null;
        let warmup: Array<{ weight_kg: number; reps: number }> | undefined =
          undefined;

        if (e1rm != null && e1rm > 0) {
          const rawWeek1 = workingWeightFromE1RM(e1rm, targetReps) * 0.875;
          const week1W = roundTo2_5(rawWeek1);
          weight_kg = roundTo2_5(week1W + delta);

          ruleTrace.push(
            `Loading "${slot.name}": e1RM ${e1rm.toFixed(1)}kg → week-1 working weight ` +
              `${week1W}kg (87.5% of target); week ${weekNum} = ${weight_kg}kg (+${delta}kg progression, ${model} model).`
          );

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
          coaching_note: slot.coaching_note,
        };
      });

      return { ...session, slots };
    });

    return { week_number: weekNum, sessions };
  });
}
