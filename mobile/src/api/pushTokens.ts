/**
 * Push token API module — register and unregister Expo device push tokens.
 *
 * Server: POST /user/push-token  (TICKET-065 — implemented)
 *         DELETE /user/push-token
 *
 * Token transport note (PUSH-001/L-013):
 *   Tokens come from Notifications.getExpoPushTokenAsync() — ExponentPushToken[…]
 *   format. The server stores them in users.fcm_token and the push-dispatcher
 *   routes them through the Expo Push API (exp.host), NOT FCM directly.
 *   Never send an Expo token to FCM's `to` field — it will be rejected as
 *   InvalidRegistration and the token will be silently wiped (PUSH-001).
 */

import { apiClient } from './client';

export type PushPlatform = 'ios' | 'android';

export interface RegisterPushTokenPayload {
  token: string;
  platform: PushPlatform;
}

/**
 * Register a device push token with the server.
 * Called once after login and after every token rotation.
 *
 * Safe to call multiple times — the server upserts on (user_id, token).
 */
export async function registerPushToken(
  payload: RegisterPushTokenPayload
): Promise<void> {
  await apiClient.post('/user/push-token', payload);
}

/**
 * Unregister the push token (call on logout to stop notifications for this device).
 */
export async function unregisterPushToken(token: string): Promise<void> {
  await apiClient.delete('/user/push-token', { data: { token } });
}
