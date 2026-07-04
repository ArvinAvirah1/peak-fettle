/**
 * androidRestNotification — TICKET-137 Android counterpart to liveActivity.ts.
 *
 * Approach chosen (documented per the ticket's requirement to record the
 * approach + its limits): Android has no first-party equivalent of iOS's
 * ActivityKit Live Activity / Dynamic Island, and this repo has no custom
 * native Android module for a true foreground Service (that would need a
 * dedicated expo-module with a Kotlin Service + its own notification channel
 * lifecycle, which is out of scope for this ticket's bridge — see "Limits"
 * below). Instead we use **expo-notifications** to post a single,
 * non-dismissible, `ongoing`-flagged, high-priority notification with a
 * `chronometer`-style countdown, updated by re-posting the SAME
 * notification identifier on every meaningful change (start / +15s / skip /
 * finish / cancel). This is the same primitive `useRestTimer.ts` already
 * uses for the "rest complete" alert — this module only adds the *ongoing*
 * variant with action buttons.
 *
 * Zero network: purely local notification scheduling. Safe on the free tier.
 *
 * Limits (document for the founder / test matrix):
 *   - No true `chronometer` widget (that's a raw Android `Notification`
 *     Builder feature — `setUsesChronometer`/`setChronometerCountDown` —
 *     which expo-notifications does NOT expose). We approximate it by
 *     re-rendering the body text as "0:45 left" and re-posting on every
 *     +15s/skip/finish action AND on a coarse ~10s interval tick while the
 *     app is foregrounded (background ticks are NOT possible without a
 *     foreground Service — the notification will show the LAST posted
 *     value while backgrounded, refreshed the moment the app resumes, and
 *     definitively refreshed at the scheduled "rest complete" trigger).
 *   - No true foreground Service ⇒ Android will NOT keep re-deriving the
 *     countdown text every second while the app is backgrounded/killed (iOS
 *     Live Activities do this natively via ActivityKit; Android does not
 *     have an equivalent surface reachable from Expo without a custom
 *     Service module). The already-scheduled "Rest complete" local
 *     notification (useRestTimer's existing TIME_INTERVAL trigger) still
 *     fires exactly on time regardless — only the *ticking* display is
 *     approximate.
 *   - +15s / Skip actions: implemented as Notification action buttons
 *     (`categoryIdentifier` with `expo-notifications` Android action buttons).
 *     Tapping one delivers a background notification-response event to JS
 *     (`Notifications.addNotificationResponseReceivedListener`, already
 *     wireable from useRestTimer without any new native module — Android
 *     notification actions round-trip through the JS notification listener,
 *     unlike iOS App Intents which need the ActivityKit bridge). This keeps
 *     Android free of any new native module.
 *   - Respects the OS notification-permission flow: every post is wrapped
 *     so a denied/undetermined permission just silently no-ops (matches the
 *     zero-crash rule for optional platform features elsewhere in this repo).
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'rest-timer-ongoing';
const NOTIFICATION_ID = 'pf-rest-timer-ongoing';
export const REST_ACTION_CATEGORY = 'rest-timer-actions';

export const REST_ACTION_ADD15 = 'REST_ADD_15';
export const REST_ACTION_SKIP = 'REST_SKIP';

let categoryRegistered = false;

/** Registers the ongoing channel + the +15s/Skip action category. Idempotent, Android-only, never throws. */
export async function ensureAndroidRestSetup(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Rest Timer (ongoing)',
      importance: Notifications.AndroidImportance.HIGH,
      sound: null,
      vibrationPattern: [0],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // best-effort
  }
  if (!categoryRegistered) {
    categoryRegistered = true;
    try {
      await Notifications.setNotificationCategoryAsync(REST_ACTION_CATEGORY, [
        { identifier: REST_ACTION_ADD15, buttonTitle: '+15s', options: { opensAppToForeground: false } },
        { identifier: REST_ACTION_SKIP, buttonTitle: 'Skip', options: { opensAppToForeground: false } },
      ]);
    } catch {
      // best-effort
    }
  }
}

function formatRemaining(secondsLeft: number): string {
  const m = Math.floor(Math.max(0, secondsLeft) / 60);
  const s = Math.max(0, secondsLeft) % 60;
  return `${m}:${s.toString().padStart(2, '0')} left`;
}

export interface AndroidRestOngoingArgs {
  exerciseName: string;
  setProgress: string;
  secondsLeft: number;
  finished: boolean;
}

/**
 * Posts (or re-posts, same identifier so it replaces in place) the ongoing
 * rest notification. Re-posting is the "chronometer" approximation described
 * above. Never throws — a failure here must not affect the in-app countdown.
 */
export async function postAndroidRestOngoing(args: AndroidRestOngoingArgs): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await ensureAndroidRestSetup();
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: args.finished ? 'Rest complete' : `Resting · ${args.setProgress}`,
        body: args.finished ? `Time for ${args.exerciseName}` : `${args.exerciseName} — ${formatRemaining(args.secondsLeft)}`,
        sticky: !args.finished,
        autoDismiss: args.finished,
        categoryIdentifier: args.finished ? undefined : REST_ACTION_CATEGORY,
        data: { type: 'rest_timer_ongoing' },
      },
      trigger: null, // fire immediately; this call IS the update
    });
  } catch {
    // best-effort
  }
}

/** Dismisses the ongoing notification (workout finished/discarded). Never throws. */
export async function dismissAndroidRestOngoing(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  } catch {
    // best-effort
  }
}

/**
 * Subscribes to the +15s/Skip action taps. Returns an unsubscribe. This is
 * the Android half of the action round-trip — no native module needed
 * (expo-notifications already surfaces the actionIdentifier here).
 */
export function subscribeToAndroidRestActions(
  onAdd15: () => void,
  onSkip: () => void,
): () => void {
  if (Platform.OS !== 'android') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response.notification.request.identifier !== NOTIFICATION_ID) return;
    if (response.actionIdentifier === REST_ACTION_ADD15) onAdd15();
    else if (response.actionIdentifier === REST_ACTION_SKIP) onSkip();
  });
  return () => sub.remove();
}
