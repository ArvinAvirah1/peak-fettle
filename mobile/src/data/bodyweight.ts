/**
 * bodyweight — weekly-median bodyweight log (founder spec 2026-06-10).
 *
 * Users are prompted weekly for their MEDIAN weight for the week (one row per
 * ISO week, upserted). Bodyweight guides the strength calculations, so the
 * tier ladder is GATED on freshness: with no entry within TIER_FRESHNESS_DAYS
 * the tier is hidden — a big bulk/cut between weigh-ins would make it wrong.
 *
 * Storage: on-device `bodyweight` table (localSchema.ts), included in the
 * TICKET-094 backup registry. Reactive via localDb.watch on 'bodyweight'.
 */

import { localDb, genId } from '../db/localDb';
import { isoWeekKey } from '../utils/dateHelpers';

export interface BodyweightEntry {
  id: string;
  week_key: string; // ISO week, e.g. "2026-W24"
  weight_kg: number;
  logged_at: string; // ISO datetime
}

/** Tier gate freshness window: latest weekly median must be ≤ 14 days old
 *  (current or previous ISO week). Founder rule, 2026-06-10. */
export const TIER_FRESHNESS_DAYS = 14;

/** Upsert this week's median weight (kg). */
export async function logWeeklyBodyweight(weightKg: number, now: Date = new Date()): Promise<void> {
  if (!(weightKg > 0)) return;
  const week = isoWeekKey(now);
  await localDb.execute(
    `INSERT INTO bodyweight (id, week_key, weight_kg, logged_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(week_key) DO UPDATE SET weight_kg = excluded.weight_kg, logged_at = excluded.logged_at`,
    [genId(), week, weightKg, now.toISOString()],
    { tables: ['bodyweight'] },
  );
}

export async function getLatestBodyweight(): Promise<BodyweightEntry | null> {
  return localDb.getFirst<BodyweightEntry>(
    `SELECT id, week_key, weight_kg, logged_at FROM bodyweight ORDER BY logged_at DESC LIMIT 1`,
  );
}

/** All entries, oldest first (for the Trends chart). */
export async function getBodyweightHistory(limit = 104): Promise<BodyweightEntry[]> {
  const rows = await localDb.getAll<BodyweightEntry>(
    `SELECT id, week_key, weight_kg, logged_at FROM bodyweight ORDER BY logged_at DESC LIMIT ?`,
    [limit],
  );
  return rows.reverse();
}

/** Has the user logged a median for the CURRENT ISO week? Drives the prompt. */
export async function hasCurrentWeekEntry(now: Date = new Date()): Promise<boolean> {
  const row = await localDb.getFirst<{ id: string }>(
    `SELECT id FROM bodyweight WHERE week_key = ? LIMIT 1`,
    [isoWeekKey(now)],
  );
  return row != null;
}

/** Fresh enough for the tier ladder? (entry within TIER_FRESHNESS_DAYS) */
export function isFreshForTier(entry: BodyweightEntry | null, now: Date = new Date()): boolean {
  if (!entry) return false;
  const t = Date.parse(entry.logged_at);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= TIER_FRESHNESS_DAYS * 86_400_000;
}
