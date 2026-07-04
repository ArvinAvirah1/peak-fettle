/**
 * tierPolicy — TICKET-094 (founder decisions, 2026-06-06)
 *
 * Single source of truth for WHERE a user's personal data lives, per the locked
 * decisions:
 *   • Provider = Supabase (auth + Pro server storage + the opaque backup blob).
 *   • Pro tier → personal data is stored server-side exactly as currently
 *     implemented, which is what enables live MULTI-DEVICE SYNC.
 *   • Free tier → local-first (on-device SQLite); protected by the E2E-encrypted
 *     blob backup (Supabase Storage), NOT live server sync.
 *   • Key model unchanged: data key in the platform keychain + a recovery code as
 *     the universal fallback (the encryption layer itself is the remaining
 *     native + security-review build).
 *
 * This module deliberately contains only the pure tier policy so every read/write
 * path can branch consistently. The data-layer move + crypto + blob transport
 * consume these predicates.
 */

export interface TierUser {
  is_paid?: boolean | null;
}

/** Pro users sync personal data through the server (live multi-device). */
export function syncsToServer(user: TierUser | null | undefined): boolean {
  return !!user?.is_paid;
}

/** Free users keep personal data on-device (local-first). */
export function isLocalFirst(user: TierUser | null | undefined): boolean {
  return !syncsToServer(user);
}

/**
 * Free (local-first) users rely on the E2E-encrypted backup blob for durability.
 * Pro users are covered by server sync, so the blob backup is optional for them.
 */
export function usesBlobBackup(user: TierUser | null | undefined): boolean {
  return isLocalFirst(user);
}

/** Human-readable summary for settings / onboarding copy. */
export function storageModeLabel(user: TierUser | null | undefined): string {
  return syncsToServer(user)
    ? 'Synced across your devices (Pro)'
    : 'Stored on this device, with encrypted backup';
}

/**
 * TICKET-138 (2026-07-03) — routine share-link carve-out.
 *
 * Creating or fetching a routine share link (mobile/src/data/shareLinks.ts,
 * server/routes/shareLinks.js) is an EXPLICIT, user-initiated network action
 * — the user tapped "Share" on a routine, or opened a link someone sent them.
 * This is the SAME carve-out class as the group weekly-signal POST
 * (src/data/groupSignals.ts): it is allowed on the free/local-first tier even
 * though isLocalFirst(user) is true, because the user directly triggered it
 * (not a background/on-mount fetch) and it does not read/sync the user's
 * personal workout history — only the ONE routine they chose to share.
 *
 * What stays local-first regardless of tier: the IMPORTED routine itself.
 * importSharedRoutine() writes the result through data/routines.ts, which
 * still branches on isLocalFirst(user) — a free user's import is an on-device
 * INSERT, never a personal REST round-trip to persist the result. Only the
 * fetch of the shared blob (a POST to create, or a GET to read someone else's
 * shared blob) is exempted from the "no personal REST calls" rule, and only
 * because it is not personal data of the CALLING user in the read case (it's
 * whichever routine the sharer chose to expose), and is user-triggered in the
 * create case.
 */
