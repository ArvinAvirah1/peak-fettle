/**
 * Peak Fettle — Percentile API calls
 * Free-tier feature: no paywall gate on these routes.
 */

import { apiClient } from './client';

export interface PercentileRanking {
    lift_id:       string;
    percentile:    number;        // 0–100; null if compute returned null
    computed_at:   string;        // ISO timestamp
    model_version: number;
}

export interface PercentileListResponse {
    rankings:     PercentileRanking[];
    cohort_note:  string;
}

/** Fetch all percentile rankings for the current user. */
export async function getAllPercentiles(): Promise<PercentileListResponse> {
    return apiClient.get<PercentileListResponse>('/percentile');
}

/** Fetch one percentile ranking by lift_id (e.g. "back_squat"). */
export async function getPercentileForLift(liftId: string): Promise<PercentileRanking> {
    return apiClient.get<PercentileRanking>(`/percentile/${encodeURIComponent(liftId)}`);
}
