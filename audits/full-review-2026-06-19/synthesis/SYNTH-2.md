# SYNTH-2 — Auth · Security · API resilience · Hooks · Async-lifecycle

_Opus Synthesizer 2. Lane: auth cold-start (Invariant 5), API resilience/schema-drift, hooks, and async-lifecycle (effects/state) correctness._
_Inputs synthesized: `S-API.md`, `S-CORE.md`, `S-HOOKS.md`, `A1.md` (Home/Routines/Log/Layout), `A3.md` (Plans/Rankings)._
_Every P0/P1 below was re-verified by opening the cited `file:line` in source. tsconfig confirms `noUncheckedIndexedAccess: true` (line 5), which is why the array-index null-safety findings are real, not theoretical._

---

## (a) Lane summary

The auth cold-start hardening (the PUSH-001/002 remediation) is **mostly intact and well-implemented**: `AuthContext.bootstrap` (lines 392–435) classifies errors and keeps the token on network/timeout/5xx, renders the cached user immediately, and the `bootstrappingRef` guard correctly suppresses a racing-401 logout during the launch window. **But the same discipline did not reach two sibling sites**, and both are genuine Invariant-5 regressions:

1. **`client.ts:145` — the 401 interceptor's refresh-failure `catch` calls `onLogout()` unconditionally.** After a real 401, if `/auth/refresh` then fails on a *network error / 5xx / 10 s timeout*, the user is logged out and their refresh token wiped — exactly what Invariant 5 forbids. This is the highest-impact finding in my lane: it is the live, post-bootstrap counterpart of the bug the bootstrap was hardened against, and it triggers on the exact failure modes (flaky server, dropped connection) that Invariant 5 calls out.
2. **`AuthContext.tsx:408` — the bootstrap classifier's lower bound is `status >= 200`** instead of `>= 400`, so a 2xx/3xx response whose body happens to contain "expired/invalid/revoked" would clear the token. Lower probability (axios follows 3xx; a 2xx-with-auth-error-body is unusual) but it widens the token-clear trigger beyond "definitive auth rejection."

Beyond auth: the hooks layer has **one P0 stale-closure** (`usePowerSyncLog.initWorkout` bakes in `localFirst`/`userId` — a tier-breach + data-orphan risk), a **systemic missing-unmount-guard pattern** across 6 async hooks/screens, a **systemic API schema-drift gap** (8 envelope accessors that throw `TypeError` instead of degrading), and a cluster of **null-safety / Modal-safe-area** issues already flagged by tsc. No hardcoded secrets, no cleartext HTTP, no string-built SQL, tokens correctly in SecureStore — the security posture is sound; the risks are correctness/resilience, not breach.

**Verified counts:** P0 = 2, P1 = 11, P2 = 8, P3 = 6. Dropped/downgraded = 3.

---

## (b) Severity-ranked table of VERIFIED findings

| ID | Sev | File:line | Systemic tag | One-line problem |
|----|-----|-----------|--------------|------------------|
| API-01 | **P0** | `src/api/client.ts:143-146` | `SYSTEMIC:auth-clear` | 401-interceptor refresh-failure `catch` logs out on network/5xx/timeout, not just 401 (Invariant 5). |
| HOOKS-01 | **P0** | `src/hooks/usePowerSyncLog.ts:222-305` | `SYSTEMIC:tier-breach` | `initWorkout` stale closure: `localFirst`/`userId` missing from deps → orphaned/mis-tiered workout if user resolves post-mount. |
| SCORE-01 | **P1** | `src/context/AuthContext.tsx:408` | `SYSTEMIC:auth-clear` | Bootstrap token-clear range `>= 200` (should be `>= 400`) admits 2xx/3xx-with-auth-body as a clear trigger. |
| HOME-01 | **P1** | `app/(tabs)/index.tsx:478-500` | `SYSTEMIC:unmount-guard` | `getPercentile` + `loadPlan` effects: no cancel flag → `setState` after unmount on rapid tab switch. |
| HOOKS-02 | **P1** | `useWorkout.ts:165`, `useWorkoutHistory.ts`, `useHealthMetrics.ts`, `usePlans.ts` | `SYSTEMIC:unmount-guard` | Four hooks call multiple setters after awaits with no effect-cleanup cancel token. |
| ROUTINES-01 | **P1** | `app/(tabs)/routines.tsx:220-228` | `SYSTEMIC:unmount-guard` | Toast `setTimeout` never cleared → `setToast(null)` fires after unmount. |
| API-02 | **P1** | `routines.ts:34`, `plans.ts:57`, `groups.ts:55/175`, `constraints.ts:40`, `sets.ts:21`, `templates.ts:51`, `exercises.ts:108` | `SYSTEMIC:null-safety-ui` | 8 response-envelope accessors lack `?? []` → `TypeError` (not empty state) when a drifted server degrades to `{}` (Invariant 4). |
| HOOKS-03 | **P1** | `src/hooks/useBodyweight.ts:46-47` | — | `catch {}` swallows all errors; no `error` field → silent stale data, no retry UI. |
| HOOKS-04 | **P1** | `src/hooks/useGroups.ts:51,199` | `SYSTEMIC:floating-promise` | `refetch: () => void` typed but returns `Promise<void>`; `await refetch()` resolves before data loads. |
| HOME-03 | **P1** | `app/(tabs)/index.tsx:468,626-627` | `SYSTEMIC:null-safety-ui` | `plans[0].id` + `new Date(sortedKeys[i])` undefined under strict index → `longestStreak` silently returns 1 (NaN diff). |
| PLANS-01 | **P1** | `app/(tabs)/plans.tsx:466-468` | — | `PlanDetailModal` uses `SafeAreaView` in `<Modal>` w/o manual `paddingTop` inset (Invariant 3) — header under Dynamic Island. |
| RANKINGS-01 | **P1** | `app/(tabs)/rankings.tsx:211` | — | `ConfirmSheet` `SafeAreaView` in `<Modal>` (inside `Animated.View`) w/o manual top inset (Invariant 3). |
| RANKINGS-02 | **P1** | `app/(tabs)/rankings.tsx:605-611` | `SYSTEMIC:null-safety-ui` | Median `values[mid-1]+values[mid]` are `number\|undefined` → potential `NaN%` display; tsc-confirmed. |
| HOME-02 | **P1**→see note | `app/(tabs)/index.tsx:777,845,892` (+`modalSheet` :1520) | — | 3 bottom-sheet Modals lack `paddingTop` inset; realistic island exposure only on the tall (`maxHeight:'80%'`) sheet. |
| SCORE-02 | P1→**P2** | `src/context/AuthContext.tsx:502,539,571` | `SYSTEMIC:floating-promise` | `persistUser()` fire-and-forget races `router.replace`; downgraded — internal try/catch already swallows, race is benign in practice. |
| HOOKS-05 | **P2** | `src/hooks/useHealthMetrics.ts:230-298` | `SYSTEMIC:unmount-guard` | `sync()` mutation path `setState`s after unmount during multi-second HealthKit loop. |
| API-04 | **P2** | `src/api/progress.ts:90,125` | — | `ts = … ?? ''` → `date:''` ProgressPoint sorts before all real dates (phantom chart point at index 0). |
| API-05 | **P2** | `src/hooks/useWorkoutHistory.ts:276-278` | — | Pro history path issues up to 90 concurrent `getSetsForWorkout` GETs (N+1 waterfall). |
| API-06 | **P2** | `src/api/alternatives.ts:75` | — | `(err as any).isPaywall = true` mutates the axios error; untyped, fragile. |
| HOME-05 | **P2** | `app/(tabs)/index.tsx:618-639` | — | "PRs this week" label vs rolling-7-day window mismatch (product call). |
| HOME-06 | **P2** | `app/(tabs)/index.tsx:647-651` | — | `handleRefresh` not `useCallback` → new `RefreshControl.onRefresh` each render. |
| ROUTINES-02 | **P2** | `app/(tabs)/routines.tsx:511-512` | — | `GestureHandlerRootView` nested in `SafeAreaView`, not at app root (RNGH gesture-conflict risk). |
| SCORE-03 | **P2** | `src/theme/ThemeContext.tsx:77-91` | `SYSTEMIC:unmount-guard` | Theme-load IIFE has no `cancelled` guard. |
| PLANS-02 | **P2** | `app/(tabs)/plans.tsx:413-422` | `SYSTEMIC:tier-breach` | `loadPlan` calls raw `getPlan()` with no `isLocalFirst` guard (soft gate — UI-wiring-dependent). |
| HOOKS-06 | P2→**P3** | `src/hooks/usePowerSyncLog.ts:347-369` | `SYSTEMIC:unmount-guard` | Watch-loop `setSets` already guarded by `if (!aborted)`; downgraded to a belt-and-braces nit. |
| API-03 | dropped | `usePlans.ts:105` | — | Subsumed by API-02 — not an independent finding. |
| API-07 / SCORE-05 / SCORE-06 / HOME-05(label) / LAYOUT-01 / RANKINGS-03 / HOOKS-07 | P3 | various | — | Comments / dead imports / impure-updater nits (see §c tail). |

---

## (c) Per-finding detail + concrete fix

### [P0] API-01 — 401 interceptor logs out on network/5xx/timeout (Invariant 5) · `SYSTEMIC:auth-clear`
**File:** `mobile/src/api/client.ts:143-146`. **Verified.** Lines 109–112 gate the interceptor so this block runs only after an original request returned **401** and a refresh is attempted. The refresh (`_doRefresh` → `axios.post(/auth/refresh, …, {timeout:10_000})`) can then reject for three non-definitive reasons: network error (`err.response === undefined`), 5xx, or the 10 s timeout. The `catch (err)` at line 143 calls `_authHandlers.onLogout()` (line 145) for **all** of them. `onLogout` (AuthContext:313) is suppressed only while `bootstrappingRef` is set — and bootstrap clears that flag in its `finally` (line 440), so for the entire normal post-launch lifetime this `catch` clears SecureStore (`_clearAuthState` → `clearRefreshToken`, AuthContext:268/275) and redirects to login. **Net effect:** a Pro user on a flaky connection whose access token has just expired gets force-logged-out and their 30-day refresh token wiped on the first failed refresh — the precise Invariant-5 failure the bootstrap was hardened against, re-introduced one layer down.

**Concrete fix** — classify before logging out, mirroring the bootstrap (AuthContext:404–417):
```ts
} catch (err) {
  console.warn('[PF] client/responseInterceptor:',
    err instanceof Error ? err.message : String(err));
  // Invariant 5: only a DEFINITIVE auth rejection may clear the session.
  // A 401 from /auth/refresh itself (refresh token revoked/expired) is definitive.
  // Network error / 5xx / timeout are transient → keep the session; the next
  // API call (or the next cold-start bootstrap) retries the refresh.
  let definitive = false;
  if (axios.isAxiosError(err)) {
    const s = err.response?.status;
    if (s === 401) definitive = true;
    else if (s && s >= 400 && s < 500) {
      const body = (err.response?.data as { error?: string } | undefined)?.error ?? '';
      if (/invalid|revoked|expired/i.test(body)) definitive = true;
    }
  }
  if (definitive) _authHandlers.onLogout();
  return Promise.reject(error);
}
```
(Best: extract a shared `isDefinitiveAuthFailure(err)` helper and call it from BOTH `client.ts` and `AuthContext.bootstrap` so the two sites can never drift again. The `if (!refreshToken) onLogout()` at line 121 is correct and stays — no token to refresh is genuinely terminal.)

---

### [P0] HOOKS-01 — `usePowerSyncLog.initWorkout` stale closure: tier + userId baked in · `SYSTEMIC:tier-breach`
**File:** `mobile/src/hooks/usePowerSyncLog.ts:222-305`. **Verified.** `initWorkout` reads `localFirst` (line 229) and `userId` (line 233, passed to `ensureLocalWorkoutForDay(todayKey, userId)`), but the `useCallback` dep array is `[todayKey]` only (line 305). `todayKey` is a `useMemo(…, [])` stable string (line 203), so the callback is created **once** with whatever `user` was at first render. If `user` resolves *after* mount (cold-start: bootstrap restores the cached user, or a tier flip via `upgradeToPro`/`downgradeToFree`), `initWorkout` keeps the stale snapshot: a free user who logs in post-mount runs `ensureLocalWorkoutForDay(todayKey, '')` → an **anonymous local workout keyed to empty userId** that can never be associated with the account; a Pro user who resolves post-mount stays on the `localFirst===true` branch and writes a local-only workout that **never enters the REST/sync path**. Both are Invariant-1 (tier) breaches caused by a stale closure.

**Concrete fix:**
```ts
}, [todayKey, localFirst, userId]); // was [todayKey]
```
`todayKey` is stable, so the only re-creation is on real auth/tier changes — exactly when re-init is required. (Confirm the downstream `useEffect(() => { void initWorkout(); }, [initWorkout])` at line 307 re-runs cleanly on re-init; it does, and the watch effect keyed on `[workout]` re-subscribes.)

---

### [P1] SCORE-01 — Bootstrap token-clear lower bound `>= 200` too broad (Invariant 5) · `SYSTEMIC:auth-clear`
**File:** `mobile/src/context/AuthContext.tsx:408`. **Verified.** `else if (status && status >= 200 && status < 500)` then tests the body for `/invalid|revoked|expired/i`. The intent (per the comment "4xx other than 401") is **client-error 4xx only**; the `>= 200` lower bound also admits 2xx and 3xx. A misconfigured proxy/CDN returning `200`/`301` with a JSON body containing the word "expired" would set `isDefinitiveAuthFailure = true` and wipe the refresh token. Probability is low (axios follows 3xx before surfacing; a 2xx-with-auth-error-body is unusual), but it is strictly broader than "definitive auth rejection."

**Concrete fix** — tighten the bound to genuine client errors:
```ts
} else if (status && status >= 400 && status < 500) { // was >= 200
```
401 is already handled by the preceding branch; 5xx and network (`status === undefined`) already correctly fall through to keep-token. (This change also lets the shared `isDefinitiveAuthFailure` helper from API-01 be identical at both sites.)

---

### [P1] HOME-01 — `getPercentile` / `loadPlan` effects: no cancel flag · `SYSTEMIC:unmount-guard`
**File:** `mobile/app/(tabs)/index.tsx:478-500`. **Verified.** The percentile effect (485–500) and the `loadPlan` effect (478–480, callback 462–476) both `await` Pro REST round-trips and then `setBestPercentile` / `setPlan` / `setPlanLoading` with no cancellation. A rapid tab switch can unmount Home mid-request → setState-after-unmount (warning in dev; in RN's concurrent renderer, a stale-closure write that can land on a recycled slot).

**Concrete fix** — cancel guard on both effects:
```ts
useEffect(() => {
  if (!user?.is_paid) return;
  let cancelled = false;
  getPercentile()
    .then((resp) => {
      if (cancelled) return;
      const values = resp.rankings.map(r => r.percentile).filter((v): v is number => v !== null);
      if (values.length > 0) setBestPercentile(Math.max(...values));
    })
    .catch((err: unknown) => { if (!cancelled) console.warn('[PF] index/getPercentile:', …); });
  return () => { cancelled = true; };
}, [user?.is_paid]);
```
For `loadPlan`: give the effect a `cancelled` flag and guard `setPlan`/`setPlanLoading`, or have `loadPlan` accept an `AbortSignal`. Resolving HOME-03's `plans[0]` narrowing here too (`const first = plans[0]; if (first) …`) folds both fixes into one edit.

---

### [P1] HOOKS-02 — Four async hooks lack unmount guards · `SYSTEMIC:unmount-guard`
**Files:** `useWorkout.ts:132-167`, `useWorkoutHistory.ts:144-328`, `useHealthMetrics.ts:160-224`, `usePlans.ts:95-116`. **Verified (useWorkout representative):** `load` (132) calls `setIsLoading`/`setWorkout`/`setSets`/`setError` after `await`s; `useEffect(() => { load(); }, [load])` (165) returns no cleanup. SQLite paths are fast, but the Pro REST paths (esp. `useWorkoutHistory`'s `Promise.all` over 90 workouts) are multi-second windows.

**Concrete fix** — standard cancel token per effect:
```ts
useEffect(() => {
  let cancelled = false;
  void (async () => {
    setIsLoading(true);
    try { /* … */ if (!cancelled) setWorkout(w); /* guard every setter */ }
    finally { if (!cancelled) setIsLoading(false); }
  })();
  return () => { cancelled = true; };
}, [load]);
```
`useLocalStreak` already demonstrates the `mountedRef` variant — adopt one pattern across all four (and reuse for HOOKS-05 and SCORE-03). For the fetch paths an `AbortController` passed to axios is even better (cancels the in-flight request, not just the setState).

---

### [P1] ROUTINES-01 — Toast `setTimeout` never cleaned up · `SYSTEMIC:unmount-guard`
**File:** `mobile/app/(tabs)/routines.tsx:220-228`. **Verified.** `showToast` schedules a 1800 ms `setTimeout` whose callback calls `setToast(null)` (line 225). The timer id is not stored and never cleared; unmounting during the toast fires setState on a dead component.

**Concrete fix:**
```ts
const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const showToast = useCallback((msg: string) => {
  setToast(msg);
  RNAnimated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  if (toastTimer.current) clearTimeout(toastTimer.current);
  toastTimer.current = setTimeout(() => {
    RNAnimated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true })
      .start(() => setToast(null));
  }, 1800);
}, [toastOpacity]);
useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
```

---

### [P1] API-02 — 8 response-envelope accessors lack null-safe fallback (Invariant 4) · `SYSTEMIC:null-safety-ui`
**Files (verified by grep):** `routines.ts:34` (`res.data.routines`), `plans.ts:57` (`response.data.plans`), `groups.ts:55` (`.groups`) & `:175` (`.history`), `constraints.ts:40` (`.constraints`), `sets.ts:21` (`.sets`), `templates.ts:51` (`res.data.templates`), `exercises.ts:108` (`.aliases`). `progress.ts:75` is the one correct site (`response.data?.sets ?? []`). Per Invariant 4 a drifted server is supposed to degrade to an empty `200`; when it returns `{}`, every one of these throws `TypeError: Cannot read properties of undefined` in the calling hook **before** the hook's `catch` can map it to a clean error — and for array endpoints the right degrade is an empty list, not an error banner.

**Concrete fix** — apply the `progress.ts` pattern at each site:
```ts
return res.data?.routines ?? [];   // routines.ts:34
return response.data?.plans ?? []; // plans.ts:57
return response.data?.groups ?? []; // groups.ts:55
return response.data?.history ?? []; // groups.ts:175
return response.data?.constraints ?? []; // constraints.ts:40
return response.data?.sets ?? []; // sets.ts:21
return res.data?.templates ?? []; // templates.ts:51
return response.data?.aliases ?? []; // exercises.ts:108
```
This also resolves API-03 (the `usePlans` "TypeError vs error banner" concern) with no separate change.

---

### [P1] HOOKS-03 — `useBodyweight` swallows all errors; no `error` state
**File:** `mobile/src/hooks/useBodyweight.ts:46-47` (catch) + `:20-28` (interface). **Verified.** `catch { /* localDb unavailable */ }` discards every failure; `UseBodyweightResult` has no `error` field, so a schema-drift/pre-init failure shows stale/empty data with no banner or retry — violating the "every data hook exposes loading AND error" contract.

**Concrete fix:**
```ts
export interface UseBodyweightResult { /* … */ error: string | null; }
const [error, setError] = useState<string | null>(null);
const reload = useCallback(async () => {
  try {
    const [l, h, cur] = await Promise.all([getLatestBodyweight(), getBodyweightHistory(), hasCurrentWeekEntry()]);
    setLatest(l); setHistory(h); setHasThisWeek(cur); setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to load bodyweight');
  } finally { setIsLoading(false); }
}, []);
// return { …, error };
```

---

### [P1] HOOKS-04 — `useGroups`/`useGroupDetail` `refetch` typed `() => void` but is async · `SYSTEMIC:floating-promise`
**File:** `mobile/src/hooks/useGroups.ts:51` and `:199` (verified by grep). **Verified.** Both interfaces declare `refetch: () => void` while assigning `refetch: load` where `load` is `async () => Promise<void>`. A caller writing `await refetch()` gets `void` and continues before data loads — latent race for `await leaveGroup(); await refetch(); navigate()` sequences.

**Concrete fix:**
```ts
refetch: () => Promise<void>; // both UseGroupsResult (:51) and UseGroupDetailResult (:199)
```
No runtime change — `load` already returns the promise; this just stops the type system from discarding it. Sweep for any other hook with the same `refetch: () => void` shape (grep found only these two).

---

### [P1] HOME-03 — `plans[0]` + `new Date(sortedKeys[i])` undefined → silent wrong `longestStreak` · `SYSTEMIC:null-safety-ui`
**File:** `mobile/app/(tabs)/index.tsx:468, 626-627`. **Verified (tsc TS2532 @468, TS2769 @626/627; `noUncheckedIndexedAccess` on).** (a) `plans[0].id` inside `if (plans.length > 0)` is still `Plan | undefined` to the compiler. (b) `sortedKeys[i-1]`/`sortedKeys[i]` are `string | undefined`; `new Date(undefined)` = `Invalid Date`, so `getTime()` → `NaN`, `diffDays` = `NaN`, the `=== 1` branch never runs, and `longestStreak` returns `1` whenever history is non-empty — a **silent wrong value** in the Streak Detail sheet (line 800).

**Concrete fix:**
```ts
// (a) line 467
const first = plans[0];
if (first) { const detail = await getPlan(first.id); setPlan(detail); }
// (b) lines 625-630
for (let i = 1; i < sortedKeys.length; i++) {
  const prevKey = sortedKeys[i - 1], currKey = sortedKeys[i];
  if (!prevKey || !currKey) continue;
  const diffDays = Math.round((new Date(currKey).getTime() - new Date(prevKey).getTime()) / 86_400_000);
  /* … */
}
```

---

### [P1] PLANS-01 — `PlanDetailModal` `SafeAreaView`-in-`Modal` without manual inset (Invariant 3)
**File:** `mobile/app/(tabs)/plans.tsx:466-468`. **Verified.** `<Modal presentationStyle="pageSheet">` → `<SafeAreaView edges={['top','bottom']}>` (466) → header `<View>` (468) with no `paddingTop`. The sibling `LocalPlanModal` (line 664) already does it right (`paddingTop: Math.max(insets.top, 12)`); this modal was missed.

**Concrete fix:** add `const insets = useSafeAreaInsets();` to `PlanDetailModal` and inline `paddingTop: Math.max(insets.top, 12)` on the `detailStyles.header` `<View>` at line 468, matching `LocalPlanModal:664`.

---

### [P1] RANKINGS-01 — `ConfirmSheet` `SafeAreaView`-in-`Modal` without manual inset (Invariant 3)
**File:** `mobile/app/(tabs)/rankings.tsx:211`. **Verified.** `<Modal presentationStyle="pageSheet">` → `<Animated.View>` (210) → `<SafeAreaView edges={['top','bottom']}>` (211) → drag handle + title with no manual top inset. The `Animated.View` wrapper makes any `SafeAreaView` padding additionally unreliable inside the animation frame.

**Concrete fix:** read `useSafeAreaInsets()` in `ConfirmSheet` and apply `paddingTop: Math.max(insets.top, 12)` to the `KeyboardAvoidingView` (212) or the drag-handle `<View>` (217).

---

### [P1] RANKINGS-02 — Median `values[mid]` possibly undefined → `NaN%` risk · `SYSTEMIC:null-safety-ui`
**File:** `mobile/app/(tabs)/rankings.tsx:605-611`. **Verified (tsc TS2532×2 @608, TS2345 @611).** After `.filter((v): v is number => v != null)` the elements `values[mid-1]`/`values[mid]` are still `number | undefined` under `noUncheckedIndexedAccess`; the even-length branch would compute `NaN` and `Math.round(NaN)` renders "NaN%". Runtime is safe today (filter guarantees values) but the type hole is real and a filter refactor would break it silently.

**Concrete fix:**
```ts
const lo = values[mid - 1] ?? 0, hi = values[mid] ?? 0;
const median = values.length % 2 === 0 ? (lo + hi) / 2 : (values[mid] ?? 0);
```

---

### [P1→P1, with scope note] HOME-02 — Three home bottom-sheet Modals lack `paddingTop` inset (Invariant 3)
**File:** `mobile/app/(tabs)/index.tsx:777` (Streak), `:845` (Forgot-something), `:892` (Today's lifts); shared `styles.modalSheet` at `:1520` (`padding: 24, paddingBottom: 40`, no top inset); `modalOverlay` `:1515` is `justifyContent: 'flex-end'`. **Verified — with a severity nuance the source makes clear:** these are `transparent`, bottom-anchored sheets (not `pageSheet`). A short sheet sits at the bottom and never reaches the Dynamic Island; the realistic exposure is the **third** modal (Today's lifts, `:899`) which adds `maxHeight: '80%'` and grows upward when many sets are listed. I keep this **P1** because Invariant 3 is explicit and the tall-sheet case does reach the island, but flag that the first two (Streak, Forgot) are low-content and unlikely to overlap in practice — fix all three for consistency, prioritize the tall one.

**Concrete fix:** `import { useSafeAreaInsets }`, read `insets`, and on each sheet's inner `<View>` add an inline `paddingTop: Math.max(insets.top, 12)` (do NOT bake it into the shared `styles.modalSheet` — it is per-device). The third sheet should also cap its top so the `ScrollView` (`:903`) stays below the island.

---

### [P2] SCORE-02 — `persistUser()` floating in login/register/oauth (downgraded P1→P2) · `SYSTEMIC:floating-promise`
**File:** `mobile/src/context/AuthContext.tsx:502, 539, 571`. **Verified** the call is fire-and-forget and races `router.replace`. **Downgraded to P2:** `persistUser` (245–252) already wraps its `SecureStore.setItemAsync` in try/catch and logs — so a storage failure is *not* an unhandled rejection (the finding's "silently swallowed" claim is inaccurate; it's logged). The remaining issue is the theoretical write-vs-navigate race, which is benign because cold-start is the only reader of `USER_PROFILE_KEY` and that path can't run before the next launch. Still worth tightening.

**Concrete fix:** `await persistUser(response.user);` in all three paths (the write is sub-millisecond vs the preceding network round-trip). `_registerPushToken()` stays fire-and-forget by design.

---

### [P2] HOOKS-05 — `useHealthMetrics.sync()` setState after unmount · `SYSTEMIC:unmount-guard`
**File:** `mobile/src/hooks/useHealthMetrics.ts:230-298`. **Verified.** `sync()` loops `await localDb.execute(…)` per HealthKit sample then `await load()` (274/289); a multi-second sync that the user navigates away from fires setState on a dead component. **Fix:** add a `mountedRef` (per `useLocalStreak`), guard all setters in `load` and `sync`, and early-return `sync` if `!mountedRef.current`. Folds into the HOOKS-02 cleanup pattern.

### [P2] API-04 — `progress.ts` `date: ''` phantom chart point
**File:** `mobile/src/api/progress.ts:90, 125`. **Verified.** `ts = s.logged_at ?? s.created_at ?? ''` → `earliestAt = ''` → `date = ''.slice(0,10) = ''`, which sorts before every real date as a leading bogus point. **Fix:** `if (!earliestAt) continue;` (or filter `points` to `p.date !== ''`) before building the chart series.

### [P2] API-05 — Pro history N+1 (up to 90 concurrent GETs)
**File:** `mobile/src/hooks/useWorkoutHistory.ts:276-278`. **Verified.** `Promise.all(workouts.map(w => getSetsForWorkout(w.id)))`. **Fix:** add a batched `GET /sets?workoutIds=…` and a multi-id `getSetsForWorkout`, or cap the window to the 30-day UI default server-side. (Compounds with API-02 — the per-call accessor also needs the `?? []` guard.)

### [P2] API-06 — `(err as any).isPaywall` mutation
**File:** `mobile/src/api/alternatives.ts:75`. **Verified.** **Fix:** define `class PaywallError extends Error {}`, throw it on 402/403, and have callers check `err instanceof PaywallError` instead of the untyped duck-typed flag.

### [P2] HOME-05 / HOME-06 / ROUTINES-02 / SCORE-03 / PLANS-02 (verified, fixes summarized)
- **HOME-05** (`index.tsx:618-639`/label): "PRs this week" is a rolling-7-day window — rename label to "PRs (7 days)" or compute ISO-week-Monday cutoff. (Product call.)
- **HOME-06** (`index.tsx:647-651`): wrap `handleRefresh` in `useCallback([refetch, loadPlan])` so `RefreshControl.onRefresh` is stable.
- **ROUTINES-02** (`routines.tsx:511-512`): move `GestureHandlerRootView` to the app root (`app/_layout.tsx`) per the CLAUDE.md invariant; remove from `RoutinesPage`.
- **SCORE-03** (`ThemeContext.tsx:77-91`): add a `cancelled` flag + cleanup to the theme-load IIFE (same pattern as HOOKS-02).
- **PLANS-02** (`plans.tsx:413-422`) · `SYSTEMIC:tier-breach`: add `if (isLocalFirst(user)) { setError('Server plan detail is Pro-only'); return; }` at the top of `loadPlan`, or skip rendering `PlanDetailModal` when `isLocalFirst(user)`. Currently a *soft* gate (not reachable on the free path via normal UI), so P2 — but harden it so it doesn't depend on UI wiring.

### P3 cluster (verified, low impact — never block on these)
- **HOOKS-06** (`usePowerSyncLog.ts:347-369`): watch-loop `setSets` is already behind `if (!aborted)` (line 360) — already mitigated; optional `if (aborted) return` after the `getAll`. Downgraded P2→P3.
- **HOOKS-07** (`useRestTimer.ts:64-76`): nested `setSecondsLeft` inside a `setEndTs` updater is an impure updater (double-fire risk in Strict Mode). Read `endTs` from a ref and call both setters non-nested.
- **API-06 typing**, **API-07** (`auth.ts:60-68` orphaned JSDoc), **SCORE-05** (`types/api.ts:231` stale `weight_raw/8` Epley comment), **SCORE-06** (`AuthContext.tsx:13-16` header understates the transient-keep path), **RANKINGS-03** (`rankings.tsx:66/75` `useReducedMotion` vs `useReduceMotion` double import — pick the project hook), **LAYOUT-01** (`_layout.tsx:54-56` add a comment that `scale` SharedValue is intentionally omitted from deps). All comment/dead-code/style — fix opportunistically.

---

## (d) Dropped / downgraded

- **API-03 — DROPPED.** `usePlans.ts:105` "no degrade / TypeError" is not an independent defect: the hook's `catch` (107) already sets `setError`; the only real problem is the upstream `TypeError` from `getPlans()`'s envelope accessor, which is **API-02**. Fixing API-02 fully resolves it. No separate finding.
- **SCORE-02 — DOWNGRADED P1 → P2.** The finding states the floating `persistUser()` rejection is "silently swallowed." It is not: `persistUser` (AuthContext:245-252) wraps the write in try/catch and `console.warn`s on failure, so there is no unhandled rejection. The residual write-vs-`router.replace` race is benign (the only reader of the persisted profile is the next cold-start, which cannot run before the next launch). Real but low-impact → P2.
- **HOOKS-06 — DOWNGRADED P2 → P3.** The cited setState-after-unmount in the watch loop is **already guarded** by the existing `if (!aborted)` check immediately before `setSets` (usePowerSyncLog.ts:360). The finding itself concedes this ("already partially mitigated"). The remaining window is a micro-nit, not a P2.

_Scope note: tsc-flagged files `insightsLocal.ts` (250/272), `peakAvatarOptions.ts` (TS1117 dup keys 340/343), `connector.ts:96`, `RoutineEditorSheet.tsx`, `RoutineStrip.tsx`, `WorkoutLoggerHost.tsx`, and the expo-router typed-route string TS2345s are **out of this lane** (other auditors own them) and are intentionally not synthesized here._
