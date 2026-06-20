# API findings

## Summary
Files reviewed: 18 (`mobile/src/api/*.ts`). Counts — P0: 0, P1: 2, P2: 4, P3: 1. The API layer is generally well-structured with correct Bearer token attachment, no hardcoded secrets, and most personal-data endpoints are correctly gated behind `is_paid` / `isLocalFirst` checks in their consuming hooks. Two correctness gaps stand out: the 401-interceptor logout path fires on network errors and 5xx (violating Invariant 5), and seven endpoint accessors dereference nested response fields without null-safe fallbacks (Invariant 4 schema-drift risk).

---

### [P1] API-01 — 401 interceptor calls onLogout() on network error / 5xx (Invariant 5 violation)

- **File:** `mobile/src/api/client.ts:143-146`
- **Problem:** The `catch` block in the response interceptor calls `_authHandlers.onLogout()` unconditionally for *any* failure of `_doRefresh()`. If the `/auth/refresh` call times out (10 s limit), gets a 5xx, or hits a network error, `onLogout()` is triggered — which clears SecureStore and redirects to the login screen. This directly contradicts Invariant 5: "clear the stored refresh token ONLY on a definitive 401 — never on a network error / timeout / 5xx." The cold-start bootstrap in `AuthContext.tsx` correctly classifies errors (lines 403–418) before deciding to clear; the interceptor path does not.
- **Evidence:**
```ts
} catch (err) {
  console.warn('[PF] client/responseInterceptor:', err instanceof Error ? err.message : String(err));
  _authHandlers.onLogout();  // ← fires on 5xx, timeout, and network error, not just 401
  return Promise.reject(error);
}
```
- **Invariant/Rubric:** Invariant 5 — auth cold-start / token-clear on wrong status (also P1 rubric: "auth token cleared on wrong status").
- **Suggested direction:** Mirror the AuthContext bootstrap classification: inspect the thrown error with `axios.isAxiosError(err)` and check `err.response?.status === 401` (or body `error` containing `invalid|revoked|expired`). Only call `onLogout()` on a definitive 401; on network errors / 5xx / timeout, reject without clearing the session.
- **Confidence:** HIGH

---

### [P1] API-02 — Seven response-envelope accessors lack null-safe fallback (Invariant 4 schema-drift)

- **File:** `mobile/src/api/routines.ts:34`, `mobile/src/api/plans.ts:57`, `mobile/src/api/groups.ts:55,175`, `mobile/src/api/constraints.ts:40`, `mobile/src/api/sets.ts:21`, `mobile/src/api/templates.ts:51`, `mobile/src/api/exercises.ts:108`
- **Problem:** Each of these functions accesses a nested field from the response body directly (`res.data.routines`, `response.data.plans`, `response.data.groups`, `response.data.history`, `response.data.constraints`, `response.data.sets`, `res.data.templates`, `response.data.aliases`) without a null-safe fallback. Per Invariant 4 the prod DB has drifted from `db/schema.sql`; if a server route degrades with an empty 200 (`{}`) rather than 500 (the intended behaviour), these accessors throw `TypeError: Cannot read properties of undefined` in the calling hook, which surfaces as an unhandled error rather than a clean empty state. The sole exception is `progress.ts:75` which correctly uses `response.data?.sets ?? []`.
- **Evidence:**
```ts
// routines.ts:34
return res.data.routines;          // undefined if server returns {}

// groups.ts:55
return response.data.groups;       // undefined if server returns {}

// sets.ts:21
return response.data.sets;         // undefined if server returns {}

// plans.ts:57
return response.data.plans;        // undefined if server returns {}

// templates.ts:51
return res.data.templates;         // undefined if server returns {}
```
- **Invariant/Rubric:** Invariant 4 — schema-drift tolerance; P2 rubric "no degrade on 42P01/42703."
- **Suggested direction:** Apply the same pattern as `progress.ts`: `return res.data?.routines ?? []` (and similarly for all seven). This converts a `TypeError` crash into a clean empty-array result that the calling hook can handle.
- **Confidence:** HIGH

---

### [P2] API-03 — `getRoutines()` / `getConstraints()` / `getPlans()` called server-side with no error handling in their consuming hooks

- **File:** `mobile/src/hooks/usePlans.ts:105`, `mobile/src/data/routines.ts` (Pro path)
- **Problem:** On the Pro path `getPlans()` (in `usePlans.ts`) and related wrappers do not wrap the call in a try/catch that degrades to empty state — the outer `catch` in `usePlans.ts:107` does catch the error and sets `setError(...)`, but the error message propagates to the UI with no fallback content. This is borderline P2/P3; however combined with API-02 (undefined dereference before the catch), a 500/degraded-200 server response currently produces an unhandled `TypeError`, not a graceful error banner.
- **Evidence:**
```ts
// usePlans.ts:104-110
const fetched = await getPlans();  // if server returns {}, this throws TypeError
setPlans(fetched);                 // never reached
// catch(err) sets error string — but the TypeError message is "Cannot read..."
```
- **Invariant/Rubric:** P2 — unhandled rejection / missing degrade on schema-drift.
- **Suggested direction:** Fix API-02 first (null-safe envelope accessors) — that resolves the TypeError. No separate fix needed here once API-02 is patched.
- **Confidence:** HIGH

---

### [P2] API-04 — `progress.ts` produces `ProgressPoint` with `date: ''` when `logged_at` and `created_at` are both null

- **File:** `mobile/src/api/progress.ts:88-125`
- **Problem:** When building the `sessionMap`, the timestamp key is `ts = s.logged_at ?? s.created_at ?? ''`. If a set has neither column populated (possible on older rows where the server's `normaliseSet()` didn't emit `logged_at`), `earliestAt` becomes `''` and line 125 derives `date = ''.slice(0, 10) === ''`. A `ProgressPoint` with `date: ''` sorts before all real dates, placing a phantom data point at position 0 on the progress chart. This is a silent data corruption issue on the chart rendering path.
- **Evidence:**
```ts
const ts = s.logged_at ?? s.created_at ?? '';  // '' when both absent
// ... sessionMap stores earliestAt = ''
const date = earliestAt.slice(0, 10);  // → '' — sorts before 1970-01-01
```
- **Invariant/Rubric:** P2 — incorrect display under edge case; data quality bug.
- **Suggested direction:** Filter out sessions whose `earliestAt === ''` before building `points`, or fall back to the workout's `day_key` (available as the `workout_id` could be joined if needed). At minimum: `if (!earliestAt) continue;` in the session map traversal.
- **Confidence:** HIGH

---

### [P2] API-05 — `useWorkoutHistory` Pro path issues N+1 `getSetsForWorkout` calls

- **File:** `mobile/src/hooks/useWorkoutHistory.ts:276-278`
- **Problem:** The Pro path fetches up to 90 workouts via `getWorkouts()` and then issues a separate `getSetsForWorkout(w.id)` HTTP request for each workout in a `Promise.all()`. With 90 workouts that is 90 concurrent GET /sets?workoutId=... calls. While `Promise.all` prevents sequential stalling, 90 simultaneous requests saturate the server connection pool, can trigger Railway's request-rate limits, and creates a noisy network waterfall on the History tab open. The free path avoids this entirely with a single IN-clause SQL query.
- **Evidence:**
```ts
const setsArrays = await Promise.all(
  workouts.map((w) => getSetsForWorkout(w.id))  // up to 90 concurrent HTTP calls
);
```
- **Invariant/Rubric:** P2 — performance / unnecessary re-requests; `getSetsForWorkout` is in-scope API file.
- **Suggested direction:** Add a `GET /sets?workoutIds=id1,id2,...` batched endpoint (or reuse cursor pagination with a larger limit filtered by date range) and update `getSetsForWorkout` to accept multiple IDs. Alternatively cap the history window to 30 days server-side (already the UI default).
- **Confidence:** HIGH

---

### [P2] API-06 — `alternatives.ts` mutates `err` object with `(err as any).isPaywall = true`

- **File:** `mobile/src/api/alternatives.ts:75`
- **Problem:** Attaching `.isPaywall` to the thrown Axios error via `(err as any).isPaywall = true` is fragile: it relies on callers casting and checking the duck-typed property, bypasses TypeScript's type system, and could silently fail if Axios's error object is frozen (future Axios versions). The `any` cast also suppresses type checking for this error path entirely.
- **Evidence:**
```ts
if (axios.isAxiosError(err)) {
  const status = err.response?.status;
  if (status === 402 || status === 403) {
    (err as any).isPaywall = true;  // untyped mutation
  }
}
```
- **Invariant/Rubric:** P2 — typing; `any` flowing through error path; maintainability risk.
- **Suggested direction:** Define a `PaywallError extends Error` class (or a discriminated union) and throw a new typed error instead of mutating the Axios error. Callers check `err instanceof PaywallError` instead of `(err as any).isPaywall`.
- **Confidence:** HIGH

---

### [P3] API-07 — `auth.ts` duplicate JSDoc comment block (orphaned doc before `oauthLogin`)

- **File:** `mobile/src/api/auth.ts:60-68`
- **Problem:** There is an orphaned `/**...*/` comment block for `refreshTokens()` (lines 60-64) followed immediately by a separate JSDoc block for `oauthLogin()` (lines 65-70). The `refreshTokens` function is defined at line 84, so the first block is misplaced dead documentation — it documents a function that appears 20 lines later. Low impact but confusing to maintain.
- **Evidence:**
```ts
/**
 * POST /auth/refresh
 * ...
 */
/**
 * POST /auth/oauth — Sign in with Apple / Google (TICKET-099).
 * ...
 */
export async function oauthLogin(...) { ... }
```
- **Invariant/Rubric:** P3 — dead code / misleading comment.
- **Suggested direction:** Move the `refreshTokens` JSDoc to sit directly above the `refreshTokens` function definition at line 84.
- **Confidence:** HIGH
