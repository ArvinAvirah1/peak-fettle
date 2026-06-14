/**
 * usePlans — fetches the plan list and manages Training Engine plan generation.
 *
 * Tier + connectivity branching (SPEC-094A Agent P):
 *   Free tier         → existing upsell path (generate returns 403; unchanged).
 *   Pro + online      → server endpoint POST /plans/generate (unchanged).
 *   Pro + offline     → local engine (mobile/src/lib/trainingEngine, Agent M
 *                        contract: same generatePlan API as server module) with
 *                        "generated offline" appended to ruleTrace.
 *
 * Exported API is fully signature-compatible with the pre-patch version.
 *
 * Generation error codes:
 *   paid_tier_required  — 403, user is on free tier
 *   daily_limit_reached — 429, 20 engine plans generated today
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { getPlans, generatePlan } from '../api/plans';
import { Plan, GeneratePlanResponse } from '../types/api';

// ---------------------------------------------------------------------------
// Lazy require of Agent M's mobile trainingEngine port.
// Guard so the hook is safe before M's files land.
// ---------------------------------------------------------------------------

type TrainingEngineModule = {
  generatePlan: (ctx: Record<string, unknown>) => {
    weeks: unknown[];
    session: unknown | null;
    reasoning: string;
    rule_trace: string[];
    engine: string;
  };
};

function tryLoadLocalEngine(): TrainingEngineModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../lib/trainingEngine') as TrainingEngineModule;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Simple offline check (no new dependency — plain fetch with short timeout)
// ---------------------------------------------------------------------------

async function isOnline(): Promise<boolean> {
  try {
    // Attempt a lightweight HEAD to the configured API base URL.
    const base = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
    const ctrl = new AbortController();
    const tid   = setTimeout(() => ctrl.abort(), 3000);
    const res   = await fetch(`${base}/health`, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(tid);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Hook return shape (unchanged exported API)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePlans(): UsePlansResult {
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);

  const [plans,         setPlans]         = useState<Plan[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (localFirst) {
        // Free users: no server plan list — return empty (upsell path handles it).
        setPlans([]);
        return;
      }
      // Pro: fetch from server (unchanged).
      const fetched = await getPlans();
      setPlans(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setIsLoading(false);
    }
  }, [localFirst]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = useCallback(async (): Promise<GeneratePlanResponse> => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      if (localFirst) {
        // Free tier: existing upsell — the 403 shape signals the UI to show the
        // upgrade prompt. Throw the same shape the server would return so callers
        // handle it identically.
        const err = new Error('Upgrade to Pro to generate personalised plans.');
        (err as Error & { code?: string }).code = 'paid_tier_required';
        throw err;
      }

      // Pro: check connectivity and branch.
      const online = await isOnline();
      if (online) {
        // Pro + online: server (unchanged).
        const result = await generatePlan();
        await load();
        return result;
      }

      // Pro + offline: local engine.
      const engine = tryLoadLocalEngine();
      if (!engine) {
        throw new Error('Training Engine not available offline yet — please connect to generate.');
      }

      // Build a minimal ctx from the user profile (full context requires server
      // history/exercises which aren't available offline). This produces a
      // sensible default plan; accuracy improves when back online.
      const ctx: Record<string, unknown> = {
        profile: {
          experience_level: user?.experience_level ?? null,
          sex:              user?.sex ?? null,
          age_band:         user?.age_band ?? null,
          weight_class_kg:  user?.weight_class_kg ?? null,
          primary_discipline: (user as Record<string, unknown> | null)?.primary_discipline ?? null,
        },
        exercises:   [],
        history:     [],
        pbs:         [],
        metrics:     [],
        constraints: [],
        userId:      user?.id ?? 'anon',
        today:       new Date(),
      };

      const raw = engine.generatePlan(ctx);
      const offlineResult: GeneratePlanResponse = {
        ...(raw as Partial<GeneratePlanResponse>),
        // Append an "offline" note so the UI can surface it if needed.
        rule_trace: [...(raw.rule_trace ?? []), 'Generated offline — reconnect and regenerate for personalised loading.'],
      } as GeneratePlanResponse;

      // Don't call load() — offline plan is not persisted to server yet.
      return offlineResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Plan generation failed';
      setGenerateError(message);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, [localFirst, load, user]);

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
