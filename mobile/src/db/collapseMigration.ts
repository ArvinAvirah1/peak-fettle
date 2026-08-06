/**
 * collapseMigration — merge variant exercises into base + qualifier (v22).
 * =============================================================================
 * Turns `Close-Grip Lat Pulldown` into `Lat Pulldown` + `{grip_width: close}`,
 * for all 60 reviewed collapses (docs/archive/qualifiers/collapse-report.md).
 *
 * THE DESIGN THAT MAKES THIS RUNNABLE AT ALL
 * ------------------------------------------
 * The obvious approach — rewrite `sets.exercise_id` from the variant's UUID to
 * the base's — cannot work on this app. Exercise ids are assigned by the SERVER,
 * and a free device never holds the library: `exercise_names` caches an id only
 * for exercises the user has actually touched. So for most devices there is
 * simply no id on hand for the base.
 *
 * So we map by NAME, and NEVER invent an id. Two cases:
 *
 *   A. BOTH ids cached (the user has logged the variant AND the base):
 *      move the variant's sets onto the base id. Both are real server UUIDs, so
 *      the rows stay FK-valid and Pro sync cannot wedge.
 *
 *   B. ONLY the variant is cached (the user never logged the base):
 *      do NOT move anything. Rename the cache entry so that id now displays as
 *      the base name. The set keeps its own valid UUID; only local display
 *      changes.
 *
 * Because no id is ever fabricated, the FK-violation path that would have jammed
 * the outbox retry queue is structurally impossible — that blocker is not
 * mitigated here, it is designed out.
 *
 * PR COLLISIONS
 * -------------
 * `exercise_prs` is keyed (user_id, exercise_id, rep_count), so merging Chin-Up
 * into Pull-Up collides on every shared rep count — a PK conflict that would
 * abort the whole transaction. We MAX-merge instead: the heavier row wins, the
 * lighter is deleted, then the survivor is re-pointed. A PR is never silently
 * downgraded.
 *
 * IDEMPOTENT. Every step is a no-op once applied (the variant name no longer
 * resolves), so a crash mid-migration is safe to re-run.
 * =============================================================================
 */

import { COLLAPSE_ENTRIES, type CollapseEntry } from '../constants/collapseMap';
import type { MigrationJsDb } from './localSchema';
import { canonicalQualifierKey, parseQualifiers, serializeQualifiers } from '../lib/qualifierKey';
import { defaultsForExercise } from '../constants/exerciseQualifierMap';

/** Same normalization the qualifier map uses, so lookups agree. */
function norm(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[_\-–—]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ');
}

export interface CollapseStats {
  moved: number;      // case A — sets re-pointed onto an existing base id
  renamed: number;    // case B — cache entry renamed, sets untouched
  setsTagged: number; // sets that gained reconstructing qualifiers
  prsMerged: number;
  skipped: number;    // variant never used on this device
}

/**
 * Apply the reviewed collapse plan to local SQLite.
 *
 * Runs inside the v22 transaction. Any throw rolls the whole thing back and
 * leaves `user_version` at 21.
 */
export async function runCollapse(db: MigrationJsDb): Promise<CollapseStats> {
  const stats: CollapseStats = { moved: 0, renamed: 0, setsTagged: 0, prsMerged: 0, skipped: 0 };

  // id -> name for everything this device knows about.
  const cached = await db.getAll<{ exercise_id: string; name: string }>(
    `SELECT exercise_id, name FROM exercise_names`,
  );
  const idsByName = new Map<string, string[]>();
  for (const row of cached) {
    const k = norm(row.name);
    if (!k) continue;
    if (!idsByName.has(k)) idsByName.set(k, []);
    idsByName.get(k)!.push(row.exercise_id);
  }

  for (const entry of COLLAPSE_ENTRIES) {
    const variantIds = idsByName.get(norm(entry.from)) ?? [];
    if (variantIds.length === 0) {
      stats.skipped++; // this device never used the variant — nothing to do
      continue;
    }
    const baseIds = idsByName.get(norm(entry.to)) ?? [];
    const baseId: string | null = baseIds.length > 0 ? baseIds[0] ?? null : null;

    for (const variantId of variantIds) {
      if (baseId && variantId === baseId) continue;
      await applyOne(db, entry, variantId, baseId, stats);
    }

    // Later entries must see the effect of this one (e.g. two variants merging
    // into a base the device had not previously cached).
    if (!baseId && variantIds.length > 0) {
      idsByName.set(norm(entry.to), [variantIds[0]!]);
    }
  }

  return stats;
}

async function applyOne(
  db: MigrationJsDb,
  entry: CollapseEntry,
  variantId: string,
  baseId: string | null,
  stats: CollapseStats,
): Promise<void> {
  const targetId = baseId ?? variantId;

  // 1. Stamp the reconstructing qualifiers onto the variant's sets, preserving
  //    anything already recorded (a v21 set may carry real user choices, which
  //    must win — the collapse describes the exercise, not the user's session).
  if (Object.keys(entry.q).length > 0) {
    const rows = await db.getAll<{ id: string; qualifiers_json: string | null }>(
      `SELECT id, qualifiers_json FROM sets WHERE exercise_id = ?`,
      [variantId],
    );
    const defaults = defaultsForExercise(entry.to);
    for (const row of rows) {
      const existing = parseQualifiers(row.qualifiers_json);
      const merged = { ...entry.q, ...existing }; // existing (user) wins
      const json = serializeQualifiers(merged);
      const key = canonicalQualifierKey(merged, defaults);
      await db.execute(
        `UPDATE sets SET qualifiers_json = ?, qualifier_key = ? WHERE id = ?`,
        [json, key, row.id],
        { tables: ['sets'] },
      );
      stats.setsTagged++;
    }
  }

  if (baseId) {
    // ── CASE A: both ids known — merge the variant into the base ────────────
    await mergePrs(db, variantId, baseId, stats);

    // Single-row-per-exercise tables: the base's row wins; drop the variant's
    // rather than colliding on its primary key.
    for (const t of ['exercise_goals', 'exercise_prefs']) {
      await db.execute(
        `DELETE FROM ${t} WHERE exercise_id = ?
           AND EXISTS (SELECT 1 FROM ${t} b WHERE b.exercise_id = ?)`,
        [variantId, baseId],
        { tables: [t] },
      );
      await db.execute(`UPDATE ${t} SET exercise_id = ? WHERE exercise_id = ?`, [baseId, variantId], { tables: [t] });
    }

    // Substitute chains reference exercises on both sides.
    await db.execute(
      `UPDATE exercise_substitutes SET source_exercise_id = ? WHERE source_exercise_id = ?`,
      [baseId, variantId], { tables: ['exercise_substitutes'] },
    );
    await db.execute(
      `UPDATE exercise_substitutes SET sub_exercise_id = ? WHERE sub_exercise_id = ?`,
      [baseId, variantId], { tables: ['exercise_substitutes'] },
    );

    await db.execute(`UPDATE sets SET exercise_id = ? WHERE exercise_id = ?`, [baseId, variantId], { tables: ['sets'] });
    await db.execute(`DELETE FROM exercise_names WHERE exercise_id = ?`, [variantId], { tables: ['exercise_names'] });
    stats.moved++;
  } else {
    // ── CASE B: only the variant is known — rename it in place ──────────────
    // The set keeps its own real UUID, so nothing can break on sync; the device
    // simply now calls that id by the base's name.
    await db.execute(
      `UPDATE exercise_names SET name = ?, updated_at = ? WHERE exercise_id = ?`,
      [entry.to, new Date().toISOString(), variantId],
      { tables: ['exercise_names'] },
    );
    stats.renamed++;
  }

  void targetId;
}

/**
 * MAX-merge exercise_prs across the (user_id, exercise_id, rep_count) PK.
 *
 * Order matters: drop the losing rows on BOTH sides first, so the final UPDATE
 * can never hit a surviving duplicate.
 */
async function mergePrs(
  db: MigrationJsDb,
  variantId: string,
  baseId: string,
  stats: CollapseStats,
): Promise<void> {
  const before = await db.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM exercise_prs WHERE exercise_id IN (?, ?)`,
    [variantId, baseId],
  );

  // The base already holds an equal-or-better lift at this rep count.
  await db.execute(
    `DELETE FROM exercise_prs
      WHERE exercise_id = ?
        AND EXISTS (
          SELECT 1 FROM exercise_prs b
           WHERE b.user_id = exercise_prs.user_id
             AND b.exercise_id = ?
             AND b.rep_count = exercise_prs.rep_count
             AND b.weight_kg >= exercise_prs.weight_kg)`,
    [variantId, baseId], { tables: ['exercise_prs'] },
  );
  // The variant's lift is strictly better — the base's row loses.
  await db.execute(
    `DELETE FROM exercise_prs
      WHERE exercise_id = ?
        AND EXISTS (
          SELECT 1 FROM exercise_prs v
           WHERE v.user_id = exercise_prs.user_id
             AND v.exercise_id = ?
             AND v.rep_count = exercise_prs.rep_count
             AND v.weight_kg > exercise_prs.weight_kg)`,
    [baseId, variantId], { tables: ['exercise_prs'] },
  );
  await db.execute(
    `UPDATE exercise_prs SET exercise_id = ? WHERE exercise_id = ?`,
    [baseId, variantId], { tables: ['exercise_prs'] },
  );

  const after = await db.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM exercise_prs WHERE exercise_id = ?`,
    [baseId],
  );
  stats.prsMerged += Math.max(0, (before?.n ?? 0) - (after?.n ?? 0));
}
