/**
 * localDb — reactive, lightweight offline SQLite store (expo-sqlite async API).
 *
 * This is the on-device data layer that replaces the PowerSync stub
 * (src/db/powerSyncClient.ts). It provides the same query/watch surface the app
 * already depends on (getAll / getFirst / execute / watch) backed by a real
 * SQLite database plus an in-process pub/sub so watch() reacts to local writes.
 *
 * There is no native sync engine here: mutations are persisted locally and an
 * `outbox` table (see localSchema.ts) records pending ops for a separate sync
 * worker to drain when connectivity returns.
 *
 * Reactivity model:
 *   - execute() runs a write, then notify()s the affected table names.
 *   - watch() is an async generator that yields once immediately, then once per
 *     notify() that touches a table it cares about. Callers re-run getAll()
 *     themselves after each yield (the sql/params args are accepted only for API
 *     compatibility with the old PowerSync watch signature).
 *
 * Schema migrations (v2+): after v1 base statements are applied, runMigrations()
 * from migrations.ts is called to apply any pending schema versions.
 */

import * as SQLite from 'expo-sqlite';
import { SCHEMA_STATEMENTS } from './localSchema';
import { runMigrations } from './migrations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChangeListener = (tables: Set<string>) => void;

// ---------------------------------------------------------------------------
// genId — RFC4122 v4 UUID.
//
// Prefers the CSPRNG via global crypto.getRandomValues() (available in RN
// 0.73+ via Hermes / JavaScriptCore). Falls back to Math.random() only when
// the global is absent (e.g. some Jest environments without setup).  The
// signature is unchanged; callers do not need updating.
// ---------------------------------------------------------------------------

export function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Set version bits (v4) and variant bits (RFC4122).
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return (
      hex.slice(0, 8) + '-' +
      hex.slice(8, 12) + '-' +
      hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' +
      hex.slice(20)
    );
  }
  // Fallback: Math.random() — acceptable only in environments without crypto.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// WatchToken - explicit cancellation for watch() consumers (2026-07-03).
//
// WHY: watch() parks between yields on an internal `await new Promise(...)`.
// Neither generator.return() nor .throw() can interrupt an in-flight await -
// they queue until the generator next reaches a yield. So a consumer that
// merely sets a boolean on unmount leaves the subscription registered until
// the NEXT matching table write (a leak window; with effect re-subscription
// churn these accumulated and every sets-write fanned out to zombie watchers -
// found in the free-tier responsiveness audit). cancel() wakes the parked
// watcher immediately so it exits its loop and unsubscribes deterministically.
// ---------------------------------------------------------------------------

export interface WatchToken {
  cancelled: boolean;
  cancel: () => void;
  /** internal - wakes the parked watcher; wired up by watch() itself. */
  _fire: (() => void) | null;
}

export function makeWatchToken(): WatchToken {
  const token: WatchToken = {
    cancelled: false,
    _fire: null,
    cancel() {
      token.cancelled = true;
      token._fire?.();
    },
  };
  return token;
}

// ---------------------------------------------------------------------------
// Internal module state
// ---------------------------------------------------------------------------

let dbHandle: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<void> | null = null;
const listeners = new Set<ChangeListener>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort extraction of the affected table name(s) from a write statement.
 * Used when execute() is called without an explicit opts.tables override.
 */
function parseAffectedTables(sql: string): string[] {
  const tables = new Set<string>();
  const re =
    /(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+["'`[]?([A-Za-z_][A-Za-z0-9_]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    if (match[1]) tables.add(match[1]);
  }
  return Array.from(tables);
}

/**
 * Ensure the DB is open, the v1 schema applied, and migrations run.
 * Idempotent: concurrent callers share a single init promise.
 *
 * A rejected init is NOT cached: initPromise is reset to null on failure so a
 * later call can retry (one transient SQLite open/DDL error must not brick all
 * local data until app restart).
 */
async function ensureInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = doInit().catch((err) => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

async function doInit(): Promise<void> {
  const handle = await SQLite.openDatabaseAsync('peak_fettle.db');
  // PERF (2026-07-03 free-tier audit): WAL + busy_timeout. The default rollback
  // journal serializes every reader behind any writer on this single shared
  // connection, so one long scan (e.g. the free-tier auto-backup's full-table
  // SELECTs) convoyed every screen's mount queries. WAL lets readers proceed
  // concurrently and persists per-DB-file; busy_timeout waits briefly instead
  // of failing on transient contention. Best-effort - never blocks init.
  try {
    await handle.execAsync('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  } catch {
    // Non-fatal: defaults still function.
  }
  // Apply base v1 statements (idempotent CREATE TABLE IF NOT EXISTS).
  for (const stmt of SCHEMA_STATEMENTS) {
    await handle.execAsync(stmt);
  }
  dbHandle = handle;

  // CRITICAL: the pre-migration snapshot and the migration runner must NOT be
  // routed through the public `localDb` singleton. Every localDb method awaits
  // ensureInit(), which is still pending here, so passing `localDb` re-enters
  // this same unsettled initPromise and deadlocks forever (a hang, not a
  // rejection — so the "best-effort, never blocks" guards never fire). Pass a
  // thin handle-bound shim instead; dbHandle is already set above.
  const rawDb = {
    getAll: <T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> =>
      handle.getAllAsync<T>(sql, params as SQLite.SQLiteBindValue[]),
    getFirst: <T = unknown>(
      sql: string,
      params: unknown[] = []
    ): Promise<T | null> =>
      handle.getFirstAsync<T>(sql, params as SQLite.SQLiteBindValue[]),
    execute: async (sql: string, params: unknown[] = []): Promise<void> => {
      await handle.runAsync(sql, params as SQLite.SQLiteBindValue[]);
    },
  };

  // Run pending schema migrations (v2+).
  // buildBackup is imported lazily to avoid circular deps at module load time.
  let buildBackup: (() => Promise<string>) | undefined;
  try {
    const { buildBackupFromDb } = await import('../data/backup/exportEngine');
    buildBackup = async () => {
      const doc = await buildBackupFromDb(rawDb);
      return JSON.stringify(doc);
    };
  } catch {
    // exportEngine unavailable in test stubs — proceed without snapshot.
  }
  await runMigrations(rawDb, buildBackup);
}

function getHandle(): SQLite.SQLiteDatabase {
  if (!dbHandle) {
    // Should never happen: every public method awaits ensureInit() first.
    throw new Error('[localDb] database not initialised');
  }
  return dbHandle;
}

// ---------------------------------------------------------------------------
// Public singleton
// ---------------------------------------------------------------------------

export const localDb = {
  async init(): Promise<void> {
    await ensureInit();
  },

  async getAll<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    await ensureInit();
    return getHandle().getAllAsync<T>(sql, params as SQLite.SQLiteBindValue[]);
  },

  async getFirst<T = unknown>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | null> {
    await ensureInit();
    return getHandle().getFirstAsync<T>(
      sql,
      params as SQLite.SQLiteBindValue[]
    );
  },

  async execute(
    sql: string,
    params: unknown[] = [],
    opts?: { tables?: string[] }
  ): Promise<void> {
    await ensureInit();
    await getHandle().runAsync(sql, params as SQLite.SQLiteBindValue[]);
    const tables = opts?.tables ?? parseAffectedTables(sql);
    if (tables.length > 0) {
      localDb.notify(tables);
    }
  },

  /**
   * Reactive watcher. Yields once immediately, then once per notify() that
   * matches opts.tables (or any table if opts.tables is omitted). The sql/params
   * are accepted for API compatibility but are NOT executed here — callers
   * re-run getAll() after each yield.
   */
  async *watch(
    _sql: string,
    _params?: unknown[],
    opts?: { tables?: Set<string>; token?: WatchToken }
  ): AsyncGenerator<void> {
    await ensureInit();

    const watched = opts?.tables;
    const token = opts?.token;
    const matches = (changed: Set<string>): boolean => {
      if (!watched || watched.size === 0) return true;
      for (const t of changed) {
        if (watched.has(t)) return true;
      }
      return false;
    };

    // Promise-resolver queue: a relevant notify() resolves the current wait.
    let resolveNext: (() => void) | null = null;
    let pending = false;

    // Wakes the parked loop below - shared by the notify listener and the
    // cancellation token so cancel() releases the in-flight await immediately.
    const wake = (): void => {
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r();
      }
    };
    if (token) token._fire = wake;

    const listener: ChangeListener = (changed) => {
      if (!matches(changed)) return;
      pending = true;
      wake();
    };

    const unsubscribe = localDb.subscribe(listener);

    try {
      if (token?.cancelled) return;
      // Yield once immediately on entry.
      yield;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (token?.cancelled) return;
        if (!pending) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }
        if (token?.cancelled) return;
        pending = false;
        yield;
      }
    } finally {
      // Cleaned up on loop exit (cancel/return) or throw - ALWAYS unsubscribes.
      unsubscribe();
      resolveNext = null;
      if (token) token._fire = null;
    }
  },

  subscribe(listener: ChangeListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  notify(tables: string[]): void {
    if (tables.length === 0) return;
    const set = new Set(tables);
    // Snapshot so a listener that unsubscribes mid-iteration is safe.
    for (const listener of Array.from(listeners)) {
      listener(set);
    }
  },
};
