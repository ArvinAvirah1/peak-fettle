/**
 * setNotes — TICKET-129: per-set free-text notes + quick-tap flags.
 *
 * Set-level annotations ("felt pinchy", "paused reps", "belt on") — the real
 * training information that free-text `workouts.notes` can't capture per set.
 *
 * Tier-branched, mirroring setEditing.ts:
 *   • Free / local-first → UPDATE the on-device `sets` row in place (schema v11:
 *     sets.note TEXT, sets.flags INTEGER DEFAULT 0).
 *   • Pro (server) → PATCH /sets/:id (additive, drift-guarded — see
 *     peak-fettle-agents/server/routes/sets.js).
 *
 * Flag bitmask constants live in db/localSchema.ts (SET_FLAG_* / SET_FLAG_DEFS)
 * so the schema and this module share ONE source of truth for bit meaning.
 */

import { localDb } from '../db/localDb';
import { isLocalFirst, TierUser } from './backup/tierPolicy';
import { updateSetNoteFlags as apiUpdateSetNoteFlags } from '../api/sets';
import {
  SET_FLAG_PAUSED,
  SET_FLAG_TEMPO,
  SET_FLAG_BELT,
  SET_FLAG_PIN_RACK,
  SET_FLAG_DISCOMFORT,
  SET_FLAG_DEFS,
} from '../db/localSchema';

export { SET_FLAG_PAUSED, SET_FLAG_TEMPO, SET_FLAG_BELT, SET_FLAG_PIN_RACK, SET_FLAG_DISCOMFORT, SET_FLAG_DEFS };

export interface SetNoteFlags {
  note: string | null;
  flags: number;
}

/** True if the given bit is set in a flags bitmask. */
export function hasFlag(flags: number | null | undefined, bit: number): boolean {
  return ((flags ?? 0) & bit) === bit;
}

/** Toggle a single bit in a flags bitmask, returning the new mask. */
export function toggleFlag(flags: number | null | undefined, bit: number): number {
  const current = flags ?? 0;
  return hasFlag(current, bit) ? current & ~bit : current | bit;
}

/** Human-readable labels for the currently-set bits, in SET_FLAG_DEFS order. */
export function flagLabels(flags: number | null | undefined): string[] {
  if (!flags) return [];
  return SET_FLAG_DEFS.filter((d) => hasFlag(flags, d.bit)).map((d) => d.label);
}

/**
 * Read the note/flags for a single logged set. Free tier reads local SQLite
 * directly; Pro tier's set rows arrive already-shaped from GET /sets/GET
 * /workouts (WorkoutSet.note/flags) — callers on the Pro path should read
 * those fields directly rather than calling this (kept here for symmetry /
 * offline-cache reads on Pro).
 */
export async function getLocalSetNoteFlags(setId: string): Promise<SetNoteFlags | null> {
  const row = await localDb.getFirst<{ note: string | null; flags: number | null }>(
    'SELECT note, flags FROM sets WHERE id = ?',
    [setId],
  );
  if (!row) return null;
  return { note: row.note ?? null, flags: row.flags ?? 0 };
}

/**
 * Save the note/flags for an already-logged set. `note: null` clears the note;
 * `note: undefined` leaves it unchanged (only relevant for the Pro PATCH path —
 * the free/local path always writes both columns since SQLite has no partial
 * UPDATE-if-present concept here and reading-then-writing both is cheap).
 */
export async function saveSetNoteFlags(
  user: TierUser | null | undefined,
  setId: string,
  patch: { note?: string | null; flags?: number },
): Promise<void> {
  if (!setId) return;

  if (isLocalFirst(user)) {
    await localDb.init();
    const current = await getLocalSetNoteFlags(setId);
    const nextNote = patch.note !== undefined ? patch.note : (current?.note ?? null);
    const nextFlags = patch.flags !== undefined ? patch.flags : (current?.flags ?? 0);
    await localDb.execute(
      'UPDATE sets SET note = ?, flags = ? WHERE id = ?',
      [nextNote, nextFlags, setId],
      { tables: ['sets'] },
    );
    return;
  }

  // Pro: additive PATCH /sets/:id (drift-guarded server-side).
  await apiUpdateSetNoteFlags(setId, patch);
}
