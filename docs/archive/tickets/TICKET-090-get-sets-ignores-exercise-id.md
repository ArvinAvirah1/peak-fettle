# TICKET-090 — Exercise history/progress shows the wrong sets: `GET /sets` ignores `exercise_id`

**Owner:** dev-backend
**Date opened:** 2026-06-04
**Phase:** R — Revision & Hardening
**Model lane:** Opus (data-contract bug) → Sonnet (apply)
**Severity:** P1 — every per-exercise history/PB/progress view is computed from the wrong data.
**Files in scope:**
- `peak-fettle-agents/server/routes/sets.js`  ← primary
- (read-only, the callers) `mobile/src/api/progress.ts`, `mobile/app/exercise-library.tsx`

---

## Symptom (founder-reported, 2026-06-04)
> "When I try to access my [hack squat] exercise history it just lists my hack squat only and not
> all of the other exercises."

Re-stated: opening an exercise's history/progress shows data dominated by one exercise
(hack squat — the most-logged lift) regardless of which exercise was tapped. The per-exercise view is
not actually filtered to that exercise.

## Root cause — the server silently ignores the `exercise_id` filter
Two clients request a single exercise's sets:
```ts
// mobile/src/api/progress.ts:68-70   (LiftProgressChart)
apiClient.get('/sets', { params: { exercise_id: exerciseId, limit: 100 } });
// mobile/app/exercise-library.tsx:541-543   (detail modal: PB + volume chart)
apiClient.get('/sets', { params: { exercise_id: exercise.id, limit: SET_HISTORY_LIMIT } });
```
But `GET /sets` only branches on `workoutId` or `cursor` — **there is no `exercise_id` handling**:
```js
// peak-fettle-agents/server/routes/sets.js:130-169
const { workoutId, cursor } = req.query;     // exercise_id is never read
...
// falls through to the cursor branch:
`SELECT s.* FROM sets s WHERE s.user_id = $1 ${cursorClause}
 ORDER BY s.logged_at DESC LIMIT $2`         // ← returns the 100 most-recent sets across ALL exercises
```
So the request returns the user's 100 most-recent sets across every exercise. Because the recent log
is dominated by the most-frequent lift (hack squat), the "history" for *any* exercise renders
hack-squat data. The client code then mislabels it as belonging to the selected exercise
(`getExerciseProgress` and `computePersonalBest`/`computeSessionVolumes` assume every returned set is
the requested exercise).

## Required fix (server)
Add an `exercise_id` branch to `GET /sets` (`sets.js:130`):
1. Read `exercise_id` (also accept `exerciseId` for safety) from `req.query`.
2. When present, validate it's a UUID and return **only that exercise's sets for the calling user**,
   ordered `logged_at DESC`, honoring `limit` (default 50, max 200). Keep the existing ownership
   scoping (`s.user_id = $1`). Return `{ sets: rows.map(normalizeSet), nextCursor: null }` for
   consistency with the other branches. `exercise_id` may be combined with `cursor` for paging, but a
   single-page (limit 100) response is sufficient for current callers.
3. Leave the `workoutId` and bare-cursor branches untouched.

Note: `normalizeSet` returns `weight_kg` (decoded). The clients read `weight_kg` and `created_at` —
confirm both fields are present in the returned rows (`s.*` includes `logged_at`; the modal reads
`created_at` — verify the column name and that the client field matches, fix the mismatch if the
column is `logged_at` not `created_at`).

## Acceptance criteria
1. `GET /sets?exercise_id=<id>&limit=100` returns **only** that exercise's sets for the user, newest
   first; never another exercise's sets.
2. Exercise-library detail modal: Personal Best, "Best set", and the volume chart reflect the
   **tapped** exercise, and differ correctly between two different exercises.
3. `LiftProgressChart` plots the tapped exercise's real progression.
4. Tapping hack squat shows hack squat; tapping bench press shows bench press — no cross-contamination.
5. Existing `?workoutId=` and `?cursor=` behavior unchanged. `node --check sets.js` passes;
   `peak-fettle-verify` clean.

## Test plan
- Seed two exercises with distinct sets for one user. `GET /sets?exercise_id=A` → only A's sets;
  `?exercise_id=B` → only B's. `?workoutId=<w>` → that workout's sets (unchanged).
- In-app: log sets for ≥2 exercises, open each in the library detail modal, confirm PB/volume differ
  and match what was logged for that exercise.

## Definition of done
Parse-sweep clean; committed via `peak-fettle-commit`. Pairs with TICKET-091 (trends list mislabeling)
to fully resolve the "only hack squat" report.
