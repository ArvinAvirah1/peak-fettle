/**
 * usePurchases — React state over the RevenueCat SDK for the paywall surface.
 *
 * Exposes:
 *   • isPro            — true when the "PeakFettle Pro" entitlement is active
 *                        on the STORE side (StoreKit/RevenueCat — distinct from
 *                        the app's `user.is_paid` tier flag, which AuthContext
 *                        owns and which completeProPurchase reconciles).
 *   • available        — false in builds without the native SDK (Android,
 *                        Expo Go, pre-rebuild installs) → the paywall shows a
 *                        fallback message instead of packages.
 *   • monthly / annual — the two purchasable packages from the "default"
 *                        offering (localized price strings included). The
 *                        product-less $rc_weekly package is filtered out and
 *                        the package count is never assumed.
 *   • purchase(pkg)    — runs the StoreKit purchase; resolves updated customer
 *                        info, or null when the user cancelled.
 *   • restore()        — Apple-required Restore Purchases.
 *
 * Network note (local-first invariant): the SDK talks to RevenueCat, not the
 * Peak Fettle API, and only from this explicitly user-opened paywall — no
 * personal workout data is involved.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addCustomerInfoListener,
  getCustomerInfoSafe,
  getOfferings,
  hasProEntitlement,
  purchaseProPackage,
  purchasesAvailable,
  restorePurchases,
  RCCustomerInfo,
  RCPackage,
} from '../services/purchases';
import {
  PRO_PACKAGE_ANNUAL,
  PRO_PACKAGE_MONTHLY,
} from '../constants/revenuecat';

export interface UsePurchasesResult {
  /** SDK usable in this build (iOS + native module compiled in). */
  available: boolean;
  /** Store-side entitlement state (see module docs). */
  isPro: boolean;
  /** True while the initial offerings/customer-info load is in flight. */
  loading: boolean;
  /** Human-readable load error (offerings fetch failed), or null. */
  loadError: string | null;
  /** '$rc_monthly' package (auto-renewing monthly), if configured. */
  monthly: RCPackage | null;
  /** '$rc_annual' package (1-year upfront), if configured. */
  annual: RCPackage | null;
  /** Every purchasable package in the current offering (defensive superset). */
  packages: RCPackage[];
  /** Purchase a package. Null result = user cancelled. Throws on store error. */
  purchase: (pkg: RCPackage) => Promise<RCCustomerInfo | null>;
  /** Restore previous purchases (Apple-required). */
  restore: () => Promise<RCCustomerInfo>;
  /** Re-fetch offerings + customer info (retry after a load error). */
  refresh: () => void;
}

export function usePurchases(): UsePurchasesResult {
  const available = purchasesAvailable();

  const [customerInfo, setCustomerInfo] = useState<RCCustomerInfo | null>(null);
  const [packages, setPackages] = useState<RCPackage[]>([]);
  const [loading, setLoading] = useState<boolean>(available);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Initial load + reload-on-demand.
  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const [offerings, info] = await Promise.all([
          getOfferings(),
          getCustomerInfoSafe(),
        ]);
        if (cancelled) return;
        // Defensive: only packages with a real store product are purchasable.
        // (RevenueCat already omits the product-less $rc_weekly on iOS.)
        const avail = (offerings.current?.availablePackages ?? []).filter(
          (p) => p?.product?.priceString != null,
        );
        setPackages(avail);
        setCustomerInfo(info);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : 'Could not load subscription options.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [available, reloadKey]);

  // Live entitlement updates (purchase completes, renewal, expiry).
  useEffect(() => {
    if (!available) return;
    const unsubscribe = addCustomerInfoListener((info) => {
      setCustomerInfo(info);
    });
    return unsubscribe;
  }, [available]);

  const purchase = useCallback(async (pkg: RCPackage) => {
    const info = await purchaseProPackage(pkg);
    if (info) setCustomerInfo(info);
    return info;
  }, []);

  const restore = useCallback(async () => {
    const info = await restorePurchases();
    setCustomerInfo(info);
    return info;
  }, []);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const monthly = useMemo(
    () => packages.find((p) => p.identifier === PRO_PACKAGE_MONTHLY) ?? null,
    [packages],
  );
  const annual = useMemo(
    () => packages.find((p) => p.identifier === PRO_PACKAGE_ANNUAL) ?? null,
    [packages],
  );

  return {
    available,
    isPro: hasProEntitlement(customerInfo),
    loading,
    loadError,
    monthly,
    annual,
    packages,
    purchase,
    restore,
    refresh,
  };
}
