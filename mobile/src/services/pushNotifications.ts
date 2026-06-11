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
import { registerPushToken } from '../api/pushTokens';

// ---------------------------------------------------------------------------
// Permission + token registration
// ---------------------------------------------------------------------------

/**
 * Request notification permissions, retrieve the Expo push token, and
 * register it with the server via POST /user/push-token.
 *
 * Silent by design — never throws, never shows UI. Push registration must
 * never crash or block the app startup flow.
 *
 * Called once from AuthContext after login / register / silent refresh.
 *
 * Token transport note (PUSH-001/L-013):
 *   getExpoPushTokenAsync() returns an ExponentPushToken[…] string.
 *   This must be sent to the Expo Push API (exp.host), NOT to FCM directly.
 *   The server stores it in users.fcm_token (column name retained for migration
 *   compatibility) and the push-dispatcher sends via exp.host.
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
    const { data: token } = await Notifications.getExpoPushTokenAsync();

    // Register the token with the dedicated push-token endpoint.
    // platform drives future per-platform targeting; the server currently
    // stores the token in users.fcm_token regardless of platform.
    await registerPushToken({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
  } catch {
    // Swallow all errors — push registration must never crash the app.
    // Failures here are non-fatal: the user simply won't receive push
    // notifications until the next successful registration attempt.
  }
}

/**
 * Unregister the push token on logout so the server stops delivering
 * notifications to this device.
 *
 * Fire-and-forget — errors are swallowed. The server only clears the token
 * if it matches the stored value, so concurrent logouts are safe.
 */
export async function unregisterForPushNotificationsAsync(): Promise<void> {
  try {
    const token = await Notifications.getExpoPushTokenAsync().catch(() => null);
    if (token?.data) {
      await import('../api/pushTokens').then(({ unregisterPushToken }) =>
        unregisterPushToken(token.data)
      );
    }
  } catch {
    // Non-fatal — token will expire or be cleared by DeviceNotRegistered on
    // the next dispatch attempt.
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
      // SDK 54 shape: shouldShowBanner/shouldShowList replace the deprecated
      // shouldShowAlert (kept for back-compat with older runtime checks).
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
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
