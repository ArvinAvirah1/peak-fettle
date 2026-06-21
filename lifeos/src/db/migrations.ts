/**
 * Versioned schema migrations for the Life OS local DB.
 *
 * Lesson encoded from the fitness app (memory: workout-routine-link — a
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
    // TICKET-119 schema v2 — additive tables for the four optional v3 features.
    // CREATE ... IF NOT EXISTS keeps it idempotent + drift-tolerant (CLAUDE.md #4).
    // lo_app_ratings is intentionally NOT in BACKUP_TABLES (keyed to device-scoped
    // FamilyActivity tokens — re-tag on restore, same rule as lo_focus_configs).
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
        share_scope_json TEXT NOT NULL DEFAULT '{}', paused INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL)`);
      await db.execute(`CREATE TABLE IF NOT EXISTS lo_affirmations (
        id TEXT PRIMARY KEY, text TEXT NOT NULL, identity_tag TEXT,
        enabled INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'user')`);
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
