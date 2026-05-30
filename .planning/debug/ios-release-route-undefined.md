---
slug: ios-release-route-undefined
status: reopened-recurred-in-tabs
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

---

## RECURRENCE 2026-05-30 (reopened)

New TestFlight screenshots: BootErrorBoundary still catches `TypeError: Cannot read property 'ErrorBoundary' of undefined`, but now the component stack shows the failure is INSIDE `BottomTabNavigator` / `TabsLayout` (app/(tabs)/_layout.tsx, jsbundle:180410) — i.e. the `/` route now resolves (prior index.tsx fix worked) and the app gets into the `(tabs)` navigator, but a **tab screen module loads as `undefined`** in the Release sync bundle.

### New evidence (2026-05-30)
- Mechanism confirmed in source: useScreens.js getQualifiedRouteComponent sync branch does `const res = value.loadRoute(); fromImport(value, res)` and `fromImport` destructures `{ ErrorBoundary, ...component }` from `res`. `res === undefined` → "Cannot read property 'ErrorBoundary' of undefined" (Hermes destructure-of-undefined). So a route's `loadRoute()` RETURNS undefined (it does NOT throw — a throw would surface the real error).
- `madge --circular app src` (full 92-file graph): **NO circular dependency** — prior "no cycle" claim re-confirmed at depth. So NOT a cycle.
- All 5 tab routes (index, log, rankings, plans, profile) + (tabs)/_layout have valid `export default`.
- origin/main HAS all route files incl. app/index.tsx; no app/ diff between origin/main and local HEAD. So not a missing-file / stale-tree issue.
- Could NOT identify the specific undefined route by static analysis alone (no source map for the deployed bundle; line numbers are expo-router lib internals).

### Eliminated (this round)
- circular import (madge clean) · missing default export (all present) · missing file on origin/main (all present).

### Action taken (2026-05-30) — guard + diagnostic, NOT yet root-caused
- patches/expo-router+6.0.23.patch: getQualifiedRouteComponent sync path now guards `res == null` — renders a visible "This screen failed to load: <contextKey>" fallback and console.error's the key, instead of crashing the whole app. JS-only patch (Metro bundles it; NO native rebuild / buildReactNativeFromSource needed). Picked up via patch-package postinstall.
- Effect on next build: app BOOTS even with a bad route; working tabs work; the broken tab NAMES itself on screen → definitive identification.

### Next action
Founder rebuilds from latest origin/main (must include index.tsx fix 94ac279 + native fix 8015db0 + both patches). Capture the on-screen route name from the fallback, then fix that specific file's root cause (likely a module-eval edge: a top-level value resolving undefined in Hermes sync, a bad re-export, or a Metro/route-context quirk). Confirm whether the deployed crashing build actually contained these commits — if it pre-dated them, a clean rebuild may already resolve it.
</content>
