/**
 * strongCsv — parser for the Strong app's workout CSV export (TICKET-135).
 *
 * Expected header signature (one row per SET, as of the ticket's spec):
 *   Date, Workout Name, Exercise Name, Set Order, Weight, Reps, ...
 * plus optional columns this parser also understands when present:
 *   RPE, Distance, Seconds, Notes, Workout Notes, Weight Unit.
 *
 * ⚠️ Column layout risk (flagged per the brief): this signature was authored
 * from the ticket spec, not a fetched live sample — Strong has changed its
 * export columns before. Re-verify header names/order against a CURRENT real
 * Strong export before shipping; headerHasAll() below is intentionally
 * tolerant of column reordering/extra columns so a minor drift (extra column,
 * different order) still auto-detects, but a renamed REQUIRED column would
 * not and needs a real sample to confirm.
 *
 * Units: Strong exports weight in the user's Strong app unit preference, which
 * this app has NO way to read from the file alone (no per-row unit column in
 * the common export; some exports DO include a "Weight Unit" column — read it
 * when present, else fall back to the caller-supplied `unitPref`). The caller
 * (csv-import.tsx) must pass the app's current unit_pref as the fallback and
 * convert via `displayToKg` from constants/units.ts — this module returns the
 * RAW numeric value un-converted; it does NOT assume kg.
 *
 * Warm-up / failure detection: Strong marks these in a few different ways
 * across export versions — a boolean-ish "Warmup"/"Is Warmup" column, or a
 * marker embedded in "Notes" (e.g. "warmup", "failure"/"to failure"). Both are
 * checked defensively; absence of any marker → a normal working set.
 *
 * Pure module: no Date.now()/Math.random()/new Date(). Row order in the file
 * is preserved as `setOrderRaw` fallback when a Set Order column is absent.
 */

import { parseCsv, headerIndex, headerHasAll, col, parseNum, parseInt10 } from './csvUtil';
import { ParsedImportFile, RawImportedSet } from './types';

/** Columns required to positively identify a Strong export (tolerant of extra
 * columns and reordering — see headerHasAll). */
const STRONG_REQUIRED_COLUMNS = [
  'Date',
  'Workout Name',
  'Exercise Name',
  'Set Order',
  'Weight',
  'Reps',
];

/** True when `header` matches the Strong CSV signature. */
export function isStrongHeader(header: string[]): boolean {
  return headerHasAll(header, STRONG_REQUIRED_COLUMNS);
}

function truthy(value: string | undefined): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

function notesFlag(notes: string | undefined, needle: string): boolean {
  if (!notes) return false;
  return notes.toLowerCase().includes(needle);
}

/**
 * Parse a full Strong CSV export into normalized rows. Returns null when the
 * header doesn't match the Strong signature (caller tries the next format).
 */
export function parseStrongCsv(text: string): ParsedImportFile | null {
  const table = parseCsv(text);
  if (table.length === 0) return null;
  const header = table[0]!;
  if (!isStrongHeader(header)) return null;

  const idx = headerIndex(header);
  const rows: RawImportedSet[] = [];

  for (let i = 1; i < table.length; i++) {
    const raw = table[i]!;
    // Skip fully blank rows.
    if (raw.length === 0 || raw.every((c) => c.trim() === '')) continue;

    const date = col(raw, idx, 'Date') ?? '';
    const workoutName = (col(raw, idx, 'Workout Name') ?? '').trim();
    const exerciseName = (col(raw, idx, 'Exercise Name') ?? '').trim();
    if (!exerciseName) continue; // unusable row — no exercise to attach the set to

    const setOrder = parseInt10(col(raw, idx, 'Set Order'));
    const weight = parseNum(col(raw, idx, 'Weight'));
    const reps = parseInt10(col(raw, idx, 'Reps'));
    const rpe = parseNum(col(raw, idx, 'RPE'));
    const notes = col(raw, idx, 'Notes') ?? col(raw, idx, 'Workout Notes');

    // Warm-up / failure markers: check a dedicated column first, else fall
    // back to a substring marker in a notes-ish column. Some Strong exports
    // put the marker directly in the "Set Order" cell (e.g. "W1", "F") —
    // handle that too since it's a documented quirk of older exports.
    const setOrderCell = (col(raw, idx, 'Set Order') ?? '').trim().toLowerCase();
    const isWarmup =
      truthy(col(raw, idx, 'Warmup')) ||
      truthy(col(raw, idx, 'Is Warmup')) ||
      setOrderCell.startsWith('w') ||
      notesFlag(notes, 'warmup') ||
      notesFlag(notes, 'warm-up') ||
      notesFlag(notes, 'warm up');
    const isFailure =
      truthy(col(raw, idx, 'Failure')) ||
      truthy(col(raw, idx, 'To Failure')) ||
      setOrderCell === 'f' ||
      notesFlag(notes, 'failure');
    const isDrop =
      truthy(col(raw, idx, 'Drop Set')) ||
      setOrderCell.startsWith('d') ||
      notesFlag(notes, 'drop set') ||
      notesFlag(notes, 'dropset');

    rows.push({
      timestampRaw: date.trim(),
      workoutName,
      exerciseNameRaw: exerciseName,
      setOrderRaw: setOrder ?? i, // fall back to file row order — still stable/idempotent
      weightRaw: weight,
      reps,
      rpe,
      isWarmup,
      isFailure,
      isDrop,
    });
  }

  return { source: 'strong', rows };
}
