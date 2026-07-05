/**
 * Versioned schema migrations for the Life OS local DB.
 *
 * Lesson encoded from the fitness app (memory: workout-routine-link -- a
 * migration existed but there was no in-repo runner, so deployed DBs silently
 * missed columns): the runner ships WITH the schema from day one and is called
 * on every open, before any query runs.
 *
 * v1 is the base schema (localSchema.ts, idempotent). Add v2+ entries to
 * MIGRATIONS below; each runs at most once, tracked in lo_meta.schema_version.
 */

import type { localDb as LocalDbType } from './localDb';
import { SCHEMA_VERSION } from './localSchema';

type Db = typeof LocalDbType;
type Migration = { to: number; run: (db: Db) => Promise<void> };

/** v2+ migrations append here. Keep them additive and idempotent where possible. */
const MIGRATIONS: Migration[] = [
  {
    // TICKET-119 schema v2 -- additive tables for the four optional v3 features.
    // CREATE ... IF NOT EXISTS keeps it idempotent + drift-tolerant (CLAUDE.md #4).
    // lo_app_ratings is intentionally NOT in BACKUP_TABLES (keyed to device-scoped
    // FamilyActivity tokens -- re-tag on restore, same rule as lo_focus_configs).
    to: 2,
    run: async (db) => {
      await db.execute(`CREATE TABLE IF NOT EXISTS lo_app_ratings (
        token_label TEXT PRIMARY KEY,
        rating TEXT NOT NULL CHECK (rating IN ('energizing','neutral','draining')),
        updated_at TEXT NOT NULL)`);
      await db.execute(`CREATE TABLE IF NOT EXISTS lo_share_events (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT, ts TEXT NOT NULL)`);
      await db.execute(`CREATE TABLE IF NOT EXISTS lo_partner (
        id TEXT PRIMARY KEY DEFAULT 'self', partner_label TEXT, invite_code TEXT,
        paused INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL)`);
      await db.execute(`CREATE TABLE IF NOT EXISTS lo_affirmations (
        id TEXT PRIMARY KEY, text TEXT NOT NULL, identity_tag TEXT,
        enabled INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'user')`);
    },
  },
  {
    // TICKET-151 schema v3 -- habit types/targets, goal metrics, multi-check-in
    // mood, and habit pause windows. Only runs on v1/v2 DBs whose tables predate
    // these columns, so plain ALTER TABLE ADD COLUMN is safe here (SQLite allows
    // CHECK + NOT NULL DEFAULT on an added column); the version gate in
    // runMigrations prevents this from ever re-running against a v3 DB.
    to: 3,
    run: async (db) => {
      // lo_habits: habit type + optional quantity/timer target + weekly quota.
      await db.execute(
        `ALTER TABLE lo_habits ADD COLUMN habit_type TEXT NOT NULL DEFAULT 'boolean' CHECK (habit_type IN ('boolean','quantity','timer'))`
      );
      await db.execute(`ALTER TABLE lo_habits ADD COLUMN target_value REAL`);
      await db.execute(`ALTER TABLE lo_habits ADD COLUMN target_unit TEXT`);
      await db.execute(`ALTER TABLE lo_habits ADD COLUMN weekly_quota INTEGER`);

      // lo_habit_logs: quantity value + free-text note per log entry.
      await db.execute(`ALTER TABLE lo_habit_logs ADD COLUMN value REAL`);
      await db.execute(`ALTER TABLE lo_habit_logs ADD COLUMN note TEXT`);

      // lo_goals: metric tracking (milestone-only, numeric target, or linked to a habit).
      await db.execute(
        `ALTER TABLE lo_goals ADD COLUMN metric_type TEXT NOT NULL DEFAULT 'milestone' CHECK (metric_type IN ('milestone','numeric','habit_linked'))`
      );
      await db.execute(`ALTER TABLE lo_goals ADD COLUMN metric_target REAL`);
      await db.execute(`ALTER TABLE lo_goals ADD COLUMN metric_current REAL`);

      // lo_mood_checkins: drop UNIQUE(date) to allow multiple check-ins/day (T158).
      // SQLite has no ALTER TABLE DROP CONSTRAINT, so recreate without it,
      // preserving every row, then swap the table in under the original name.
      await db.execute(`CREATE TABLE IF NOT EXISTS lo_mood_checkins_v3 (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        date TEXT NOT NULL,
        mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
        tags_json TEXT NOT NULL DEFAULT '[]',
        note TEXT)`);
      await db.execute(`INSERT INTO lo_mood_checkins_v3 (id, ts, date, mood, tags_json, note)
        SELECT id, ts, date, mood, tags_json, note FROM lo_mood_checkins`);
      await db.execute(`DROP TABLE lo_mood_checkins`);
      await db.execute(`ALTER TABLE lo_mood_checkins_v3 RENAME TO lo_mood_checkins`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_lo_mood_checkins_date ON lo_mood_checkins (date)`);

      // lo_habit_pauses: new table -- end_date nullable = an open-ended pause.
      await db.execute(`CREATE TABLE IF NOT EXISTS lo_habit_pauses (
        id TEXT PRIMARY KEY,
        habit_id TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT,
        reason TEXT)`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_lo_habit_pauses_habit ON lo_habit_pauses (habit_id)`);
    },
  },
];

export async function runMigrations(db: Db): Promise<void> {
  const row = await db.getFirst<{ value: string }>(
    `SELECT value FROM lo_meta WHERE key = 'schema_version'`
  );
  let current = row ? Number(row.value) : SCHEMA_VERSION;

  if (!row) {
    await db.execute(
      `INSERT OR REPLACE INTO lo_meta (key, value) VALUES ('schema_version', ?)`,
      [String(SCHEMA_VERSION)],
      { tables: ['lo_meta'] }
    );
  }

  for (const m of MIGRATIONS) {
    if (m.to > current) {
      await m.run(db);
      await db.execute(
        `INSERT OR REPLACE INTO lo_meta (key, value) VALUES ('schema_version', ?)`,
        [String(m.to)],
        { tables: ['lo_meta'] }
      );
      current = m.to;
    }
  }
}
