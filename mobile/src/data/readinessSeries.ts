/**
 * readinessSeries — TICKET-142: local readiness-history helper for the
 * fatigue-advice card.
 * =============================================================================
 * fatigue.ts's suggestPlanAdjustment() takes a `ReadinessDay[]` (date + score)
 * covering roughly the last two weeks. We already have a per-day readiness
 * FORMULA (lib/insightsLocal.ts's computeReadiness, TRAINING_ENGINE_SPEC §4) —
 * this module is the ONLY place that turns raw local rows into a per-day
 * SERIES by re-running that formula with a trailing window ending on each of
 * the last N days, entirely from on-device SQLite.
 *
 * TIER POLICY — deliberately NOT tier-branched (no isLocalFirst() check):
 * both free AND Pro write every logged set to the local `sets` table and every
 * health sample to local `daily_health_metrics` (see autoregHistory.ts's file
 * header for the identical reasoning — Pro's PowerSync layer mirrors rows into
 * the same local DB, it does not replace it). Reading local SQLite here is
 * therefore already zero-network on BOTH tiers (TICKET-142 acceptance
 * criterion 5) — there is nothing to branch on.
 *
 * COST / BOOT-PATH SAFETY: this does two bounded SQLite reads (42 days of
 * daily_health_metrics; ~500 most-recent lift sets, same LIMIT localContext.ts
 * already uses) and then computes 14 in-memory calls into computeReadiness —
 * no per-day SQL round trip. It is NEVER called on app boot; the only caller is
 * the insights screen's fatigue-card effect, deferred via InteractionManager
 * (see FatigueAdviceCard.tsx) so it never competes with the boot-critical path
 * or the screen's first paint.
 *
 * The clock is passed in by the caller (screen-level) and never read here.
 */

import { localDb } from '../db/localDb';
import { computeReadiness } from '../lib/insightsLocal';
import type { ReadinessDay } from '../lib/trainingEngine/v2/fatigue';

/** How many trailing days the series covers (fatigue.ts needs ~14d of history). */
export const READINESS_SERIES_DAYS = 14;

/** computeReadiness reweights over a 28-day metrics baseline (TRAINING_ENGINE_SPEC §4). */
const METRICS_BASELINE_DAYS = 28;

/** ACR uses 7d/28d tonnage windows; the series' oldest day needs a full 28d look-back. */
const TONNAGE_BASELINE_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKeyOf(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(date: Date, delta: number): Date {
  return new Date(date.getTime() + delta * DAY_MS);
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Row shapes (subset of columns actually needed here)
// ---------------------------------------------------------------------------

interface MetricRow {
  date: string;
  resting_hr_bpm: number | null;
  hrv_ms: number | null;
  sleep_hours: number | null;
}

interface SetRow {
  weight_kg: number | null;
  reps: number | null;
  logged_at: string | null;
}

/** One logged set reduced to what per-day tonnage needs. */
interface TonnageRow {
  dayKey: string;
  tonnage: number; // weight_kg * reps for this one set
}

// ---------------------------------------------------------------------------
// Local reads (best-effort — any SQLite failure degrades to an empty array so
// a missing table/migration can never crash the insights screen).
// ---------------------------------------------------------------------------

/** All daily_health_metrics rows inside [oldestDayKey, newestDayKey] (inclusive). */
async function loadMetricsWindow(oldestDayKey: string, newestDayKey: string): Promise<MetricRow[]> {
  try {
    await localDb.init();
    const rows = await localDb.getAll<MetricRow>(
      `SELECT date, resting_hr_bpm, hrv_ms, sleep_hours
         FROM daily_health_metrics
        WHERE date >= ? AND date <= ?
        ORDER BY date ASC`,
      [oldestDayKey, newestDayKey],
    );
    return rows ?? [];
  } catch {
    return [];
  }
}

/**
 * Recent lift sets reduced to per-day tonnage (weight_kg * reps), oldest-day
 * bounded by the series' full look-back (14 series days + 28 ACR baseline
 * days). Mirrors localContext.ts's COALESCE(weight_kg, weight_raw/8.0) and
 * LIMIT convention. Cardio-only sets (kind != 'lift') don't carry a
 * meaningful tonnage figure and are excluded, matching computeReadiness's ACR
 * intent (training load from lifting volume).
 */
async function loadTonnageRows(oldestDayKey: string): Promise<TonnageRow[]> {
  try {
    await localDb.init();
    const rows = await localDb.getAll<SetRow>(
      `SELECT COALESCE(weight_kg, weight_raw / 8.0) AS weight_kg, reps, logged_at
         FROM sets
        WHERE kind = 'lift' AND logged_at IS NOT NULL AND logged_at >= ?
        ORDER BY logged_at DESC
        LIMIT 1000`,
      [oldestDayKey],
    );
    const out: TonnageRow[] = [];
    for (const r of rows ?? []) {
      if (!r.logged_at) continue;
      const w = r.weight_kg ?? 0;
      const reps = r.reps ?? 0;
      if (w <= 0 || reps <= 0) continue;
      out.push({ dayKey: dayKeyOf(r.logged_at), tonnage: w * reps });
    }
    return out;
  } catch {
    return [];
  }
}

/** Sum of tonnage rows whose dayKey falls in (endExclusiveDayKey - windowDays, endExclusiveDayKey]. */
function sumTonnageWindow(rows: TonnageRow[], endDayKey: string, windowDays: number): number {
  const endMs = Date.parse(endDayKey + 'T00:00:00.000Z');
  if (Number.isNaN(endMs)) return 0;
  const startMs = endMs - windowDays * DAY_MS;
  let sum = 0;
  for (const r of rows) {
    const ms = Date.parse(r.dayKey + 'T00:00:00.000Z');
    if (Number.isNaN(ms)) continue;
    // window is (startMs, endMs] — "last N days ending on this cutoff day, inclusive".
    if (ms > startMs && ms <= endMs) sum += r.tonnage;
  }
  return sum;
}

/** Metric rows whose date falls in (endExclusiveDayKey - windowDays, endExclusiveDayKey]. */
function metricsWindow(rows: MetricRow[], endDayKey: string, windowDays: number): MetricRow[] {
  const endMs = Date.parse(endDayKey + 'T00:00:00.000Z');
  if (Number.isNaN(endMs)) return [];
  const startMs = endMs - windowDays * DAY_MS;
  return rows
    .filter((r) => {
      const ms = Date.parse(r.date + 'T00:00:00.000Z');
      return !Number.isNaN(ms) && ms > startMs && ms <= endMs;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * buildReadinessSeries — the last `READINESS_SERIES_DAYS` days of readiness
 * scores, computed on-device by re-running computeReadiness with a trailing
 * window ending on each day. `now` is supplied by the caller (screen-level) —
 * this module never reads the clock itself.
 *
 * A day's score is null when computeReadiness can't produce one that day (no
 * health-metric baseline yet, no training load) — fatigue.ts's sanitize()
 * step already ignores null-score days, so passing them straight through here
 * is correct and keeps this module simple.
 */
export async function buildReadinessSeries(now: Date): Promise<ReadinessDay[]> {
  const todayKey = toDateKey(now);
  // Oldest day we need metrics/tonnage for: the series' oldest day, minus each
  // component's own baseline look-back.
  const oldestSeriesDay = addDays(now, -(READINESS_SERIES_DAYS - 1));
  const metricsFloor = toDateKey(addDays(oldestSeriesDay, -METRICS_BASELINE_DAYS));
  const tonnageFloor = toDateKey(addDays(oldestSeriesDay, -TONNAGE_BASELINE_DAYS));

  const [metricRows, tonnageRows] = await Promise.all([
    loadMetricsWindow(metricsFloor, todayKey),
    loadTonnageRows(tonnageFloor),
  ]);

  const days: ReadinessDay[] = [];
  for (let i = READINESS_SERIES_DAYS - 1; i >= 0; i--) {
    const cutoff = addDays(now, -i);
    const cutoffKey = toDateKey(cutoff);

    const metrics28 = metricsWindow(metricRows, cutoffKey, METRICS_BASELINE_DAYS);
    const tonnage7 = sumTonnageWindow(tonnageRows, cutoffKey, 7);
    const tonnage28 = sumTonnageWindow(tonnageRows, cutoffKey, TONNAGE_BASELINE_DAYS);

    const result = computeReadiness(metrics28, tonnage7, tonnage28);
    days.push({ date: cutoffKey, score: result.score });
  }
  return days;
}
