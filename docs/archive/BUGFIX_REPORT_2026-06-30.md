# Bug-fix report — 2026-06-30 (Opus, extensive-review pass)

Three user-reported bugs. Repo root `C:\Users\aavir\dev\Peak Fettle`; all changes in `mobile/`. No server `.js` touched. NOT committed / pushed (founder pushes; EAS builds from origin/main).

## Files changed
- **NEW** `mobile/src/data/localReset.ts` — shared, idempotent, best-effort local teardown (SQLite personal tables + `outbox` + `migration_state` + onboarding/first-launch/tour AsyncStorage flags).
- `mobile/src/context/AuthContext.tsx` — `_clearAuthState()` now calls `clearAllLocalPersonalData()` (Bug 3).
- `mobile/app/(tabs)/profile.tsx` — delete-account uses the shared teardown; `mountedRef` guards on sign-out + delete setState (Bug 3). Removed now-unused `BACKUP_TABLES` import.
- `mobile/src/components/auth/OAuthButtons.tsx` — consume-each-OAuth-response-once guard (Bug 3, the "repeated sign-in pop-ups").
- `mobile/src/data/migrateToPro.ts` — `uploadRoutines` dedups against existing server routines by name, so re-upload is idempotent even if the ledger was lost (Bug 2).
- `mobile/src/hooks/useGroups.ts` — `useGroups` + `useGroupDetail` bound their on-mount load with a 6 s deadline so they can't hang the UI (Bug 1 hardening).

---

## Bug 1 — Free-tier responsiveness lag (paid feels smooth)

### Root cause (confirmed) — mostly ALREADY FIXED; one latent offender
Exhaustive audit of every free-reachable screen/hook/component for an unguarded personal REST call on mount/focus. **Result: every REACHABLE free path is already correctly local-first-guarded.** Verified guards (file:line):
- `app/(tabs)/index.tsx` — `if (!user?.is_paid) return` at 463 & 489; `isLocalFirst(user)` at 561/585. Reference pattern.
- `app/insights.tsx` load `if (!user?.is_paid) return` before getReadiness/Recovery/Deload.
- `app/progress.tsx:484` `if (localFirst) setData(await fetchLocalProgressData())`; `app/workout-day.tsx:545` `localFirst ? fetchLocalDayData : fetchDayData` — both free-reachable from Home, both branched.
- `app/templates.tsx`, `app/data-export.tsx`, `app/csv-import.tsx`, `app/(tabs)/routines.tsx` (`listRoutines(user)`), `app/workout-history.tsx` — all `isLocalFirst`-branched.
- Hooks `useHealthMetrics`, `useStreak`/`useLocalStreak`, `useWorkout`, `useWorkoutHistory`, `usePlans`, `usePercentile` — all branch on tier / early-return for local-first. `useLocalStreak` is even timeout-guarded.
- `RoutineStrip` reads `listRoutines(user)` (local for free) + bundled starter splits (no network). `WorkoutLoggerHost` uses `getRoutine` from the tier-branched **data** layer (not `api/`), plus `is_paid` gates on every server path.
- Global infra: `useAutoBackup` is free-only via `usesBlobBackup`; `syncEngine.flush()` only drains the (empty-for-idle-free) `outbox`; `PowerSyncContext` only inits local SQLite. None make a blocking free REST call.

**The one genuine offender:** `mobile/src/hooks/useGroups.ts` — `useGroups.load` (was ~92-95) and `useGroupDetail.load` (was ~233-236) call `getGroups()`/`getCreditBalance()` / `getGroupDetail()`/`getGroupEvaluations()` on mount with **no tier guard and no hang bound**. Groups is a free+pro feature (per `data/groupSignals.ts`: signals fire "on free AND pro"), so it legitimately uses the network — but on a slow/500 server the 15 s apiClient timeout pins the screen on a spinner (the "laggy" symptom). **These screens are currently unreachable** (the Home "Groups" nav row was removed from render — see `index.tsx:1435` "removed from render"; the only remaining push to `/group-detail` lives inside `groups.tsx` itself), so this is a **latent** offender, not the live cause — but it violates the invariant and would resurface the moment Groups is re-linked.

### Fix
Bounded both hook loads with a 6 s deadline (`withDeadline`, mirroring the existing `useLocalStreak`/`RoutineStrip` hang-proofing). The hooks already `setError` + `setIsLoading(false)` in `finally`, so on timeout they resolve to a fast error state instead of an infinite/15 s spinner. No new network call is made; product intent unchanged (Groups still works when reachable, for both tiers). Did NOT add an `is_paid` gate (Groups is not Pro-only) and did NOT touch the intentionally-free local screens (rankings compute on-device, etc.).

### Verified
Parse-sweep OK; tsc adds 0 errors from useGroups; the two hooks resolve within 6 s worst-case by construction.

---

## Bug 2 — Toggling back to Pro is broken (upgrade → downgrade → re-upgrade)

### Root cause (confirmed)
Traced the whole transition. Server routes `POST /user/upgrade` + `/downgrade` (`peak-fettle-agents/server/routes/user.js:1116-1161`) are idempotent tier flips (client toggle enabled via `ALLOW_CLIENT_TIER_TOGGLE`), and the client order (`AuthContext.upgradeToPro`) is correct (`is_paid` flips LAST; fast-path `if (user.is_paid) return` re-auths PowerSync). The `migration_state` ledger (schema v7, keyed by `(entity, local_id)`) is NOT in any wipe/backup list, so it **survives a downgrade** — which means the same-device down→up cycle correctly no-ops already-synced rows (no duplicates). So the common repro is largely already safe.

**The genuine defect is a fragility in that idempotency:** the ledger is the ONLY guard against duplicates, and **server `POST /routines` and `POST /sets` have NO `ON CONFLICT` / unique constraint** (verified `routines.js:76`, `sets.js:90`) — every POST mints a brand-new row. So in any window where the ledger is lost between a successful POST and its `ledgerPut` commit (app killed mid-upload), or across a sign-out that clears the ledger, a re-upload **duplicates every routine/set**. (Workouts/constraints/profile are safe: workouts collapse on `(user_id, day_key)`, constraints on `(user_id, constraint_type)`, profile is a single upsert.)

### Fix
`migrateToPro.ts` `uploadRoutines` now fetches the routines already on the server ONCE (`getRoutines()`) and, before POSTing a local routine, **adopts an existing server routine with the same name** (records its id in the ledger as done) instead of creating a duplicate. Also tracks names created within the same run so two same-named local routines don't both POST. This makes routine re-upload idempotent even without a ledger hit — one authed GET during an explicit upgrade (local-first invariant intact). Best-effort: if the GET fails it falls back to the prior ledger-guarded behaviour. The safe ordering, fast-path, and PowerSync re-auth (`setPowerSyncToken`) are unchanged.

Note: sets still rely on the ledger + the `day_key`-idempotent parent workout; a full content-hash dedup for sets would need per-workout set fetches (heavier) — flagged below. In practice the down→up cycle keeps the ledger, so sets don't re-upload.

### Verified
Parse-sweep OK; tsc 0 new errors; the `migrations` unit test (which exercises the v7 `migration_state` schema) stays 12/12.

---

## Bug 3 — Sign-out / delete-account glitchy; "repeated sign-in pop-ups, only fixed by reinstall"

### Root cause (confirmed)
`_clearAuthState()` (AuthContext) cleared ONLY the SecureStore refresh token + cached profile. It left behind **all on-device SQLite personal tables** (`workouts`, `sets`, `routines`, `user_profile`, `streaks`, `user_constraints`, …), the `outbox` + `migration_state` bookkeeping, and the AsyncStorage onboarding flags (`@peak_fettle/first_launch_done`, `tour_seen`, `tooltip_seen`, `schedule_editor_seen`, `recovery_code_ack`, `healthkit_consent`, `last_backup_at`, `exercise_catalog_cached_at`, `rest_default_sec`). After signing back in — especially as a DIFFERENT account — the app therefore showed the previous user's data and skipped the intro/onboarding, and only a reinstall cleared it (the exact "only fixed by reinstall" signature). The delete-account free path wiped only `BACKUP_TABLES` (not the bookkeeping/flags); the paid path wiped nothing locally beyond `logout()`.

The **"repeated sign-in pop-ups"** specifically: `OAuthButtons`' `GoogleButton` effect fired `loginWithOAuth` whenever `response?.type === 'success'`, and `expo-auth-session` retains its last `response`. If the login screen remounts while a prior `success` response is still held (an auth-state flip-flop during the glitchy sign-out), the effect re-fires `loginWithOAuth` → the native Google/Apple sheet re-launches = repeated pop-ups.

### Fix
1. **New `mobile/src/data/localReset.ts`** — `clearAllLocalPersonalData()`: wipes `BACKUP_TABLES` + `outbox` + `migration_state` and removes the onboarding/first-launch/tour/consent/cache AsyncStorage keys. Idempotent, best-effort, never throws (each DELETE / key removal individually guarded). Deliberately keeps `@peak_fettle/theme` (device display preference, not personal data) and does not touch SecureStore (AuthContext owns the token).
2. **AuthContext `_clearAuthState`** now `await clearAllLocalPersonalData()` before the push-unregister / server revoke. Because Invariant 5 guarantees `_clearAuthState` is only reached on a genuine logout / definitive-401 (never a transient failure), a flaky network can never trigger the wipe — cold-start "render cached user immediately" is untouched, and the free path gains no new REST call.
3. **profile.tsx** delete-account: free path calls `clearAllLocalPersonalData()` (covers bookkeeping + flags, not just `BACKUP_TABLES`); both tiers still end in `logout()` (which re-runs the teardown). Added a component `mountedRef` and gated the sign-out `setIsSigningOut(false)` and the delete `setIsDeletingAccount(false)` on it (FIX-LIFECYCLE pattern) to kill the setState-after-unmount flicker when `logout()` redirects and unmounts the screen.
4. **OAuthButtons** consume-once: a `handledResponseRef` records the exact `response` object already processed and the effect skips it thereafter, so a remount can't re-fire `loginWithOAuth` / re-launch the provider sheet.

Because logout now clears both `migration_state` AND the local data it references, there is no duplicate-on-re-upgrade regression from this change (there's nothing left to re-upload after a same-user sign-out), and Bug 2's routine-name dedup covers the residual crash-window case.

### Verified
Parse-sweep OK; tsc 0 new errors; `localReset.ts` parses and is imported by both AuthContext + profile.

---

## Verification gate (run against the Windows working tree)
- **Parse-sweep** (`@babel/parser`, typescript+jsx, over `mobile/app` + `mobile/src`): **169 files, 0 failures.** Every edited file individually re-parsed on-disk (see truncation note).
- **`node src/db/__tests__/migrations.test.js`**: **12 passed, 0 failed.**
- **`node src/lib/trainingEngine/__tests__/engine.test.js`** (untouched): **8 passed, 0 failed.**
- **`npx tsc --noEmit` delta**: **57 before → 57 after = 0.** (Baseline measured by restoring the HEAD versions of the 5 modified files and re-running tsc.) All 57 are pre-existing expo-router typed-route-string TS2345s (the documented baseline category, now ~57 not ~85 — the parallel engine work reduced it). My new code contributes ZERO errors (localReset/useGroups/migrateToPro/OAuthButtons = 0 each; the 4 in profile.tsx + 4 in AuthContext.tsx are all pre-existing `router.push('/...')`/`router.replace('/(tabs)/')` route-string types on lines I did not add).
- **Server `node --check`**: N/A — no server `.js` changed.

## MOUNT TRUNCATION — important for the founder / final gate
The Write/Edit tools on this mount silently truncated **four** large files mid-write after reporting success (`profile.tsx`, `AuthContext.tsx`, `OAuthButtons.tsx`, `migrateToPro.ts` — all cut off at the tail). Each was reconstructed by appending the intact HEAD tail and re-parsed. During review I caught two off-by-one reassembly artifacts and fixed them: a dropped `bgColor={c.bgSecondary}` prop on `<GoogleButton>` (would have been a TS "missing required prop" error) and a dropped doc-comment line in `migrateToPro.ts` (cosmetic). `useGroups.ts` was safest to fully restore-from-HEAD and re-apply via a Python heredoc (the reliable write path on this mount). **All six files now parse and diff cleanly (intended changes only; verified with `git diff --ignore-all-space`).** Recommend the final pre-commit gate re-run the parse-sweep on the working tree before pushing, per CLAUDE.md.

## Needs the founder
1. **On-device retest after EAS build** — none of this reaches the phone until `git push origin main` + `eas build` + install (CLAUDE.md #8). Retest: (a) free-tier feel; (b) Pro → Free → Pro toggle (no dupes, sync resumes); (c) sign-out then sign-in as the SAME and a DIFFERENT account (clean, no pop-up loop, intro re-runs), and delete-account on both tiers.
2. **Account-delete server fix** (`SRV-USER-02`, drift-tolerant `DELETE /user/account`) is already in the working tree but must be **deployed** (Railway push) for the paid-tier delete to succeed in prod.
3. **Optional server hardening** (not required by these fixes, but would make Bug 2 bulletproof): add `ON CONFLICT`/unique keys to `POST /routines` and `POST /sets`, or dedup sets client-side — currently the client ledger + routine-name dedup carry idempotency. Also, the Groups Home nav is removed from render; if you re-link it, the new 6 s hang-bound keeps it responsive, but consider whether Groups should surface for free users at all.


---

## Bug 1 — free-tier touch lag (dedicated pass, Opus MAX-EFFORT)

> Distinct from the "Bug 1 — Free-tier responsiveness lag" section above (which addressed a latent *spinner/hang* in `useGroups`). This pass targets the user's *touch/interaction lag* symptom: "all screens feel laggy on touch on the free tier; toggling to Pro makes it disappear."

### What I proved (method: full static trace of every always-mounted + tier-branched path; no runtime profiler available in this environment)

I exhaustively traced every mechanism that could pin the JS thread or storm renders on the free path, and **ruled out** each of the "continuous work / unguarded REST" hypotheses with file:line evidence:

- **No free-specific continuous JS loop.** The only `setInterval`s are workout-timer-scoped (`WorkoutLoggerHost.tsx:288` gated on `timerActive`; `useRestTimer.ts:88` gated on an active timer) — neither runs app-wide or at rest. `syncEngine` is NetInfo-driven with an empty free outbox (no poll). `localDb.watch()`/`notify` (`localDb.ts:205-272`) is promise-resolver pub/sub, **not** a busy-loop — it only wakes on a real table write.
- **No unguarded personal REST on the free interaction path.** Re-verified the data hooks all early-return / branch for local-first: `useWorkout` (122), `useWorkoutHistory` (136), `useStreak`/`useLocalStreak` (168), `usePercentile` (43 — returns empty immediately), `usePlans` (87), `useHealthMetrics` (149). `usePowerSyncLog` (200) skips every server call for free. Screens (`index.tsx` 463/489/561/585, `rankings.tsx`, `insights.tsx`, `progress.tsx`, `workout-day.tsx`) are `is_paid`/`isLocalFirst`-gated. This matches the prior audit.
- **No per-render heavy compute for free on the "all screens" surfaces.** Home memoises every derived value (`useMemo` on prsThisWeek/recentDays/prChips/streak dots/etc.). Rankings computes on-device percentiles **only over `response.rankings`, which is `[]` for free** (`usePercentile` returns null) — so `localPercentiles`/`strengthModelV3` runs **zero** times for free. Insights is Pro-gated. `ScreenLayout` (wraps every screen) is a one-shot FadeIn.
- **No persistent free-only banner/upsell mounted app-wide** (Hypothesis 4): the tab layout (`app/(tabs)/_layout.tsx`) has **no** `is_paid`/upsell/banner node; grep is clean.
- **`blobCrypto` (Hypothesis 3) is not on the interaction path**: `maybeAutoBackup` (`backupManager.ts:335`) reads the `last_backup_at` timestamp and returns BEFORE any crypto when inside the 6-hour debounce; it is one-shot on launch/background, never per-touch.

**Honest conclusion on the exact free/pro delta:** every tier-branched path already early-returns for free, so **static analysis does not expose a free-specific per-touch stall or a free-only re-render storm.** After genuinely exhausting the hypotheses I could not pin a single definitive free-vs-pro cause from the code alone (the delta the user feels is most consistent with device-level first-open JS+SQLite contention, which only an on-device profiler can confirm — see profiling steps below). Per the task's explicit fallback, I fixed the one **provable, high-impact structural defect** that governs app-wide interaction cost, and hardened around it.

### The provable structural defect I fixed (Hypothesis 1 — unmemoized context values)

`AuthProvider` (`AuthContext.tsx`) and `ThemeProvider` (`ThemeContext.tsx`) each built their context **`value` object inline on every render**. `useAuth()` and `useTheme()` are consumed **app-wide** — the tab layout, `RootNavigator` (which renders the entire `<Stack>`), `WorkoutLoggerHost`, `SyncStatusIndicator`, `ScreenLayout` (wraps every screen), and every data hook. Because `useContext` re-renders a consumer whenever the provider's value **reference** changes (and ignores `React.memo`), a fresh `value` object on any provider re-render fans a re-render out to the **entire consumer tree**. Inline construction meant that cascade would fire on *any* incidental provider re-render — a latent whole-tree storm sitting on the hottest path in the app. (This is the task's designated "strongest lead," and it is a real defect regardless of which tier trips it.)

### Fix (files + exactly what changed)
- **`mobile/src/context/AuthContext.tsx`** — wrapped the context `value` in `useMemo(..., [user, accessToken, isLoading, login, register, loginWithOAuth, logout, updateUser, upgradeToPro, downgradeToFree])` (added `useMemo` to the React import). All ten callbacks are already `useCallback`-stable, so the memo yields a **new reference only when auth STATE actually changes** (login / silent refresh / tier flip) — never on an unrelated re-render. Safety-checked the `refreshTokenRef.current` read inside `isAuthenticated`: every mutation of that ref is paired with a `setUser`/`setAccessToken` state change (login, bootstrap, `_clearAuthState`), so `isAuthenticated` stays correct without the ref being a dep.
- **`mobile/src/theme/ThemeContext.tsx`** — wrapped the context `value` in `useMemo(..., [theme, themeName, setTheme])` (added `useMemo` to the import). `spacing`/`radius`/`fontSize`/`fontWeight` are module constants and `setTheme` is `useCallback`-stable, so the theme value reference now changes only on an actual theme change.

**Why this targets the free/pro angle:** it removes the app-wide re-render amplifier that sits above every screen. On the free tier the JS thread is doing more first-open on-device SQLite work (multiple hooks each opening/querying `peak_fettle.db` + the `db.watch` on `sets`), so any avoidable re-render competes harder with touch handling than on Pro (whose data resolves async off-thread from the server). Stabilising the two top-of-tree context values is the highest-leverage way to keep touch-driven `setState` in a leaf screen from ever rippling into a full-tree re-render.

**Preserved:** local-first invariant (no new REST on the free path), the backup behaviour, and the concurrent agent's uncommitted `AuthContext.tsx` edits (the Bug 3 `clearAllLocalPersonalData` teardown — verified present via `diff` after reassembly).

### Mount-truncation note (per CLAUDE.md)
The `Edit` tool silently truncated **both** files mid-write (AuthContext cut at the memo comment → dropped the memo body + return; ThemeContext cut inside the `useTheme` JSDoc → dropped the hook + re-exports). Each was rebuilt via a Python heredoc (the reliable write path on this mount): AuthContext kept lines 1–682 (which carry both agents' changes) + reconstructed tail; ThemeContext kept through the provider return + reappended the HEAD hook/re-export tail. **`diff` vs HEAD confirms intended-only changes** (ThemeContext: exactly the `useMemo` import + memoized value; AuthContext: the other agent's Bug 3 block + my memo, nothing lost/duplicated — exactly one `const value = useMemo` and one provider return).

### Secondary hardening / no-ops confirmed
No additional code change was warranted: the free data path is already correctly local-first-guarded and memoised (verified above), so there was nothing else to move off the render path without inventing work. `WelcomeTour`'s context value is already `useMemo`'d (`WelcomeTour.tsx:260`); `PowerSyncProvider` passes children straight through with no value.

### On-device profiling the founder should run to confirm/finish the diagnosis
Because the residual delta is only observable at runtime, after the next EAS build:
1. **React DevTools Profiler → "Highlight updates when components render."** As a FREE user, tap a control on Home (e.g. open the streak sheet) and watch what flashes. Expectation after this fix: only the touched subtree re-renders. If the whole tree flashes on an unrelated touch, a remaining unstable prop/context is the culprit — capture the commit and its "why did this render".
2. **Profiler flame chart during rapid set-logging** (the most touch-dense flow) as FREE vs PRO. Look for a long synchronous commit or a repeated `usePowerSyncLog` `setSets` → `WorkoutLoggerHost` re-render on each `sets` write; if the `db.watch` re-read dominates, debounce/coalesce the watch re-query.
3. **Hermes CPU sampling profile** (Flipper / `--profile`) while interacting on a low-end device: confirm whether the first ~few seconds of a free cold-open are pinned by SQLite `openDatabaseAsync` + migrations + the concurrent hook reads. If so, stagger the non-critical hook reads behind `InteractionManager` on the free path.
