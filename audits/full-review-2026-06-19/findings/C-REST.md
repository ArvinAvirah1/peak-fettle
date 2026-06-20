# C-REST findings
## Summary
Files reviewed: 31. Counts — P0:1 P1:4 P2:4 P3:2. Components are generally well-structured with good tier-branching, accessibility labels, and token usage. The most critical issues are a confirmed TS1117 duplicate-key bug that silently drops cosmetic unlock tiers (data-integrity), a stale-closure in PRToast's auto-dismiss, and a missing `.catch` on the LiftProgressChart fetch that leaves the component stuck in a loading state on network failure.

---

### [P1] C-REST-01 — COSMETIC_TIERS duplicate object keys silently drop accent-theme unlock tiers (TS1117)

- **File:** `mobile/src/components/avatar/peakAvatarOptions.ts:279–283` and `:339–343`
- **Problem:** The `COSMETIC_TIERS` object literal contains duplicate keys: `teal` (line 279 for hair-color, line 156 in a different dict — but crucially) `silver`, `violet` appear twice within `COSMETIC_TIERS` itself — once in the "Hair colors" section (lines 281, 283) and again in the "Accent themes" section (lines 340, 343). TypeScript flags these as TS1117 (`An object literal cannot have multiple properties with the same name`) at lines 340 and 343. JavaScript silently discards the first occurrence; the hair-color tier entries for `silver` (`{ streak: 30 }`) and `violet` (`'pro'`) are overwritten by the accent-theme entries (`{ streak: 30 }` and `{ streak: 100 }` respectively). Effect: `silver` hair color (streak-30 unlock) retains its correct tier by accident (both are `{ streak: 30 }`), but `violet` hair color is demoted from `'pro'` to `{ streak: 100 }` — a locked Pro item becomes earnable by a long streak. The inverse direction (accent-theme `silver` and `violet`) could also be wrong depending on intent. This is the exact TS1117 pair flagged in `00-tsc.txt`.
- **Evidence:**
```ts
// Hair colors section (lines 279–284):
teal:             { streak: 7 },
silver:           { streak: 30 },
violet:           'pro',          // ← FIRST definition — overwritten
skyBlue:          'pro',

// Accent themes section (lines 339–343):
silver:           { streak: 30 }, // TS1117 — overwrites hair-color silver
violet:           { streak: 100 },// TS1117 — overwrites hair-color violet ('pro' → streak-100)
```
- **Invariant/Rubric:** P1 — duplicate object property (TS1117 — silently drops a value); unlock gate correctness.
- **Suggested direction:** Namespace the hair-color tier keys differently from accent-theme keys (e.g. `hairColor_silver`, `hairColor_violet`) or restructure `COSMETIC_TIERS` into a nested object keyed by category. The existing `teal_wristband` suffix pattern already establishes the right approach — extend it to cover all ambiguous cross-category id clashes.
- **Confidence:** HIGH

---

### [P1] C-REST-02 — PRToast auto-dismiss stale closure: `dismiss` called before it is defined

- **File:** `mobile/src/components/PRToast.tsx:73–85`
- **Problem:** The `useEffect` (lines 48–85) captures `dismiss` in a `setTimeout` at line 73–75, but `dismiss` is defined as a `const` arrow function at line 87 — below the `useEffect`. In JavaScript hoisting rules, `const`/`let` declarations are not hoisted to a value, so at the time the effect runs, `dismiss` refers to the closure value from the enclosing scope captured at effect-execution time. Because the `useEffect` has `// eslint-disable-next-line react-hooks/exhaustive-deps` and only depends on `[data]`, it closes over the `dismiss` function defined in the same render, which is fine for a single render — but `dismiss` itself closes over `reduceMotion`, `opacityAnim`, `slideAnim`, and `onDismiss` without being listed as a dep. If `onDismiss` changes identity between renders (which it typically does when defined inline), the closure held by the timer fires with a stale `onDismiss`. Additionally `reduceMotion` is not in the deps array, so a user who changes Reduce Motion mid-toast will use the wrong animation path on auto-dismiss.
- **Evidence:**
```ts
useEffect(() => {
    // ...
    timerRef.current = setTimeout(() => {
      dismiss();           // line 74 — captures dismiss from closure
    }, autoDismissMs);
    // ...
  }, [data]);             // line 85 — missing: dismiss, autoDismissMs, reduceMotion, onDismiss

  const dismiss = () => { // line 87 — defined AFTER the effect
```
- **Invariant/Rubric:** P1 — stale closure / missing deps in `useEffect` deps array.
- **Suggested direction:** Move `dismiss` above the `useEffect` (or convert it to `useCallback` with proper deps), and add `dismiss` and `autoDismissMs` to the effect's deps array. Use a `useRef` for `onDismiss` to stabilize its identity if callers pass an inline callback.
- **Confidence:** HIGH

---

### [P1] C-REST-03 — LiftProgressChart: unhandled rejection on fetch failure leaves component permanently loading

- **File:** `mobile/src/components/LiftProgressChart.tsx:135–141`
- **Problem:** `fetcher.then(...)` has no `.catch()` handler. If `getExerciseProgress` or `getLocalExerciseProgress` rejects (network error for Pro users, or SQLite error for free users), the promise rejection is swallowed, `setLoading(false)` is never called, and the component remains indefinitely in the loading spinner state — no error UI, no recovery. React Native will also emit an unhandled promise rejection warning.
- **Evidence:**
```ts
fetcher.then((result) => {
  if (!cancelled) {
    setSeries(result);
    loadedForId.current = exerciseId;
    setLoading(false);
  }
});
// No .catch() — rejection silently leaves loading=true forever
```
- **Invariant/Rubric:** P2 elevated to P1 — missing loading/error state; unhandled rejection causing permanently broken UI.
- **Suggested direction:** Add `.catch(() => { if (!cancelled) { setSeries(null); setLoading(false); } })` so the component falls through to the "empty" state (which already renders a helpful message) rather than hanging.
- **Confidence:** HIGH

---

### [P1] C-REST-04 — MuscleHeatmap detail Modal: no safe-area top inset (Invariant 3)

- **File:** `mobile/src/components/MuscleHeatmap.tsx:325–402`
- **Problem:** The detail `<Modal>` that appears when a muscle region is tapped positions its sheet via `marginBottom: 32` (static style) and `justifyContent: 'flex-end'` on the backdrop. There is no `paddingTop` or `useSafeAreaInsets()` applied to the modal content. Per Invariant 3, `SafeAreaView` does not propagate inside a RN `<Modal>`. If the sheet ever grows taller than the screen (e.g. with many rows), content at the top can be obscured by the Dynamic Island. More critically, the backdrop `Pressable` covers the entire screen including the status-bar area — tapping behind the Dynamic Island would be blocked without a proper inset. The existing `dismissBtn` has `minHeight: 44` (correct), but the header text starts at the top of the sheet with only `padding: sp.s5` (20 pt) — insufficient on devices with a tall notch.
- **Evidence:**
```ts
<Modal visible={detail !== null} transparent animationType="fade" ...>
  <Pressable style={styles.modalBackdrop} ...>   // flex:1, justifyContent:'flex-end'
    <View style={[styles.detailSheet, {
      backgroundColor: colors.bgSecondary,
      borderRadius: r.lg,
      padding: sp.s5,          // no useSafeAreaInsets top guard
    }]}>
```
- **Invariant/Rubric:** Invariant 3 — SafeAreaView does not propagate inside Modal.
- **Suggested direction:** Import `useSafeAreaInsets` and apply `paddingBottom: Math.max(insets.bottom, 16)` to `detailSheet` so the dismiss button clears the home indicator on iPhone. The sheet is bottom-anchored so the bottom inset is the critical one here; top inset is less relevant for a bottom sheet but should be verified if the sheet is ever shown centered.
- **Confidence:** HIGH

---

### [P1] C-REST-05 — ThemeSelectorModal: Modal header has no top safe-area inset (Invariant 3)

- **File:** `mobile/src/components/ThemeSelector.tsx:140–212`
- **Problem:** `ThemeSelectorModal` renders a centered `<Modal>`. The inner sheet has `padding: spacing.s5` uniformly applied. No `useSafeAreaInsets()` is called; no `paddingTop: Math.max(insets.top, 12)` is applied to the header row. On iPhone with a Dynamic Island or notch, if the modal sheet renders close to the top of the screen (which a centered modal can), the "Appearance" heading and close button can be obscured. The outer backdrop also uses `padding: spacing.s6` which may not account for device safe areas.
- **Evidence:**
```ts
export function ThemeSelectorModal({ visible, onClose }: ThemeSelectorModalProps) {
  // No useSafeAreaInsets() call
  return (
    <Modal visible={visible} transparent animationType="fade" ...>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalBackdrop}>   // padding: spacing.s6 only
          <TouchableWithoutFeedback>
            <View style={[styles.modalSheet, {
              padding: spacing.s5,            // no top-inset guard
```
- **Invariant/Rubric:** Invariant 3 — SafeAreaView does not propagate inside Modal.
- **Suggested direction:** Add `const insets = useSafeAreaInsets()` and apply `paddingTop: Math.max(insets.top, spacing.s5)` to the `modalSheet` container, or ensure the outer `modalBackdrop` View adds `paddingTop: insets.top` so the sheet is never pushed under the notch.
- **Confidence:** MED (centered modals may not reach the top on all devices; depends on content height and screen size)

---

### [P2] C-REST-06 — OAuthButtons: floating async `handleApple` on `AppleAuthenticationButton.onPress`

- **File:** `mobile/src/components/auth/OAuthButtons.tsx:319`
- **Problem:** `AppleAuthenticationButton` is rendered with `onPress={handleApple}` where `handleApple` is an `async` function. The `onPress` prop of the Apple button expects a synchronous callback; the returned Promise is not `.catch()`-handled at the call site. If `handleApple` throws before its internal `try/catch` (e.g. if `Apple.signInAsync` is missing), the rejection is unhandled. The internal `try/catch` does handle most cases correctly, so this is P2 rather than P1 — but the outer floating Promise is still an unhandled-rejection risk.
- **Evidence:**
```ts
<Apple.AppleAuthenticationButton
  ...
  onPress={handleApple}   // handleApple is async — returned Promise unhandled
/>
```
- **Invariant/Rubric:** P2 — floating promise; unhandled rejection.
- **Suggested direction:** Wrap the call: `onPress={() => void handleApple()}` or `onPress={() => handleApple().catch(console.error)}`; the `void` operator is used elsewhere in the file (`void promptAsync()`) for exactly this pattern.
- **Confidence:** HIGH

---

### [P2] C-REST-07 — PRToast: `dismiss` used as `useEffect` dep-array eslint-suppress disguises missing deps

- **File:** `mobile/src/components/PRToast.tsx:84`
- **Problem:** `// eslint-disable-next-line react-hooks/exhaustive-deps` suppresses the lint rule on the `useEffect` that triggers the auto-dismiss timer. The actual missing deps are `dismiss`, `autoDismissMs`, `reduceMotion`, `opacityAnim`, `slideAnim` (the latter two are stable `useRef.current` values so they don't need to be in deps, but the first three do). Suppressing the lint rule entirely hides this. This is a secondary finding to C-REST-02 but worth calling out separately as the eslint-disable comment makes the stale closure harder to discover in future reviews.
- **Evidence:**
```ts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);  // suppress hides missing: autoDismissMs, dismiss, reduceMotion, onDismiss
```
- **Invariant/Rubric:** P2 — missing deps / stale deps array; eslint suppression masking real bug.
- **Suggested direction:** Remove the eslint-disable comment after fixing C-REST-02; accept the explicit stable deps (`animatedWidth`, `animVal` refs are fine to omit via the `useRef` stable-ref convention).
- **Confidence:** HIGH

---

### [P2] C-REST-08 — ReadinessCard: AnimatedArc adds an Animated.Value listener on every `circumference` change but never batches removals

- **File:** `mobile/src/components/ReadinessCard.tsx:198–204`
- **Problem:** `AnimatedArc` uses `animVal.addListener` inside a `useEffect` to drive `strokeDashoffset`. The cleanup `return () => animVal.removeListener(id)` is correct. However, `animVal` is a stable `useRef.current` so the effect only runs once — this is safe. The concern is that `circumference` is not in the deps array but is used inside the effect callback. If `ScoreDial`'s `size` prop changes (e.g. on window resize), `circumference` would update but the listener's stale closure would still use the old `circumference` value, computing wrong offsets. In the current codebase `size` defaults to 96 and is never changed dynamically, so this is latent but not currently a crash.
- **Evidence:**
```ts
useEffect(() => {
  const id = animVal.addListener(({ value }) => {
    const pct = Math.max(0, Math.min(100, value)) / 100;
    setOffset(circumference * (1 - pct));   // stale circumference if size changes
  });
  return () => animVal.removeListener(id);
}, [animVal, circumference]);   // circumference IS listed — actually OK
```
- **Invariant/Rubric:** P2 — on further inspection `circumference` IS in the deps array (line 203). Re-classification: this is LOW confidence / not a real bug as written. Downgrading to informational; no action needed. Keeping as a P3 note.
- **Confidence:** LOW — deps are actually correct; retract as real finding.

---

### [P2] C-REST-09 — WelcomeTour: `resolveStep` return value (cleanup fn) is ignored by callers

- **File:** `mobile/src/components/tour/WelcomeTour.tsx:188–216`
- **Problem:** `resolveStep` returns a cleanup function (`return () => clearTimeout(t)`) but its callers — `startTour` (line 221), `goNext`'s `resolveStep(next)` (line 237), and `goBack`'s `resolveStep(prev)` (line 245) — all discard the return value. This means the `setTimeout` inside `resolveStep` is never cancelled when the step changes rapidly (e.g. clicking Next quickly). Each rapid Next press accumulates a 380 ms timeout that will fire and potentially `setRect` on a stale step, causing the spotlight to jump to an old anchor after the user has already moved on.
- **Evidence:**
```ts
const resolveStep = useCallback((index: number) => {
  // ...
  const t = setTimeout(() => { /* measure and setRect */ }, 380);
  return () => clearTimeout(t);   // cleanup returned but never used
}, []);

const goNext = useCallback(() => {
  setStepIndex((i) => {
    const next = i + 1;
    resolveStep(next);   // return value (clearTimeout fn) discarded
    return next;
  });
}, [finish, resolveStep]);
```
- **Invariant/Rubric:** P2 — async race condition; stale setState on a previous step's timeout.
- **Suggested direction:** Store the cleanup in a `useRef<(() => void) | null>` and call it before each `resolveStep` invocation: `cleanupRef.current?.(); cleanupRef.current = resolveStep(next) ?? null;`
- **Confidence:** HIGH

---

### [P3] C-REST-10 — TabErrorBoundary: always renders with DEFAULT_THEME colors regardless of user's active theme

- **File:** `mobile/src/components/TabErrorBoundary.tsx:20`
- **Problem:** `TabErrorBoundary` intentionally reads `THEMES[DEFAULT_THEME]` at module-eval time (necessary because class components cannot use hooks). This is documented and correct. However, a user who has set a light or custom theme will see the error card in the default dark theme, which may appear jarring or contrast-incorrect. This is a known limitation of class-component error boundaries and is explicitly called out in the file comment — flagged P3 for awareness.
- **Evidence:**
```ts
const { colors, components } = THEMES[DEFAULT_THEME];
// A user on 'ember' or 'forest' theme sees the dark-navy error card
```
- **Invariant/Rubric:** P3 — UX inconsistency; not a correctness bug.
- **Suggested direction:** Consider passing the current theme name as a prop from the screen wrapper, or using a module-level `ThemeContext` subscription via a render-prop shim. Low priority given error boundaries are rarely seen.
- **Confidence:** HIGH

---

### [P3] C-REST-11 — `PressableCard` missing `accessibilityLabel` prop — callers must supply context

- **File:** `mobile/src/components/ui/PressableCard.tsx:86–97`
- **Problem:** `PressableCard` renders `accessibilityRole="button"` on the `<Pressable>` but has no `accessibilityLabel` prop — the caller must supply one via `children` aria context or a wrapper. For VoiceOver/TalkBack, a button with no label is announced as "button" with no context. Since `PressableCard` is a generic container (children are arbitrary), there is no guaranteed readable label. The component should either accept an `accessibilityLabel` prop or document explicitly that callers must wrap with `accessibilityLabel`.
- **Evidence:**
```ts
<Pressable
  onPressIn={handlePressIn}
  onPressOut={handlePressOut}
  onPress={handlePress}
  disabled={disabled}
  accessibilityRole="button"
  // no accessibilityLabel prop
>
```
- **Invariant/Rubric:** P3 — accessibility; `accessibilityLabel` missing on interactive element.
- **Suggested direction:** Add `accessibilityLabel?: string` to `PressableCardProps` and pass it through to `<Pressable>`.
- **Confidence:** HIGH
