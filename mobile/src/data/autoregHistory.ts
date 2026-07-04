/**
 * autoregHistory — TICKET-141: history + target assembly for the
 * autoregulation suggestion strip.
 *
 * The rule module (lib/trainingEngine/v2/autoregulation.ts, FROZEN — do not
 * edit) takes a plain `AutoregSetObservation[]` + `AutoregTargets` + config and
 * returns a suggestion. This module is the ONLY place that turns "an exercise
 * id" into those two inputs, reading exclusively from the ON-DEVICE `sets`
 * table (localDb / expo-sqlite).
 *
 * TIER POLICY — deliberately NOT tier-branched (no isLocalFirst() check):
 *   Both free AND Pro write every logged set to the local SQLite `sets` table
 *   (see data/cardioMetrics.ts's file header for the same pattern — Pro's
 *   PowerSync layer mirrors rows into the same local DB, it does not replace
 *   it). Reading local SQLite here is therefore already zero-network on BOTH
 *   tiers; there is nothing to branch on. This satisfies TICKET-141's
 *   "zero network on any tier" requirement without an extra Pro code path.
 *
 * DROP-ROW DETECTION: a drop-chain row is tagged via
 * `sets.metrics_json = { drop: { chainId, index } }` (see
 * WorkoutLoggerHost.tsx's "S1: is this row part of a DROP chain?" comment).
 * `index === 0` is the CHAIN'S TOP SET (not itself a drop — it is a normal
 * working set that happened to start a chain) and MUST NOT be excluded;
 * `index >= 1` are the actual drop rows and are excluded from the reference
 * signal (mirrors the PR-guard logic in WorkoutLoggerHost: "a DROP row can
 * never claim a PR").
 *
 * TARGET BANDS:
 *   • Rep band: parsed from the routine's `targetReps` string ("8-12" → 8..12;
 *     a single number "5" → 5..5). Falls back to 8..12 (a generic
 *     hypertrophy-ish default) when absent/unparseable — the rule module
 *     still degrades sanely (AR-D1/AR-P1 boundaries just use the default).
 *   • RIR band: there is currently NO per-exercise/per-routine prescribed RIR
 *     anywhere in the data model (RoutineExercise/RoutineSessionExercise have
 *     no rir field — verified against api/routines.ts and RoutineStrip.tsx).
 *     Per the ticket spec ("RIR band ... from prescription rir when present
 *     else 1–3"), this defaults to A CONSTANT 1..3 band today. The
 *     `prescriptionRir` parameter below is accepted for forward-compat so a
 *     future routine-level RIR field can be threaded through with ZERO
 *     changes to this module's callers — it is simply unused (always
 *     undefined) until such a field exists.
 *
 * EQUIPMENT: resolved via the existing exerciseCatalog.getExerciseMedia() id/
 * name lookup (same helper ExerciseDetailSheet uses) for `equipment[0]`,
 * mapped onto the rule module's small AutoregEquipment enum. Falls back to a
 * bodyweight-name heuristic (mirrors StepperLogger's BODYWEIGHT_NAME_RE) when
 * the exercise isn't in the static catalog (e.g. a custom/server exercise),
 * then to 'other'.
 */

import { localDb } from '../db/localDb';
import { getExerciseMedia } from '../lib/trainingEngine/exerciseCatalog';
import type { AutoregEquipment, AutoregSetObservation, AutoregTargets } from '../lib/trainingEngine/v2/autoregulation';

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface SetHistoryRow {
  weight_kg: number | null;
  weight_raw: number | null;
  reps: number | null;
  rir: number | null;
  logged_at: string | null;
  metrics_json: string | null;
}

/** How many most-recent lift rows to pull per exercise (cheap, indexed by workout_id join). */
const HISTORY_ROW_LIMIT = 60;

// ---------------------------------------------------------------------------
// History — read + drop-tag detection
// ---------------------------------------------------------------------------

/**
 * The logged-set history for ONE exercise, newest-first source rows converted
 * into the rule module's `AutoregSetObservation[]` shape. Never throws — any
 * SQLite failure resolves to an empty array so a missing table/column can
 * never crash the logger (mirrors cardioMetrics.ts's best-effort convention).
 */
export async function getAutoregHistory(exerciseId: string): Promise<AutoregSetObservation[]> {
  if (!exerciseId) return [];
  try {
    await localDb.init();
    const rows = await localDb.getAll<SetHistoryRow>(
      `SELECT COALESCE(weight_kg, weight_raw / 8.0) AS weight_kg, weight_raw, reps, rir, logged_at, metrics_json
         FROM sets
        WHERE exercise_id = ? AND kind = 'lift'
        ORDER BY logged_at DESC
        LIMIT ?`,
      [exerciseId, HISTORY_ROW_LIMIT],
    );
    return rows
      .filter((r) => r.logged_at != null)
      .map((r) => ({
        loggedAt: r.logged_at as string,
        weightKg: r.weight_kg ?? 0,
        reps: r.reps ?? 0,
        rir: r.rir,
        isDrop: isDropRow(r.metrics_json),
      }));
  } catch {
    return [];
  }
}

/** True when metrics_json tags this row as a drop WITHIN a chain (index >= 1). */
function isDropRow(metricsJson: string | null): boolean {
  if (!metricsJson) return false;
  try {
    const parsed = JSON.parse(metricsJson) as { drop?: { chainId?: string; index?: number } };
    const idx = parsed?.drop?.index;
    return typeof idx === 'number' && idx >= 1;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Targets — rep band (from the routine) + RIR band (constant default today)
// ---------------------------------------------------------------------------

/** Fallback rep band when targetReps is absent/unparseable. */
const DEFAULT_REPS_LOW = 8;
const DEFAULT_REPS_HIGH = 12;

/** Default RIR band — see file header: no per-exercise prescribed RIR exists yet. */
const DEFAULT_RIR_LOW = 1;
const DEFAULT_RIR_HIGH = 3;

/**
 * Parse a routine's `targetReps` string ("8-12", "5", "8–12" w/ en-dash, or
 * garbage) into a low/high band. A single number becomes low===high (a fixed
 * target, e.g. 5x5). Returns the module default when nothing usable parses.
 */
export function parseRepsBand(targetReps: string | null | undefined): { low: number; high: number } {
  const raw = (targetReps ?? '').trim();
  if (!raw) return { low: DEFAULT_REPS_LOW, high: DEFAULT_REPS_HIGH };
  const normalized = raw.replace(/[–—]/g, '-'); // en/em dash -> hyphen
  const rangeMatch = normalized.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1]!, 10);
    const high = parseInt(rangeMatch[2]!, 10);
    if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high >= low) {
      return { low, high };
    }
  }
  const singleMatch = normalized.match(/(\d+)/);
  if (singleMatch) {
    const n = parseInt(singleMatch[1]!, 10);
    if (Number.isFinite(n) && n > 0) return { low: n, high: n };
  }
  return { low: DEFAULT_REPS_LOW, high: DEFAULT_REPS_HIGH };
}

/**
 * Build the AutoregTargets band for one exercise.
 *
 * @param targetReps      the routine/session exercise's targetReps string (e.g. "8-12").
 * @param prescriptionRir a FUTURE per-exercise RIR prescription, when the data
 *                        model gains one. Always undefined today (see file
 *                        header) — accepted now so callers don't need to
 *                        change when it lands. When provided, both band ends
 *                        are set to the same value (a fixed RIR target).
 */
export function buildAutoregTargets(
  targetReps: string | null | undefined,
  prescriptionRir?: number | null,
): AutoregTargets {
  const { low, high } = parseRepsBand(targetReps);
  if (prescriptionRir != null && Number.isFinite(prescriptionRir)) {
    return {
      targetRepsLow: low,
      targetRepsHigh: high,
      targetRirLow: prescriptionRir,
      targetRirHigh: prescriptionRir,
    };
  }
  return {
    targetRepsLow: low,
    targetRepsHigh: high,
    targetRirLow: DEFAULT_RIR_LOW,
    targetRirHigh: DEFAULT_RIR_HIGH,
  };
}

// ---------------------------------------------------------------------------
// Equipment resolution
// ---------------------------------------------------------------------------

const KNOWN_EQUIPMENT: readonly AutoregEquipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];

/** Mirrors StepperLogger's BODYWEIGHT_NAME_RE (kept local — that one isn't exported). */
const BODYWEIGHT_NAME_RE =
  /\b(pull[\s-]?ups?|chin[\s-]?ups?|push[\s-]?ups?|press[\s-]?ups?|dips?|planks?|sit[\s-]?ups?|crunch(es)?|leg raises?|muscle[\s-]?ups?|pistol squats?|burpees?|mountain climbers?|hanging|inverted rows?|nordic|bodyweight)\b/i;

/**
 * Resolve the rule module's small `AutoregEquipment` enum for an exercise.
 * Lookup order: static catalog media (getExerciseMedia, id then name) -> the
 * first tag that matches a KNOWN_EQUIPMENT value; else a bodyweight-name
 * heuristic; else 'other' (the rule module's generic barbell-like default).
 */
export function resolveAutoregEquipment(exerciseId: string | null | undefined, exerciseName: string): AutoregEquipment {
  const media = getExerciseMedia({ id: exerciseId, name: exerciseName });
  if (media?.equipment?.length) {
    for (const tag of media.equipment) {
      const match = KNOWN_EQUIPMENT.find((k) => k === tag);
      if (match) return match;
    }
  }
  if (BODYWEIGHT_NAME_RE.test(exerciseName ?? '')) return 'bodyweight';
  return 'other';
}

// ---------------------------------------------------------------------------
// One-shot convenience — everything the strip needs for the current exercise.
// ---------------------------------------------------------------------------

export interface AutoregExerciseContext {
  history: AutoregSetObservation[];
  targets: AutoregTargets;
  equipment: AutoregEquipment;
}

/**
 * Assemble the full context (history + targets + equipment) for one exercise
 * in a single call — the shape the logger strip actually needs. Never throws:
 * a failure at any step degrades to an empty/default context, which
 * suggestNextLoad already handles (empty history -> null suggestion, i.e. the
 * strip simply doesn't render).
 */
export async function getAutoregContext(
  exerciseId: string,
  exerciseName: string,
  targetReps: string | null | undefined,
  prescriptionRir?: number | null,
): Promise<AutoregExerciseContext> {
  const [history] = await Promise.all([getAutoregHistory(exerciseId)]);
  return {
    history,
    targets: buildAutoregTargets(targetReps, prescriptionRir),
    equipment: resolveAutoregEquipment(exerciseId, exerciseName),
  };
}
