/**
 * Billing API module — per-user Pro tier toggle (Phase 6).
 *
 * Two thin endpoints, both behind `requireAuth` server-side (the new routes in
 * peak-fettle-agents/server/routes/user.js):
 *
 *   • POST /user/upgrade   → flips the server `tier` to 'paid'. Idempotent
 *                            (re-calling on an already-paid user is a no-op 200).
 *   • POST /user/downgrade → flips the server `tier` to 'free'. KEEPS all server
 *                            rows (no DELETE); free mode simply stops reading /
 *                            writing the server and reverts to local-first.
 *                            Idempotent.
 *
 * Both return the updated `User` (with the derived `is_paid` boolean the client
 * carries everywhere). The caller (AuthContext.upgradeToPro/downgradeToFree) is
 * responsible for the SAFE state-transition ORDER — these helpers are pure
 * transport over the shared authed apiClient.
 *
 * Naming note: the underlying server flag is `users.tier` ('free'|'paid'); the
 * server has NO `is_paid` column — it returns `(tier = 'paid') AS is_paid` so the
 * client `User` shape is unchanged.
 */

import { apiClient } from './client';
import { User } from '../types/api';

/**
 * Flip the authenticated user to Pro (server `tier='paid'`).
 *
 * IMPORTANT (Phase-6 transition order): the data upload (migrateLocalDataToServer)
 * MUST complete successfully BEFORE this is called, so a mid-upload crash leaves
 * the user safely still-free rather than "Pro with empty server data".
 *
 * Idempotent: calling it again on an already-paid user returns the same 200.
 *
 * @returns the updated user (`is_paid === true`, `tier === 'paid'`).
 */
export async function upgradeToProRequest(): Promise<User> {
  const response = await apiClient.post<{ user: User }>('/user/upgrade');
  return response.data.user;
}

/**
 * Flip the authenticated user back to Free (server `tier='free'`).
 *
 * Per DECIDED POLICY this NEVER deletes server rows — the server keeps the data,
 * free mode just stops reading/writing it (local-first). The local SQLite still
 * holds everything, so free mode works offline immediately; no download step is
 * needed.
 *
 * Idempotent.
 *
 * @returns the updated user (`is_paid === false`, `tier === 'free'`).
 */
export async function downgradeToFreeRequest(): Promise<User> {
  const response = await apiClient.post<{ user: User }>('/user/downgrade');
  return response.data.user;
}
