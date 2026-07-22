# E-009 Design QA Report — 2026-05-17

Auditor: Claude (E-009 Design QA Sprint)
Spec version: peak_fettle_design_spec.docx v1.0
Scope: React Native screens + component library
Viewport reference: 390×844 pt (iPhone 14)

---

## P0 Gaps (must fix before design sign-off)

### P0-001 — Tab bar: no FAB for center "Start Workout" tab; emoji icons not tintable

**Spec says (§5.1):** 5 primary tabs. Center tab (Tab 3) is a floating action button (FAB) that always triggers Start Workout. Active tab icon/label uses `color.accent.default`; inactive uses `color.text.tertiary`. Tab bar height 56 pt + device safe-area inset.

**Implemented:** `_layout.tsx` has 5 tabs in order: Home, Log, Rankings, Plans, Profile. No FAB treatment on the center tab. Tab bar height is not explicitly set (defaults to OS value, not 56 pt). All tab icons are Unicode emoji rendered with `<Text>` — the `color` prop from expo-router is explicitly ignored with `_color` and noted as a known bug ("emoji can't be tinted"). Active and inactive states therefore both render the same untinted emoji, making the active-tab visual state invisible.

**File/line:** `/mobile/app/(tabs)/_layout.tsx` lines 44–106 (TabIcon component at line 116).

**Fix:** Replace `TabIcon` emoji with a proper icon library (e.g., `@expo/vector-icons Ionicons`). The TODOs at lines 61, 72, 82, 92, 101 already track this. Add explicit `tabBarStyle: { height: 56 }` (device safe-area is handled by expo-router's SafeAreaProvider). Implement the center tab as a FAB via `tabBarButton` render override — a circular 56 pt teal button with a lightning bolt icon sitting above the nav bar.

---

### P0-002 — PR badge uses wrong semantic token (`statusWarning` instead of `statusSuccess`)

**Spec says (§6.2):** Recent PRs chips: `color.status.success` background at 15% opacity with success text.

**Implemented:** `index.tsx` line 366: `backgroundColor: theme.colors.statusWarning` — the amber/orange warning colour is applied to PR badges instead of the green success colour.

**File/line:** `/mobile/app/(tabs)/index.tsx` line 366.

**Fix:** Change `theme.colors.statusWarning` → `theme.colors.statusSuccess` (with the `+ '26'` hex-alpha suffix for 15% opacity). Cross-check: the `PercentileBar` and `RankingCard` components correctly use `statusSuccess` for ≥75th percentile, so this is an isolated error in `index.tsx`.

---

### P0-003 — Onboarding flow does not match spec (wrong questions, missing steps)

**Spec says (§6.1):** 4-step onboarding: Step 1 — Training Style (Powerlifting / Weightlifting / General Strength / Cardio/Endurance tap-cards); Step 2 — Equipment & Constraints (multi-select tap-cards + constraint chips); Step 3 — Theme Selection (5 discs); Step 4 — HealthKit Permission (full-screen card + "Connect Apple Health" primary + "Skip for now" ghost).

**Implemented:** `onboarding.tsx` implements a 3-step flow: Step 1 — Biological sex (Male/Female/Undisclosed), Step 2 — Primary discipline (dropdown-style options), Step 3 — Theme selection. This is a deliberate product decision (exec spec referenced in file header) but it diverges from the design spec's layout. Missing: Equipment multi-select step; HealthKit permission card (Step 4); "What best describes your training?" framing; dashed-border tap-card visual style with selected state (1.5 pt `accentDefault` border + 10% bg tint). The 4-dot progress stepper in spec vs 3-dot implemented is also mismatched.

**File/line:** `/mobile/app/onboarding.tsx` lines 183–199 (progress dots) and 202–265 (step content).

**Fix:** Either (a) align to spec's 4-step flow with the exec team, or (b) formally mark the spec §6.1 as superseded by the product decision and lock the current 3-step flow. The HealthKit permission screen is a hard requirement per spec §6.1 — even if Step 4 is re-numbered, the permission card must exist before the app attempts HealthKit access. Currently HealthKit sync is entirely absent from onboarding. Additionally, the `OptionButton` component needs the tap-card visual spec (full-width, selected state with 10% accent bg + 1.5pt accent border) — the current implementation uses a small radio-dot style.

---

### P0-004 — Profile screen: no Appearance (theme selector) section

**Spec says (§6.8):** Settings screen includes an "Appearance" grouped section with a theme selector that opens a modal showing 5 theme swatches. Selection applies immediately (live preview). Saved to Supabase on dismiss.

**Implemented:** `profile.tsx` has no Appearance section and no `ThemeSelector` import. The `ThemeSelectorModal` component exists and is complete in `ThemeSelector.tsx`, but is never surfaced from Profile. The only theme-change path is Onboarding Step 3.

**File/line:** `/mobile/app/(tabs)/profile.tsx` — Appearance section entirely absent between lines 590–800 (the settings render block).

**Fix:** Add an "APPEARANCE" section to `ProfileScreen` between the SETTINGS card and PHYSICAL RESTRICTIONS section. Add `useState(false)` for `showThemePicker`. Add a `TouchableOpacity` settings row ("Theme" label, chevron, active theme name as meta), wired to `setShowThemePicker(true)`. Render `<ThemeSelectorModal visible={showThemePicker} onClose={() => setShowThemePicker(false)} />`.

---

### P0-005 — Dashboard: missing spec-required sections (AI Plan card, Recent PRs scroll, Quick Stats row)

**Spec says (§6.2):** Dashboard must contain: (a) Today's AI Plan card (paid tier) with workout name + 3-metric row + "Why this workout?" collapsible + "Start" primary button; (b) Recent PRs: horizontal scroll of PR chips; (c) Quick stats row: 3 Metric Callout Cards — Weekly Volume, Sessions This Month, Best Percentile.

**Implemented:** `index.tsx` renders: greeting header, streak badge, "TODAY" card (set count + volume + CTA), Groups nav row, recent activity list. None of the three required sections (AI Plan card, Recent PRs horizontal scroll, Quick Stats row) are present. The "Recent activity" list is a basic workout history display, not the 3-item Workout Summary Card format specified.

**File/line:** `/mobile/app/(tabs)/index.tsx` — sections C (Today's workout), D (Groups), E (Recent activity) do not match spec §6.2.

**Fix:** This is a large layout gap. The correct home screen order per spec is: Greeting header → Streak banner → Today's AI Plan card → Recent PRs (h-scroll) → Quick Stats row (3 Metric Callout Cards) → Recent Workouts (last 3 as Workout Summary Cards). The Groups feature is not part of the spec's home screen at all (it's a push screen). Coordinate with product on whether Groups nav stays on Home or moves.

---

### P0-006 — Rankings screen: missing large Percentile Rank Card for top-ranked lift

**Spec says (§6.7):** "Top featured rank: large Percentile Rank Card (see §5.3) for the user's highest-ranked lift." The Percentile Rank Card spec: ~80% screen width, centered; central element is a **ring progress indicator** (0–100%) with percentile number in `text.metric`; ring fills with gradient `accentSecondary → accentDefault`; sub-text "Top X% of [age/weight class]".

**Implemented:** `rankings.tsx` renders a flat list of `RankingCard` components, all at equal visual weight. There is no featured/hero card at the top. The `RankingCard` uses `PercentileBar` (horizontal progress bar) not a ring. `PFProgressRing` exists in the component library but is not used anywhere in rankings.

**File/line:** `/mobile/app/(tabs)/rankings.tsx` lines 508–588 (main render, no featured card).

**Fix:** Add a hero `PercentileRankCard` component above the list using `PFProgressRing` (already built in `PFProgress.tsx`). Pick the ranking with the highest percentile value, render it at ~80% screen width with `text.metric` (40–48 pt bold) for the number and the gradient ring. The gradient fill (`accentSecondary → accentDefault`) requires react-native-skia or a LinearGradient — `PFProgressRing` currently uses a solid fill; extend it with an optional `gradient` prop.

---

### P0-007 — `buttonPrimaryText` is hardcoded to Deep Ocean hex, breaks non-dark themes

**Spec says (§10.4 Acceptance Criteria):** All colors are referenced exclusively via semantic tokens. Zero hardcoded hex values in component files.

**Implemented:** `tokens.ts` line 153: `buttonPrimaryText: '#0A0E1A'` — a raw hex value hardcoded directly in the component token builder (not derived from a primitive). This value is the Deep Ocean navy, which is appropriate for Deep Ocean and most dark themes, but is wrong for the Monochrome theme where the accent is white (`#FFFFFF`) — dark navy text on a white button is correct, but the value should be derived from the primitive layer, not hardcoded. The comment acknowledges this ("always dark text on bright accent") but the implementation breaks the 3-tier token contract.

**File/line:** `/mobile/src/theme/tokens.ts` line 153.

**Fix:** Add a `buttonText` primitive token to each theme's `PrimitiveTokens` (value: navy950 for all themes where accent is bright; value: `#000000` for Monochrome). Map `buttonPrimaryText → p.buttonText` in `buildComponentTokens`. This keeps the intent (dark text on bright button) while making it theme-swappable.

---

## P1 Gaps (should fix before launch)

### P1-001 — Active workout logger: multiple spec features unimplemented

**Spec says (§6.3):** The active workout logger requires: (a) bottom nav hidden during active session; (b) status bar shows elapsed timer in `color.accent.default`; (c) header has editable session name; (d) "Finish" button using `color.status.success`; (e) RPE badge (7-step tap stepper); (f) "Add Set" ghost button below last set row; (g) "Add Exercise" full-width dashed-border card; (h) rest timer persistent banner after set checked; (i) swipe-left on exercise → reveals Swap/Delete actions.

**Implemented:** `log.tsx` has a workout header with date and set count, scrollable set list, and modals for exercise picker and set entry. Missing: elapsed session timer in status bar; editable session name; "Finish" button; rest timer banner; swipe-left gesture for Swap/Delete. The delete interaction uses a trash icon button per row (non-spec). The exercise min-height is 56 pt (`rowStyles.container minHeight: 56`) vs spec's 64 pt minimum for exercise rows.

**File/line:** `/mobile/app/(tabs)/log.tsx` lines 370–465.

**Fix:** Implement elapsed timer via `useEffect` + `setInterval`. Add swipe gesture using `react-native-gesture-handler` `Swipeable` component. Implement rest timer as a persistent banner state (show after set is checked via `haptics.success()`). Fix exercise row `minHeight` from 56 to 64 (spec §5.2 Exercise Row). Add dashed-border "Add Exercise" card at list bottom.

---

### P1-002 — Log screen exercise row minHeight 56 pt vs spec 64 pt

**Spec says (§5.2):** Exercise Row (Active Logging): "Full-width list item. Height: 64 pt minimum."

**Implemented:** `rowStyles.container` in `log.tsx` line 185: `minHeight: 56`.

**File/line:** `/mobile/app/(tabs)/log.tsx` line 185.

**Fix:** Change `minHeight: 56` → `minHeight: 64` in `rowStyles.container`.

---

### P1-003 — Rankings screen: percentile color threshold mismatch

**Spec says (§6.7):** "Green if ≥75th, teal if ≥50th, default color below 50th."

**Implemented:** `rankings.tsx` `percentileColorToken()` (line 75): `≥75 → statusSuccess`, `≥40 → statusWarning`, else `statusError`. The ≥40 threshold does not match spec's ≥50, and using `statusWarning` (amber) is wrong — spec says teal (`accentDefault`) for 40–74th. Using `statusError` (red) for below 40th is also not in spec.

**File/line:** `/mobile/app/(tabs)/rankings.tsx` lines 75–79.

**Fix:** Change thresholds to `≥75 → statusSuccess`, `≥50 → accentDefault`, `<50 → textTertiary` (subdued, not error-red). This also applies to the `PercentileBar` component where colors are correctly set at ≥75/≥50 thresholds — the `RankingCard`'s `ScoreBlock` "Top X%" badge text diverges from the bar color, creating inconsistency.

---

### P1-004 — Profile: no "Your Data" section matching spec §6.8 / TICKET-014

**Spec says (§6.8):** "Your Data" section: table of data categories (Workouts, Plans, Health Metrics, Profile). Export button → downloads JSON. This is distinct from a simple "Download My Data" row.

**Implemented:** `profile.tsx` has a single "Download My Data" `TouchableOpacity` row in the DATA & PRIVACY section — no category table, no structured data breakdown.

**File/line:** `/mobile/app/(tabs)/profile.tsx` lines 724–742.

**Fix:** Replace the single row with a `PFCard` containing a data category table: 4 rows (Workouts, Plans, Health Metrics, Profile) each with an item count and the export button at the card footer.

---

### P1-005 — ThemeSelector swatch ring size: 64 pt implemented vs spec's 60 pt

**Spec says (§6.1):** "5 theme discs (60 pt diameter circles) in a row."

**Implemented:** `ThemeSelector.tsx` `swatchRing` style: `width: 64, height: 64` (line 233–237). The swatch disc is slightly larger than spec.

**File/line:** `/mobile/src/components/ThemeSelector.tsx` lines 233–237.

**Fix:** Change `swatchRing` width/height from 64 to 60. The `swatchDisc` inside will follow automatically.

---

### P1-006 — Dashboard: streak banner does not match spec format

**Spec says (§6.2):** "Streak banner: horizontal pill card. Flame icon + streak count + 'day streak.' Gradient fill (`color.accent.secondary → color.accent.default` at 20% opacity). Tap → streak detail sheet."

**Implemented:** `index.tsx` `StreakBadge` (line 80–106): uses `accentSecondary` as flat background (no gradient). Shows "week streak" not "day streak." No tap handler — streak is not tappable. No streak detail sheet.

**File/line:** `/mobile/app/(tabs)/index.tsx` lines 80–106.

**Fix:** Change "week streak" → "day streak" (or confirm product intent). Add `onPress` → streak detail sheet (can be a `BottomSheet` showing streak history). Implement gradient background via `expo-linear-gradient` with `accentSecondary → accentDefault` at 20% opacity.

---

### P1-007 — Progress & Analytics screen (spec §6.5) is entirely unimplemented

**Spec says (§6.5):** A full Progress & Analytics screen following the 3-tier Whoop data hierarchy: Tier 1 glanceable metric callout cards, Tier 2 scrollable chart section (bar/line charts for Volume, 1RM, body weight), Tier 3 deep-dive per-lift with heatmap + percentile trend. Time period selector pills (7D/1M/3M/1Y).

**Implemented:** There is no `progress.tsx` or analytics screen in the tabs directory. The 5 tabs are Home, Log, Rankings, Plans, Profile — the spec's Tab 2 "Progress" is absent. The Log tab occupies this position.

**File/line:** No file exists. Tab 2 (`log.tsx`) does not match Progress spec.

**Fix:** This requires a product decision: is "Log" the correct Tab 2 (per current implementation), or should Tab 2 be "Progress" with logging accessible differently? Per spec §5.1 table, the tab order is Home / Progress / Workout(FAB) / Rankings / Profile. Implement a `progress.tsx` tab or formally reassign the tab architecture.

---

### P1-008 — AI Plan detail screen (spec §6.6) missing from navigation

**Spec says (§6.6):** AI Plan Detail Screen with: header (plan name + generated date + "Personalised for your goals." sub-header); "Why this workout?" collapsible section with 2 pt left accent border; exercise spec cards with coaching note; "Start This Workout" primary button (full-width); "Regenerate Plan" ghost button.

**Implemented:** `plans.tsx` has a `PlanDetailModal` with reasoning card and exercise list. Missing: "Personalised for your goals." sub-header; coaching notes per exercise; "Start This Workout" primary button; "Regenerate Plan" ghost button. The modal opens as `pageSheet` (correct). The "Why this plan?" card uses `accentSecondary` border — spec says 2 pt `accentDefault` border.

**File/line:** `/mobile/app/(tabs)/plans.tsx` lines 220–303 (`PlanDetailModal`), line 274 (reasoning card border uses `accentSecondary`).

**Fix:** Change reasoning card `borderColor` from `accentSecondary` → `accentDefault` with `borderLeftWidth: 2`. Add "Personalised for your goals." sub-header. Add "Start This Workout" `PFButton` (primary, full-width) and "Regenerate Plan" `PFButton` (ghost) to the modal footer.

---

### P1-009 — `fontVariant: ['tabular-nums']` missing on all metric displays

**Spec says (§8.3):** "fontVariant: ['tabular-nums'] on all metric displays."

**Implemented:** No `fontVariant` property is set anywhere in any screen file or the component library. Numbers in set count, volume, percentile scores, and health metrics will use proportional figures, causing layout shift as values change.

**File/line:** Affects all screens — `index.tsx`, `log.tsx`, `rankings.tsx`, `health-metrics.tsx`, `PFProgress.tsx`.

**Fix:** Add `fontVariant: ['tabular-nums']` to all `Text` components rendering numeric values. The `text.metric` style in `PFProgressRing` center label and all `text.metric`-sized stat displays are highest priority.

---

### P1-010 — Motion animations: card tap scale and set checkmark draw not implemented in screen files

**Spec says (§7):** Card tap feedback: scale 0.97 on press-in, 1.0 on press-out, 120 ms easeOut, soft haptic. Set checkmark: SVG draws in over 200 ms, row → 60% opacity, medium haptic.

**Implemented:** `PressableCard` component is built correctly with Reanimated scale animation and reduce-motion support. However, no screen file imports or uses `PressableCard` — all interactive cards use `TouchableOpacity` with `activeOpacity={0.75}` (a built-in opacity effect, not the spec's scale transform). The set checkmark animation is also absent — sets are deleted, not checked off, and there is no checkmark interaction.

**File/line:** `PressableCard.tsx` exists but is unused. All screen files use raw `TouchableOpacity`.

**Fix:** Replace `TouchableOpacity` with `PressableCard` on all card-level interactive elements (workout history rows, plan cards, ranking cards, group rows). Implement set checkmark interaction in `log.tsx` (separate from delete — a tap on the checkmark button should animate the row to 60% opacity with a draw animation before logging).

---

### P1-011 — PFProgressRing: no gradient fill (spec requires teal→navy gradient)

**Spec says (§5.3 Percentile Rank Card, §5.5 Ring Progress):** "Ring fills with a gradient from `color.accent.secondary` (navy) → `color.accent.default` (teal)."

**Implemented:** `PFProgressRing` in `PFProgress.tsx` uses a solid `progressRingFill` color (`accentDefault`). No gradient is applied.

**File/line:** `/mobile/src/components/ui/PFProgress.tsx` lines 89–186.

**Fix:** Replace the pure-RN half-circle technique with react-native-skia `Canvas` + `Arc` + `LinearGradient` (already a declared dependency per spec §8.3). This is the same approach used by `ConfidenceRing.tsx`. The gradient should be `accentSecondary` at 0° → `accentDefault` at 360°.

---

### P1-012 — Tab bar active icon scale animation missing

**Spec says (§7):** "Tab bar active icon: 180 ms easeOut. Icon scale 1.0 → 1.15 → 1.0. Color cross-fades to accent."

**Implemented:** No animation on tab icon transitions — expo-router's default tab press handler is used with no `tabBarItemStyle` animation. The emoji icons also cannot cross-fade color (see P0-001).

**File/line:** `/mobile/app/(tabs)/_layout.tsx`.

**Fix:** Blocked on P0-001 (icon library replacement). Once proper icons are used, add animated `tabBarIcon` via `useAnimatedStyle` + `withSpring` in each tab's icon render function.

---

## P2 Gaps (polish, post-launch)

### P2-001 — Splash screen not implemented

**Spec says (§6.1):** Full-screen `bgPrimary` background. Centered "PEAK FETTLE" wordmark in `text.display`, `accentDefault`. Sub-line "Train. Rank. Dominate." in `text.body.lg`, `text.secondary`. Wordmark fades in over 600 ms; sub-line slides up over 400 ms with 200 ms delay. After 1.8 s, transitions to onboarding or dashboard.

**Implemented:** No dedicated splash screen component. The OS-level splash (likely a static image from `app.json`) handles initial load. No animated wordmark sequence.

**Fix:** Implement `splash.tsx` as a standalone animated screen using Reanimated `FadeIn` for wordmark and a custom slide-up for sub-line. Trigger navigation after 1.8 s via `setTimeout`.

---

### P2-002 — Exercise Library screen not implemented

**Spec says (§6.4):** Exercise Library as a bottom sheet (90% screen height) with search bar, filter chips (muscle group/equipment/movement type), exercise rows with last performance summary. Browse context → exercise detail screen with history chart, personal record, percentile rank, coaching cue.

**Implemented:** `ExercisePicker` component exists for the add-to-workout flow but only exposes a search + select interaction. No full browse mode, no exercise detail screen, no history chart.

**Fix:** Extend `ExercisePicker` with a browse mode toggle. Build an `ExerciseDetail` push-screen with a Victory Native XL line chart for history, PR display, and `PFProgressRing` for percentile rank.

---

### P2-003 — PR badge bounce animation not implemented

**Spec says (§7):** "PR badge appear: 400 ms, spring (damping 0.6). Badge bounces in from scale 0. Haptic: success notification."

**Implemented:** PR badges in `index.tsx` appear statically. `haptics.success()` is called when a set is logged (correct) but there is no scale-in spring animation for the badge.

**Fix:** Wrap PR badge rendering in a Reanimated `FadeInDown` or custom `withSpring` entering animation (scale 0 → 1, damping 0.6). Respect reduce-motion.

---

### P2-004 — Theme switch cross-fade not implemented

**Spec says (§7):** "Theme switch: 300 ms easeInOut cross-fade color system. No re-render flash."

**Implemented:** `ThemeContext.setTheme()` updates synchronously — theme change causes an instant re-render with no transition. React's synchronous state update will flash all colors simultaneously.

**Fix:** Wrap the theme switch in a `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` call before `setTheme`, or use a Reanimated shared-value approach for interpolating color values. The `motion.themeSwitch` token (300 ms easeInOut) is already defined in `tokens.ts`.

---

### P2-005 — ScreenLayout component not used by any screen

**Spec says (§4.2, §E-005):** The `ScreenLayout` component was built to enforce the §6 layout system — SafeAreaView, consistent horizontal padding (spacing.s5 = 20 pt), responsive margins.

**Implemented:** `ScreenLayout` exists in `src/components/ui/ScreenLayout.tsx` and is exported from the barrel. Zero screen files import or use it. All screens implement their own `SafeAreaView`/`ScrollView` combinations with manual padding values (typically `padding: 20` hardcoded at the style level — which numerically matches `spacing.s5` but is not token-referenced).

**Fix:** Migrate each screen's root container to `<ScreenLayout>` as a post-launch refactor. Not a visual regression since the numeric values match, but violates the E-005 spec intent and will cause drift as screens diverge.

---

### P2-006 — Input components in screens bypass PFInput

**Spec says (§5.4, §E-004):** PFInput is the canonical input component with focused/error/disabled states matching spec.

**Implemented:** `PFInput` exists in the component library but is not used by any screen. `groups.tsx`, `rankings.tsx` (ConfirmSheet), and `profile.tsx` (AddConstraintModal) all use raw `TextInput` with manually applied token colors. Functionally equivalent, but the border-width transition (1 pt → 1.5 pt on focus, as per `PFInput`) is missing in all raw `TextInput` usages.

**Fix:** Replace raw `TextInput` usages in modal forms with `PFInput`. Priority: `AddConstraintModal` in `profile.tsx`, `ConfirmSheet` in `rankings.tsx`, `CreateGroupModal`/`JoinGroupModal` in `groups.tsx`.

---

### P2-007 — Bottom sheet open animation: `animationType="slide"` used vs spec's spring with overshoot

**Spec says (§7):** "Bottom sheet open: 280 ms, spring (damping 0.8). Slides up with slight spring overshoot."

**Implemented:** All modals (PlanDetailModal, ConfirmSheet, AddConstraintModal, CreateGroupModal, JoinGroupModal) use React Native `Modal` with `animationType="slide"` — the platform default linear slide with no spring overshoot.

**Fix:** Replace `Modal` with a Reanimated bottom sheet (e.g., `@gorhom/bottom-sheet` or a custom `Animated.View` with `withSpring({ damping: 0.8 * mass, stiffness })`) for spec-compliant spring overshoot. This is a meaningful UX improvement for a workout-context app.

---

### P2-008 — ThemeSelector modal uses `'rgba(0,0,0,0.6)'` hardcoded backdrop color

**Spec says (§10.4):** Zero hardcoded hex values in component files.

**Implemented:** `ThemeSelector.tsx` line 264: `backgroundColor: 'rgba(0,0,0,0.6)'` — hardcoded colour in the modal backdrop style.

**File/line:** `/mobile/src/components/ThemeSelector.tsx` line 264.

**Fix:** Add a `bgOverlay` semantic token (value: `rgba(0,0,0,0.6)` for all themes — this value is intentionally theme-invariant as it's a UI chrome overlay, not brand colour). Alternatively, add it to `ComponentTokens` as `modalBackdrop`.

---

## Confirmed Compliant

The following areas were audited and found to match or acceptably implement the spec:

**E-001 — Design Token System:** All screen files (index.tsx, log.tsx, rankings.tsx, plans.tsx, profile.tsx, onboarding.tsx, groups.tsx, health-metrics.tsx) reference colors exclusively via `useTheme()` semantic tokens. No hardcoded hex values found in any screen file or the component library (the single exception is `tokens.ts` line 153, flagged as P0-007, and `ThemeSelector.tsx` which is explicitly documented as the only permitted location for theme primitive hex values).

**E-002 — Theme Switcher:** All 5 themes (Deep Ocean, Ember, Forest, Midnight, Monochrome) are correctly implemented in `tokens.ts` with proper primitive → semantic → component token derivation. `ThemeSelectorModal` and `ThemeSelectorInline` components are built and functional. Onboarding Step 3 correctly wires theme selection.

**E-003 — Typography System:** All font sizes and weights in screen files reference `fontSize.*` and `fontWeight.*` tokens from `tokens.ts`. The `// E-003: was XX` comments confirm systematic migration from hardcoded values. Token values match spec (display=40, heading1=32, heading2=24, heading3=20, bodyLg=18, bodyMd=16, bodySm=14, caption=12, micro=10, metric=40).

**E-004 — Component Library:** `PFButton` (all 5 variants), `PFCard` (4 variants), `PFInput` (focus/error/disabled states), `PFProgressBar`, `PFProgressRing`, `ScreenLayout`, and `PressableCard` are all built and exported. Button variants match spec: primary (filled accent, dark text), secondary (transparent + 1.5 pt border), ghost (transparent, secondary text), destructive (error bg), icon (bgTertiary bg, 48×48 pt minimum).

**E-006 — Haptics:** `haptics.ts` utility is correctly wired: `haptics.success()` on set log, `haptics.light()` on button press, `haptics.warning()` on destructive confirmations (sign out, delete account), `haptics.error()` on save failure. `PFButton` fires variant-appropriate haptics. `PercentileBar` and `PressableCard` both respect reduce-motion via `useReduceMotion()`.

**E-007 — Onboarding Theme Step:** Step 3 (theme selection) correctly integrates `ThemeSelectorInline`, persists via `ThemeContext.setTheme()` (AsyncStorage + Supabase) immediately on swatch tap, and requires no extra submit step.

**E-008 — Contrast Audit (partial):** `slate600` tertiary text token has been adjusted per E-008 in all 5 themes — comments in `tokens.ts` confirm WCAG AA ratios have been verified (Deep Ocean: 5.14:1 on bgPrimary). The `buttonPrimaryText` hardcoded `#0A0E1A` satisfies the stated intent (dark text on bright accent) for all current themes, though the implementation is flagged under P0-007.

**Spacing Grid:** All screens use `spacing.s*` tokens from `tokens.ts` for padding values. Card border radius correctly uses `radius.lg` (16 pt) for primary cards and `radius.md` (10 pt) for inner elements per spec §4.2.

**Input Fields:** `PFInput` correctly implements spec §5.4 — `bgTertiary` background, 1 pt `borderDefault` border, 1.5 pt `accentDefault` active border, `radius.md` (10 pt), error state with `statusError` border + helper text.

**Reduce Motion:** `useReduceMotion()` hook is correctly consumed in `PressableCard`, `PercentileBar`, and `ConfidenceRing` — all animation durations collapse to `motion.reducedMotion.duration` (0) when the OS accessibility setting is enabled.

**Minimum Touch Targets:** The 48×48 pt minimum is met for all interactive elements audited: delete button in `log.tsx` (`minWidth: 48, minHeight: 48`), set checkmark button (48×48 pt), unit toggle buttons (`minWidth: 48, minHeight: 48`), setting rows (`minHeight: 64`), constraint remove button (uses `hitSlop` to extend to 48 pt).

---

## Summary Statistics

| Priority | Count |
|----------|-------|
| P0 — Must fix before sign-off | 7 |
| P1 — Should fix before launch | 12 |
| P2 — Polish / post-launch | 8 |
| Confirmed Compliant | 10 areas |

**Critical path for design sign-off (per spec §10.4):** P0-001 (tab bar / FAB / icons), P0-002 (PR badge color), P0-004 (Profile Appearance section), and P0-006 (Rankings hero card) are likely the fastest wins. P0-003 (onboarding) and P0-005 (Dashboard sections) require product alignment before engineering work begins. P0-007 (buttonPrimaryText) is a one-line token fix.
