/**
 * User API module — data export and account management.
 *
 * Server docs: peak-fettle-agents/server/routes/user.js
 *
 * Both endpoints are rate-limited server-side:
 *   data-export: 5 requests per hour
 *   account deletion: 3 requests per 15 minutes
 *
 * Training Engine profile fields added 2026-06-11 (spec §5):
 *   training_goal, sessions_per_week, session_minutes, equipment_profile,
 *   goal_weight_kg, season_phase
 */

import { apiClient } from './client';
import { UnitPref } from '../types/api';

// ---------------------------------------------------------------------------
// Data export
// ---------------------------------------------------------------------------

/**
 * Returns the full data export URL.
 * The response is a JSON attachment with Content-Disposition: attachment.
 * Use Linking.openURL() or fetch + share to trigger a download on mobile.
 *
 * On iOS/Android the cleanest approach is to fetch the blob and write it to
 * the app's document directory, then present a Share sheet.
 *
 * This function calls the API and returns the JSON blob as a string so the
 * caller can share or save it.
 */
export async function fetchDataExport(): Promise<string> {
  const response = await apiClient.get<unknown>('/user/data-export');
  return JSON.stringify(response.data, null, 2);
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

/**
 * Permanently delete the authenticated user's account and all data.
 *
 * This is IRREVERSIBLE. The caller must display a confirmation before calling.
 *
 * @param confirmPhrase - Must be the exact string "DELETE MY ACCOUNT".
 */
export async function deleteAccount(
  confirmPhrase: 'DELETE MY ACCOUNT'
): Promise<void> {
  await apiClient.delete('/user/account', {
    data: { confirm: confirmPhrase },
  });
}

// ---------------------------------------------------------------------------
// Training Engine vocabulary types (spec §2, §5)
// ---------------------------------------------------------------------------

/** Closed set — must match server CHECK constraint. */
export type TrainingGoal =
  | 'strength'
  | 'hypertrophy'
  | 'endurance'
  | 'sport_performance'
  | 'general_fitness';

/** Closed set — must match server CHECK constraint. */
export type SessionMinutes = 15 | 30 | 45 | 60 | 90;

/** Closed set — spec §2 equipment vocabulary. */
export type EquipmentItem =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'bands'
  | 'bench'
  | 'rack'
  | 'pullup_bar'
  | 'bike'
  | 'treadmill'
  | 'pool'
  | 'track';

/** Closed set — must match server CHECK constraint. */
export type SeasonPhase = 'off_season' | 'in_season';

// ---------------------------------------------------------------------------
// Profile update
// ---------------------------------------------------------------------------

/**
 * Partial profile update — unit preference, experience level, weight class,
 * 1RM confirmation opt-in, theme preference, and Training Engine survey fields.
 *
 * Server: PATCH /user/profile  (also accepts /users/profile — both routed)
 */
export interface PatchProfilePayload {
  unit_pref?: UnitPref;
  experience_level?: string;
  weight_class_kg?: number;
  /** Option C opt-in (TICKET-041). true = prompt user to confirm each estimate. */
  use_1rm_confirmation?: boolean;
  /**
   * E-002: Selected theme. Persisted to Supabase for cross-device sync.
   * Must match ThemeName in mobile/src/theme/types.ts.
   */
  theme_preference?: 'deepOcean' | 'ember' | 'forest' | 'midnight' | 'monochrome';
  /** ROADMAP 1.6 — biological sex for percentile cohort routing. */
  sex?: 'MALE' | 'FEMALE' | 'UNDISCLOSED';
  /** ROADMAP 1.6 — primary sport/discipline. */
  primary_discipline?: string;
  /** TICKET-024 — Expo/FCM push token. Pass null to clear (e.g. on logout). */
  fcm_token?: string | null;
  /** Opt-out of streak milestone push notifications. Default: true (opted in). */
  streak_notifications_enabled?: boolean;
  /** Opt-out of plan-ready push notifications. Default: true (opted in). */
  plan_notifications_enabled?: boolean;
  /** TICKET-066: user opted in to seeing their Wilks2 score in the rankings tab. */
  show_wilks?: boolean;

  // ── Training Engine survey fields (spec §2, 2026-06-11) ──────────────────
  /** Primary training objective. */
  training_goal?: TrainingGoal;
  /** Target sessions per week (1–7). */
  sessions_per_week?: number;
  /** Target session length in minutes. Allowed: 15, 30, 45, 60, 90. */
  session_minutes?: SessionMinutes;
  /** Available equipment — closed vocabulary from spec §2. */
  equipment_profile?: EquipmentItem[];
  /** Optional goal body weight in kg. */
  goal_weight_kg?: number | null;
  /** Competitive season phase — only relevant for team/mixed-sport disciplines. */
  season_phase?: SeasonPhase | null;
}

export async function patchProfile(payload: PatchProfilePayload): Promise<void> {
  await apiClient.patch('/users/profile', payload);
}
