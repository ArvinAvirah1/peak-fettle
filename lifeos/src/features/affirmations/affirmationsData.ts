/**
 * affirmationsData — data module for lo_affirmations (TICKET-123).
 *
 * Public API:
 *   seedAffirmationsIfEmpty()  — idempotent: seeds SEED_AFFIRMATIONS only if
 *                                 lo_affirmations is empty. Call on app launch
 *                                 (or on first feature-flag enable).
 *   listAffirmations()         — all rows, enabled first then source='seed'.
 *   addUserLine(text)          — insert a source='user' row with no identity_tag.
 *   toggleAffirmation(id, on)  — flip enabled flag.
 *   pickTodayLine(dateKey, topValues) — deterministic daily selection
 *                                 (no Math.random / Date.now in pure logic).
 *
 * Uses localDb.getFirst / getAll / execute per CLAUDE.md API contract.
 * NO server calls — local-first, free-user-safe (CLAUDE.md #1).
 */

import { genId, localDb } from '../../db/localDb';
import { SEED_AFFIRMATIONS, GENERAL_AFFIRMATION_IDS } from './seedLibrary';

// ---------------------------------------------------------------------------
// Row type (mirrors lo_affirmations schema)
// ---------------------------------------------------------------------------

export interface AffirmationRow {
  id: string;
  text: string;
  identity_tag: string | null;
  enabled: number; // 1 | 0
  source: string;  // 'seed' | 'user'
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/**
 * Idempotent: only writes rows if the table is currently empty.
 * Safe to call every app start — costs one COUNT(*) query on subsequent runs.
 */
export async function seedAffirmationsIfEmpty(): Promise<void> {
  const row = await localDb.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM lo_affirmations`
  );
  if (row && row.n > 0) return;

  for (const a of SEED_AFFIRMATIONS) {
    await localDb.execute(
      `INSERT OR IGNORE INTO lo_affirmations (id, text, identity_tag, enabled, source)
       VALUES (?, ?, ?, ?, ?)`,
      [a.id, a.text, a.identity_tag, a.enabled, a.source],
      { tables: ['lo_affirmations'] }
    );
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/** All rows: enabled=1 first, then seed before user, alpha within each group. */
export async function listAffirmations(): Promise<AffirmationRow[]> {
  return localDb.getAll<AffirmationRow>(
    `SELECT id, text, identity_tag, enabled, source
     FROM lo_affirmations
     ORDER BY enabled DESC, source ASC, text ASC`
  );
}

// ---------------------------------------------------------------------------
// Add user line
// ---------------------------------------------------------------------------

/** Add a custom user-authored affirmation. text is trimmed and length-guarded. */
export async function addUserLine(text: string): Promise<void> {
  const trimmed = text.trim().slice(0, 200);
  if (!trimmed) return;
  const id = genId();
  await localDb.execute(
    `INSERT INTO lo_affirmations (id, text, identity_tag, enabled, source)
     VALUES (?, ?, NULL, 1, 'user')`,
    [id, trimmed],
    { tables: ['lo_affirmations'] }
  );
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

export async function toggleAffirmation(id: string, on: boolean): Promise<void> {
  await localDb.execute(
    `UPDATE lo_affirmations SET enabled = ? WHERE id = ?`,
    [on ? 1 : 0, id],
    { tables: ['lo_affirmations'] }
  );
}

// ---------------------------------------------------------------------------
// Daily selection (pure, deterministic given date + values list)
// ---------------------------------------------------------------------------

/**
 * Deterministic daily pick — no Math.random / Date.now.
 *
 * Algorithm:
 *   1. Filter enabled rows whose identity_tag is in topValues (ordered best-first).
 *   2. If none, fall back to enabled general lines (GENERAL_AFFIRMATION_IDS).
 *   3. If still none, fall back to any enabled row.
 *   4. If still none (feature just enabled, table empty), return null.
 *   5. Pick by (dateKey hash mod pool.length) — same result for the same date.
 *
 * @param dateKey  'YYYY-MM-DD' local date string (passed in, not read from system clock).
 * @param topValues Value keys from the latest survey, best-first (e.g. ['mastery','health']).
 * @param rows     All affirmation rows (caller passes result of listAffirmations()).
 */
export function pickTodayLine(
  dateKey: string,
  topValues: string[],
  rows: AffirmationRow[]
): AffirmationRow | null {
  const enabled = rows.filter((r) => r.enabled === 1);
  if (enabled.length === 0) return null;

  // Build a tag set that includes both the value keys and the
  // domain-adjacent identity tags that map onto those values.
  const VALUE_TO_TAGS: Record<string, string[]> = {
    mastery: ['mastery', 'focused', 'disciplined'],
    connection: ['connection', 'present'],
    health: ['health'],
    autonomy: ['autonomy', 'disciplined'],
    contribution: ['contribution'],
    stability: ['stability', 'calm'],
    adventure: ['adventure'],
  };

  const relevantTags = new Set<string>();
  for (const v of topValues) {
    const mapped = VALUE_TO_TAGS[v];
    if (mapped) {
      for (const t of mapped) relevantTags.add(t);
    }
  }

  // Priority 1: enabled rows matching a relevant tag
  let pool = enabled.filter((r) => r.identity_tag != null && relevantTags.has(r.identity_tag));

  // Priority 2: general lines
  if (pool.length === 0) {
    pool = enabled.filter((r) => r.id != null && GENERAL_AFFIRMATION_IDS.includes(r.id));
  }

  // Priority 3: any enabled row
  if (pool.length === 0) {
    pool = enabled;
  }

  // Deterministic date-based index (djb2-style hash, no floating point)
  let hash = 5381;
  for (let i = 0; i < dateKey.length; i++) {
    hash = ((hash << 5) + hash + dateKey.charCodeAt(i)) & 0x7fffffff;
  }
  return pool[hash % pool.length] ?? null;
}
