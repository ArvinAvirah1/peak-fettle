# S-CORE findings
## Summary
Files reviewed: 17 (`context/AuthContext.tsx`, `context/PowerSyncContext.tsx`, `constants/units.ts`, `constants/locale.ts`, `constants/ioniconsGlyphMap.json`, `services/healthKit.ts`, `services/pushNotifications.ts`, `services/widgetBridge.ts`, `theme/ThemeContext.tsx`, `theme/tokens.ts`, `theme/types.ts`, `types/api.ts`, `utils/dateHelpers.ts`, `utils/glossaryTerms.ts`, `utils/haptics.ts`, `utils/liftNames.ts`, `utils/smartSuggest.ts`).
Counts — P0: 0  P1: 2  P2: 2  P3: 2.
Overall health is good: the auth cold-start invariant is correctly implemented, units math is sound, and no data-integrity or security holes were found; the two P1s are a latent token-clear over-trigger and a floating-promise risk on login.

---

### [P1] SCORE-01 — Token cleared on non-401 4xx without body check: 2xx–4xx range is too broad

- **File:** `mobile/src/context/AuthContext.tsx:408–415`
- **Problem:** The bootstrap error classifier clears the stored refresh token if `status >= 200 && status < 500` AND the response body `error` field matches `/invalid|revoked|expired/i`. The `>= 200` lower bound is surprising — a 200 or 301 response from a misconfigured proxy/CDN that happens to contain the word "expired" in a JSON body would silently wipe the refresh token and force re-login. The intended window is `>= 400 && < 500` (client-error 4xx only, excluding 401 which is handled first). 5xx and network errors correctly stay false and keep the token.
- **Evidence:**
  ```ts
  } else if (status && status >= 200 && status < 500) {
    // 4xx other than 401 (e.g. 400 bad_request): treat as auth failure
    // only if the response body signals an invalid/revoked token.
    const errField: string =
      (err.response?.data as { error?: string } | undefined)?.error ?? '';
    if (/invalid|revoked|expired/i.test(errField)) {
      isDefinitiveAuthFailure = true;
    }
  }
  ```
- **Invariant/Rubric:** Invariant 5 — auth token must only be cleared on a definitive auth rejection; the current range admits 2xx/3xx responses as token-clearing triggers.
- **Suggested direction:** Change the lower bound from `>= 200` to `>= 400` (keeping `< 500`) so only genuine 4xx client-error responses with an auth-failure body body trigger a token clear. A 2xx or 3xx from the refresh endpoint is not a token-invalidation signal.
- **Confidence:** MED (Axios follows redirects before surfacing them, so 3xx is unlikely in practice; a proxy 200 with "expired" body is real but unusual)

---

### [P1] SCORE-02 — `persistUser` called without `await` in `login`, `register`, `loginWithOAuth`

- **File:** `mobile/src/context/AuthContext.tsx:502, 539, 571`
- **Problem:** `persistUser(response.user)` is a floating async call in all three auth-success paths — the `async` function is invoked but its returned Promise is neither awaited nor `.catch`-ed at the call site. If `SecureStore.setItemAsync` throws (e.g. storage full, OS keychain error) the rejection is silently swallowed. More critically, because `persistUser` is fire-and-forget, it races with `router.replace(...)` on the next line: if the router navigation triggers a component tree that reads the cached user from SecureStore before the write completes, it sees a stale (or absent) profile. In practice the write is typically fast enough that this doesn't manifest, but it is an unguarded race.
- **Evidence:**
  ```ts
  await persistRefreshToken(response.refreshToken);
  // Persist user profile so cold-start can restore it without /auth/me.
  persistUser(response.user);   // ← no await, no .catch
  _registerPushToken();
  router.replace('/(tabs)/');   // ← races the SecureStore write above
  ```
- **Invariant/Rubric:** P1 rubric — floating promises (`async` called without `await`/`.catch`); the function is explicitly `async` and its `try/catch` only swallows errors internally after the `await SecureStore.setItemAsync` point.
- **Suggested direction:** Either `await persistUser(response.user)` (preferred — the write is fast and the cost is negligible compared to the preceding network round-trip), or at minimum add a `.catch(console.warn)` so failures surface in logs. `_registerPushToken()` is intentionally fire-and-forget per spec and is fine.
- **Confidence:** HIGH

---

### [P2] SCORE-03 — `ThemeContext` load-effect IIFE has no cancelled/mounted guard

- **File:** `mobile/src/theme/ThemeContext.tsx:77–91`
- **Problem:** The `useEffect` that loads the persisted theme from `AsyncStorage` uses a fire-and-forget IIFE with no `cancelled` flag. If `ThemeProvider` were to unmount before the `AsyncStorage.getItem` resolves (test environments, navigation edge cases, StrictMode double-invoke in dev), `setThemeName` and `setThemeObj` would be called on an unmounted component. React 18 no longer throws for this, but it can still trigger state-update-after-unmount warnings in some Expo SDK setups and leaves the component in an unexpected state.
- **Evidence:**
  ```ts
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored && stored in THEMES) {
          const name = stored as ThemeName;
          setThemeName(name);   // ← no cancelled guard
          setThemeObj(THEMES[name]);
        }
      } catch { ... }
    })();
    // ← no cleanup / no return () => { cancelled = true }
  }, []);
  ```
- **Invariant/Rubric:** P2 rubric — missing `useEffect` cleanup; P1 boundary if the project still runs with older React/Expo that warns on unmounted setState.
- **Suggested direction:** Add a `let cancelled = false` flag, gate both `setThemeName`/`setThemeObj` calls on `!cancelled`, and return `() => { cancelled = true; }` from the effect — the same pattern used in `AuthContext` and `PowerSyncContext`.
- **Confidence:** HIGH

---

### [P2] SCORE-04 — `isoWeekKey` uses local-date inputs then computes in UTC; potential week-boundary error near midnight

- **File:** `mobile/src/utils/dateHelpers.ts:16–28`
- **Problem:** `isoWeekKey` extracts the local-time year/month/date from its `date` argument (`date.getFullYear()`, `date.getMonth()`, `date.getDate()`) and then builds a UTC `Date` with those values. This is the standard ISO-week algorithm and is correct when the caller passes a date that was itself constructed in local time. However, if a caller passes a UTC ISO string parsed directly (`new Date('2026-06-14T23:30:00Z')`) in a UTC+1 timezone, the local date is June 15 but the string represents June 14 UTC — the week key would be computed for June 15, not June 14. The streak/evaluation logic that compares `day_key` strings (which are UTC-based from the server) could produce off-by-one week assignments for users in UTC+ timezones near midnight.
- **Evidence:**
  ```ts
  export function isoWeekKey(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    //                       ^^^ local-time fields fed into a UTC constructor
  ```
- **Invariant/Rubric:** P2 rubric — correctness edge case; data integrity for streak logic in non-UTC timezones near midnight boundaries.
- **Suggested direction:** Callers that derive `date` from a UTC `day_key` string (`new Date(dayKey + 'T00:00:00Z')`) should pass the UTC date fields instead: use `date.getUTCFullYear()`, `date.getUTCMonth()`, `date.getUTCDate()`, or pass already-local-midnight dates. Add a JSDoc note clarifying the expected input convention. This auditor cannot confirm from within this scope whether all callers use local-midnight dates — the hook auditors should verify.
- **Confidence:** MED (depends on how callers construct the `Date` passed in)

---

### [P3] SCORE-05 — Stale Epley formula comment in `PercentileRanking.epley_estimate_kg`

- **File:** `mobile/src/types/api.ts:231`
- **Problem:** The JSDoc comment for `epley_estimate_kg` says the server computes it via `weight_raw/8 × (1 + reps/30)`. The `weight_raw` column (kg×8 fixed-point) was dropped in migration `20260505_sets_weight_raw.sql`; the server now uses `weight_kg` directly. The comment misleads future developers about the server-side computation.
- **Evidence:**
  ```ts
  * The best Epley estimate (computed inline server-side via MAX of
  * `weight_raw/8 × (1 + reps/30)` across logged lift sets) for this lift.
  ```
- **Invariant/Rubric:** P3 — misleading comment; does not affect runtime.
- **Suggested direction:** Update the comment to `weight_kg × (1 + reps/30)` to match the current server implementation.
- **Confidence:** HIGH

---

### [P3] SCORE-06 — `AuthContext` cold-start header comment understates the transient-error safety net

- **File:** `mobile/src/context/AuthContext.tsx:13–16`
- **Problem:** The file-level doc comment says step 3 is "If refresh fails (revoked, expired), clear SecureStore and show login." This omits the critical transient-error path (network error, timeout, 5xx → keep token, stay signed in). A developer reading only the header could believe any refresh failure clears the token — exactly the dangerous pattern this code was hardened against in the PUSH-001/002 remediation.
- **Evidence:**
  ```
  *   3. If refresh fails (revoked, expired), clear SecureStore and show login.
  ```
  (Missing: "On network error / timeout / 5xx, keep the token and stay signed in.")
- **Invariant/Rubric:** P3 — misleading comment; the actual implementation is correct.
- **Suggested direction:** Expand step 3 in the header: "If refresh fails with a definitive 401 or auth-body error (revoked/expired), clear SecureStore and show login. On network error, timeout, or 5xx, keep the stored token — the user stays signed in and the 401 interceptor will re-establish the access token on the next API call."
- **Confidence:** HIGH
