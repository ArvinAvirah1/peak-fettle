/**
 * alternatives.ts — typed client for GET /exercises/:id/alternatives
 *
 * PRO-gated endpoint (requireAuth + requirePaid on the server).
 * Used by the "Choose alternative exercise (machine busy)" stepper action
 * introduced in TICKET-082.
 *
 * On 402/403 (unentitled) this module does NOT swallow the error or return [].
 * It rethrows with `err.isPaywall = true` so the caller can route to the
 * paywall sheet instead of a silent fail (TICKET-069 / TICKET-077 AC#4).
 *
 * No mock fallback (TICKET-067).
 */

import axios from 'axios';
import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Public types  (FROZEN — Agent 4 codes against exactly these shapes)
// ---------------------------------------------------------------------------

export interface AlternativeExercise {
  id: string;
  name: string;
  equipment: string | null;
  muscle_heads: string[];
  shared_heads: string[];
  is_compound: boolean;
  score: number;
}

export interface AlternativesResult {
  source: { id: string; name: string };
  tagged: boolean;
  alternatives: AlternativeExercise[];
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

/**
 * Fetch ranked alternative exercises for `exerciseId`.
 *
 * @param exerciseId  UUID of the exercise to find alternatives for.
 * @param opts.avoid  Equipment string to de-prioritise (e.g. `'machine'` for
 *                    the "machine is busy" use-case). Passed as query param.
 * @param opts.limit  Max number of alternatives to return (server caps at 20).
 *
 * @throws  With `(err as any).isPaywall = true` when the server returns 402 or
 *          403 (user lacks Pro entitlement). Caller must route to the paywall.
 * @throws  Other network / server errors rethrown normally.
 */
export async function getAlternatives(
  exerciseId: string,
  opts?: { avoid?: string; limit?: number },
): Promise<AlternativesResult> {
  // Build query params — only include defined values.
  const params: Record<string, string | number> = {};
  if (opts?.avoid !== undefined) params.avoid = opts.avoid;
  if (opts?.limit !== undefined) params.limit = Math.min(opts.limit, 20);

  try {
    const response = await apiClient.get<AlternativesResult>(
      `/exercises/${exerciseId}/alternatives`,
      { params: Object.keys(params).length > 0 ? params : undefined },
    );
    return response.data;
  } catch (err: unknown) {
    // Attach paywall marker on 402 / 403 so the UI can route to the upgrade
    // sheet rather than showing a generic error or silent empty list.
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 402 || status === 403) {
        (err as any).isPaywall = true;
      }
    }
    throw err;
  }
}
