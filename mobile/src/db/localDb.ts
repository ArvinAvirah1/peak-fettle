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
 */

import * as SQLite from 'expo-sqlite';
import { SCHEMA_STATEMENTS } from './localSchema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChangeListener = (tables: Set<string>) => void;

// ---------------------------------------------------------------------------
// genId — RFC4122-ish v4 UUID using Math.random (no native crypto).
// ---------------------------------------------------------------------------

export function genId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
 * Ensure the DB is open and the schema applied. Idempotent: concurrent callers
 * share a single init promise.
 */
async function ensureInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const handle = await SQLite.openDatabaseAsync('peak_fettle.db');
    for (const stmt of SCHEMA_STATEMENTS) {
      await handle.execAsync(stmt);
    }
    dbHandle = handle;
  })();
  return initPromise;
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
    opts?: { tables?: Set<string> }
  ): AsyncGenerator<void> {
    await ensureInit();

    const watched = opts?.tables;
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

    const listener: ChangeListener = (changed) => {
      if (!matches(changed)) return;
      pending = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r();
      }
    };

    const unsubscribe = localDb.subscribe(listener);

    try {
      // Yield once immediately on entry.
      yield;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (!pending) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }
        pending = false;
        yield;
      }
    } finally {
      // Cleaned up when the generator is returned (loop break) or thrown.
      unsubscribe();
      resolveNext = null;
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
