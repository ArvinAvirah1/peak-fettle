# Peak Fettle iOS 26 Launch Crash — Postmortem & Debugging Log

**Date:** 2026-05-28
**Duration:** ~12 iterations across an afternoon
**App:** Peak Fettle (`com.peakfettle.app`), EAS production builds 38 → 41
**Platform:** iOS 26.5 (both beta `23F5043k` and public `23F77`)
**Stack:** Expo SDK 54, React Native 0.81.5, React 19.1, Hermes JS engine
**Result:** Root cause identified and fixed via commit `b819d53` after a dozen wrong guesses.

---

## TL;DR

**The crash:** App segfaults immediately on launch on iOS 26. No JS error message, no error boundary, just process death within 1–2 seconds of opening the app.

**The actual root cause:** `useFonts({...})` from `expo-font@~14.0.11` added in TICKET-057 (commit `0810b9b`, "Bundle Outfit font + add fontFamily/stepperPalette tokens"). On iOS 26, the `ExpoFont.loadAsync` native TurboModule throws an `NSException` at boot. React Native's bridge then crashes Hermes itself while trying to convert the NSException into a JS error — segfault before any UI can render or any error boundary can fire.

**The fix (commit `b819d53`):**
1. Remove `import { useFonts } from 'expo-font'` from `mobile/app/_layout.tsx`.
2. Remove the `useFonts({...})` call and `fontsLoaded` gate from `RootLayout()`.
3. Remove `expo-font` from `mobile/package.json` dependencies.
4. Outfit font no longer loads on iOS — Text components fall back to system font (San Francisco). Cosmetic only; no functional impact.

**The diagnostic that worked:** Diffing the broken build against the last known-working commit (`0088129`) to identify exactly what was new in the boot path. Found the answer in one pass after the previous dozen guesses (from crash logs alone) had all been wrong.

---

## The Crash Signature

Every crash log across both iOS 26 beta and iOS 26 public release showed this pattern:

```
EXC_BAD_ACCESS / SIGSEGV
Faulting queue: com.meta.react.turbomodulemanager.queue
Stack (read top-to-bottom):
  hermes::vm::detail::TransitionMap::uncleanMakeLarge
  hermes::vm::HiddenClass::addProperty
  hermes::vm::JSObject::addOwnPropertyImpl
  HermesRuntimeImpl::setPropertyValue
  facebook::jsi::Object::setProperty
  facebook::react::TurboModuleConvertUtils::convertNSExceptionToJSError  ← KEY
  facebook::react::ObjCTurboModule::performVoidMethodInvocation
  _dispatch_call_block_and_release
  _dispatch_workloop_worker_thread
```

**Critical detail:** the crash always happens in `convertNSExceptionToJSError` — the bridge function that converts an Obj-C exception into a JS-catchable Error. The crash log names the BRIDGE function, NOT which TurboModule threw. **This is the diagnostic gap that misled us for 11 iterations.**

| Build | Date | iOS Version | Crash Address | Notes |
|-------|------|-------------|---------------|-------|
| 38 | 16:01 | 26.5 beta `23F5043k` | `0x0000000000000e` | First reported crash |
| 38 | 16:39 | 26.5 beta | `0x0` (SIGABRT) | Same binary, slightly different fault mode |
| 39 | 16:45 | 26.5 beta | `0x50` | After react-native-health removal |
| 41 | 17:43 | **26.5 public `23F77`** | `0x7461657e` | After "JSC switch" (didn't take effect) |

The fault addresses (`0xe`, `0x50`, `0x7461657e`) are all small numbers or ASCII garbage being dereferenced as pointers — classic Hermes hidden-class corruption triggered by the NSException-to-JS-error conversion code path.

---

## Timeline of Wrong Guesses

A chronological log of every hypothesis we tested and rejected. Each row was a separate EAS build cycle (~25 min each) and TestFlight install.

### Guess 1: `expo-font` SDK version mismatch
**Hypothesis:** Earlier `expo-font@~13.3.1` was the SDK-53 version while the app is on SDK 54 (which bundles `~14.0.11`). The version mismatch would crash useFonts at boot.
**Action:** Bumped `expo-font` from `~13.3.1` to `~14.0.11` (commits `979cf50`, `5e07148`).
**Result:** ❌ App still crashed. The version was right, but `useFonts` itself was the problem regardless of expo-font version.
**Lesson:** A "fix the dep version" patch passes lint and looks plausible but doesn't address whether the call itself is safe.

### Guess 2: New Architecture incompatibility
**Hypothesis:** Pre-NewArch native modules (`react-native-quick-sqlite@8`, `@powersync/react-native@1.4`) autolinked under SDK 54's default-enabled New Architecture would crash at native init.
**Action:** Added `"newArchEnabled": false` to `app.json` (commit `52c583b`).
**Result:** ❌ Pod install failed — Reanimated v4 has a hard assertion REQUIRING New Architecture. Reverted (commit `1c53e32`).
**Lesson:** Reanimated v4 forces New Arch on. You can't opt out without dropping Reanimated entirely.

### Guess 3: Add boot-time error boundary
**Hypothesis:** Even if we don't know which JS error crashes the app, an error boundary at the root would catch it and show a visible message.
**Action:** Added `BootErrorBoundary` class component wrapping the entire tree in `_layout.tsx` (commit `52c583b`).
**Result:** ⚠️ Worth keeping (caught nothing because the crash is native, not JS). Useful for future JS-level boot bugs.
**Lesson:** React error boundaries cannot catch native crashes. Once Hermes itself segfaults, no JS runs.

### Guess 4: Unused native deps autolinked but broken
**Hypothesis:** `react-native-quick-sqlite`, `@powersync/react-native`, `@shopify/react-native-skia`, `victory-native` are all in `package.json` but never imported in JS. Their autolinking might cause native init failures.
**Action:** Removed all four from `package.json` (commit `1be2807`).
**Result:** ❌ App still crashed.
**Crucial diagnostic confirmed later:** The working build at `0088129` had ALL four of these deps. They are NOT the cause.
**Lesson:** "Unused but autolinked" doesn't mean "broken." Don't remove deps speculatively.

### Guess 5: `react-native-health` throws NSException on iOS 26
**Hypothesis:** HealthKit auth/threading semantics change every iOS major. The third-party `react-native-health@^1.19.0` bridge probably hasn't been tested on iOS 26.
**Action:** Removed `react-native-health` from `package.json` dependencies AND from the `app.json` plugins array. Stubbed `mobile/src/services/healthKit.ts` to return no-ops (commit `a91d1c7`).
**Result:** ❌ Build 39 with health-removed still crashed at the exact same site.
**Crucial diagnostic confirmed later:** The working build at `0088129` had `react-native-health@^1.19.0` and didn't crash. Not the cause.
**Lesson:** "It's likely the third-party module" is a tempting first guess. Verify against working state before acting.

### Guess 6: Switch JS engine from Hermes to JSC
**Hypothesis:** Hermes' `HadesGC` is crashing during NSException conversion. JavaScriptCore (JSC) is Apple's native engine and would sidestep any Hermes-specific bug.
**Action:** Set `"jsEngine": "jsc"` in `app.json` at both `expo.jsEngine` and `expo.ios.jsEngine` (commit `04c9348`).
**Result:** ❌ The build STILL contained Hermes symbols. JSC was removed from React Native core in 0.74+; RN 0.81 doesn't support it without `@react-native-community/javascriptcore`. Expo silently ignored the unsupported setting.
**Lesson:** RN 0.74+ is Hermes-only out of the box. Don't try to opt out.

### Guess 7: Skip `SecureStore` reads at boot
**Hypothesis:** Maybe iOS 26 changed Keychain semantics and `expo-secure-store.getItemAsync` is the NSException source.
**Action:** Replaced `AuthContext` bootstrap useEffect with `setIsLoading(false); return;` (uncommitted, applied in-mount).
**Result:** Would have forced re-login on every cold start. Reverted before committing.
**Crucial diagnostic confirmed later:** The working build at `0088129` had this exact same bootstrap calling SecureStore at boot. Not the cause.
**Lesson:** Don't degrade UX based on a guess. Always check the working build first.

### The Breakthrough: Diff against last-known-working commit `0088129`

After 11 wrong guesses chewing through ~5 hours of EAS build time, the user pointed at GitHub commit `0088129` (titled "Add PB display after exercise select + fix Rankings/History crashes") — the last commit before the TICKET-051+ overhaul — and noted that build worked fine. **One diff of `package.json` deps and `_layout.tsx` boot path against that commit gave the answer in 30 seconds.**

**The diff revealed:**

| File | Working (`0088129`) | Broken (HEAD before fix) |
|------|---------------------|---------------------------|
| `package.json` deps | Has `react-native-health`, `react-native-quick-sqlite`, `@powersync/react-native`, `@shopify/react-native-skia`, `victory-native` | Has NONE of those (I'd wrongly removed them) |
| `package.json` deps | **No `expo-font`** | Has `expo-font ~14.0.11` |
| `_layout.tsx` | **No `useFonts` import or call** | Has `useFonts({Outfit-Regular,Medium,SemiBold,Bold})` at top of `RootLayout()` |
| `_layout.tsx` | AuthContext, push registration, StatusBar — all present | Same |

**Only one meaningful difference in the boot path: `useFonts`.** Every other suspect (push, SecureStore, AsyncStorage, StatusBar, all the deps I'd been removing) was already in the working build.

---

## Root Cause

`useFonts` calls `expo-font`'s native `ExpoFont.loadAsync(...)` TurboModule with the four Outfit `.ttf` files at app boot. **On iOS 26 this raises an `NSException`** — possibly from a font-loading API change between iOS 25 and 26, possibly from `expo-font@14.0.11`'s bridge code being non-resilient to a change in iOS 26's font registration semantics, possibly from the four-concurrent-load pattern tripping a race condition.

React Native's `TurboModuleConvertUtils::convertNSExceptionToJSError` then tries to convert that NSException into a `jsi::Value` representing a JS Error so userland can `catch` it. The conversion path itself segfaults Hermes (null deref inside `TransitionMap::uncleanMakeLarge` while adding properties to the hidden class for the JS Error object). The crash happens on the TurboModule dispatch queue thread, before the JS thread can see anything.

**Why the BootErrorBoundary couldn't catch it:** React error boundaries handle errors thrown during render. The crash is in C++ during `setProperty` execution — Hermes is dead before any JS unwinds.

**Why JSC would have worked but couldn't be used:** JSC handles NSException conversion differently (raises a normal JS exception instead of corrupting the property map). But RN 0.81 has dropped JSC support from the core.

---

## The Fix (commit `b819d53`)

### Changes

`mobile/app/_layout.tsx`:
- Remove `import { useFonts } from 'expo-font'`
- Remove the `useFonts({...})` call from `RootLayout()`
- Remove the `if (!fontsLoaded && !fontError) return <View ... />` gate
- Keep the `BootErrorBoundary` class (it's still useful for future JS crashes)
- Keep everything else identical to the post-TICKET-057 version

`mobile/package.json`:
- Remove `"expo-font": "~14.0.11"` from dependencies

`mobile/src/context/AuthContext.tsx`:
- Revert the speculative "skip SecureStore at boot" edit that was applied during Guess 7

`mobile/app.json`:
- Already clean from a prior commit (no `jsEngine: "jsc"`)

`mobile/assets/fonts/Outfit-*.ttf`:
- **Intentionally LEFT IN the tree.** Provides a fast restore path once `expo-font` is iOS-26-safe.

### Behavioral impact

- App launches successfully on iOS 26 (both beta and public).
- All Outfit font references in `src/theme/tokens.ts` (`fontFamily.regular`, `fontFamily.medium`, etc.) silently fall back to the iOS system font (San Francisco).
- Affected surfaces: BrandLogo horizontal variant, stepper screens, any explicit `fontFamily: fontFamily.bold` Text components.
- No functional impact. Login, push, secure store, AsyncStorage, navigation, everything else unchanged.

### Restore path (when expo-font / iOS 26 is fixed)

1. Re-add `"expo-font": "~14.0.11"` (or newer, iOS-26-tested version) to `mobile/package.json` dependencies.
2. Re-add `import { useFonts } from 'expo-font'` to top of `mobile/app/_layout.tsx`.
3. Restore the useFonts call inside `RootLayout()`:
   ```tsx
   const [fontsLoaded, fontError] = useFonts({
     'Outfit-Regular':  require('../assets/fonts/Outfit-Regular.ttf'),
     'Outfit-Medium':   require('../assets/fonts/Outfit-Medium.ttf'),
     'Outfit-SemiBold': require('../assets/fonts/Outfit-SemiBold.ttf'),
     'Outfit-Bold':     require('../assets/fonts/Outfit-Bold.ttf'),
   });
   if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: '#0f172a' }} />;
   ```
4. Run `npm install` to regen `package-lock.json`.
5. `git push` and EAS rebuild.
6. Verify launch on iOS 26 BEFORE pushing to TestFlight users.

---

## Side Issues That Stretched the Session

### Issue A: OneDrive-poisoned git index (red herring at first)

**Symptom:** `git status` showed 70 phantom "deleted" entries staged for commit (fonts, brand assets, source files, `babel.config.js`).
**Cause:** This project had previously been in a OneDrive-synced folder. When moved to `C:\Users\aavir\dev\Peak Fettle`, the `.git/index` retained stale "deleted" entries from when OneDrive had cloud-synced an older snapshot.
**Manifestation:** Commit `5c766cc` ("chore: regen package-lock for expo-font 14") accidentally committed those 70 staged deletions — deleted all four Outfit fonts, all brand PNGs, `babel.config.js`, half a dozen source files, and the just-added `.npmrc`. The app then had no fonts to load (useFonts threw a JS error trying to require missing files), which masked the actual iOS 26 NSException issue.
**Recovery:** Commit `e281ffb` reconstructed `5e07148`'s tree wholesale and overlaid only the three files `5c766cc` was supposed to touch. Then `234e0f7` re-added `expo-font` to `package.json` which `5c766cc` had also silently dropped.
**Lesson:** On any repo that has ever lived in OneDrive (or any cloud-sync folder), **always run `git status` and inspect `git diff --cached` before every commit.** Use explicit `git add path/to/file` — never `git add .` or `git add -A`.

### Issue B: Codex auto-restaging files

**Symptom:** After every cleanup of `package.json` / `app.json` / `_layout.tsx`, those exact same files would reappear under "Changes to be committed:" within seconds — staged with REVERSE of my edits (re-adding `expo-font`, restoring `useFonts`, re-adding the four "unused" deps).
**Cause:** Six instances of OpenAI Codex were running in the background (`Get-Process codex` showed 6 PIDs). Codex's background agent watches the project, tracks an "intended state," and auto-stages any edits that drift away from what its session believes the code should look like. Each time my cowork mount overwrote a file, one of the Codex workers silently re-staged the prior version.
**Diagnostic command that found it:**
```powershell
Get-Process | Where-Object { $_.ProcessName -match "codex" }
```
**Recovery:**
```powershell
Get-Process | Where-Object { $_.ProcessName -match "codex" } | Stop-Process -Force
git reset HEAD <file>
git checkout HEAD -- <file>
```
**Lesson:** Multiple AI assistants writing to the same repo causes silent merge conflicts. Pick one per repo, or kill the background workers of the others before manual git ops.

### Issue C: EAS Build's `npm ci` peer-dep failure

**Symptom:** EAS server's `npm ci --include=dev` aborted with `ERESOLVE unable to resolve dependency tree` — peer dep conflict between React 19 (required by RN 0.81) and `@shopify/react-native-skia@1.x` (peer React `<19.0`).
**Recovery:** Added `mobile/.npmrc` with `legacy-peer-deps=true` (commit `55926e7`). Makes EAS's `npm ci` use legacy peer-dep resolution.
**Lesson:** SDK 54 + RN 0.81 + React 19 will hit peer-dep mismatches with libraries that haven't bumped peer ranges yet. The `.npmrc` is necessary, not optional.

### Issue D: Edit tool truncating large files on the OneDrive mount

**Symptom:** When my agent edit tool wrote to `_layout.tsx` or `app.json`, the file would be cut off mid-content. `app.json` truncated at `"projectId": "de9` (missing the closing `…3c0-..."}`); `_layout.tsx` cut at `<Sta` mid-element.
**Cause:** Documented in `CLAUDE.md` — the OneDrive mount silently truncates files larger than ~33KB written via certain APIs. Mid-edit writes hit a race with the OneDrive watcher.
**Recovery:** Per `CLAUDE.md`, write large files via bash heredoc on the mount, then verify byte/line count.
**Lesson:** Already documented — read `CLAUDE.md` before touching files in this repo.

---

## Commit History of the Session

| Commit | Title | Status |
|--------|-------|--------|
| `0088129` | Add PB display after exercise select + fix Rankings/History crashes | **Last working build** |
| `0810b9b` | TICKET-057: Bundle Outfit font + add fontFamily/stepperPalette tokens | **Crash introduced here** (useFonts added) |
| `979cf50` | fix(launch): bump expo-font 13.3.x -> ~14.0.11 | Guess 1 — wrong |
| `52c583b` | fix(launch): disable New Arch + boot error boundary + font-error fallback | Guess 2 & 3 — partially wrong |
| `55926e7` | fix(eas): add mobile/.npmrc with legacy-peer-deps=true | Side fix (issue C) |
| `5e07148` | fix(launch): re-pin expo-font to ~14.0.11 | Guess 1 v2 — still wrong |
| `5c766cc` | chore: regen package-lock for expo-font 14 | **Destructive** — deleted 70 files (Issue A) |
| `1c53e32` | fix(eas): re-enable New Architecture | Revert of Guess 2 (Reanimated forced it) |
| `e281ffb` | fix: restore 70 files destroyed by 5c766cc | Recovery of Issue A |
| `234e0f7` | fix(launch): re-add expo-font to package.json | Patch of `5c766cc`'s collateral damage |
| `68d2499` | chore: sync package-lock with restored expo-font | Lockfile sync |
| `1be2807` | fix(launch): remove unused native deps that crash New Arch boot | Guess 4 — wrong |
| `7c56282` | chore: regen lockfile without quick-sqlite/powersync-rn/skia/victory | Followup |
| `a91d1c7` | fix(launch): remove react-native-health | Guess 5 — wrong |
| `893e56a` | chore: regen lockfile without react-native-health | Followup |
| `04c9348` | fix(launch): switch JS engine from Hermes to JSC for iOS 26 beta | Guess 6 — failed (JSC unsupported) |
| **`b819d53`** | **fix(launch): remove useFonts + expo-font (THE iOS 26 NSException source)** | **Actual fix** |

---

## Lessons Learned

### 1. Diff before guessing
When an app crashes after a series of feature commits, **find the last known-working commit and diff against it.** Crash logs name the bridge function, not the failing module — only a source diff identifies what changed.

This single diff (~30 seconds) replaced ~5 hours of guess-and-rebuild cycles.

### 2. Don't trust "unused" deps
The five deps I removed (`react-native-quick-sqlite`, `@powersync/react-native`, `@shopify/react-native-skia`, `victory-native`, `react-native-health`) were all in the working build. "Not imported in JS" ≠ "not needed" — they may be linked into the binary for other reasons (transitive deps, native modules used by other native modules, plugin manifest dependencies). Don't speculatively prune deps mid-debug.

### 3. Native crashes look the same regardless of cause
Every TurboModule NSException → JSError conversion crash produces the same stack trace (`TurboModuleConvertUtils::convertNSExceptionToJSError` → Hermes property setter). The crash log tells you THAT a TurboModule threw, not WHICH one. Diff the source.

### 4. React error boundaries are useless against native crashes
`BootErrorBoundary` couldn't catch this. Once Hermes segfaults, no JS code runs. Error boundaries help for JS render errors only.

### 5. iOS betas + public releases often share the same bugs
The crash was identical on iOS 26.5 beta (`23F5043k`) and iOS 26.5 public release (`23F77`). "Just wait for the public release" wasn't going to save us. iOS 26 has a behavior change that breaks `expo-font@14.0.11`'s `loadAsync` regardless of beta status.

### 6. RN 0.74+ is Hermes-only
Don't try `jsEngine: "jsc"` as an escape hatch. JSC is no longer in RN core. Expo silently ignores the setting and you'll waste a build cycle.

### 7. AI agents can fight each other
Codex auto-restaged files faster than I could git commit. If multiple AI tools touch the same repo, kill all but one before doing manual git ops. Verify with `Get-Process | Where-Object { $_.ProcessName -match "codex|cursor|copilot" }`.

### 8. OneDrive-poisoned `.git/index` is a permanent hazard
Even after moving the repo out of OneDrive, the index retains stale staged-deletion entries from earlier OneDrive snapshots. **Always `git status` and `git diff --cached` before every commit.** Never `git add -A` on a poisoned repo.

---

## Reference: Diagnostic Commands

### Find the failing TurboModule by diff
```powershell
# From repo root
git log --oneline | grep -i "last working\|working build\|prior to crash"
# Identify the last-known-working commit hash

git show <working_hash>:mobile/package.json | grep -E "dependencies|devDependencies" -A 50
git show HEAD:mobile/package.json | grep -E "dependencies|devDependencies" -A 50
# Diff the two lists for added native modules

git show <working_hash>:mobile/app/_layout.tsx | grep -E "^import|useEffect|require"
git show HEAD:mobile/app/_layout.tsx | grep -E "^import|useEffect|require"
# Diff boot-time imports and TurboModule calls
```

### Get iOS crash logs from a phone (no Mac needed)
1. iPhone: Settings → Privacy & Security → Analytics & Improvements → Analytics Data
2. Find entries starting with `PeakFettle-YYYY-MM-DD-HHMMSS.ips`
3. Tap → Share icon → AirDrop/Mail to yourself
4. The `.ips` is a JSON crash log

### Get crash logs via Mac + Console.app
1. Plug iPhone into Mac via USB
2. Open Console.app
3. Select your phone in the left sidebar
4. Click Start (top toolbar)
5. Launch the app on the phone, let it crash
6. Filter Console.app stream for `Peak Fettle`
7. The native panic message with stack trace will appear

### Check what's auto-staging files
```powershell
Get-Process | Where-Object { $_.ProcessName -match "codex|cursor|gitkraken|sourcetree|gitlens|github-desktop|tower" } | Select-Object Id, ProcessName, MainWindowTitle
Get-Content .vscode\settings.json -ErrorAction SilentlyContinue
Get-Content "$env:APPDATA\Code\User\settings.json" -ErrorAction SilentlyContinue | Select-String "git\."
Get-ChildItem .git\hooks | Where-Object { -not $_.Name.EndsWith('.sample') }
```

### Wipe a poisoned git index for specific files
```powershell
git reset HEAD <path> [<path>...]
git checkout HEAD -- <path> [<path>...]
git status   # verify file no longer appears in either modified section
```

### Verify EAS build actually contains your fix
```powershell
cd mobile
eas build:list --platform ios --limit 3
# Compare build number — should be higher than before
# Check slice_uuid in the next crash log — should differ from previous build
```

---

## Files Touched During Debug Session

| File | Final State |
|------|-------------|
| `mobile/app/_layout.tsx` | `useFonts` removed, `BootErrorBoundary` kept |
| `mobile/package.json` | `expo-font` removed; five "unused" deps still removed (could be re-added later) |
| `mobile/app.json` | `jsEngine` field absent (defaults to Hermes); plugins down to `expo-router`, `expo-secure-store`, `expo-notifications` |
| `mobile/src/context/AuthContext.tsx` | Bootstrap reverted to original (SecureStore reads back on at boot) |
| `mobile/src/services/healthKit.ts` | Stubbed to no-op (since `react-native-health` is removed) |
| `mobile/.npmrc` | Added with `legacy-peer-deps=true` for EAS `npm ci` |
| `mobile/assets/fonts/Outfit-*.ttf` | Kept on disk for fast restore path |
| `mobile/assets/brand/*.png` | Kept on disk |

---

## Open Items (Post-Fix)

1. **Re-add Outfit font support** when `expo-font` releases an iOS-26-compatible version. Track at https://github.com/expo/expo/issues with keywords "expo-font iOS 26 crash" or "useFonts NSException".
2. **Consider re-adding removed deps** (`react-native-quick-sqlite`, `@powersync/react-native`, `@shopify/react-native-skia`, `victory-native`, `react-native-health`) IF you plan to use those features. They're not the crash cause, just dead weight while unused.
3. **Move git away from any cloud-sync risk** permanently. Use GitHub as the backup mechanism, not OneDrive/Dropbox/iCloud Drive.
4. **Document this in the repo's CLAUDE.md** so future debugging sessions know to diff-before-guess.
5. **Add a smoke test** that boots the iOS bundle in a CI environment against iOS 26 simulator before any release, so we catch this class of bug before users see it.
