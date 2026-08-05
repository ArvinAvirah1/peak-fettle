/**
 * routineReminders — per-routine daily weigh-in reminder (founder 2026-08-04).
 *
 * "Remind me to weigh in at the gym." Two independent channels, both opt-in per
 * routine:
 *
 *   • IN-APP  — a weigh-in card appears inside the logger when a session from
 *               this routine STARTS or ENDS (the user picks which). No OS
 *               permission needed; fires exactly when they're at the gym.
 *   • NOTIFY  — a repeating local notification on chosen weekdays at a chosen
 *               time. Needs notification permission; scheduled with
 *               expo-notifications WEEKLY triggers (one per selected day, since
 *               a weekly trigger takes a single weekday).
 *
 * Storage is a device-local `routine_reminders` table for BOTH tiers — see the
 * v19 block in localSchema.ts for why this isn't a column on `routines`
 * (routines sync to the server for Pro; notification identifiers are per-device
 * and meaningless anywhere else). No REST call on any path, free or Pro.
 *
 * The scheduling side is deliberately fail-soft: every expo-notifications call
 * is caught. A denied permission or an unavailable module degrades the feature
 * to in-app-only rather than throwing into the routine editor's save path.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { localDb } from '../db/localDb';
import { getDailyWeightForDay } from './bodyweightDaily';
import { getSetting, setSetting } from './appSettings';
import { toDateKey } from '../utils/dateHelpers';

/** Android notification channel for weigh-in reminders. */
const NOTIF_CHANNEL = 'weigh-in';

export type InAppTiming = 'start' | 'end';

export interface RoutineReminder {
  routine_id: string;
  /** Master switch — off means neither channel fires. */
  enabled: boolean;
  /** When the in-logger prompt appears for sessions from this routine. */
  in_app_timing: InAppTiming;
  /** Whether the scheduled local notification is also on. */
  notify_enabled: boolean;
  /** Weekdays the notification repeats on: 0=Sun … 6=Sat. */
  notify_days: number[];
  notify_hour: number; // 0–23, local
  notify_minute: number; // 0–59
}

/** Sensible starting point when a routine has never been configured: a 6pm
 *  weekday nudge, in-app prompt at session start. Nothing fires until the user
 *  actually flips `enabled` on. */
export const DEFAULT_REMINDER: Omit<RoutineReminder, 'routine_id'> = {
  enabled: false,
  in_app_timing: 'start',
  notify_enabled: false,
  notify_days: [1, 2, 3, 4, 5],
  notify_hour: 18,
  notify_minute: 0,
};

// ---------------------------------------------------------------------------
// Row <-> model
// ---------------------------------------------------------------------------

interface ReminderRow {
  routine_id: string;
  enabled: number;
  in_app_timing: string | null;
  notify_enabled: number;
  notify_days: string | null;
  notify_hour: number | null;
  notify_minute: number | null;
  notification_ids: string | null;
}

/** Defensive parse of the JSON weekday array — clamps to 0–6, dedupes, sorts.
 *  Garbage in the column (hand-edited backup, older shape) degrades to the
 *  default weekday set rather than scheduling nothing or crashing. */
function parseDays(raw: string | null | undefined): number[] {
  if (!raw) return [...DEFAULT_REMINDER.notify_days];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_REMINDER.notify_days];
    const days = Array.from(
      new Set(
        parsed
          .map((d) => Number(d))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      ),
    ).sort((a, b) => a - b);
    return days.length ? days : [...DEFAULT_REMINDER.notify_days];
  } catch {
    return [...DEFAULT_REMINDER.notify_days];
  }
}

function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function clampInt(value: number | null | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function rowToReminder(row: ReminderRow): RoutineReminder {
  return {
    routine_id: row.routine_id,
    enabled: row.enabled === 1,
    in_app_timing: row.in_app_timing === 'end' ? 'end' : 'start',
    notify_enabled: row.notify_enabled === 1,
    notify_days: parseDays(row.notify_days),
    notify_hour: clampInt(row.notify_hour, 0, 23, DEFAULT_REMINDER.notify_hour),
    notify_minute: clampInt(row.notify_minute, 0, 59, DEFAULT_REMINDER.notify_minute),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Config for one routine, or null when it has never been configured. */
export async function getRoutineReminder(routineId: string): Promise<RoutineReminder | null> {
  if (!routineId) return null;
  const row = await localDb.getFirst<ReminderRow>(
    `SELECT routine_id, enabled, in_app_timing, notify_enabled, notify_days,
            notify_hour, notify_minute, notification_ids
       FROM routine_reminders WHERE routine_id = ? LIMIT 1`,
    [routineId],
  );
  return row ? rowToReminder(row) : null;
}

/** Config for one routine, falling back to DEFAULT_REMINDER (all off). */
export async function getRoutineReminderOrDefault(routineId: string): Promise<RoutineReminder> {
  return (await getRoutineReminder(routineId)) ?? { routine_id: routineId, ...DEFAULT_REMINDER };
}

/** All routine ids that currently have the reminder switched on — used to badge
 *  the routines list without an N+1 query per row. */
export async function getEnabledReminderRoutineIds(): Promise<Set<string>> {
  const rows = await localDb.getAll<{ routine_id: string }>(
    `SELECT routine_id FROM routine_reminders WHERE enabled = 1`,
  );
  return new Set(rows.map((r) => r.routine_id));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Save a routine's reminder config and re-sync its scheduled notifications.
 *
 * Always cancels the previously scheduled ids first, so an edit can never leave
 * an orphaned notification firing on a weekday the user just unchecked.
 */
export async function saveRoutineReminder(
  reminder: RoutineReminder,
  routineName: string,
  copy: ReminderCopy,
): Promise<void> {
  if (!reminder.routine_id) return;

  const previous = await localDb.getFirst<{ notification_ids: string | null }>(
    `SELECT notification_ids FROM routine_reminders WHERE routine_id = ? LIMIT 1`,
    [reminder.routine_id],
  );
  await cancelNotificationIds(parseIds(previous?.notification_ids));

  const shouldSchedule = reminder.enabled && reminder.notify_enabled;
  const ids = shouldSchedule ? await scheduleReminderNotifications(reminder, routineName, copy) : [];

  await localDb.execute(
    `INSERT INTO routine_reminders
       (routine_id, enabled, in_app_timing, notify_enabled, notify_days,
        notify_hour, notify_minute, notification_ids, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(routine_id) DO UPDATE SET
       enabled          = excluded.enabled,
       in_app_timing    = excluded.in_app_timing,
       notify_enabled   = excluded.notify_enabled,
       notify_days      = excluded.notify_days,
       notify_hour      = excluded.notify_hour,
       notify_minute    = excluded.notify_minute,
       notification_ids = excluded.notification_ids,
       updated_at       = excluded.updated_at`,
    [
      reminder.routine_id,
      reminder.enabled ? 1 : 0,
      reminder.in_app_timing,
      reminder.notify_enabled ? 1 : 0,
      JSON.stringify(reminder.notify_days),
      reminder.notify_hour,
      reminder.notify_minute,
      JSON.stringify(ids),
      new Date().toISOString(),
    ],
    { tables: ['routine_reminders'] },
  );
}

/** Drop a routine's reminder row and cancel anything it had scheduled. Call
 *  when the routine itself is deleted, or the notifications outlive it. */
export async function deleteRoutineReminder(routineId: string): Promise<void> {
  const row = await localDb.getFirst<{ notification_ids: string | null }>(
    `SELECT notification_ids FROM routine_reminders WHERE routine_id = ? LIMIT 1`,
    [routineId],
  );
  if (!row) return;
  await cancelNotificationIds(parseIds(row.notification_ids));
  await localDb.execute(`DELETE FROM routine_reminders WHERE routine_id = ?`, [routineId], {
    tables: ['routine_reminders'],
  });
}

// ---------------------------------------------------------------------------
// In-logger prompt
// ---------------------------------------------------------------------------

/** Day-scoped "Not today" dismissal, so ending three sessions in one day can't
 *  produce three prompts after the user has already said no once. */
const PROMPT_DISMISSED_KEY = 'weigh_in_prompt_dismissed_day';

/**
 * Should the in-logger weigh-in prompt appear for this routine, at this moment?
 *
 * True only when ALL of these hold:
 *   • the routine has the reminder switched on,
 *   • its chosen timing matches the moment ('start' | 'end'),
 *   • today has no reading yet, and
 *   • the user hasn't dismissed the prompt already today.
 *
 * Fail-closed: any error answers false. A weigh-in nag is never important
 * enough to risk interrupting the logger on a bad read.
 */
export async function shouldPromptWeighIn(
  routineId: string | undefined,
  timing: InAppTiming,
  now: Date = new Date(),
): Promise<boolean> {
  if (!routineId) return false;
  try {
    const reminder = await getRoutineReminder(routineId);
    if (!reminder || !reminder.enabled || reminder.in_app_timing !== timing) return false;
    if (await getDailyWeightForDay(now)) return false;
    const dismissed = await getSetting(PROMPT_DISMISSED_KEY);
    return dismissed !== toDateKey(now);
  } catch {
    return false;
  }
}

/** Record a "Not today" so the prompt stays quiet for the rest of the day. */
export async function dismissWeighInPromptForToday(now: Date = new Date()): Promise<void> {
  try {
    await setSetting(PROMPT_DISMISSED_KEY, toDateKey(now));
  } catch {
    // Non-fatal — worst case the prompt reappears on the next session today.
  }
}

// ---------------------------------------------------------------------------
// Notification scheduling
// ---------------------------------------------------------------------------

/** Localized strings, passed in so this module stays free of i18n/React deps
 *  (it is called from the editor's save path and from the app-launch resync). */
export interface ReminderCopy {
  title: string;
  /** Receives the routine name, e.g. "Weigh in before Push Day". */
  body: (routineName: string) => string;
  channelName: string;
}

/**
 * Ask for notification permission if we don't already have it.
 * Returns false on denial or any error — callers degrade to in-app only.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (existing.canAskAgain === false) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

async function ensureChannel(channelName: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL, {
      name: channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  } catch {
    // Channel creation failing is not fatal — the notification still posts to
    // the default channel on older Android.
  }
}

/**
 * Schedule one repeating WEEKLY notification per selected weekday.
 *
 * expo-notifications' WEEKLY trigger takes a single `weekday` (1=Sunday …
 * 7=Saturday — note the 1-based offset from our 0-based storage), so a
 * Mon/Wed/Fri reminder is three separate schedules. Their ids are returned and
 * stored so a later edit cancels exactly this set.
 *
 * Returns [] when permission is denied or scheduling throws; the caller stores
 * the empty list, which correctly reflects "nothing is scheduled".
 */
async function scheduleReminderNotifications(
  reminder: RoutineReminder,
  routineName: string,
  copy: ReminderCopy,
): Promise<string[]> {
  if (!reminder.notify_days.length) return [];
  const granted = await ensureNotificationPermission();
  if (!granted) return [];
  await ensureChannel(copy.channelName);

  const ids: string[] = [];
  for (const day of reminder.notify_days) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: copy.title,
          body: copy.body(routineName),
          sound: 'default',
          data: { type: 'weigh_in_reminder', routineId: reminder.routine_id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: day + 1, // 0=Sun (ours) → 1=Sun (expo)
          hour: reminder.notify_hour,
          minute: reminder.notify_minute,
          channelId: NOTIF_CHANNEL,
        },
      });
      ids.push(id);
    } catch {
      // Skip this weekday; keep whatever else scheduled successfully.
    }
  }
  return ids;
}

async function cancelNotificationIds(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Already fired/cancelled — nothing to clean up.
    }
  }
}
