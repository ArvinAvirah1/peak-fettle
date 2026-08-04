/**
 * RevenueCat configuration constants (2026-08-01 billing integration).
 *
 * The SDK key below is the PUBLIC iOS App-Store SDK key from the RevenueCat
 * dashboard (project "PeakFettle") — it is safe to ship in the client bundle
 * by design (it can only be used to make purchases on behalf of the app, never
 * to read/mutate other users or issue refunds). It lives in this module (not
 * inlined at the call site) so it is swappable in one place if the RevenueCat
 * project is ever rotated/re-created.
 *
 * The secret REST key (REVENUECAT_SECRET_KEY) and the webhook shared secret
 * (REVENUECAT_WEBHOOK_AUTH) are SERVER-ONLY env vars on Railway — never put
 * them here.
 */

/** Public RevenueCat SDK key for the iOS App Store app (com.peakfettle.app). */
export const REVENUECAT_IOS_API_KEY = 'appl_hRmUxRCuTrCEnYFMyPdOieXmmiy';

/**
 * Entitlement identifier configured in the RevenueCat dashboard.
 * EXACT string, including the space — `customerInfo.entitlements.active`
 * is keyed on it verbatim.
 */
export const PRO_ENTITLEMENT_ID = 'PeakFettle Pro';

/**
 * Package identifiers inside the "default" offering that have real App Store
 * products attached. The offering ALSO contains a `$rc_weekly` package with NO
 * App Store product — RevenueCat omits product-less packages from
 * `availablePackages` on iOS automatically, but we filter defensively anyway
 * and NEVER assume a fixed package count.
 */
export const PRO_PACKAGE_MONTHLY = '$rc_monthly'; // → pf_pro_monthly (auto-renewing monthly)
export const PRO_PACKAGE_ANNUAL = '$rc_annual'; // → pf_pro_yearly (1-year upfront)
