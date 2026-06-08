/**
 * schedule — TICKET-097 (Phase 1: data model + next-up resolver)
 *
 * A training split stored ON-DEVICE (local-first, per TICKET-094). Two modes:
 *   • 'cycle'  — an ordered list of slots that repeats (Push A → Pull A → Push B
 *                → Legs …). Same-type days map to DIFFERENT routines (A/B/C are
 *                just distinct routineIds). A `position` pointer marks the next
 *                slot. Advancement (Phase 1) is on START of a slot — documented
 *                below; the founder may switch to completion-based later (the
 *                advance fn is isolated).
 *   • 'weekly' — a fixed weekday → slot map (index 0=Sun … 6=Sat). Advancement is
 *                by the calendar, so the resolver derives "next up" from the date.
 *
 * A slot maps to a routine (routineId) or is a rest day (routineId === null).
 *
 * Persistence: a single row (id='active') in the on-device `schedule` table
 * (see localSchema.ts). The whole config is stored as JSON so it round-trips
 * through the TICKET-094 schema-versioned backup unchanged.
 *
 * The `resolveNextUp` function is the SHARED resolver used by the app today and
 * by the lock/home-screen widgets later (TICKET-097 Phase 2) — keep it pure.
 */

import { localDb } from '../db/localDb';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduleMode = 'cycle' | 'weekly';

export interface ScheduleSlot {
  /** Target routine id, or null for a rest day. */
  routineId: string | null;
  /** Denormalized routine name for display (routines are local-first too). */
  routineName?: string;
}

export interface Schedule {
  mode: ScheduleMode;
  /** Ordered slots for 'cycle' mode. */
  cycle: ScheduleSlot[];
  /** Pointer into `cycle` for the next slot to do. */
  position: number;
  /** 7 entries, index 0=Sun … 6=Sat, for 'weekly' mode. null = rest/unset. */
  weekly: (ScheduleSlot | null)[];
  updatedAt: string;
}

export interface NextUp {
  slot: ScheduleSlot;
  /** 'Next up' (cycle) or 'Today' / 'Tomorrow' / weekday name (weekly). */
  whenLabel: string;
  isRest: boolean;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function emptySchedule(mode: ScheduleMode = 'cycle'): Schedule {
  return {
    mode,
    cycle: [],
    position: 0,
    weekly: [null, null, null, null, null, null, null],
    updatedAt: new Date().toISOString(),
  };
}

/** Normalize a parsed/partial object into a complete Schedule (defensive). */
export function normalizeSchedule(raw: Partial<Schedule> | null | undefined): Schedule {
  const base = emptySchedule(raw?.mode === 'weekly' ? 'weekly' : 'cycle');
  if (!raw) return base;
  const cycle = Array.isArray(raw.cycle)
    ? raw.cycle.map((s) => ({ routineId: s?.routineId ?? null, routineName: s?.routineName }))
    : [];
  const weekly: (ScheduleSlot | null)[] = base.weekly.slice();
  if (Array.isArray(raw.weekly)) {
    for (let i = 0; i < 7; i++) {
      const s = raw.weekly[i];
      weekly[i] = s ? { routineId: s.routineId ?? null, routineName: s.routineName } : null;
    }
  }
  const position = Number.isInteger(raw.position) ? (raw.position as number) : 0;
  return {
    mode: raw.mode === 'weekly' ? 'weekly' : 'cycle',
    cycle,
    position: cycle.length > 0 ? ((position % cycle.length) + cycle.length) % cycle.length : 0,
    weekly,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Persistence (on-device SQLite, single row id='active')
// ---------------------------------------------------------------------------

const ROW_ID = 'active';

export async function loadSchedule(): Promise<Schedule | null> {
  try {
    const row = await localDb.getFirst<{ data: string }>(
      'SELECT data FROM schedule WHERE id = ?',
      [ROW_ID],
    );
    if (!row?.data) return null;
    return normalizeSchedule(JSON.parse(row.data) as Partial<Schedule>);
  } catch {
    return null;
  }
}

export async function saveSchedule(schedule: Schedule): Promise<void> {
  const s = normalizeSchedule(schedule);
  s.updatedAt = new Date().toISOString();
  const json = JSON.stringify(s);
  await localDb.execute(
    `INSERT INTO schedule (id, mode, data, position, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, data = excluded.data,
       position = excluded.position, updated_at = excluded.updated_at`,
    [ROW_ID, s.mode, json, s.position, s.updatedAt],
    { tables: ['schedule'] },
  );
}

// ---------------------------------------------------------------------------
// Shared resolver (pure) — used by the app AND the future widgets.
// ---------------------------------------------------------------------------

/** The slot that's up next, with a human label. null when nothing is scheduled. */
export function resolveNextUp(schedule: Schedule | null, now: Date = new Date()): NextUp | null {
  if (!schedule) return null;

  if (schedule.mode === 'weekly') {
    const today = now.getDay();
    // Find the next day (starting today) that has a non-rest routine.
    for (let offset = 0; offset < 7; offset++) {
      const idx = (today + offset) % 7;
      const slot = schedule.weekly[idx];
      if (slot && slot.routineId) {
        const whenLabel = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : (WEEKDAY_SHORT[idx] ?? 'Soon');
        return { slot, whenLabel, isRest: false };
      }
    }
    // Everything is rest/unset → show today as a rest day.
    return { slot: schedule.weekly[today] ?? { routineId: null }, whenLabel: 'Today', isRest: true };
  }

  // cycle
  if (schedule.cycle.length === 0) return null;
  const pos = ((schedule.position % schedule.cycle.length) + schedule.cycle.length) % schedule.cycle.length;
  const slot = schedule.cycle[pos];
  if (!slot) return null;
  return { slot, whenLabel: 'Next up', isRest: !slot.routineId };
}

/**
 * Advance the cycle pointer by one (wrapping). No-op for weekly schedules
 * (those advance by the calendar). Phase 1 calls this when a slot is STARTED.
 */
export function advanceCycle(schedule: Schedule): Schedule {
  if (schedule.mode !== 'cycle' || schedule.cycle.length === 0) return schedule;
  return { ...schedule, position: (schedule.position + 1) % schedule.cycle.length };
}

/** Persisted convenience: advance the saved cycle and write it back. */
export async function advanceSavedCycle(): Promise<void> {
  const s = await loadSchedule();
  if (!s || s.mode !== 'cycle' || s.cycle.length === 0) return;
  await saveSchedule(advanceCycle(s));
}
