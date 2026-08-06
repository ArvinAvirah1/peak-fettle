/**
 * customQualifiers — the user's own qualifier options.
 * =============================================================================
 * Founder requirement: "add the ability to add your own options to exercises in
 * case nuances arent present as desired for the user, things like attachment
 * types for tricep pushdowns can only be so specific... the options continue and
 * cant all be enumerated although the main ones should be present as options."
 *
 * That is exactly right, and it is why the shipped vocabulary is CLOSED while
 * this table is open. The closed list keeps the strength math, the settings gate
 * and the picker UI bounded; this is the escape hatch for the long tail. Adding
 * a new AXIS is a code change; adding a new VALUE on an axis that allows it is
 * something the user does in two taps.
 *
 * Scope (founder decision D5): device-local per user, riding the existing backup
 * registry (exportEngine BACKUP_TABLES) so options survive a restore. Two users
 * who both type "angled bar" get two independent rows — there is no shared
 * catalog, no moderation surface, and no network call on the free path.
 *
 * PERCENTILE: a custom value is ALWAYS excluded from the strength model. There
 * is by definition no coefficient for something only one user has defined, and
 * SPEC §3 rule 2 makes that explicit rather than leaving it to an accident of
 * lookup returning undefined. Custom values are tracked for the user's own PRs.
 *
 * Values are referenced from `sets.qualifiers_json` as `custom:<id>` (see
 * CUSTOM_VALUE_PREFIX in lib/qualifierKey.ts), which is why ids must be stable
 * and rows must never be hard-deleted while sets still point at them — see
 * deleteCustomValue.
 *
 * Local-first by construction: on-device SQLite only, no REST, safe on mount.
 * =============================================================================
 */

import { localDb, genId } from '../db/localDb';
import { isKnownAxis } from '../constants/qualifiers';
import { CUSTOM_VALUE_PREFIX } from '../lib/qualifierKey';

export interface CustomQualifierValue {
  id: string;
  axis_id: string;
  /** NULL = offered on every exercise that uses this axis. */
  exercise_id: string | null;
  label: string;
  created_at: string;
  updated_at: string;
}

interface Row {
  id: string;
  axis_id: string;
  exercise_id: string | null;
  label: string;
  created_at: string;
  updated_at: string;
}

/** Max length for a user-typed option. Long enough for "revolving angled bar". */
export const MAX_LABEL_LEN = 60;

/** The stored qualifier value for a custom row: `custom:<id>`. */
export function customValueToken(id: string): string {
  return `${CUSTOM_VALUE_PREFIX}${id}`;
}

function normalizeLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL_LEN);
}

/**
 * Options the user has defined for an axis.
 *
 * Includes both exercise-specific rows and the global ones (exercise_id IS
 * NULL), because an attachment someone added on one pushdown variant is almost
 * always wanted on the others too.
 */
export async function listCustomValues(
  axisId: string,
  exerciseId?: string | null,
): Promise<CustomQualifierValue[]> {
  if (!isKnownAxis(axisId)) return [];
  try {
    await localDb.init();
    const rows = await localDb.getAll<Row>(
      `SELECT id, axis_id, exercise_id, label, created_at, updated_at
         FROM custom_qualifier_values
        WHERE axis_id = ? AND (exercise_id IS NULL OR exercise_id = ?)
        ORDER BY label COLLATE NOCASE ASC`,
      [axisId, exerciseId ?? null],
    );
    return rows ?? [];
  } catch {
    // A settings/catalog read must never break the logger.
    return [];
  }
}

/** Every custom option, for the settings/management surfaces and the backup registry. */
export async function listAllCustomValues(): Promise<CustomQualifierValue[]> {
  try {
    await localDb.init();
    const rows = await localDb.getAll<Row>(
      `SELECT id, axis_id, exercise_id, label, created_at, updated_at
         FROM custom_qualifier_values
        ORDER BY axis_id ASC, label COLLATE NOCASE ASC`,
    );
    return rows ?? [];
  } catch {
    return [];
  }
}

/**
 * Add an option, or return the existing one when the label already exists on
 * that axis+scope.
 *
 * De-duplicating on a case-insensitive label is deliberate: someone typing
 * "Angled Bar" today and "angled bar" next month means the same thing, and two
 * rows would split their own PR history for no reason.
 *
 * Returns null when the input is unusable (unknown axis, empty label) rather
 * than throwing — the caller is a text field, not a program.
 */
export async function addCustomValue(
  axisId: string,
  label: string,
  exerciseId?: string | null,
): Promise<CustomQualifierValue | null> {
  if (!isKnownAxis(axisId)) return null;
  const clean = normalizeLabel(label ?? '');
  if (clean.length === 0) return null;

  try {
    await localDb.init();
    const scope = exerciseId ?? null;

    const existing = await localDb.getFirst<Row>(
      `SELECT id, axis_id, exercise_id, label, created_at, updated_at
         FROM custom_qualifier_values
        WHERE axis_id = ?
          AND (exercise_id IS ? OR exercise_id IS NULL)
          AND label = ? COLLATE NOCASE
        LIMIT 1`,
      [axisId, scope, clean],
    );
    if (existing) return existing;

    const now = new Date().toISOString();
    const row: CustomQualifierValue = {
      id: genId(),
      axis_id: axisId,
      exercise_id: scope,
      label: clean,
      created_at: now,
      updated_at: now,
    };
    await localDb.execute(
      `INSERT INTO custom_qualifier_values (id, axis_id, exercise_id, label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.id, row.axis_id, row.exercise_id, row.label, row.created_at, row.updated_at],
    );
    return row;
  } catch {
    return null;
  }
}

/** Rename an option in place. The id is stable, so historical sets keep resolving. */
export async function renameCustomValue(id: string, label: string): Promise<boolean> {
  const clean = normalizeLabel(label ?? '');
  if (!id || clean.length === 0) return false;
  try {
    await localDb.init();
    await localDb.execute(
      `UPDATE custom_qualifier_values SET label = ?, updated_at = ? WHERE id = ?`,
      [clean, new Date().toISOString(), id],
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete an option the user no longer wants offered.
 *
 * REFUSES when any set still references it. Deleting the row would leave those
 * sets pointing at `custom:<id>` with nothing to resolve — history would render
 * a dangling token, and the user would have silently lost the record of what
 * they actually used. Hiding an option from the picker is a UI concern; the row
 * itself is history. Returns false (with no change) when references exist.
 */
export async function deleteCustomValue(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    await localDb.init();
    const token = customValueToken(id);
    const inUse = await localDb.getFirst<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sets WHERE qualifiers_json LIKE ?`,
      [`%${token}%`],
    );
    if ((inUse?.n ?? 0) > 0) return false;
    await localDb.execute(`DELETE FROM custom_qualifier_values WHERE id = ?`, [id]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve `custom:<id>` tokens to labels, for rendering a set's qualifiers.
 *
 * Returns a map of token -> label. A token with no row (deleted out from under
 * a set, or restored from another device) is simply absent, and callers render
 * it inertly rather than crashing — the same posture as an unknown axis id.
 */
export async function resolveCustomLabels(tokens: readonly string[]): Promise<Record<string, string>> {
  const ids = tokens
    .filter((t) => typeof t === 'string' && t.startsWith(CUSTOM_VALUE_PREFIX))
    .map((t) => t.slice(CUSTOM_VALUE_PREFIX.length))
    .filter((id) => id.length > 0);
  if (ids.length === 0) return {};
  try {
    await localDb.init();
    const placeholders = ids.map(() => '?').join(',');
    const rows = await localDb.getAll<{ id: string; label: string }>(
      `SELECT id, label FROM custom_qualifier_values WHERE id IN (${placeholders})`,
      ids,
    );
    const out: Record<string, string> = {};
    for (const r of rows ?? []) out[customValueToken(r.id)] = r.label;
    return out;
  } catch {
    return {};
  }
}
