/**
 * purchases.ts — RevenueCat (react-native-purchases) service wrapper.
 *
 * Same deferred/inert pattern as widgetBridge / intentBridge / watchMirror:
 * the native module is loaded LAZILY via require(), so this file is safe to
 * import everywhere (Expo Go, Android, simulator, or an iOS build made before
 * react-native-purchases was compiled in — the require simply fails and every
 * function becomes a no-op / rejects with a friendly error).
 *
 * iOS-ONLY by design: Peak Fettle bills through the App Store. On any other
 * platform `purchasesAvailable()` is false and configure/logIn are no-ops.
 *
 * Boot safety (CLAUDE.md #5 + the iOS-26 TurboModule hazard): configure is
 * called from app/_layout.tsx AFTER InteractionManager.runAfterInteractions,
 * fire-and-forget with a catch — it must never block or crash cold start.
 *
 * Local-first note: RevenueCat SDK traffic goes to RevenueCat, not to the
 * Peak Fettle API — it carries no personal workout data. Offerings/purchase
 * calls only happen on the user-initiated paywall surface.
 *
 * NO static `import` of 'react-native-purchases': the dependency is added to
 * package.json but may not be installed in every checkout yet, and a static
 * import would break tsc/bundling until `npm install` runs. The minimal
 * structural types below cover everything we consume from the SDK.
 */

import { Platform } from 'react-native';
import {
  REVENUECAT_IOS_API_KEY,
  PRO_ENTITLEMENT_ID,
} from '../constants/revenuecat';

// ---------------------------------------------------------------------------
// Minimal structural types for the slice of the RevenueCat SDK we use.
// (Intentionally partial — see the "no static import" note above.)
// ---------------------------------------------------------------------------

export interface RCStoreProduct {
  identifier: string;
  /** Localized, currency-formatted price string from StoreKit (e.g. "£6.99"). */
  priceString: string;
  title: string;
  description: string;
}

export interface RCPackage {
  /** RevenueCat package identifier, e.g. '$rc_monthly' / '$rc_annual'. */
  identifier: string;
  packageType: string;
  product: RCStoreProduct;
}

export interface RCEntitlementInfo {
  identifier: string;
  isActive: boolean;
}

export interface RCCustomerInfo {
  entitlements: {
    active: Record<string, RCEntitlementInfo>;
  };
  originalAppUserId?: string;
}

export interface RCOffering {
  identifier: string;
  availablePackages: RCPackage[];
}

export interface RCOfferings {
  current: RCOffering | null;
  all: Record<string, RCOffering>;
}

interface RCPurchasesModule {
  configure(opts: { apiKey: string; appUserID?: string | null }): void;
  isConfigured(): Promise<boolean>;
  logIn(appUserID: string): Promise<{ customerInfo: RCCustomerInfo; created: boolean }>;
  logOut(): Promise<RCCustomerInfo>;
  getOfferings(): Promise<RCOfferings>;
  getCustomerInfo(): Promise<RCCustomerInfo>;
  purchasePackage(pkg: RCPackage): Promise<{ customerInfo: RCCustomerInfo }>;
  restorePurchases(): Promise<RCCustomerInfo>;
  addCustomerInfoUpdateListener(listener: (info: RCCustomerInfo) => void): void;
  removeCustomerInfoUpdateListener(listener: (info: RCCustomerInfo) => void): boolean;
}

// ---------------------------------------------------------------------------
// Lazy module resolution
// ---------------------------------------------------------------------------

/** undefined = not yet attempted; null = unavailable (module/native side absent). */
let _mod: RCPurchasesModule | null | undefined;

function resolveModule(): RCPurchasesModule | null {
  if (_mod !== undefined) return _mod;
  if (Platform.OS !== 'ios') {
    _mod = null;
    return _mod;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require('react-native-purchases');
    _mod = (required?.default ?? required) as RCPurchasesModule;
  } catch {
    // Package not installed / native module not compiled into this build.
    _mod = null;
  }
  return _mod;
}

/** True when the RevenueCat SDK is usable in this build (iOS + module present). */
export function purchasesAvailable(): boolean {
  return resolveModule() != null;
}

// ---------------------------------------------------------------------------
// Configure + identity
// ---------------------------------------------------------------------------

let _configured = false;
let _lastLoggedInId: string | null = null;

/**
 * Configure the SDK once (idempotent, iOS-only, never throws). Called from
 * app/_layout.tsx off the boot frame; also self-heals from any later call
 * (logIn/getOfferings call this first).
 */
export function configurePurchases(): void {
  if (_configured) return;
  const mod = resolveModule();
  if (!mod) return;
  try {
    mod.configure({ apiKey: REVENUECAT_IOS_API_KEY });
    _configured = true;
  } catch (err) {
    // Never let billing wiring break boot — leave unconfigured; a later
    // paywall open retries via ensureConfigured().
    // eslint-disable-next-line no-console
    console.warn('[purchases] configure failed:', err);
  }
}

function ensureConfigured(): RCPurchasesModule | null {
  configurePurchases();
  return _configured ? resolveModule() : null;
}

/**
 * Keep the RevenueCat identity in lockstep with the Peak Fettle session.
 * Pass the authenticated user's id (users.id UUID — the SAME id the server
 * webhook maps app_user_id back onto), or null on sign-out. Diffs internally,
 * so it is safe to call on every auth-state change. Fire-and-forget: errors
 * are swallowed (identity converges on the next call / next launch).
 */
export function syncPurchasesIdentity(userId: string | null): void {
  const mod = ensureConfigured();
  if (!mod) return;
  if (userId === _lastLoggedInId) return;
  const prev = _lastLoggedInId;
  _lastLoggedInId = userId;
  if (userId) {
    mod.logIn(userId).catch((err: unknown) => {
      _lastLoggedInId = prev; // retry on the next auth-state change
      // eslint-disable-next-line no-console
      console.warn('[purchases] logIn failed:', err);
    });
  } else if (prev) {
    mod.logOut().catch(() => {
      // Logging out an already-anonymous user throws — safe to ignore.
    });
  }
}

// ---------------------------------------------------------------------------
// Entitlement helpers
// ---------------------------------------------------------------------------

/** True when the "PeakFettle Pro" entitlement is active on this customer. */
export function hasProEntitlement(info: RCCustomerInfo | null | undefined): boolean {
  return info?.entitlements?.active?.[PRO_ENTITLEMENT_ID] != null;
}

// ---------------------------------------------------------------------------
// Storefront operations (paywall surface only)
// ---------------------------------------------------------------------------

function requireModule(): RCPurchasesModule {
  const mod = ensureConfigured();
  if (!mod) {
    throw new Error(
      'In-app purchases are not available in this build. Please update the app.',
    );
  }
  return mod;
}

/** Current offerings (the "default" offering carries the Pro packages). */
export async function getOfferings(): Promise<RCOfferings> {
  return requireModule().getOfferings();
}

/** Latest cached/refreshed customer info, or null when the SDK is unavailable. */
export async function getCustomerInfoSafe(): Promise<RCCustomerInfo | null> {
  const mod = ensureConfigured();
  if (!mod) return null;
  try {
    return await mod.getCustomerInfo();
  } catch {
    return null;
  }
}

/**
 * Purchase a package. Resolves with the updated customer info on success;
 * resolves null when the user cancelled; rejects on a real store error.
 */
export async function purchaseProPackage(pkg: RCPackage): Promise<RCCustomerInfo | null> {
  const mod = requireModule();
  try {
    const { customerInfo } = await mod.purchasePackage(pkg);
    return customerInfo;
  } catch (err) {
    // The SDK marks user-initiated cancels with `userCancelled: true`.
    if (err && typeof err === 'object' && (err as { userCancelled?: boolean }).userCancelled) {
      return null;
    }
    throw err;
  }
}

/** Restore previous purchases (Apple-required). Returns updated customer info. */
export async function restorePurchases(): Promise<RCCustomerInfo> {
  return requireModule().restorePurchases();
}

/**
 * Subscribe to customer-info updates (purchase/renewal/expiry pushed by the
 * SDK). Returns an unsubscribe function; a no-op unsubscribe when unavailable.
 */
export function addCustomerInfoListener(
  listener: (info: RCCustomerInfo) => void,
): () => void {
  const mod = ensureConfigured();
  if (!mod) return () => {};
  try {
    mod.addCustomerInfoUpdateListener(listener);
  } catch {
    return () => {};
  }
  return () => {
    try {
      mod.removeCustomerInfoUpdateListener(listener);
    } catch {
      // best-effort
    }
  };
}
