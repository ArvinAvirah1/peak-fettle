# TICKET-086 — Lift progress: data layer + chart component

**Owner:** dev-frontend · **Date:** 2026-06-03 · **Phase:** R · **Model:** Sonnet
**Founder decision (2026-06-03):** users can graph any lift's progress over time to spot plateaus.
Metrics: **all four** (e1RM, top-set weight, volume/session, best-reps-at-weight) with a toggle.
Context: the Qt/QML prototype had charts; never ported to RN. No charting lib is installed yet.
**Implemented by:** Agent 2 (data + chart only; the screens/entry points are TICKET-087/Agent 3).

**File-ownership boundary — Agent 2 creates/edits ONLY:**
- NEW `mobile/src/api/progress.ts`
- NEW `mobile/src/components/LiftProgressChart.tsx`
**Do NOT touch** anything else (no package.json — Agent 3 adds the dep; no screens; no server).

---

## Data source (verified — reuse, don't invent)
`GET /sets?exercise_id=<id>&limit=100` → `{ sets: SetRecord[] }`. Each set has `id, workout_id,
exercise_id, kind ('lift'|'cardio'), weight_kg, reps, created_at`. This is exactly what
`exercise-library.tsx` already fetches (`apiClient.get('/sets', { params: { exercise_id, limit } })`).
Use `apiClient` from `mobile/src/api/client` (same pattern as `mobile/src/api/sets.ts`).

## A. `src/api/progress.ts`
Export:
```ts
export interface ProgressPoint {
  date: string;        // YYYY-MM-DD of the session (from the session's earliest set.created_at)
  e1rm: number;        // best Epley e1RM in the session = max(weight_kg*(1+reps/30)) over lift sets
  topWeight: number;   // heaviest weight_kg in the session
  volume: number;      // sum(weight_kg*reps) over the session's sets for this exercise
  bestReps: number;    // max reps in any set this session
}
export interface ProgressSeries { exerciseId: string; points: ProgressPoint[]; } // points sorted oldest→newest
export async function getExerciseProgress(exerciseId: string): Promise<ProgressSeries>;
```
- Fetch the sets, keep only `kind === 'lift'` (cardio has no weight×reps), group by `workout_id`,
  compute the four metrics per session, derive `date` from the earliest `created_at` in that session,
  sort points oldest→newest. Round sensibly (e1rm/topWeight to 1 dp, volume to integer).
- On error: return `{ exerciseId, points: [] }` (no throw, no mock) so the chart shows an empty state.
- Do NOT depend on unit preference here — return kg; the chart/caller formats units.

## B. `src/components/LiftProgressChart.tsx`  (SELF-CONTAINED — fetches its own data)
Default export `LiftProgressChart`. Props:
```ts
interface LiftProgressChartProps {
  exerciseId: string;
  exerciseName: string;
  unitPref?: 'kg' | 'lbs';      // for axis/label formatting; default 'kg'
  initialMetric?: 'e1rm' | 'topWeight' | 'volume' | 'bestReps';  // default 'e1rm'
}
```
- On mount (and when `exerciseId` changes), call `getExerciseProgress(exerciseId)`; manage
  loading / empty / error / loaded internally.
- Render a **line chart** of the selected metric over time using **`react-native-svg`**
  (`Svg`, `Polyline`/`Path`, `Line`, `Circle`, `Text`/`SvgText`). A line (not bars) — plateaus read
  better as a flat line. Include: the series line, point dots, min/max y labels, first/last x date
  labels, and a subtle baseline grid. Responsive width (measure container via `onLayout`).
- A **metric toggle** (segmented row of 4 chips: e1RM · Top set · Volume · Reps) that switches the
  plotted metric. Label e1RM/top-set in the user's unit (use `formatWeight` from
  `mobile/src/constants/units`); volume in kg/lbs; reps as a count.
- States: loading (spinner), empty ("No history yet — log this lift to see your progress"),
  single-point (render the dot + value, no line), normal.
- Styling: use the app theme via `useTheme()` (colors) + `fontSize`/`spacing`/`radius` from the
  top level of `useTheme()` (NOT `theme.spacing` — see TICKET-078). Accent color for the line.
- Self-contained means TICKET-087 can mount it with just `exerciseId`+`exerciseName`.

### FROZEN CONTRACT (Agent 3 codes against exactly this)
`<LiftProgressChart exerciseId={string} exerciseName={string} unitPref? initialMetric? />` — a
self-contained component that fetches + renders + toggles metrics. No other props needed.
`getExerciseProgress(exerciseId) => Promise<ProgressSeries>` as above.

> `react-native-svg` is NOT yet installed. Write the import (`import Svg, { Polyline, Line, Circle,
> Text as SvgText } from 'react-native-svg'`); Agent 3 adds the dep to package.json and the
> orchestrator runs `npx expo install react-native-svg`. Your per-file @babel parse will still pass
> (parse doesn't resolve imports).

## DO-NOT
- No mock/stub data (TICKET-067). No new server endpoint (reuse `/sets?exercise_id=`).
- Don't edit package.json or any screen. Don't run git/npm/expo. Parse-check both files. Do NOT commit.

## Acceptance criteria
1. `getExerciseProgress` returns chronological per-session points with all four metrics, empty on error.
2. `LiftProgressChart` renders a labelled line chart for any exerciseId, with a working 4-metric toggle,
   and clean loading/empty/single-point states.
3. Uses theme tokens correctly (no `theme.spacing` bug). Parse-clean. Do not commit.
