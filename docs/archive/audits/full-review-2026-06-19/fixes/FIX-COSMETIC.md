# FIX-COSMETIC — cosmetic tier-bypass P0 (S3-03 / S3-08)

Branch: `fix/full-review-2026-06-19` · Implementer: FIX-COSMETIC (Opus)
Rationale: `audits/full-review-2026-06-19/synthesis/SYNTH-3.md`

## Files changed
- `mobile/src/components/avatar/peakAvatarOptions.ts`
- `mobile/src/data/cosmeticUnlocks.ts`
- `mobile/src/components/avatar/AvatarCustomizer.tsx`

## Fixes (one line each)
1. Namespaced the accent-theme ids to `accent*` (`accentGold/accentSilver/accentTeal/accentRose/accentViolet/accentSky`) in `ACCENT_THEME`, `ACCENT_THEME_IDS`, and `COSMETIC_TIERS`, removing the duplicate keys (`silver`/`violet`/`gold`/`teal`/`rose`/`sky`) that collided with hair-color keys — this restores hair `violet: 'pro'` (was silently demoted to `{streak:100}`, letting free users earn a paid item) and clears all TS1117 duplicates (verified 0 dup keys; 46 unique).
2. Fixed the wristband ID↔tier mismatch: removed the dead `*_wristband` tier keys and keyed wristbands by their BARE display ids (`gold`/`neon` = `{streak:30}`; `teal` resolves via the hair `teal` `{streak:7}` — same tier, so no duplicate key) so `isUnlocked('neon'/'gold')` is now gated instead of falling through to free. Kept display ids bare because `PeakAvatar.WRISTBAND_COLORS` (out-of-scope file) renders the band by bare id.
3. Added an exported `tierKeyForId(catKey, id)` resolver (single source of truth, identity today) + a `__DEV__`-guarded integrity check that asserts every `*_IDS` id resolves, every color id is in its color map, the three streak wristbands are gated, and no accent id collides with a hair-color id.
4. `cosmeticUnlocks.isUnlocked` now treats an UNKNOWN id (not in any catalog `*_IDS`) as LOCKED instead of defaulting to `'free'`; a known id with no tier entry stays free (no regression for the many legitimately-free options).
5. `cosmeticUnlocks.setEquipped` now ENFORCES the gate — never persists a locked/unknown item, returns `{ rejected }`. Added an optional `ctx?: UnlockCtx` 3rd arg: with it, full streak/Pro validation; without it (legacy callers) the unknown-id guard still blocks garbage/stale ids and a `__DEV__` warning fires.
6. `AvatarCustomizer.tsx`: removed its local `tierKeyFor` (which mapped wristbands to the now-deleted `*_wristband` keys and would have over-locked them) and routed both call sites through the shared `tierKeyForId`; dropped the now-unused `COSMETIC_TIERS` import. Accent gating already resolves via the namespaced `cat.ids`.
7. Added the required migration comment in `peakAvatarOptions.ts` (NOT the SQL): existing `user_equipped_cosmetics` rows with `slot='accentTheme'` and `item_id IN ('gold','silver','teal','rose','sky','violet')` must be one-shot UPDATEd to the `accent*` ids, else those users' equipped accent falls back to `'none'` on next load.

## Verification
- `@babel/parser` parse-sweep of all 3 files: **0 failures** (the earlier in-session "failures" were a stale/truncated bash-mount mirror — the Read-tool/Windows view was always correct; verified by parsing faithful reconstructed copies of the real content).
- Runtime logic check on the actual tier map: 0 duplicate keys; `violet` free@streak100 = locked, Pro = unlocked; `accentViolet`@streak100 = unlocked; `neon`/`gold` wristband @streak0 = locked; `white`/`mint`/`none` = unlocked (free); `GARBAGE_xyz` & stale `teal_wristband` = locked; 0 accent↔hair collisions.

## Concerns / follow-ups (for integration pass)
- **`app/cosmetics.tsx` (out of my scope) still passes bare ids and calls `setEquipped(user.id, {[slot]: optionId})` WITHOUT a ctx.** Result after this fix: accent (`accentGold` etc.) and wristband (`gold`/`neon`) gating in that screen is now CORRECT (ids are unique/keyed), and the unknown-id guard runs — but full streak/Pro enforcement at the equip call there only kicks in once someone threads the live `{ streak, isPaid }` ctx into `setEquipped`. Low risk (the chip-level `isUnlocked` already render-gates equip), but the integration/Opus pass should pass `ctx` to `setEquipped` in `cosmetics.tsx` to make the persistence gate fully authoritative. `cosmetics.tsx` also shows the raw id as the label (e.g. `accentGold`) — cosmetic only; consider `prettify`.
- **Wristband ids were intentionally NOT namespaced to `teal_wristband`** (as the ticket's literal suggestion) because `PeakAvatar.tsx` `WRISTBAND_COLORS` (out of my edit scope) keys the rendered band on the bare id; renaming there would have drawn no band. The bare-id keying is fully correct given accent is namespaced. If a future change DOES namespace wristbands, `PeakAvatar.WRISTBAND_COLORS` must be updated in lockstep.
- The one-shot accent migration UPDATE (item 7) must be run before/with deploy or existing Pro/streak users lose their equipped accent.
- `tsc` not run here (gate runs after, per instructions); the optional `ctx` param keeps the existing `cosmetics.tsx` call type-valid, and the unused-import was removed, so no new errors expected from these files.
