/**
 * Share-events data module — TICKET-120.
 *
 * Reads/writes the lo_share_events table (created in migrations v2,
 * TICKET-119). Local-first: no server calls, no network dependency.
 *
 * Schema:
 *   id TEXT PRIMARY KEY, kind TEXT, ref TEXT, ts TEXT NOT NULL
 *
 * For milestone share events:
 *   kind = 'milestone'
 *   ref  = '<streak>:<n>'  e.g. 'streak:66'
 */

import { genId, localDb } from '../../db/localDb';

export interface ShareEventRow {
  id: string;
  kind: string;
  ref: string | null;
  ts: string;
}

/** Log a milestone share event. Fires-and-forgets; errors are non-fatal. */
export async function logMilestoneShareEvent(streakCount: number): Promise<void> {
  const id = genId();
  const ts = new Date().toISOString();
  const ref = `streak:${streakCount}`;
  await localDb.execute(
    `INSERT INTO lo_share_events (id, kind, ref, ts) VALUES (?, ?, ?, ?)`,
    [id, 'milestone', ref, ts],
    { tables: ['lo_share_events'] }
  );
}

/**
 * Count all milestone share events — used by the Insights tab to show
 * "X milestones shared" without any personal REST call.
 */
export async function countMilestoneShareEvents(): Promise<number> {
  const row = await localDb.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM lo_share_events WHERE kind = 'milestone'`
  );
  return row?.n ?? 0;
}

/** List the N most recent milestone share events (for a future history view). */
export async function recentMilestoneShareEvents(limit = 20): Promise<ShareEventRow[]> {
  return localDb.getAll<ShareEventRow>(
    `SELECT id, kind, ref, ts FROM lo_share_events WHERE kind = 'milestone' ORDER BY ts DESC LIMIT ?`,
    [limit]
  );
}
