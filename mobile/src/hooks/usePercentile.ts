/**
 * usePercentile — fetches all percentile rankings for the current user.
 *
 * Wraps getPercentile() from src/api/percentile.ts with loading, error, and
 * empty-state handling. Rankings are batch-computed weekly, so an empty array
 * is an expected non-error state for new users.
 *
 * Returns: { response, isLoading, error, refetch }
 *   response  — PercentileResponse | null (null while loading or on error)
 *   isLoading — true during the initial fetch and any subsequent refetch
 *   error     — human-readable error string, or null if all is well
 *   refetch   — manually trigger a fresh fetch (e.g. on user pull-to-refresh)
 */

import { useState, useEffect, useCallback } from 'react';
import { getPercentile } from '../api/percentile';
import { PercentileResponse } from '../types/api';

export interface UsePercentileResult {
  response: PercentileResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePercentile(): UsePercentileResult {
  const [response, setResponse] = useState<PercentileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPercentile();
      setResponse(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load rankings';
      setError(message);
      setResponse(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    response,
    isLoading,
    error,
    refetch: fetch,
  };
}
