# TICKET-044 — RPE Logging Field on Set Entry Form
**Owner:** dev-frontend + dev-backend
**Date opened:** 2026-05-22
**Phase:** 2 (Post-launch polish — first 60 days)
**Source:** DEV_NEXT_STEPS_2026-05-11.md Step 17 (originally designated TICKET-028); ROADMAP.md §2.3

---

## Goal

Add an optional RPE (Rate of Perceived Exertion, scale 1–10) field to every set log entry. This resolves the open exec decision: RIR (Reps In Reserve) is already logged (TICKET-002) but is a distinct concept from RPE. Marcus-persona users expect an explicit RPE field. Both coexist — RIR remains; RPE is additive.

---

## Acceptance criteria

1. `sets` table has an optional `rpe` column: `SMALLINT CHECK (rpe >= 1 AND rpe <= 10)`.
2. `POST /sets` and `PUT /sets/:id` accept an optional `rpe` field (Zod: `z.number().int().min(1).max(10).optional()`).
3. `SetEntryForm.tsx` shows an optional RPE stepper (1–10) below the reps/weight fields, labeled "RPE (optional, 1 = easy, 10 = max effort)".
4. Logged RPE appears in session history detail view alongside reps/weight.
5. A `Tooltip` component wraps "RPE" on the form, linking to the glossary entry for RPE.
6. RPE trend chart is added to the Progress screen (per-exercise avg RPE over last 8 weeks), shown only when ≥ 3 RPE-tagged sets exist.
7. Existing sets with no RPE render correctly (null = no display, not "0").

---

## Implementation plan

### Migration
Create `migrations/20260522_sets_rpe.sql`:
```sql
ALTER TABLE sets ADD COLUMN IF NOT EXISTS rpe SMALLINT CHECK (rpe >= 1 AND rpe <= 10);
```

### Backend
- `routes/sets.js` — add `rpe: z.number().int().min(1).max(10).optional()` to the CreateSchema and UpdateSchema. Include `rpe` in all SELECT/RETURNING clauses.

### Mobile
- `mobile/src/components/SetEntryForm.tsx` — add RPE stepper below existing fields. Stepper: tap to activate, +/- buttons, null by default (user must opt in). Include `Tooltip` wrapping the "RPE" label.
- `mobile/src/types/api.ts` — add `rpe?: number` to `LiftSet` type.
- `mobile/app/workout-day.tsx` (or set detail view) — display RPE inline with set row when present.
- `mobile/app/progress.tsx` — add RPE trend section (VictoryLine, per-exercise, conditioned on having ≥ 3 RPE data points).

### Glossary update
- `mobile/src/utils/glossaryTerms.ts` — confirm RPE entry exists with definition: "A 1–10 scale of how hard a set felt. RPE 6 = could do 4+ more reps. RPE 10 = absolute maximum effort."

---

## Test plan

1. Log a set with RPE 8 — verify it persists and displays in history.
2. Log a set with no RPE — verify existing display is unchanged.
3. Set RPE to 10, edit to RPE 7 — verify update propagates.
4. RPE stepper clamps at 1 (min) and 10 (max).
5. Progress screen RPE chart: hidden when < 3 RPE sets; visible when ≥ 3 sets for one exercise.

---

## Notes
- Do NOT replace or remove the existing RIR field. RPE and RIR coexist.
- RPE field is opt-in on a per-set basis — no required validation.
- Tooltip must link to glossary (TICKET-043 component).
