/**
 * Focus/blocker data layer (TICKET-104, extended TICKET-162/163). Configs +
 * the local friction-event log. Device-scoped (excluded from backup):
 * FamilyActivitySelection tokens are not portable across devices by OS design.
 *
 * TICKET-162 (data half): per-rule unlock intervention lives in the EXISTING
 * friction_json config blob — no schema change, no new tables/columns.
 * TICKET-163: reclaimedToday() feeds the Focus tab hero.
 *
 * Every DB write below is safeWrite-wrapped (frozen contract, src/lib/
 * feedback.ts) so failures toast instead of throwing — same pattern as
 * src/data/habits.ts.
 */

import { dayKey, genId, localDb } from '../db/localDb';
import { FRICTION_DEFAULTS } from '../config/product';
import { safeWrite } from '../lib/feedback';
import { liveActivity } from '../../modules/live-activity';

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

/** Unlock-friction intervention shown on repeat attempts (TICKET-162). */
export type InterventionKind = 'breathing' | 'typed_intention' | 'hold_the_dot' | 'reflection';

export const INTERVENTION_LABELS: Record<InterventionKind, string> = {
  breathing: 'Breathing pause',
  typed_intention: 'Type your intention',
  hold_the_dot: 'Hold the dot',
  reflection: 'Reflection prompt',
};

export interface FrictionConfig {
  waitLadderSec: number[];
  breathingFromAttempt: number;
  snoozeBudget: number;
  grantWindowMin: number;
  /** Which unlock intervention this rule uses (TICKET-162). */
  intervention: InterventionKind;
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
    intervention: 'breathing',
  };
}

export async function createFocusConfig(input: {
  kind: FocusKind;
  name: string;
  schedule: FocusSchedule;
  friction?: FrictionConfig;
}): Promise<string> {
  const id = genId();
  // id generated up front so a Promise<string> can always be returned, even
  // if safeWrite swallows a failure below (it has already toasted by then) —
  // same pattern as habits.createHabit.
  await safeWrite(
    () =>
      localDb.execute(
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
      ),
    { context: 'focus.createFocusConfig' }
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
  await safeWrite(
    () => localDb.execute(`UPDATE lo_focus_configs SET enabled = ? WHERE id = ?`, [enabled ? 1 : 0, id]),
    { context: 'focus.setFocusEnabled' }
  );
}

export async function setSelectionToken(id: string, token: string | null): Promise<void> {
  await safeWrite(
    () => localDb.execute(`UPDATE lo_focus_configs SET selection_token = ? WHERE id = ?`, [token, id]),
    { context: 'focus.setSelectionToken' }
  );
}

export async function deleteFocusConfig(id: string): Promise<void> {
  await safeWrite(() => localDb.execute(`DELETE FROM lo_focus_configs WHERE id = ?`, [id]), {
    context: 'focus.deleteFocusConfig',
  });
}

/**
 * Merge-patch a rule's friction config (TICKET-162): reads the row's current
 * friction_json, merges `{ ...defaultFriction(), ...parsed, ...patch }` (so a
 * partial patch like `{ intervention: 'reflection' }` never drops other
 * fields, and a missing/legacy row without `intervention` still gets one),
 * and writes it back.
 */
export async function updateFriction(id: string, patch: Partial<FrictionConfig>): Promise<void> {
  await safeWrite(
    async () => {
      const row = await localDb.getFirst<{ friction_json: string }>(
        `SELECT friction_json FROM lo_focus_configs WHERE id = ?`,
        [id]
      );
      let parsed: Partial<FrictionConfig> = {};
      try {
        parsed = row?.friction_json ? (JSON.parse(row.friction_json) as Partial<FrictionConfig>) : {};
      } catch {
        parsed = {};
      }
      const merged: FrictionConfig = { ...defaultFriction(), ...parsed, ...patch };
      await localDb.execute(`UPDATE lo_focus_configs SET friction_json = ? WHERE id = ?`, [
        JSON.stringify(merged),
        id,
      ]);
    },
    { context: 'focus.updateFriction' }
  );
}

// --- friction events (local telemetry → insights) ----------------------------------

// WIDGET CONTRACT (TICKET-116, mirrored in src/services/widgetBridge.ts):
//   • The widget "blocks held" count reads `'unlock_abandoned'` events (same kind
//     insights.ts counts) — keep that the canonical block-held kind.
//   • The widget "reclaimed minutes" sums `meta.minutes` on today's focus events,
//     so when wiring the focus flow (TICKET-104) pass `meta.minutes` on the
//     session-end / block-held emits (e.g. logFocusEvent('session_ended', { minutes })).
export type FocusEventKind =
  | 'shield_shown'
  | 'unlock_started'
  | 'unlock_completed'
  | 'unlock_abandoned' // "block held" — the Opal-style win metric (widget + insights)
  | 'snooze_used'
  | 'session_started'
  | 'session_ended';

export async function logFocusEvent(kind: FocusEventKind, meta: Record<string, unknown> = {}): Promise<void> {
  await safeWrite(
    () =>
      localDb.execute(`INSERT INTO lo_focus_events (id, ts, kind, meta_json) VALUES (?, ?, ?, ?)`, [
        genId(),
        new Date().toISOString(),
        kind,
        JSON.stringify(meta),
      ]),
    { context: 'focus.logFocusEvent' }
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

/**
 * Today's reclaimed time for the Focus tab hero (TICKET-163):
 *   - totalMinutes: sum of numeric `meta.minutes` across ALL of today's
 *     events (mirrors the widget contract comment above — any event kind
 *     carrying `meta.minutes` counts, so future emitters aren't silently
 *     excluded from the hero the way the widget deliberately allowlists kinds).
 *   - blocksHeld: count of 'unlock_abandoned' events today (canonical metric).
 *   - hourly: 24 buckets of minutes, indexed by the LOCAL hour of each event's ts.
 */
export async function reclaimedToday(): Promise<{ totalMinutes: number; blocksHeld: number; hourly: number[] }> {
  const events = await focusEventsSince(`${dayKey()}T00:00:00`);
  let totalMinutes = 0;
  let blocksHeld = 0;
  const hourly = new Array(24).fill(0) as number[];

  for (const e of events) {
    if (e.kind === 'unlock_abandoned') blocksHeld += 1;

    let minutes = 0;
    try {
      const meta = JSON.parse(e.meta_json) as { minutes?: unknown };
      const n = Number(meta.minutes);
      if (Number.isFinite(n) && n > 0) minutes = n;
    } catch {
      // malformed meta — contributes 0
    }

    if (minutes > 0) {
      totalMinutes += minutes;
      const localHour = new Date(e.ts).getHours();
      if (localHour >= 0 && localHour < 24) hourly[localHour] += minutes;
    }
  }

  return { totalMinutes: Math.round(totalMinutes), blocksHeld, hourly };
}

// --- Focus session lifecycle (TICKET-118) ------------------------------------
// Keeps lo_meta.active_focus (the Focus-status widget contract, TICKET-116) and
// the ActivityKit Live Activity in sync: set on start, clear on end. The widget
// works from lo_meta.active_focus even when the native Live Activity is absent.

export async function startFocusSession(name: string, endsAtISO: string, accentHex = '#F2A93B'): Promise<void> {
  await safeWrite(
    async () => {
      // Additive `startedAt` field (TICKET-163): do NOT rename name/endsAt —
      // widget contract reads those exact keys.
      await localDb.execute(
        `INSERT OR REPLACE INTO lo_meta (key, value) VALUES ('active_focus', ?)`,
        [JSON.stringify({ name, endsAt: endsAtISO, startedAt: new Date().toISOString() })],
        { tables: ['lo_meta'] }
      );
      liveActivity.start(name, endsAtISO, accentHex);
    },
    { context: 'focus.startFocusSession' }
  );
}

export async function endFocusSession(): Promise<void> {
  await safeWrite(
    async () => {
      // Read active_focus BEFORE clearing it so we can emit a session_ended
      // event with the elapsed minutes (TICKET-163 hero feed). Skip the emit
      // entirely if startedAt is absent/unparseable — never guess a duration.
      const row = await localDb.getFirst<{ value: string }>(`SELECT value FROM lo_meta WHERE key = 'active_focus'`);
      let minutes: number | null = null;
      if (row?.value) {
        try {
          const active = JSON.parse(row.value) as { startedAt?: string; endsAt?: string };
          if (active.startedAt) {
            const started = new Date(active.startedAt).getTime();
            if (Number.isFinite(started)) {
              const cap = active.endsAt ? new Date(active.endsAt).getTime() : NaN;
              const now = Date.now();
              const clampedEnd = Number.isFinite(cap) ? Math.min(now, cap) : now;
              const elapsedMs = Math.max(0, clampedEnd - started);
              minutes = Math.floor(elapsedMs / 60_000);
            }
          }
        } catch {
          minutes = null;
        }
      }

      await localDb.execute(`DELETE FROM lo_meta WHERE key = 'active_focus'`, [], { tables: ['lo_meta'] });
      liveActivity.end();

      if (minutes != null) {
        await logFocusEvent('session_ended', { minutes });
      }
    },
    { context: 'focus.endFocusSession' }
  );
}

/** Push an updated blocks-held count to a running Live Activity (no DB write). */
export async function updateFocusSessionBlocks(blocksHeld: number, endsAtISO: string | null = null): Promise<void> {
  liveActivity.update(blocksHeld, endsAtISO);
}

/** End time (ISO) for a session config, or null if it has no fixed end (e.g. a limit). */
export function computeSessionEndsAt(cfg: FocusConfigRow, now: Date = new Date()): string | null {
  try {
    const s = JSON.parse(cfg.schedule_json) as FocusSchedule;
    if (s.durationMin != null) {
      return new Date(now.getTime() + s.durationMin * 60_000).toISOString();
    }
    if (s.endHHMM) {
      const [h, m] = s.endHHMM.split(':').map(Number);
      const end = new Date(now);
      end.setHours(h, m, 0, 0);
      return end.getTime() > now.getTime() ? end.toISOString() : null;
    }
  } catch {
    // fall through
  }
  return null;
}
