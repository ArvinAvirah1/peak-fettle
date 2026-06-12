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
  // { to: 2, run: async (db) => { await db.execute('ALTER TABLE lo_habits ADD COLUMN color TEXT'); } },
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
