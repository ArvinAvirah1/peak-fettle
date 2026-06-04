# TICKET-084 — Home is the logging hub; remove the Log FAB tab

**Owner:** dev-frontend  · **Date:** 2026-06-03 · **Phase:** R · **Model:** Sonnet
**Founder decision (2026-06-03):** "Home-hosted (full)" — get rid of the Log lightning-bolt FAB
tab; logging lives on/launches from the Home page. Plus: quick-start routines back on the logging
surface; a "re-open the stepper" prompt for forgotten sets; cardio must be glitch-free standalone.
**Implemented by:** Agent 1 (also does TICKET-085, same files).

**File-ownership boundary — Agent 1 edits ONLY:**
- `mobile/app/(tabs)/index.tsx` (Home — becomes the logging hub)
- `mobile/app/(tabs)/log.tsx` (relocate its logic out; then redirect/retire — see §1)
- `mobile/app/(tabs)/_layout.tsx` (remove the `log` tab)
- `mobile/src/components/StepperLogger.tsx`
- `mobile/src/components/ExerciseSwitcherSheet.tsx`
- `mobile/src/components/RoutineStrip.tsx`
- `mobile/app/(tabs)/routines.tsx` (only the "Start" deep-link target — see §2)
- `mobile/app/(tabs)/plans.tsx` (only the `/(tabs)/log` nav repoint — see §2)
- NEW `mobile/src/components/WorkoutLoggerHost.tsx` (recommended extraction — see §1)
**Do NOT touch:** `exercise-library.tsx`, `workout-day.tsx`, `profile.tsx`, `app/_layout.tsx`,
`package.json`, anything under the graph tickets (086/087). `exercise-library.tsx`'s `/(tabs)/log`
repoint is handled by Agent 3 against the frozen contract in §3 — do not edit that file.

---

## Current state
The ENTIRE workout-logging state machine lives in `mobile/app/(tabs)/log.tsx` (~1100-line component):
`routineSession`, `stepperVisible`, `stepperSets`, all the `handleStepper*`, the `<StepperLogger>`
full-screen `Modal`, `<ExercisePicker>`, the alternatives sheet, `PaywallUpgradeModal`, the
`/(tabs)/log?routineId=` deep-link effect, the launcher resting state, etc. The Log tab is the
center raised FAB in `(tabs)/_layout.tsx:144-169`.

## Required behaviour

### 1. Relocate the logger so it launches from Home; remove the Log tab
- **Recommended structure (lowest risk):** extract the logging state machine + all overlays
  (StepperLogger Modal, ExercisePicker, alternatives sheet, PaywallUpgradeModal, every `handle*`
  and piece of state) out of `log.tsx` into a new self-contained **`WorkoutLoggerHost.tsx`**. It
  renders nothing visible until opened (its surfaces are Modals/overlays). It exposes opening via
  **route params on the Home route** (see §3) — i.e., `index.tsx` reads the params and tells the
  host what to open. Keep all persistence via `usePowerSyncLog().logSet(...)` exactly as today.
- **`index.tsx` (Home)** renders `<WorkoutLoggerHost/>` (as an always-mounted overlay host) plus:
  - a prominent **"Start workout"** primary CTA (accent bg), and
  - the **quick-start routines** strip (see §4).
- **Remove the `log` Tabs.Screen** from `(tabs)/_layout.tsx` (and its raised-FAB `tabBarButton`
  block). New tab order: `index, routines, rankings, plans, profile` (5 tabs, no FAB). The shared
  `screenOptions` (glossary header button, tints) stay.
- **`(tabs)/log.tsx`**: after moving its logic out, replace its body with
  `export default function LogRedirect(){ return <Redirect href="/(tabs)" />; }` so any lingering
  `/(tabs)/log` navigation lands on Home (do NOT leave a duplicate logging implementation; do NOT
  delete the file — redirect it).

### 2. Repoint navigations away from the Log tab
- `(tabs)/routines.tsx` "Start" currently pushes `/(tabs)/log?routineId=...`. Change it to push the
  **Home route with the routine param**: `/(tabs)?routineId=<id>&routineName=<name>` (§3).
- `(tabs)/plans.tsx` — repoint its `router.push('/(tabs)/log')` ("Start Workout") to
  `/(tabs)?startWorkout=1` (§3).
- `index.tsx`'s own internal `router.push('/(tabs)/log')` (TodayCard etc.) → trigger the local
  Start-workout flow instead (no navigation needed; you own this file).
- (exercise-library.tsx's `/(tabs)/log` repoint is Agent 3's, per §3 — don't touch it.)

### 3. FROZEN CONTRACT — Home-route logging params (Agent 3 + routines/plans navigate to these; Agent 1 implements them in index.tsx/WorkoutLoggerHost)
Home (`/(tabs)`, i.e. `index.tsx`) reads `useLocalSearchParams()` and opens the logger accordingly,
then clears the param (so re-focusing the tab doesn't reopen it):
- `?startWorkout=1` → open the free-session exercise picker → on select, open the stepper in `'free'`
  (or `'smart'` if `user.is_paid`).
- `?routineId=<id>&routineName=<name>` → fetch the routine, build the routine session, open the
  routine stepper (same logic as the old `log.tsx:618-649` deep-link — move it here verbatim).
- `?logExercise=<id>&logExerciseName=<name>` → open a free session seeded with that one exercise and
  go straight into the stepper on it (used by exercise-library "Log This Exercise").

### 4. Quick-start routines back on the logging surface (founder confirmed)
Render `<RoutineStrip onStartRoutine onStartTemplate>` on Home (it already calls back with a
`RoutineSession`; wire those callbacks into the host to open the routine/template stepper). Keep its
"Manage →" link to `/routines`. This restores the quick "start a saved routine" affordance the old
Log tab had.

### 5. Re-open-the-stepper prompt for forgotten sets (founder request)
Add a **"Forgot to log something?"** affordance on the Home logging surface (shown when the user has
logged ≥1 set today). Tapping it opens a small prompt with two choices:
- **"I forgot something"** → re-open the stepper on **today's session**, letting the user pick which
  exercise to add a set to (resume the in-progress session; if none is in memory, rebuild it from
  today's logged sets so they can add to any exercise).
- **"See all my lifts"** → show **today's logged sets** (the session review — a simple list of
  today's exercises + sets). (Confirmed scope: "all my lifts" = today's session, NOT all-time history.)

### 6. Cardio must be glitch-free (standalone)
Cardio is logged in the stepper as its own exercise (free session), never required inside a routine.
Verify the stepper's cardio path (duration mm:ss + optional distance → `kind:'cardio'` payload, from
TICKET-080) works cleanly when started via "Start workout" → a cardio exercise. No need to thread
`category` into routine/template exercises (cardio is done before/after, not in-between).

## Preserve
- All set writes through `usePowerSyncLog().logSet(...)` (no new write path).
- "Finish workout", the off-routine placement prompt, the switcher sheet, the smart-suggest
  interstitial, the "Choose alternative" pro action + paywall — all keep working, now hosted on Home.
- The routine stepper for saved routines (via the `routineId` param).

## DO-NOT
- Do not leave two logging implementations (relocate, then redirect `log.tsx`).
- Do not edit `exercise-library.tsx`/`workout-day.tsx`/`profile.tsx`/`app/_layout.tsx`/`package.json`.
- Do not change the persistence contract or the server.
- Do not run git/npm/expo/builds. Parse-check your files with @babel/parser. Do NOT commit.

## Acceptance criteria
1. No Log tab/FAB; bottom bar = Home, Routines, Rankings, Plans, Profile.
2. Home "Start workout" → pick exercise → stepper (free/smart), incl. cardio; sets persist.
3. Routines tab "Start" and plans "Start Workout" both land on Home and open the right stepper.
4. Quick-start routine strip present on Home and starts a routine session.
5. "Forgot something?" prompt offers reopen-stepper vs see-today's-lifts and both work.
6. `peak-fettle-verify` parse-sweep clean; no new tsc errors. Do not commit.
