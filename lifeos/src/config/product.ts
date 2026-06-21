/**
 * Product identity constants — Peak Fettle LifeOS companion app.
 *
 * Q7 (app name) RESOLVED 2026-06-20 (founder): the product ships as
 * "Peak Fettle LifeOS". Everything user-facing reads PRODUCT_NAME from here, so
 * any future rename stays a one-line swap. Do NOT hardcode the name in screens,
 * copy, or notification templates.
 *
 * Positioning rule (founder, Q16 2026-06-11): this product is a Life OS —
 * focus, habits, goals, direction. It is NEVER described as a mental-health
 * app in any user-facing copy. See lifeos/CONTENT_SAFETY.md.
 */

export const PRODUCT_NAME = 'Peak Fettle LifeOS'; // Q7 RESOLVED 2026-06-20
export const PRODUCT_SHORT = 'LifeOS';
export const COMPANION_FITNESS_NAME = 'Peak Fettle';

/** Deep-link scheme (matches app.json `scheme`). */
export const URL_SCHEME = 'lifeos';

/** App Group shared with the FamilyControls extensions + widget (matches app.json). */
export const APP_GROUP = 'group.com.peakfettle.lifeos';

/** Defaults for unlock friction (TICKET-104, Q19). */
export const FRICTION_DEFAULTS = {
  /** Escalating wait, seconds, indexed by unlock attempt # that day (caps at last). */
  waitLadderSec: [60, 180, 300, 600, 900],
  /** Breathing gate required from this attempt index onward (0-based). */
  breathingFromAttempt: 1,
  /** Daily quick-unlock (snooze) budget; user-configurable 0–5. */
  snoozeBudget: 3,
  /** Minutes an app stays unlocked after friction is completed. */
  grantWindowMin: 5,
} as const;
