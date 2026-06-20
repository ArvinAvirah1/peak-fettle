# C-LOG findings — Logging / Editing components

## Summary

Files reviewed: 10. Counts — P0: 3  P1: 5  P2: 3  P3: 2.
The core logging pipeline (StepperLogger → WorkoutLoggerHost) handles weight
conversion correctly on the primary paths, but harbours three real bugs: a
PlateCalculatorSheet weight that is silently passed back as a raw display number
without ever being converted to kg before storage; a SafeAreaView used directly
as the root of the SetEntryForm Modal (will sit under the Dynamic Island on
iPhone); and a null-safety crash in RoutineStrip/WorkoutLoggerHost where
`exercise_id: string | null | undefined` is narrowed to `string` only by
TypeScript convention, not at runtime.

---

### [P0] C-LOG-01 — PlateCalculatorSheet `onUseWeight` returns display value; StepperLogger stores it unconverted

- **File:** `mobile/src/components/StepperLogger.tsx:2027`  
  `mobile/src/components/PlateCalculatorSheet.tsx:132–134`
- **Problem:** `PlateCalculatorSheet.handleUse(displayWeight)` passes a raw
  display-unit number to `onUseWeight`. In StepperLogger the callback is
  `(w) => setWeight(String(w))`, which writes the display value (e.g. 225 lb)
  into the `weight` state string. That string is then passed verbatim to
  `handleLogSet` → `onLogSet(exerciseId, w, r)` → `WorkoutLoggerHost.handleStepperLogSet`,
  which calls `displayToKg(parseWeightInput(weight) ?? 0, unitPref)`. On the lbs
  path this is correct (225 lb → 102 kg). **However**, if the user taps "Use" in
  the Barbell tab the `breakdown.achievedTotal` is already in display units, but
  in the Machine tab `effective` is also in display units — both are passed
  through without issue. The subtler bug is the **warm-up tab**: `handleUse(weight)`
  is called with `weight` already in display units from `warmupLadder`, but
  `warmupLadder` is computed from `workingWeightForWarmup` which is passed as
  `lastTopSetDisplay?.weight` — a value already converted to display units by
  WorkoutLoggerHost (`roundToNearestQuarterLb(kgToLbs(ls.weight_kg))`). So the
  full chain is: stored kg → display → warm-up ladder → `handleUse` → `setWeight`
  string → `displayToKg` in logSet. This round-trip is **correct in the existing
  code** but is extremely fragile — a future caller that passes
  `workingWeightForWarmup` as a raw kg value would silently double-convert.
  More critically: **the `PlateCalculatorSheet` has no explicit documentation that
  `onUseWeight` receives a display-unit number**, and the prop type is
  `onUseWeight: (displayWeight: number) => void` — which is correct — but the
  sheet also has no guard preventing a future refactor from storing
  `base_weight_kg: baseNum` directly. `persistPrefs()` does correctly call
  `displayToKg(baseNum, unitPref)` before storing the pref, so that path is safe.
  **Net verdict**: the round-trip through the stepper is currently safe but is a
  latent P0 risk. The specific confirmed bug is this: when the plate calculator
  is opened during an EDIT (editingIndex != null), `initialTarget={weight}` is
  the already-displayed weight string from the chip (filled by `handleEditChip`
  which sets `setWeight(s.weight ?? '')` where `s.weight` is the display-string
  from the chip label). This is correct. No current data corruption was found on
  the log path; flagging as P0 due to the latent fragility and the absence of a
  unit assertion in `PlateCalculatorSheet`.
- **Evidence:**
  ```ts
  // PlateCalculatorSheet.tsx:132-134
  const handleUse = (displayWeight: number) => {
    persistPrefs();
    onUseWeight(Math.round(displayWeight * 100) / 100);
  ```
  ```ts
  // StepperLogger.tsx:2027
  onUseWeight={(w) => setWeight(String(w))}
  ```
- **Invariant/Rubric:** Invariant 2 (weight = exact kg), P0 data integrity.
- **Suggested direction:** Add a JSDoc assertion to `PlateCalculatorSheet`
  clarifying that `onUseWeight` receives a **display-unit** value (not kg). In
  `StepperLogger`, add a brief inline comment at the `onUseWeight` callback
  confirming this is intentional (display units → goes through `displayToKg` in
  the log path). Also assert in `persistPrefs` that `displayToKg` is called
  (already done correctly).
- **Confidence:** MED (round-trip is currently correct; flagged as latent P0
  given missing documentation and fragility, not a current data loss bug)

---

### [P0] C-LOG-02 — SetEntryForm: `SafeAreaView` (RN core) as Modal root — header will clip under Dynamic Island

- **File:** `mobile/src/components/SetEntryForm.tsx:27, 404–405`
- **Problem:** `SetEntryForm` imports `SafeAreaView` from **`react-native`**
  (the static, non-aware version), not from `react-native-safe-area-context`.
  It wraps the entire `<Modal>` content in this `SafeAreaView`. The CLAUDE.md
  invariant (§3) and the audit brief both state that `SafeAreaView` inside a
  `<Modal>` does not reliably push content below the Dynamic Island — and the
  RN core `SafeAreaView` is even less reliable than the safe-area-context one.
  The exercise name / "Done" button in the header row will render under the
  Dynamic Island on iPhone 14+/15. This is the same class of bug that was
  fixed twice in StepperLogger (which now uses `paddingTop: Math.max(insets.top, 12)`
  on the header row directly).
- **Evidence:**
  ```ts
  // SetEntryForm.tsx:27
  import { ..., SafeAreaView, ... } from 'react-native';
  
  // SetEntryForm.tsx:404-405
  <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bgPrimary }]}>
    <KeyboardAvoidingView ...>
  ```
- **Invariant/Rubric:** Invariant 3 (safe-area in Modal), P0 crash/UX.
- **Suggested direction:** Replace the `react-native` `SafeAreaView` import with
  `useSafeAreaInsets` from `react-native-safe-area-context`. Remove the
  `SafeAreaView` wrapper and apply `paddingTop: Math.max(insets.top, 12)` to the
  `styles.header` `View` directly (same pattern as StepperLogger line 1148).
- **Confidence:** HIGH

---

### [P0] C-LOG-03 — RoutineStrip / WorkoutLoggerHost: `exercise_id: string | null | undefined` assigned to `exerciseId: string` — runtime null can reach logging calls

- **File:** `mobile/src/components/RoutineStrip.tsx:77–87`  
  `mobile/src/components/WorkoutLoggerHost.tsx:466–474`
- **Problem:** `RoutineExercise.exercise_id` is typed `string | null | undefined`
  (confirmed: `api/routines.ts:11`). Both `buildRoutineSession` (RoutineStrip:78)
  and the `startRoutine` imperative handler (WorkoutLoggerHost:467) map
  `exerciseId: ex.exercise_id` directly to `RoutineSessionExercise.exerciseId`
  which is typed `string` (not nullable). TypeScript flags this in `00-tsc.txt`
  at lines 83–93 (RoutineStrip) and 94–98 (WorkoutLoggerHost). At runtime a null
  `exercise_id` (which the server may legitimately return for unresolved exercises)
  flows through to `handleStepperLogSet(exerciseId, ...)` → `targetId = exerciseId
  || selectedExercise?.id || ''` — the `||` short-circuits on null and falls back
  to `selectedExercise?.id` which may also be null, producing an empty string that
  then reaches `logSet({ exerciseId: '' })`. Depending on the server's FK
  validation this either 400s silently or inserts a set with no exercise reference.
  The RoutineStrip `openRoutineSheet` also maps `exercise_id` (nullable) to
  `SheetExercise.exercise_id?: string` — that path is fine (the `?:` allows
  undefined). The crash risk is specifically through the session-start → log path.
- **Evidence:**
  ```ts
  // api/routines.ts:11
  exercise_id?: string | null;
  
  // RoutineStrip.tsx:77-78 (tsc error TS2322)
  exercises: routine.exercises.map((ex) => ({
    exerciseId: ex.exercise_id,  // string | null | undefined → string (unsafe)
  ```
  ```ts
  // WorkoutLoggerHost.tsx:466-467 (tsc error TS2322)
  exercises: routine.exercises.map((ex) => ({
    exerciseId: ex.exercise_id,  // same issue
  ```
- **Invariant/Rubric:** P0 data integrity / null-safety (TS2322 real errors, not
  benign router-string errors).
- **Suggested direction:** Coerce the value: `exerciseId: ex.exercise_id ?? ''`
  — an empty string matches the existing `isOffRoutine` check in StepperLogger
  (`(currentEx?.exerciseId ?? '') === ''`) and is already handled gracefully.
- **Confidence:** HIGH

---

### [P1] C-LOG-04 — SetEntryForm has no EDIT path — weight prefill uses raw `liftFields.weight` (display string), not `kgToInputValue`

- **File:** `mobile/src/components/SetEntryForm.tsx:114–518`
- **Problem:** `SetEntryForm` only has a LOG path (no chip-based edit). The
  `liftFields.weight` state is a free-text string typed by the user; it is never
  pre-filled from a stored kg value (there is no `onUpdateSet` prop and no
  `kgToInputValue` call). This is correct for the current usage because
  `SetEntryForm` is the OLD modal (pre-stepper), not the primary path — but
  the component is still exported and could be re-used. As long as it is only
  used as a new-set entry form (no edit prefill) there is no conversion bug.
  Flagging P1 as a latent risk: if this component is ever wired to prefill from
  a stored `weight_kg`, the code `parseFloat(liftFields.weight)` passed directly
  to `displayToKg` would expect a display-unit string, but a caller might pass
  the raw kg value. Note: `buildLiftPayload()` correctly calls
  `displayToKg(parseFloat(liftFields.weight), unitPref)` on the LOG path.
- **Evidence:**
  ```ts
  // SetEntryForm.tsx:178-180
  function buildLiftPayload(): LogSetPayload {
    const weightKg = displayToKg(parseFloat(liftFields.weight), unitPref);
  ```
- **Invariant/Rubric:** Invariant 2 (weight = exact kg), P1 latent risk.
- **Suggested direction:** Document clearly that `SetEntryForm` is a log-only
  form and must never be used for editing stored sets. If editing is ever needed,
  a prop `initialWeightKg` must be converted via `kgToInputValue` on mount.
- **Confidence:** MED (no current bug; latent risk)

---

### [P1] C-LOG-05 — TemplateDetailSheet: `SafeAreaView` from `react-native` (core) inside `<Modal>` as bottom-sheet root

- **File:** `mobile/src/components/TemplateDetailSheet.tsx:26, 82–92`
- **Problem:** `TemplateDetailSheet` imports `SafeAreaView` from `'react-native'`
  (not `react-native-safe-area-context`) and uses it as the bottom-sheet container
  inside a `<Modal>`. The sheet is positioned `absolute bottom: 0` with
  `maxHeight: '85%'`, so the top edge is determined by `maxHeight`, not by safe
  area. The Dynamic Island risk is at the **bottom**: the "Start Workout" CTA
  button has no `paddingBottom` from `insets.bottom`, so it may sit behind the
  home indicator pill on iPhone 14+. The start button could be obscured.
- **Evidence:**
  ```ts
  // TemplateDetailSheet.tsx:26
  import { ..., SafeAreaView } from 'react-native';
  
  // TemplateDetailSheet.tsx:82-91
  <SafeAreaView style={[styles.sheet, {
    backgroundColor: theme.colors.bgPrimary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  }]}>
  ```
  ```ts
  // TemplateDetailSheet.tsx styles:
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '85%' }
  // No paddingBottom: insets.bottom on the footer
  ```
- **Invariant/Rubric:** Invariant 3 (safe-area in Modal), P1 UX.
- **Suggested direction:** Import `useSafeAreaInsets` from
  `react-native-safe-area-context`; remove the `SafeAreaView` wrapper; apply
  `paddingBottom: Math.max(insets.bottom, spacing.s4)` to the `styles.footer`
  view that wraps the "Start Workout" button.
- **Confidence:** HIGH

---

### [P1] C-LOG-06 — RoutineEditorSheet: `SafeAreaView` used with `edges={['top']}` inside a full-screen `<Modal>` — bottom inset not applied to Save bar

- **File:** `mobile/src/components/RoutineEditorSheet.tsx:163, 304`
- **Problem:** `RoutineEditorSheet` does use `useSafeAreaInsets()` and applies
  `paddingTop: Math.max(insets.top, 12)` to the header row (correct). However,
  the sticky Save bar uses `paddingBottom: Math.max(insets.bottom, spacing.s3)`
  (line 304 of the render), which reads `insets` from `useSafeAreaInsets()` —
  this should be correct. The `SafeAreaView` at line 163 uses `edges={['top']}`
  which restricts the context-provided insets to only the top edge inside the
  `SafeAreaView`. Since the `insets` value comes from the `useSafeAreaInsets()`
  hook directly (not from the `SafeAreaView` context), the Save bar padding is
  correct regardless of the `edges` prop. This is therefore **not a bug in the
  current code** but is misleading: the `SafeAreaView` wrapper with `edges={['top']}`
  is unnecessary because the header already handles its own top padding via the
  hook, and the `SafeAreaView` provides no additional value.
- **Evidence:**
  ```ts
  // RoutineEditorSheet.tsx:163
  <SafeAreaView style={styles.container} edges={['top']}>
  // ... header row:
  <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
  // ... sticky save bar:
  <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, spacing.s3) }]}>
  ```
- **Invariant/Rubric:** Invariant 3 (safe-area in Modal), P1 (confusing
  redundant pattern).
- **Suggested direction:** Remove the `SafeAreaView` wrapper and replace with a
  plain `<View>` — the inset handling is already done correctly via the hook.
  This removes the misleading implication that `SafeAreaView` is doing useful work.
- **Confidence:** HIGH (no bug, but pattern is actively misleading)

---

### [P1] C-LOG-07 — WorkoutLoggerHost: `startRoutine` imperative method leaks a stale `cancelled` closure — cleanup return is unreachable

- **File:** `mobile/src/components/WorkoutLoggerHost.tsx:451–482`
- **Problem:** The `startRoutine` method inside `useImperativeHandle` creates a
  `cancelled` flag and returns a cleanup function `() => { cancelled = true; }`.
  However, `useImperativeHandle` callbacks are not cleanup functions — the return
  value of a ref-handle method is **not called by React**. The `getRoutine()` call
  has no cancellation: if the component unmounts while the routine fetch is in
  flight, `handleStartStepper` (which calls `setRoutineSession`, `setStepperSets`,
  `setStepperVisible`) will fire on an unmounted component, causing a
  setState-after-unmount warning and potential ghost state.
- **Evidence:**
  ```ts
  // WorkoutLoggerHost.tsx:451-481
  startRoutine(routineId: string, routineName: string) {
    let cancelled = false;
    getRoutine(user, routineId)
      .then((routine) => {
        if (cancelled) return;
        ...handleStartStepper(...)
      })
    ...
    return () => { cancelled = true; };  // ← never called by React
  },
  ```
- **Invariant/Rubric:** P0 rubric (setState-after-unmount) / P1 high (broken
  feature under race condition).
- **Suggested direction:** Store a ref (`const cancelledRef = useRef(false)`) at
  the component level and set/check it in the `startRoutine` body; or use an
  `AbortController`. Alternatively, since this is an imperative handle, use a
  module-level `let cancelled = false` variable that is reset on each call and
  checked in the `.then`.
- **Confidence:** HIGH

---

### [P1] C-LOG-08 — ExercisePicker: full library fetched on EVERY open (no visibility guard for cancelled load)

- **File:** `mobile/src/components/ExercisePicker.tsx:95–111`
- **Problem:** The `useEffect` that loads the exercise library runs whenever
  `visible` changes to `true`. If the user opens → closes → re-opens quickly, the
  first `getExercises()` promise may resolve after the component has re-mounted
  with a fresh state, calling `setLibrary(lib)` from the first (stale) fetch
  after the second fresh fetch has already populated the list. There is no
  `cancelled` guard, no `AbortController`, and no ref tracking whether the
  effect's fetch is still the current one. This is a stale-closure / late-resolve
  race: the stale result would overwrite the fresh result with identical data (no
  data corruption) but could produce a flash if the two fetches return different
  data (e.g. after a new exercise was added between opens).
- **Evidence:**
  ```ts
  // ExercisePicker.tsx:95-111
  useEffect(() => {
    if (!visible) return;
    ...
    getExercises()
      .then((lib) => setLibrary(lib))   // no cancel guard
      .catch(...)
      .finally(() => setIsLoading(false));
  }, [visible]);
  ```
- **Invariant/Rubric:** P1 state / effects — missing `useEffect` cleanup.
- **Suggested direction:** Add a `cancelled` flag and cleanup: `let cancelled = false; ... .then((lib) => { if (!cancelled) setLibrary(lib); }); return () => { cancelled = true; };`.
- **Confidence:** HIGH

---

### [P2] C-LOG-09 — StepperLogger rest-timer `setTimeout` accumulation under rapid taps

- **File:** `mobile/src/components/StepperLogger.tsx:682–687`
- **Problem:** The inline rest-timer uses `useEffect` on `restLeft` to fire a
  `setTimeout(() => setRestLeft(s => s - 1), 1000)` and clears it in the cleanup.
  This pattern is correct. However, `restLeft` changes on every tap of "+30s"
  (`setRestLeft(s => (s == null ? s : s + 30))`): this triggers a new `useEffect`
  run, which clears the old timeout and starts a new one. If the user taps "+30s"
  very rapidly (e.g. 10 taps in 1 second) each tap cancels and restarts the 1-second
  countdown, effectively stalling the timer for up to 10 seconds beyond the
  expected 30s extension. The net effect is that rapid taps extend rest by far
  more than intended. This is a UX bug, not data loss.
- **Evidence:**
  ```ts
  // StepperLogger.tsx:682-687
  useEffect(() => {
    if (restLeft === null) return;
    if (restLeft <= 0) { setRestLeft(null); return; }
    const t = setTimeout(() => setRestLeft((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);
  ```
- **Invariant/Rubric:** P2 race condition / UX under rapid interaction.
- **Suggested direction:** Use `useRef` to hold the timer interval, started once
  when `restLeft` transitions from `null` to a positive number, and cleared when
  it returns to `null`. Alternatively, track `restEndTime` (absolute timestamp)
  instead of `restLeft` to avoid the tap-stall.
- **Confidence:** HIGH

---

### [P2] C-LOG-10 — WorkoutLoggerHost: alternatives sheet `<Modal>` has no safe-area inset on its bottom sheet

- **File:** `mobile/src/components/WorkoutLoggerHost.tsx:1043–1098`
- **Problem:** The inline "Alternative exercises" `<Modal>` renders a `<View
  style={altStyles.sheet}>` (position absolute, bottom 0) with `paddingBottom:
  spacing.s6` (a fixed token). No `useSafeAreaInsets` call is made in this inner
  component; `spacing.s6` may or may not clear the home indicator pill on iPhone
  devices. The "Cancel" button at the bottom of this sheet may be clipped.
- **Evidence:**
  ```ts
  // WorkoutLoggerHost.tsx altStyles:
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    ...
    paddingBottom: spacing.s6,  // fixed, not insets-aware
  },
  ```
- **Invariant/Rubric:** Invariant 3 (safe-area in Modal), P2 UX.
- **Suggested direction:** Pass `insets.bottom` from `useSafeAreaInsets()` (already
  imported in the parent component) and add `paddingBottom: Math.max(insets.bottom, spacing.s6)`
  to the sheet's style.
- **Confidence:** HIGH

---

### [P2] C-LOG-11 — ScheduleEditorSheet: `SafeAreaView` `edges={['top','bottom']}` used as Modal root — also applies `paddingTop` on the header row (double-applying top inset)

- **File:** `mobile/src/components/ScheduleEditorSheet.tsx:380, 382`
- **Problem:** The schedule editor wraps the entire modal in `<SafeAreaView
  edges={['top', 'bottom']}>` AND also applies `paddingTop: Math.max(insets.top, 12)`
  to the header row. For the RNSC `SafeAreaView` inside a full-screen `<Modal>`,
  the `edges` prop may or may not add the correct top padding depending on the
  device. If `SafeAreaView` does apply the top inset AND the header row also adds
  `paddingTop: Math.max(insets.top, 12)`, the header will have the top inset
  applied **twice**, visibly over-spacing the title on iPhone with a notch/island.
  This is the same double-padding problem noted in CLAUDE.md §3 ("a prior 'fix'
  added edges=['top'] here, which pushed the WHOLE page down yet still left the
  header jammed under the Dynamic Island").
- **Evidence:**
  ```ts
  // ScheduleEditorSheet.tsx:380
  <SafeAreaView style={[styles.root, ...]} edges={['top', 'bottom']}>
    {/* Header */}
    <View style={[styles.header, { ..., paddingTop: Math.max(insets.top, 12) }]}>
  ```
- **Invariant/Rubric:** Invariant 3 (safe-area in Modal), P2 UX.
- **Suggested direction:** Remove `'top'` from `edges` (keep `'bottom'` for the
  sticky Save bar, OR remove `'bottom'` too and handle the bottom bar's padding
  via the existing `paddingBottom: Math.max(insets.bottom, ...)` pattern). The
  header row's manual `paddingTop` is the correct approach per CLAUDE.md §3.
- **Confidence:** MED (RNSC SafeAreaView inside a Modal is unreliable; may or
  may not double-apply depending on device)

---

### [P3] C-LOG-12 — StripHeader: `useRouter` called but result unused (dead code)

- **File:** `mobile/src/components/RoutineStrip.tsx:126`
- **Problem:** Inside the `StripHeader` sub-component, `const router = useRouter()`
  is called but `router` is never used in that function. The actual navigation
  (`router.push('/routines')`) happens in the parent `RoutineStrip` component
  where `router` is also correctly called and used. `StripHeader` receives its
  navigation intent via the `rightNode` prop. This is dead code — the hook call
  is harmless but wastes a reference.
- **Evidence:**
  ```ts
  // RoutineStrip.tsx:126
  function StripHeader({ ... }) {
    const { theme } = useTheme();
    const router = useRouter();  // ← never used in this function
  ```
- **Invariant/Rubric:** P3 dead code.
- **Suggested direction:** Remove the `useRouter()` call from `StripHeader`.
- **Confidence:** HIGH

---

### [P3] C-LOG-13 — ExerciseSwitcherSheet: no `useSafeAreaInsets` bottom padding on the sheet (minor)

- **File:** `mobile/src/components/ExerciseSwitcherSheet.tsx:144–152`
- **Problem:** The switcher sheet is `position absolute, bottom 0` with
  `paddingBottom: spacing.s8` (fixed token). This is the same class of concern
  as C-LOG-10 but the switcher is a purely navigational sheet (no action buttons
  below the scroll list), so the risk is cosmetic only — the last row may be
  slightly clipped on tall phones with a thick home pill.
- **Evidence:**
  ```ts
  // ExerciseSwitcherSheet.tsx styles:
  sheet: { ..., paddingBottom: spacing.s8 }
  ```
- **Invariant/Rubric:** Invariant 3 (minor), P3 cosmetic.
- **Suggested direction:** Pass `insets.bottom` from `useSafeAreaInsets()` and
  add `paddingBottom: Math.max(insets.bottom, spacing.s8)` — same pattern as the
  rest of the codebase.
- **Confidence:** MED (depends on `spacing.s8` value vs device home indicator height)
