# TICKET-092 — Workout History screen crashes: `setHasMore`/`setLoadingMore` are undeclared

**Owner:** dev-frontend
**Date opened:** 2026-06-04
**Phase:** R — Revision & Hardening
**Model lane:** Sonnet
**Severity:** P1 — the full Workout History browse screen throws on every load.
**Files in scope:**
- `mobile/app/workout-history.tsx`  ← only file

---

## Symptom
Opening **Workout History** (`router.push('/workout-history')`) fails to load — the fetch throws a
`ReferenceError` and the screen never leaves its loading/error path. Found during the TICKET-088…091
investigation (not separately founder-reported, but it's a hard crash on a shipped screen).

## Root cause — two setter calls reference state that was never declared
The component declares only these state hooks (`workout-history.tsx:169-173`):
```ts
const [allWorkouts, setAllWorkouts] = useState<ApiWorkout[]>([]);
const [sections, setSections]       = useState<WorkoutSection[]>([]);
const [loading, setLoading]         = useState(true);
const [loadingMore]                 = useState(false); // ← NO setter
const [error, setError]             = useState<string | null>(null);
```
There is **no `hasMore` state at all**, and `loadingMore` has **no setter**. But `fetchPage` calls
both:
```ts
// line 192 (try block):
setHasMore(false);     // ← ReferenceError: setHasMore is not defined
// line 198 (finally block):
setLoadingMore(false); // ← ReferenceError: setLoadingMore is not defined
```
`setHasMore` throws inside `try`; even if reached, `setLoadingMore` throws in `finally`. Either way the
fetch promise rejects with a ReferenceError on every call, so history never renders.

> Note: this is a *runtime* ReferenceError, not a syntax error — it passes the `@babel/parser`
> parse-sweep and `node --check`, which is why `peak-fettle-verify` did not catch it. Treat "parse
> clean" as necessary but not sufficient for screens like this.

## Required fix
The screen loads all history in one call and has no real pagination (see the comments at lines
177-180, 207-208: "server returns all history in one call", `handleEndReached` is a no-op). So the
simplest correct fix is to **remove the dead setter calls**:
1. Delete `setHasMore(false);` (line ~192) — there is no second page; `hasMore` is unused.
2. Delete `setLoadingMore(false);` (line ~198) — `loadingMore` is a const that's always `false`.
3. Leave `loadingMore` as the `const [loadingMore] = useState(false)` it already is (it's read by
   `ListFooterComponent` at line 299), or drop it entirely and hardcode the footer to `null`.

Do **not** add real pagination under this ticket — the server caps at 90 rows and returns them in one
response by design; scope is just removing the crash.

## Acceptance criteria
1. Opening Workout History loads and renders the week-grouped list with no ReferenceError.
2. Empty, error (Retry), and populated states all render correctly.
3. No unused/undeclared identifiers remain (`hasMore`, `setHasMore`, `setLoadingMore` gone).
4. `peak-fettle-verify` parse-sweep clean; a quick lint/typecheck shows no undefined references.

## Test plan
- Open Workout History with ≥1 logged workout → list renders, tapping a row → `/workout-day`.
- With 0 workouts → empty state + "Log your first workout" CTA.
- Kill server → Retry path works, no crash.

## Definition of done
Parse-sweep clean; committed via `peak-fettle-commit`.
