/**
 * Purchases API module — server-side entitlement sync (RevenueCat billing).
 *
 * One thin endpoint behind `requireAuth` server-side
 * (peak-fettle-agents/server/routes/revenuecat.js):
 *
 *   • POST /purchases/sync → asks the server to reconcile the user's tier with
 *     RevenueCat. If REVENUECAT_SECRET_KEY is set on the server it verifies the
 *     entitlement against the RevenueCat REST API and flips `users.tier` to
 *     'paid' when the "PeakFettle Pro" entitlement is active; otherwise it
 *     trusts the RevenueCat WEBHOOK (POST /revenuecat/webhook) as the source of
 *     truth and just returns the current tier.
 *
 * Returns the same `{ user }` shape as the /user/upgrade route (derived
 * `is_paid`, `tier`), so the caller can drop it straight into AuthContext.
 *
 * Called ONLY from AuthContext.completeProPurchase after a successful StoreKit
 * purchase/restore — never on a free-tier mount (local-first invariant).
 */

import { apiClient } from './client';
import { User } from '../types/api';

/**
 * Reconcile the authenticated user's server tier with their RevenueCat
 * entitlement state. Idempotent; safe to re-call after a restore.
 *
 * @returns the (possibly updated) user. `is_paid` may still be false when the
 *          server could not verify (no secret key + webhook not yet delivered)
 *          — the caller decides whether to trust the on-device StoreKit
 *          entitlement optimistically (it does; the webhook converges the
 *          server within seconds).
 */
export async function syncPurchases(): Promise<User> {
  const response = await apiClient.post<{ user: User }>('/purchases/sync');
  return response.data.user;
}
