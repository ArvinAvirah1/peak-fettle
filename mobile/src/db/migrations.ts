/**
 * migrations.ts — schema migration runner for the on-device SQLite store.
 *
 * Each migration version is an ordered list of SQL statements. The runner:
 *   1. Reads PRAGMA user_version from the DB.
 *   2. Applies any pending migrations in a transaction (where possible).
 *   3. Sets PRAGMA user_version to the new version.
 *
 * Pre-migration snapshot:
 *   Before applying a migration, the runner attempts to snapshot the DB via
 *   expo-file-system (dynamic require) into documentDirectory as
 *   pf_premigration_v<N>.json. If FS is unavailable, the snapshot payload is
 *   written into migration_snapshots (best-effort, never blocks migration).
 *
 * Wire-up: localDb.init() calls runMigrations(db) after the base SCHEMA_STATEMENTS.
 *
 * SPEC-094A Agent L, 2026-06-12.
 */

import { SCHEMA_V2_STATEMENTS, SCHEMA_V3_STATEMENTS, SCHEMA_V4_STATEMENTS, SCHEMA_V5_STATEMENTS, SCHEMA_V6_STATEMENTS, SCHEMA_V7_STATEMENTS, SCHEMA_V8_STATEMENTS, MigrationStatement } from './localSchema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MigrationDb {
  getAll<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirst<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[], opts?: { tables?: string[] }): Promise<void>;
}

export interface MigrationVersion {
  v: number;
  statements: MigrationStatement[];
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort pre-migration snapshot. Tries expo-file-system first (device),
 * falls back to the migration_snapshots table (testable in node).
 */
async function snapshotBeforeMigration(
  db: MigrationDb,
  version: number,
  buildBackup: (() => Promise<string>) | null,
): Promise<void> {
  const payload = buildBackup ? await buildBackup().catch(() => '{}') : '{}';
  const createdAt = new Date().toISOString();

  // Try expo-file-system via dynamic require (no hard import — bundle-safe).
  let fsWritten = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FS = require('expo-file-system') as {
      documentDirectory: string | null;
      writeAsStringAsync(uri: string, contents: string): Promise<void>;
    };
    if (FS.documentDirectory) {
      const uri = `${FS.documentDirectory}pf_premigration_v${version}.json`;
      await FS.writeAsStringAsync(uri, payload);
      fsWritten = true;
    }
  } catch {
    // expo-file-system not available (e.g. node test environment) — fall through.
  }

  if (!fsWritten) {
    // Ensure the snapshots table exists (best-effort: won't throw if CREATE fails).
    await db
      .execute(
        `CREATE TABLE IF NOT EXISTS migration_snapshots (
          version INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          payload TEXT NOT NULL
        )`,
        [],
        { tables: ['migration_snapshots'] },
      )
      .catch(() => undefined);

    await db
      .execute(
        `INSERT INTO migration_snapshots (version, created_at, payload) VALUES (?, ?, ?)`,
        [version, createdAt, payload],
        { tables: ['migration_snapshots'] },
      )
      .catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Migration definitions
// ---------------------------------------------------------------------------

// v2: adds all local-first personal-data tables (plans, routines, streaks,
// daily_health_log, daily_health_metrics, habits, user_weekly_goals,
// user_constraints, exercise_prs, user_confirmed_1rm, user_cosmetics,
// user_equipped_cosmetics, user_profile, workout_templates, template_sessions,
// template_exercises, and their indexes).
const MIGRATION_V2: MigrationVersion = {
  v: 2,
  statements: SCHEMA_V2_STATEMENTS,
};

// v3: exact-precision weight storage (adds sets.weight_kg REAL + backfill).
const MIGRATION_V3: MigrationVersion = {
  v: 3,
  statements: SCHEMA_V3_STATEMENTS,
};

// v4: local routine labels (adds workouts.routine_name TEXT).
const MIGRATION_V4: MigrationVersion = {
  v: 4,
  statements: SCHEMA_V4_STATEMENTS,
};

// v5: device-local app_settings KV table + workouts(session_type) /
// workouts(created_at) indexes (all CREATE ... IF NOT EXISTS).
const MIGRATION_V5: MigrationVersion = {
  v: 5,
  statements: SCHEMA_V5_STATEMENTS,
};

// v6: rich cardio metrics (adds sets.metrics_json TEXT) + a persistable
// on-device username for free users (adds user_profile.display_name TEXT).
// Both are guarded ALTER ADD COLUMN statements.
const MIGRATION_V6: MigrationVersion = {
  v: 6,
  statements: SCHEMA_V6_STATEMENTS,
};

// v7: Pro-upgrade migration ledger (migration_state) — gives the Free→Pro
// local→server uploader (mobile/src/data/migrateToPro.ts) idempotency + resume.
const MIGRATION_V7: MigrationVersion = {
  v: 7,
  statements: SCHEMA_V7_STATEMENTS,
};

// v8: expanded Training-Engine survey columns on user_profile (primary_focus,
// injuries, muscle_priorities, bodyweight_kg, training_days) — all guarded
// ALTER ADD COLUMN, all nullable.
const MIGRATION_V8: MigrationVersion = {
  v: 8,
  statements: SCHEMA_V8_STATEMENTS,
};

export const MIGRATIONS: MigrationVersion[] = [MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5, MIGRATION_V6, MIGRATION_V7, MIGRATION_V8];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run all pending migrations against the given DB handle.
 *
 * @param db         - minimal DB interface (same shape as localDb)
 * @param buildBackup - optional async fn that returns a JSON string snapshot of
 *                      current DB state (passed from exportEngine.buildBackupFromDb).
 *                      Called BEFORE each migration for the pre-migration snapshot.
 */
export async function runMigrations(
  db: MigrationDb,
  buildBackup?: () => Promise<string>,
): Promise<void> {
  // Read the current schema version from SQLite.
  const row = await db
    .getFirst<{ user_version: number }>('PRAGMA user_version')
    .catch(() => null);
  let currentVersion = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.v <= currentVersion) {
      continue; // already applied
    }

    // Pre-migration snapshot (best-effort).
    await snapshotBeforeMigration(db, migration.v, buildBackup ?? null).catch(
      () => undefined,
    );

    // Apply all statements for this migration version inside a single
    // transaction so that a mid-migration crash leaves the DB unchanged.
    // PRAGMA user_version is set inside the same transaction — if anything
    // throws before COMMIT the version is not advanced and the next launch
    // will re-run the migration cleanly.
    //
    // Note: expo-sqlite's execAsync supports BEGIN/COMMIT; we drive each
    // statement through db.execute() so the MigrationDb interface stays thin.
    try {
      await db.execute('BEGIN', [], { tables: [] });
      for (const stmt of migration.statements) {
        if (typeof stmt === 'string') {
          await db.execute(stmt, [], { tables: [] });
        } else if (stmt.type === 'alter_add_column') {
          // Idempotency guard for ALTER TABLE ADD COLUMN: SQLite has no
          // "IF NOT EXISTS" syntax for this DDL.  Check pragma_table_info
          // first and skip if the column is already present (handles the case
          // where the app was killed after the ALTER but before COMMIT /
          // user_version advancement on a prior launch).
          const colRows = await db.getAll<{ name: string }>(
            `SELECT name FROM pragma_table_info(?) WHERE name = ?`,
            [stmt.table, stmt.column],
          );
          if (colRows.length === 0) {
            await db.execute(
              `ALTER TABLE ${stmt.table} ADD COLUMN ${stmt.column} ${stmt.definition}`,
              [],
              { tables: [] },
            );
          }
        }
      }
      // Advance the version inside the transaction.
      await db.execute(`PRAGMA user_version = ${migration.v}`, [], { tables: [] });
      await db.execute('COMMIT', [], { tables: [] });
    } catch (err) {
      // Roll back so the DB is left in the pre-migration state.
      try { await db.execute('ROLLBACK', [], { tables: [] }); } catch { /* ignore rollback errors */ }
      throw err;
    }
    currentVersion = migration.v;
  }
}
