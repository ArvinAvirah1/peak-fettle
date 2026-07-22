# Supersets & Dropsets — Design Spec (2026-07-03)

Grounded in a full evidence-mapped read of the routine tracking flow (routine
model → editor → session builder → stepper → set rows → rest timer → history/
PR/e1RM → engine-v2 adoption). File:line citations below refer to that audit.

## 0. What the flow read established (constraints any design must respect)

1. **Three silent-drop choke points.** New per-exercise fields vanish unless ALL
   are updated in lockstep: local `parseExercises` allowlist
   (`src/data/routines.ts:49`), server Zod `ExerciseEntrySchema` (strip mode,
   `server/routes/routines.js:22`), and the engine-adoption mapper
   `mapWeekToRoutines` (`src/planGen/planAdoption.ts:59`).
2. **The session model is flat.** `RoutineSession.exercises[]` + one scalar
   `currentIndex`; all sequencing logic (`loggerLogic.ts`: nextPendingExerciseIndex,
   isPlannedComplete, postFinalSetState) reasons per-exercise on a flat list.
3. **`sets` rows are the atom.** Every consumer (volume, PR buckets by
   `exercise_id:reps`, e1RM Epley per row, day grouping by `exercise_id`,
   widget weekly volume) assumes one physical set = one row. Designs that pack
   multiple physical efforts into one row break everything downstream.
4. **`metrics_json` is the tier-symmetric extension point.** On-device for both
   tiers, best-effort, no server column (cardio metrics already live there).
   Currently wired only into the cardio path, not lifts.
5. **Rest is global.** One `restEndAt` scalar fires unconditionally after every
   logged set (`WorkoutLoggerHost.tsx:829`), plus StepperLogger's separate
   visual `restLeft` ring. Supersets need interior-transition suppression in
   BOTH places.
6. **Dropsets pollute PRs if unmarked.** `computePRIds` buckets by
   `exercise_id:reps` with no top-set/fatigue-set distinction (duplicated in
   `widgetBridge.countPRsThisWeek`); the PR toast + server personal-best use
   per-row Epley. Drop rows must carry a flag these can exclude.

## 1. Definitions

- **Superset**: 2 exercises performed back-to-back with no rest between them,
  rest after each *round* (A1→A2 → rest → A1→A2 → …). Generalizes to giant
  sets/circuits (3+). Round count = max target_sets of the members.
- **Dropset**: after the last rep of a set, weight is immediately reduced and
  the set continues; possibly several drops. One *chain* = top set + N drops,
  no rest inside the chain.

## 2. OPTIONS — how it could look in the app

### Option A — Prescribed supersets ("linked exercises" in the routine)
*The full feature. Supersets are part of the routine definition and the engine
can prescribe them.*

- **Editor UX** (`RoutineEditorSheet`): a link toggle between ADJACENT rows.
  Linked exercises render as one bracketed card ("Superset A": bench + row),
  move/reorder/delete as a unit (fixes the fragile neighbor-swap reordering),
  and share a rounds count (one target_sets input for the group).
- **Data**: `RoutineExercise.superset_group?: string` ('A','B',…; adjacent
  members share a letter). Update all three choke points; server Zod gains the
  optional field (additive, old clients unaffected — server strips nothing it
  now knows).
- **Logger UX**: the stepper shows "SUPERSET — bench press + barbell row",
  round pill ("Round 2 of 4"), and auto-advances A1→A2 with NO rest; the rest
  timer fires only after the round's last member. Log-set button reads
  "Log set · Bench (A1)". Jump-ahead/switcher treats the group as one entry.
- **Sequencing**: session model gains `groupId` per exercise; loggerLogic gets
  group-aware helpers (roundOf, nextInGroup, groupComplete) while keeping the
  flat array (groups are contiguous runs — no structural rewrite).
- **Set rows**: unchanged columns; each row gets
  `metrics_json.superset = { group:'A', round:n }` so history can bracket the
  pair. (Lift path gains the setSetMetrics call the cardio path already has.)
- **History**: workout-day brackets grouped exercises visually.
- **Engine**: `PlanSlotV2.superset_group?: string` — the engine can pair
  antagonists/accessories when session_minutes is tight (classic time-saver);
  `mapWeekToRoutines` carries it into the adopted routine.
- **Effort**: the big one — editor + 3 choke points + sequencing + stepper UI +
  rest suppression + history display + engine.

### Option B — On-the-fly supersets (session-only pairing, zero schema change)
*"Superset this with…" during a workout. Nothing persisted in the routine.*

- **Logger UX**: on the current exercise's action bar, "Superset with…" opens a
  sheet (same pattern as QuickSwapSheet) listing the session's other pending
  exercises + the exercise library. Picking one pairs them FOR THIS SESSION:
  the stepper alternates between the two after each set and suppresses interior
  rest, exactly as in Option A.
- **Data**: none in routines; pairing lives in `routineSession` state +
  `metrics_json.superset` on the logged rows for history display.
- **Pros**: fastest to ship; exercises the same logging/rest/sequencing
  mechanics Option A needs; works for template/free sessions too.
- **Cons**: pairs don't persist across sessions; plans/routines can't
  prescribe; the editor never shows supersets.

### Option C — Staged hybrid (RECOMMENDED)
*Ship B's mechanics first, then layer A's persistence on top — the stepper/
rest/sequencing/history work is IDENTICAL and gets built once.*

- Stage S1: group-aware sequencing + rest suppression + metrics_json tagging +
  the "Superset with…" session pairing sheet (Option B UX).
- Stage S2: `superset_group` in RoutineExercise + editor linking + the three
  choke points; startRoutine seeds the session pairing from the routine.
- Stage S3: engine prescription (`PlanSlotV2.superset_group`) + adoption
  mapping; the survey's session_minutes pressure drives pairing.
- Each stage is independently shippable and none breaks prior behavior
  (`superset_group` absent ⇒ exactly today's flow).

### Dropsets — Option D1 (row-per-drop, RECOMMENDED) vs D2 (segments-in-one-row)

- **D1 — each drop is its own `sets` row.**
  - **Logger UX**: after logging a set, alongside the rest ring a "+ Drop set"
    button appears (rest suppressed while chaining). It pre-fills the weight
    input at −20% (configurable step) and focuses reps. Each drop logs a normal
    row with `metrics_json.drop = { chainId, index }` (top set: index 0 —
    tagged only when a chain actually starts).
  - Volume/history work unchanged (row = physical set holds). Chips render the
    chain as "80×8 ↘ 60×6 ↘ 40×5".
  - **PR guard**: `computePRIds`, `countPRsThisWeek`, and the PR toast skip
    rows with `drop.index > 0` (drops are fatigue sets, not top sets). Server
    personal-best untouched for now (metrics_json is device-only, matching the
    cardio precedent); acceptable because PR surfaces in-app are local.
  - **Prescription (later)**: `RoutineExercise.set_style?: 'straight'|'dropset'`
    + `drops?: number`, `drop_pct?: number`; editor exposes it per exercise;
    engine may prescribe on isolation accessories for metabolite work.
- **D2 — one row with `drops:[{weight,reps}…]` inside metrics_json.** Rejected:
  breaks the row-is-a-set invariant every consumer relies on (volume, PR
  buckets, chips, edit/delete flows all need special-casing).

## 3. Cross-cutting decisions (apply to whichever option is chosen)

- **Rest suppression**: one new host-level predicate — "does another member of
  the current group/chain still have work this round?" — gates BOTH
  `setRestEndAt(...)`/`restTimer.start()` and StepperLogger's `setRestLeft`.
- **set_index semantics unchanged** (per-exercise ordinal from stepperSets) —
  interleaving doesn't disturb it because the map is keyed by exerciseId.
- **Edit/delete**: chips stay position-based; a drop row edits/deletes like any
  row (chain metadata is display-only). Deleting a chain's top set leaves the
  drops — acceptable; chain re-renders as shorter.
- **Quick-swap**: swapping a group member keeps the group (swap replaces the
  exerciseId inside the pairing).
- **Mini-bar/progress**: counts exercises as today; a group shows as its
  members (no change needed).
- **Back-compat**: absent fields ⇒ identical behavior everywhere; local
  `parseExercises` should move from allowlist to allowlist+known-new-fields (it
  must NOT passthrough blindly — the DATA-01 injection guard on import relies
  on allowlisting).
- **Server sets column**: deliberately NOT added now. Grouping metadata rides
  `metrics_json` (device-only, both tiers) exactly like cardio metrics; a
  server `sets.metrics_json` column is a separate, additive follow-up if Pro
  cross-device history display of groupings becomes a requirement.

## 4. Recommended build order

1. **S1 (session mechanics + on-the-fly supersets + dropset chains)** — logger
   only; no schema/server changes; immediately usable on free and Pro.
2. **S2 (routine persistence + editor linking)** — the three choke points +
   RoutineEditorSheet; prescribed supersets start flowing.
3. **S3 (engine prescription + adoption)** — pairing under time pressure,
   dropset prescription on accessories.
4. PR-guard + history bracketing land inside S1 (they depend only on
   metrics_json tags).

Verification per stage: the standard gate (babel sweep, all node test suites,
tsc delta 0) + new pure-logic tests for group sequencing (round derivation,
interior-rest predicate, group-aware next-pending) and the PR-guard exclusion.
