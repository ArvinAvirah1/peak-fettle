/**
 * Backup document builder (TICKET-101 #5) — pure export/restore layer over
 * BACKUP_TABLES, mirroring mobile/src/data/backup/exportEngine.ts. The
 * encryption + blob transport reuse the fitness app's 094B engine and the
 * existing /user/backup-blob server route; this module stays crypto-free so
 * it's unit-testable.
 *
 * Device-scoped tables (lo_focus_configs, lo_focus_events) are intentionally
 * excluded: FamilyActivitySelection tokens are not portable across devices —
 * the restore flow ends with a "re-pick your blocked apps" step.
 */

import { BACKUP_TABLES } from '../db/localSchema';
import type { localDb as LocalDbType } from '../db/localDb';

export const LIFEOS_BACKUP_SCHEMA_VERSION = 1;

export type TableMap = Record<string, unknown[]>;

export interface LifeOsExportDoc {
  format: 'lifeos-backup';
  schemaVersion: number;
  exportedAt: string;
  tables: TableMap;
}

export function makeExportDoc(tables: TableMap, now: Date = new Date()): LifeOsExportDoc {
  const ordered: TableMap = {};
  for (const t of BACKUP_TABLES) {
    ordered[t] = Array.isArray(tables[t]) ? tables[t] : [];
  }
  return {
    format: 'lifeos-backup',
    schemaVersion: LIFEOS_BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    tables: ordered,
  };
}

/** Stable stringify (registry order) for signing/encryption downstream. */
export function canonicalize(doc: LifeOsExportDoc): string {
  return JSON.stringify(doc);
}

export async function buildBackupFromDb(db: typeof LocalDbType): Promise<LifeOsExportDoc> {
  const tables: TableMap = {};
  for (const t of BACKUP_TABLES) {
    tables[t] = await db.getAll(`SELECT * FROM ${t}`);
  }
  return makeExportDoc(tables);
}

/**
 * Restore: wipes + reinserts every backup table inside the registry order.
 * Forward migrations slot in here when schemaVersion bumps (v1 has none).
 */
export async function restoreBackupToDb(db: typeof LocalDbType, backup: LifeOsExportDoc): Promise<void> {
  if (backup.format !== 'lifeos-backup') {
    throw new Error('[lifeos.backup] not a lifeos backup document');
  }
  if (backup.schemaVersion > LIFEOS_BACKUP_SCHEMA_VERSION) {
    throw new Error('[lifeos.backup] backup is from a newer app version — update the app first');
  }

  // SQLite can't parameterize identifiers; table names come from the static
  // BACKUP_TABLES whitelist, and column names from the (decrypted) document
  // are validated as plain identifiers before interpolation so a tampered
  // backup can't smuggle SQL (review finding 2026-06-12).
  const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
  for (const t of BACKUP_TABLES) {
    const rows = backup.tables[t];
    if (!Array.isArray(rows)) continue;
    await db.execute(`DELETE FROM ${t}`, [], { tables: [t] });
    for (const row of rows) {
      const record = row as Record<string, unknown>;
      const cols = Object.keys(record).filter((c) => IDENT.test(c));
      if (cols.length === 0) continue;
      const placeholders = cols.map(() => '?').join(', ');
      await db.execute(
        `INSERT OR REPLACE INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`,
        cols.map((c) => record[c]),
        { tables: [t] }
      );
    }
  }
}
