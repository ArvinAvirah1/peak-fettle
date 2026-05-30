---
slug: ios-release-route-undefined
status: resolved-pending-device-verify
trigger: "App crashes at startup on iOS Release/TestFlight only (works in dev). BootErrorBoundary catches: TypeError: Cannot read property 'ErrorBoundary' of undefined at expo-router fromImport → getQualifiedRouteComponent → getComponent → SceneView."
created: 2026-05-29
updated: 2026-05-29
---

# Debug: iOS Release route resolution crash

## Symptoms
- **Expected:** App boots to the home tab (authenticated) or login (unauthenticated).
- **Actual:** "Peak Fettle failed to start — Cannot read property 'ErrorBoundary' of undefined" immediately on launch.
- **Error:** `TypeError: Cannot read property 'ErrorBoundary' of undefined` in `fromImport` (expo-router useScreens.js).
- **Timeline:** Release/TestFlight builds only. Never reproduces in dev. Surfaced after the native iOS-26 NSException/font crash was fixed (BootErrorBoundary now catches the JS error instead of segfaulting).
- **Repro:** Launch the Release build on iOS 26.

## Current Focus
- hypothesis: expo-router v6 loads routes SYNC in Release (LAZY/React.lazy in dev). `mobile/app` has no `app/index.tsx`, and the cold-start `bootstrap()` in AuthContext never calls `router.replace`. So once `isLoading` flips false, expo-router must resolve `/` with no concrete component → `loadRoute()` returns undefined → `fromImport` reads `undefined.ErrorBoundary` → crash.
- next_action: add concrete `/` route + instrument boundary; verify via parse-sweep; founder rebuilds.

## Evidence
- timestamp 2026-05-29: Crash stack is 100% expo-router internals (`fromImport`→`getQualifiedRouteComponent`→`getComponent`→`SceneView`). Confirms route-module resolution failure, not app JS.
- timestamp 2026-05-29: `node_modules/expo-router/build/useScreens.js:183-184` — Release sync path: `const res = value.loadRoute(); ScreenComponent = fromImport(value, res).default;`. `res` undefined → `res.ErrorBoundary` crash. Line 173 shows dev uses `import_mode === 'lazy'` (React.lazy) — different path, masks the bug.
- timestamp 2026-05-29: `find app -type f` — NO `app/index.tsx`. `(auth)` group also has no `index.tsx`.
- timestamp 2026-05-29: grep — no `unstable_settings` / `initialRouteName` / anchor anywhere in `app/`.
- timestamp 2026-05-29: All 24 route files have valid `export default` (ruled out missing default export).
- timestamp 2026-05-29: No cross-route imports and no app↔ui-barrel cycles (ruled out circular import).
- timestamp 2026-05-29: AuthContext `bootstrap()` (line ~326) sets state only — **no `router.replace`** on cold start. login()→`/(tabs)/`, register()→`/splash`, logout/401→`/(auth)/login`. So after bootstrap there is no navigation and no `/` component → undefined route.

## Eliminated
- hypothesis: native NSException / expo-font / Hermes segfault — ELIMINATED: app no longer segfaults; BootErrorBoundary catches a JS error. Prior build fixed the native crash.
- hypothesis: missing default export on a route — ELIMINATED: all routes export default.
- hypothesis: circular import — ELIMINATED: no app↔app or app↔barrel cycles found.
- hypothesis: bad named import (undoRestDay) — ELIMINATED: exists in workouts.ts.

## Root cause
No concrete component for the `/` route in Release sync mode. Fix: add `app/index.tsx` that redirects on auth state to an existing concrete screen, add `unstable_settings.initialRouteName = 'index'` for deterministic resolution, and instrument BootErrorBoundary to render the component stack so any future route failure names itself.

## Resolution
- **Fix applied:**
  1. Added `mobile/app/index.tsx` — concrete `/` route: spinner while `isLoading`, then `<Redirect href={isAuthenticated ? '/(tabs)/' : '/(auth)/login'} />`. Targets match existing AuthContext nav, so behaviour is unchanged.
  2. `mobile/app/_layout.tsx` — added `export const unstable_settings = { initialRouteName: 'index' }` and registered `<Stack.Screen name="index" />` for deterministic initial-route resolution in the sync bundle.
  3. `mobile/app/_layout.tsx` — BootErrorBoundary now stores + renders `componentStack` (safety net: any future route-resolution failure names the offending screen on-screen, ending the blind crash-report loop).
- **Verification:** parse-sweep clean (all files parse). DEVICE verification pending: founder must `git push origin main`, trigger a new EAS build, and confirm the Release/TestFlight build boots past the error screen.
- **files_changed:** mobile/app/index.tsx (new), mobile/app/_layout.tsx
- **If it recurs:** the on-screen component stack will now name the failing route — capture it and reopen with `/gsd:debug continue ios-release-route-undefined`.
</content>
