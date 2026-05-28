# Peak Fettle Dev Roadmap — 2026-05-25

## Session summary

Bug-fix session + Qt parity audit. Three regressions fixed, one precision band-aid
applied, free-text exercise entry shipped, Qt parity gaps catalogued below.

---

## Fixes shipped this session

| Ref | Fix |
|-----|-----|
| EX-001 | `searchExercises()` mock fallback removed — now returns empty results on failure instead of fake-UUID exercises that cause FK violations on POST /sets |
| EX-002 | `POST /exercises` added (auth-gated) — upserts an exercise by name and returns the server UUID; backs free-text "Add custom exercise" flow |
| EX-003 | `ExercisePicker` — search placeholder updated, "Add '[query]' as custom exercise" button shown when query is non-empty (in search results footer and in empty state) |
| WGT-001 | `formatWeight()` — quarter-lb rounding (`Math.round(lbs × 4) / 4`) applied before display; 44.9 lbs → 45.0 lbs for standard plate weights |
| WGT-002 | Long-term fix identified: store weight in user's preferred unit to eliminate round-trip precision loss (deferred, see QT-005 below) |

---

## Qt Creator app → Mobile parity gaps

The Qt Creator desktop app has features not yet present in the mobile release.
These are ranked roughly by user impact.

---

### QT-001 · Routine planner with PPL / Upper-Lower A/B split selector  ★★★ HIGH

**Qt behaviour.** The routine setup screen offers:
- Push / Pull / Legs (3-day split, or 6-day P/P/L/P/P/L)
- Upper A / Upper B / Lower A / Lower B (4-day UL with A/B variation)
- Save your own routine and track it persistently

**Mobile status.** Templates screen shows PPL and Upper/Lower template tiles
(`Leg Day (PPL)`, `Lower A (Upper/Lower)` etc.) as one-tap starters, but there
is no screen to *configure* a personalised split (e.g. "I train 4 days/week,
UL A/B, set my schedule to Mon/Tue/Thu/Fri"). The user must manually pick
a template tile each session.

**Required work.**
- New screen: Routine Planner (`/routine-planner`)
- User picks split type (PPL / UL / custom) and maps days of week to sessions
- Persisted as a `plan` row with `is_active = true` (migration `20260515_plans_active.sql` already exists)
- Log tab checks active plan and auto-suggests today's session name at session start
- "Save as routine" button on Log tab (already visible) wires to this flow

---

### QT-002 · Richer exercise library — more exercises, muscle-group filters  ★★★ HIGH

**Qt behaviour.** The Qt library had a broader selection with clear muscle-group
category navigation (compound movements separated from isolation, sport-specific
exercises visible).

**Mobile status.** Library is seeded with ~160 exercises (`20260502_seed_exercise_library.sql`).
Filtering by muscle group is not exposed in the ExercisePicker UI — only
`lift / cardio / sport / mobility` category tabs exist. Compound badge shown
but not filterable.

**Required work.**
- ExercisePicker: add muscle-group filter chips (Chest, Back, Legs, Shoulders, Arms, Core)
- Server: `GET /exercises?muscle=chest` already supported via the `muscle_groups` array
  (add a `muscle` query param to `exercises.js`)
- Optionally: expand the seed with more sport and mobility exercises

---

### QT-003 · Per-exercise history and progress graph on the Log tab  ★★ MEDIUM

**Qt behaviour.** Tapping an exercise in the log showed its full history
(all logged sets, weight trend graph, PR dates).

**Mobile status.** The Graph link in the header of the Log tab routes to
`/exercise-library` (browse) rather than an exercise-specific history view.
There is no weight-over-time graph for a single exercise.

**Required work.**
- New screen: Exercise History (`/exercise-history/:exerciseId`)
- Fetches sets via `GET /sets?exerciseId=<uuid>` + cursor pagination
- Renders a line chart (recharts or Victory Native) of best set weight per session
- PR dates annotated on the chart
- Hook up the "Graph →" header button in Log tab

---

### QT-004 · Inline weight/reps editing for already-logged sets  ★★ MEDIUM

**Qt behaviour.** Tapping a logged set opened an edit form to correct the weight or reps.

**Mobile status.** Sets can only be deleted (trash icon). No edit flow exists.

**Required work.**
- Add `PATCH /sets/:id` server route (validates same fields as POST)
- Trigger update PR recompute (the `trg_exercise_prs_recompute_on_update` trigger fires automatically)
- Long-press or swipe-reveal "Edit" action on `ExerciseGroupCard` in Log tab

---

### QT-005 · Store and display weight in user's preferred unit (no kg round-trip)  ★ LOW

**Qt behaviour.** The Qt app stored weights in the user's entered unit.
There was no lbs↔kg conversion artifact.

**Mobile status.** All weights stored as `weight_raw` (kg × 8 SMALLINT). The
quarter-lb rounding in `formatWeight` (WGT-001 above) is a display band-aid;
the underlying precision loss is still there. A 45.1 lb entry round-trips to
45.0 lbs (indistinguishable from 45.0).

**Required work (long-term).**
- Add a `weight_raw_lbs` SMALLINT column (lbs × 8) OR store `unit_at_log` + `raw_value`
- Serve the original unit back to the client so no conversion happens for display
- The kg value can be derived for server-side E1RM computation

---

### QT-006 · Rest day / deload week planner  ★ LOW

**Qt behaviour.** Could mark a day as rest, deload, or active-recovery and have
that reflected in the streak logic.

**Mobile status.** REST day button exists on the Log tab (`POST /workouts/rest-day`),
but deload weeks and active-recovery designations are not exposed.

**Required work.**
- Extend `workouts.activity_type` enum (migration `20260519_workouts_activity_type.sql`
  already adds `active_recovery` and `deload`)
- Expose a session type picker on the Log tab header ("Active · Rest · Deload")

---

## Migration checklist (run in Supabase if not yet applied)

These are needed for the features above and for fixes already shipped:

```
20260510_1rm_confirmation.sql        — use_1rm_confirmation column (safe re-run script provided)
20260516_theme_preference.sql        — theme_preference column
20260518_fcm_token.sql               — fcm_token column
20260518_notification_prefs.sql      — notification pref columns
20260515_plans_active.sql            — is_active column (needed for QT-001)
20260519_workouts_activity_type.sql  — deload/active_recovery types (needed for QT-006)
```

---

## Commit reference

Commits on `main` this session:
- `e3bdfde` Fix: UUID mocks, RETURNING clause, error boundaries, unit pref error surfacing
- `26f210c` docs: add L-016 through L-020 to dev learnings
- *(pending)* Fix: search mock fallback, custom exercise entry, weight precision, Qt roadmap
