# SRV-FIX-COSMETICS-GATE — SRV-SOCIAL-01 (P0) cosmetic entitlement

Branch: `fix/full-review-2026-06-19`
File edited: `peak-fettle-agents/server/routes/cosmetics.js` (484 → 491 lines)
Verify: `node --check peak-fettle-agents/server/routes/cosmetics.js` → exit 0.

## Finding (SRV-SOCIAL-01)
The `/cosmetics` router is mounted with `requireAuth` only (`index.js:124`) — no
tier/entitlement middleware — so the audit flagged that a free user could call
`POST /cosmetics/:id/purchase` and `PUT /cosmetics/equipped/:slot` for any item,
making the client-side cosmetic gating bypassable server-side.

## Investigation — where entitlement metadata lives (and where it does NOT)
- **`cosmetic_items` (server catalog, `db/schema.sql` §"Cosmetic items catalog")
  stores only `is_default`, `price_credits`, `rarity`, `category`, `is_active`.
  There is NO `required_streak`, `is_pro`, `tier`, or `min_streak` column** — grep
  across `db/` and `peak-fettle-agents/server` found none. So the server CANNOT
  do per-item Pro-or-streak validation: that metadata does not exist server-side.
- Per-item tier metadata lives ONLY on the **client**: `COSMETIC_TIERS`
  (`mobile/src/components/avatar/peakAvatarOptions.ts`) maps option ids →
  `'free' | { streak: N } | 'pro'`, consumed by `cosmeticUnlocks.isUnlocked`.
- **The live in-app cosmetic system is local-first and makes NO server calls.**
  `mobile/app/cosmetics.tsx` reads/writes equipped state through
  `cosmeticUnlocks` → `localDb` only (grep for client calls to `/cosmetics`,
  `equipped/`, `purchase` = 0 hits). The server `/cosmetics` router is the older
  **Phase D credit-shop**, a separate system.
- **The credit-shop is explicitly free-earnable, not Pro.**
  `group_streak_credits_spec.md`: "Users form small groups and **earn cosmetic
  credits** by hitting their personal weekly fitness goals." `credit_ledger.source`
  ∈ {`group_streak`, `cosmetic_purchase`, `admin_adjustment`} — free users bank
  credits via group streaks. There is no Pro requirement anywhere in this economy.

## What was wrong in the working tree (the prior "fix")
An uncommitted change had blanket-added `requirePaid` to BOTH the purchase and
equip routes ("SOCIAL-01: Pro-gate purchase/equip"). That is **incorrect and
contradicts both the product spec and this ticket** ("DO NOT blanket-require Pro
— free users legitimately earn some cosmetics via streak"): it would 402-block
every free user from the shop they are designed to earn into.

## Fix applied
1. **Removed the blanket `requirePaid` gate** from `POST /:id/purchase` and
   `PUT /equipped/:slot`, and removed the now-unused `requirePaid` import.
2. **Enforced the REAL server-side entitlement, which already exists in-body and
   is the correct gate:**
   - **Equip:** a non-default item requires an OWNERSHIP row in `user_cosmetics`
     (→ 403 `item_not_owned` otherwise). Ownership is written ONLY by a credit
     purchase or `admin_grant`. Defaults are free to all. This makes the
     client-side lock non-bypassable: a free user can equip ONLY defaults + items
     they actually earned/purchased. Re-documented this block as the
     server-authoritative SOCIAL-01 gate (behaviour unchanged; intent made explicit).
   - **Purchase:** the atomic `INSERT … SELECT … WHERE balance >= price` credit
     debit + already-owned (409) + default-item (400) guards already prevent
     acquiring an item without earning the credits. Left intact (correct).

Net: entitlement is enforced via **ownership / credit balance** (which the schema
DOES support), never a blanket tier check (which the schema does NOT support and
the spec forbids).

## What is missing server-side (reported, not guessed)
To enforce finer per-item Pro/streak rules ON THE SERVER (matching the client
`COSMETIC_TIERS`), the catalog would need new metadata it does not have today —
minimally on `cosmetic_items`:
- `required_streak INT NOT NULL DEFAULT 0` (0 = no streak requirement), and/or
- `requires_pro BOOLEAN NOT NULL DEFAULT FALSE`,
plus seed values mirroring `COSMETIC_TIERS`. The handlers could then reject with
403 when `users.tier != 'paid'` for a pro item, or when
`streaks.current_streak_days < required_streak` (both `users.tier` and
`streaks.current_streak_days` ARE available server-side). This was NOT invented
here — adding columns/data is out of this file's edit scope and would need a
migration + a fold into `db/schema.sql`.

NOTE: the `requires_pro = (NOT ci.is_default)` SELECT alias (tagged SOCIAL-06) in
several GETs is a *display* flag only (not a gate) and is misleading — it labels
every non-default item "pro" when most are streak/credit-earned. It does not
create the SOCIAL-01 vulnerability, so it was left as-is, but it should be
revisited under SOCIAL-06.

## Verification
- `node --check peak-fettle-agents/server/routes/cosmetics.js` → exit 0.
- `wc -l` = 491 (was 484; +7 from the added comment block) — not truncated; file
  ends with `module.exports = router;`.
- `grep requirePaid` in the file → 0 matches (import + both gates removed).
