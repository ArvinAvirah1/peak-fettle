/**
 * bodyweightDaily — DAILY weight check-in log (founder 2026-08-04).
 *
 * The weekly `bodyweight` table (data/bodyweight.ts) remains the single source
 * of truth for everything downstream — the tier ladder, the on-device
 * percentile model (strengthModelV3), the trends chart, the measurements
 * reference row. This module does NOT replace it; it FEEDS it.
 *
 *   user types a daily weight
 *      → bodyweight_daily row (upsert on `day`)
 *      → recomputeWeekMedian(week)
 *      → once the ISO week has >= DERIVED_MIN_SAMPLES readings, the MEDIAN of
 *        those readings is written into that week's `bodyweight` row with
 *        source='derived'.
 *
 * Founder precedence rule: derived beats typed. Below the threshold the weekly
 * row is left alone, so a manually typed median stays put and the rankings
 * prompt card keeps offering manual entry. At or above it, real readings win —
 * a remembered estimate is never more accurate than three measurements.
 *
 * Storage follows the v18 exact-entry convention (CLAUDE.md §2): weight_kg is
 * the CANONICAL computational value, weight_centi + weight_unit are the exact
 * typed entry used for display/edit. Conversion happens ONLY via
 * constants/units.ts — never inline here.
 *
 * Local-first for ALL tiers: this is on-device SQLite only, no REST call on any
 * path. Included in the TICKET-094 backup registry.
 */

import { localDb, genId } from '../db/localDb';
import { isoWeekKey, toDateKey } from '../utils/dateHelpers';
import { displayToCenti, displayToKg, centiToKg, UnitSystem } from '../constants/units';

export interface DailyWeightEntry {
  id: string;
  day: string; // local calendar day, YYYY-MM-DD
  week_key: string; // ISO week, e.g. "2026-W32"
  weight_kg: number; // canonical kilograms
  weight_centi: number | null; // typed value × 100 in weight_unit
  weight_unit: string | null; // 'kg' | 'lbs'
  source: string | null; // 'manual' | 'healthkit'
  logged_at: string; // ISO datetime
}

export type DailyWeightSource = 'manual' | 'healthkit';

/**
 * How many daily readings an ISO week needs before its median is computed and
 * takes over from a hand-typed weekly median. Founder rule, 2026-08-04:
 * "at least 3 readings in the last week".
 */
export const DERIVED_MIN_SAMPLES = 3;

/** Tables touched by a daily write — both, because a write can cascade into
 *  the weekly median. Passed to localDb.execute so watchers of EITHER table
 *  re-read (the rankings tier gate watches `bodyweight`, the home/health cards
 *  watch `bodyweight_daily`). */
const DAILY_WRITE_TABLES = ['bodyweight_daily', 'bodyweight'];

// ---------------------------------------------------------------------------
// Median
// ---------------------------------------------------------------------------

/**
 * Median of a numeric list. Even counts average the two middle values, which is
 * the standard definition and matters here: a 4-reading week of 80/81/82/85
 * should report 81.5, not an arbitrary side.
 *
 * Returns null for an empty list rather than NaN so callers can branch cleanly.
 */
export function median(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  // Indexed reads are widened to `| undefined` under noUncheckedIndexedAccess;
  // both indices are provably in range here, so narrow explicitly rather than
  // asserting.
  const hi = clean[mid];
  if (hi === undefined) return null;
  if (clean.length % 2 === 1) return hi;
  const lo = clean[mid - 1];
  return lo === undefined ? hi : (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Log (or overwrite) a day's weight from a TYPED display value.
 *
 * @param displayValue the number the user typed, in `unit`
 * @param unit         the unit they typed it in ('kg' | 'lbs')
 * @param when         the day it belongs to (defaults to today, local time)
 * @param source       'manual' (typed) or 'healthkit' (accepted from a prefill)
 *
 * Stores all three weight columns per CLAUDE.md §2, then recomputes the week's
 * median. Silently no-ops on a non-positive value so a stray parse can't write
 * a zero-weight row.
 */
export async function logDailyWeight(
  displayValue: number,
  unit: UnitSystem,
  when: Date = new Date(),
  source: DailyWeightSource = 'manual',
): Promise<void> {
  if (!(displayValue > 0)) return;
  const day = toDateKey(when);
  const week = isoWeekKey(when);
  const centi = displayToCenti(displayValue);
  const kg = displayToKg(displayValue, unit);

  await localDb.execute(
    `INSERT INTO bodyweight_daily
       (id, day, week_key, weight_kg, weight_centi, weight_unit, source, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET
       week_key     = excluded.week_key,
       weight_kg    = excluded.weight_kg,
       weight_centi = excluded.weight_centi,
       weight_unit  = excluded.weight_unit,
       source       = excluded.source,
       logged_at    = excluded.logged_at`,
    [genId(), day, week, kg, centi, unit, source, when.toISOString()],
    { tables: DAILY_WRITE_TABLES },
  );

  await recomputeWeekMedian(week);
}

/** Remove a day's reading (and re-derive that week's median without it). */
export async function deleteDailyWeight(day: string): Promise<void> {
  const row = await localDb.getFirst<{ week_key: string }>(
    `SELECT week_key FROM bodyweight_daily WHERE day = ? LIMIT 1`,
    [day],
  );
  if (!row) return;
  await localDb.execute(`DELETE FROM bodyweight_daily WHERE day = ?`, [day], {
    tables: DAILY_WRITE_TABLES,
  });
  await recomputeWeekMedian(row.week_key);
}

/**
 * Recompute one ISO week's median from its daily readings and, if the week has
 * enough of them, write it into the canonical weekly `bodyweight` table.
 *
 * Below DERIVED_MIN_SAMPLES this deliberately does NOTHING — it must not clear
 * or overwrite a median the user typed by hand on the rankings card, which is
 * the only value available early in a week.
 *
 * Returns the derived median in kg, or null when the week is still short.
 */
export async function recomputeWeekMedian(weekKey: string): Promise<number | null> {
  const rows = await localDb.getAll<{ weight_kg: number; weight_centi: number | null; weight_unit: string | null }>(
    `SELECT weight_kg, weight_centi, weight_unit FROM bodyweight_daily WHERE week_key = ?`,
    [weekKey],
  );
  if (rows.length < DERIVED_MIN_SAMPLES) return null;

  // Prefer the exact typed entry where present (a lbs user's 186.7 converts
  // once, here, rather than round-tripping through a stored float), falling
  // back to the canonical kg column.
  const kgs = rows.map((r) =>
    r.weight_centi != null && (r.weight_unit === 'kg' || r.weight_unit === 'lbs')
      ? centiToKg(r.weight_centi, r.weight_unit)
      : r.weight_kg,
  );
  const med = median(kgs);
  if (med == null || !(med > 0)) return null;

  await localDb.execute(
    `INSERT INTO bodyweight (id, week_key, weight_kg, logged_at, source, sample_count)
     VALUES (?, ?, ?, ?, 'derived', ?)
     ON CONFLICT(week_key) DO UPDATE SET
       weight_kg    = excluded.weight_kg,
       logged_at    = excluded.logged_at,
       source       = 'derived',
       sample_count = excluded.sample_count`,
    [genId(), weekKey, med, new Date().toISOString(), rows.length],
    { tables: ['bodyweight'] },
  );
  return med;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Today's reading, or null if the user hasn't weighed in yet today. */
export async function getDailyWeightForDay(
  when: Date = new Date(),
): Promise<DailyWeightEntry | null> {
  return localDb.getFirst<DailyWeightEntry>(
    `SELECT id, day, week_key, weight_kg, weight_centi, weight_unit, source, logged_at
       FROM bodyweight_daily WHERE day = ? LIMIT 1`,
    [toDateKey(when)],
  );
}

/** All readings for one ISO week, oldest day first. */
export async function getWeekDailyWeights(weekKey: string): Promise<DailyWeightEntry[]> {
  return localDb.getAll<DailyWeightEntry>(
    `SELECT id, day, week_key, weight_kg, weight_centi, weight_unit, source, logged_at
       FROM bodyweight_daily WHERE week_key = ? ORDER BY day ASC`,
    [weekKey],
  );
}

/**
 * Daily history, oldest first (for the health-tab sparkline).
 * Ordered by `day` — not logged_at — so back-dated or re-edited entries don't
 * make the time axis non-monotonic (same reasoning as getBodyweightHistory).
 */
export async function getDailyWeightHistory(limit = 90): Promise<DailyWeightEntry[]> {
  const rows = await localDb.getAll<DailyWeightEntry>(
    `SELECT id, day, week_key, weight_kg, weight_centi, weight_unit, source, logged_at
       FROM bodyweight_daily ORDER BY day DESC LIMIT ?`,
    [limit],
  );
  return rows.reverse();
}

/** The most recent reading of any day (drives the "last logged" hint). */
export async function getLatestDailyWeight(): Promise<DailyWeightEntry | null> {
  return localDb.getFirst<DailyWeightEntry>(
    `SELECT id, day, week_key, weight_kg, weight_centi, weight_unit, source, logged_at
       FROM bodyweight_daily ORDER BY day DESC LIMIT 1`,
  );
}

/** How many days of the CURRENT ISO week have a reading (0–7). */
export async function countCurrentWeekReadings(now: Date = new Date()): Promise<number> {
  const row = await localDb.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM bodyweight_daily WHERE week_key = ?`,
    [isoWeekKey(now)],
  );
  return row?.n ?? 0;
}

/**
 * Is the current ISO week's median derivable from daily readings?
 * This is the switch that flips the rankings card from a manual input to a
 * read-only "derived from N readings" state.
 */
export async function hasDerivableWeek(now: Date = new Date()): Promise<boolean> {
  return (await countCurrentWeekReadings(now)) >= DERIVED_MIN_SAMPLES;
}
