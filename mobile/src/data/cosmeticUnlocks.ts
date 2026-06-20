/**
 * cosmeticUnlocks — unlock-state helpers + equipped-selection persistence.
 *
 * This module is the single point of truth for answering "can this user use
 * this cosmetic option right now?" and for persisting/restoring what they have
 * equipped. It works in tandem with COSMETIC_TIERS from peakAvatarOptions.ts.
 *
 * LOCAL-FIRST INVARIANT: all reads/writes go through the existing
 * `user_cosmetics` and `user_equipped_cosmetics` tables in the local SQLite DB
 * (defined in localSchema.ts). No REST calls are made. No new tables are added.
 *
 * Callers supply streak and isPaid directly — do NOT import the streak hook
 * here, keeping this module pure and testable outside React.
 */

import { localDb } from '../db/localDb';
import {
  COSMETIC_TIERS,
  AVATAR_CATEGORIES,
  tierKeyForId,
  resolveCosmeticId,
  type UnlockTier,
  type CosmeticTiersMap,
  type AvatarCategory,
} from '../components/avatar/peakAvatarOptions';

declare const __DEV__: boolean | undefined;

// Every id that is a legitimate catalog option, across all categories. An id that is
// NOT in this set is unknown/garbage (typo, removed item, tampered persisted value)
// and is treated as LOCKED — we must not silently default an unrecognized id to 'free'
// and let it be equipped. A *known* id that simply has no COSMETIC_TIERS entry is a
// free option (most ids) and remains unlocked. The accent ids are namespaced (accent*)
// and the bare wristband ids live here too, so both resolve correctly.
const KNOWN_OPTION_IDS: ReadonlySet<string> = new Set(
  AVATAR_CATEGORIES.flatMap((cat) => cat.ids),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal context callers must supply (streak + paid status). */
export interface UnlockCtx {
  streak: number;
  isPaid: boolean;
}

/** Shape of a row in user_equipped_cosmetics. */
interface EquippedRow {
  slot: string;
  item_id: string;
  equipped_at: string;
}

/** Shape of a row in user_cosmetics. */
interface OwnedRow {
  item_id: string;
  acquired_at: string;
  acquisition_source: string;
}

// ---------------------------------------------------------------------------
// Core predicate
// ---------------------------------------------------------------------------

/**
 * Returns true if the given option id is accessible to the user.
 *
 * Tier ladder:
 *   unknown id (not a known catalog option) → LOCKED (false) — never default to free
 *   known id, no entry in COSMETIC_TIERS    → 'free' → always true
 *   { streak: N }                           → ctx.streak >= N
 *   'pro'                                   → ctx.isPaid === true
 *
 * An UNKNOWN id resolves to LOCKED, not free: a typo'd, removed, or tampered
 * persisted id must never be silently equippable. (Pass ids through
 * `tierKeyForId(cat.key, id)` from peakAvatarOptions before calling this.)
 */
export function isUnlocked(
  optionId: string,
  ctx: UnlockCtx,
  tiers: CosmeticTiersMap = COSMETIC_TIERS,
): boolean {
  const tier: UnlockTier | undefined = tiers[optionId];
  if (tier === undefined) {
    // No tier entry: free ONLY if it's a recognized catalog id; otherwise locked.
    return KNOWN_OPTION_IDS.has(optionId);
  }
  if (tier === 'free') return true;
  if (tier === 'pro')  return ctx.isPaid;
  // { streak: N }
  return ctx.streak >= tier.streak;
}

// ---------------------------------------------------------------------------
// Batch filter
// ---------------------------------------------------------------------------

/**
 * Filters an id list (or any option array) to those currently accessible.
 * Preserves original order; never mutates the input.
 */
export function listUnlocked(
  optionIds: string[],
  ctx: UnlockCtx,
  tiers: CosmeticTiersMap = COSMETIC_TIERS,
): string[] {
  return optionIds.filter(id => isUnlocked(id, ctx, tiers));
}

// ---------------------------------------------------------------------------
// Human-readable unlock label (for locked-state UI badges)
// ---------------------------------------------------------------------------

/**
 * Returns a short, display-ready label for the unlock requirement.
 *
 * Examples:
 *   'free'       → 'Free'
 *   { streak: 7 }  → '7-day streak'
 *   { streak: 30 } → '30-day streak'
 *   'pro'        → 'Pro'
 */
export function unlockLabel(
  optionId: string,
  tiers: CosmeticTiersMap = COSMETIC_TIERS,
): string {
  const tier: UnlockTier = tiers[optionId] ?? 'free';
  if (tier === 'free') return 'Free';
  if (tier === 'pro')  return 'Pro';
  return `${tier.streak}-day streak`;
}

// ---------------------------------------------------------------------------
// Equipped-selection persistence
// ---------------------------------------------------------------------------

/**
 * Reads the user's currently equipped cosmetic selection from
 * `user_equipped_cosmetics` (keyed by `slot`).
 *
 * Returns a map of slot → item_id. Returns an empty object (not null) when no
 * rows exist, so callers can safely spread over it.
 *
 * @param userId  The current user id (from auth context / user_profile row).
 */
export async function getEquipped(userId: string): Promise<Record<string, string>> {
  try {
    const rows = await localDb.getAll<EquippedRow>(
      `SELECT slot, item_id FROM user_equipped_cosmetics WHERE user_id = ?`,
      [userId],
    );
    const result: Record<string, string> = {};
    for (const row of rows) {
      // Rewrite a legacy (pre-b3a7792) bare accent id to its namespaced id so an
      // already-equipped accent survives the rename. resolveCosmeticId only
      // remaps the accentTheme slot; every other slot/id passes through verbatim.
      result[row.slot] = resolveCosmeticId(row.item_id, row.slot as AvatarCategory['key']) ?? row.item_id;
    }
    return result;
  } catch {
    // Table may not yet exist on older schema versions — degrade gracefully.
    return {};
  }
}

/**
 * Persists the user's equipped cosmetic selection. Upserts one row per slot in
 * `user_equipped_cosmetics`.
 *
 * GATING (P0): this now ENFORCES unlock status — a locked item is NEVER persisted.
 * Pass the live `UnlockCtx` ({ streak, isPaid }) as the 3rd arg to fully validate
 * streak/Pro tiers. Even when `ctx` is omitted (legacy callers), an UNKNOWN/garbage
 * id is still rejected, so a tampered or stale id can never be equipped. The set of
 * rejected ids is returned so callers can surface "still locked" feedback.
 *
 * Ids are resolved through `tierKeyForId(slot, id)` so category-specific tier keys
 * (e.g. wristbands) gate correctly.
 *
 * @param userId    The current user id.
 * @param selection A map of slot → item_id (e.g. { outfit: 'hoodie', headwear: 'cap' }).
 * @param ctx       Live unlock context. STRONGLY recommended — without it only the
 *                  unknown-id guard runs (streak/Pro tiers can't be evaluated).
 * @returns the item_ids that were refused (locked / unknown).
 */
export async function setEquipped(
  userId: string,
  selection: Record<string, string>,
  ctx?: UnlockCtx,
): Promise<{ rejected: string[] }> {
  const now = new Date().toISOString();
  const rejected: string[] = [];
  for (const [slot, itemId] of Object.entries(selection)) {
    const tierKey = tierKeyForId(slot as AvatarCategory['key'], itemId);
    // With a ctx: full tier check. Without: only block truly unknown ids (can't
    // evaluate streak/Pro), and warn so the caller gets wired to pass a ctx.
    const allowed = ctx
      ? isUnlocked(tierKey, ctx)
      : KNOWN_OPTION_IDS.has(tierKey);
    if (!allowed) {
      rejected.push(itemId);
      if (!ctx && typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          `[cosmeticUnlocks] setEquipped called without ctx; could not fully ` +
            `gate '${itemId}' in slot '${slot}'. Pass { streak, isPaid } to enforce tiers.`,
        );
      }
      continue;
    }
    await localDb.execute(
      `INSERT INTO user_equipped_cosmetics (user_id, slot, item_id, equipped_at)
         VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, slot) DO UPDATE SET item_id = excluded.item_id,
                                                equipped_at = excluded.equipped_at`,
      [userId, slot, itemId, now],
      { tables: ['user_equipped_cosmetics'] },
    );
  }
  return { rejected };
}

// ---------------------------------------------------------------------------
// Owned-items ledger (grant / query)
// ---------------------------------------------------------------------------

/**
 * Records that the user has acquired a cosmetic item (e.g. via a streak
 * milestone celebration, a pro purchase, etc.). Idempotent: a second call for
 * the same item is a no-op.
 *
 * @param userId  The current user id.
 * @param itemId  The cosmetic option id (e.g. 'crownGold', 'gradient_aurora').
 * @param source  How it was acquired: 'streak' | 'purchase' | 'system' | 'gift'.
 */
export async function grantCosmetic(
  userId: string,
  itemId: string,
  source: 'streak' | 'purchase' | 'system' | 'gift' = 'system',
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await localDb.execute(
      `INSERT OR IGNORE INTO user_cosmetics (user_id, item_id, acquired_at, acquisition_source)
         VALUES (?, ?, ?, ?)`,
      [userId, itemId, now, source],
      { tables: ['user_cosmetics'] },
    );
  } catch {
    // Silently ignore — table may not exist on old schema; unlock check is the gate.
  }
}

/**
 * Returns the set of item_ids the user has been explicitly granted (via streak
 * milestones, purchases, etc.) in the user_cosmetics ledger. This is separate
 * from the live `isUnlocked` check: `grantCosmetic` can be used to permanently
 * bank an item at a given streak milestone even if the streak later resets.
 *
 * NOTE: the current isUnlocked() is a live check against current streak/tier —
 * it does NOT consult this ledger. Use getOwned() only for "permanent grant"
 * flows (milestone banners, Pro downgrade grace, etc.).
 */
export async function getOwned(userId: string): Promise<Set<string>> {
  try {
    const rows = await localDb.getAll<OwnedRow>(
      `SELECT item_id FROM user_cosmetics WHERE user_id = ?`,
      [userId],
    );
    return new Set(rows.map(r => r.item_id));
  } catch {
    return new Set();
  }
}
