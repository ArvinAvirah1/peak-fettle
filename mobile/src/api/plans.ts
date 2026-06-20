/**
 * Plans API module — training plan CRUD + Training Engine generation.
 *
 * Server docs: peak-fettle-agents/server/routes/plans.js
 *
 * IMPORTANT: POST /plans/generate is a PAID-TIER feature gated server-side
 * on is_paid. The UI must also check user.is_paid before showing the
 * "Generate plan" button (to avoid a round-trip 403). The server enforces
 * the gate regardless, so this is defence-in-depth only.
 *
 * Generation uses the Peak Fettle Training Engine (pf-engine-v1), a
 * deterministic sports-science rule engine. No external AI calls.
 * Updated 2026-06-11 — response now includes rule_trace[] and engine field.
 */

import { apiClient } from './client';
import {
  Plan,
  PlanWithStructure,
  PlansResponse,
  GeneratePlanResponse,
} from '../types/api';

// ---------------------------------------------------------------------------
// Extended generate response (Training Engine — spec §3)
// ---------------------------------------------------------------------------

/**
 * Extended generate/regenerate response shape from the Training Engine.
 * Superset of GeneratePlanResponse — backward compatible: session and weeks
 * fields are preserved.
 */
export interface EngineGenerateResponse extends GeneratePlanResponse {
  /**
   * 1–2 sentence reasoning string citing a concrete user data point
   * (e.g. a PB, e1RM, HRV trend, or "fewer than 3 sessions logged").
   */
  reasoning: string;
  /**
   * Full rule-trace chain from the Training Engine pipeline.
   * Each string is a human-readable explanation of one decision step.
   */
  rule_trace: string[];
  /**
   * Engine identifier — always 'pf-engine-v1' for Training Engine plans.
   * Absent on legacy Haiku-generated plans (use plan.is_ai_generated to
   * distinguish, but never surface the engine name as "AI").
   */
  engine?: string;
}

/**
 * List all plans for the authenticated user plus global templates.
 */
export async function getPlans(): Promise<Plan[]> {
  const response = await apiClient.get<PlansResponse>('/plans');
  return response.data?.plans ?? [];
}

/**
 * Fetch a single plan including its full structure/session data.
 */
export async function getPlan(id: string): Promise<PlanWithStructure> {
  const response = await apiClient.get<PlanWithStructure>(`/plans/${id}`);
  return response.data;
}

/**
 * Generate a Training Engine plan for the authenticated user.
 *
 * Requires is_paid = true. The server reads workout history, health metrics,
 * physical constraints, and the training survey profile from the DB, then
 * runs the deterministic pf-engine-v1 pipeline synchronously.
 * The generated plan is persisted automatically and returned in the response.
 *
 * @throws 403 ApiError with error: 'paid_tier_required' if user is on free tier.
 * @throws 429 ApiError when the 20 plans/day limit is exceeded.
 */
export async function generatePlan(): Promise<EngineGenerateResponse> {
  const response = await apiClient.post<EngineGenerateResponse>('/plans/generate');
  return response.data;
}

/**
 * Delete a user-owned plan by ID. Global templates cannot be deleted.
 */
export async function deletePlan(id: string): Promise<void> {
  await apiClient.delete(`/plans/${id}`);
}

/**
 * Mark one user-owned plan as active (the currently-followed program).
 * PLANS-001 (2026-05-19): the server transactionally deactivates any other
 * active plan for the same user, so the at-most-one constraint always holds.
 *
 * @throws 404 if the plan is a template or does not belong to the caller.
 */
export async function activatePlan(id: string): Promise<Plan> {
  const response = await apiClient.post<Plan>(`/plans/${id}/activate`);
  return response.data;
}

/**
 * Clear the active plan (step away from any followed program).
 * Idempotent — no-ops if no plan is currently active.
 */
export async function deactivateAllPlans(): Promise<void> {
  await apiClient.post('/plans/deactivate');
}

/**
 * Regenerate the Training Engine plan for an existing plan in-place.
 *
 * TICKET-058: calls POST /plans/:id/regenerate which re-runs the engine
 * against fresh workout history and replaces the plan's `structure` column.
 * The plan_id is preserved so the user keeps the same record active.
 *
 * Subject to the same 20/day throttle as /generate (server-enforced).
 * @throws 429 if the daily limit has been reached.
 * @throws 403 if the user is on the free tier.
 */
export async function regeneratePlan(id: string): Promise<EngineGenerateResponse> {
  const response = await apiClient.post<EngineGenerateResponse>(`/plans/${id}/regenerate`);
  return response.data;
}
