# TICKET-083 — Routines as a dedicated bottom tab

**Owner:** dev-frontend
**Date opened:** 2026-06-03
**Phase:** R — Revision & Hardening
**Model lane:** Sonnet
**Founder decision (2026-06-03):** make Routines easy to reach — **"Dedicated bottom tab."** Add
'Routines' as its own bottom-nav tab alongside Home/Log/Rankings/Plans/Profile.
**Authoritative design:** `set-logging-stepper-flow.html` §2 Option A (the dedicated Routines page —
already implemented in `mobile/app/routines.tsx`).
**Depends on:** nothing blocking. Runs in parallel with TICKET-079/080/081/082.

**File-ownership boundary (this agent edits ONLY):**
- `mobile/app/(tabs)/_layout.tsx`
- `mobile/app/_layout.tsx`
- `mobile/app/routines.tsx`  → **moved to** `mobile/app/(tabs)/routines.tsx`
- `mobile/src/components/RoutineStrip.tsx`  (only the `/routines` navigation target + see shared-type note)
**Do NOT edit:** `log.tsx`, `StepperLogger.tsx`, `ExercisePicker.tsx`, `smartSuggest.ts`,
`alternatives.ts`. (Other tickets own those.)

> Shared-type note: TICKET-082 Part A (Agent 3) adds `'free'` to the `RoutineSession.source` union and
> optional `category?`/`weekNumber?` fields, which are declared in this file's exported types
> (`RoutineStrip.tsx`). To avoid two agents editing the same lines, **Agent 3 makes those type edits.**
> This agent (083) must NOT edit those type declarations — only the `router.push('/routines')` target
> (see step 4). If you need the types, just read them.

---

## Current state
- The Routines page exists and matches mock §2 Option A: `mobile/app/routines.tsx` (header "Routines" +
  "＋ New"; "YOURS" list with Start/Edit/Delete; "STARTER SPLITS · tap to duplicate" chips).
- It is registered as a **Stack** screen, not a tab: `mobile/app/_layout.tsx:161`
  `<Stack.Screen name="routines" options={{ title: 'Routines', headerShown: false, gestureEnabled: true }} />`.
- It is only reachable via `RoutineStrip.tsx:300` `router.push('/routines')` ("Manage →" link buried in
  the Log tab). The founder wants it as a first-class destination.
- Current tabs (`mobile/app/(tabs)/_layout.tsx`): `index` (Home), `log` (center raised FAB, flash icon),
  `rankings`, `plans`, `profile` — 5 entries, Log is the centered FAB.

## Required changes

### 1. Move the screen into the tabs group
- Move `mobile/app/routines.tsx` → `mobile/app/(tabs)/routines.tsx`. (On this repo, prefer creating the
  new file with the same contents and emptying/removing the old route — see "file move" note below.)
- Adjust the moved screen for tab context:
  - **Remove the back button** (`routines.tsx:184-191`, the `chevron-back` `router.back()` TouchableOpacity)
    — tabs are top-level, there is nothing to go "back" to. Keep the "Routines" title + "＋ New" pill.
  - Fix relative import depth: the file moves from `mobile/app/` to `mobile/app/(tabs)/`, so imports like
    `../src/...` become `../../src/...`. Update ALL imports accordingly (theme, Icon, api/routines,
    api/templates). Verify each path resolves.
  - Keep the existing "Start" behaviour: `router.push('/(tabs)/log?routineId=${id}&routineName=...')`
    (`routines.tsx:173-176`). This deep-link is consumed by `log.tsx` (TICKET-080 preserves it) — do not
    change the param names.

### 2. Register the tab
In `mobile/app/(tabs)/_layout.tsx`, add a `<Tabs.Screen name="routines" ...>` with:
- `title: 'Routines'`, `tabBarLabel: 'Routines'`.
- Icon via the existing `AnimatedTabIcon`: use `focused ? 'barbell' : 'barbell-outline'` (Ionicons).
  If 'barbell' is unavailable in the bundled Ionicons set, fall back to `'list'`/`'list-outline'`.
  Verify the icon renders (the project's `Icon` wrapper is `mobile/src/components/Icon`).
- **Tab order:** `Home, Routines, Log (center FAB), Rankings, Profile` is the target. The Log tab must
  remain the **center raised FAB** (the `tabBarButton` treatment at `_layout.tsx:129-169` must be
  preserved verbatim). Because the FAB should stay visually centered, **move `plans` off the primary
  tab bar** is NOT desired (Plans must remain reachable). Instead use this 6-entry order:
  `index, routines, log(FAB), rankings, plans, profile`. With 6 entries the FAB sits left-of-exact-center.
  - > FAB-centering tradeoff: 6 tabs means the raised Log FAB is not mathematically centered. Implement
    > the 6-entry order above and **flag the visual balance for the Opus review** — do not silently drop
    > an existing tab (Home/Rankings/Plans/Profile all stay). If the Opus pass deems 6 too crowded, the
    > fallback (a follow-up ticket) is to fold Rankings/Plans behind a "More" — NOT in scope here.
- Apply the same `screenOptions` (active tint, header glossary button, etc.) automatically inherited
  from the `<Tabs>` wrapper — no per-screen header overrides needed beyond `title`.

### 3. Remove the old Stack registration
In `mobile/app/_layout.tsx`, remove the now-duplicate `<Stack.Screen name="routines" ... />` (line 161)
so the route resolves to the tab, not a stack screen. (Leaving both can cause expo-router route
ambiguity.) Verify the app still builds and `/routines`-style navigations resolve to the tab.

### 4. Repoint in-app navigation to the tab
- `RoutineStrip.tsx:300`: change `router.push('/routines')` → `router.push('/(tabs)/routines')`.
  (Keep the "Manage →" link working; it now jumps to the tab.)
- Search the codebase for any other `'/routines'` navigations and repoint them to `/(tabs)/routines`.
  (At time of writing, `RoutineStrip.tsx:300` is the only one.)

### File-move note (this repo)
`git mv`/`mv` can be unreliable on this mount. The reliable approach: create
`mobile/app/(tabs)/routines.tsx` with the corrected contents (Write tool), then replace the old
`mobile/app/routines.tsx` with a thin redirect OR remove it from routing. If the file truly cannot be
deleted, convert `mobile/app/routines.tsx` to immediately `<Redirect href="/(tabs)/routines" />` so the
old path still works and there is no duplicate screen. State clearly in your summary which approach you used.

## Explicit DO-NOT
- Do not remove or reorder existing tabs other than inserting `routines` (Home/Log/Rankings/Plans/Profile
  all stay).
- Do not alter the Log center-FAB `tabBarButton` styling.
- Do not edit `log.tsx`/`StepperLogger.tsx`/etc.; do not change the `RoutineSession` type declarations
  (Agent 3 owns those — see shared-type note).
- Do not change the `routineId` deep-link contract used by Start.

## Acceptance criteria
1. A **Routines** tab appears in the bottom nav with a recognizable icon and label; tapping it opens the
   routines screen (no back button, correct title + "＋ New").
2. The Log tab remains a centered raised FAB; Home/Rankings/Plans/Profile remain present and functional.
3. "Start" on a routine still deep-links to the Log tab and opens that routine's stepper
   (`/(tabs)/log?routineId=...` unchanged).
4. The old Stack route no longer double-registers `routines`; `RoutineStrip` "Manage →" jumps to the tab.
5. App builds; `peak-fettle-verify` parse-sweep clean; no broken imports from the file move.

## Test plan
1. Cold launch → bottom nav shows Routines tab → tap → routines screen renders with YOURS + STARTER SPLITS.
2. Create a routine via "＋ New"; duplicate a starter split; Start a routine → Log tab opens its stepper.
3. From Log tab, "MY ROUTINES → Manage →" → lands on the Routines tab.
4. Navigate across all tabs → no route-ambiguity warnings; FAB stays centered-ish and tappable.

## Definition of done
- Parse-sweep clean; **do not commit** — the orchestrator commits after the Opus design-spec review.
