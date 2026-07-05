/**
 * Paywall pricing + renewal copy — single source of truth (TICKET-167).
 *
 * Apple 3.1.2 (subscriptions) requires the exact price and renewal terms to
 * be shown before purchase. LifeOS itself never charges or transacts —
 * access is bundled into the companion Peak Fettle Pro subscription, which
 * is purchased in the Peak Fettle app. Do NOT hardcode a guessed price
 * anywhere in a screen; always read PRO_PRICE_LABEL from here.
 */

/**
 * FOUNDER: set the real App Store price string here (e.g. '$X.XX / month').
 * Until set, the upsell shows "Current pricing is shown in the Peak Fettle
 * app" instead of a number — NEVER hardcode a guessed price in screens.
 */
export const PRO_PRICE_LABEL: string | null = null;

/**
 * Accurate, non-fabricated renewal terms. Rendered as a list of caption
 * rows under the price on the upsell screen.
 */
export const RENEWAL_TERMS: readonly string[] = [
  'LifeOS access is included with the companion Peak Fettle Pro subscription.',
  'The subscription is purchased and managed in the Peak Fettle app through the App Store.',
  'It renews automatically until cancelled.',
  'Cancel anytime in App Store subscription settings.',
  'There is no separate LifeOS charge.',
];
