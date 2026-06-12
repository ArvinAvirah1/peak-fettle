/**
 * localDb — reactive offline SQLite store for Life OS (expo-sqlite async API).
 *
 * Same surface as mobile/src/db/localDb.ts (getAll / getFirst / execute /
 * watch / subscribe / notify) so cross-app contributors carry one mental
 * model. Local SQLite is the source of truth; the only server interactions
 * are auth, the entitlement flag, and opaque encrypted backup blobs.
 */

import * as SQLite from 'expo-sqlite';
import { SCHEMA_STATEMENTS } from './localSchema';
import { runMigrations } from './migrations';
import { seedExercisesIfEmpty } from '../content/exercises';

type ChangeListener = (tables: Set<string>) => void;

export function genId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Local-date key (YYYY-MM-DD) in the device timezone. */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

let dbHandle: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<void> | null = null;
const listeners = new Set<ChangeListener>();

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

async function ensureInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const handle = await SQLite.openDatabaseAsync('lifeos.db');
    for (const stmt of SCHEMA_STATEMENTS) {
      await handle.execAsync(stmt);
    }
    dbHandle = handle;
    await runMigrations(localDb);
    await seedExercisesIfEmpty(localDb);
  })();
  return initPromise;
}

function getHandle(): SQLite.SQLiteDatabase {
  if (!dbHandle) {
    throw new Error('[lifeos.localDb] database not initialised');
  }
  return dbHandle;
}

export const localDb = {
  async init(): Promise<void> {
    await ensureInit();
  },

  async getAll<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    await ensureInit();
    return getHandle().getAllAsync<T>(sql, params as SQLite.SQLiteBindValue[]);
  },

  async getFirst<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    await ensureInit();
    return getHandle().getFirstAsync<T>(sql, params as SQLite.SQLiteBindValue[]);
  },

  async execute(sql: string, params: unknown[] = [], opts?: { tables?: string[] }): Promise<void> {
    await ensureInit();
    await getHandle().runAsync(sql, params as SQLite.SQLiteBindValue[]);
    const tables = opts?.tables ?? parseAffectedTables(sql);
    if (tables.length > 0) {
      localDb.notify(tables);
    }
  },

  /**
   * Reactive watcher: yields once immediately, then once per notify() touching
   * a watched table. Callers re-run their own getAll() after each yield.
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
    for (const listener of Array.from(listeners)) {
      listener(set);
    }
  },
};
