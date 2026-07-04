/**
 * shareLinks — client module for TICKET-138 (routine share links + deep-link
 * import).
 *
 * Two directions:
 *   createShareLink(user, routineId)  — POST /routines/:id/share (auth'd).
 *   revokeShareLink(user, routineId)  — DELETE /routines/:id/share (auth'd).
 *   importSharedRoutine(user, linkId, userId) — GET /share/:linkId (PUBLIC,
 *     no auth needed to READ the blob — the recipient may not even be logged
 *     in yet in principle, though v1 requires an existing account to save the
 *     imported routine) → allowlistExercise EACH entry (NO blind spread —
 *     DATA-01) → save as a brand-new LOCAL routine via the tier-branched data
 *     layer (mobile/src/data/routines.ts), so a free-tier importer never
 *     touches a personal REST endpoint to STORE the result.
 *
 * Tier / local-first posture (CLAUDE.md §1 + tierPolicy.ts comment):
 *   Creating or fetching a share link is an explicit, user-initiated network
 *   action (the user tapped "Share" or opened a link) — the SAME carve-out
 *   class as the group weekly-signal POST. It is allowed on the free tier.
 *   What must stay local-first is the ROUTINE DATA ITSELF: the imported
 *   routine is written through data/routines.ts, which already branches on
 *   isLocalFirst(user) — free users get an on-device INSERT, Pro users get a
 *   real POST /routines. This module never bypasses that branch.
 *
 * PURE-ish: the only side effects are the two network calls (apiClient) and
 * the routines data-layer call. No RN-only APIs, so it is unit-test-friendly
 * via the same ts-transpile-and-eval harness used elsewhere in src/data.
 */

import { apiClient } from '../api/client';
import type { RoutineExercise, Routine } from '../api/routines';
import { allowlistExercise } from './routineExerciseFields';
import { createRoutine } from './routines';
import type { TierUser } from './backup/tierPolicy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateShareLinkResult {
  link_id: string;
  expires_at: string;
  deep_link: string;
  preview_url: string;
}

/** Raw shape returned by GET /share/:linkId — untrusted, allowlist on read. */
export interface SharedRoutineBlob {
  name: unknown;
  days?: unknown;
  exercise_count?: unknown;
  exercises: unknown;
  deep_link?: unknown;
}

// ---------------------------------------------------------------------------
// Deep-link parsing
// ---------------------------------------------------------------------------

/**
 * Extract the share-link id from a `peak-fettle://routine/<id>` deep link (or
 * the equivalent https preview URL path `/share/<id>`). Returns null if the
 * URL doesn't match either shape. Kept as a pure string parse (no expo-linking
 * dependency) so it can be unit tested without RN.
 */
export function parseRoutineShareUrl(url: string): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  // peak-fettle://routine/<id>[?...]
  let m = url.match(/^[a-zA-Z0-9.+-]+:\/\/routine\/([A-Za-z0-9_-]{8,64})(?:[/?#].*)?$/);
  if (m) return m[1] ?? null;
  // https://<host>/share/<id>[?...]  (web preview / universal link fallback)
  m = url.match(/\/share\/([A-Za-z0-9_-]{8,64})(?:[/?#].*)?$/);
  if (m) return m[1] ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// Create / revoke — auth'd, explicit user action (both tiers)
// ---------------------------------------------------------------------------

/**
 * Create (or refresh) a share link for a routine the caller owns. Free AND
 * Pro users may call this — see the tier-policy note above. Always a live
 * POST regardless of tier; there is no local-only variant because a share
 * link is inherently a server-hosted resource (someone else must be able to
 * fetch it without the owner's device).
 */
export async function createShareLink(routineId: string): Promise<CreateShareLinkResult> {
  const res = await apiClient.post<CreateShareLinkResult>(`/routines/${routineId}/share`);
  return res.data;
}

/** Revoke (delete) the caller's share link for a routine. Idempotent. */
export async function revokeShareLink(routineId: string): Promise<void> {
  await apiClient.delete(`/routines/${routineId}/share`);
}

// ---------------------------------------------------------------------------
// Import — fetch (public) → allowlist (DATA-01) → save as a new local routine
// ---------------------------------------------------------------------------

/**
 * Fetch a shared routine's blob by link id. This is a PUBLIC read (no auth
 * header required by the server), but apiClient will still attach a Bearer
 * token if the caller is logged in — the server ignores it for this route.
 */
async function fetchSharedRoutineBlob(linkId: string): Promise<SharedRoutineBlob> {
  const res = await apiClient.get<SharedRoutineBlob>(`/share/${linkId}`);
  return res.data;
}

/**
 * Import a shared routine: fetch the untrusted blob, allowlist every exercise
 * entry (never a blind `{...e}` spread — DATA-01), then save it as a brand
 * new routine via the tier-branched data layer (free = local SQLite insert,
 * Pro = POST /routines). Returns the newly created Routine.
 *
 * @param user     Current TierUser (drives isLocalFirst branching downstream).
 * @param linkId   The share-link id parsed from the deep link / URL.
 * @param userId   Local-tier owner id (mirrors createRoutine's signature).
 */
export async function importSharedRoutine(
  user: TierUser | null | undefined,
  linkId: string,
  userId: string,
): Promise<Routine> {
  const blob = await fetchSharedRoutineBlob(linkId);

  const name = typeof blob.name === 'string' && blob.name.trim().length > 0
    ? blob.name.trim().slice(0, 100)
    : 'Shared routine';

  const rawExercises = Array.isArray(blob.exercises) ? blob.exercises : [];
  const exercises: RoutineExercise[] = rawExercises
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => allowlistExercise(e))
    .slice(0, 30); // mirrors the server's ExerciseEntrySchema array cap

  return createRoutine(user, { name, exercises }, userId);
}
