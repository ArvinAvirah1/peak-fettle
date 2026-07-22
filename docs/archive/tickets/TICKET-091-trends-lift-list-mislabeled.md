# TICKET-091 — Trends lift list mislabels every row as the first lift ("only hack squat")

**Owner:** dev-frontend
**Date opened:** 2026-06-04
**Phase:** R — Revision & Hardening
**Model lane:** Sonnet
**Severity:** P2 — progress list is unusable; every exercise appears under one name.
**Files in scope:**
- `mobile/app/trends.tsx`                       ← primary (name resolution)
- `mobile/src/hooks/useWorkoutHistory.ts`       ← expose an id→name map (preferred fix)

---

## Symptom (part of the founder-reported "only hack squat" issue, 2026-06-04)
The Trends/progress screen lists the distinct lifts you've logged, but **every row shows the same
name** (the first lift logged that day — e.g. "Hack Squat"), so it looks like the only exercise you
have history for is hack squat, even though multiple rows exist.

## Root cause — the name lookup ignores the exercise id
`trends.tsx` derives `liftEntries` by deduping sets by `exercise_id` (correct), but the name lookup is
broken:
```ts
// mobile/app/trends.tsx:124-131
const name = entry.liftNames.find((_, i) => {
  const setForId = entry.sets.find(
    (ss) => ss.kind === 'lift' && (ss as {exercise_id?:string}).exercise_id === id
  );
  return setForId !== undefined;          // ← does NOT depend on `i` or the element
}) ?? id;
```
The `.find` predicate ignores its arguments and is `true` as soon as *any* set with `id` exists in the
entry (always true — we're iterating that set). So `.find` returns **`liftNames[0]`** every time. Since
`liftNames` is ordered by first-logged, every exercise resolves to the first lift's name. Distinct ids
→ identical labels → "everything is hack squat."

## Required fix
Resolve the name from a proper **exercise_id → name** map, not by index scanning `liftNames`.

**Preferred:** expose the `exerciseMap` already built in `useWorkoutHistory`
(`useWorkoutHistory.ts:113-120` builds `Map<id, name>` from the exercise library) on the hook's return
value, and use it directly in `trends.tsx`:
```ts
const name = exerciseMap.get(id) ?? id;
entries.push({ exerciseId: id, name });
```
If exposing the map is undesirable, build a local `Map<exercise_id, name>` in `trends.tsx` by pairing
each lift set's `exercise_id` with its resolved name at the point the history entry is constructed —
but reusing the hook's map is cleaner and avoids a second source of truth.

Remove the dead `.find` scan and the `nameById` memo can stay (rebuilt from corrected `liftEntries`).

## Acceptance criteria
1. The Trends list shows each distinct lift under its **own** correct name (hack squat, bench press,
   etc.) — no duplicated labels.
2. Deep-link `?exerciseId=&exerciseName=` still opens the right exercise.
3. Tapping a row opens that exercise's chart (relies on TICKET-090 for correct data).
4. Empty state ("No lifts logged yet") preserved when history is empty.
5. `peak-fettle-verify` parse-sweep clean.

## Test plan
- Log ≥3 different lifts across the 30-day window. Open Trends → confirm 3 rows with 3 distinct,
  correct names. Tap each → correct chart (with TICKET-090 applied).

## Definition of done
Parse-sweep clean; committed via `peak-fettle-commit`. Resolve alongside TICKET-090.
