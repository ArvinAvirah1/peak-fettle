# SYNTH-3 — UI components · modals/safe-area · cosmetics gating · charts null-safety · perf · a11y

Synthesizer: **Opus Synthesizer 3**
Inputs verified: `C-LOG.md`, `C-REST.md`, `A2.md`, `A5.md` (+ `00-tsc.txt`)
Every P0/P1 below was re-opened at its cited `file:line` and the data-flow traced. Findings are
deduplicated, tagged with the shared systemic vocabulary, and given a concrete fix.

---

## (a) Lane summary

Two genuinely shippable defects dominate this lane:

1. **`SYSTEMIC:cosmetic-gating` — a real tier-bypass.** `peakAvatarOptions.ts` has duplicate object
   keys (`silver`, `violet`) across the hair-color and accent-theme sections (TS1117, confirmed at
   `00-tsc.txt:99,100`), plus a wristband ID↔tier-key mismatch. Net effect, traced through
   `cosmeticUnlocks.isUnlocked` → `cosmetics.tsx`: the **`violet` hair color** drops from `'pro'` to
   `{ streak: 100 }` (a paid item becomes earnable for free), the **`neon` wristband** falls through
   to `'free'` (intended streak-30), and the **`teal`/`gold` wristbands** silently resolve to an
   unrelated category's weaker streak gate. Gating is purely client-render-driven and `setEquipped`
   does **no** server validation, so a mis-tiered chip renders unlocked and is immediately equippable.

2. **`SYSTEMIC:safe-area-modal` (Invariant 3) — confirmed across 9 modal/sheet sites.** Five are
   true top-clip bugs (header sits under the Dynamic Island), three are bottom-clip bugs (CTA/last row
   under the home indicator), and one centered modal is a milder bottom variant. Two further sites
   (`RoutineEditorSheet`, `ScheduleEditorSheet`) already apply the correct manual inset and only carry
   a *redundant/possible-double-pad* `SafeAreaView` wrapper — downgraded, not clip bugs.

Beyond those clusters: one real **P0 setState-after-unmount** (`insights.tsx` deload-ack), a cluster
of **unmount/cancel-guard** gaps (`WorkoutLoggerHost.startRoutine`, `ExercisePicker`, `insights load()`),
a **null-safety-ui** family (the `exercise_id: string|null` → `string` assignment is the one with live
runtime impact; the rest are type-only), and assorted P2 perf/error-handling. The PlateCalculator
"latent" P0 (C-LOG-01) and SetEntryForm "latent" P1 (C-LOG-04) were verified as **currently correct**
and are downgraded.

**Verified counts — P0: 3 · P1: 11 · P2: 8 · P3: 6. Dropped/downgraded: 5.**
**Systemic tags — `safe-area-modal`: 11 sites flagged (9 confirmed clip + 2 redundant), `cosmetic-gating`: 1 consolidated, `null-safety-ui`: 6, `unmount-guard`: 4, `perf-render`: 2.**
**Confirmed safe-area-modal locations (clip bugs): 9.**

---

## (b) Verified findings — severity-ranked

| ID | Sev | File:line | Systemic tag | One-line problem |
|----|-----|-----------|--------------|------------------|
| S3-01 | **P0** | `app/insights.tsx:162,173-192` | `unmount-guard` | Deload-ack async `onPress` + `load()` effect have no mounted/cancel guard → setState-after-unmount + stale-fetch overwrite. |
| S3-02 | **P0** | `src/components/WorkoutLoggerHost.tsx:450-481` | `unmount-guard` | `startRoutine` returns a cleanup from a `useImperativeHandle` method React never calls; `getRoutine()` isn't cancellable → setState after unmount. |
| S3-03 | **P0** | `src/components/avatar/peakAvatarOptions.ts:279-343` (+ `cosmeticUnlocks.ts:64`) | `cosmetic-gating` | Duplicate keys + wristband ID mismatch let non-Pro users equip a Pro hair color and free-unlock streak wristbands. |
| S3-04 | **P1** | `src/components/SetEntryForm.tsx:26,404` | `safe-area-modal` | `SafeAreaView` from **react-native core** as Modal root; header (414) has no manual top inset → clips under island. |
| S3-05 | **P1** | `app/groups.tsx:277` & `:392` | `safe-area-modal` | Create + Join modals use `SafeAreaView edges={['top','bottom']}` inside `<Modal>`; headers (283/398) not inset-padded. |
| S3-06 | **P1** | `app/group-detail.tsx:541` | `safe-area-modal` | `GoalChangeModal` `SafeAreaView edges` inside `<Modal>`; header (546) not inset-padded. |
| S3-07 | **P1** | `app/(tabs)/profile.tsx:39,529` | `safe-area-modal` | `AddConstraintModal` uses **react-native core** `SafeAreaView` inside `<Modal>`; header (538) not inset-padded. |
| S3-08 | **P1** | `src/components/avatar/peakAvatarOptions.ts:340,343` | `cosmetic-gating` | (Sub-finding of S3-03) TS1117 duplicate `silver`/`violet` — the static-checker face of the bypass. |
| S3-09 | **P1** | `app/group-detail.tsx:925` | — | `GoalChangeModal currentGoal={3}` hardcoded → picker always pre-selects 3; "no change" logic wrong for goal≠3. |
| S3-10 | **P1** | `src/components/RoutineStrip.tsx:78` & `WorkoutLoggerHost.tsx:467` | `null-safety-ui` | `exerciseId: ex.exercise_id` (string\|null\|undefined → string); null can reach `logSet` as `''`. (TS2322) |
| S3-11 | **P1** | `src/components/LiftProgressChart.tsx:135-141` | `null-safety-ui` | `fetcher.then()` has no `.catch` → rejection leaves `loading=true` forever (permanent spinner). |
| S3-12 | **P1** | `src/components/ExercisePicker.tsx:95-111` | `unmount-guard` | Library fetch `.then(setLibrary)` has no `cancelled` guard → late-resolve/stale-overwrite + setState after unmount. |
| S3-13 | **P1** | `src/components/PRToast.tsx:73-87` | — | Auto-dismiss `setTimeout(dismiss)` closes over `reduceMotion`/`onDismiss` not in deps (`[data]`, eslint-disabled). |
| S3-14 | **P1** | `app/(tabs)/profile.tsx:695-699` | — | `loadConstraints` effect has empty deps → constraints never reload on login/tier switch. |
| S3-15 | **P1** | `app/insights.tsx:259,314,322,337` | `null-safety-ui` | `staggerAnims[n]` is `Animated.Value\|undefined` into `staggerStyle(Value)`. (4× TS2345) |
| S3-16 | **P2** | `src/components/MuscleHeatmap.tsx:325-402` | `safe-area-modal` | Detail bottom-sheet has no `insets.bottom` → dismiss button can sit under home indicator. |
| S3-17 | **P2** | `src/components/TemplateDetailSheet.tsx:25,82` | `safe-area-modal` | core `SafeAreaView` bottom-sheet; "Start Workout" footer has no `insets.bottom`. |
| S3-18 | **P2** | `src/components/WorkoutLoggerHost.tsx:104,1262-1272` | `safe-area-modal` | Alt-exercise sheet + PIN sheet use fixed `paddingBottom: spacing.s6`, not insets-aware. |
| S3-19 | **P2** | `src/components/ThemeSelector.tsx:140-211` | `safe-area-modal` | Centered theme modal: no inset on sheet (mild — centered, rarely reaches edges). |
| S3-20 | **P2** | `src/components/StepperLogger.tsx:682-687` | `perf-render` | Rest-timer keyed on `restLeft`; rapid "+30s" taps restart the 1 s tick, stalling the countdown. |
| S3-21 | **P2** | `src/components/tour/WelcomeTour.tsx:188-216` | `unmount-guard` | `resolveStep` returns a `clearTimeout` cleanup that all callers discard → stale spotlight on rapid Next. |
| S3-22 | **P2** | `src/components/auth/OAuthButtons.tsx:319` | — | `onPress={handleApple}` (async) — floating promise; outer rejection unhandled (internal try/catch mitigates). |
| S3-23 | **P2** | `app/health-metrics.tsx:49-50` | `null-safety-ui` | `formatDate` destructures `month`/`day` (number\|undefined) → "Invalid Date" on malformed input. (TS18048) |
| S3-24 | **P2** | `app/(tabs)/profile.tsx:637,660` | `perf-render` | `THEME_DISPLAY_NAMES` / `REST_TIMER_PRESETS` re-allocated every render of a 1980-line screen. |
| S3-25 | **P3** | `app/glossary.tsx:119-125` | — | Deep-link scroll uses `idx > 0` (off-by-one: skips first term) + empty-dep stale closure. |
| S3-26 | **P3** | `app/group-detail.tsx:860-915` | — | 5 hardcoded hex literals violate the file's own "zero hardcoded hex" theme contract. |
| S3-27 | **P3** | `app/group-detail.tsx:78` | `null-safety-ui` | `name.trim()[0]` is `string\|undefined` (TS2532); safe at runtime via caller guard. |
| S3-28 | **P3** | `app/groups.tsx:488-512` | — | Create/Join modals render a `GoalPicker` then discard the `_goal` arg — misleading dead UI. |
| S3-29 | **P3** | `src/components/RoutineStrip.tsx:126` | — | `useRouter()` called in `StripHeader` but result unused (dead code). |
| S3-30 | **P3** | `src/components/ui/PressableCard.tsx:86-97` | — | `accessibilityRole="button"` with no `accessibilityLabel` prop → VoiceOver announces bare "button". |

---

## (c) Per-finding detail + concrete fix

### CONSOLIDATED — `SYSTEMIC:safe-area-modal` (Invariant 3)

**The canonical pattern** (already used correctly in `StepperLogger.tsx:1140,1148`):

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// inside the component rendered as the Modal's content:
const insets = useSafeAreaInsets();
// ...
<Modal ...>
  {/* root is a plain View — NOT SafeAreaView (it does not propagate inside a Modal) */}
  <View style={[styles.container, { backgroundColor: theme.colors.bgPrimary }]}>
    {/* top-anchored content: inset the HEADER ROW directly */}
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>…</View>
    {/* bottom-anchored CTA / sticky bar: inset the FOOTER directly */}
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.s4) }]}>…</View>
  </View>
</Modal>
```
Rule of thumb: a top-anchored full-screen sheet needs `paddingTop` on the header; a `bottom:0`
absolute sheet needs `paddingBottom` on the footer. **Never** rely on a `SafeAreaView` (core *or*
context) as the Modal root for the inset.

**Consolidated location list — 9 confirmed clip bugs:**

| # | File:line | Anchor | `SafeAreaView` source | Inset to add |
|---|-----------|--------|----------------------|--------------|
| 1 | `src/components/SetEntryForm.tsx:404` (import `:26`) | top (full-screen) | **react-native core** | `paddingTop` on `styles.header` (414) |
| 2 | `app/groups.tsx:277` (CreateGroupModal) | top (pageSheet) | safe-area-context, `edges=['top','bottom']` | `paddingTop` on `styles.modalHandle`/`modalHeader` (282-283) |
| 3 | `app/groups.tsx:392` (JoinGroupModal) | top (pageSheet) | safe-area-context, `edges=['top','bottom']` | `paddingTop` on header (397-398) |
| 4 | `app/group-detail.tsx:541` (GoalChangeModal) | top (pageSheet) | safe-area-context, `edges=['top','bottom']` | `paddingTop` on `styles.modalHeader` (546) |
| 5 | `app/(tabs)/profile.tsx:529` (AddConstraintModal, import `:39`) | top (pageSheet) | **react-native core** | `paddingTop` on `addConstraintStyles.handle`/`header` (535/538) |
| 6 | `src/components/TemplateDetailSheet.tsx:82` (import `:25`) | bottom (absolute) | **react-native core** | `paddingBottom` on the "Start Workout" footer |
| 7 | `src/components/MuscleHeatmap.tsx:336` (`detailSheet`) | bottom (transparent) | none (fixed `padding: sp.s5`) | `paddingBottom: Math.max(insets.bottom, 16)` on `detailSheet` |
| 8 | `src/components/WorkoutLoggerHost.tsx:1262` (`altStyles.sheet`) | bottom (absolute) | none (fixed `paddingBottom: spacing.s6`) | `paddingBottom: Math.max(insets.bottom, spacing.s6)` |
| 9 | `src/components/WorkoutLoggerHost.tsx:104` (`pwStyles.sheet`) | bottom (absolute) | none (fixed `paddingBottom: sp.s6`) | `paddingBottom: Math.max(insets.bottom, sp.s6)` |

Items 2-5 carry the **core fix as the top item** — and because items 2-4 use `edges={['top','bottom']}`,
once you replace `SafeAreaView` with a plain `View` you must restore the *bottom* inset on their sticky
footers too (they were getting it from the now-removed `edges:'bottom'`).
`ThemeSelector.tsx` (S3-19) is a centered modal — the same `insets.bottom` guard applies but the
practical risk is low; do it for consistency.

**Downgraded (redundant wrapper, NOT a clip):** `RoutineEditorSheet.tsx:163` and
`ScheduleEditorSheet.tsx:380` already apply `paddingTop: Math.max(insets.top, 12)` to their header
(`:171`, `:382`) via the hook and `paddingBottom: Math.max(insets.bottom, …)` to the save bar. The
outer `SafeAreaView edges={[…]}` adds nothing and *may* double-pad the top. **Fix:** swap the
`SafeAreaView` for a plain `<View>` and drop `'top'` from `edges` — cosmetic cleanup, P3 not P1.

---

### S3-01 (P0) — `insights.tsx` setState-after-unmount + stale-fetch overwrite · `unmount-guard`
**Dedup:** A5-01 + A5-08 (same root). Confirmed `insights.tsx:162-165` (`load()` effect, no cleanup)
and `:173-192` (`handleAckDeload` async `onPress`, no mounted check). Both `setReadiness/Recovery/Deload`
and `setDeload/setDeloadAcking` can fire after unmount; concurrent `load()`s race (last-to-settle wins).
**Fix:**
```ts
const mountedRef = useRef(true);
useEffect(() => () => { mountedRef.current = false; }, []);

const load = useCallback(async () => {
  const [rd, rec, dl] = await Promise.all([getReadiness(), getRecovery(), getDeload()]);
  if (!mountedRef.current) return;
  setReadiness(rd); setRecovery(rec); setDeload(dl);
}, [user?.is_paid]);

useEffect(() => {
  let ignore = false;
  setLoading(true);
  load().finally(() => { if (!ignore && mountedRef.current) setLoading(false); });
  return () => { ignore = true; };
}, [load]);
```
In the Alert `onPress`, gate every `setState` on `if (mountedRef.current)`.

### S3-02 (P0) — `WorkoutLoggerHost.startRoutine` unreachable cleanup · `unmount-guard`
**Dedup:** C-LOG-07. Confirmed `:450-481`: `let cancelled = false` is local to the method, and the
returned `() => { cancelled = true; }` is the return value of a `useImperativeHandle` method, which
React does not invoke. `getRoutine()` is therefore effectively uncancellable; `handleStartStepper`'s
`setRoutineSession`/`setStepperSets`/`setStepperVisible` can fire after unmount.
**Fix:** promote the flag to a component-level ref checked in the `.then`:
```ts
const startCancelledRef = useRef(false);
useEffect(() => () => { startCancelledRef.current = true; }, []);
// in startRoutine:
startCancelledRef.current = false;          // reset per invocation
getRoutine(user, routineId).then((routine) => {
  if (startCancelledRef.current) return;
  …handleStartStepper(…)
}).catch(() => { if (!startCancelledRef.current) Alert.alert('Could not load routine','Please try again.'); });
// remove the bogus `return () => {…}`.
```

### S3-03 / S3-08 (P0 / P1) — Cosmetic tier bypass · `SYSTEMIC:cosmetic-gating`
**Dedup:** C-REST-01 + A2-01 + A2-02 (one consolidated bug). Verified end-to-end:
- `peakAvatarOptions.ts` `COSMETIC_TIERS` is **one flat object**. `silver` is defined at `:281`
  (`{streak:30}`, hair) **and** `:340` (`{streak:30}`, accent); `violet` at `:283` (`'pro'`, hair)
  **and** `:343` (`{streak:100}`, accent). JS keeps the **last** ⇒ TS1117 at `00-tsc.txt:99,100`.
  `silver` is unchanged (both `{streak:30}`); **`violet` hair color silently demotes `'pro'` →
  `{streak:100}`**.
- `isUnlocked` (`cosmeticUnlocks.ts:64`): `const tier = tiers[optionId] ?? 'free'`. So a key absent
  from the map ⇒ `'free'`. `WRISTBANDS_IDS` (`:247`) ships bare ids `'teal','gold','neon'`, but the
  tier map keys them `teal_wristband`/`gold_wristband`/`neon_wristband` (`:317-319`). Thus:
  `isUnlocked('neon',…)` → key missing → **free** (intended streak-30); `isUnlocked('teal',…)` and
  `isUnlocked('gold',…)` collide with the **accent/hair** `teal` (`{streak:7}`) and accent `gold`
  (`{streak:7}`) — the gold wristband weakens from streak-30 to streak-7.
- Bypass mechanics: `cosmetics.tsx` `OptionChip.handlePress` (`:360`) only blocks when `locked`, and
  `locked = !isUnlocked(...)`. `setEquipped` (`cosmeticUnlocks.ts:148`) explicitly does **no** unlock
  validation ("callers are responsible"). So any mis-tiered chip renders unlocked → equippable, and
  the equip persists to `user_equipped_cosmetics` with no second gate. **Free users can equip the
  `violet` Pro hair color (at a 100-day streak) and the `neon` wristband (immediately).**

**Fix — namespace the cross-category ids so each option id is globally unique** (extends the existing
`*_wristband` convention). Rename the accent-theme ids in `ACCENT_THEME`, `ACCENT_THEME_IDS`, and
`COSMETIC_TIERS`, and the wristband ids in `WRISTBANDS_IDS` to match their tier keys:
```ts
// ACCENT_THEME / ACCENT_THEME_IDS  → prefix collision-prone ids:
//   gold→accentGold, silver→accentSilver, teal→accentTeal, rose→accentRose,
//   sky→accentSky, violet→accentViolet  (none/flame/neonGreen/… already unique)
// WRISTBANDS_IDS → 'teal_wristband','gold_wristband','neon_wristband'  (match tier keys)

export const COSMETIC_TIERS: CosmeticTiersMap = {
  …
  // ── Hair colors ──
  teal: { streak: 7 }, pink: { streak: 7 }, silver: { streak: 30 },
  platinum: { streak: 30 }, violet: 'pro', skyBlue: 'pro',
  …
  // ── Wristbands ── (ids now match)
  teal_wristband: { streak: 7 }, gold_wristband: { streak: 30 }, neon_wristband: { streak: 30 },
  …
  // ── Accent themes ── (namespaced — no longer collide with hair)
  accentGold: { streak: 7 }, accentSilver: { streak: 30 }, accentRose: { streak: 30 },
  accentSky: { streak: 30 }, accentViolet: { streak: 100 },
  flame: 'pro', neonGreen: 'pro', neonPink: 'pro', obsidian: 'pro', prismatic: 'pro',
};
```
After renaming, `tsc` must show **0× TS1117**, and `normalizeAvatar`/`DEFAULT_AVATAR.accentTheme` keys
stay valid because `'none'` is unchanged. **Migration note:** any rows already in
`user_equipped_cosmetics` with `slot='accentTheme', item_id IN ('gold','silver','teal','rose','sky','violet')`
must be migrated to the `accent*` ids (one-shot `UPDATE`), or those users lose their equipped accent on
next load. Add a `__tests__` assertion that every id in each `*_IDS` array resolves in `COSMETIC_TIERS`
or is intentionally free, to prevent regressions.

### S3-04–S3-07 (P1) — safe-area-modal top-clip bugs
See the **consolidated section** above (locations 1-5). All four are the canonical fix: remove the
`SafeAreaView` root, add `paddingTop: Math.max(insets.top, 12)` to the header row; for the
`edges=['top','bottom']` ones (S3-05, S3-06) also move the bottom inset onto the sticky footer.

### S3-09 (P1) — `group-detail.tsx` hardcoded `currentGoal={3}`
**Dedup:** A5-03. Confirmed `:925`. `GoalChangeModal` inits `useState<WeeklyGoal>(currentGoal)`
(`:537`), so the picker always pre-selects 3 and the change/no-change labelling is wrong for any user
whose real weekly goal ≠ 3.
**Fix:** source the real goal. Easiest correct path: read it from the profile/goal hook the rest of the
app uses and pass it through:
```tsx
const { weeklyGoal } = useWeeklyGoal();   // or whatever the profile hook exposes
<GoalChangeModal … currentGoal={weeklyGoal ?? 3} … />
```
If no such hook is wired on this screen, cache the last value returned by `updateGoal()` in hook state
and seed from that; do **not** leave the literal.

### S3-10 (P1) — `exercise_id: string|null` → `string` · `null-safety-ui`
**Dedup:** C-LOG-03. Confirmed `RoutineStrip.tsx:78` and `WorkoutLoggerHost.tsx:467` (TS2322 at
`00-tsc.txt:83-87,94-98`). `api/routines.ts` types `exercise_id?: string | null`; a null reaches
`handleStepperLogSet` where `targetId = exerciseId || selectedExercise?.id || ''`, so it can degrade to
`''` and be logged with no exercise reference.
**Fix:** coerce at the two map sites — `exerciseId: ex.exercise_id ?? ''`. Empty string already matches
the `isOffRoutine` check in StepperLogger (`(currentEx?.exerciseId ?? '') === ''`), so this is the
graceful, type-clean value. Clears both TS2322s.

### S3-11 (P1) — `LiftProgressChart` missing `.catch` · `null-safety-ui` (error-state)
**Dedup:** C-REST-03. Confirmed `:135-141`: `fetcher.then((result) => { … setLoading(false); })` with
no `.catch`. On reject (Pro network error / free SQLite error) `setLoading(false)` never runs ⇒
permanent spinner + unhandled rejection. (The `cancelled` guard is present, so unmount is fine.)
**Fix:**
```ts
fetcher
  .then((result) => { if (!cancelled) { setSeries(result); loadedForId.current = exerciseId; setLoading(false); } })
  .catch(() => { if (!cancelled) { setSeries(null); setLoading(false); } });  // falls through to the existing empty state
```

### S3-12 (P1) — `ExercisePicker` no cancel guard · `unmount-guard`
**Dedup:** C-LOG-08. Confirmed `:95-111`: `getExercises().then((lib) => setLibrary(lib))` has `.catch`
and `.finally` but **no `cancelled`** flag, so a stale/late fetch (open→close→reopen) calls `setLibrary`
after unmount or overwrites the fresh list.
**Fix:**
```ts
let cancelled = false;
getExercises()
  .then((lib) => { if (!cancelled) setLibrary(lib); })
  .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load exercises'); })
  .finally(() => { if (!cancelled) setIsLoading(false); });
return () => { cancelled = true; };
```

### S3-13 (P1) — `PRToast` stale-closure auto-dismiss
**Dedup:** C-REST-02 (+ C-REST-07, the eslint-suppress sibling). Confirmed `:73-87`. The `timerRef`
cleanup (`:81-83`) does clear on unmount/`data` change, so the *unmount* leak is mitigated — the real
defect is the **stale `reduceMotion`/`onDismiss`** captured by `dismiss` (declared at `:87`, below the
effect, deps `[data]`, eslint-disabled). A `reduceMotion` toggle (or new inline `onDismiss`) mid-toast
auto-dismisses on the wrong animation path / stale callback.
**Fix:** convert `dismiss` to a `useCallback([reduceMotion, onDismiss, slideAnim, opacityAnim])` **above**
the effect, list `dismiss` + `autoDismissMs` in the effect deps, and remove the eslint-disable. If
callers commonly pass an inline `onDismiss`, stabilize it via a `useRef` updated each render.

### S3-14 (P1) — `profile.tsx` `loadConstraints` never reloads
**Dedup:** A2-04 (framing corrected). Confirmed `:695-699`. The hoisting-crash worry is **not** real —
effects run after the render body, so `loadConstraints` (defined `:699`) exists by the time the effect
(`:695`) fires. The real bug is the **empty deps array**: constraints don't reload when `user` changes
(login / tier switch), and the local-first branch keys on `user`.
**Fix:** move `loadConstraints` above the effect and depend on it: `useEffect(() => { loadConstraints(); }, [loadConstraints]);` (the `useCallback` already deps on `[user]`).

### S3-15 (P1) — `insights.tsx` `staggerAnims[n]` possibly-undefined · `null-safety-ui`
**Dedup:** A5-05. Confirmed `:259,314,322,337` (4× TS2345 at `00-tsc.txt:43-50`). Array is always
length-4 at runtime, so no live crash, but the type gap would hide a real one if `count` shrank.
**Fix:** type `useStaggerFade` to return a fixed tuple `[Animated.Value, Animated.Value, Animated.Value,
Animated.Value]` (cleaner, self-documenting) — clears all four without per-site assertions.

### S3-16–S3-19 (P2) — safe-area-modal bottom-clip
See consolidated section (locations 6-9 + ThemeSelector). Add the `insets.bottom` guard to each sheet's
footer/last-padding. Low blast radius individually; batch them with the P1 safe-area fixes since the
import + `useSafeAreaInsets()` plumbing is identical.

### S3-20 (P2) — StepperLogger rest-timer tap-stall · `perf-render`
**Dedup:** C-LOG-09. Confirmed `:682-687`: effect keyed on `restLeft`; every "+30s" tap re-runs it,
clearing and restarting the 1 s `setTimeout`, so rapid taps freeze the countdown.
**Fix:** track an absolute `restEndTimeRef` (ms timestamp) and tick once per second toward it, or hold
the interval in a ref started on the `null→positive` transition and cleared on the return to `null` —
so extending only changes the target, not the tick cadence.

### S3-21 (P2) — `WelcomeTour.resolveStep` discarded cleanup · `unmount-guard`
**Dedup:** C-REST-09. Confirmed `:188-216`: `resolveStep` returns `() => clearTimeout(t)` but
`startTour`/`goNext`/`goBack` ignore it, so rapid Next accumulates 380 ms timeouts that `setRect` to a
stale step.
**Fix:** `const cleanupRef = useRef<(() => void) | null>(null);` then at each call site
`cleanupRef.current?.(); cleanupRef.current = resolveStep(idx) ?? null;`, and clear it in an unmount effect.

### S3-22 (P2) — OAuthButtons floating `handleApple`
**Dedup:** C-REST-06. Confirmed `:319`. Internal try/catch covers most cases; the outer promise is still
unhandled.
**Fix:** `onPress={() => void handleApple()}` (the file already uses `void promptAsync()` elsewhere).

### S3-23 (P2) — `health-metrics.formatDate` undefined month · `null-safety-ui`
**Dedup:** A5-06. Confirmed `:49-50` (TS18048 + TS2345 at `00-tsc.txt:38-40`). Malformed `dateStr`
yields `NaN` → "Invalid Date".
**Fix:** `const d = new Date(dateStr + 'T00:00:00');` (local-midnight parse, avoids the destructure and
the timezone shift), or guard `if (!year || !month || !day) return dateStr;` before constructing.

### S3-24 (P2) — profile per-render const allocations · `perf-render`
**Dedup:** A2-06. Confirmed `:637,660`. Move `THEME_DISPLAY_NAMES` and `REST_TIMER_PRESETS` to module
scope. Trivial, real micro-win on a very large screen.

### P3s (S3-25..S3-30) — concrete fixes
- **S3-25** `glossary.tsx:119-125`: change `idx > 0` → `idx >= 0`; deps `[initialTerm, filtered]`
  (`filtered` is already `useMemo`-stable).
- **S3-26** `group-detail.tsx`: replace the 5 hex literals with tokens — `#0080FF→accentDefault`,
  `#888888→textTertiary`, `#FF4444→statusError`, `#33333333→borderDefault` (+ alpha if needed).
- **S3-27** `group-detail.tsx:78`: `name.trim().charAt(0).toUpperCase()` (charAt never returns
  undefined). Clears TS2532.
- **S3-28** `groups.tsx:488-512`: either wire `_goal` through a follow-up `PUT /goals/weekly`, or remove
  the `GoalPicker` from both modals and add a "set your goal in Profile" note. (Product call — flag to
  founder; don't silently keep dead UI.)
- **S3-29** `RoutineStrip.tsx:126`: delete the unused `useRouter()` in `StripHeader`.
- **S3-30** `PressableCard.tsx`: add `accessibilityLabel?: string` to props and pass it through to
  `<Pressable>`.

---

## (d) Dropped / downgraded

| Original | Action | Reason |
|----------|--------|--------|
| **C-LOG-01** (PlateCalculator `onUseWeight` P0) | **Downgraded P0 → P3 (doc-only)** | Traced the full round-trip (stored kg → display → warm-up ladder → `setWeight` string → `displayToKg` in `handleStepperLogSet`). The prop is correctly typed `(displayWeight: number)` and every current caller passes display units; `persistPrefs` already calls `displayToKg`. **No current data corruption.** The auditor's own verdict was "currently safe / latent." Keep only as a JSDoc note that `onUseWeight` receives display units. |
| **C-LOG-04** (SetEntryForm edit-path weight P1) | **Downgraded P1 → P3 (doc-only)** | `SetEntryForm` is log-only (no `onUpdateSet`, no prefill); `buildLiftPayload` correctly `displayToKg(parseFloat(weight))`. No edit path exists ⇒ no conversion bug. (Its *safe-area* issue is the real finding — that's S3-04, kept.) Latent-only; document "log-only, never reuse for editing." |
| **C-LOG-06** (RoutineEditorSheet safe-area P1) | **Downgraded P1 → P3** | Verified `:171` already applies `paddingTop: Math.max(insets.top, 12)` to the header via the hook and `:304` insets the save bar. The `SafeAreaView edges=['top']` wrapper is redundant/possible-double-pad, **not a clip**. Cosmetic cleanup only. |
| **C-LOG-11** (ScheduleEditorSheet double-pad P2) | **Confirmed but kept P3** | Verified `:382` applies `paddingTop: Math.max(insets.top, 12)` AND wraps in `SafeAreaView edges=['top','bottom']` (`:380`) → genuinely *could* double-pad the top on some devices. Real but cosmetic; fold into the redundant-wrapper cleanup, not a clip bug. |
| **C-REST-08** (ReadinessCard AnimatedArc deps P2) | **Dropped (false positive)** | Confirmed the auditor's own retraction: `circumference` **is** in the deps array (`ReadinessCard.tsx:158`/`:203`), `animVal` is a stable ref, cleanup `removeListener` is correct. Not a bug. Correctly excluded. |

**Not re-counted (owned by other lanes / already-known baseline):** the expo-router typed-route TS2345
string-literal errors (`profile.tsx:1149/1166/1183/1388`, A2-08) are the known benign baseline — P3, no
action. `glossary.tsx:128` `SafeAreaView` at *screen* root (A2-07) is not inside a Modal ⇒ Invariant 3
does not apply; left as a P3 consistency nit.
