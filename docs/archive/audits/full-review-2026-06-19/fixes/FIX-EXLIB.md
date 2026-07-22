# FIX-EXLIB — exercise-library.tsx

Branch: `fix/full-review-2026-06-19` · Implementer: FIX-EXLIB (Opus)

## Files changed
- `mobile/app/exercise-library.tsx` (only)

## Fixes

### A4-01 (P0, Invariant 1) — local-first set history in ExerciseDetailModal
`ExerciseDetailModal` fetched set history with an unconditional `apiClient.get('/sets?exercise_id=…')`, so free/local-first users always failed → "Could not load history."

Now the set-history `useEffect` branches on `isLocalFirst(user)`:
- **Free (local-first):** `localDb.init()` then `localDb.getAll<SetRecord>` over the on-device `sets` table — `SELECT id, workout_id, weight_kg, weight_raw, reps, logged_at FROM sets WHERE exercise_id = ? ORDER BY logged_at DESC LIMIT ?`. Mirrors `src/data/localProgress.ts` (and matches how `LiftProgressChart` already branches in this same modal). No personal REST call on the free path.
- **Pro:** unchanged `GET /sets`.

The existing `setKg()` / `setTimestamp()` helpers already COALESCE `weight_kg`/`weight_raw` and `logged_at`/`created_at`, so the downstream personal-best + volume-chart maths work identically for both rows. `user` added to the effect deps.

### A4-03 (P0, Invariant 2) — goal-weight unit conversion
The weight×reps goal stored the raw display value into `target_weight_kg` (a lbs user's "185" was saved as 185 kg) and rendered/prefilled it as raw kg.

- **Write** (`handleSaveGoal`): `displayToKg(parseWeightInput(goalWeight), unitPref)` → exact kg stored. Validation uses the `parseWeightInput` null-check instead of `parseFloat`.
- **Prefill** (Edit goal press): `kgToInputValue(goal.target_weight_kg, unitPref)` so the input shows the user's unit.
- **Display**: `formatWeight(goal.target_weight_kg, unitPref, 0)` (was hardcoded `{kg} kg`), so lbs users see the right number + suffix.
- **Input label/placeholder**: now `Weight (${unitPref})` and pounds/kilograms a11y label (was hardcoded "kg").

`unitPref` is sourced exactly as before (`(user?.unit_pref as 'kg'|'lbs') ?? 'kg'`, already present at component top, same as `LiftProgressChart`); added to `handleSaveGoal` deps.

## Imports added
`isLocalFirst` (`src/data/backup/tierPolicy`), `localDb` (`src/db/localDb`), `displayToKg, parseWeightInput, kgToInputValue, formatWeight` (`src/constants/units`). All used.

## Concern
Could not run the `@babel/parser` parse-sweep / `tsc` gate myself — the shared Linux workspace was occupied by sibling fan-out agents the whole time. Edits were applied via the tracked file tools and manually re-read; changes are surgical and TS-typed (annotated `loadSets: Promise<SetRecord[]>`; both branches resolve to `SetRecord[]`). The final integration verification pass should still run the sweep over this file.
