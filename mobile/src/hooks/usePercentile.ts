/**
 * usePercentile — provides percentile ranking rows for the Rankings screen.
 *
 * 2026-08-02: the server `user_percentile_rankings` pipeline was dropped on
 * 2026-06-12 ("percentiles compute on-device") but the promised local source
 * was never built, so this hook returned an empty response for EVERY user and
 * the Rankings screen never rendered a rank. Rankings rows now come from
 * on-device data (src/data/localRankings.ts — best e1RM per competition lift
 * from local SQLite sets); the screen computes the actual percentiles from
 * them via strengthModelV3.
 *
 *   • Free/local-first users: local rows only, zero network (invariant #1).
 *   • Pro users: GET /percentile is still tried first (it degrades to an empty
 *     list on the dropped tables), and the local rows are used whenever the
 *     server has nothing — which today is always.
 *
 * Returns: { response, isLoading, error, refetch }
 */

import { useState, useEffect, useCallback } from 'react';
import { getPercentile } from '../api/percentile';
import { PercentileResponse } from '../types/api';
import { useAuth } from './useAuth';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { getLocalRankings } from '../data/localRankings';
import { useTableChange } from './useTableChange';

export interface UsePercentileResult {
  response: PercentileResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePercentile(): UsePercentileResult {
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);
  const userId = user?.id ?? null;

  const [response, setResponse] = useState<PercentileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRankings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!localFirst) {
        // Pro: server first. Its rankings list is empty since the 2026-06-12
        // table drop, but keep the call so a future server pipeline (or
        // cohort_note copy) flows through untouched.
        try {
          const data = await getPercentile();
          if (data?.rankings?.length) {
            setResponse(data);
            return;
          }
        } catch {
          // Server unreachable/degraded — fall through to the local source.
        }
      }
      const rankings = await getLocalRankings(userId);
      // cohort_note '' — the screen falls back to its default copy.
      setResponse({ rankings, cohort_note: '' });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load rankings';
      setError(message);
      setResponse(null);
    } finally {
      setIsLoading(false);
    }
  }, [localFirst, userId]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  // Newly logged sets recompute the rank without a manual pull-to-refresh.
  // Local writes only fire these notifications, so this stays network-free.
  useTableChange(['sets'], () => void fetchRankings(), { debounceMs: 900 });

  return {
    response,
    isLoading,
    error,
    refetch: fetchRankings,
  };
}
