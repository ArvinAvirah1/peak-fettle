/**
 * measurements — TICKET-130: body measurements module.
 *
 * Preset metrics (waist, chest, hips, arms, thighs, calves, neck, body-fat %)
 * plus user-defined custom metrics, each with a full history for a trend
 * chart. Free tier: local-first (on-device `body_measurements`, schema v12).
 * Pro tier: additive, drift-guarded server sync (peak-fettle-agents/server/
 * routes/measurements.js) — this module is the ONLY place a screen should
 * touch measurement data; no raw `api/measurements` import from a screen.
 *
 * Length values are stored CANONICAL CENTIMETRES (mirrors the weight_kg
 * convention) — display<->storage conversion happens ONLY via
 * constants/units.ts (displayToCm / cmToInputValue / parseLengthInput /
 * formatLength). body_fat_pct stores the raw percentage (unit: 'pct', no
 * conversion). The Bodyweight row is NOT stored here — it reads the existing
 * `bodyweight` table directly (getBodyweightHistory) so there is exactly one
 * source of truth for body weight.
 */

import { localDb, genId } from '../db/localDb';
import { isLocalFirst, TierUser } from './backup/tierPolicy';
import {
  getMeasurements as apiGetMeasurements,
  upsertMeasurement as apiUpsertMeasurement,
  deleteMeasurement as apiDeleteMeasurement,
} from '../api/measurements';

export type MeasurementUnit = 'cm' | 'in' | 'pct';

export interface MeasurementEntry {
  id: string;
  metric: string;
  value: number;
  unit: MeasurementUnit;
  logged_at: string;
}

export interface PresetMetricDef {
  key: string;
  label: string;
  /** 'length' metrics store canonical cm; 'percent' metrics store a raw pct. */
  kind: 'length' | 'percent';
}

// Preset metric list (ticket AC2). Order drives the picker UI order.
export const PRESET_METRICS: PresetMetricDef[] = [
  { key: 'waist', label: 'Waist', kind: 'length' },
  { key: 'chest', label: 'Chest', kind: 'length' },
  { key: 'hips', label: 'Hips', kind: 'length' },
  { key: 'arms', label: 'Arms', kind: 'length' },
  { key: 'thighs', label: 'Thighs', kind: 'length' },
  { key: 'calves', label: 'Calves', kind: 'length' },
  { key: 'neck', label: 'Neck', kind: 'length' },
  { key: 'body_fat_pct', label: 'Body fat %', kind: 'percent' },
];

const PRESET_KEYS = new Set(PRESET_METRICS.map((m) => m.key));

/** Is this metric key one of the built-in presets? (custom metrics are NOT). */
export function isPresetMetric(metric: string): boolean {
  return PRESET_KEYS.has(metric);
}

/** Look up a preset's definition, or null for a custom metric. */
export function presetMetricDef(metric: string): PresetMetricDef | null {
  return PRESET_METRICS.find((m) => m.key === metric) ?? null;
}

/** Display label for any metric key — preset label, or the raw custom key. */
export function metricLabel(metric: string): string {
  return presetMetricDef(metric)?.label ?? metric;
}

// ---------------------------------------------------------------------------
// Local (free-tier) reads/writes
// ---------------------------------------------------------------------------

interface LocalRow {
  id: string;
  metric: string;
  value: number;
  unit: string;
  logged_at: string;
}

function rowToEntry(row: LocalRow): MeasurementEntry {
  return {
    id: row.id,
    metric: row.metric,
    value: row.value,
    unit: (row.unit as MeasurementUnit) ?? 'cm',
    logged_at: row.logged_at,
  };
}

async function getLocalHistory(metric?: string): Promise<MeasurementEntry[]> {
  await localDb.init();
  const rows = metric
    ? await localDb.getAll<LocalRow>(
        'SELECT id, metric, value, unit, logged_at FROM body_measurements WHERE metric = ? ORDER BY logged_at ASC',
        [metric],
      )
    : await localDb.getAll<LocalRow>(
        'SELECT id, metric, value, unit, logged_at FROM body_measurements ORDER BY logged_at ASC',
      );
  return rows.map(rowToEntry);
}

async function getLocalLatest(metric: string): Promise<MeasurementEntry | null> {
  await localDb.init();
  const row = await localDb.getFirst<LocalRow>(
    'SELECT id, metric, value, unit, logged_at FROM body_measurements WHERE metric = ? ORDER BY logged_at DESC LIMIT 1',
    [metric],
  );
  return row ? rowToEntry(row) : null;
}

async function saveLocal(
  metric: string,
  value: number,
  unit: MeasurementUnit,
  now: Date,
): Promise<MeasurementEntry> {
  await localDb.init();
  const entry: MeasurementEntry = {
    id: genId(),
    metric,
    value,
    unit,
    logged_at: now.toISOString(),
  };
  await localDb.execute(
    'INSERT INTO body_measurements (id, metric, value, unit, logged_at, synced) VALUES (?, ?, ?, ?, ?, 0)',
    [entry.id, entry.metric, entry.value, entry.unit, entry.logged_at],
    { tables: ['body_measurements'] },
  );
  return entry;
}

async function deleteLocal(id: string): Promise<void> {
  await localDb.init();
  await localDb.execute('DELETE FROM body_measurements WHERE id = ?', [id], {
    tables: ['body_measurements'],
  });
}

// ---------------------------------------------------------------------------
// Public, tier-branched API — the ONLY surface a screen should call.
// ---------------------------------------------------------------------------

/** Full history for one metric, oldest first (drives the trend chart). */
export async function getMeasurementHistory(
  user: TierUser | null | undefined,
  metric: string,
): Promise<MeasurementEntry[]> {
  if (isLocalFirst(user)) return getLocalHistory(metric);
  try {
    const rows = await apiGetMeasurements(metric);
    return rows.map((r) => ({ ...r, unit: r.unit as MeasurementUnit }));
  } catch {
    return [];
  }
}

/** Every logged entry across all metrics, oldest first (for export/CSV). */
export async function getAllMeasurements(
  user: TierUser | null | undefined,
): Promise<MeasurementEntry[]> {
  if (isLocalFirst(user)) return getLocalHistory();
  try {
    const rows = await apiGetMeasurements();
    return rows.map((r) => ({ ...r, unit: r.unit as MeasurementUnit }));
  } catch {
    return [];
  }
}

/** Latest logged value for a metric — used to prefill the entry field. */
export async function getLatestMeasurement(
  user: TierUser | null | undefined,
  metric: string,
): Promise<MeasurementEntry | null> {
  if (isLocalFirst(user)) return getLocalLatest(metric);
  try {
    const rows = await apiGetMeasurements(metric);
    if (rows.length === 0) return null;
    const last = rows[rows.length - 1]!; // server also returns oldest-first
    return { ...last, unit: last.unit as MeasurementUnit };
  } catch {
    return null;
  }
}

/**
 * Log a new measurement entry. `value`/`unit` are already in CANONICAL storage
 * form (cm for length, raw percentage for body-fat) — convert via
 * constants/units.ts displayToCm BEFORE calling, exactly like the weight path.
 */
export async function logMeasurement(
  user: TierUser | null | undefined,
  metric: string,
  value: number,
  unit: MeasurementUnit,
  now: Date = new Date(),
): Promise<MeasurementEntry | null> {
  if (!(value > 0) && unit !== 'pct') return null; // lengths must be positive
  if (unit === 'pct' && !(value >= 0 && value <= 100)) return null;

  if (isLocalFirst(user)) {
    return saveLocal(metric, value, unit, now);
  }

  const entry: MeasurementEntry = {
    id: genId(),
    metric,
    value,
    unit,
    logged_at: now.toISOString(),
  };
  try {
    const saved = await apiUpsertMeasurement({
      id: entry.id,
      metric: entry.metric,
      value: entry.value,
      unit: entry.unit,
      loggedAt: entry.logged_at,
    });
    return { ...saved, unit: saved.unit as MeasurementUnit };
  } catch {
    return null;
  }
}

/** Delete a logged measurement entry. */
export async function deleteMeasurementEntry(
  user: TierUser | null | undefined,
  id: string,
): Promise<void> {
  if (isLocalFirst(user)) {
    await deleteLocal(id);
    return;
  }
  await apiDeleteMeasurement(id);
}

/** Distinct metric keys that have at least one logged entry (for the shelf). */
export async function getLoggedMetricKeys(
  user: TierUser | null | undefined,
): Promise<string[]> {
  const all = await getAllMeasurements(user);
  const seen = new Set<string>();
  const order: string[] = [];
  for (const e of all) {
    if (!seen.has(e.metric)) {
      seen.add(e.metric);
      order.push(e.metric);
    }
  }
  return order;
}
