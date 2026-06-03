# TICKET-080 — Make the Focus Stepper the default logging surface (free + smart entry; retire legacy flow; preserve cardio)

**Owner:** dev-frontend
**Date opened:** 2026-06-03
**Phase:** R — Revision & Hardening
**Model lane:** Sonnet
**Founder decision (2026-06-03):** "Make it the default. Stepper becomes the primary logging surface
for everyone. Add a 'Start workout' entry → free session (mock 4) for free users, smart-suggest
(mock 5) for pro. Retire the old picker+form+flat-list flow."
**Authoritative design:** `set-logging-stepper-flow.html` §3 (3a add-as-you-go = free; 3c smart-suggest = pro).
**Depends on:** TICKET-074 (free stepper) + TICKET-075 (live DB) — DONE.
**Implemented by:** the "Stepper UI" agent (Agent 4), together with TICKET-081 + TICKET-082 Part B.

**File-ownership boundary (this agent edits ONLY):**
- `mobile/app/(tabs)/log.tsx`
- `mobile/src/components/StepperLogger.tsx`
- `mobile/src/components/ExerciseSwitcherSheet.tsx`
- (imports, read-only) `mobile/src/utils/smartSuggest.ts`, `mobile/src/api/alternatives.ts` (created by Agent 3)
**Do NOT edit:** `ExercisePicker.tsx` (TICKET-079), the tab layout / `routines.tsx` / `RoutineStrip.tsx` (TICKET-083), `smartSuggest.ts` / `alternatives.ts` internals (TICKET-082 Part A / Agent 3). You may IMPORT from them.

---

## Current state (the problem) — with evidence
The Focus Stepper exists and renders all five mock screens, but it **only opens when the user
Starts a saved routine or starter-split template**:
- `mobile/app/(tabs)/log.tsx:612-616` `handleStartStepper(session)` sets `stepperVisible=true`.
- It is called ONLY from `<RoutineStrip onStartRoutine/onStartTemplate>` (`log.tsx:1006-1012`) and from
  the `/log?routineId=` deep-link effect (`log.tsx:618-649`).
- A user with **no routine** who taps the "+" button (`log.tsx:990-1002`, `setPickerVisible(true)`)
  gets the **legacy flow**: `ExercisePicker` (`log.tsx:1304-1308`) → `SetEntryForm` modal
  (`log.tsx:1311-1322`) → flat grouped set list (`log.tsx:1222-1301`). They NEVER see the stepper.

Result: the founder's mock screens **4 (free session)** and **5 (pro smart-suggest)** — both labelled
"users that don't have their routines set" — are unreachable in the running app. This is the core
reason the stepper feels "not implemented."

Note the variant selector already exists and is correct (`log.tsx:1361-1367`):
`source==='routine' → 'routine'`; else `user.is_paid ? 'smart' : 'free'`. The gap is purely that
**no code path starts a non-routine stepper session.**

## Required behaviour

### 1. Add a "Start workout" (free session) entry that opens the stepper
On the **Log tab**, when **no stepper session is active**, show a prominent primary CTA
**"Start workout"** (full-width, `theme.colors.accentDefault` background, label
`theme.components.buttonPrimaryText`). Tapping it:
1. Opens `ExercisePicker` to choose the **first** exercise (reuse the existing picker; do not rebuild it).
2. On select, build a non-routine `RoutineSession`:
   ```ts
   {
     source: 'template',          // any non-'routine' value selects the free/smart variant; use a
                                   // dedicated marker instead — see "Session source" below.
     name: 'Free session',
     exercises: [{ exerciseId: picked.id, name: picked.name, loggedSetCount: 0, done: false }],
     currentIndex: 0,
   }
   ```
   **Session source:** do NOT mislabel a free session as `'template'`. Extend the `RoutineSession.source`
   union in `RoutineStrip.tsx`'s exported type to include `'free'` **(this type lives in RoutineStrip.tsx,
   which is TICKET-083's file — coordinate: add `'free'` to the `source` union ONLY, as an additive,
   non-breaking change, and tell the orchestrator you touched that one line so it can be merged).**
   Then the variant selector becomes: `source==='routine' → 'routine'`; `source==='free' && user.is_paid
   → 'smart'`; `source==='free' → 'free'`. (Templates keep their existing behaviour.)
   > Orchestrator note: to keep files fully disjoint, the `'free'` union member will instead be added by
   > Agent 3 as part of the shared type. Agent 4: assume `source: 'routine' | 'template' | 'free'` exists
   > and import it; do not edit RoutineStrip.tsx.
3. Opens the stepper (`stepperVisible=true`) in `'free'` (or `'smart'` if `user.is_paid`) variant on
   that first exercise.
4. "＋ Add next exercise" (already wired: `log.tsx:1371-1374` `onAddNextExercise`) reopens the picker
   to append the next exercise and advance — keep this behaviour.

Place "Start workout" so it is the obvious primary action of the Log tab's resting state (see §3).

### 2. The stepper MUST support cardio (do not lose functionality on retirement)
**This is the highest-risk requirement.** The legacy `SetEntryForm` logs **both** lift and cardio:
- Lift: Weight (unit-aware) + Reps + optional RIR.
- **Cardio: Duration (mm:ss) + optional Distance (km/mi by unit pref).** (`SetEntryForm.tsx:318-388`.)

`StepperLogger` today renders **lift-only** inputs (`StepperLogger.tsx:416-458`) and
`handleStepperLogSet` (`log.tsx:651-694`) hard-codes `kind: 'lift'`. If you retire `SetEntryForm`
without adding cardio to the stepper, **cardio logging breaks entirely.**

Required:
- In `StepperLogger`, when the current exercise's `category === 'cardio'`, render **DURATION (mm : ss)**
  (two number fields) and **DISTANCE (optional)** instead of WEIGHT/REPS. Mirror the labels, parsing,
  and unit handling from `SetEntryForm.tsx` exactly: `parseDurationSec(mm, ss)`,
  `distanceToMetres(display, unitPref)`, `paceFromDurationAndDistance(...)`, and the `distanceLabel`
  ('miles' if `unitPref==='lbs'` else 'km'). Reuse these helpers (extract to a shared util if cleaner,
  but do not change their math).
- `StepperLogger` must pass enough context up (or accept a `category`/`isCardio` prop and an
  `onLogCardioSet`) so the parent builds the correct payload. The current exercise's category needs to
  reach the stepper — `RoutineSessionExercise` does not currently carry `category`. Add an optional
  `category?: 'lift' | 'cardio' | 'sport' | 'mobility'` to `RoutineSessionExercise` (additive) and
  populate it when building sessions (from the picked `Exercise.category`). Default to `'lift'` when unknown.
- Extend `handleStepperLogSet` (or add a sibling) in `log.tsx` to build the **cardio** payload exactly
  per `mobile/src/types/api.ts:143-151`:
  ```ts
  { kind: 'cardio', workoutId, exerciseId, setIndex, durationSec, distanceM?, avgPaceSecPerKm? }
  ```
  Keep the existing lift payload path (`log.tsx:673-686`) unchanged for lift exercises.
- The set-chip summary for cardio should read e.g. "Set 1 · 22:30 · 5.0 km" (mirror SetEntryForm's
  display semantics), not "Set 1 · undefined×undefined".

### 3. Retire the legacy primary logging UI on the Log tab
Per the founder decision, the old "+ → ExercisePicker → SetEntryForm → flat grouped set-list" is no
longer the primary logging path. In `log.tsx`:
- **Remove the standalone "+" → `SetEntryForm` logging path** as the primary action. The stepper is now
  the sole set-entry UI. (Keep the `SetEntryForm.tsx` FILE on disk — deleting files is out of scope and
  risky on this repo — but stop rendering it / routing to it from the Log tab.)
- **Resting state of the Log tab (no active session)** should be a *launcher*, not the flat list:
  1. Primary CTA **"Start workout"** (§1).
  2. The existing `RoutineStrip` ("MY ROUTINES" / "STARTER SPLITS") so a saved routine can be started
     (unchanged; it already calls `handleStartStepper`). Also keep a clear link to the new Routines tab
     (TICKET-083) — a simple "Manage routines →" is fine; do not duplicate the tab's contents.
  3. A compact "N set(s) logged today" line + the existing Rest-day link (`log.tsx:1113-1150`) +
     the `SyncStatusIndicator`.
  4. If a workout already has sets today, show a secondary **"Resume / review today →"** affordance that
     re-opens the stepper on the in-progress session (or, if none is active, routes to
     `/(tabs)/index` RECENT ACTIVITY which already drills into `workout-day`).
- **Remove the always-visible flat grouped set-list** (`log.tsx:1222-1301`, the `groups.map(...)`
  block, the dashed "Add Exercise"/"Browse Library"/"Finish workout" cluster) from the resting Log tab.
  The per-day set review already lives in `workout-day.tsx` (reached from Home → RECENT ACTIVITY). Do not
  re-implement day review here.
  > Opus review point: the exact composition of the resting Log tab is a UX shift the founder asked for
  > ("retire the flat-list flow"). Implement the launcher above as the default; flag it for Opus to confirm
  > against founder intent. Do NOT silently keep the flat list.

### 4. Preserve everything that already works
- **Routine deep-link**: KEEP `log.tsx:618-649` (the `/(tabs)/log?routineId=...` handler) working
  exactly — TICKET-083's Routines tab "Start" depends on this contract. Do not change the param name.
- **Finish workout**: keep `handleFinishWorkout` (`log.tsx:843-861`) reachable from inside the stepper
  (the stepper's last-exercise "Finish workout" already calls `onFinish`).
- **Off-routine placement prompt** (mock 1c) and **switcher sheet** (mock 1b) keep working.
- **Persistence**: all set writes continue through `usePowerSyncLog().logSet(...)` with the canonical
  camelCase payloads. Do NOT introduce any other write path (TICKET-074 lesson).
- **Paywall**: free users stay on `'free'`; pro on `'smart'`. Don't show pro-only affordances to free
  users (TICKET-082 handles the gating detail).

## Explicit DO-NOT
- Do not delete `SetEntryForm.tsx` or `ExercisePicker.tsx` (reused / out of scope).
- Do not change the PowerSync write contract or the server.
- Do not edit files outside the ownership boundary above.
- Do not drop cardio logging (see §2 — this is a release blocker if missed).

## Acceptance criteria
1. A **free** user with **no routine** can tap **"Start workout"** on the Log tab, pick an exercise, and
   log sets in the **stepper** (`'free'` variant, mock 3a) — including "＋ Add next exercise".
2. A **pro** user, same path, gets the `'smart'` variant (mock 3c "JUST LOGGED" interstitial).
3. **Cardio** exercises log correctly through the stepper (duration mm:ss + optional distance), persisting
   a `kind:'cardio'` set; the set chip shows duration (+ distance). Verified by logging a Running set and
   seeing it in `workout-day`.
4. Starting a **saved routine** (RoutineStrip "Start" AND the Routines-tab deep-link) still opens the
   `'routine'` stepper unchanged.
5. The Log tab's resting state is the launcher described in §3 — the legacy flat-list + standalone
   SetEntryForm path is no longer the primary logging UI.
6. "Finish workout" works from the stepper; today's sets persist and appear in Home → RECENT ACTIVITY.
7. `peak-fettle-verify` parse-sweep clean; no TypeScript errors introduced.

## Test plan
1. Free user, no routines → Start workout → Bench Press → log 2 lift sets → "+ Add next exercise" →
   Lat Pulldown → log → Finish → confirm 2 exercises / 3 sets in workout-day.
2. Toggle a cardio exercise (Running) in the stepper → duration 22:30, distance 5.0 → log → confirm
   cardio set persists and renders.
3. Pro user, no routines → Start workout → after first set, "Done — see what's next →" shows the
   suggestion interstitial (TICKET-082).
4. Start "Push A" routine from RoutineStrip and from the Routines tab → both open the routine stepper.

## Definition of done
- Parse-sweep clean; **do not commit** — the orchestrator commits after the Opus design-spec review.
