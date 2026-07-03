/**
 * perfMonitor — lightweight in-app performance diagnostics (2026-07-02).
 *
 * WHY: the free-tier "laggy touch / dead buttons / screen stuck until tab
 * switch" bug has survived two static code reviews. This module makes the
 * device tell us what is actually stalling instead of us theorizing:
 *
 *   1. JS EVENT-LOOP STALLS — a 500 ms heartbeat measures scheduling drift.
 *      If a timer fires late by > 250 ms, the JS thread was busy/blocked for
 *      that long, which is exactly what makes taps feel dead. We record when
 *      and for how long.
 *   2. LOCAL DB TIMING — every localDb.getAll/getFirst/execute is timed by
 *      wrapping the singleton's methods. Ops slower than 30 ms are recorded
 *      with a SQL prefix. If screens hang on SQLite (lock contention, huge
 *      scans), it shows up here.
 *   3. NETWORK TIMING — axios interceptors record EVERY request (method, URL
 *      path, duration, status). A free-tier session should show almost zero
 *      requests; anything hot-looping or hanging toward its 15 s timeout is
 *      the smoking gun.
 *
 * Zero native modules — timers + monkey-patching only, so it is safe to start
 * at bundle eval (before first render) and capture the boot window where the
 * freeze lives. Overhead is negligible (Date.now() per op; capped ring
 * buffers). Surfaced via app/diagnostics.tsx (Profile → Diagnostics), which
 * can Share the full JSON report.
 *
 * This is a beta diagnostic: intentionally always-on and cheap. Remove or
 * dev-gate once the responsiveness bug is fixed and verified on-device.
 */

import { apiClient } from '../api/client';
import { localDb } from '../db/localDb';

// ---------------------------------------------------------------------------
// Event shapes + ring buffers
// ---------------------------------------------------------------------------

export interface StallEvent {
  /** epoch ms when the stall ENDED (heartbeat finally ran) */
  at: number;
  /** how late the heartbeat was, ms — i.e. how long JS was blocked */
  ms: number;
}

export interface DbEvent {
  at: number;
  ms: number;
  /** first 90 chars of the SQL, whitespace-collapsed */
  sql: string;
}

export interface NetEvent {
  at: number;
  ms: number;
  method: string;
  /** URL path only (no host, no query values) */
  url: string;
  /** HTTP status, or ERR:<code/message> for network failures/timeouts */
  status: number | string;
}

export interface PerfReport {
  startedAt: number;
  generatedAt: number;
  uptimeMs: number;
  totals: {
    dbOps: number;
    slowDbOps: number;
    netRequests: number;
    stalls: number;
    worstStallMs: number;
    worstDbMs: number;
  };
  /** worst-first, capped */
  stalls: StallEvent[];
  /** worst-first, capped */
  slowDb: DbEvent[];
  /** newest-first, capped — ALL requests, not just slow ones */
  net: NetEvent[];
}

const STALL_THRESHOLD_MS = 250;
const HEARTBEAT_MS = 500;
const DB_SLOW_MS = 30;
const CAP_STALLS = 100;
const CAP_DB = 100;
const CAP_NET = 150;

const startedAt = Date.now();
let stalls: StallEvent[] = [];
let slowDb: DbEvent[] = [];
let net: NetEvent[] = [];
let totalDbOps = 0;
let totalNet = 0;
let worstStallMs = 0;
let worstDbMs = 0;

function pushCapped<T>(arr: T[], item: T, cap: number): void {
  arr.push(item);
  if (arr.length > cap) arr.shift();
}

function collapseSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 90);
}

// ---------------------------------------------------------------------------
// 1. JS event-loop stall detector
// ---------------------------------------------------------------------------

let heartbeatStarted = false;

function startHeartbeat(): void {
  if (heartbeatStarted) return;
  heartbeatStarted = true;
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const drift = now - last - HEARTBEAT_MS;
    last = now;
    if (drift > STALL_THRESHOLD_MS) {
      if (drift > worstStallMs) worstStallMs = drift;
      pushCapped(stalls, { at: now, ms: drift }, CAP_STALLS);
    }
  }, HEARTBEAT_MS);
}

// ---------------------------------------------------------------------------
// 2. localDb timing — wrap the singleton's methods in place
// ---------------------------------------------------------------------------

let dbPatched = false;

function recordDb(ms: number, sql: string): void {
  totalDbOps++;
  if (ms > worstDbMs) worstDbMs = ms;
  if (ms >= DB_SLOW_MS) {
    pushCapped(slowDb, { at: Date.now(), ms, sql: collapseSql(sql) }, CAP_DB);
  }
}

function patchDb(): void {
  if (dbPatched) return;
  dbPatched = true;
  // The singleton is a plain object literal; replace methods with timed
  // wrappers that delegate. Generics collapse to unknown at the patch site —
  // callers keep their own typings through localDb's declared interface.
  const target = localDb as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  for (const method of ['getAll', 'getFirst', 'execute'] as const) {
    const orig = target[method];
    if (typeof orig !== 'function') continue;
    target[method] = async function timed(...args: unknown[]): Promise<unknown> {
      const t0 = Date.now();
      try {
        return await orig.apply(localDb, args);
      } finally {
        recordDb(Date.now() - t0, typeof args[0] === 'string' ? (args[0] as string) : method);
      }
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Network timing — axios interceptors on the shared apiClient
// ---------------------------------------------------------------------------

let netPatched = false;

/** Strip host + query so the report never leaks tokens or personal params. */
function pathOnly(url: string | undefined): string {
  if (!url) return '?';
  try {
    const noQuery = url.split('?')[0] ?? url;
    const m = noQuery.match(/^https?:\/\/[^/]+(\/.*)$/);
    const p = m && m[1] ? m[1] : noQuery;
    return p.slice(0, 80);
  } catch {
    return '?';
  }
}

function patchNet(): void {
  if (netPatched) return;
  netPatched = true;
  apiClient.interceptors.request.use((config) => {
    (config as { __pfStart?: number }).__pfStart = Date.now();
    return config;
  });
  apiClient.interceptors.response.use(
    (response) => {
      const cfg = response.config as { __pfStart?: number; method?: string; url?: string };
      totalNet++;
      pushCapped(
        net,
        {
          at: Date.now(),
          ms: cfg.__pfStart ? Date.now() - cfg.__pfStart : -1,
          method: (cfg.method || '?').toUpperCase(),
          url: pathOnly(cfg.url),
          status: response.status,
        },
        CAP_NET,
      );
      return response;
    },
    (error: unknown) => {
      const err = error as {
        config?: { __pfStart?: number; method?: string; url?: string };
        response?: { status?: number };
        code?: string;
        message?: string;
      };
      const cfg = err.config;
      totalNet++;
      pushCapped(
        net,
        {
          at: Date.now(),
          ms: cfg?.__pfStart ? Date.now() - cfg.__pfStart : -1,
          method: (cfg?.method || '?').toUpperCase(),
          url: pathOnly(cfg?.url),
          status: err.response?.status ?? `ERR:${err.code ?? err.message ?? 'unknown'}`.slice(0, 40),
        },
        CAP_NET,
      );
      return Promise.reject(error);
    },
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let started = false;

/** Idempotent. Call once at bundle eval (root layout module scope). */
export function startPerfMonitor(): void {
  if (started) return;
  started = true;
  try { startHeartbeat(); } catch { /* never break boot */ }
  try { patchDb(); } catch { /* never break boot */ }
  try { patchNet(); } catch { /* never break boot */ }
}

export function getPerfReport(): PerfReport {
  const now = Date.now();
  return {
    startedAt,
    generatedAt: now,
    uptimeMs: now - startedAt,
    totals: {
      dbOps: totalDbOps,
      slowDbOps: slowDb.length,
      netRequests: totalNet,
      stalls: stalls.length,
      worstStallMs,
      worstDbMs,
    },
    stalls: [...stalls].sort((a, b) => b.ms - a.ms),
    slowDb: [...slowDb].sort((a, b) => b.ms - a.ms),
    net: [...net].reverse(),
  };
}

export function clearPerfReport(): void {
  stalls = [];
  slowDb = [];
  net = [];
  totalDbOps = 0;
  totalNet = 0;
  worstStallMs = 0;
  worstDbMs = 0;
}
