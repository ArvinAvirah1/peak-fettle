/**
 * notifications.ts — NATIVE local-notification layer for Life OS (TICKET-124).
 *
 * ALL reminders are LOCAL notifications via expo-notifications. No server REST
 * call, no push token, no axios import — the server never knows a free user's
 * reminder times (local-first, CLAUDE.md #1). The pure scheduling logic (config
 * shape, ≤2/day cap, quiet hours, copy) lives in engine/reminderPlan.ts and is
 * unit-tested; this file only persists config (lo_meta) and renders the plan
 * through the native API. Re-exports the pure surface so screens import from here.
 */

import { Platform } from 'react-native';
import { localDb } from '../db/localDb';
import {
  DEFAULT_REMINDER_CONFIG,
  REMINDER_META_KEY,
  mergeReminderConfig,
  parseTime,
  planWeek,
  type ReminderConfig,
} from '../engine/reminderPlan';

// Re-export the pure planner surface (types, defaults, copy, planWeek,
// summarizeSchedule, isWithinQuietHours, parseTime) for the UI + tests.
export * from '../engine/reminderPlan';

// ---------------------------------------------------------------------------
// Persistence (lo_meta — local-first)
// ---------------------------------------------------------------------------

/** Load reminder config from lo_meta; missing/corrupt JSON → defaults. */
export async function loadReminderConfig(): Promise<ReminderConfig> {
  try {
    const row = await localDb.getFirst<{ value: string }>(
      `SELECT value FROM lo_meta WHERE key = ?`,
      [REMINDER_META_KEY],
    );
    if (!row?.value) return { ...DEFAULT_REMINDER_CONFIG };
    return mergeReminderConfig(JSON.parse(row.value) as Partial<ReminderConfig>);
  } catch {
    return { ...DEFAULT_REMINDER_CONFIG };
  }
}

/** Persist the config to lo_meta. */
export async function saveReminderConfig(cfg: ReminderConfig): Promise<void> {
  await localDb.execute(
    `INSERT OR REPLACE INTO lo_meta (key, value) VALUES (?, ?)`,
    [REMINDER_META_KEY, JSON.stringify(cfg)],
    { tables: ['lo_meta'] },
  );
}

// ---------------------------------------------------------------------------
// Native module access (lazy-required so web / Expo Go never hard-import it)
// ---------------------------------------------------------------------------

function getNotifications(): typeof import('expo-notifications') | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null; // native module absent (Expo Go / web)
  }
}

/**
 * Call once at startup (idempotent). Foreground handler so reminders show as
 * banners even when foregrounded. Safe no-op where the module is unavailable.
 */
export function configureNotificationHandler(): void {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // ignore — never break a render
  }
}

/** Request notification permission. Returns granted; safe false off-iOS/web. */
export async function requestPermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Cancel all scheduled Life OS notifications, then re-register from config via
 * the pure planWeek(). Each planned item becomes a repeating WEEKLY trigger.
 * iOS-effective; safe no-op on web / where the native module is absent. Wrapped
 * in try/catch so a scheduler crash never propagates to the caller.
 */
export async function rescheduleAll(cfg?: ReminderConfig): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  const config = cfg ?? (await loadReminderConfig());
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const r of planWeek(config)) {
      const parsed = parseTime(r.time);
      if (!parsed) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: r.title, body: r.body, sound: false },
        trigger: {
          type: 'weekly',
          weekday: r.weekday + 1, // expo-notifications: 1=Sun..7=Sat
          hour: parsed.hour,
          minute: parsed.minute,
          repeats: true,
        } as import('expo-notifications').WeeklyTriggerInput,
      });
    }
  } catch {
    // Never throw into a render or logging flow.
  }
}
