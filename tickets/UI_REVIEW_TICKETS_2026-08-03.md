# UI Review Tickets — 2026-08-03 v3 (verified against real repo `7faa0f33`)

**v3 note:** v1 was reviewed against the stale `command-center/peak-fettle` mirror. All claims below are RE-VERIFIED against `ArvinAvirah1/peak-fettle` @ `7faa0f33` (2026-08-04). 8 v1 tickets were already fixed in the real repo and are listed at the bottom as CLOSED. Line numbers are real-repo. Severity: P0 = data corruption or broken for a user class; P1 = visibly broken/stale; P2 = degraded; P3 = polish.

**Scope correction (v3):** the real repo HAS a watchOS companion (`mobile/targets/watch/` — SwiftUI app + WatchConnectivity) AND a rest-timer Live Activity (`mobile/targets/live-activity/`). The stale mirror lacked both. Deep review of both surfaces added as **WATCH-01…20** below; old UI-130 "no watch app" gap ticket is dead.

---

## OPEN — P0

### UI-103 · 1RM confirm sheet is kg-only
`app/(tabs)/rankings.tsx` — `formatKg` at :112, seed :143/:165, `parseFloat` treated as kg :181/:200, `<= 1000` cap :201, hardcoded "kg" label :265. lbs users must mentally convert or store wrong 1RM.
**Fix:** seed with `kgToInputValue`, parse with `parseWeightInput`, store via `displayToKg`, validate cap against kg post-conversion.

### UI-105 · RN-core `SafeAreaView` inside `<Modal>` — zero insets (Dynamic Island overlap)
Still all 3: `app/(tabs)/profile.tsx:39,819` (pageSheet), `src/components/SetEntryForm.tsx:26,409` (pageSheet), `src/components/TemplateDetailSheet.tsx:25,85`. None imports `react-native-safe-area-context`.
**Fix:** correct pattern now exists in-repo at `app/templates.tsx:952` — `paddingTop: Math.max(insets.top, 12)`.

---

## OPEN — P1

### UI-107 · exercise-library: exercise search/list still unguarded REST
Set-history path now correctly gated (`:614` `isLocalFirst` → localDb) — but raw `apiClient` remains at `:648`, `:1154`, `:1171` with no `isLocalFirst` branch and no bundled-catalog fallback. Fresh offline install dead-ends.
**Fix:** gate + bundled catalog fallback.

### UI-108 · Unguarded `getExercises()` in bundled-program start path
`app/(tabs)/index.tsx:761` — `buildLibraryNameIndex(await getExercises())`, catch → `libIndex = undefined` :762-764. Other paths in same file got `isLocalFirst` guards (:587, :611); this one missed. Free users silently lose exercise linkage.

### UI-109 · Widget timeline single-entry — stale after midnight
`targets/widget/index.swift:230` and `:800` — `Timeline(entries: [entry], policy: .after(nextMidnight()))`. WidgetKit may defer the reload.
**Fix:** emit 7 entries (now + next 7 local midnights).

### UI-110 · Widget `updatedAt` decoded, never used — no staleness guard
`index.swift:82` declared, zero references. Week-old stats render as current.
**Fix:** older than ~2 days → dim/"—".

### UI-111 · Widget payload never rewritten on app foreground
`src/services/widgetBridge.ts` — `refreshWidget` only at :441 (launch) and :456 (table change); no `AppState` listener.
**Fix:** listener → refresh on `active`/`background`.

### UI-113 · No iOS 18 tinted/accented widget handling
Zero `.widgetAccentable()` in `index.swift`; asset colors `$accent`/`$widgetBackground` (declared `expo-target.config.js`) never read from Swift.

### UI-114 · No explicit `SafeAreaProvider`
Zero hits; `app/_layout.tsx:407-417` mounts GestureHandlerRootView → ThemeProvider → AuthProvider → PowerSyncProvider only. **Fix:** wrap root.

### UI-115 · iOS 18 icon variants missing
`app.json:7` single `"icon"`; no `ios.icon: {light, dark, tinted}` — desaturated on iOS 18/26 dark/tinted home screens.

---

## OPEN — P2

### UI-106 (residual) · Hardcoded bottom paddings
Most sites now token-based. Remaining: `app/(tabs)/index.tsx:1578` (`paddingBottom: 40`), `app/templates.tsx:741,862,942` (`Platform.OS === 'ios' ? 40 : 24`). **Fix:** `Math.max(insets.bottom, spacing.s5)`.

### UI-117 · insights.tsx no error state
`app/insights.tsx:181` `.finally`-only; `Promise.all` :164-168 rejects unhandled. **Fix:** catch → error UI + retry.

### UI-118 · routine-history failures masquerade as empty
`app/routine-history.tsx:66-70` try/finally, no catch. **Fix:** catch → error UI.

### UI-119 (residual) · `group-detail.tsx:1131` FlatList no `ListEmptyComponent`
(workout-day no longer uses FlatList; templates/exercise-library/glossary now have one.)

### UI-120 · Widget `hasData` dead code
`index.swift:117` set at :160/:198, never read in views — corrupt JSON and fresh-install render identically. **Fix:** branch real empty state.

### UI-121 · UTC date keys for local-day windows — 8 files (wider than v1)
`src/hooks/useHealthMetrics.ts:81,169`, `app/data-export.tsx:186`, **plus** `src/hooks/useHealthDashboard.ts:141,262`, `src/hooks/useWatchMirror.ts:159`, `src/data/readinessSeries.ts:55`, `src/api/healthMetrics.ts:172`. West-of-UTC evening users shift a day.
**Fix:** local date-component keys — pattern in `CalendarHeatmap` / `backdate-workout.tsx` `toDayKey`.

### UI-122 · Widget PR count inflation
`widgetBridge.ts:149` — `>=` vs windowed best; repeats + pre-window history inflate. **Fix:** strict `>` vs all-time best.

### NEW-01 · health tab hardcodes bottom padding with `edges={[]}`
`app/(tabs)/health.tsx:364` + `:619-621` (`paddingBottom: 40`). Only thing keeping content off home indicator. **Fix:** `Math.max(insets.bottom, spacing.s8)`.

### NEW-02 · diagnostics.tsx bypasses ScreenLayout
`app/diagnostics.tsx:129-131` bare ScrollView, no safe-area wrapper, magic `48`. **Fix:** wrap in `ScreenLayout scrollable edges={['bottom']}` like `measurements.tsx:264`.

---

## OPEN — P3

### UI-125 · Icons frozen while labels scale
`src/components/Icon.tsx:48` `allowFontScaling={false}` — 17pt icons vs 53pt labels at AX5. **Fix:** clamp-scale via `PixelRatio.getFontScale()`.

### UI-127 · Module-scope `Dimensions.get` (+1 site)
`app/intro.tsx:21`, `app/exercise-library.tsx:113`, **plus** `src/components/tour/WelcomeTour.tsx:280`. **Fix:** `useWindowDimensions()`.

### UI-128 · Legacy `PanResponder` (+1 site)
`src/components/StepperLogger.tsx:34,1291`, **plus** `app/progress-photos.tsx:32,166` (before/after slider). **Fix:** RNGH `Gesture.Pan()`.

### UI-129 · Housekeeping (all still valid)
- `src/services/pushNotifications.ts:116` deprecated `shouldShowAlert` — remove.
- No privacy manifest anywhere (`privacyManifests`/`.xcprivacy`) — add app-level one (UserDefaults, file timestamps).
- `src/components/ExercisePicker.tsx:414` keyExtractor index fallback — stable id.
- Widget container `widgetURL` still bare `peak-fettle://` at `index.swift:565,661,738,864` (button-level deep links `start-workout`/`start-rest` exist at :372 — partly fixed).

### NEW-03 · paywall hardcoded `paddingTop: 24`
`app/paywall.tsx:434-436` — token consistency only (`spacing.s5`).

### NEW-04 · diagnostics untranslated strings
`app/diagnostics.tsx:134-136` raw English ('Refresh'/'Share report'/'Clear') vs `t(...)` everywhere else. If dev-only, comment it.

### NEW-05 · measurements length unit derived from weight pref, not persisted
`app/measurements.tsx:168-169` — lbs user wanting cm re-toggles every mount. **Fix:** persist `length_pref`, seed from it.

### UI-123 (residual) · numberOfLines — spot-check only
Now present in 42 files (v1 claim dead). Spot-check remaining dense rows (SetEntryForm, WorkoutLoggerHost, ExercisePicker) before closing.

---

## WATCH + LIVE ACTIVITY (new in v3 — real repo has both targets)

Files: `targets/watch/{PeakFettleWatchApp,WatchSessionManager,TodayView}.swift`, `targets/live-activity/{RestTimerLiveActivity,AppIntents}.swift`, `modules/watch-connectivity/ios/WatchConnectivityModule.swift`, `modules/live-activity/ios/LiveActivityModule.swift`, `src/hooks/{useWatchMirror,watchMirrorPayload,useRestTimer}.ts`, `src/native/{watchBridge,liveActivity}.ts`.

### WATCH-01 (P0) · Live Activity CRASHES when timer expires in background
`RestTimerLiveActivity.swift:83,159,201` build `Date.now...state.endDate` — `ClosedRange` traps when `endDate < now`. Happens whenever countdown hits 0 while app backgrounded (JS interval suspended; `useRestTimer.ts:334-353` only ends the activity on a live JS tick).
**Fix:** `let lo = min(Date.now, state.endDate)`, render `lo...state.endDate`; early-return "complete" branch when `endDate <= .now`.

### WATCH-02 (P0) · Watch asset color names wrong — all accents/backgrounds resolve to nothing
Assets are `$accent.colorset`/`$watchBackground.colorset` but `TodayView.swift:21,57,58,106,113,148` use `Color("accent")`/`Color("watchBackground")` (no `$`). Live-activity target does it right (`RestTimerLiveActivity.swift:56-57`).
**Fix:** add `$` prefix.

### WATCH-03 (P1) · "Done" detection broken (case + null-id rows)
`useWatchMirror.ts:116` keys map by `exercise_id.trim()` (case kept) but lookup at :130 lowercases; :117 drops null-`exercise_id` rows so name fallback :163 never matches.
**Fix:** lowercase at insert; name fallback for null ids.

### WATCH-04 (P1) · UTC day key on watch mirror
`useWatchMirror.ts:159` `toISOString().slice(0,10)` vs app-standard local `toDateKey()` (`src/utils/dateHelpers.ts:110`). (Same family as UI-121.)

### WATCH-05 (P1) · No `user_id` scoping in watch mirror query
`useWatchMirror.ts:105` selects `workouts` by `day_key`+`session_type` only — cross-account leakage on shared devices. **Fix:** scope by `user_id` like `localWorkouts.ts`.

### WATCH-06 (P1) · Tomorrow's split rendered as "Today"
`resolveNextUp` can return future slots; `assembleWatchMirrorInput` shows them under hardcoded "Today" + today's progress. **Fix:** `today: null` unless `whenLabel === 'Today'`.

### WATCH-07 (P1) · Watch weight ignores exact-entry invariant
`useWatchMirror.ts:110` hardcodes `weight_raw / 8.0`, never reads `weight_centi`/`weight_unit` — lbs drift artifacts. **Fix:** `formatWeightEntry` per `units.ts`.

### WATCH-08 (P1) · Early pushes silently dropped before session activation
`WatchConnectivityModule.swift:56` returns when not `.activated`; JS pushes once, never retries. **Fix:** cache last payload, flush in `activationDidCompleteWith`.

### WATCH-09 (P2) · Watch-first launch gets no data
`WatchSessionManager.swift:117` gates `requestRefresh()` on `isReachable` (false when phone app not running). **Fix:** `transferUserInfo` (queued).

### WATCH-10 (P2) · No staleness/midnight-rollover UI on watch
`generatedAt` decoded (`WatchSessionManager.swift:43`) never rendered; dot at `TodayView.swift:53` is reachability-only. **Fix:** "data from <date>" banner when day ≠ today.

### WATCH-11 (P2) · Watch mirror never re-pushes on sign-out/user switch
`useWatchMirror.ts:250` effect deps `[]` — previous user's workout stays on watch.

### WATCH-12 (P2) · Pending lock-screen action replayed without freshness check
`liveActivity.ts:240` — hours-old `add15`/`skip` tap restarts/kills current rest. **Fix:** discard `ts` older than ~2 min.

### WATCH-13 (P2) · Finished Live Activity lingers up to 4h
`LiveActivityModule.swift:157` `dismissalPolicy: .default`. **Fix:** `.after(+30s)`.

### WATCH-14 (P2) · `staleDate` set but `context.isStale` never handled
`LiveActivityModule.swift:122,143` — stale activity looks live.

### WATCH-15 (P2) · Watch Info.plist empty dict
`targets/watch/Info.plist` — verify plugin injects `WKApplication`/`WKCompanionAppBundleIdentifier`; missing → install fails.

### WATCH-16 (P2) · No Dynamic Type on watch
`TodayView.swift:97-113` fixed `.system(size:)` throughout. **Fix:** semantic fonts + `minimumScaleFactor`.

### WATCH-17 (P3) · No crown, haptics, complication/Smart Stack, always-on treatment
No `WKInterfaceDevice.play`, no watch WidgetKit target, no `.privacySensitive`/luminance handling.

### WATCH-18 (P3) · Watch set logging doesn't exist yet (Stage A)
No watch→SQLite write path; `watchBridge.ts:26` documents `transferUserInfo` unused. (Roadmap item, not bug.)

### WATCH-19 (P3) · iOS 16 Live Activity buttons: empty HStack
`RestTimerLiveActivity.swift:16-22` comment claims non-interactive buttons on 16.x, but `#available(17)` guard :111 renders nothing — empty row.

### WATCH-20 (P3) · Orphaned activity Skip kills current timer
`activityId` round-trips to JS but `useRestTimer.ts:382-385` ignores it. **Fix:** match id before acting.

---

## CLOSED (already fixed in real repo — no action)

- **UI-101** goal save converts (`exercise-library.tsx:576-581`, seed :1008)
- **UI-102** goal render uses `formatWeight` (:993)
- **UI-104** inline ×2.20462 gone (only `KG_TO_LBS` const in units.ts)
- **UI-112** accessory background correct (`AccessoryWidgetBackground()` :635,716; `.clear` :249)
- **UI-116** workout-day paddings tokenized/ScreenLayout
- **UI-124** PressableCard has `accessibilityRole="button"` (:91)
- **UI-126** widget `minimumScaleFactor` + `lineLimit` throughout

---

## Suggested execution order

1. **Batch A (P0):** UI-103, UI-105, WATCH-01 (crash), WATCH-02 — small, disjoint.
2. **Batch B (P1):** UI-107/108 (local-first), UI-109/110/111/113 (widget), UI-114/115, WATCH-03…08.
3. **Batch C (P2/P3):** rest (incl. WATCH-09…20, NEW-01…05).

DoD per batch: `peak-fettle-verify` parse-sweep + `tsc --noEmit` delta; push (EAS builds from `origin/main`).
