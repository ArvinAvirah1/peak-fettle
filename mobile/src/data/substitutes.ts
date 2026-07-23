/**
 * substitutes.ts — SUBS-001: user-preloaded exercise substitutes.
 * =============================================================================
 * Two layers, one read API:
 *
 *   GLOBAL  ("all routines")  → on-device `exercise_substitutes` table (v17),
 *                               managed here. Keyed by the NORMALIZED source
 *                               exercise name (planGen/quickSwap normalizeName)
 *                               with the library UUID kept alongside when known,
 *                               so name-only template exercises still match.
 *   ROUTINE ("this routine")  → RoutineExercise.substitutes inside the routine's
 *                               exercises JSON (NOT persisted here — the routine
 *                               editor owns those writes via updateRoutine).
 *
 * `mergedSubstitutesFor` produces the display list for the swap sheet: routine
 * subs first, then global subs, deduped by normalized name (routine scope wins).
 *
 * TIER POLICY: device-local for BOTH tiers (same pattern as progressPhotos.ts —
 * no isLocalFirst branch, no REST, no server counterpart). The free path stays
 * zero-network; Pro cross-device sync of GLOBAL subs is a possible later,
 * additive server task. Routine-scoped subs DO reach the server for Pro users,
 * riding inside the routines exercises JSON.
 * =============================================================================
 */

import { localDb, genId } from '../db/localDb';
import { normalizeName } from '../planGen/quickSwap';
import type { SubstituteRef, Routine } from '../api/routines';
import { listRoutines, updateRoutine } from './routines';
import type { TierUser } from './backup/tierPolicy';

export type SubstituteScope = 'routine' | 'global';

/** One substitute as shown in the swap sheet (ref + where it came from). */
export interface ScopedSubstitute extends SubstituteRef {
  scope: SubstituteScope;
}

/** Minimal reference to the exercise being substituted AWAY from. */
export interface SourceExerciseRef {
  exercise_id?: string | null;
  name: string;
}

interface SubstituteRow {
  id: string;
  source_key: string;
  source_exercise_id: string | null;
  source_name: string;
  sub_exercise_id: string | null;
  sub_name: string;
  created_at: string | null;
}

/** The normalized lookup key for a source exercise (name is source of truth). */
export function sourceKeyFor(source: SourceExerciseRef): string {
  return normalizeName(source.name || '');
}

/**
 * List the GLOBAL substitutes for an exercise. Matches on the normalized name
 * key OR (when the source carries a library id) the exact id — so "Bench Press"
 * picked from the library and a name-only "bench press" in a template resolve
 * to the same substitute list. Best-effort: returns [] on any storage error.
 */
export async function listGlobalSubstitutes(
  source: SourceExerciseRef,
): Promise<SubstituteRef[]> {
  const key = sourceKeyFor(source);
  if (!key && !source.exercise_id) return [];
  try {
    await localDb.init();
    const rows = await localDb.getAll<SubstituteRow>(
      `SELECT * FROM exercise_substitutes
        WHERE source_key = ? OR (source_exercise_id IS NOT NULL AND source_exercise_id = ?)
        ORDER BY created_at ASC`,
      [key, source.exercise_id ?? ''],
    );
    const seen = new Set<string>();
    const out: SubstituteRef[] = [];
    for (const r of rows) {
      if (!r.sub_name) continue;
      const dedupe = normalizeName(r.sub_name);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ exercise_id: r.sub_exercise_id ?? null, name: r.sub_name });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Add a GLOBAL substitute for an exercise. Idempotent: an existing
 * (source, sub) pair (matched on normalized names) is left untouched.
 */
export async function addGlobalSubstitute(
  source: SourceExerciseRef,
  sub: SubstituteRef,
): Promise<void> {
  const key = sourceKeyFor(source);
  const subKey = normalizeName(sub.name || '');
  if (!key || !subKey || key === subKey) return;
  await localDb.init();
  const existing = await localDb.getFirst<SubstituteRow>(
    `SELECT * FROM exercise_substitutes WHERE source_key = ? AND sub_name = ? COLLATE NOCASE`,
    [key, sub.name],
  );
  if (existing) return;
  // Second pass for punctuation-variant duplicates ("DB-Press" vs "DB Press").
  const all = await localDb.getAll<SubstituteRow>(
    `SELECT * FROM exercise_substitutes WHERE source_key = ?`,
    [key],
  );
  if (all.some((r) => normalizeName(r.sub_name) === subKey)) return;
  await localDb.execute(
    `INSERT INTO exercise_substitutes
       (id, source_key, source_exercise_id, source_name, sub_exercise_id, sub_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      genId(),
      key,
      source.exercise_id ?? null,
      source.name,
      sub.exercise_id ?? null,
      sub.name,
      new Date().toISOString(),
    ],
    { tables: ['exercise_substitutes'] },
  );
}

/** Remove a GLOBAL substitute pair (matched on normalized names). */
export async function removeGlobalSubstitute(
  source: SourceExerciseRef,
  sub: SubstituteRef,
): Promise<void> {
  const key = sourceKeyFor(source);
  const subKey = normalizeName(sub.name || '');
  if (!key || !subKey) return;
  await localDb.init();
  const rows = await localDb.getAll<SubstituteRow>(
    `SELECT * FROM exercise_substitutes WHERE source_key = ?`,
    [key],
  );
  for (const r of rows) {
    if (normalizeName(r.sub_name) === subKey) {
      await localDb.execute(
        `DELETE FROM exercise_substitutes WHERE id = ?`,
        [r.id],
        { tables: ['exercise_substitutes'] },
      );
    }
  }
}

/**
 * The swap sheet's display list: routine-scoped subs first (in stored order),
 * then global subs, deduped by normalized name (routine wins), self excluded.
 */
export async function mergedSubstitutesFor(
  source: SourceExerciseRef,
  routineSubs: SubstituteRef[] | null | undefined,
): Promise<ScopedSubstitute[]> {
  const selfKey = sourceKeyFor(source);
  const seen = new Set<string>();
  const out: ScopedSubstitute[] = [];
  for (const s of routineSubs ?? []) {
    if (!s?.name) continue;
    const k = normalizeName(s.name);
    if (!k || k === selfKey || seen.has(k)) continue;
    seen.add(k);
    out.push({ exercise_id: s.exercise_id ?? null, name: s.name, scope: 'routine' });
  }
  const global = await listGlobalSubstitutes(source);
  for (const s of global) {
    const k = normalizeName(s.name);
    if (!k || k === selfKey || seen.has(k)) continue;
    seen.add(k);
    out.push({ exercise_id: s.exercise_id ?? null, name: s.name, scope: 'global' });
  }
  return out;
}

/**
 * SUBS-001 server-compat guard: routine JSON (and therefore the server Zod
 * schema for Pro saves) only accepts a UUID exercise_id. Catalog-v2 ids
 * ('barbell_bench_press') and other non-UUID ids must be stored as null —
 * name stays the source of truth (quickSwap resolves it by name heuristics).
 * Use at every site that writes an exercise_id INTO a routine.
 */
export function uuidOrNull(id: string | null | undefined): string | null {
  if (!id) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

// ---------------------------------------------------------------------------
// Cross-routine alternatives (founder request 2026-07-22)
// ---------------------------------------------------------------------------

/**
 * All routines that contain an exercise whose NORMALIZED name matches
 * `exerciseName` (e.g. "Shoulder Press" appears in both Push A and Push B).
 * Tier-branched via listRoutines. Best-effort: [] on any error.
 */
export async function routinesContainingExercise(
  user: TierUser | null | undefined,
  exerciseName: string,
): Promise<Routine[]> {
  const key = normalizeName(exerciseName || '');
  if (!key) return [];
  try {
    const all = await listRoutines(user);
    return all.filter((r) =>
      (r.exercises ?? []).some((e) => normalizeName(e.name) === key),
    );
  } catch {
    return [];
  }
}

/**
 * Append `sub` to the substitute list of EVERY slot named `exerciseName`
 * (normalized match) in each given routine. Dedupes by normalized name, skips
 * the self-pair, respects the max-10 cap, and guards exercise_id with
 * uuidOrNull (server Zod). Each routine saves independently (best-effort).
 *
 * @returns attempted = routines that actually needed the change (dups/caps are
 *          NOT attempts); updated = routines whose save succeeded. Callers
 *          should treat attempted 0 as a silent no-op, and updated 0 with
 *          attempted > 0 as a save failure.
 */
export async function addSubstituteToRoutines(
  user: TierUser | null | undefined,
  routines: Routine[],
  exerciseName: string,
  sub: SubstituteRef,
): Promise<{ updated: number; attempted: number }> {
  const key = normalizeName(exerciseName || '');
  const subKey = normalizeName(sub.name || '');
  if (!key || !subKey || key === subKey) return { updated: 0, attempted: 0 };
  const entry: SubstituteRef = { exercise_id: uuidOrNull(sub.exercise_id), name: sub.name };
  let updated = 0;
  let attempted = 0;
  for (const r of routines) {
    let changed = false;
    const exercises = (r.exercises ?? []).map((e) => {
      if (normalizeName(e.name) !== key) return e;
      const cur = e.substitutes ?? [];
      if (cur.some((s) => normalizeName(s.name) === subKey)) return e;
      if (cur.length >= 10) return e;
      changed = true;
      return { ...e, substitutes: [...cur, entry].slice(0, 10) };
    });
    if (!changed) continue;
    attempted++;
    try {
      await updateRoutine(user, r.id, { name: r.name, exercises });
      updated++;
    } catch {
      // best-effort — a failed routine save must not block the others
    }
  }
  return { updated, attempted };
}
