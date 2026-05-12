/**
 * Push notifications service — expo-notifications wrapper.
 *
 * TICKET-024: FCM push integration.
 *
 * ── Installation requirement ──────────────────────────────────────────────
 * Push notifications require expo-notifications and a development build
 * (EAS build or bare workflow). They do NOT work in Expo Go.
 *
 *   npx expo install expo-notifications expo-device
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
 *
 * Usage (called from AuthContext after successful login):
 *
 *   import { registerForPushNotifications } from './pushNotifications';
 *   const token = await registerForPushNotifications();
 *   if (token) await registerPushToken({ token, platform });
 *
 * Foreground handler (call once at app root):
 *
 *   import { setForegroundNotificationHandler } from './pushNotifications';
 *   setForegroundNotificationHandler();
 */

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushRegistrationResult {
  token: string;
  platform: 'ios' | 'android';
}

// ---------------------------------------------------------------------------
// Permission + token registration
// ---------------------------------------------------------------------------

/**
 * Request notification permissions and retrieve the Expo/FCM push token.
 *
 * Returns the token string on success, or null if:
 *   - The user denies permission
 *   - Running in Expo Go (physical device required for push)
 *   - expo-notifications is not installed
 *
 * The token is a stable Expo push token (format: ExponentPushToken[...])
 * that routes through Expo's push service. For direct FCM delivery without
 * Expo's relay, swap `getExpoPushTokenAsync` for `getDevicePushTokenAsync`.
 */
export async function registerForPushNotifications(): Promise<PushRegistrationResult | null> {
  // TODO(TICKET-024): replace stub with real implementation once
  // expo-notifications and expo-device are installed:
  //
  // import * as Notifications from 'expo-notifications';
  // import * as Device from 'expo-device';
  //
  // if (!Device.isDevice) {
  //   console.warn('[Push] Push notifications require a physical device.');
  //   return null;
  // }
  //
  // const { status: existingStatus } = await Notifications.getPermissionsAsync();
  // let finalStatus = existingStatus;
  //
  // if (existingStatus !== 'granted') {
  //   const { status } = await Notifications.requestPermissionsAsync();
  //   finalStatus = status;
  // }
  //
  // if (finalStatus !== 'granted') {
  //   console.warn('[Push] Notification permission denied.');
  //   return null;
  // }
  //
  // // Android requires a notification channel to be created first.
  // if (Platform.OS === 'android') {
  //   await Notifications.setNotificationChannelAsync('default', {
  //     name: 'Peak Fettle',
  //     importance: Notifications.AndroidImportance.HIGH,
  //     vibrationPattern: [0, 250, 250, 250],
  //     lightColor: '#818cf8',
  //   });
  // }
  //
  // const tokenData = await Notifications.getExpoPushTokenAsync({
  //   projectId: Constants.expoConfig?.extra?.eas?.projectId,
  // });
  //
  // return {
  //   token: tokenData.data,
  //   platform: Platform.OS as 'ios' | 'android',
  // };

  console.warn('[Push] stub: expo-notifications not yet installed');
  return null;
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
  // TODO(TICKET-024): uncomment once expo-notifications is installed:
  //
  // import * as Notifications from 'expo-notifications';
  //
  // Notifications.setNotificationHandler({
  //   handleNotification: async () => ({
  //     shouldShowAlert: true,
  //     shouldPlaySound: true,
  //     shouldSetBadge: true,
  //   }),
  // });

  console.warn('[Push] stub: expo-notifications not yet installed');
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
  // TODO(TICKET-024): uncomment once expo-notifications is installed:
  //
  // import * as Notifications from 'expo-notifications';
  //
  // const subscription = Notifications.addNotificationResponseReceivedListener(
  //   (response) => {
  //     onResponse({
  //       notificationId: response.notification.request.identifier,
  //       data: response.notification.request.content.data as Record<string, unknown>,
  //     });
  //   }
  // );
  //
  // return () => subscription.remove();

  return () => {};
}
