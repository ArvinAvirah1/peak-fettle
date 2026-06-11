/**
 * insights.ts — API layer for the Insights & Recovery screen.
 *
 * Calls:
 *   GET  /insights/recovery  → RecoveryResponse
 *   GET  /insights/readiness → ReadinessResponse
 *   GET  /insights/deload    → DeloadResponse
 *   POST /insights/deload/ack → { ok: true }
 *
 * All field names match the spec §4 contract verbatim.
 * Error handling mirrors the rest of the API layer (warn + return null).
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Recovery heatmap
// ---------------------------------------------------------------------------

export interface MuscleRecovery {
  muscle: string;
  freshness: number;            // 0–100
  last_worked: string | null;   // ISO timestamp or null
  sets_last_session: number;
}

export interface RecoveryResponse {
  muscles: MuscleRecovery[];
  generated_at: string;
  rule_trace: string[];
}

export async function getRecovery(): Promise<RecoveryResponse | null> {
  try {
    const res = await apiClient.get<RecoveryResponse>('/insights/recovery');
    return res.data;
  } catch (err) {
    console.warn('[PF] insights/getRecovery:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Readiness score
// ---------------------------------------------------------------------------

export interface ReadinessComponent {
  name: string;
  value: number;
  weight: number;
  detail: string;
}

export type ReadinessBand = 'push' | 'maintain' | 'rest' | 'unknown';

export interface ReadinessResponse {
  score: number | null;
  band: ReadinessBand;
  components: ReadinessComponent[];
  rule_trace: string[];
}

export async function getReadiness(): Promise<ReadinessResponse | null> {
  try {
    const res = await apiClient.get<ReadinessResponse>('/insights/readiness');
    return res.data;
  } catch (err) {
    console.warn('[PF] insights/getReadiness:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deload recommendation
// ---------------------------------------------------------------------------

export interface DeloadResponse {
  recommended: boolean;
  triggers: string[];
  prescription: string;
  rule_trace: string[];
}

export async function getDeload(): Promise<DeloadResponse | null> {
  try {
    const res = await apiClient.get<DeloadResponse>('/insights/deload');
    return res.data;
  } catch (err) {
    console.warn('[PF] insights/getDeload:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function ackDeload(): Promise<boolean> {
  try {
    await apiClient.post('/insights/deload/ack');
    return true;
  } catch (err) {
    console.warn('[PF] insights/ackDeload:', err instanceof Error ? err.message : String(err));
    return false;
  }
}
