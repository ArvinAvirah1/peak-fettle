/**
 * Percentile rankings API module.
 *
 * Server docs: peak-fettle-agents/server/routes/percentile.js
 *
 * CTO guardrail: percentile is a FREE feature — it must NOT be gated behind
 * is_paid. Rankings are batch-computed weekly; no live math runs per-request.
 * Rankings may not exist yet if the user hasn't logged the lift or the cron
 * hasn't run since they started (server returns 404 in that case).
 */

import { apiClient } from './client';
import { Confirm1rmPayload, PercentileRanking, PercentileResponse } from '../types/api';

/**
 * Fetch all percentile rankings for the authenticated user.
 * Returns an empty rankings array (not an error) if no rankings exist yet.
 */
export async function getPercentile(): Promise<PercentileResponse> {
  const response = await apiClient.get<PercentileResponse>('/percentile');
  return response.data;
}

/**
 * Fetch the percentile ranking for a specific lift.
 * @param liftId - snake_case lift identifier e.g. "back_squat", "bench_press"
 * @returns The ranking, or null if no ranking exists yet for this lift.
 */
/**
 * Confirm (or override) the 1RM estimate for a specific lift.
 * Stored in user_confirmed_1rm server-side. The next weekly batch run will
 * use this value and set is_estimated=false for the ranking.
 *
 * TICKET-041 / Option C.
 */
export async function confirm1rm(payload: Confirm1rmPayload): Promise<void> {
  await apiClient.post('/percentile/confirm-1rm', payload);
}

export async function getPercentileForLift(liftId: string): Promise<PercentileRanking | null> {
  try {
    const response = await apiClient.get<PercentileRanking>(`/percentile/${liftId}`);
    return response.data;
  } catch (err: unknown) {
    // The server returns 404 when no ranking exists — treat as "not yet computed".
    if (
      typeof err === 'object' &&
      err !== null &&
      'response' in err &&
      (err as { response?: { status?: number } }).response?.status === 404
    ) {
      return null;
    }
    throw err;
  }
}
