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
import { toDateKey } from '../utils/dateHelpers';

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
  /**
   * Preferred time of day to train, as "HH:MM" 24-hour, or null for "no set
   * time". Drives the optional reminder; widgets (Phase 2) can also surface it.
   */
  timeOfDay: string | null;
  /** When true, schedule a local reminder at `timeOfDay` on training days. */
  reminderEnabled: boolean;
  /**
   * Weekly-mode skip marker: an ISO date (YYYY-MM-DD). The weekly resolver
   * ignores any day on or before this date, so "Skip" on a weekly next-up jumps
   * to the next training day. Naturally expires (tomorrow's date is already
   * after it). null/absent for cycle mode or when nothing has been skipped.
   */
  skipBeforeDate?: string | null;
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
    timeOfDay: null,
    reminderEnabled: false,
    skipBeforeDate: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Validate/normalize a "HH:MM" 24-hour string; returns null if unparseable. */
function normalizeTimeOfDay(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
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
  const timeOfDay = normalizeTimeOfDay(raw.timeOfDay);
  return {
    mode: raw.mode === 'weekly' ? 'weekly' : 'cycle',
    cycle,
    position: cycle.length > 0 ? ((position % cycle.length) + cycle.length) % cycle.length : 0,
    weekly,
    timeOfDay,
    // A reminder only makes sense when a time is set.
    reminderEnabled: timeOfDay != null && raw.reminderEnabled === true,
    skipBeforeDate: typeof raw.skipBeforeDate === 'string' ? raw.skipBeforeDate : null,
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
    const skipBefore = schedule.skipBeforeDate ?? null;
    // Find the next day (starting today) that has a non-rest routine. A weekly
    // "Skip" sets skipBeforeDate to today, so any day on/before it is passed over
    // and next-up jumps to the following training day.
    for (let offset = 0; offset < 7; offset++) {
      const idx = (today + offset) % 7;
      if (skipBefore) {
        const d = new Date(now);
        d.setDate(d.getDate() + offset);
        if (toDateKey(d) <= skipBefore) continue;
      }
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
 * Cycle advancement is COMPLETION-driven (founder decision 2026-06-06): the next
 * slot is the one AFTER the last completed in-loop routine. Weekly schedules
 * advance by the calendar, so the resolver handles them and this is a no-op.
 *
 * Call when a routine workout finishes. Only advances when the completed
 * routineId is one of the cycle's slots — out-of-loop routines done in the
 * interim are deliberately ignored.
 */
export async function markRoutineCompleted(routineId: string): Promise<void> {
  if (!routineId) return;
  const s = await loadSchedule();
  if (!s || s.mode !== 'cycle' || s.cycle.length === 0) return;
  const idx = s.cycle.findIndex((slot) => slot.routineId === routineId);
  if (idx < 0) return; // out-of-loop routine — ignore
  await saveSchedule({ ...s, position: (idx + 1) % s.cycle.length });
}

/**
 * Skip the current next-up WITHOUT logging anything (user wants the one after).
 *   • cycle  — advance the pointer to the next slot (Push → Pull → Legs → …).
 *   • weekly — mark today skipped so the resolver returns the next training day.
 * Persists and returns the updated schedule (or null when there's no schedule).
 */
export async function skipToNext(): Promise<Schedule | null> {
  const s = await loadSchedule();
  if (!s) return null;
  if (s.mode === 'cycle') {
    if (s.cycle.length === 0) return s;
    await saveSchedule({ ...s, position: (s.position + 1) % s.cycle.length });
  } else {
    await saveSchedule({ ...s, skipBeforeDate: toDateKey(new Date()) });
  }
  return (await loadSchedule()) ?? s;
}
