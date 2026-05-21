/**
 * Push notifications service — expo-notifications wrapper.
 *
 * TICKET-024: FCM push integration — real implementation.
 *
 * ── Installation requirement ──────────────────────────────────────────────
 * Push notifications require expo-notifications and a development build
 * (EAS build or bare workflow). They do NOT work in Expo Go.
 *
 * Android: add the google-services.json (from Firebase Console) to the
 * project root and configure in app.json:
 *   {
 *     "android": { "googleServicesFile": "./google-services.json" }
 *   }
 *
 * iOS: APNs is configured automatically by Expo. An Apple Developer account
 * with push capability is required.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { patchProfile } from '../api/user';

// ---------------------------------------------------------------------------
// Permission + token registration
// ---------------------------------------------------------------------------

/**
 * Request notification permissions, retrieve the Expo/FCM push token, and
 * persist it to the server via PATCH /user/profile.
 *
 * Silent by design — never throws, never shows UI. Push registration must
 * never crash or block the app startup flow.
 *
 * Called once from RootNavigator after isLoading transitions to false.
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  try {
    // Android requires a notification channel before requesting permissions.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    // Request permissions — may show the system dialog on first call.
    const { status } = await Notifications.requestPermissionsAsync();

    if (status !== 'granted') {
      // User denied or dismissed — silently bail out.
      return;
    }

    // Retrieve the Expo push token (routes through Expo's FCM relay).
    const token = await Notifications.getExpoPushTokenAsync();

    // Persist the token server-side so the FCM dispatcher can target this device.
    await patchProfile({ fcm_token: token.data });
  } catch {
    // Swallow all errors — push registration must never crash the app.
    // Failures here are non-fatal: the user simply won't receive push
    // notifications until the next successful registration attempt.
  }
}

// ---------------------------------------------------------------------------
// Foreground notification handler
// ---------------------------------------------------------------------------

/**
 * Configure how notifications are displayed when the app is in the foreground.
 * Call this once at app startup (in app/_layout.tsx or AuthContext).
 *
 * Default behaviour: show alert + play sound + show badge.
 */
export function setForegroundNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// ---------------------------------------------------------------------------
// Notification response listener
// ---------------------------------------------------------------------------

/**
 * Subscribe to notification tap events (user taps a delivered notification).
 * Returns an unsubscribe function — call it on cleanup.
 *
 * @param onResponse - Called with the notification response when the user taps.
 */
export function addNotificationResponseListener(
  onResponse: (data: { notificationId: string; data: Record<string, unknown> }) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      onResponse({
        notificationId: response.notification.request.identifier,
        data: response.notification.request.content.data as Record<string, unknown>,
      });
    }
  );

  return () => subscription.remove();
}
