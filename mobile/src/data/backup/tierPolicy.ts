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
