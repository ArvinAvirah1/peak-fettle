# REVIEW-2 — semantic correctness + regression review

Branch: `fix/full-review-2026-06-19` · Reviewer: REVIEW-2 (Opus, read-only)
Scope: HOOKS-01, cosmetic-gating P0 cluster, LIB-01/LIB-02, S3-01/S3-02.
Method: `git diff origin/main` per file + read surrounding code + traced callers.

---

## `mobile/src/hooks/usePowerSyncLog.ts` — HOOKS-01 — **PASS**

- Diff: `usePowerSyncLog.ts:305` dep array `[todayKey]` → `[todayKey, localFirst, userId]`. This is the correct callback (`initWorkout`, declared at :222) — it is the one that reads `localFirst` (:229) and passes `userId` to `ensureLocalWorkoutForDay(todayKey, userId)` (:233).
- Added deps are primitives: `userId` is `string` (`user?.id ?? ''`, :198), `localFirst` is `boolean` (`isLocalFirst(user)`, :200). `useCallback` compares by `Object.is`, so identity changes only on real value changes — no infinite re-subscribe loop. The downstream `useEffect(() => void initWorkout(), [initWorkout])` (:307) re-runs only on genuine auth/tier change.
- Free-user `userId===''` orphan is closed: at cold-start `user` is null → `userId=''`; when `user` resolves post-mount, `userId` flips `'' → realId`, `initWorkout` is recreated, the effect re-fires, and `ensureLocalWorkoutForDay(todayKey, realId)` runs. No more anonymous workout keyed to empty userId. Pro post-mount resolution likewise re-runs and takes the REST/sync branch. Both Invariant-1 breaches resolved.

---

## Cosmetic-gating P0 — `peakAvatarOptions.ts` + `cosmeticUnlocks.ts` + `AvatarCustomizer.tsx` — **PASS**

- **Accent ids namespaced, no duplicate COSMETIC_TIERS keys.** `ACCENT_THEME` / `ACCENT_THEME_IDS` renamed `gold→accentGold … violet→accentViolet`; `COSMETIC_TIERS` accent entries renamed to match. Verified `COSMETIC_TIERS` has **zero duplicate keys** (`uniq -d` empty). `violet: 'pro'` (hair, peakAvatarOptions.ts:295) is restored and no longer demoted by the old bare-`violet` accent collision; `accentViolet: { streak: 100 }` is its own key. Wristbands gated under bare ids `gold`/`neon` (:333-334), with `teal` deliberately sharing the hair `teal { streak:7 }` key (documented, same tier — consistent).
- **`isUnlocked` treats unknown id as LOCKED.** cosmeticUnlocks.ts:88-91: when `tiers[optionId]` is `undefined`, returns `KNOWN_OPTION_IDS.has(optionId)` (built from all `AVATAR_CATEGORIES[].ids`) — known-free → true, garbage/tampered → false. Correct.
- **`setEquipped` refuses locked/unknown.** cosmeticUnlocks.ts:183-217 now returns `{ rejected }`; with a `ctx` it does a full `isUnlocked` tier check, without a ctx it still blocks unknown ids. Signature change `Promise<void>` → `Promise<{rejected:string[]}>` is additive; sole external caller `cosmetics.tsx:561` ignores the return — no break.
- **No remaining gating bypass via the UI.** Both equip surfaces gate with the **live** `{streak,isPaid}` ctx:
  - `cosmetics.tsx`: item card computes `unlocked = isUnlocked(optionId, {streak,isPaid})` (:349), button `disabled={locked}` (:369), and `handlePress` only calls `onEquip` `if (!locked)` (:361).
  - `AvatarCustomizer.tsx`: `selectOption` blocks locked picks (:89-98), and `handleSave` re-sanitizes every slot via `isUnlocked(tierKeyForId(...), unlockCtx)` and resets locked slots to default before persisting (:108-114). Persists via `onSaved(normalizeAvatar(...))`, not `setEquipped`.
- **PeakAvatar color maps still resolve.** Wristband render uses bare ids (`WRISTBAND_COLORS` keys `white/black/teal/gold/neon/…`, PeakAvatar.tsx:52-60) = `WRISTBANDS_IDS` — unaffected by the accent rename. Accent render `ACCENT_THEME[cfg.accentTheme]` now requires the stored id to be `accent*`; `normalizeAvatar` validates `accentTheme` against the namespaced `ACCENT_THEME_IDS` (:520), so new selections store+resolve correctly.
- **No legit cosmetic wrongly locked.** Dev `__DEV__` integrity check (peakAvatarOptions.ts:437-466) asserts every gated id resolves and `ACCENT_THEME_IDS`⇆`ACCENT_THEME` agree. The old `tierKeyFor` helper was deleted from AvatarCustomizer and replaced by the shared `tierKeyForId` (identity today).

**P2 (non-blocking, defense-in-depth — not a functional bypass):** `cosmetics.tsx:561` calls `setEquipped(user.id, { [slot]: optionId })` **without** the ctx, so the persistence layer enforces only the unknown-id guard, not streak/Pro tiers — streak/Pro enforcement for that screen rests entirely on the UI `disabled`/`if(!locked)` gates. Recommend passing `{ streak, isPaid }` so `setEquipped` is the authoritative gate. Latent: `KNOWN_OPTION_IDS.has(tierKey)` mixes a tier-key arg with a display-id set; harmless while `tierKeyForId` is identity.

---

## `mobile/src/lib/strengthModelV3.ts` — LIB-01 / LIB-02 — **PASS**

- **LIB-01 shapes compatible.** `OverallResult = { pct:number; provisional:boolean; dots:number }` (:265). `overallStrengthPercentile` guard returns `{ pct:0, provisional:false, dots:0 }` (:282) — matches the type and the normal returns (:287/:319); object stays non-null as callers read `.pct`/`.provisional`/`.dots`. `overallStrengthPercentilePartial` guard returns `null` (:303), matching its `OverallResult|null` signature and the established no-estimate sentinel. Sole consumer `TierLadderCard.tsx` null-checks (`m && f`, :158; `if (!result) return null`, :167) — `null` for `bwKg<=0` renders no card, no crash. Guard predicates `!(total>0)`, `!(bwKg>0)`, `!Number.isFinite(bwKg)` correctly catch 0/negative/NaN/Infinity.
- **LIB-02 tokens match.** `AGE_BANDS = ['under-18','18-24','25-34','35-44','45-54','55+']` (:413) is exactly the `AGE_MULT` key set (:404). This change only adds the exported source-of-truth + `AgeBand` doc; the actual producer fix (`localContext.ts` underscore tokens) is correctly noted as out of this file's scope (and is dormant/P1 per SYNTH).
- **No determinism break.** No `new Date()` / `Date.now()` / `Math.random()` introduced (grep empty).

---

## `mobile/app/insights.tsx` + `mobile/src/components/WorkoutLoggerHost.tsx` — S3-01 / S3-02 — **PASS**

- **insights.tsx (S3-01):** `useRef`/`useEffect` imported (:24). `mountedRef` + real unmount cleanup added. Every post-await setState guarded: `load` after `Promise.all` (`if(!mountedRef.current) return` before the three setters), `onRefresh` (`if(mountedRef.current) setRefreshing(false)`), the load `useEffect` (real cleanup `ignore=true` + `mountedRef`), and `handleAckDeload` after `await ackDeload()` (guard before `setDeload`+`setDeloadAcking(false)`). The synchronous free-user branch's added guard is harmless/redundant. Imperative API unchanged (this is a screen).
- **WorkoutLoggerHost.tsx (S3-02):** the bogus `return () => { cancelled = true; }` from inside the `useImperativeHandle` `startRoutine` method is removed (React discards a function returned by an imperative method, so the old cancel was dead code and the fetch was uncancellable). Replaced by component-scoped `mountedRef` (`useRef` imported :27) + real unmount effect; both `.then` (:462) and `.catch` (:490) guard on `mountedRef.current`. **Imperative API unchanged:** `WorkoutLoggerRef.startRoutine` is typed `(routineId, routineName) => void` (:176) — the returned cleanup was never in the contract; sole caller `index.tsx:688` discards any return.

---

## Verdicts

| File | Verdict |
|------|---------|
| usePowerSyncLog.ts (HOOKS-01) | **PASS** |
| peakAvatarOptions.ts + cosmeticUnlocks.ts + AvatarCustomizer.tsx (cosmetic-gating P0) | **PASS** (one P2 defense-in-depth nit) |
| strengthModelV3.ts (LIB-01/02) | **PASS** |
| insights.tsx + WorkoutLoggerHost.tsx (S3-01/02) | **PASS** |

No P0 or P1 regressions found. One P2 (non-blocking): `cosmetics.tsx:561` does not pass the unlock ctx to `setEquipped`, so streak/Pro gating there is UI-only — recommend threading `{ streak, isPaid }`.
