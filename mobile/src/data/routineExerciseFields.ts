/**
 * routineExerciseFields.ts — PURE allowlist + normalize for RoutineExercise's
 * S2 superset/dropset fields (spec §0.1 choke points).
 * =============================================================================
 * The local `parseExercises` (src/data/routines.ts) and the migrate-to-Pro
 * parse+dedup (src/data/migrateToPro.ts) BOTH read the same optional fields
 * (superset_group / superset_rounds / dropset). Rather than duplicate the
 * bounds in two places (and risk drift), the validation + canonical
 * normalization live here, once.
 *
 * ALLOWLIST, not passthrough: every field is explicitly picked and type/bounds
 * checked; garbage is dropped. The DATA-01 import-injection guard on routine
 * import relies on this allowlisting — do NOT switch to a blind `{...e}` spread.
 *
 * Bounds mirror the server Zod schema (server/routes/routines.js
 * ExerciseEntrySchema) so a value that survives here round-trips through the
 * server (Zod strip + echo) UNCHANGED — which is what keeps canonicalRoutineKey
 * stable across the Free→Pro upload (a mismatch would only ever risk a duplicate
 * routine, never data loss).
 *
 * PURE — imports only the RoutineExercise TYPE. No RN / expo / db. Unit-tested by
 * mobile/src/data/__tests__/routineFields.test.js.
 * =============================================================================
 */

import type { RoutineExercise } from '../api/routines';

export type DropsetField = { last_n: number | 'all'; drops?: number; drop_pct?: number };

/** superset_group: a short, non-empty string (group letter/id), else undefined. */
export function parseSupersetGroup(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0 && v.length <= 40) return v;
  return undefined;
}

/** superset_rounds: an integer 1–10, else undefined. */
export function parseSupersetRounds(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10) return v;
  return undefined;
}

/**
 * dropset: { last_n: int 1–10 | 'all'; drops?: int 1–3; drop_pct?: int 5–40 }.
 * A structurally-invalid shape (no valid last_n) drops the WHOLE field — never a
 * partial/garbage dropset. drops/drop_pct are kept only when themselves valid.
 */
export function parseDropset(v: unknown): DropsetField | undefined {
  if (v == null || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  let lastN: number | 'all';
  if (o.last_n === 'all') {
    lastN = 'all';
  } else if (
    typeof o.last_n === 'number' && Number.isInteger(o.last_n) && o.last_n >= 1 && o.last_n <= 10
  ) {
    lastN = o.last_n;
  } else {
    return undefined;
  }
  const out: DropsetField = { last_n: lastN };
  if (typeof o.drops === 'number' && Number.isInteger(o.drops) && o.drops >= 1 && o.drops <= 3) {
    out.drops = o.drops;
  }
  if (
    typeof o.drop_pct === 'number' && Number.isInteger(o.drop_pct) && o.drop_pct >= 5 && o.drop_pct <= 40
  ) {
    out.drop_pct = o.drop_pct;
  }
  return out;
}

/**
 * Map one raw JSON object → an allowlisted RoutineExercise, carrying the base
 * fields plus the S2 superset/dropset fields (each independently validated and
 * dropped when garbage). Absent/invalid fields are simply omitted (back-compat).
 */
export function allowlistExercise(e: Record<string, unknown>): RoutineExercise {
  const base: RoutineExercise = {
    exercise_id: (e.exercise_id as string | null | undefined) ?? null,
    name: typeof e.name === 'string' ? e.name : '',
    target_sets: typeof e.target_sets === 'number' ? e.target_sets : undefined,
    target_reps: typeof e.target_reps === 'string' ? e.target_reps : undefined,
  };
  const group = parseSupersetGroup(e.superset_group);
  if (group !== undefined) base.superset_group = group;
  const rounds = parseSupersetRounds(e.superset_rounds);
  if (rounds !== undefined) base.superset_rounds = rounds;
  const dropset = parseDropset(e.dropset);
  if (dropset !== undefined) base.dropset = dropset;
  return base;
}

/**
 * A fixed-key-order, null-folded normalization of ONE exercise for the
 * canonicalRoutineKey identity (migrateToPro dedup). Two exercises that differ
 * only in grouping/dropset config normalize DIFFERENTLY (so they are not wrongly
 * deduped); two identical ones normalize identically. Matches the server echo
 * (Zod strips unknown keys, jsonb doesn't preserve key order) so the local key
 * equals the server-echo key.
 */
export function canonicalizeExercise(e: RoutineExercise): Record<string, unknown> {
  return {
    exercise_id: e.exercise_id ?? null,
    name: e.name,
    target_sets: typeof e.target_sets === 'number' ? e.target_sets : null,
    target_reps: typeof e.target_reps === 'string' ? e.target_reps : null,
    superset_group:
      typeof e.superset_group === 'string' && e.superset_group.length > 0 ? e.superset_group : null,
    superset_rounds: typeof e.superset_rounds === 'number' ? e.superset_rounds : null,
    dropset: e.dropset
      ? {
          last_n: e.dropset.last_n,
          drops: typeof e.dropset.drops === 'number' ? e.dropset.drops : null,
          drop_pct: typeof e.dropset.drop_pct === 'number' ? e.dropset.drop_pct : null,
        }
      : null,
  };
}
