/**
 * exportEngine — TICKET-094 (backup subsystem: the schema-versioned export format)
 *
 * This is the SAFE, pure, in-sandbox-verifiable slice of the local-first backup:
 * a **deterministic, schema-versioned JSON export/import** over the on-device
 * logical tables. It deliberately contains NO crypto, NO network/blob transport,
 * and does NOT move the data layer — those parts need native modules, an object-
 * storage provider decision, a security review, and a real-device
 * delete→reinstall→restore test, all of which remain founder-gated.
 *
 * What this gives us now (and what the unit test proves):
 *   • a canonical, deterministic serialization (so two exports of the same data
 *     are byte-identical — required before signing/encrypting later);
 *   • schema versioning with forward-compatible restore (a vN backup restores on
 *     vN+1; a newer backup is rejected on an older app — AC7);
 *   • a thin DB read/write glue (buildBackupFromDb / restoreBackupToDb) that the
 *     encryption + transport layers will wrap.
 *
 * The encrypted-blob wrapper, automatic triggers, recovery code, and device-to-
 * device transfer are intentionally NOT here — see the ticket.
 *
 * v2 (SPEC-094A, 2026-06-12): BACKUP_SCHEMA_VERSION bumped 1→2; BACKUP_TABLES
 * extended with all local-first personal-data tables added by Agent L. A v1→v2
 * up-migration ensures that a v1 backup restores cleanly on a v2 app (missing
 * tables are filled in as empty arrays).
 *
 * SECURITY (DATA-01, 2026-06-19): the manual-import / restore path builds INSERT
 * statements from a backup JSON document. The VALUES are parameterized, but the
 * COLUMN names came straight from the imported row's `Object.keys(...)` and were
 * interpolated into SQL. A hand-crafted backup file (the manual-import path has
 * NO crypto barrier — see data-export.tsx) could therefore inject arbitrary SQL
 * via a malicious column name. Column identifiers can't be bound as parameters,
 * so instead we never trust them: every column key is validated against a
 * per-table allowlist (COLUMN_ALLOWLIST, derived from the known local schema in
 * src/db/localSchema.ts) before any SQL is composed. Unknown columns are dropped
 * during parseImport and re-checked at the INSERT site (defense in depth).
 */

// Bumped whenever the on-device logical schema changes shape. Additive changes
// stay backward/forward compatible; a breaking change needs an up-migration in
// MIGRATIONS below.
export const BACKUP_SCHEMA_VERSION = 2;

// The on-device logical tables that hold personal data. `outbox` is sync
// bookkeeping, not user data, and is intentionally excluded. `migration_snapshots`
// is internal bookkeeping, also excluded. workout_templates / template_sessions /
// template_exercises are global library data (no user rows to back up), excluded.
export const BACKUP_TABLES: string[] = [
  // v1 tables
  'workouts',
  'sets',
  'schedule',
  'avatar',
  'bodyweight',
  'exercise_prefs',
  'exercise_goals',
  // v2 tables (SPEC-094A local-first personal data)
  'plans',
  'routines',
  'streaks',
  'streak_overrides',
  'daily_health_log',
  'daily_health_metrics',
  'habits',
  'user_weekly_goals',
  'user_constraints',
  'exercise_prs',
  'user_confirmed_1rm',
  'user_cosmetics',
  'user_equipped_cosmetics',
  'user_profile',
];

export type Row = Record<string, unknown>;
export type TableMap = Record<string, Row[]>;

// ---------------------------------------------------------------------------
// SECURITY (DATA-01): per-table column-name allowlist.
//
// Restore composes `INSERT INTO <t> (<cols>) VALUES (...)`. Column identifiers
// cannot be bound as SQL parameters, and the manual-import path accepts an
// arbitrary JSON file with no crypto/signature barrier, so the column names in
// each row are untrusted input. We never interpolate a column name that isn't a
// real column of its table: every key is checked against this allowlist before
// any SQL is composed, and anything else is dropped fail-safe.
//
// These sets MUST mirror the on-device tables defined in src/db/localSchema.ts
// (the CREATE TABLE DDL + every guarded ALTER ADD COLUMN in SCHEMA_V3..V8).
// They are duplicated here, rather than imported, ON PURPOSE: importing the DDL
// strings adds no real safety (a stricter, hand-reviewed list is preferable for
// a security boundary). If a backed-up column is added to localSchema.ts, add it
// here too.
// ---------------------------------------------------------------------------

const COLUMN_ALLOWLIST: Record<string, Set<string>> = {
  workouts: new Set([
    'id', 'user_id', 'day_key', 'notes', 'session_type', 'created_at', 'updated_at', 'synced',
    'routine_name', // v4
  ]),
  sets: new Set([
    'id', 'server_id', 'workout_id', 'user_id', 'exercise_id', 'kind', 'set_index', 'reps',
    'weight_raw', 'rir', 'duration_sec', 'distance_m', 'avg_pace_sec_per_km', 'logged_at', 'synced',
    'weight_kg', // v3
    'metrics_json', // v6
  ]),
  schedule: new Set(['id', 'mode', 'data', 'position', 'updated_at']),
  avatar: new Set(['id', 'data', 'updated_at']),
  bodyweight: new Set(['id', 'week_key', 'weight_kg', 'logged_at']),
  exercise_prefs: new Set([
    'exercise_id', 'warmup_enabled', 'warmup_sets', 'base_weight_kg', 'pulley_id', 'updated_at',
  ]),
  exercise_goals: new Set([
    'exercise_id', 'exercise_name', 'target_weight_kg', 'target_reps', 'created_at', 'achieved_at',
    'achieved_set_id',
  ]),
  plans: new Set([
    'id', 'user_id', 'name', 'is_template', 'is_ai_generated', 'structure', 'created_at', 'updated_at',
  ]),
  routines: new Set(['id', 'user_id', 'name', 'exercises', 'created_at', 'updated_at']),
  streaks: new Set([
    'user_id', 'current_streak_days', 'longest_streak_days', 'last_session_date', 'pending_makeup',
    'updated_at',
  ]),
  streak_overrides: new Set([
    'id', 'user_id', 'override_date', 'reason', 'notes', 'created_at',
  ]),
  daily_health_log: new Set([
    'id', 'user_id', 'log_date', 'sleep_hours', 'sleep_quality', 'mood_score', 'stress_score',
    'screen_time_minutes', 'habits_completed', 'meditation_minutes', 'notes', 'created_at', 'updated_at',
  ]),
  daily_health_metrics: new Set([
    'metric_id', 'user_id', 'date', 'resting_hr_bpm', 'hrv_ms', 'sleep_hours', 'active_kcal',
    'source', 'created_at',
  ]),
  habits: new Set(['id', 'user_id', 'name', 'frequency', 'is_active', 'created_at']),
  user_weekly_goals: new Set([
    'user_id', 'workouts_per_week', 'pending_workouts_per_week', 'pending_applies_at', 'created_at',
    'updated_at',
  ]),
  user_constraints: new Set([
    'constraint_id', 'user_id', 'constraint_type', 'custom_note', 'created_at',
  ]),
  exercise_prs: new Set([
    'user_id', 'exercise_id', 'rep_count', 'weight_kg', 'set_id', 'achieved_at', 'created_at',
    'updated_at',
  ]),
  user_confirmed_1rm: new Set(['user_id', 'lift_id', 'confirmed_kg', 'confirmed_at']),
  user_cosmetics: new Set(['user_id', 'item_id', 'acquired_at', 'acquisition_source']),
  user_equipped_cosmetics: new Set(['user_id', 'slot', 'item_id', 'equipped_at']),
  user_profile: new Set([
    'id', 'user_id', 'email', 'display_name', 'sex', 'birth_date', 'weight_class_kg',
    'years_in_sport', 'experience_level', 'tier', 'unit_pref', 'score_pref', 'theme_preference',
    'show_wilks', 'training_goal', 'sessions_per_week', 'session_minutes', 'goal_weight_kg',
    'equipment_profile', 'season_phase', 'last_deload_at',
    'primary_focus', 'injuries', 'muscle_priorities', 'bodyweight_kg', 'training_days', // v8
    'created_at', 'updated_at',
  ]),
};

/**
 * Keep only allowlisted columns of a row for a given table. Any column name not
 * in the table's allowlist (including injection payloads) is dropped. Returns a
 * fresh object so the caller never mutates the imported document. Used by both
 * parseImport (pre-write validation) and restoreBackupToDb (at the SQL site).
 */
export function sanitizeRowColumns(table: string, row: Row): Row {
  const allowed = COLUMN_ALLOWLIST[table];
  if (!allowed) return {}; // unknown table → nothing is safe to write
  const clean: Row = {};
  for (const key of Object.keys(row)) {
    if (allowed.has(key)) clean[key] = row[key];
  }
  return clean;
}

export interface ExportDoc {
  format: 'peak-fettle-backup';
  schemaVersion: number;
  exportedAt: string; // ISO; excluded from the determinism canonical form
  tables: TableMap;
}

// Forward up-migrations keyed by the version they upgrade FROM.
// v1→v2: a v1 backup is missing the v2 tables — fill them in as empty arrays.
// The restore path will simply INSERT nothing for those tables, leaving the
// on-device tables untouched (a v1 restore is effectively a partial restore).
type Migration = (tables: TableMap) => TableMap;
const MIGRATIONS: Record<number, Migration> = {
  1: (tables: TableMap): TableMap => {
    // v2 tables that a v1 backup won't have — initialize as empty arrays.
    const v2Tables = [
      'plans',
      'routines',
      'streaks',
      'streak_overrides',
      'daily_health_log',
      'daily_health_metrics',
      'habits',
      'user_weekly_goals',
      'user_constraints',
      'exercise_prs',
      'user_confirmed_1rm',
      'user_cosmetics',
      'user_equipped_cosmetics',
      'user_profile',
    ];
    const upgraded = { ...tables };
    for (const t of v2Tables) {
      if (!Array.isArray(upgraded[t])) {
        upgraded[t] = [];
      }
    }
    return upgraded;
  },
};

// ---------------------------------------------------------------------------
// Pure: build + canonicalize + parse
// ---------------------------------------------------------------------------

/** Build an export document from an in-memory table map (registry order only). */
export function makeExportDoc(tables: TableMap, now: Date = new Date()): ExportDoc {
  const ordered: TableMap = {};
  for (const t of BACKUP_TABLES) ordered[t] = Array.isArray(tables[t]) ? tables[t]! : [];
  return {
    format: 'peak-fettle-backup',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    tables: ordered,
  };
}

/** Stable stringify: object keys sorted recursively. Used for determinism + hashing. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/**
 * Canonical form of an export — deterministic and independent of `exportedAt`,
 * key ordering, or insertion order. Two backups of identical data canonicalize
 * to the same string (the property encryption/signing will rely on).
 */
export function canonicalize(doc: ExportDoc): string {
  return stableStringify({
    format: doc.format,
    schemaVersion: doc.schemaVersion,
    tables: doc.tables,
  });
}

export type ParseResult =
  | { ok: true; version: number; tables: TableMap }
  | { ok: false; error: string };

/**
 * Validate + version-reconcile an incoming export. Forward-compatible: a backup
 * at schemaVersion <= currentVersion restores (running any up-migrations); a
 * backup NEWER than the app is rejected rather than silently corrupting data.
 */
export function parseImport(
  raw: unknown,
  currentVersion: number = BACKUP_SCHEMA_VERSION,
): ParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a backup document.' };
  const doc = raw as Partial<ExportDoc>;
  if (doc.format !== 'peak-fettle-backup') return { ok: false, error: 'Unrecognized backup format.' };
  if (typeof doc.schemaVersion !== 'number' || !Number.isInteger(doc.schemaVersion)) {
    return { ok: false, error: 'Missing or invalid schema version.' };
  }
  if (doc.schemaVersion > currentVersion) {
    return { ok: false, error: `This backup (v${doc.schemaVersion}) is newer than this app (v${currentVersion}). Update the app to restore it.` };
  }
  if (!doc.tables || typeof doc.tables !== 'object') return { ok: false, error: 'Backup has no tables.' };

  // Normalize: keep only known tables, ensure arrays, registry order, and
  // strip every column not in the table's allowlist (DATA-01 — column names are
  // untrusted on the manual-import path and would otherwise be interpolated into
  // INSERT SQL). Non-object rows are dropped.
  let tables: TableMap = {};
  for (const t of BACKUP_TABLES) {
    const v = (doc.tables as TableMap)[t];
    if (!Array.isArray(v)) {
      tables[t] = [];
      continue;
    }
    tables[t] = v
      .filter((row): row is Row => !!row && typeof row === 'object' && !Array.isArray(row))
      .map((row) => sanitizeRowColumns(t, row));
  }

  // Run forward up-migrations from the backup's version up to current.
  for (let v = doc.schemaVersion; v < currentVersion; v++) {
    const m = MIGRATIONS[v];
    if (m) tables = m(tables);
  }

  return { ok: true, version: currentVersion, tables };
}

// ---------------------------------------------------------------------------
// Thin DB glue (NOT unit-tested in node — needs expo-sqlite on a device).
// These are what the encryption + blob-transport layers will wrap.
// ---------------------------------------------------------------------------

interface MinimalDb {
  getAll<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[], opts?: { tables?: string[] }): Promise<void>;
}

/** Read every registered table from the on-device DB into an ExportDoc. */
export async function buildBackupFromDb(db: MinimalDb): Promise<ExportDoc> {
  const tables: TableMap = {};
  for (const t of BACKUP_TABLES) {
    try {
      tables[t] = await db.getAll<Row>(`SELECT * FROM ${t}`);
    } catch {
      tables[t] = [];
    }
  }
  return makeExportDoc(tables);
}

/**
 * Restore a parsed table map into the on-device DB: replace each known table's
 * contents (DELETE then INSERT). Caller passes the result of parseImport().
 * Safety-critical on a real device — covered by the device test, not in-sandbox.
 *
 * The entire operation runs inside a single SQLite transaction so that a device
 * crash or app kill mid-restore cannot leave the database in a partially-restored
 * state (some tables wiped, others still containing old data).  Either every
 * table is replaced atomically, or the transaction is rolled back and the
 * original data is preserved.
 */
export async function restoreBackupToDb(db: MinimalDb, tables: TableMap): Promise<void> {
  await db.execute('BEGIN', [], { tables: [] });
  try {
    for (const t of BACKUP_TABLES) {
      const rows = tables[t] ?? [];
      await db.execute(`DELETE FROM ${t}`, [], { tables: [t] });
      for (const row of rows) {
        // DATA-01: re-sanitize column names at the SQL-composition site so this
        // INSERT is injection-safe even if a caller bypassed parseImport. Only
        // allowlisted columns survive; values stay parameterized.
        const safeRow = sanitizeRowColumns(t, row);
        const cols = Object.keys(safeRow);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map((c) => safeRow[c] as unknown);
        await db.execute(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`,
          values,
          { tables: [t] },
        );
      }
    }
    await db.execute('COMMIT', [], { tables: [] });
  } catch (err) {
    // Roll back so the original data is preserved on any error.
    try { await db.execute('ROLLBACK', [], { tables: [] }); } catch { /* ignore */ }
    throw err;
  }
}
