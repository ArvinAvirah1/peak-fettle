/**
 * Shared types for the CSV importer pipeline (TICKET-135).
 *
 * Both the Strong and Hevy parsers (strongCsv.ts / hevyCsv.ts) normalize their
 * source rows into this common intermediate shape. The import screen
 * (csv-import.tsx) then resolves exercise names via nameMapping.ts and writes
 * the result through the SAME local-first write path the rest of the app uses
 * (localWorkouts.ts + the sets INSERT pattern from usePowerSyncLog.ts) — no new
 * data layer, no direct network calls, no `api/*` imports.
 *
 * Pure module: no Date.now()/Math.random()/new Date() reads here. Callers pass
 * `nowIso` / any needed "current time" explicitly so parsing stays deterministic
 * and unit-testable (CLAUDE.md "no direct clock or random reads inside parsers").
 */

/** The two competitor export formats this ticket adds, beyond Garmin/Strava. */
export type ImportSource = 'strong' | 'hevy';

/** Set "kind" markers the app's local schema already understands (sets.kind /
 * the drop/warmup tagging convention used by loggerLogic.ts + metrics_json). */
export type ImportedSetKind = 'normal' | 'warmup' | 'failure' | 'drop';

/**
 * One row of a competitor CSV, after column parsing but BEFORE exercise-name
 * resolution and unit conversion have been finalized against the app's catalog.
 * `weightDisplay` is the raw number found in the source column, in whatever
 * unit that source uses for this row (Strong: user's display unit — ambiguous
 * until resolved by the caller; Hevy: always kg).
 */
export interface RawImportedSet {
  /** Exact timestamp string as found in the source file (workout start time). */
  timestampRaw: string;
  /** Workout/session title from the source (Strong: "Workout Name", Hevy: "title"). */
  workoutName: string;
  /** Exercise name exactly as written in the source file. */
  exerciseNameRaw: string;
  /** 0-based or 1-based order value from the source's set-order column, RAW (unnormalized). */
  setOrderRaw: number;
  /** Weight value parsed from the source column (unit depends on source — see ImportSource). */
  weightRaw: number | null;
  reps: number | null;
  /** RPE value from the source column, if present (Strong "RPE" column). */
  rpe: number | null;
  /** True when the source row is flagged as a warm-up set. */
  isWarmup: boolean;
  /** True when the source row is flagged as a failure/to-failure set. */
  isFailure: boolean;
  /** True when the source row is flagged as a drop set. */
  isDrop: boolean;
  /** Distance/duration columns are ignored in v1 — Strong/Hevy exports are lift-first
   * and cardio-set import is out of scope for this ticket (acceptance criteria
   * only mention weight/reps/RIR/warmup/failure/dedupe). */
}

/** A fully-parsed source file: header signature already matched. */
export interface ParsedImportFile {
  source: ImportSource;
  rows: RawImportedSet[];
}

/** Result of matching a raw exercise name against the local catalog/alias table. */
export interface NameMatchResult {
  /** The raw name as it appeared in the source file (used as the cache key for
   * "remembered for the rest of the file" — spec point 2). */
  rawName: string;
  /** Resolved canonical exercise id, once matched (by alias, fuzzy match, or
   * manual user resolution) — null while still unresolved. */
  exerciseId: string | null;
  /** Resolved display name to store in the local exercise_names cache. */
  resolvedName: string | null;
  /** How the match was made — surfaced in the summary / debugging. */
  method: 'alias' | 'fuzzy' | 'manual' | 'created' | 'unmatched';
}

/** One set ready to write to the local `sets` table (exact kg already resolved). */
export interface ResolvedImportedSet {
  exerciseId: string;
  exerciseName: string;
  workoutName: string;
  /** ISO-8601 timestamp (parsed/validated from timestampRaw by the caller, which
   * supplies `parseTimestamp` — kept out of the pure parser so no implicit clock
   * reads happen inside this module). */
  loggedAtIso: string;
  /** Day key (YYYY-MM-DD) the set's workout belongs to, derived from loggedAtIso. */
  dayKey: string;
  setIndex: number;
  reps: number;
  weightKg: number;
  /** RIR derived from RPE (10 - RPE, clamped 0-10), or null if not derivable. */
  rir: number | null;
  kind: ImportedSetKind;
}

/** Aggregate counts for the post-import summary screen (spec point 5). */
export interface ImportSummary {
  workoutsImported: number;
  setsImported: number;
  setsSkipped: number;
  setsUnmatched: number;
  /** Distinct raw exercise names that could not be resolved and were skipped
   * (surfaced to the user so they know what to fix and re-import). */
  unmatchedNames: string[];
}
