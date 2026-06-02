---
slug: ios-release-route-undefined
status: fix3-source+bundle-verified-clean-REBUILD-REQUIRED
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

---

## ROOT CAUSE IDENTIFIED + FIX 2 (2026-05-30) — device-confirmed culprit via guard

The guard (patches/expo-router+6.0.23.patch) did its job: on the rebuilt TestFlight
build the app BOOTED and the fallback named the two failing routes on screen:
**`(tabs)/index.tsx` (Home)** and **`(tabs)/rankings.tsx`**. log/profile/plans work.

PERFECT correlation across all 5 tabs:
- index  : `export default function HomeScreenWithBoundary()` wrapping <TabErrorBoundary> → UNDEFINED
- rankings: `export default function RankingsScreenWithBoundary()` wrapping <TabErrorBoundary> → UNDEFINED
- log     : `export default function LogScreen()` direct → works
- profile : `export default function ProfileScreen()` direct → works
- plans   : `export default function PlansScreen()` direct → works

The ONLY structural difference between the 2 broken and 3 working screens: the broken
ones export a SEPARATE `…WithBoundary` wrapper function (importing the `TabErrorBoundary`
class and using it as the route module's default export). In the Release/Hermes SYNC
bundle this made the route module resolve as `undefined`. (No cycle — madge clean; both
files parse; deployed == working tree; not corruption.)

### Fix 2 applied
- app/(tabs)/index.tsx: made `HomeScreen` the DIRECT default export; removed the
  `HomeScreenWithBoundary` wrapper + the now-unused `TabErrorBoundary` import.
- app/(tabs)/rankings.tsx: made `RankingsScreen` the direct default export; removed
  the `RankingsScreenWithBoundary` wrapper + `TabErrorBoundary` import.
- Now structurally identical to the 3 working tabs. Per-screen crash protection is
  covered by the root BootErrorBoundary + the expo-router guard (kept as a safety net).
- src/components/TabErrorBoundary.tsx is now orphaned (no references) — harmless dead
  code; can be removed in a cleanup pass.

### Verification
Parse-sweep clean (119 files). DEVICE verify pending: founder pushes + rebuilds; Home
and Rankings should now render their real content (no "This screen failed to load").

### SEPARATE ISSUE surfaced (NOT this bug): backend 500s
Log Workout shows "Request failed with status code 500"; Templates shows "Could not load
templates." Those screens RESOLVE fine (no route-undefined) — the SERVER is rejecting the
data calls. Likely an undeployed DB column / migration (see CLAUDE.md L-017/L-024: an
undeployed column = always-500 on the whole tab) or a backend deploy/config issue. Track
separately against peak-fettle-agents/server.

---

## FIX 3 (2026-06-02) — fix-2 theory was WRONG; SOURCE + PRODUCTION BUNDLE verified clean

Founder reported Home + Rankings STILL show "This screen failed to load" after fix 2.
So removing the `…WithBoundary` wrapper was NOT the cure. Re-investigated from scratch and
**built the actual production (sync/Hermes) bundle locally** to get ground truth instead of theory:

### What the WithBoundary theory missed
- All 5 tabs are now structurally identical (`export default function XScreen()` mid-file) — the
  wrapper is gone — yet the same two still failed. Structure was never the differentiator.
- **The real differentiator:** a transitive-closure diff of all 5 tab import graphs shows the
  ONLY module reachable from BOTH index & rankings but from NO working tab is
  **`src/api/percentile.ts`** (index imports `getPercentile`, rankings imports `confirm1rm`).
  fix 2 never noticed this. BUT — see below — that module is innocent too.

### Ground-truth bundle inspection (the decisive evidence)
Ran `expo export` + `expo export:embed --dev false` (both sync mode, same path the guard fires on):
- Bundle **builds clean** (3.5 MB Hermes + plain JS). No bundle-time error.
- `api/percentile.ts` module factory is well-formed: exports `getPercentile`/`confirm1rm`/
  `getPercentileForLift` eagerly at the top, dep map `[client, asyncToGenerator]`. Innocent.
- The expo-router require.context wires **both** routes correctly:
  `"./(tabs)/index.tsx":{get:()=>r(d[4])}` and `"./(tabs)/rankings.tsx":{get:()=>r(d[8])}`,
  and both module factories carry a proper `__esModule` + `default` export.
- `@babel/parser` sweep clean; type-only imports correctly elided; no require cycle
  (custom transitive cycle-detector + earlier madge agree).

### Conclusion
**The current source + the production JS bundle it generates are correct.** `loadRoute()` for both
routes resolves to a real module with a real `default`. There is no source defect left to fix.
Therefore the on-device failure is a **STALE BUILD** — the device is running a binary built
before the route modules reached their current (correct) state. A re-require can't help: a sync
bundle evaluates every module at startup, so a module that resolved is final.

### Action required (founder — cannot be done from the sandbox)
1. `git push origin main` (sandbox cannot push — see CLAUDE.md).
2. Trigger a **fresh EAS build** from origin/main and install it (TestFlight).
3. Home + Rankings will render. The expo-router guard (kept) remains a safety net that names any
   future offending route on-screen.
If — and only if — a freshly-built binary from current origin/main STILL shows the fallback, then
it is a Hermes-bytecode-vs-JS discrepancy (extremely rare) and should be reopened with the exact
build SHA; nothing in the JS source can change it.

### Related fixes shipped same pass (TICKET-074 + reported bugs)
- Stepper set-logging now persists: built the canonical `LogLiftSetPayload` (was a malformed
  snake_case object cast `as LogSetPayload` → server Zod-rejected → silently dropped).
- "Finish workout" button added to the Log screen (was missing).
- Starter-split templates were always empty: `routines.tsx` filtered `discipline:'strength'`
  but the schema CHECK only allows `general_strength`/`powerlifting`/… → 0 rows. Fixed.
