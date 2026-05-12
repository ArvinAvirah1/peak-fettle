/**
 * Push token API module — register and unregister FCM/APNs device tokens.
 *
 * Server endpoint: POST /user/push-token
 *
 * TODO(backend): The /user/push-token endpoint is not yet built on the server.
 * Add it to peak-fettle-agents/server/routes/user.js:
 *
 *   POST /user/push-token
 *   Body: { token: string, platform: 'ios' | 'android' }
 *   Action: upsert into a push_tokens table (user_id, token, platform, updated_at)
 *   The FCM sender (future feature) reads this table to deliver notifications.
 *
 * This client module is defined now so AuthContext can wire it immediately
 * when the server endpoint ships.
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
