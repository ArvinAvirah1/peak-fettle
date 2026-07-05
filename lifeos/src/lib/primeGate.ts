/**
 * primeGate.ts (TICKET-166) — tiny once-only gate for the notification
 * permission "prime" card.
 *
 * T166: permission priming must be CONTEXTUAL (shown at a meaningful moment,
 * e.g. the plan-reveal completion screen) and ONCE-ONLY — never re-asked on
 * every visit, and never requested during the onboarding survey itself. This
 * module only tracks "have we shown the prime card yet?"; it does not touch
 * the OS permission itself (see src/services/notifications.ts for that).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIME_SHOWN_KEY = 'lifeos.notifPrime.shown';

/**
 * Whether the contextual notification prime card should be shown. True iff
 * the flag has never been set. Fails closed on storage error (returns false)
 * so a transient read failure can never re-surface the prime repeatedly.
 */
export async function shouldShowPrime(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(PRIME_SHOWN_KEY);
    return value == null;
  } catch {
    return false;
  }
}

/**
 * Mark the prime card as shown (regardless of the user's choice — "Turn on
 * reminders" and "Not now" both count as having been primed). Best-effort:
 * never throws.
 */
export async function markPrimeShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(PRIME_SHOWN_KEY, 'true');
  } catch {
    // Best-effort — a failed write just means the prime may show again,
    // which is acceptable and preferable to throwing.
  }
}
