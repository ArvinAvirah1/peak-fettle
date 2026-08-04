# UI Review Tickets — 2026-08-03 v3 (verified against real repo `7faa0f33`)

**v3 note:** v1 was reviewed against the stale `command-center/peak-fettle` mirror. All claims below are RE-VERIFIED against `ArvinAvirah1/peak-fettle` @ `7faa0f33` (2026-08-04). 8 v1 tickets were already fixed in the real repo and are listed at the bottom as CLOSED. Line numbers are real-repo. Severity: P0 = data corruption or broken for a user class; P1 = visibly broken/stale; P2 = degraded; P3 = polish.

**Scope correction (v3):** the real repo HAS a watchOS companion (`mobile/targets/watch/` — SwiftUI app + WatchConnectivity) AND a rest-timer Live Activity (`mobile/targets/live-activity/`). The stale mirror lacked both. Deep review of both surfaces added as **WATCH-01…20** below; old UI-130 "no watch app" gap ticket is dead.

---

## OPEN — P0

### AUTH-01 · Signup/login collapse every failure into one generic message (verified on-device + against prod)
`app/(auth)/register.tsx:216-229` `extractErrorMessage` handles only HTTP 409 / `data.error === 'email_taken'` and `data.message`. Everything else → `t('tabs:register.genericError')` ("Something went wrong. Please try again."). Two failure classes hit this:
1. **Server validation.** Prod returns exactly `{"error":"validation_failed"}` — no `message`, no `details` (verified live: bad email → `validation_failed`; 5-char password → `validation_failed`). `data.error` is only ever compared against the literal `'email_taken'`, so `validation_failed` falls through.
2. **Network failure.** An offline/unreachable-server axios error has no `response` object at all, so it takes the same generic path. Reproduced on-device: a build pointing at an unreachable API showed the identical message with no hint that connectivity was the problem.

`app/(auth)/login.tsx` shares the shape. Client-side `validate()` (`register.tsx:78`) does pre-check email format and password length, so this only bites on server-rejected or offline cases — offline being the common one for a beta user on a train.
**Fix (two-sided):**
- Client: branch `if (!axiosErr.response)` → connection-error copy ("Can't reach Peak Fettle — check your connection"); map `data.error` values (`validation_failed`, `email_taken`, …) to specific copy; render `data.details` field issues against the matching input.
- Server: include the Zod `issues` it already has as `details` on the 400, so the client can point at the offending field.

### UI-103 · 1RM confirm sheet is kg-only
`app/(tabs)/rankings.tsx` — `formatKg` at :112, seed :143/:165, `parseFloat` treated as kg :181/:200, `<= 1000` cap :201, hardcoded "kg" label :265. lbs users must mentally convert or store wrong 1RM.
**Fix:** seed with `kgToInputValue`, parse with `parseWeightInput`, store via `displayToKg`, validate cap against kg post-conversion.

### UI-105 · RN-core `SafeAreaView` inside `<Modal>` — zero insets (Dynamic Island overlap)
Still all 3: `app/(tabs)/profile.tsx:39,819` (pageSheet), `src/components/SetEntryForm.tsx:26,409` (pageSheet), `src/components/TemplateDetailSheet.tsx:25,85`. None imports `react-native-safe-area-context`.
**Fix:** correct pattern now exists in-repo at `app/templates.tsx:952` — `paddingTop: Math.max(insets.top, 12)`.

---

## OPEN — P1

### NEW-06 · Auth footer overflows both screen edges at large Dynamic Type (verified on-device)
At accessibility text sizes (reproduced at AX5 / `accessibility-extra-extra-extra-large` on iPhone 17 Pro, iOS 26.5) the "Don't have an account? · Create one" row runs off **both** edges — the label is clipped on the left and the "Create one" button, the only route to registration, is cut off on the right.

Cause: `app/(auth)/login.tsx:248-254` and `app/(auth)/register.tsx:262-268` — `footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap }` with no `flexWrap` and no `flexShrink` on `footerText`. The row simply exceeds the viewport width and overflows symmetrically.
**Fix:** `flexWrap: 'wrap'` on `footer` plus `flexShrink: 1` on `footerText`, or switch to a column stack once `PixelRatio.getFontScale() > 1.3`.

Related observation (not a bug): the rest of both auth screens survives AX5 because `ScreenLayout scrollable` lets the user reach the Sign In button — verified by scrolling. Text-size changes only take effect after an app relaunch, not live.

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
Zero `.widgetAccentable()` in `index.swift`; asset colors `$accent`/`$widgetBackground` (declared in `expo-target.config.js`) never read from Swift.
**Correction (verified 2026-08-04):** do NOT "just switch to `Color("$accent")`" — per WATCH-02, those colorsets compile to nothing and the widget appex ships no `Assets.car` at all. Add `.widgetAccentable()` first (that works today with the hardcoded literals); only move to catalog colors after the colorset generation is fixed.

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

### WATCH-02 (P0) · Watch renders fully grayscale — colorsets are generated EMPTY (root cause corrected, verified on-device)
**Confirmed visually on watchOS 26.5 sim (Apple Watch SE 3 40mm): zero brand teal anywhere — every label renders default white/gray.**

The v3 diagnosis (name missing a `$`) was wrong. The real cause is upstream and affects two targets:

1. `targets/watch/expo-target.config.js` correctly declares `colors: { $accent: {color:'#00D4C8'}, $watchBackground: {color:'#0A0E1A'} }`.
2. `@bacons/apple-targets` generates the colorset directories but writes **`{"colors": []}`** — an empty array — into both `targets/watch/Assets.xcassets/$accent.colorset/Contents.json` and `targets/widget/Assets.xcassets/$accent.colorset/Contents.json`. The declared hex values never reach the catalog.
3. Consequence in the built products: `PeakFettleWatch.app/Assets.car` contains **only `AppIcon`** (verified with `xcrun assetutil --info`), and `PeakFettleWidget.appex` ships **no `Assets.car` at all**.

So every `Color("accent")` **and** `Color("$accent")` resolves to nothing in both targets. The widget escapes visual damage only because its Swift hardcodes literals (`index.swift:135-138`) and never reads the named colors; the watch reads them and goes gray.

**Fix — adding a `$` prefix does NOT work.** Either (a) hardcode the palette in Swift for the watch exactly as the widget does, or (b) fix the colorset generation so `Contents.json` carries real color components, then reference `Color("$accent")`. (a) is the safe immediate fix; (b) unblocks WATCH-13/UI-113.

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

### ~~WATCH-15~~ · CLOSED — Info.plist injection verified working
Source `targets/watch/Info.plist` is an empty dict, but the built product has `WKApplication => true`, `WKCompanionAppBundleIdentifier => com.peakfettle.app`, `CFBundleIdentifier => com.peakfettle.app.watchapp`. Watch app installs and launches on watchOS 26.5 sim. No action.

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

1. **Batch A (P0):** AUTH-01, UI-103, UI-105, WATCH-01 (crash), WATCH-02 — small, disjoint.
2. **Batch B (P1):** UI-107/108 (local-first), UI-109/110/111/113 (widget), UI-114/115, WATCH-03…08.
3. **Batch C (P2/P3):** rest (incl. WATCH-09…20, NEW-01…05).

DoD per batch: `peak-fettle-verify` parse-sweep + `tsc --noEmit` delta; push (EAS builds from `origin/main`).

---

## Local simulator build notes (2026-08-04, macOS + Xcode 26.5 / iOS 26.5 sim)

Getting this repo onto an iPhone simulator needed four workarounds. None is an app bug, but all four cost time:

1. **`EXPO_PUBLIC_API_URL` must be set at bundle time.** `src/api/client.ts:32` defaults to `http://localhost:3001` when the env var is unset, so a plain `xcodebuild` produces an app that cannot reach the API — every auth call fails as a network error (this is what surfaced AUTH-01). Export `EXPO_PUBLIC_API_URL=https://peak-fettle-production.up.railway.app` before building; only `eas.json` sets it today.
2. **Sentry fails the bundle phase without credentials.** "Bundle React Native code and images" exits non-zero via `sentry-cli`. Export `SENTRY_DISABLE_AUTO_UPLOAD=true` (or `SENTRY_ALLOW_FAILURE=true`) for local builds.
3. **`fmt` pod does not compile under Xcode 26 clang.** `Pods/fmt/include/fmt/format-inl.h` fails with "call to consteval function … is not a constant expression" on `FMT_STRING`. Workaround: force `FMT_USE_CONSTEVAL 0` in `Pods/fmt/include/fmt/base.h` post-`pod install`. Worth a `post_install` hook in the Podfile so it survives re-installs.
4. **watchOS platform is required to build the iOS scheme.** With the watch target embedded, `xcodebuild` refuses outright: "This scheme builds an embedded Apple Watch app. watchOS 26.5 must be installed." Run `xcodebuild -downloadPlatform watchOS` first.

Also: building with derived data inside an iCloud/OneDrive-synced folder makes `CodeSign` fail on the widget appex with "resource fork, Finder information, or similar detritus not allowed" (sync xattrs). Use a derived-data path outside the synced tree.

### Simulator coverage actually exercised (2026-08-04)

- **iOS 26.5** on iPhone 17 Pro — app builds, installs, launches; auth screens verified at default and AX5 text sizes, light and dark system appearance, portrait (app is `orientation: "portrait"`, so landscape is locked and needs no test).
- **watchOS 26.5** on Apple Watch SE 3 40mm, paired to the iPhone 17 Pro — watch app installs and launches, renders its "Open Peak Fettle on your iPhone" empty state correctly. This is what surfaced WATCH-02.
- `supportsTablet: false`, so iPad runs in iPhone compatibility mode — no separate iPad layout to test.
- watchOS simulator **cannot** override text size (`simctl ui … content_size` → "Runtime does not support dynamic text"), so WATCH-16 stays a code-level finding.
- Blocked behind auth: everything past the login screen, including WATCH-01 (needs a running rest timer) and the widget on the home screen.

### iOS 27

Not testable here. This machine has Xcode 26.6 (17F113), whose only SDKs are iOS 26.5 / watchOS 26.5, and `simctl runtime list` offers no newer image. An iOS 27 beta would require the Xcode 27 beta from the Apple Developer portal (manual download, paid account) — worth doing before Apple's autumn deadline, since the widget/watch targets are exactly the surfaces that break on major-version bumps.
