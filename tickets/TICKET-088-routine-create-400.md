# TICKET-088 — Creating a routine fails with "Request failed status 400"

**Owner:** dev-backend (primary) + dev-frontend (secondary)
**Date opened:** 2026-06-04
**Phase:** R — Revision & Hardening
**Model lane:** Opus (schema/contract decision) → Sonnet (apply)
**Severity:** P0 — the core "+ New routine" action is completely broken.
**Files in scope:**
- `peak-fettle-agents/server/routes/routines.js`  ← primary (Zod schema)
- `mobile/app/(tabs)/routines.tsx`                 ← client payload
- (read-only) `mobile/src/api/routines.ts`

---

## Symptom (founder-reported, 2026-06-04)
> "Trying to make a routine gives me Request failed status 400."

Tapping **＋ New** → entering a name → **Create** returns HTTP 400 and the routine is never saved.

## Root cause — TWO independent 400s, both real

### Cause A (the founder's exact path): empty `exercises` array is rejected
`mobile/app/(tabs)/routines.tsx:112` creates a routine with an **empty** exercise list:
```ts
const r = await createRoutine({ name, exercises: [] });
```
But the server schema **requires at least one exercise**:
```js
// peak-fettle-agents/server/routes/routines.js:25-28
const CreateSchema = z.object({
    name:      z.string().min(1).max(100),
    exercises: z.array(ExerciseEntrySchema).min(1).max(30),   // ← .min(1) rejects []
});
```
`CreateSchema.parse({ name, exercises: [] })` throws a ZodError → the error middleware returns **400**.
This is why *every* "+ New" routine fails: the UI intentionally creates an empty, named routine first
(exercises are added later via the editor), but the contract forbids empty routines.

### Cause B (the "duplicate a starter split" path): empty-string `exercise_id`
`mobile/app/(tabs)/routines.tsx:157-162` builds exercises from a template with:
```ts
exercise_id: '',   // no UUID for template exercises yet
```
The server requires a valid UUID:
```js
// routines.js:18-23
const ExerciseEntrySchema = z.object({
    exercise_id: z.string().uuid(),   // ← '' is not a UUID → 400
    ...
});
```
So **tapping a STARTER SPLIT chip also 400s** (separate code path, same end symptom).

## Required fix

### Server (`routines.js`) — make the contract match the product intent
1. **Allow an empty routine.** Change `CreateSchema.exercises` and `UpdateSchema.exercises` to
   `z.array(ExerciseEntrySchema).max(30).optional().default([])` (remove `.min(1)`). A named, empty
   routine is a valid first-class object — the user fills it in afterward via the editor. Apply the
   same relaxation to the `PUT` handler (it uses `CreateSchema`).
2. **Allow exercises that aren't yet library rows.** Template/starter-split exercises have no UUID.
   Change `ExerciseEntrySchema.exercise_id` to accept a missing/empty id:
   `exercise_id: z.string().uuid().nullable().optional()` (store `null` when absent). The `name`
   field is the source of truth for display; `exercise_id` links to the library only when known.
3. Return a structured error body on Zod failure if the global error middleware doesn't already
   (so the client can show *why* — see frontend task 2). Do not change the 400 status for genuine
   bad input.

### Frontend (`routines.tsx`) — align the payload
4. In `handleDuplicateTemplate` (line ~157) send `exercise_id: undefined` (or omit the key) instead
   of `''` so it satisfies the new nullable/optional schema. Keep `name`, `target_sets`,
   `target_reps`.
5. Surface the server error message in the catch (`handleSave`, `handleDuplicateTemplate` already
   `Alert.alert` the message) — verify the message is human-readable, not "Request failed with
   status code 400".

## Acceptance criteria
1. **＋ New → name → Create** saves an empty routine and it appears under YOURS immediately (no 400).
2. Tapping a **STARTER SPLIT** chip duplicates the template into YOURS with its exercises populated
   (no 400, no empty routine).
3. Adding/editing exercises on a routine (PUT/PATCH) still works; a routine may legitimately have 0
   exercises.
4. Genuinely malformed input (name > 100 chars, > 30 exercises, non-UUID where a UUID is sent) still
   returns 400 — the relaxation must not blanket-accept garbage.
5. `peak-fettle-verify` parse-sweep clean; `node --check routines.js` passes.

## Test plan
- `POST /routines {name:"Push A", exercises:[]}` → 201.
- `POST /routines {name:"Push A", exercises:[{name:"Bench", target_sets:3, target_reps:"8-12"}]}` (no
  `exercise_id`) → 201.
- `POST /routines {name:"x", exercises:[{exercise_id:"<real-uuid>", name:"Squat"}]}` → 201.
- `POST /routines {name:"", exercises:[]}` → 400 (name still required).
- In-app: create empty routine, duplicate a starter split, confirm both land in YOURS.

## Definition of done
Parse-sweep clean; committed via `peak-fettle-commit`. Note the schema change in the next roadmap.
