/**
 * Focus/blocker data layer (TICKET-104). Configs + the local friction-event
 * log. Device-scoped (excluded from backup): FamilyActivitySelection tokens
 * are not portable across devices by OS design.
 */

import { dayKey, genId, localDb } from '../db/localDb';
import { FRICTION_DEFAULTS } from '../config/product';

export type FocusKind = 'session' | 'limit' | 'focus_now';

export interface FocusSchedule {
  /** session: days 0–6 (Sun–Sat) + window */
  days?: number[];
  startHHMM?: string;
  endHHMM?: string;
  /** limit: minutes/day before shield */
  dailyLimitMin?: number;
  /** focus_now: duration minutes */
  durationMin?: number;
}

export interface FrictionConfig {
  waitLadderSec: number[];
  breathingFromAttempt: number;
  snoozeBudget: number;
  grantWindowMin: number;
}

export interface FocusConfigRow {
  id: string;
  kind: FocusKind;
  name: string;
  schedule_json: string;
  selection_token: string | null;
  friction_json: string;
  enabled: number;
  created_at: string;
}

export function defaultFriction(): FrictionConfig {
  return {
    waitLadderSec: [...FRICTION_DEFAULTS.waitLadderSec],
    breathingFromAttempt: FRICTION_DEFAULTS.breathingFromAttempt,
    snoozeBudget: FRICTION_DEFAULTS.snoozeBudget,
    grantWindowMin: FRICTION_DEFAULTS.grantWindowMin,
  };
}

export async function createFocusConfig(input: {
  kind: FocusKind;
  name: string;
  schedule: FocusSchedule;
  friction?: FrictionConfig;
}): Promise<string> {
  const id = genId();
  await localDb.execute(
    `INSERT INTO lo_focus_configs (id, kind, name, schedule_json, friction_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.kind,
      input.name,
      JSON.stringify(input.schedule),
      JSON.stringify(input.friction ?? defaultFriction()),
      new Date().toISOString(),
    ]
  );
  return id;
}

export async function listFocusConfigs(): Promise<FocusConfigRow[]> {
  return localDb.getAll<FocusConfigRow>(`SELECT * FROM lo_focus_configs ORDER BY created_at ASC`);
}

export async function getFocusConfig(id: string): Promise<FocusConfigRow | null> {
  return localDb.getFirst<FocusConfigRow>(`SELECT * FROM lo_focus_configs WHERE id = ?`, [id]);
}

export async function setFocusEnabled(id: string, enabled: boolean): Promise<void> {
  await localDb.execute(`UPDATE lo_focus_configs SET enabled = ? WHERE id = ?`, [enabled ? 1 : 0, id]);
}

export async function setSelectionToken(id: string, token: string | null): Promise<void> {
  await localDb.execute(`UPDATE lo_focus_configs SET selection_token = ? WHERE id = ?`, [token, id]);
}

export async function deleteFocusConfig(id: string): Promise<void> {
  await localDb.execute(`DELETE FROM lo_focus_configs WHERE id = ?`, [id]);
}

// --- friction events (local telemetry → insights) ----------------------------------

export type FocusEventKind =
  | 'shield_shown'
  | 'unlock_started'
  | 'unlock_completed'
  | 'unlock_abandoned' // "block held" — the Opal-style win metric
  | 'snooze_used'
  | 'session_started'
  | 'session_ended';

export async function logFocusEvent(kind: FocusEventKind, meta: Record<string, unknown> = {}): Promise<void> {
  await localDb.execute(
    `INSERT INTO lo_focus_events (id, ts, kind, meta_json) VALUES (?, ?, ?, ?)`,
    [genId(), new Date().toISOString(), kind, JSON.stringify(meta)]
  );
}

export interface FocusEventRow {
  id: string;
  ts: string;
  kind: FocusEventKind;
  meta_json: string;
}

export async function focusEventsSince(isoTs: string): Promise<FocusEventRow[]> {
  return localDb.getAll<FocusEventRow>(
    `SELECT * FROM lo_focus_events WHERE ts >= ? ORDER BY ts ASC`,
    [isoTs]
  );
}

/** Unlock attempts already made today against a config (drives the escalating ladder). */
export async function unlockAttemptsToday(configId: string): Promise<number> {
  const today = dayKey();
  const row = await localDb.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM lo_focus_events
     WHERE kind = 'unlock_started' AND ts >= ? AND meta_json LIKE ?`,
    [`${today}T00:00:00`, `%${configId}%`]
  );
  return row?.n ?? 0;
}

export async function snoozesUsedToday(): Promise<number> {
  const today = dayKey();
  const row = await localDb.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM lo_focus_events WHERE kind = 'snooze_used' AND ts >= ?`,
    [`${today}T00:00:00`]
  );
  return row?.n ?? 0;
}
