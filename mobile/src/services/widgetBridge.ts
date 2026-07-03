/**
 * widgetBridge — WIDGET-001 (founder 2026-06-11), expanded 2026-06-20 (WIDGET-003:
 * more sizes / stats / theme-matching).
 *
 * Feeds the iOS home/lock screen widgets (targets/widget) via App Group shared
 * storage. Everything the widget shows is computed from LOCAL data only (the
 * on-device SQLite store) — no network, no auth (free-path safe):
 *   • next split        — loadSchedule() + the shared resolveNextUp() resolver
 *   • PRs this week      — useWorkoutHistory.computePRIds (trailing 7d)
 *   • goals this week    — exercise_goals achieved in the trailing 7 days
 *   • days trained       — distinct non-rest workout days in the CURRENT ISO week
 *                          (Mon–Sun), against the user's workouts-per-week goal
 *   • current streak     — consecutive ISO weeks with ≥1 workout (mirrors
 *                          useStreak.computeStreak), plus the longest such run
 *   • weekly volume/sets — Σ(weight_kg·reps) for lift sets + total set count,
 *                          logged since this week's Monday 00:00 (local)
 *   • last workout       — most recent routine-stamped session (name + day)
 *   • theme              — the active in-app theme's colours (tokens.ts) so the
 *                          widget always matches the user's theme_preference
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
import AsyncStorage from '@react-native-async-storage/async-storage';

import { localDb } from '../db/localDb';
import { loadSchedule, resolveNextUp } from '../data/schedule';
import { countGoalsAchievedThisWeek, countActiveGoals } from '../data/exerciseGoals';
import { toDateKey, daysAgo } from '../utils/dateHelpers';
import { THEMES, DEFAULT_THEME } from '../theme/tokens';
import { isDropRow } from '../components/loggerLogic';
import type { ThemeName } from '../theme/types';

export const APP_GROUP = 'group.com.peakfettle.app';
export const WIDGET_PAYLOAD_KEY = 'widget_payload';

/** Mirror of ThemeContext.THEME_STORAGE_KEY (where the active theme persists). */
const THEME_STORAGE_KEY = '@peak_fettle/theme';

// Any of these tables changing should re-publish the widget payload.
const WATCHED_TABLES = new Set([
  'sets',
  'schedule',
  'exercise_goals',
  'workouts',
  'user_weekly_goals',
]);
const DEBOUNCE_MS = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The widget's colour set, resolved from the active in-app theme (tokens.ts). */
export interface WidgetTheme {
  /** bgPrimary — widget background. */
  bg: string;
  /** bgTertiary — stat-tile / inner-coin surface. */
  tile: string;
  /** accentDefault — primary accent. */
  accent: string;
  /** textPrimary — main text (white). */
  text: string;
  /** textSecondary — muted text. */
  muted: string;
  /** statusWarning — the streak flame. */
  warn: string;
  /** buttonPrimaryText — dark text that sits ON the accent fill. */
  ink: string;
}

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
  // --- WIDGET-003 additions ---
  /** Distinct non-rest training days in the current ISO week (Mon–Sun). */
  daysThisWeek: number;
  /** User's workouts-per-week target (default 3). */
  weeklyGoal: number;
  /** Did the user train each weekday this week? Index 0=Mon … 6=Sun. */
  trainedDays: boolean[];
  /** Is each weekday a scheduled training day (weekly mode)? 0=Mon … 6=Sun. */
  scheduledDays: boolean[];
  /** Consecutive ISO weeks with ≥1 workout (matches the Home streak). */
  streakWeeks: number;
  /** Longest such run on record. */
  longestStreakWeeks: number;
  /** Total sets logged since this week's Monday 00:00 (local). */
  setsThisWeek: number;
  /** Σ(weight_kg · reps) for lift sets this week, in kg (rounded). */
  volumeThisWeekKg: number;
  /** Most recent routine-stamped session name, or null. */
  lastName: string | null;
  /** Short "when" label for the last session (Today / Yesterday / Wed). */
  lastWhen: string | null;
  /** Active theme colours so the widget matches theme_preference. */
  theme: WidgetTheme;
}

interface SetRow {
  id: string;
  exercise_id: string | null;
  reps: number | null;
  /** Exact kg value (v3+). Preferred for all comparisons. */
  weight_kg_val: number | null;
  /** S1 drop/superset tags (device-only, v6+). Drops are excluded from PRs. */
  metrics_json: string | null;
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
    // S1 PR guard: drop rows (fatigue sets) never set or claim a PR. Cheap
    // string check on metrics_json — no JSON.parse in this hot path.
    if (isDropRow(s.metrics_json)) continue;
    const key = `${s.exercise_id}:${s.reps}`;
    const w = s.weight_kg_val;
    if (w > (bestWeight.get(key) ?? -Infinity)) bestWeight.set(key, w);
  }
  let count = 0;
  for (const s of rows) {
    if (!s.exercise_id || s.reps == null || s.weight_kg_val == null || !s.logged_at) continue;
    if (isDropRow(s.metrics_json)) continue;
    if (s.logged_at < weekCutoff) continue;
    const key = `${s.exercise_id}:${s.reps}`;
    if (s.weight_kg_val >= (bestWeight.get(key) ?? -Infinity)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Week helpers (current ISO week, Monday-anchored, local time)
// ---------------------------------------------------------------------------

/** Monday-anchored bounds of the week containing `now` (local). */
function weekRange(now: Date): {
  monday: Date;
  startKey: string;
  endKey: string;
  startInstant: string;
} {
  const dow = (now.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    monday,
    startKey: toDateKey(monday),
    endKey: toDateKey(sunday),
    startInstant: monday.toISOString(),
  };
}

/** UTC Monday timestamp for a YYYY-MM-DD key (DST-safe week grouping). */
function utcMonday(key: string): number | null {
  const [y, m, d] = key.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.getTime();
}

/**
 * Current + longest consecutive-week streak from a list of workout day_keys.
 * Mirrors useStreak.computeStreak: the current week is "live" (not penalised
 * for 0 workouts yet); a fully-elapsed empty week breaks the streak.
 */
export function streakStats(dayKeys: string[], now: Date = new Date()): {
  current: number;
  longest: number;
} {
  const weeks = new Set<number>();
  for (const k of dayKeys) {
    const t = utcMonday(k);
    if (t !== null) weeks.add(t);
  }

  // Current: walk back week by week from this week's Monday (UTC).
  const nd = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dow = (nd.getUTCDay() + 6) % 7;
  nd.setUTCDate(nd.getUTCDate() - dow);
  let cursor = nd.getTime();
  let current = 0;
  let first = true;
  while (true) {
    const has = weeks.has(cursor);
    if (first) {
      if (has) current++;
      first = false;
    } else {
      if (!has) break;
      current++;
    }
    cursor -= 7 * DAY_MS;
    if (current > 520) break;
  }

  // Longest: scan sorted unique weeks for the longest 7-day-spaced run.
  const arr = Array.from(weeks).sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const t of arr) {
    if (prev !== null && t - prev === 7 * DAY_MS) run++;
    else run = 1;
    if (run > longest) longest = run;
    prev = t;
  }
  return { current, longest: Math.max(longest, current) };
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Compact "when" for a session day_key: Today / Yesterday / weekday short. */
function shortWhen(dayKey: string, now: Date): string {
  const today = toDateKey(now);
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (dayKey === today) return 'Today';
  if (dayKey === toDateKey(yest)) return 'Yesterday';
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
  return SHORT_DAYS[new Date(y, m - 1, d).getDay()] ?? '';
}

/** Resolve the active in-app theme's widget colours (never throws). */
async function loadThemeColors(): Promise<WidgetTheme> {
  let name: ThemeName = DEFAULT_THEME;
  try {
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    if (stored && stored in THEMES) name = stored as ThemeName;
  } catch {
    // fall back to the default theme
  }
  const t = THEMES[name] ?? THEMES[DEFAULT_THEME];
  return {
    bg: t.colors.bgPrimary,
    tile: t.colors.bgTertiary,
    accent: t.colors.accentDefault,
    text: t.colors.textPrimary,
    muted: t.colors.textSecondary,
    warn: t.colors.statusWarning,
    ink: t.components.buttonPrimaryText,
  };
}

// ---------------------------------------------------------------------------
// Payload assembly (reads local DB + AsyncStorage only)
// ---------------------------------------------------------------------------

export async function buildWidgetPayload(now: Date = new Date()): Promise<WidgetPayload> {
  const schedule = await loadSchedule();
  const nextUp = resolveNextUp(schedule, now);
  const { monday, startKey, endKey, startInstant } = weekRange(now);

  const monthCutoff = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  // COALESCE(weight_kg, weight_raw/8.0) handles both v3 rows (exact kg) and
  // pre-v3 rows (weight_raw only). Aliased weight_kg_val to match SetRow.
  const rows = await localDb.getAll<SetRow>(
    `SELECT id, exercise_id, reps,
            COALESCE(weight_kg, CAST(weight_raw AS REAL) / 8.0) AS weight_kg_val,
            metrics_json,
            logged_at
       FROM sets WHERE kind = 'lift' AND logged_at >= ?`,
    [monthCutoff],
  );

  // Days trained this week (distinct non-rest workout days, Mon–Sun) + per-day map.
  const dayRows = await localDb.getAll<{ day_key: string }>(
    `SELECT DISTINCT day_key FROM workouts
       WHERE day_key >= ? AND day_key <= ?
         AND (session_type IS NULL OR session_type <> 'rest_day')`,
    [startKey, endKey],
  );
  const trainedSet = new Set(dayRows.map((r) => r.day_key));
  const trainedDays: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    trainedDays.push(trainedSet.has(toDateKey(d)));
  }
  const daysThisWeek = trainedSet.size;

  // Scheduled training days (weekly mode), reindexed to Mon..Sun.
  const weekly: (string | null)[] =
    schedule?.mode === 'weekly'
      ? schedule.weekly.map((slot) => (slot && slot.routineId ? slot.routineName ?? 'Workout' : null))
      : [];
  const scheduledDays: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    // Mon..Sun (i) → weekday index (Sun=0): Mon=1 … Sat=6, Sun=0.
    const wd = (i + 1) % 7;
    scheduledDays.push(schedule?.mode === 'weekly' && !!weekly[wd]);
  }

  // Weekly workouts-per-week goal (local; default 3).
  const goalRow = await localDb.getFirst<{ workouts_per_week: number }>(
    'SELECT workouts_per_week FROM user_weekly_goals LIMIT 1',
  );
  const weeklyGoal = goalRow?.workouts_per_week ?? 3;

  // Streak (current + longest), over ~3 years of distinct workout days.
  const streakRows = await localDb.getAll<{ day_key: string }>(
    'SELECT DISTINCT day_key FROM workouts WHERE day_key >= ? ORDER BY day_key DESC',
    [daysAgo(365 * 3, now)],
  );
  const { current: streakWeeks, longest: longestStreakWeeks } = streakStats(
    streakRows.map((r) => r.day_key),
    now,
  );

  // Weekly volume + total sets (since this week's Monday 00:00 local).
  const wk = await localDb.getFirst<{ n: number; vol: number }>(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN kind = 'lift'
              THEN COALESCE(weight_kg, CAST(weight_raw AS REAL) / 8.0) * COALESCE(reps, 0)
              ELSE 0 END), 0) AS vol
       FROM sets WHERE logged_at >= ?`,
    [startInstant],
  );
  const setsThisWeek = wk?.n ?? 0;
  const volumeThisWeekKg = Math.round(wk?.vol ?? 0);

  // Last routine-stamped session.
  const last = await localDb.getFirst<{ routine_name: string | null; day_key: string }>(
    `SELECT routine_name, day_key FROM workouts
       WHERE routine_name IS NOT NULL AND TRIM(routine_name) <> ''
       ORDER BY day_key DESC LIMIT 1`,
  );
  const lastName = last?.routine_name ?? null;
  const lastWhen = last ? shortWhen(last.day_key, now) : null;

  const theme = await loadThemeColors();

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
    daysThisWeek,
    weeklyGoal,
    trainedDays,
    scheduledDays,
    streakWeeks,
    longestStreakWeeks,
    setsThisWeek,
    volumeThisWeekKg,
    lastName,
    lastWhen,
    theme,
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
