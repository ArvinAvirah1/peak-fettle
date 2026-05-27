/**
 * Plans API module — training plan CRUD + AI generation.
 *
 * Server docs: peak-fettle-agents/server/routes/plans.js
 *
 * IMPORTANT: POST /plans/generate is a PAID-TIER feature gated server-side
 * on is_paid. The UI must also check user.is_paid before showing the
 * "Generate plan" button (to avoid a round-trip 403). The server enforces
 * the gate regardless, so this is defence-in-depth only.
 *
 * AI generation uses Claude Haiku 4.5 (~2.5¢/plan, CTO cost guardrail).
 */

import { apiClient } from './client';
import {
  Plan,
  PlanWithStructure,
  PlansResponse,
  GeneratePlanResponse,
} from '../types/api';

/**
 * List all plans for the authenticated user plus global templates.
 */
export async function getPlans(): Promise<Plan[]> {
  const response = await apiClient.get<PlansResponse>('/plans');
  return response.data.plans;
}

/**
 * Fetch a single plan including its full structure/session data.
 */
export async function getPlan(id: string): Promise<PlanWithStructure> {
  const response = await apiClient.get<PlanWithStructure>(`/plans/${id}`);
  return response.data;
}

/**
 * Generate an AI training plan session for the authenticated user.
 *
 * Requires is_paid = true. The server reads workout history, health metrics,
 * and physical constraints from the DB before calling Claude Haiku 4.5.
 * The generated plan is persisted automatically and returned in the response.
 *
 * @throws 403 ApiError with error: 'paid_tier_required' if user is on free tier.
 * @throws 502 ApiError with error: 'ai_parse_error' | 'ai_schema_error' on Haiku failure.
 */
export async function generatePlan(): Promise<GeneratePlanResponse> {
  const response = await apiClient.post<GeneratePlanResponse>('/plans/generate');
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
 * Regenerate the AI content for an existing plan in-place.
 *
 * TICKET-058: calls POST /plans/:id/regenerate which re-runs the Haiku prompt
 * against fresh workout history and replaces the plan's `structure` column.
 * The plan_id is preserved so the user keeps the same record active.
 *
 * Subject to the same 3/day throttle as /generate (server-enforced).
 * @throws 429 if the daily limit has been reached.
 * @throws 403 if the user is on the free tier.
 */
export async function regeneratePlan(id: string): Promise<GeneratePlanResponse> {
  const response = await apiClient.post<GeneratePlanResponse>(`/plans/${id}/regenerate`);
  return response.data;
}
