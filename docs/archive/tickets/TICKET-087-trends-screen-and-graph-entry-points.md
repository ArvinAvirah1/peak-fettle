# TICKET-087 — Trends hub screen + tap-any-lift graph entry points

**Owner:** dev-frontend · **Date:** 2026-06-03 · **Phase:** R · **Model:** Sonnet
**Founder decision (2026-06-03):** access a lift's progress graph **both** ways — tappable from
where lifts appear AND a dedicated Trends hub.
**Implemented by:** Agent 3. Consumes the frozen `LiftProgressChart` from TICKET-086 (Agent 2).

**File-ownership boundary — Agent 3 creates/edits ONLY:**
- NEW `mobile/app/trends.tsx`
- `mobile/app/_layout.tsx` (register the `trends` route in the root Stack)
- `mobile/app/exercise-library.tsx` (tap an exercise → its graph + repoint its `/(tabs)/log`)
- `mobile/app/workout-day.tsx` (tap a logged exercise → its graph)
- `mobile/app/(tabs)/profile.tsx` (add a "Progress / Trends" entry that opens `/trends`)
- `mobile/package.json` (add `react-native-svg`)
**Do NOT touch:** `index.tsx`, `(tabs)/log.tsx`, `(tabs)/_layout.tsx`, `StepperLogger.tsx`,
`RoutineStrip.tsx`, `(tabs)/routines.tsx`, `src/api/progress.ts`, `src/components/LiftProgressChart.tsx`
(Agents 1 & 2 own those — import/read-only).

---

## Frozen contract you build against (from TICKET-086 / Agent 2)
`import LiftProgressChart from '../src/components/LiftProgressChart'` — a self-contained component:
`<LiftProgressChart exerciseId={string} exerciseName={string} unitPref={'kg'|'lbs'} />`. It fetches
its own data and has its own metric toggle. You just mount it with an exercise id + name.

## A. Dedicated Trends hub — `app/trends.tsx`
A pushed screen (not a tab) listing the user's exercises; tapping one shows its `LiftProgressChart`.
- Header "Trends" + back button (use `ScreenLayout`/theme like other pushed screens, e.g.
  `workout-history.tsx`). Register in `app/_layout.tsx` as `<Stack.Screen name="trends" .../>` (mirror
  the existing `workout-history`/`workout-day` registrations).
- Exercise list: derive the user's logged exercises (those they've actually trained). Reuse an existing
  source — e.g. `GET /sets` history or `getExercises()` filtered to ones with history; simplest is to
  read recent workout history (`useWorkoutHistory()`), collect distinct `{exercise_id, name}` from lift
  sets, and list them. Tapping a row opens the chart (inline expand, or a detail view within the
  screen) via `<LiftProgressChart exerciseId exerciseName unitPref={user.unit_pref}/>`.
- Empty state when the user has no logged lifts yet.

## B. Tap-any-lift entry points
- **`exercise-library.tsx`**: the detail sheet already shows a per-exercise volume bar chart + "Log
  This Exercise". Add a **"View progress" / "Trends"** action in that sheet that mounts
  `<LiftProgressChart exerciseId={exercise.id} exerciseName={exercise.name} unitPref=.../>` (replace or
  augment the existing hand-rolled bar chart with the richer component — your call; the new component
  is strictly better). **Also** repoint this file's "Log This Exercise" navigation from
  `/(tabs)/log` to the Home logging contract (TICKET-084 §3): `router.push('/(tabs)?logExercise=' +
  exercise.id + '&logExerciseName=' + encodeURIComponent(exercise.name))`.
- **`workout-day.tsx`**: each exercise group header (a logged lift) becomes tappable → opens that
  lift's graph (navigate to `/trends?exerciseId=<id>&exerciseName=<name>` — have `trends.tsx` read
  those params and open that exercise directly; OR present `LiftProgressChart` in a modal here). Keep
  the existing set rows intact.
- **`profile.tsx`**: add a row/button "Progress & Trends" → `router.push('/trends')`.

## C. Dependency
Add `react-native-svg` to `mobile/package.json` dependencies (the orchestrator runs
`npx expo install react-native-svg` to pin the SDK-54-compatible version + install). Do NOT run npm
yourself.

## DO-NOT
- Don't edit Agent 1's or Agent 2's files (listed above). Don't run git/npm/expo/builds.
- No mock data. Parse-check every file you touch with @babel/parser. Do NOT commit.

## Acceptance criteria
1. A "Trends" screen is reachable (from Profile) and lists the user's lifts; tapping one shows its
   multi-metric progress chart.
2. Tapping a lift in `exercise-library` and in `workout-day` opens that lift's progress chart.
3. `exercise-library` "Log This Exercise" navigates to Home's `?logExercise=` flow (not the dead Log tab).
4. `react-native-svg` is in package.json. `trends` is registered in the root Stack.
5. Parse-clean; no new tsc errors after the dep installs. Do not commit.
