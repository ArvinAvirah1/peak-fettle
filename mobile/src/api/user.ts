/**
 * User API module — data export and account management.
 *
 * Server docs: peak-fettle-agents/server/routes/user.js
 *
 * Both endpoints are rate-limited server-side:
 *   data-export: 5 requests per hour
 *   account deletion: 3 requests per 15 minutes
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
// Profile update
// ---------------------------------------------------------------------------

/**
 * Partial profile update — unit preference, experience level, weight class.
 *
 * TODO(TICKET-026): implement PATCH /user/profile on the server.
 * This stub is defined here so the profile screen can wire it when
 * the backend endpoint ships. Until then, calling it will return a 404.
 */
export interface PatchProfilePayload {
  unit_pref?: UnitPref;
  experience_level?: string;
  weight_class_kg?: number;
  /** Option C opt-in (TICKET-041). true = prompt user to confirm each estimate. */
  use_1rm_confirmation?: boolean;
}

export async function patchProfile(payload: PatchProfilePayload): Promise<void> {
  await apiClient.patch('/user/profile', payload);
}
