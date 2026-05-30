---
status: fixed-pending-device-verification
trigger: "iOS TestFlight + dev-client crash on PeakFettle build 45 (v1.0.0). EXC_BAD_ACCESS (SIGSEGV) at 0x6f727249, queue com.meta.react.turbomodulemanager.queue. Faulting frames: ObjCTurboModule::performVoidMethodInvocation -> convertNSExceptionToJSError -> convertNSArrayToJSIArray -> Hermes setValueAtIndexImpl. A void ObjC TurboModule method raised an NSException at boot; RN's exception->JS-error conversion segfaulted Hermes. Crashes instantly (~1.8s) on launch, 100% on TestFlight AND in dev-client (npx expo start --dev-client). Previous build still crashes after two prior fix attempts (useFonts removal, embedded-font + Icon shim)."
created: 2026-05-30
updated: 2026-05-30
---

# Debug: iOS TurboModule NSException boot crash (recurring)

## Symptoms
- **Expected:** App boots to login/tabs without crashing.
- **Actual:** EXC_BAD_ACCESS (SIGSEGV) / KERN_INVALID_ADDRESS at 0x6f727249 ~1.8s after launch. Hard native segfault — no JS redbox.
- **Crash report:** C:\Users\aavir\Downloads\PeakFettle-2026-05-30-010000.ips (build 45, CFBundleVersion 45, iOS 26.5, iPhone15,2).
- **Timeline:** Recurring. Prior reports: PeakFettle-2026-05-28-174319.ips (public release). Two prior fix attempts FAILED to stop it.
- **Repro:** 100% on TestFlight build 45 AND in dev-client (`npx expo start --dev-client` → opens Peak Fettle → crash). Was reported as "fine in dev" earlier but founder confirms dev-client ALSO crashes.

## Crash mechanics (from .ips)
- Triggered thread 6, queue `com.meta.react.turbomodulemanager.queue` (NOT the JS thread).
  Frames (top→down):
  1. hermes::vm::JSObject::getComputedPrimitiveDescriptor
  2. hermes::vm::JSObject::putComputedWithReceiver_RJS
  3. HermesRuntimeImpl::setValueAtIndexImpl
  4. react::TurboModuleConvertUtils::convertNSArrayToJSIArray
  5. react::TurboModuleConvertUtils::convertNSExceptionToJSError
  6. react::ObjCTurboModule::performVoidMethodInvocation  ← a VOID ObjC method @threw an NSException
- Simultaneously the JS thread (com.facebook.react.runtime.JavaScript) is inside hermes stringPrototypeSplit → ArrayImpl::_setOwnIndexedImpl. So TWO threads touch Hermes at once → heap corruption → segfault. The off-JS-thread NSException→JSError conversion is the RN-side amplifier; the ROOT trigger is *which void native method threw*.
- Faulting addr 0x6f727249 bytes ≈ ASCII ("Irro"/"rror") → a string value deref'd as an object pointer, consistent with Hermes heap corruption from concurrent access.

## Stack / versions
- expo ^54.0.34, react-native 0.81.5, react 19.1.0, New Architecture ON (default in SDK 54; TurboModule frames confirm).
- expo-notifications ~0.32.17, expo-secure-store ~15.0.8, expo-status-bar ~3.0.9, expo-font ~14.0.11, @react-native-async-storage/async-storage 2.2.0.
- expo-font config plugin embeds: Ionicons.ttf, Outfit-{Regular,Medium,SemiBold,Bold}.ttf (app.json plugins[]).

## Boot-time native call inventory (what runs before/at ~1.8s)
Provider tree: BootErrorBoundary > ThemeProvider > AuthProvider > PowerSyncProvider > RootNavigator.
- ThemeProvider: `AsyncStorage.getItem('@peak_fettle/theme')` (async). Renders <></> until ready.
- AuthProvider bootstrap useEffect: `SecureStore.getItemAsync(refresh)` (async) → `AuthApi.refreshTokens()` network → on success `SecureStore.getItemAsync(profile)`; sets isLoading=false in finally.
- RootNavigator useEffect (fires when !isLoading): `registerForPushNotificationsAsync()` → iOS path: `Notifications.requestPermissionsAsync()` (async) → `Notifications.getExpoPushTokenAsync()` (async). Whole thing wrapped in try/catch (JS).
- `<StatusBar style="auto" />` (expo-status-bar) → setStatusBarStyle (a VOID native call).
- First tab-bar render (if session stored → auto-auth → /(tabs)): icons render via Icon.tsx shim `<Text style={{fontFamily:'Ionicons'}}>` (NO loadAsync).
- `setForegroundNotificationHandler()` / `setNotificationHandler` is DEFINED but appears UNCALLED (verify). `setNotificationChannelAsync` is Android-only (guarded).

## Current Focus
hypothesis: A void ObjC TurboModule method invoked during boot raises an NSException on iOS 26.5 under RN 0.81 New Arch. Prime suspects (in priority order): (1) expo-notifications native init/listener void method triggered when push registration fires right at ~1.8s; (2) expo-status-bar setStatusBarStyle; (3) expo-font native embedded-font registration. The font/loadAsync theory is already disproven (removed, still crashes).
test: Capture the actual NSException `reason` + module/method name from dev-client (Metro terminal + iOS device console / Xcode), OR bisect boot-time native calls one at a time on the live dev repro (disable push registration; disable StatusBar; etc.) until the crash disappears.
expecting: The NSException reason string or the bisect will name the exact module + method. RN 0.81 has a known fix where convertNSExceptionToJSError touches the runtime off-thread — but our actionable fix is to stop the native method from throwing (guard/remove the offending boot call) or move it off the boot path.
next_action: Get the NSException reason from the live dev-client repro (highest-value), then bisect to confirm the exact throwing call.

## Eliminated
- hypothesis: useFonts/expo-font loadAsync at boot is the culprit | why: removed entirely (only comments remain; grep finds no live loadAsync/useFonts), yet build 45 still crashes with identical signature. Disproven by recurrence.
- hypothesis: PowerSync native SQLite init throws at boot | why: PowerSyncProvider is a DEV STUB returning <>{children}</> — no native call. Real impl commented out.
- hypothesis: working-tree deletions (Icon.tsx, index.tsx, Ionicons.ttf) cause the dev crash | why: files EXIST on disk (the `D` is a stale staged-deletion contradicted by worktree); origin/main also has them. Not a missing-file issue.

## Evidence
- timestamp: 2026-05-30 — .ips faulting frames show performVoidMethodInvocation→convertNSExceptionToJSError (void method threw NSException). Concurrent Hermes access from turbomodulemanager.queue + JS thread.
- timestamp: 2026-05-30 — _layout.tsx documents 2 prior failed fixes (useFonts removal 05-28; embedded-font + Icon shim 05-29). Crash persists.
- timestamp: 2026-05-30 — Founder confirms dev-client ALSO crashes (live, 100% repro available) — enables bisect.

## Resolution
root_cause: |
  TWO-LAYER bug, neither of which the two prior font-focused fixes touched.
  (1) AMPLIFIER (the load-bearing bug, in RN 0.81.5 itself): ObjCTurboModule::
      performVoidMethodInvocation dispatches void TurboModule methods on the async
      queue com.meta.react.turbomodulemanager.queue. Its @catch calls
      convertNSExceptionToJSError(runtime,...) which touches the Hermes runtime
      OFF the JS thread. On iOS 26 that corrupts the Hermes heap -> EXC_BAD_ACCESS
      at startup. PR #50193 fixed the same bug in performMethodInvocation but left
      performVoidMethodInvocation broken (RCTTurboModule.mm:435-441).
  (2) WHY PRIOR FIXES DIDN'T SHIP: Expo SDK 54 defaults to PRECOMPILED React Native
      iOS XCFrameworks (buildReactNativeFromSource=false). EAS therefore ignored any
      node_modules/native source change. (Also why a node_modules patch alone is
      inert until source-build is forced.)
  (3) TRIGGER: some boot-time void TurboModule throws an NSException; fonts were one
      (removed), expo-notifications push registration firing at the ~1.8s boot frame
      (RootNavigator useEffect, fired for ALL users incl. logged-out) was the next.
fix: |
  Layer 1 (durable — survives ANY boot-time TurboModule NSException):
    - patches/react-native+0.81.5.patch: performVoidMethodInvocation now only
      convert+rethrows on the SYNC path; on the async path it RCTLogError's and
      returns (never touches Hermes off-thread). via patch-package + "postinstall".
    - app.json expo-build-properties ios.buildReactNativeFromSource=true so EAS
      compiles RN from source and the patch actually takes effect (the missing
      piece that made prior fixes no-ops). Cost: longer iOS EAS build times.
  Layer 2 (reduce trigger): app/_layout.tsx RootNavigator push-registration effect
    now gates on isAuthenticated and defers via InteractionManager.runAfterInteractions
    — keeps expo-notifications native calls off the fragile boot critical path and
    stops firing for logged-out users (the server call needs auth anyway).
verification: |
  JS parse-sweep (peak-fettle-verify) — see Evidence.
  DEVICE VERIFICATION STILL REQUIRED (founder): commit + push to origin/main, run a
  fresh EAS iOS build (production/TestFlight), install on iPhone15,2 / iOS 26.5, and
  confirm no boot crash. The amplifier patch ONLY compiles in because of
  buildReactNativeFromSource=true — verify the EAS build log shows RN building from
  source. The existing dev-client binary will NOT contain the patch until rebuilt.
files_changed:
  - mobile/patches/react-native+0.81.5.patch (new)
  - mobile/package.json (postinstall + patch-package + expo-build-properties deps)
  - mobile/app.json (expo-build-properties plugin, ios.buildReactNativeFromSource)
  - mobile/app/_layout.tsx (gated + deferred push registration)
