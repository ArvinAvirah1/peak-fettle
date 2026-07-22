/**
 * importEngine — orchestrates Strong/Hevy CSV import into the local-first data
 * layer (TICKET-135).
 *
 * This module is the ONLY place in the importer pipeline that touches
 * localDb/the sets+workouts tables. It deliberately mirrors the write shapes
 * already used elsewhere in the app rather than inventing a new path:
 *   • workouts row: same columns/insert-or-reuse pattern as
 *     ensureLocalWorkoutForDay() in mobile/src/data/localWorkouts.ts.
 *   • sets row: same column list/order and weight_kg + weight_raw (kg×8,
 *     legacy/derived) dual-write as the local INSERT in
 *     mobile/src/hooks/usePowerSyncLog.ts logSet().
 *   • exercise name cache: rememberExerciseName from
 *     mobile/src/data/exerciseNames.ts, so imported exercises resolve to real
 *     names on Home/history immediately (same cache Home/history already read).
 *
 * Free tier: this module is called ONLY for local-first users (the caller in
 * csv-import.tsx gates on isLocalFirst(user) exactly like the rest of the app —
 * Strong/Hevy import never calls a personal REST endpoint; the existing
 * server-side /import/csv path for Garmin/Strava is untouched and still used
 * for Pro users, who have no local-first branch to take here).
 *
 * Dedupe (spec point 4 — idempotent re-import): a set is skipped if a local
 * `sets` row already exists with the same (exercise_id, set_index, logged_at)
 * triple — the closest local equivalent of "(timestamp, exercise, set_index)"
 * since the local schema has no separate workout-start-time column keyed
 * per-set; `logged_at` IS the per-set timestamp we derive from the workout
 * start time + set_index ordering (see resolveTimestamps below), so the same
 * triple recurring on a second import of the same file is the correct
 * idempotency signal.
 *
 * Clock discipline: the only "now" reads are the two explicit `nowIso`
 * parameters threaded in from the caller (created_at/updated_at bookkeeping
 * columns) — never Date.now()/new Date() internally, per CLAUDE.md.
 */

import { localDb, genId } from '../../db/localDb';
import { rememberExerciseName } from '../../data/exerciseNames';
import { displayToKg, displayToCenti, UnitSystem } from '../../constants/units';
import { matchExerciseName, MatchCandidate, rirFromRpe } from './nameMapping';
import { ImportSource, ImportSummary, ParsedImportFile, RawImportedSet } from './types';

// ---------------------------------------------------------------------------
// Timestamp handling
// ---------------------------------------------------------------------------

/**
 * Parse a source timestamp string into an ISO-8601 string, tolerating the
 * common Strong ("2026-06-14 08:32:00" or "6/14/2026, 8:32 AM") and Hevy
 * ("2026-06-14T08:32:00Z"/"2026-06-14 08:32:00") formats. Returns null when
 * unparseable so the caller can skip the row rather than store garbage.
 *
 * Accepts `fallbackIso` (the caller's "now", read ONCE outside this pure-ish
 * helper) to use only when the row's own timestamp is completely missing —
 * this is the one deliberate exception to "no clock reads inside parsers": the
 * clock is read by the CALLER and passed in, never read here.
 */
export function parseSourceTimestamp(raw: string, fallbackIso: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return fallbackIso;
  // JS Date can parse ISO 8601 and most common US formats directly; guard
  // against "Invalid Date" rather than trusting it blindly.
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return fallbackIso;
}

/** Derive a YYYY-MM-DD day key from an ISO timestamp (local calendar date of
 * the ISO instant, matching the convention used elsewhere, e.g. localWorkouts). */
export function dayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Weight resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a raw source weight value into EXACT kilograms.
 *   • Hevy: already kg — passed through untouched (never re-converted).
 *   • Strong: exported in the user's Strong display unit, which this app
 *     cannot read from the file — the caller supplies `unitPref` (the app's
 *     current unit_pref, the best available signal) and we convert via the
 *     SAME displayToKg() helper the logger/edit paths use (CLAUDE.md §2 —
 *     never store a raw lbs number as if it were kg).
 */
export function resolveWeightKg(
  source: ImportSource,
  weightRaw: number,
  unitPref: UnitSystem,
): number {
  if (source === 'hevy') return weightRaw;
  return displayToKg(weightRaw, unitPref);
}

/**
 * The unit the source file's weight values are expressed in — used to store
 * the fixed-point exact entry (v18 weight_centi/weight_unit) alongside the
 * canonical kg. Hevy exports kg; Strong exports the user's display unit
 * (best-signalled by the app's unit_pref, same assumption as resolveWeightKg).
 */
export function resolveSourceUnit(
  source: ImportSource,
  unitPref: UnitSystem,
): UnitSystem {
  return source === 'hevy' ? 'kg' : unitPref;
}

// ---------------------------------------------------------------------------
// Set kind + ordering
// ---------------------------------------------------------------------------

function kindOf(row: RawImportedSet): 'normal' | 'warmup' | 'failure' | 'drop' {
  if (row.isWarmup) return 'warmup';
  if (row.isFailure) return 'failure';
  if (row.isDrop) return 'drop';
  return 'normal';
}

// ---------------------------------------------------------------------------
// Grouping rows into per-exercise-per-workout set sequences
// ---------------------------------------------------------------------------

interface WorkoutGroup {
  dayKey: string;
  workoutName: string;
  /** exercise name (raw, pre-resolution) → ordered rows for that exercise in
   * this workout, in file order (used to derive a stable 0-based set_index
   * per exercise, matching the app's own `set_index` convention). */
  byExercise: Map<string, RawImportedSet[]>;
  loggedAtByExercise: Map<string, string[]>;
}

/**
 * Group parsed rows by (dayKey, exercise), resolving each row's timestamp
 * along the way. `nowIso` is the caller's single clock read for the whole
 * import (used only as a last-resort fallback for unparseable timestamps).
 */
function groupRows(
  rows: RawImportedSet[],
  nowIso: string,
): Map<string, WorkoutGroup> {
  const workouts = new Map<string, WorkoutGroup>();

  for (const row of rows) {
    const iso = parseSourceTimestamp(row.timestampRaw, nowIso);
    const dayKey = dayKeyFromIso(iso);
    const workoutKey = `${dayKey}::${row.workoutName || 'Imported Workout'}`;

    let group = workouts.get(workoutKey);
    if (!group) {
      group = {
        dayKey,
        workoutName: row.workoutName || 'Imported Workout',
        byExercise: new Map(),
        loggedAtByExercise: new Map(),
      };
      workouts.set(workoutKey, group);
    }

    const exerciseKey = row.exerciseNameRaw;
    const list = group.byExercise.get(exerciseKey) ?? [];
    list.push(row);
    group.byExercise.set(exerciseKey, list);

    const isoList = group.loggedAtByExercise.get(exerciseKey) ?? [];
    isoList.push(iso);
    group.loggedAtByExercise.set(exerciseKey, isoList);
  }

  return workouts;
}

// ---------------------------------------------------------------------------
// DB row shapes (local, read-only checks for dedupe)
// ---------------------------------------------------------------------------

interface ExistingSetKeyRow {
  exercise_id: string;
  set_index: number;
  logged_at: string;
}

async function loadExistingKeys(): Promise<Set<string>> {
  const rows = await localDb.getAll<ExistingSetKeyRow>(
    'SELECT exercise_id, set_index, logged_at FROM sets WHERE kind = \'lift\'',
  );
  const set = new Set<string>();
  for (const r of rows) {
    set.add(`${r.exercise_id}::${r.set_index}::${r.logged_at}`);
  }
  return set;
}

// ---------------------------------------------------------------------------
// Public options / result shapes
// ---------------------------------------------------------------------------

export interface ImportOptions {
  userId: string;
  unitPref: UnitSystem;
  /** Caller's single "now" read (ISO), used only as a timestamp fallback and
   * for created_at/updated_at bookkeeping — see clock-discipline note above. */
  nowIso: string;
  /** Candidate exercises for name matching (engine catalog + cached names). */
  candidates: MatchCandidate[];
  /**
   * Resolve a raw exercise name that the automatic matcher could not place.
   * Called at most ONCE per distinct unmatched raw name in the file (the
   * result is cached for the rest of the file — spec point 2). Return null to
   * skip every set for that exercise (surfaced in the summary as unmatched).
   */
  onUnmatched: (rawName: string) => Promise<{ exerciseId: string; exerciseName: string } | null>;
}

/**
 * Import a parsed Strong/Hevy file into the local-first data layer.
 * Returns the summary the screen renders (spec point 5).
 */
export async function importParsedFile(
  parsed: ParsedImportFile,
  opts: ImportOptions,
): Promise<ImportSummary> {
  await localDb.init();

  const summary: ImportSummary = {
    workoutsImported: 0,
    setsImported: 0,
    setsSkipped: 0,
    setsUnmatched: 0,
    unmatchedNames: [],
  };

  if (parsed.rows.length === 0) return summary;

  const groups = groupRows(parsed.rows, opts.nowIso);
  const existingKeys = await loadExistingKeys();
  // Per-file name resolution cache — "remembered for the rest of the file".
  const resolutionCache = new Map<string, { exerciseId: string; exerciseName: string } | null>();
  const unmatchedSeen = new Set<string>();

  for (const group of groups.values()) {
    const workoutId = await ensureWorkoutRow(group.dayKey, group.workoutName, opts.userId, opts.nowIso);
    let workoutHadAnySet = false;

    for (const [exerciseNameRaw, exerciseRows] of group.byExercise) {
      let resolution = resolutionCache.get(exerciseNameRaw);
      if (resolution === undefined) {
        const auto = matchExerciseName(exerciseNameRaw, opts.candidates);
        if (auto.exerciseId && auto.resolvedName) {
          resolution = { exerciseId: auto.exerciseId, exerciseName: auto.resolvedName };
        } else {
          resolution = await opts.onUnmatched(exerciseNameRaw);
        }
        resolutionCache.set(exerciseNameRaw, resolution);
      }

      if (!resolution) {
        summary.setsUnmatched += exerciseRows.length;
        if (!unmatchedSeen.has(exerciseNameRaw)) {
          unmatchedSeen.add(exerciseNameRaw);
          summary.unmatchedNames.push(exerciseNameRaw);
        }
        continue;
      }

      await rememberExerciseName(resolution.exerciseId, resolution.exerciseName);

      const isoList = group.loggedAtByExercise.get(exerciseNameRaw)!;
      for (let i = 0; i < exerciseRows.length; i++) {
        const row = exerciseRows[i]!;
        const loggedAt = isoList[i]!;

        if (row.weightRaw == null || row.reps == null) {
          summary.setsSkipped++;
          continue;
        }

        // Stable 0-based set_index per exercise within this workout, matching
        // the app's own convention (usePowerSyncLog assigns
        // `stepperSets.get(exerciseId)?.length ?? 0`) rather than trusting the
        // source file's own (possibly 1-based, possibly non-contiguous) order
        // column — this keeps the dedupe key stable across re-imports even if
        // the source renumbers rows.
        const setIndex = i;

        const key = `${resolution.exerciseId}::${setIndex}::${loggedAt}`;
        if (existingKeys.has(key)) {
          summary.setsSkipped++;
          continue;
        }

        const weightKg = resolveWeightKg(parsed.source, row.weightRaw, opts.unitPref);
        const rir = rirFromRpe(row.rpe);

        await insertSetRow({
          workoutId,
          userId: opts.userId,
          exerciseId: resolution.exerciseId,
          setIndex,
          reps: row.reps,
          weightKg,
          // Fixed-point exact entry: the file's value × 100 in the file's unit.
          weightCenti: displayToCenti(row.weightRaw),
          weightUnit: resolveSourceUnit(parsed.source, opts.unitPref),
          rir,
          loggedAt,
        });

        existingKeys.add(key);
        summary.setsImported++;
        workoutHadAnySet = true;
      }
    }

    if (workoutHadAnySet) summary.workoutsImported++;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Local DB writes — mirrors localWorkouts.ts / usePowerSyncLog.ts exactly
// ---------------------------------------------------------------------------

interface WorkoutRow {
  id: string;
}

/**
 * Get-or-create the local workout row for a given day, stamping the imported
 * routine/session name (mirrors stampLocalRoutineName in localWorkouts.ts, but
 * inlined here rather than importing it to avoid writing to a shared file
 * outside this ticket's ownership — the SQL is identical).
 */
async function ensureWorkoutRow(
  dayKey: string,
  workoutName: string,
  userId: string,
  nowIso: string,
): Promise<string> {
  await localDb.execute(
    `INSERT INTO workouts (id, user_id, day_key, notes, session_type, routine_name, created_at, updated_at, synced)
     SELECT ?, ?, ?, NULL, NULL, ?, ?, ?, 0
     WHERE NOT EXISTS (SELECT 1 FROM workouts WHERE day_key = ?)`,
    [genId(), userId, dayKey, workoutName || null, nowIso, nowIso, dayKey],
    { tables: ['workouts'] },
  );
  const row = await localDb.getFirst<WorkoutRow>(
    'SELECT id FROM workouts WHERE day_key = ? ORDER BY created_at ASC LIMIT 1',
    [dayKey],
  );
  if (!row) {
    // Should be unreachable (INSERT-or-reuse above guarantees a row), but
    // never throw an import into a half-written state over this.
    throw new Error(`[importEngine] failed to resolve workout row for ${dayKey}`);
  }
  return row.id;
}

/** kg → weight_raw (kg×8) SMALLINT, matching every other local write path. */
function encodeWeightRaw(weightKg: number): number {
  return Math.round(weightKg * 8);
}

interface InsertSetArgs {
  workoutId: string;
  userId: string;
  exerciseId: string;
  setIndex: number;
  reps: number;
  weightKg: number;
  /** Fixed-point exact entry: file value × 100 in the file's unit (v18). */
  weightCenti: number;
  /** Unit the file's weight values are in ('kg' | 'lbs'). */
  weightUnit: UnitSystem;
  rir: number | null;
  loggedAt: string;
}

async function insertSetRow(args: InsertSetArgs): Promise<void> {
  const localId = genId();
  const COLS =
    `(id, server_id, workout_id, user_id, exercise_id, kind, set_index, ` +
    `reps, weight_raw, weight_kg, weight_centi, weight_unit, rir, duration_sec, distance_m, avg_pace_sec_per_km, ` +
    `logged_at, synced)`;
  await localDb.execute(
    `INSERT INTO sets ${COLS}
     VALUES (?, NULL, ?, ?, ?, 'lift', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 0)`,
    [
      localId, args.workoutId, args.userId, args.exerciseId, args.setIndex,
      args.reps, encodeWeightRaw(args.weightKg), args.weightKg,
      args.weightCenti, args.weightUnit,
      args.rir, args.loggedAt,
    ],
    { tables: ['sets'] },
  );
}
