/**
 * widgetBridge — WIDGET-001 (founder 2026-06-11): feeds the iOS home/lock
 * screen widget (targets/widget) via App Group shared storage.
 *
 * Everything the widget shows is computed from LOCAL data only (the on-device
 * SQLite store) — no network, no auth:
 *   • next split   — loadSchedule() + the shared resolveNextUp() resolver
 *   • PRs this week    — same algorithm as useWorkoutHistory.computePRIds:
 *     a lift set is a PR if its weight is the best seen for that
 *     (exercise_id, reps) pair in the trailing 30 days; "this week" counts
 *     PR sets logged in the trailing 7 days.
 *   • goals this week  — exercise_goals achieved in the trailing 7 days.
 *
 * Transport: a single JSON string under WIDGET_PAYLOAD_KEY in the
 * `group.com.peakfettle.app` App Group (NSUserDefaults), written with
 * ExtensionStorage from @bacons/apple-targets, then reloadWidget().
 *
 * For 'weekly' schedules the payload also carries the 7-slot name array so the
 * Swift TimelineProvider can re-derive "Today/Tomorrow" after midnight without
 * the app running. For 'cycle' mode the pointer only moves when a routine is
 * completed in-app, so the precomputed label stays valid.
 *
 * Safety: iOS-only, lazy-required, every entry point try/caught — must never
 * crash Android, Expo Go (no native module), or a logging flow.
 */

import { Platform } from 'react-native';

import { localDb } from '../db/localDb';
import { loadSchedule, resolveNextUp } from '../data/schedule';
import { countGoalsAchievedThisWeek, countActiveGoals } from '../data/exerciseGoals';

export const APP_GROUP = 'group.com.peakfettle.app';
export const WIDGET_PAYLOAD_KEY = 'widget_payload';

const WATCHED_TABLES = new Set(['sets', 'schedule', 'exercise_goals']);
const DEBOUNCE_MS = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface WidgetPayload {
  updatedAt: string;
  scheduleMode: 'cycle' | 'weekly' | 'none';
  nextName: string | null;
  whenLabel: string | null;
  isRest: boolean;
  /** Weekly mode only: 7 routine names (Sun..Sat), null = rest/unset. */
  weekly: (string | null)[];
  prsThisWeek: number;
  goalsThisWeek: number;
  goalsActive: number;
}

interface SetRow {
  id: string;
  exercise_id: string | null;
  reps: number | null;
  /** Exact kg value (v3+). Preferred for all comparisons. */
  weight_kg_val: number | null;
  logged_at: string | null;
}

// ---------------------------------------------------------------------------
// PR count (mirrors useWorkoutHistory.computePRIds over local sets)
// ---------------------------------------------------------------------------

export function countPRsThisWeek(rows: SetRow[], now: Date = new Date()): number {
  const weekCutoff = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const bestWeight = new Map<string, number>();
  for (const s of rows) {
    if (!s.exercise_id || s.reps == null || s.weight_kg_val == null) continue;
    const key = `${s.exercise_id}:${s.reps}`;
    const w = s.weight_kg_val;
    if (w > (bestWeight.get(key) ?? -Infinity)) bestWeight.set(key, w);
  }
  let count = 0;
  for (const s of rows) {
    if (!s.exercise_id || s.reps == null || s.weight_kg_val == null || !s.logged_at) continue;
    if (s.logged_at < weekCutoff) continue;
    const key = `${s.exercise_id}:${s.reps}`;
    if (s.weight_kg_val >= (bestWeight.get(key) ?? -Infinity)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Payload assembly (pure-ish; reads local DB only)
// ---------------------------------------------------------------------------

export async function buildWidgetPayload(now: Date = new Date()): Promise<WidgetPayload> {
  const schedule = await loadSchedule();
  const nextUp = resolveNextUp(schedule, now);

  const monthCutoff = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  // Use COALESCE(weight_kg, weight_raw/8.0) so that both v3 rows (exact kg)
  // and pre-v3 rows (weight_raw only) are handled correctly.  Aliased as
  // weight_kg_val to match the SetRow interface and make the intent explicit.
  const rows = await localDb.getAll<SetRow>(
    `SELECT id, exercise_id, reps,
            COALESCE(weight_kg, CAST(weight_raw AS REAL) / 8.0) AS weight_kg_val,
            logged_at
       FROM sets WHERE kind = 'lift' AND logged_at >= ?`,
    [monthCutoff],
  );

  const weekly: (string | null)[] =
    schedule?.mode === 'weekly'
      ? schedule.weekly.map((slot) => (slot && slot.routineId ? slot.routineName ?? 'Workout' : null))
      : [];

  return {
    updatedAt: now.toISOString(),
    scheduleMode: schedule ? schedule.mode : 'none',
    nextName: nextUp && !nextUp.isRest ? nextUp.slot.routineName ?? 'Workout' : null,
    whenLabel: nextUp ? nextUp.whenLabel : null,
    isRest: nextUp ? nextUp.isRest : false,
    weekly,
    prsThisWeek: countPRsThisWeek(rows, now),
    goalsThisWeek: await countGoalsAchievedThisWeek(now),
    goalsActive: await countActiveGoals(),
  };
}

// ---------------------------------------------------------------------------
// Native write (iOS only; no-ops everywhere else)
// ---------------------------------------------------------------------------

type ExtensionStorageModule = {
  ExtensionStorage: {
    new (group: string): { set: (key: string, value: string) => void };
    reloadWidget: (name?: string) => void;
  };
};

let storageInstance: { set: (key: string, value: string) => void } | null = null;
let reloadFn: ((name?: string) => void) | null = null;
let nativeUnavailable = false;

function getStorage(): { set: (key: string, value: string) => void } | null {
  if (Platform.OS !== 'ios' || nativeUnavailable) return null;
  if (storageInstance) return storageInstance;
  try {
    // Lazy require: the native module is absent in Expo Go — never crash.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@bacons/apple-targets') as ExtensionStorageModule;
    storageInstance = new mod.ExtensionStorage(APP_GROUP);
    reloadFn = mod.ExtensionStorage.reloadWidget;
    return storageInstance;
  } catch {
    nativeUnavailable = true;
    return null;
  }
}

/** Recompute the payload and push it to the widget. Never throws. */
export async function refreshWidget(now: Date = new Date()): Promise<void> {
  try {
    const storage = getStorage();
    if (!storage) return;
    const payload = await buildWidgetPayload(now);
    storage.set(WIDGET_PAYLOAD_KEY, JSON.stringify(payload));
    reloadFn?.();
  } catch {
    // Widget refresh must never break the app.
  }
}

// ---------------------------------------------------------------------------
// Lifecycle — call startWidgetBridge() once from the root layout.
// ---------------------------------------------------------------------------

let started = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function startWidgetBridge(): void {
  if (started || Platform.OS !== 'ios') return;
  started = true;

  // Initial publish (also covers day rollover since app launch).
  void refreshWidget();

  // Re-publish (debounced) whenever widget-relevant local tables change.
  localDb.subscribe((tables) => {
    let relevant = false;
    for (const t of tables) {
      if (WATCHED_TABLES.has(t)) { relevant = true; break; }
    }
    if (!relevant) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void refreshWidget();
    }, DEBOUNCE_MS);
  });
}
