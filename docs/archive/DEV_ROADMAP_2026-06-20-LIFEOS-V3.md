# DEV ROADMAP — Peak Fettle LifeOS v3 (TICKET-114…127)

*Created 2026-06-20. Companion-app completion sprint. Spec: `COMPANION_APP_V3_SPEC_2026-06-20.md`. Builds on the 2026-06-12 build (`lifeos/LIFEOS_BUILD_STATUS.md`).*
*House rules apply: every ticket's definition of done includes the `@babel/parser` parse-sweep over `lifeos/app` + `lifeos/src` (jsx+typescript), `node --check` on any server `.js`, and `xcodebuild` on a macOS host for any native target. Self-reports are not trusted — run the sweep on the working tree.*

## Model routing
- **Sonnet** (default workhorse): 114, 115, 116, 119, 120, 122, 123, 124, 125.
- **Opus**: 117 (App Intents ↔ RN reconciliation), 118 (ActivityKit lifecycle), 121 (partner data posture + server/privacy), and the final 127 integration+verification pass.
- **Haiku**: not used (mechanical-only if at all — e.g. seeding affirmation copy).

## Run order
```
114 (EAS build) → 115 (name) → 116 (widgets) → {117, 118}   [widget polish]
119 (feature framework + schema v2) → {120, 121, 122, 123}   [optional features]
124 (notifications)  ─ parallel
125 (fitness-app surfacing) ─ parallel
127 (verification + store readiness) GATES SHIP
```
**Scaffolding already committed by the 2026-06-20 spec run (do not re-create; build on these):** `lifeos/eas.json`, `lifeos/app.json` (`extra.eas` + name), `lifeos/src/config/product.ts` (name), `lifeos/src/config/features.ts`, `lifeos/targets/widget/expo-target.config.js`, `lifeos/targets/widget/index.swift`, `lifeos/src/services/widgetBridge.ts`, explicit `bundleIdentifier`s on the four FC targets.

---

# TICKET-114 — Separate EAS build for LifeOS
**Owner:** dev-infra + founder
**Date opened:** 2026-06-20
**Sev:** 🔴 P0 (without this there is no second build — the founder's core ask)
**Area:** `lifeos/eas.json`, `lifeos/app.json`, Apple Developer portal, EAS account
**Blocked by:** —

## Problem
`lifeos/` could not be built independently: it had no `eas.json` and no EAS `projectId`, and none of its five iOS app extensions (1 widget + 4 FamilyControls) were declared for EAS managed codesigning.

## Background
The fitness app builds from `mobile/` with its own `eas.json` + `extra.eas`. LifeOS is a separate Expo app (`com.peakfettle.lifeos`, slug `pf-lifeos`) on the **same backend** (same `/auth/*`, same Railway URL, same Google client IDs). EAS builds from `origin/main`, so all config must be committed and pushed.

## Implementation plan
1. **Done (verify in tree):** `lifeos/eas.json` exists with `development`/`preview`/`production` profiles mirroring `mobile/eas.json` (same `EXPO_PUBLIC_API_URL` + Google client IDs).
2. **Done (verify in tree):** `lifeos/app.json › extra.eas.build.experimental.ios.appExtensions` declares all five extensions with explicit bundle IDs:
   `com.peakfettle.lifeos.widget` (LifeOSWidget), `.monitor`, `.shield`, `.shieldaction`, `.report`. App Group `group.com.peakfettle.lifeos` on each; `com.apple.developer.family-controls` on the four FC ones.
3. **Founder action — mint the EAS project:** from `lifeos/`, run `eas init` (or `eas project:init`) under the Peak Fettle EAS account. This writes the real `projectId`, **replacing the placeholder** `"PENDING-run-eas-init-see-TICKET-114"` in `lifeos/app.json`. Commit + push.
4. **Founder action — Apple entitlement:** confirm the **FamilyControls distribution entitlement** is requested for `com.peakfettle.lifeos` **and** the four extension bundle IDs (this is v2 TICKET-102 §1; the new bundle IDs must be on the request). Dev builds work on the development entitlement meanwhile.
5. **macOS build:** `cd lifeos && npm install && npx expo prebuild -p ios`; resolve any Swift signature drift in `targets/` + `native/`; then `eas build --profile preview --platform ios`.

## Acceptance criteria
1. `python3 -m json.tool lifeos/eas.json` and `… lifeos/app.json` both succeed (valid JSON).
2. `lifeos/app.json` `extra.eas.projectId` is a real UUID (not the placeholder) after step 3.
3. `eas build --profile preview --platform ios` from `lifeos/` produces an installable build (or fails only on the documented Apple-entitlement gate, not on config).
4. The five extensions appear in the built `.ipa` with the bundle IDs in step 2.
5. App launches on a device via the dev client to the existing entitlement-gated Today screen.

## Notes
- Only the founder's EAS account can create the `projectId`; agents cannot.
- `submit.production` is stubbed `{}` — fill bundle/ASC app id at store-submission time (TICKET-127).

---

# TICKET-115 — Lock product name → "Peak Fettle LifeOS"
**Owner:** dev-frontend
**Date opened:** 2026-06-20
**Sev:** 🟠 P1
**Area:** `lifeos/src/config/product.ts`, `lifeos/app.json`, `lifeos/targets/shield-config/*`, store listing
**Blocked by:** —

## Problem
Q7 (name) was open; the build used the working title "Peak Fettle Life OS". Founder decided 2026-06-20: ship as **"Peak Fettle LifeOS"**.

## Implementation plan
1. **Done (verify):** `PRODUCT_NAME='Peak Fettle LifeOS'`, `PRODUCT_SHORT='LifeOS'` in `lifeos/src/config/product.ts`; `app.json` `name` = "Peak Fettle LifeOS".
2. Grep the tree for any hardcoded "Life OS"/"Peak Fettle Mind"/"Fettle Rest" string and route it through `PRODUCT_NAME`/`PRODUCT_SHORT`:
   `grep -rn "Life OS\|Fettle Mind\|Fettle Rest" lifeos/` — fix each to import from `product.ts` (the constant already existed to make this a one-line swap; honor it).
3. The Swift `ShieldConfiguration` block screen shows the app name — it cannot import the TS constant. Set the displayed name string in `lifeos/targets/shield-config/` to "Peak Fettle LifeOS" (single source: a Swift constant at the top of that target's file).
4. Asset check: app display name under the icon, onboarding/disclaimer copy, notification templates all read `PRODUCT_NAME`/`PRODUCT_SHORT`.

## Acceptance criteria
1. `grep -rn "Life OS\|Fettle Mind\|Fettle Rest" lifeos/` returns **no user-facing literals** (only historical comments allowed).
2. App display name, onboarding, and the shield screen all read "Peak Fettle LifeOS" / "LifeOS".
3. Parse-sweep green.

## Notes
- ⚠️ Bundle ID / slug / scheme stay `com.peakfettle.lifeos` / `pf-lifeos` / `lifeos` (renaming those breaks the EAS project + deep links — do not).
- Trademark clearance for the name is TICKET-127 §store-readiness.

---

# TICKET-116 — iOS widgets: target + bridge + 4 widget kinds
**Owner:** dev-frontend + dev-native
**Date opened:** 2026-06-20
**Sev:** 🟠 P1
**Area:** `lifeos/targets/widget/`, `lifeos/src/services/widgetBridge.ts`, `lifeos/app/_layout.tsx`, `lifeos/app.json`
**Blocked by:** 114

## Problem
LifeOS had no widgets; the founder wants "widgets like the main app." The fitness app's widget pattern (App-Group payload written by a JS bridge, SwiftUI WidgetKit target) is proven and must be mirrored.

## Background
Widget extensions cannot do network or DB calls — they read a JSON payload from the App Group that the app writes. The fitness implementation is `mobile/targets/widget/` + `mobile/src/services/widgetBridge.ts`, wired in `mobile/app/_layout.tsx` (`startWidgetBridge()` at line ~150). LifeOS reuses the authoritative streak engine for the ring.

## Implementation plan
1. **Done (verify):** `lifeos/targets/widget/expo-target.config.js` (type `widget`, name `LifeOSWidget`, families incl. lock-screen + ActivityKit) and `index.swift` (4 widgets: `LifeOSStreakRing`, `LifeOSTodayHabits`, `LifeOSReclaimed`, `LifeOSFocusStatus`, + the Live-Activity stub for 118). Decodes `LifeOSWidgetData` from App Group key `widget_payload`; paints from payload `theme`.
2. **Done (verify):** `lifeos/src/services/widgetBridge.ts` — `buildWidgetPayload()` reads `lo_habit_logs` / `lo_habits` / `lo_focus_events` / `lo_meta`; uses `computeStreak` from `engine/streaks`; writes via `@bacons/apple-targets` `ExtensionStorage`; `startWidgetBridge()` subscribes to `localDb` changes (debounced).
3. **Wire it up:** in `lifeos/app/_layout.tsx`, add `import { startWidgetBridge } from '../src/services/widgetBridge';` and call `startWidgetBridge();` once inside the root mount effect (mirror `mobile/app/_layout.tsx:45,150`).
4. **Reconcile `lo_focus_events` vocabulary:** confirm TICKET-104's emitter writes the `kind` values the bridge reads for "blocks held" (`'block_held'` / `'unlock_abandoned'`) and `meta_json.minutes` for reclaimed time. If the emitter uses other strings, change ONE side so they match. Add the reconciled vocabulary to a comment in both files.
5. **Accessibility:** every widget view gets an `accessibilityLabel`; ring/score never color-only (numeral always present); verify Dynamic Type doesn't truncate.
6. `app.json` already sets `NSSupportsLiveActivities` and declares the widget extension in `extra.eas`.

## Acceptance criteria
1. On a device build: adding each of the four widgets shows live data (complete a habit → Today's-habits widget reflects it within a reload; streak ring shows the engine's `current`).
2. Streak shown by the widget equals `computeStreak(...).current` for the same data (assert in a unit test on `aggregateDailyStatus` + `computeStreak`).
3. Widget colors match the active in-app theme (switch theme → rebuild payload → widget repaints).
4. Lock-screen accessory families render (circular/inline/rectangular).
5. Bridge never throws on Android / Expo Go (guarded) — `startWidgetBridge()` is a no-op off iOS.
6. Parse-sweep green; `xcodebuild` compiles the widget target on macOS.

## Notes
- Interactive in-widget check-off is **TICKET-117** (this ticket = display + `lifeos://habits` deep link).
- Widget code ships only via a full EAS build — no OTA. Note this in release docs.

---

# TICKET-117 — Today's-habits interactive check-off (App Intents)
**Owner:** dev-native (Opus)
**Date opened:** 2026-06-20
**Sev:** 🟡 P2
**Area:** `lifeos/targets/widget/` (Swift AppIntent), `lifeos/src/services/widgetBridge.ts`, habit-log reconcile
**Blocked by:** 116

## Problem
Marking a habit done should be possible from the home-screen widget **without opening the app** (iOS 17+ App Intents). The widget extension cannot write the RN SQLite DB directly, so it must hand the action to the app via the shared App Group, and the app must reconcile it.

## Implementation plan
1. Add an `AppIntent` (`ToggleHabitIntent`) in the widget target with a `habitId` parameter and a `Button(intent:)` per row in `TodayHabitsView` (gated `if #available(iOS 17.0)`; below 17 keep the deep-link row from 116).
2. The intent appends `{habitId, date, ts}` to a **pending-toggles** array in the App Group (`UserDefaults(suiteName: group.com.peakfettle.lifeos)` key `pending_habit_toggles`) and calls `WidgetCenter.shared.reloadAllTimelines()` for instant optimistic paint.
3. RN side: on app foreground AND in `startWidgetBridge`'s subscribe loop, drain `pending_habit_toggles`: for each, write a `lo_habit_logs` row (`status='done'`, `UNIQUE(habit_id,date)` upsert) via `localDb.execute(..., {tables:['lo_habit_logs']})`, then clear the array. Reuse the existing habit-logging function from TICKET-103 (do not duplicate streak logic).
4. Optimistic state: the widget payload includes a freshly-drained view so the checkbox stays consistent across reloads.

## Acceptance criteria
1. iOS 17+ device: tapping a habit checkbox in the widget logs it (visible in-app after foreground) without launching the app.
2. Double-tap / offline-app does not create duplicate logs (UNIQUE upsert; idempotent drain).
3. iOS 16 falls back to the deep-link row (no crash, no missing button).
4. The reconciled write goes through TICKET-103's logging path (streak/milestone stays correct).
5. Parse-sweep + `xcodebuild` green.

## Notes
- Keep the intent tiny and crash-proof: an unknown `habitId` is dropped on drain, never throws.
- This is the only widget that mutates data — keep the contract (App-Group queue, app-side write) documented in both files.

---

# TICKET-118 — Focus-session Live Activity (ActivityKit + Dynamic Island)
**Owner:** dev-native (Opus)
**Date opened:** 2026-06-20
**Sev:** 🟡 P2
**Area:** `lifeos/targets/widget/index.swift` (`LifeOSFocusAttributes`), new RN ActivityKit module, `lifeos/app/(tabs)/focus.tsx`, `lo_meta`
**Blocked by:** 116

## Problem
A running focus/blocker session should show a live countdown on the lock screen + Dynamic Island, started/ended from RN.

## Background
The Live Activity UI (`LifeOSFocusLiveActivity`, attributes `LifeOSFocusAttributes{sessionName, accentHex; state: endsAt, blocksHeld}`) already exists in `index.swift`. ActivityKit cannot be started from a widget — it is started from the app process via a native module. The widget bridge also reads `lo_meta.active_focus` for the static Focus-status widget; keep both in sync.

## Implementation plan
1. Create a small Expo local module (`lifeos/modules/live-activity/`, Swift) exposing `startFocusActivity(name, endsAtISO, accentHex)`, `updateFocusActivity(blocksHeld, endsAtISO)`, `endFocusActivity()` over `ActivityKit.Activity<LifeOSFocusAttributes>`. iOS 16.2+; no-op + resolve on older OS / Android.
2. On focus-session start (TICKET-104 focus flow / `focus.tsx`): call `startFocusActivity(...)` AND write `lo_meta.active_focus = JSON{name, endsAt}` (the bridge's static-widget contract). On end / auto-reshield: `endFocusActivity()` + delete `lo_meta.active_focus`.
3. Update `blocksHeld` on the activity when a `lo_focus_events` block-held event fires during the session.
4. Respect reduced-motion / battery: no animation loops; the timer uses SwiftUI `Text(date, style: .timer)` (system-driven, no polling).

## Acceptance criteria
1. Starting a focus session shows a Dynamic Island compact timer + lock-screen banner with the session name and countdown.
2. Ending the session (or its scheduled end) removes the activity within seconds.
3. `lo_meta.active_focus` is set on start and cleared on end (Focus-status widget agrees with the Live Activity).
4. iOS < 16.2 and Android: module calls are safe no-ops; focus sessions still work.
5. Parse-sweep + `xcodebuild` green.

## Notes
- Max Live Activity lifetime is 8h active / 12h system cap — fine for focus sessions; cap session duration accordingly.
- Remote push updates are NOT needed (timer is local) — do not add an APNs dependency.

---

# TICKET-119 — Feature-toggle framework + schema v2
**Owner:** dev-frontend
**Date opened:** 2026-06-20
**Sev:** 🟠 P1 (unblocks all optional features)
**Area:** `lifeos/src/config/features.ts`, `lifeos/src/hooks/useFeatureFlags.ts`, `lifeos/app/(tabs)/you.tsx` (or a `you/features.tsx`), `lifeos/src/db/migrations.ts`, `lifeos/src/db/localSchema.ts`
**Blocked by:** —

## Problem
Founder decision (2026-06-20): every net-new feature must be individually user-toggleable ("user can choose which to use and which to disable"). Need one switch framework + the schema for the new features' data.

## Implementation plan
1. **Done (verify):** `lifeos/src/config/features.ts` — `OPTIONAL_FEATURES` registry (4 features, default OFF), `DEFAULT_FLAGS`, `resolveFlags()`, `FEATURE_FLAGS_META_KEY='feature_flags'`.
2. **Hook** `lifeos/src/hooks/useFeatureFlags.ts`: on mount, `localDb.getFirst("SELECT value FROM lo_meta WHERE key='feature_flags'")` → `resolveFlags(JSON.parse(value))`; expose `{flags, setFlag(key,on), isEnabled(key)}`. `setFlag` writes the merged JSON back via `localDb.execute("INSERT OR REPLACE INTO lo_meta(key,value) VALUES('feature_flags',?)", [json], {tables:['lo_meta']})`.
3. **Settings UI** in the `You` tab: a "Features" section listing each `OPTIONAL_FEATURES` entry with a `Switch` bound to `flags[key]` + the registry `description` underneath. Toggling OFF hides the feature's entry points app-wide (each feature screen guards on `isEnabled`).
4. **Schema v2 migration** — append to the `MIGRATIONS` array in `lifeos/src/db/migrations.ts` (idempotent; the runner already persists `lo_meta.schema_version`):
```ts
{
  to: 2,
  run: async (db) => {
    await db.execute(`CREATE TABLE IF NOT EXISTS lo_app_ratings (
      token_label TEXT PRIMARY KEY,
      rating TEXT NOT NULL CHECK (rating IN ('energizing','neutral','draining')),
      updated_at TEXT NOT NULL)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS lo_share_events (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT, ts TEXT NOT NULL)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS lo_partner (
      id TEXT PRIMARY KEY DEFAULT 'self', partner_label TEXT, invite_code TEXT,
      share_scope_json TEXT NOT NULL DEFAULT '{}', paused INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS lo_affirmations (
      id TEXT PRIMARY KEY, text TEXT NOT NULL, identity_tag TEXT,
      enabled INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'user')`);
  },
}
```
5. **Backup list:** add `'lo_share_events'`, `'lo_partner'`, `'lo_affirmations'` to `BACKUP_TABLES` in `localSchema.ts`. Do **NOT** add `lo_app_ratings` (keyed to device-scoped FamilyActivity tokens — re-tag on restore, same rule as `lo_focus_configs`).

## Acceptance criteria
1. Fresh install: `lo_meta.schema_version` = `'2'`; all four new tables exist (`SELECT name FROM sqlite_master`).
2. Existing v1 DB (seed v1, then open): migration runs once, advances to 2, no data loss (existing habits/streaks intact) — assert in a migration unit test alongside the existing streak/direction tests.
3. Each feature defaults OFF; toggling a switch persists across app restart; toggling OFF removes that feature's entry points.
4. `useFeatureFlags` is the ONLY way screens read flags (grep: no hardcoded feature gating).
5. Parse-sweep green; `node lifeos/__tests__/*.test.js` still green.

## Notes
- Keep migrations additive + idempotent (CONTENT in CLAUDE.md: drift-tolerant DB ops).
- Optional features are OFF by default so the core experience is unchanged unless the user opts in.

---

# TICKET-120 — Shareable milestone cards (flag `shareCards`)
**Owner:** dev-frontend
**Date opened:** 2026-06-20
**Sev:** 🟡 P2
**Area:** `lifeos/src/features/share/`, milestone hooks, `lo_share_events`
**Blocked by:** 119

## Problem
At streak/goal milestones, let users share a styled card. Growth lever; must be opt-in and never coercive.

## Implementation plan
1. Guard the whole feature on `useFeatureFlags().isEnabled('shareCards')`.
2. Milestone trigger: reuse `engine/streaks` `MILESTONES` (7/30/100/365) plus add **66** (Lally 2010 mean) as a celebratory-only milestone. When a streak crosses a milestone, show a non-blocking "Share your N-day streak?" affordance (dismissable; never a pop-up that interrupts a flow).
3. Card: an off-screen React view (streak count, stack/habit names, a small heat snippet, "Peak Fettle LifeOS" wordmark) captured via `react-native-view-shot` → shared via `expo-sharing` (already a dependency). No upload, no in-app feed.
4. Log `lo_share_events {kind:'milestone', ref:'<streak>:<n>', ts}` locally for the Insights "cards shared" stat. No PII leaves the device except what the user chooses to share.

## Acceptance criteria
1. Feature OFF (default) → no milestone share affordance anywhere.
2. Feature ON → crossing a milestone offers a share card; the rendered image contains the streak count + wordmark; sharing uses the OS share sheet.
3. Dismissing is always available; no modal traps; copy is celebratory, never shaming.
4. `lo_share_events` row written on share; visible in Insights.
5. Parse-sweep green.

## Notes
- `expo-sharing` + a view-capture lib only; if adding `react-native-view-shot`, pin a version compatible with RN 0.81 / Expo 54 and note it for the EAS build.
- Legal: low risk (user shares own data). Keep the wordmark/trade dress ours — no competitor visual references.

---

# TICKET-121 — Accountability partner (flag `accountabilityPartner`) — Q33
**Owner:** dev-fullstack (Opus)
**Date opened:** 2026-06-20
**Sev:** 🟡 P2
**Area:** `lifeos/src/features/partner/`, `lo_partner`, (option a) a minimal server endpoint, App Privacy disclosure
**Blocked by:** 119; **founder decision Q33**

## Problem
Let the user designate ONE person who sees a **daily summary** (e.g. "3/4 habits today, streak intact") — never raw data, mood notes, or blocked-app lists. Data posture is a founder choice (Q33).

## Implementation plan
1. Guard on `isEnabled('accountabilityPartner')`. One partner only; `lo_partner` row (`partner_label`, `invite_code`, `share_scope_json`, `paused`).
2. **Compose the summary** on-device from `lo_habit_logs`/streak: a single opaque string (no per-habit detail unless the user widens `share_scope`). Show the user the exact summary before first send.
3. **Q33 — pick posture:**
   - **(a) Recommended — invite-code + minimal server:** add `POST /lifeos/partner/summary {code, summaryText}` (stores ONLY the latest summary string + updated_at, keyed by code; no content tables) and `GET /lifeos/partner/:code` for the partner to view via a lightweight web page or their own app. Requires: server route (reuse auth/rate-limit middleware), RLS, an App Privacy "Data shared with others: usage summary" disclosure, and a clear consent screen. Partner can be revoked (rotate code) anytime.
   - **(b) Lightest — share-sheet only:** user manually sends the daily summary via the OS share sheet (or an auto-drafted message). Zero server, zero new disclosure, but no automatic delivery. Choose this if avoiding any new server data is preferred.
4. Pause/revoke control in `You › Features`; revoking clears `invite_code` (option a rotates server key).

## Acceptance criteria
1. Feature OFF (default) → no partner UI, no network calls.
2. ON → user pairs a partner, previews the exact summary, and can pause/revoke; the partner only ever receives the summary string (assert no raw habit/mood/app data in the payload).
3. (Option a) server stores only `{code, summaryText, updated_at}`; deleting the pairing removes it; rate-limited; RLS verified in TICKET-127 security pass.
4. App Privacy / Data Safety updated for shared data (option a).
5. Parse-sweep + (option a) `node --check` on the new server route green.

## Notes
- Privacy-by-design: default to the **least** data shared; never include mood notes or blocked-app identities. This is the highest-privacy-sensitivity feature — Opus owns it and it gets explicit review in 127.

---

# TICKET-122 — App wellbeing scoring (flag `appWellbeingScoring`)
**Owner:** dev-frontend + dev-native
**Date opened:** 2026-06-20
**Sev:** 🟡 P2
**Area:** `lifeos/src/features/appscore/`, `lo_app_ratings`, FamilyActivity token labels, Insights
**Blocked by:** 119

## Problem
Let users tag the apps they limit as Energizing / Neutral / Draining and see a weekly "quality" score — richer than raw minutes. Must respect that iOS only exposes **opaque app tokens** (you cannot read which app it is).

## Implementation plan
1. Guard on `isEnabled('appWellbeingScoring')`.
2. Tagging UI: render the user's existing `FamilyActivitySelection` entries via the system `Label(ApplicationToken)` (SwiftUI, bridged) — the app shows the OS-rendered name/icon but stores only an **opaque token label key** + the rating in `lo_app_ratings`. No bundle IDs, all on-device.
3. Weekly "quality" score: combine each tagged app's on-device usage (from `DeviceActivityReport`, already on-device) with its rating into an additive index (e.g. draining minutes count negative, energizing positive) — define an **independent** formula (do NOT copy Roots' "Digital Dopamine" method; it is patent-pending). Show in Insights with correlation-not-causation framing.
4. Device-scoped: `lo_app_ratings` is excluded from backup; on restore, prompt "re-tag your apps" (same UX as re-pick blocked apps).

## Acceptance criteria
1. Feature OFF (default) → no tagging UI, no score.
2. ON → user tags selected apps; ratings persist in `lo_app_ratings`; weekly score renders in Insights, on-device only.
3. No raw usage/app identity leaves the device (assert no network in this feature).
4. Restore flow prompts re-tagging (ratings not in backup).
5. Parse-sweep + `xcodebuild` (for the token-label bridge) green.

## Notes
- The score is informational, never judgmental; copy follows CONTENT_SAFETY (no shame).
- If the FamilyActivity token-label bridge is non-trivial, ship v1 tagging at the category level (also opaque) and refine later.

---

# TICKET-123 — Identity affirmations (flag `affirmations`)
**Owner:** dev-frontend
**Date opened:** 2026-06-20
**Sev:** 🟡 P2
**Area:** `lifeos/src/features/affirmations/`, `lo_affirmations`, notification pipeline (124)
**Blocked by:** 119, 124

## Problem
Optional gentle morning/evening affirmations tied to the identity the user is building (from the direction survey's values ranking). Must stay non-clinical (CONTENT_SAFETY).

## Implementation plan
1. Guard on `isEnabled('affirmations')`.
2. Seed a small human-written library into `lo_affirmations` (`source='seed'`), tagged by `identity_tag` aligned to the direction engine's values/domains (e.g. "disciplined", "calm", "focused"). Let users add their own (`source='user'`) and enable/disable individual lines.
3. Selection: pick from lines whose `identity_tag` matches the user's top values (from `lo_survey_responses`); fall back to general lines.
4. Delivery: schedule `LO_AFFIRMATION` notifications at the user's chosen morning/evening times via TICKET-124's pipeline; counts toward the global ≤2/day cap; quiet hours respected. In-app, surface today's affirmation on the Today tab (only when the flag is ON).
5. CONTENT_SAFETY pass: no clinical/therapeutic claims; nothing that could read as treatment; all copy reviewable in the repo.

## Acceptance criteria
1. Feature OFF (default) → no affirmation notifications, no Today-tab affirmation card.
2. ON → user sets times; an affirmation is delivered at those times (verified on device) and shown on Today; user can disable individual lines and add their own.
3. Affirmation pushes respect the ≤2/day global cap + quiet hours (do not bypass 124's limiter).
4. All seed copy passes the CONTENT_SAFETY checklist; `lo_affirmations` rides the backup.
5. Parse-sweep green.

## Notes
- Apple Watch delivery is a later add (note in backlog).
- Keep tone gentle and identity-anchored ("I am someone who…"), per the research on identity-based habits.

---

# TICKET-124 — Notifications completion (queue writers + reminder-time UI)
**Owner:** dev-fullstack
**Date opened:** 2026-06-20
**Sev:** 🟠 P1
**Area:** `peak-fettle-agents/server` (notification_queue writers), `lifeos/src/...` reminder-time UI, push pipeline
**Blocked by:** —

## Problem
TICKET-110 left notifications **partial**: the `LO_*` types are registered server-side with rules, but the **queue writers** and the **client reminder-time UI** were deferred pending a device build to verify delivery.

## Implementation plan
1. Implement `notification_queue` writers for: `LO_STACK_REMINDER` (fires at each stack's anchor time), `LO_WEEKLY_REVIEW`, `LO_MOOD_PROMPT`, `LO_RECAP`, `LO_MICRO_CHECK`, and `LO_AFFIRMATION` (TICKET-123). Reuse the hardened Expo Push dispatcher (note: column `fcm_token` stores an **Expo** token — send via the Expo Push API, per PUSH-001/002 in CLAUDE.md).
2. Enforce rules in the writer/limiter: all opt-in default-OFF, **max 2/day across all `LO_*` types**, quiet-hours window, never-shaming copy (templates reviewed against CONTENT_SAFETY). Session-start blocking needs no push (DeviceActivity fires natively).
3. Client reminder-time UI: per-stack reminder time (Habits), weekly-review time (Goals), mood-prompt + affirmation times (You/Features). Times stored locally; the schedule the device needs for local notifications is set via `expo-notifications`; server push only for cross-device/cloud-driven types.
4. Verify on a device build that each type delivers once and the 2/day cap holds.

## Acceptance criteria
1. Each `LO_*` type can be enabled and delivers on schedule on a physical device.
2. The 2/day global cap and quiet hours are enforced (test: enabling many types never exceeds 2/day).
3. All default OFF; copy passes CONTENT_SAFETY (no shame).
4. Token transport matches the dispatcher (Expo Push API) — no FCM-endpoint mismatch (PUSH-001 regression check).
5. Parse-sweep + `node --check` on server files green.

## Notes
- This unblocks TICKET-123 affirmations delivery.
- Reuse, don't fork, the fitness push pipeline.

---

# TICKET-125 — Surface LifeOS in the fitness app (whole-person streak + entry) — Q32
**Owner:** dev-frontend
**Date opened:** 2026-06-20
**Sev:** 🟡 P2
**Area:** `mobile/app/(tabs)/...`, `mobile/src/...`, deep link `lifeos://`
**Blocked by:** — ; **founder decision Q32**

## Problem
The founder asked for a "separate mobile tab" to reach the companion. The whole-person streak endpoint exists (TICKET-111) but the fitness app doesn't surface LifeOS yet. Placement is a product choice (Q32).

## Implementation plan
1. **Q32 — pick placement:**
   - **(a) Recommended — card in the `You/Profile` tab:** add a "LifeOS" card showing the whole-person streak ("Your whole-person streak: N days") + CTA. If LifeOS is installed, the CTA deep-links `lifeos://` (use `Linking.canOpenURL`); else it opens the LifeOS App Store page. Lowest risk; no tab-bar crowding (fitness app already has 5 tabs). Place near the existing streak/insight surfaces in `mobile/app/(tabs)/profile.tsx`.
   - **(b) Sixth bottom tab:** add a `Tabs.Screen` in `mobile/app/(tabs)/_layout.tsx` that routes to a LifeOS promo/whole-person-streak screen with the same CTA. More prominent; crowds the tab bar.
2. Whole-person streak: read the existing computed value from the server (TICKET-111's endpoint) — do not recompute. Free fitness users (local-first) see the streak from local workouts + a cached LifeOS activity flag; do not add a blocking network call on mount (CLAUDE.md local-first rule).
3. CTA copy: "Open LifeOS" (installed) / "Get LifeOS — included with Pro" (not installed). No dark patterns.

## Acceptance criteria
1. The chosen surface shows the whole-person streak and a working CTA (deep link when installed, store link otherwise).
2. No new blocking REST call on a free user's mount path (local-first invariant held; verify with the `from '../api/` grep rule in CLAUDE.md).
3. Parse-sweep green for `mobile/`.

## Notes
- Default to (a) unless the founder picks (b) in Q32. Code for (a) is the deliverable; (b) is a layout variant of the same screen.
- Deep link scheme is `lifeos://` (registered in `lifeos/app.json`).

---

# TICKET-126 — (reserved)
Folded into TICKET-119 (schema v2 migration). Kept as a number to avoid renumbering.

---

# TICKET-127 — v3 verification, compliance & store-readiness
**Owner:** dev-QA + founder (Opus final pass)
**Date opened:** 2026-06-20
**Sev:** 🟠 P1 (gates ship)
**Area:** whole `lifeos/` surface + `mobile/` deltas + store metadata
**Blocked by:** 114–125

## Problem
v3 adds a separate build, native widgets/Live Activity, a server endpoint (maybe), and new data types. All must pass the project's verification bar and store/legal review before shipping.

## Implementation plan
1. **Parse-sweep (the real DoD):** `@babel/parser` (jsx+typescript) over every `.ts/.tsx` in `lifeos/app` + `lifeos/src` (and the `mobile/` deltas) → 0 failures. `node --check` every server `.js` (incl. any TICKET-121 route). Run on the working tree (do not trust ledgers).
2. **JSON/native:** `python3 -m json.tool` on `lifeos/eas.json` + `lifeos/app.json`; `xcodebuild` compiles all five iOS extensions + the app on macOS.
3. **Tests:** `node lifeos/__tests__/*.test.js` green; add the new unit tests (aggregateDailyStatus↔computeStreak parity for the widget; schema-v2 migration fresh+upgrade).
4. **Security pass** (`/security-review`): entitlement bypass (free user must not reach LifeOS features by JWT manipulation), App-Group data exposure (what can another process read?), deep-link forge (`lifeos://unlock` cannot skip friction — state lives app-side), and (if 121a) partner endpoint RLS + the "summary only, never raw data" guarantee.
5. **Privacy/legal:** update App Privacy (iOS) + Data Safety (Android) for any newly shared data (121a); verify account-deletion + data-export cover the new tables; legal review of the privacy addendum delta.
6. **Trademark:** clear "Peak Fettle LifeOS" (USPTO classes 9 + 42); confirm no competitor marks/trade dress in copy or share cards.
7. **App Store positioning (Q16):** category Productivity; FamilyControls usage justification in review notes; no mental-health claims anywhere; 17+ rating + age gate present.
8. **Accessibility:** widgets have `accessibilityLabel`s; no color-only encodings; 44pt targets; Dynamic Type; reduced-motion honored on friction + celebration animations.

## Acceptance criteria
1. Parse-sweep, `node --check`, JSON validation, and `xcodebuild` all green on the working tree.
2. All unit tests (existing + new) pass.
3. Security review closes with no open criticals (entitlement, App-Group, deep-link, partner endpoint).
4. App Privacy + Data Safety forms accurate; deletion/export verified for all `lo_*` tables.
5. Trademark cleared; store positioning compliant with Q16; 17+ rating set.
6. Founder sign-offs: crisis copy, protocol/affirmation content, privacy addendum.

## Notes
- This re-runs the v2 TICKET-113 bar over the v3 surface; it does not replace 113.
- Ship order (CLAUDE.md): fix → commit → `git push origin main` (server deploy) → `eas build` → install → test. A local commit changes nothing the user can see.
