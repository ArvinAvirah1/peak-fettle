# TICKET-089 — Exercise search returns nothing when choosing an exercise (recurrence after TICKET-079)

**Owner:** dev-backend (primary) + dev-frontend (diagnostics)
**Date opened:** 2026-06-04
**Phase:** R — Revision & Hardening
**Model lane:** Sonnet
**Severity:** P1 — search is a no-op during logging; user must hand-scroll the full library.
**Depends on / supersedes scope of:** TICKET-079 (the *scroll-to-top* fix landed and is in the code;
this ticket is the **remaining** cause — the result set itself is empty).
**Files in scope:**
- `peak-fettle-agents/server/routes/exercises.js`  ← primary suspect (search SQL / 500)
- `mobile/src/api/exercises.ts`                      ← stop swallowing the real error
- (read-only) `mobile/src/components/ExercisePicker.tsx`, `mobile/app/exercise-library.tsx`

---

## Symptom (founder-reported, 2026-06-04)
> "Searching when you try to choose an exercise in the app does not work."

Typing a query in the exercise picker yields no match — every query falls through to
"No exercises found for '<q>'".

## Why this is NOT the TICKET-079 bug
TICKET-079 fixed "results come back but render off-screen." That fix is present:
`ExercisePicker.tsx` now holds a `listRef` and scrolls to top on `searchResults` change
(`ExercisePicker.tsx:104-106`), and `getItemLayout` was removed. So if the founder still sees
nothing, **`searchResults` is actually empty**, not merely scrolled off-screen.

## Prime suspect — the search endpoint is 500ing and the client swallows it
`searchExercises()` catches **any** error and returns `{ results: [], total: 0 }`:
```ts
// mobile/src/api/exercises.ts:67-83
try { ... return response.data; }
catch { return { results: [], total: 0 }; }   // ← silent — a 500 looks identical to "0 matches"
```
`ExercisePicker.handleQueryChange` (lines 119-128) likewise `setSearchResults([])` on throw and
only `console.warn`s. So a server-side failure presents as "search does not work" for *every* query.

Most likely server-side cause: the search SQL joins/subqueries the **`exercise_aliases`** table
(`exercises.js:50-67`). If that table is missing/empty or unmigrated on the live DB (TICKET-073
cutover), the query throws → 500 → swallowed → empty results. Browse (`GET /exercises`) does **not**
touch `exercise_aliases`, which is why browsing the full library still works and only *search* is dead.

## Required investigation (do this first — confirm before fixing)
1. Hit the live endpoint directly: `GET /exercises/search?q=bench` with a valid auth token.
   Record the actual status + body.
   - **If 500:** read the server log / error. Fix the SQL or the missing migration (task A).
   - **If 200 with `results: []`:** the data/match logic is the bug — check that `exercises` rows
     exist on the live DB and that `exercise_aliases` is seeded; verify `ILIKE`/`LOWER` matching
     against real row casing (task B).
2. Temporarily log the raw error in `searchExercises` catch (remove before commit) to capture the
   client-observed status.

## Required fix (apply what the investigation proves)
**A. Harden the search query (server).** If `exercise_aliases` is the failure point, make the alias
subqueries resilient — the route must degrade to name-only search rather than 500 when the alias
table is unavailable. Either guarantee the migration ran (preferred) or wrap alias matching so a
missing table doesn't kill the whole query. Re-run the seed/migration for `exercise_aliases` on the
live DB if that's the gap.

**B. Stop hiding server failures (client).** In `searchExercises` and `ExercisePicker`, distinguish
"genuinely 0 matches" (HTTP 200, empty array) from "request failed" (network/5xx). On a real failure,
surface a retryable error state instead of the misleading "No exercises found … add as custom" —
creating a custom duplicate of an exercise that *does* exist pollutes the library. Do **not**
reintroduce the mock fallback (forbidden, TICKET-067).

## Acceptance criteria
1. Typing "bench" returns "Bench Press" at the top of the picker; "ohp" resolves to the canonical
   exercise via alias.
2. A query with a genuine match never shows "No exercises found."
3. A real backend failure shows a distinct, retryable error — not the custom-add empty state.
4. `exercise-library.tsx` search (same endpoint) is verified working too (it shares the cause).
5. No debug logs remain; `peak-fettle-verify` clean; `node --check exercises.js` passes.

## Test plan
- curl/Postman: `GET /exercises/search?q=bench`, `?q=ohp`, `?q=zzzznotreal` → 200 with sensible
  results / empty for the last.
- In-app picker: type "curl" → "Dumbbell Curl" at top. Kill server → search → retryable error, no crash.

## Definition of done
Root cause documented in the ticket on close (which of A/B it was); parse-sweep clean; committed via
`peak-fettle-commit`.
