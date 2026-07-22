# FIX-COSMETIC-ALIAS — backward-compat for the b3a7792 accent-id rename

**Date:** 2026-06-20
**Branch:** fix/full-review-2026-06-19
**Class:** P0 data-loss prevention (cosmetic equip)
**Trigger:** commit `b3a7792` ("fix(cosmetics): namespace ids + enforce unlock gating")
renamed the six accent-theme cosmetic ids. Users who already equipped an accent
have the OLD bare id persisted; after deploy those ids no longer resolve and the
equipped accent silently reverts to `none`.

## The rename (from `git show b3a7792 -- …/peakAvatarOptions.ts`)

`ACCENT_THEME` / `ACCENT_THEME_IDS` keys were namespaced with an `accent*` prefix
(hex palette UNCHANGED — keys only). Old → new:

| old id   | new id         |
|----------|----------------|
| `gold`   | `accentGold`   |
| `silver` | `accentSilver` |
| `teal`   | `accentTeal`   |
| `rose`   | `accentRose`   |
| `sky`    | `accentSky`    |
| `violet` | `accentViolet` |

(`none` was unchanged.) The rename was correct — the bare ids collided with the
same-named hair-color ids (`teal`/`silver`/`violet`) and the duplicate
`COSMETIC_TIERS` key demoted the `pro` `violet` HAIR color to a streak unlock.
The only side effect to fix is the lost equip for already-equipped users.

## Fix — read-side alias (no data migration)

Added `LEGACY_COSMETIC_ID_ALIASES` (old id → new id) + a `resolveCosmeticId(id, slot)`
helper in `peakAvatarOptions.ts`, and applied it at the two READ paths that resolve
a persisted equipped/stored accent id:

1. `normalizeAvatar()` — rewrites `raw.accentTheme` BEFORE validating it against
   `ACCENT_THEME_IDS`. Covers the on-device `avatar` AvatarConfig blob (the primary
   data-loss path) and every screen that renders through `normalizeAvatar`
   (e.g. `PeakAvatar.tsx`, `AvatarCustomizer.tsx`, `data/avatar.ts loadAvatar`).
2. `getEquipped()` in `cosmeticUnlocks.ts` — rewrites `item_id` as it is read from
   the local SQLite `user_equipped_cosmetics` table (slot `accentTheme`).

### The alias map
```ts
export const LEGACY_COSMETIC_ID_ALIASES: Readonly<Record<string, string>> = {
  gold:   'accentGold',
  silver: 'accentSilver',
  teal:   'accentTeal',
  rose:   'accentRose',
  sky:    'accentSky',
  violet: 'accentViolet',
};
```

### Why slot-scoped (critical safety property)
`resolveCosmeticId` only remaps when `slot === 'accentTheme'`. The bare ids
`teal`/`silver`/`violet` are ALSO legitimate, unrelated ids in the hair-color slot,
and `gold` is a wristband id — remapping them unconditionally would corrupt those
slots. Slot-scoping makes the alias a no-op everywhere except accents.
Non-legacy ids (already-namespaced `accent*`, `none`, `pro` accents like `flame`)
and `undefined` pass through unchanged.

No migration, no schema change, no new table. Covers both local-first (free) and
server-synced (Pro) users, because both ultimately read the AvatarConfig through
`normalizeAvatar` / equipped state through `getEquipped`.

## Server migration — NOT needed (verified)

The SERVER `user_equipped_cosmetics.item_id` is `UUID NOT NULL REFERENCES
cosmetic_items(id)` (db/schema.sql:3643). The server NEVER stores bare avatar
string ids like `gold`/`violet` — it stores `cosmetic_items` UUIDs. A grep of
`peak-fettle-agents/server/` for `accentTheme`/`accentViolet`/`'violet'` found
matches only inside `node_modules`. Therefore the accent-id rename does not touch
any server row and **no SQL migration was written**. (The pre-existing
"MIGRATION NOTE" comment in `peakAvatarOptions.ts` that asserted a server
`UPDATE … user_equipped_cosmetics` was required was INCORRECT for this UUID-keyed
table; it has been replaced with an accurate note pointing at the read-side alias.)

## Files changed
- `mobile/src/components/avatar/peakAvatarOptions.ts`
  - new `LEGACY_COSMETIC_ID_ALIASES` + `resolveCosmeticId()` (after `ACCENT_THEME_IDS`)
  - `normalizeAvatar()` accent line now resolves the id before validating
  - corrected the misleading "MIGRATION NOTE" header comment
- `mobile/src/data/cosmeticUnlocks.ts`
  - import `resolveCosmeticId`; apply it in `getEquipped()`'s row loop

## Verification
- `@babel/parser` parse: `peakAvatarOptions.ts`, `cosmeticUnlocks.ts`,
  `app/cosmetics.tsx`, `data/avatar.ts` → **FAILURES=0**.
- Alias-map coverage: all 6 ids renamed in b3a7792 are keyed; all 6 values exist
  in `ACCENT_THEME_IDS`.
- Behavior smoke test (13 cases, all PASS): every old accent id → its new id;
  already-new / `none` / `pro` / garbage / `undefined` unchanged; and cross-slot
  `hairColor: violet` and `wristband: gold` are NOT remapped.
- No bypassing read path: `PeakAvatar.tsx` reads `cfg.accentTheme` only after
  `normalizeAvatar`. `exportEngine.ts` references are column allow-lists, not id
  resolution.

DoD met: parse-sweep clean for changed files; alias covers every renamed id; no
server migration required (UUID-keyed server table).
