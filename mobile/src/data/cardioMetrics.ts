/**
 * cardioMetrics — rich cardio/sport metrics for a logged set.
 *
 * A thin typed layer over the `sets.metrics_json` column (schema v6,
 * mobile/src/db/localSchema.ts). The fixed `sets` columns only cover
 * duration / distance / avg-pace; this stores the rest of a cardio or sport
 * effort (avg & max HR, calories, cadence, elevation gain, RPE, per-unit
 * splits, plus an open `extras` bag) as a single JSON blob keyed off the set id.
 *
 * STORAGE TIER: this is ON-DEVICE storage for ALL tiers in this wave (both free
 * and Pro write metrics_json to the local SQLite `sets` row — there is no tier
 * branch and NO REST call here, so it is local-first by construction and safe to
 * call on mount). Server sync of metrics_json is a later Phase-6 SERVER task;
 * there is intentionally no server `sets.metrics_json` column yet.
 *
 * Both reads and writes are best-effort: any SQLite/JSON failure resolves to
 * null (read) or silently no-ops (write) rather than throwing, so a metrics
 * read/write can never block or crash a logging screen.
 */

import { localDb } from '../db/localDb';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Rich cardio/sport metrics for a single logged set. Every field is optional —
 * a row may carry any subset. `splits` are seconds-per-unit (e.g. per km / per
 * mile / per lap, matching the activity's distance unit). `extras` is an open
 * numeric bag for activity-specific metrics not yet promoted to a named field.
 */
export interface CardioMetrics {
  hrAvgBpm?: number;
  hrMaxBpm?: number;
  calories?: number;
  cadenceSpm?: number;
  elevationGainM?: number;
  rpe?: number;
  /** Seconds per unit (km/mile/lap), one entry per split, in order. */
  splits?: number[];
  /** Open numeric bag for activity-specific metrics not yet named above. */
  extras?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

/**
 * Read the rich metrics for a set. Returns null when the set has no
 * metrics_json, the column/table is absent, or the stored JSON fails to parse.
 * Never throws.
 */
export async function getSetMetrics(setId: string): Promise<CardioMetrics | null> {
  if (!setId) return null;
  try {
    await localDb.init();
    const row = await localDb.getFirst<{ metrics_json: string | null }>(
      'SELECT metrics_json FROM sets WHERE id = ?',
      [setId],
    );
    const raw = row?.metrics_json;
    if (raw == null || raw === '') return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object') return null;
    return parsed as CardioMetrics;
  } catch {
    // best-effort: a missing column/table or malformed JSON never surfaces.
    return null;
  }
}

/**
 * Persist the rich metrics for a set (overwrites any existing blob on that row).
 * Best-effort: a failed serialize or write silently no-ops rather than throwing.
 * Note this UPDATEs an existing `sets` row — it does not create one.
 */
export async function setSetMetrics(setId: string, metrics: CardioMetrics): Promise<void> {
  if (!setId) return;
  try {
    const json = JSON.stringify(metrics ?? {});
    await localDb.init();
    await localDb.execute(
      'UPDATE sets SET metrics_json = ? WHERE id = ?',
      [json, setId],
      { tables: ['sets'] },
    );
  } catch {
    // best-effort write — never block the logging flow on a metrics failure.
  }
}
