/**
 * hevyCsv — parser for the Hevy app's workout CSV export (TICKET-135).
 *
 * Expected header signature (one row per SET):
 *   title, start_time, exercise_title, set_index, weight_kg, reps, ...
 * plus optional columns this parser also understands when present:
 *   rpe, set_type (Hevy's own warmup/failure/dropset marker column),
 *   superset_id, notes, workout_notes, duration_seconds, distance_km.
 *
 * ⚠️ Column layout risk (flagged per the brief): authored from the ticket spec,
 * not a fetched live sample — Hevy has changed export columns before.
 * Re-verify header names/order against a CURRENT real Hevy export before
 * shipping. headerHasAll() tolerates reordering/extra columns but a renamed
 * REQUIRED column needs a real sample to catch.
 *
 * Units: Hevy exports weight_kg already in kilograms (per the ticket spec) —
 * no unit_pref/conversion needed for this source; the value is returned
 * verbatim in `weightRaw` and the caller treats it as kg directly.
 *
 * Warm-up / failure / drop markers: Hevy's own export has historically used a
 * `set_type` column with values like "warmup", "normal", "failure", "drop" —
 * checked case-insensitively; a legacy boolean `is_warmup`-style column is
 * also tolerated if present.
 *
 * Pure module: no Date.now()/Math.random()/new Date().
 */

import { parseCsv, headerIndex, headerHasAll, col, parseNum, parseInt10 } from './csvUtil';
import { ParsedImportFile, RawImportedSet } from './types';

const HEVY_REQUIRED_COLUMNS = [
  'title',
  'start_time',
  'exercise_title',
  'set_index',
  'weight_kg',
  'reps',
];

/** True when `header` matches the Hevy CSV signature. */
export function isHevyHeader(header: string[]): boolean {
  return headerHasAll(header, HEVY_REQUIRED_COLUMNS);
}

function truthy(value: string | undefined): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

/**
 * Parse a full Hevy CSV export into normalized rows. Returns null when the
 * header doesn't match the Hevy signature (caller tries the next format).
 */
export function parseHevyCsv(text: string): ParsedImportFile | null {
  const table = parseCsv(text);
  if (table.length === 0) return null;
  const header = table[0]!;
  if (!isHevyHeader(header)) return null;

  const idx = headerIndex(header);
  const rows: RawImportedSet[] = [];

  for (let i = 1; i < table.length; i++) {
    const raw = table[i]!;
    if (raw.length === 0 || raw.every((c) => c.trim() === '')) continue;

    const startTime = col(raw, idx, 'start_time') ?? '';
    const workoutName = (col(raw, idx, 'title') ?? '').trim();
    const exerciseName = (col(raw, idx, 'exercise_title') ?? '').trim();
    if (!exerciseName) continue;

    const setIndex = parseInt10(col(raw, idx, 'set_index'));
    const weightKg = parseNum(col(raw, idx, 'weight_kg'));
    const reps = parseInt10(col(raw, idx, 'reps'));
    const rpe = parseNum(col(raw, idx, 'rpe'));

    const setType = (col(raw, idx, 'set_type') ?? '').trim().toLowerCase();
    const isWarmup = setType === 'warmup' || truthy(col(raw, idx, 'is_warmup'));
    const isFailure = setType === 'failure' || setType === 'to_failure' || truthy(col(raw, idx, 'is_failure'));
    const isDrop = setType === 'drop' || setType === 'dropset' || truthy(col(raw, idx, 'is_drop_set'));

    rows.push({
      timestampRaw: startTime.trim(),
      workoutName,
      exerciseNameRaw: exerciseName,
      setOrderRaw: setIndex ?? i,
      weightRaw: weightKg,
      reps,
      rpe,
      isWarmup,
      isFailure,
      isDrop,
    });
  }

  return { source: 'hevy', rows };
}
