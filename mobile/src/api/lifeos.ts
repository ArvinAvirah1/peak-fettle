/**
 * lifeos.ts — thin API helper for the LifeOS companion integration.
 *
 * TICKET-125: only one call is needed — GET /lifeos/whole-person-streak.
 * This endpoint is PRO-only (returns 403 for free users). The profile tab
 * calls this NON-BLOCKING after rendering with the local streak value, so
 * a 403 / network error is always swallowed and never shown to the user.
 *
 * FREE users: this module is imported but `getWholePersonStreak` is NEVER
 * called on their mount path — the tierPolicy gate in the card component
 * ensures that.
 */

import { apiClient } from './client';

export interface WholePersonStreakResponse {
  /** Consecutive days across all LifeOS habits + fitness workouts.
   *  Field name MUST match the server: routes/lifeos.js returns
   *  `{ whole_person_streak: N }` (TICKET-111). */
  whole_person_streak: number;
}

/**
 * Fetch the whole-person streak from the server.
 * Returns null on any error (403, network, etc.) — callers must degrade
 * gracefully to the local streak value.
 *
 * Do NOT call this for free / local-first users.
 */
export async function getWholePersonStreak(): Promise<number | null> {
  try {
    const res = await apiClient.get<WholePersonStreakResponse>('/lifeos/whole-person-streak');
    const days = res.data?.whole_person_streak;
    return typeof days === 'number' && Number.isFinite(days) ? days : null;
  } catch {
    // 403 (free user somehow got here), network error, 5xx — all safe to ignore.
    return null;
  }
}
