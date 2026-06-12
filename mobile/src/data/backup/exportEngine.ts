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
 */

// Bumped whenever the on-device logical schema changes shape. Additive changes
// stay backward/forward compatible; a breaking change needs an up-migration in
// MIGRATIONS below.
export const BACKUP_SCHEMA_VERSION = 1;

// The on-device logical tables that hold personal data and exist TODAY. As the
// TICKET-094 data-layer move lands more tables (plans, routines, streaks, …),
// append them here — the engine serializes whatever is registered.
// `outbox` is sync bookkeeping, not user data, so it is intentionally excluded.
export const BACKUP_TABLES: string[] = ['workouts', 'sets', 'schedule', 'avatar', 'bodyweight', 'exercise_prefs'];

export type Row = Record<string, unknown>;
export type TableMap = Record<string, Row[]>;

export interface ExportDoc {
  format: 'peak-fettle-backup';
  schemaVersion: number;
  exportedAt: string; // ISO; excluded from the determinism canonical form
  tables: TableMap;
}

// Forward up-migrations keyed by the version they upgrade FROM. None needed yet
// (all changes so far are additive). Example for a future breaking change:
//   MIGRATIONS[1] = (t) => { /* reshape t.someTable */ return t; };
type Migration = (tables: TableMap) => TableMap;
const MIGRATIONS: Record<number, Migration> = {};

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

  // Normalize: keep only known tables, ensure arrays, registry order.
  let tables: TableMap = {};
  for (const t of BACKUP_TABLES) {
    const v = (doc.tables as TableMap)[t];
    tables[t] = Array.isArray(v) ? v : [];
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
 */
export async function restoreBackupToDb(db: MinimalDb, tables: TableMap): Promise<void> {
  for (const t of BACKUP_TABLES) {
    const rows = tables[t] ?? [];
    await db.execute(`DELETE FROM ${t}`, [], { tables: [t] });
    for (const row of rows) {
      const cols = Object.keys(row);
      if (cols.length === 0) continue;
      const placeholders = cols.map(() => '?').join(', ');
      const values = cols.map((c) => row[c] as unknown);
      await db.execute(
        `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`,
        values,
        { tables: [t] },
      );
    }
  }
}
