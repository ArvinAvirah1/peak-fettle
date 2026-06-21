/**
 * widgetBridge (LifeOS) — TICKET-116. Feeds the iOS home / lock-screen widgets
 * (targets/widget) from LOCAL data only (on-device SQLite). No network, no auth.
 *
 * Mirrors the proven fitness-app bridge (mobile/src/services/widgetBridge.ts):
 * compute a small JSON payload, write it to the App Group via @bacons/apple-targets
 * ExtensionStorage, then reload the widget. Re-publishes (debounced) whenever a
 * watched local table changes, and once on startWidgetBridge().
 *
 * What the widgets show:
 *   • Streak ring        — overall "showing-up" streak via the AUTHORITATIVE
 *                          engine (engine/streaks.computeStreak). A day is ACTIVE
 *                          if ANY habit is 'done' that day ('rest' = active,
 *                          'skip' = neutral) — same forgiving semantics, just
 *                          aggregated across habits for the at-a-glance ring.
 *   • Today's habits     — today's active daily habits + done state (the
 *                          interactive check-off widget; App Intents = TICKET-117).
 *   • Time reclaimed /
 *     blocks held        — from lo_focus_events for today.
 *
 * The Focus-session Live Activity (Dynamic Island countdown) is NOT a timeline
 * widget — it is driven by a separate ActivityKit module (TICKET-118). This
 * bridge only carries an optional `focus` summary block for the small status widget.
 *
 * Safety: iOS-only, lazy-required native module, every entry point try/caught —
 * must never crash Android, Expo Go, or a logging flow.
 */

import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { localDb, dayKey } from '../db/localDb';
import { logHabit } from '../data/habits';
import { addDays, aggregateDailyStatus, computeStreak, type LogStatus } from '../engine/streaks';
import { summitDark, summitLight, type Theme } from '../theme/tokens';

export const APP_GROUP = 'group.com.peakfettle.lifeos';
export const WIDGET_PAYLOAD_KEY = 'widget_payload';
/** App-Group key the iOS 17 ToggleHabitIntent appends pending check-offs to (TICKET-117). */
export const PENDING_TOGGLES_KEY = 'pending_habit_toggles';

/** Mirror of ThemeContext STORAGE_KEY (where the theme mode persists). */
const THEME_STORAGE_KEY = 'lifeos.themeMode';

/** Tables whose change should re-publish the widget payload. */
const WATCHED_TABLES = new Set(['lo_habit_logs', 'lo_habits', 'lo_focus_events', 'lo_meta']);
const DEBOUNCE_MS = 1500;
const MAX_TODAY_HABITS = 6;

/**
 * RECONCILED VOCABULARY (TICKET-116 step 4) — the lo_focus_events this widget reads,
 * kept in lockstep with the emitter `logFocusEvent` in src/data/focus.ts
 * (FocusEventKind) and the canonical "blocks held" metric in src/data/insights.ts:
 *   • "block held" = a `'unlock_abandoned'` event (user hit friction and gave up the
 *     unlock — the Opal-style win). SAME kind insights.ts counts, so the widget and
 *     Insights never disagree. (The earlier scaffold listed a phantom 'block_held'
 *     kind that the emitter never writes — removed.)
 *   • "reclaimed minutes" = sum of `meta.minutes` on today's focus events. Emitters
 *     of session-end / block-held events should set `meta.minutes`. Until the focus
 *     flow is wired + compiled on a device (TICKET-104 ships dark; `logFocusEvent`
 *     has no call sites yet), blocks-held and reclaimed both read 0 — expected.
 * Read defensively: an unknown kind or missing meta never breaks the widget.
 */
const BLOCK_HELD_KIND = 'unlock_abandoned';

export interface WidgetTheme {
  bg: string;
  tile: string;
  accent: string;
  text: string;
  muted: string;
  warn: string;
  /** Dark ink that sits ON the accent fill. */
  ink: string;
}

export interface TodayHabit {
  /** Habit id — needed by the interactive check-off AppIntent (TICKET-117). */
  id: string;
  name: string;
  icon: string;
  done: boolean;
}

export interface LifeOSWidgetPayload {
  updatedAt: string;
  /** Active (done/rest) days in the current unbroken chain. */
  streakDays: number;
  longestStreakDays: number;
  /** Milestone at/below current (null below 7) — drives the ring badge. */
  milestone: number | null;
  habitsDoneToday: number;
  habitsTotalToday: number;
  todayHabits: TodayHabit[];
  blocksHeldToday: number;
  reclaimedMinToday: number;
  /** Optional live focus-session summary (small status widget). */
  focusActive: boolean;
  focusName: string | null;
  focusEndsAt: string | null;
  theme: WidgetTheme;
}

// ---------------------------------------------------------------------------
// Theme resolution (never throws)
// ---------------------------------------------------------------------------

async function loadThemeColors(): Promise<WidgetTheme> {
  let theme: Theme = summitDark;
  try {
    const mode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    if (mode && mode.toLowerCase().includes('light')) theme = summitLight;
  } catch {
    // fall back to summitDark
  }
  const c = theme.colors as unknown as Record<string, string>;
  return {
    bg: c.bgPrimary,
    tile: c.bgElevated ?? c.bgSecondary ?? c.bgPrimary,
    accent: c.accentDefault,
    text: c.textPrimary,
    muted: c.textSecondary ?? c.textPrimary,
    warn: c.statusWarning ?? c.accentDefault,
    // Text that sits ON the accent fill: dark ink in dark mode, light in light
    // mode. Use the semantic token (NOT bgPrimary, which fails AA on light-mode amber).
    ink: c.textOnAccent ?? c.bgPrimary,
  };
}

// ---------------------------------------------------------------------------
// Payload assembly (reads local DB + AsyncStorage only)
// ---------------------------------------------------------------------------

export async function buildWidgetPayload(now: Date = new Date()): Promise<LifeOSWidgetPayload> {
  const today = dayKey(now);

  // --- Streak (authoritative engine over aggregated daily status) ---
  // Active habits only (mirrors the today-habits query below): archived habits'
  // logs must not keep the ring alive. Bounded date window: `<= today` so a
  // future-dated row can't inflate `longest`, and a generous lower bound caps the
  // scan on long-running installs (the engine walks at most 1830 days, so -2000
  // is safe and never truncates a real chain).
  const minDate = addDays(today, -2000);
  const logRows = await localDb.getAll<{ date: string; status: LogStatus }>(
    `SELECT l.date, l.status FROM lo_habit_logs l
       JOIN lo_habits h ON h.id = l.habit_id
       WHERE h.archived_at IS NULL AND l.date >= ? AND l.date <= ?
       ORDER BY l.date ASC`,
    [minDate, today],
  );
  const statusByDay = aggregateDailyStatus(logRows);
  const streak = computeStreak(statusByDay, today);

  // --- Today's active daily habits + done state ---
  const habitRows = await localDb.getAll<{ id: string; name: string; icon: string }>(
    `SELECT id, name, icon FROM lo_habits
       WHERE archived_at IS NULL AND cadence = 'daily'
       ORDER BY stack_position IS NULL, stack_position ASC, created_at ASC`,
  );
  const doneRows = await localDb.getAll<{ habit_id: string }>(
    `SELECT habit_id FROM lo_habit_logs WHERE date = ? AND status = 'done'`,
    [today],
  );
  const doneSet = new Set(doneRows.map((r) => r.habit_id));
  const todayHabits: TodayHabit[] = habitRows.map((h) => ({
    id: h.id,
    name: h.name,
    icon: h.icon,
    done: doneSet.has(h.id),
  }));
  const habitsTotalToday = todayHabits.length;
  const habitsDoneToday = todayHabits.filter((h) => h.done).length;

  // --- Blocks held + time reclaimed today (from local focus telemetry) ---
  const blocksRow = await localDb.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM lo_focus_events
       WHERE substr(ts, 1, 10) = ? AND kind = ?`,
    [today, BLOCK_HELD_KIND],
  );
  const blocksHeldToday = blocksRow?.n ?? 0;

  // Reclaimed minutes: sum meta_json.minutes ONLY across the event kinds the
  // contract says carry it (session end + block held), so a future emitter that
  // attaches meta.minutes to a non-terminal event can't double-count.
  const reclaimRows = await localDb.getAll<{ meta_json: string }>(
    `SELECT meta_json FROM lo_focus_events
       WHERE substr(ts, 1, 10) = ? AND kind IN (?, ?)`,
    [today, 'session_ended', BLOCK_HELD_KIND],
  );
  let reclaimedMinToday = 0;
  for (const r of reclaimRows) {
    try {
      const meta = JSON.parse(r.meta_json) as { minutes?: number; reclaimedMin?: number };
      reclaimedMinToday += Number(meta.minutes ?? meta.reclaimedMin ?? 0) || 0;
    } catch {
      // ignore malformed meta
    }
  }
  reclaimedMinToday = Math.round(reclaimedMinToday);

  // --- Optional live focus session (written to lo_meta by TICKET-104/118) ---
  let focusActive = false;
  let focusName: string | null = null;
  let focusEndsAt: string | null = null;
  try {
    const row = await localDb.getFirst<{ value: string }>(
      `SELECT value FROM lo_meta WHERE key = 'active_focus'`,
    );
    if (row?.value) {
      const f = JSON.parse(row.value) as { name?: string; endsAt?: string };
      if (f.endsAt && new Date(f.endsAt).getTime() > now.getTime()) {
        focusActive = true;
        focusName = f.name ?? 'Focus session';
        focusEndsAt = f.endsAt;
      }
    }
  } catch {
    // no active focus
  }

  const theme = await loadThemeColors();

  return {
    updatedAt: now.toISOString(),
    streakDays: streak.current,
    longestStreakDays: streak.longest,
    milestone: streak.milestone,
    habitsDoneToday,
    habitsTotalToday,
    todayHabits: todayHabits.slice(0, MAX_TODAY_HABITS),
    blocksHeldToday,
    reclaimedMinToday,
    focusActive,
    focusName,
    focusEndsAt,
    theme,
  };
}

// ---------------------------------------------------------------------------
// Native write (iOS only; no-ops everywhere else)
// ---------------------------------------------------------------------------

type StorageInstance = {
  set: (key: string, value: string) => void;
  get: (key: string) => string | null;
};
type ExtensionStorageModule = {
  ExtensionStorage: {
    new (group: string): StorageInstance;
    reloadWidget: (name?: string) => void;
  };
};

let storageInstance: StorageInstance | null = null;
let reloadFn: ((name?: string) => void) | null = null;
let nativeUnavailable = false;

function getStorage(): StorageInstance | null {
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
// Interactive check-off drain (TICKET-117)
// ---------------------------------------------------------------------------

/**
 * Apply pending widget check-offs. The iOS 17 ToggleHabitIntent appends
 * {habitId, date} entries to the App Group (it can't write the RN SQLite DB
 * directly); here we read the queue, apply each through the TICKET-103 logging
 * path (idempotent UNIQUE(habit_id,date) upsert — double-taps are harmless), and
 * clear it. Unknown/archived habit ids are dropped. Never throws.
 */
export async function drainPendingToggles(): Promise<void> {
  try {
    const storage = getStorage();
    if (!storage) return;
    const raw = storage.get(PENDING_TOGGLES_KEY);
    if (!raw) return;
    let toggles: Array<{ habitId?: string; date?: string }>;
    try {
      toggles = JSON.parse(raw) as Array<{ habitId?: string; date?: string }>;
    } catch {
      storage.set(PENDING_TOGGLES_KEY, '[]'); // discard a corrupt queue
      return;
    }
    if (!Array.isArray(toggles) || toggles.length === 0) return;
    // Clear right after reading to minimise the window where a concurrently
    // appended toggle could be lost; the idempotent upsert makes re-apply safe.
    storage.set(PENDING_TOGGLES_KEY, '[]');

    const validIds = new Set(
      (await localDb.getAll<{ id: string }>(`SELECT id FROM lo_habits WHERE archived_at IS NULL`)).map((r) => r.id),
    );
    for (const t of toggles) {
      if (!t || typeof t.habitId !== 'string' || !validIds.has(t.habitId)) continue;
      const date = typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : dayKey();
      await logHabit(t.habitId, 'done', date); // TICKET-103 path — no duplicate streak logic
    }
  } catch {
    // Drain must never break the app.
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

  // Apply any pending widget check-offs, then publish the fresh payload.
  void drainPendingToggles().then(() => refreshWidget());

  // Drain again on every foreground — the user may have checked off a habit from
  // the widget while the app was backgrounded (TICKET-117).
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void drainPendingToggles().then(() => refreshWidget());
  });

  localDb.subscribe((tables: Set<string>) => {
    let relevant = false;
    for (const t of tables) {
      if (WATCHED_TABLES.has(t)) {
        relevant = true;
        break;
      }
    }
    if (!relevant) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void refreshWidget();
    }, DEBOUNCE_MS);
  });
}
