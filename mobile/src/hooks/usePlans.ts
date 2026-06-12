/**
 * usePlans — fetches the plan list and manages AI plan generation state.
 *
 * Returns:
 *   plans       — array of Plan objects (user's plans + global templates)
 *   isLoading   — true on initial fetch
 *   error       — human-readable error string or null
 *   refetch     — pull-to-refresh trigger
 *   generate    — kicks off AI plan generation (POST /plans/generate)
 *   isGenerating — true while the Haiku call is in flight
 *   generateError — error string from the last generate attempt or null
 *
 * Generation error codes (from server):
 *   paid_tier_required — 403, user is on free tier
 *   ai_parse_error     — 502, Haiku returned malformed JSON (retry safe)
 *   ai_schema_error    — 502, Haiku returned unexpected structure (retry safe)
 *   ai_reasoning_missing — 502, Haiku omitted reasoning field (retry safe)
 */

import { useState, useEffect, useCallback } from 'react';
import { getPlans, generatePlan } from '../api/plans';
import { Plan, GeneratePlanResponse } from '../types/api';

export interface UsePlansResult {
  plans: Plan[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  generate: () => Promise<GeneratePlanResponse>;
  isGenerating: boolean;
  generateError: string | null;
  clearGenerateError: () => void;
}

export function usePlans(): UsePlansResult {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetched = await getPlans();
      setPlans(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = useCallback(async (): Promise<GeneratePlanResponse> => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const result = await generatePlan();
      // Reload the plan list so the newly saved plan shows up.
      await load();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Plan generation failed';
      setGenerateError(message);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, [load]);

  const clearGenerateError = useCallback(() => setGenerateError(null), []);

  return {
    plans,
    isLoading,
    error,
    refetch: load,
    generate,
    isGenerating,
    generateError,
    clearGenerateError,
  };
}
