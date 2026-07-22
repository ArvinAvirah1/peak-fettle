# Peak Fettle LifeOS — Companion App v3 Spec (completion + widgets + new features)

*Author: Cowork agent run, 2026-06-20. Builds directly on `COMPANION_APP_V2_LIFEOS_SPEC_2026-06-11.md` and the 2026-06-12 build (`lifeos/LIFEOS_BUILD_STATUS.md`, TICKET-100…113). This spec **extends** v2 — it does not supersede it. Founder decisions captured 2026-06-20 (Q7, Q32, Q33). Implementation tickets: `DEV_ROADMAP_2026-06-20-LIFEOS-V3.md` (TICKET-114…127).*

---

## 0. How to read this — what already exists vs. what this adds

**This app is ~80% built already.** It is the `lifeos/` Expo app (the four-pillar "Life OS": **Block · Build · Aim · Direct**). Do not rebuild it. The v2 spec + build status are the source of truth for everything below TICKET-114; this v3 spec only specifies the **gaps and additions** the founder asked for on 2026-06-20.

| Already built (do not redo) | Status | Source |
|---|---|---|
| `lifeos/` standalone Expo app, shared auth, `lifeos_access` Pro gate + upsell | ✅ | TICKET-101 |
| Local-first SQLite (schema v1 + migration runner) + E2E backup wiring | ✅ | TICKET-101 |
| Habits, **stacks** & guided stack player (incl. wake→read→stretch→brush→wash-face) | ✅ + 30 tests | TICKET-103 |
| **Forgiving streak engine** (`lifeos/src/engine/streaks.ts`) | ✅ + tests | TICKET-103 |
| Opal-style **blocker**: 4 FamilyControls native targets, escalating wait + breathing gate + snooze budget, shield handoff | ✅ code (⬜ compiled) | TICKET-102/104 |
| Goals (6 domains) + weekly review ritual | ✅ | TICKET-105 |
| Deterministic **direction engine** (`directionModel.v1.ts`) | ✅ + 207 tests | TICKET-106 |
| Onboarding survey + protocol acceptance | ✅ | TICKET-107 |
| Mood / CBT toolkit (11 exercises) | ✅ | TICKET-108 |
| Insights (recap, on-device screen-time report, correlations) | ✅ | TICKET-109 |
| Safety scaffolding (crisis, disclaimer, CONTENT_SAFETY.md, privacy addendum draft) | ✅ | TICKET-100 |

**The gaps this v3 spec closes (founder asks, 2026-06-20):**

1. **Name** is now decided — ship as **"Peak Fettle LifeOS"** (Q7 resolved). *(Scaffolded: `lifeos/src/config/product.ts`, `lifeos/app.json`.)*
2. **A separately runnable EAS build** — `lifeos/` had no `eas.json` and no EAS `projectId`. *(Scaffolded: `lifeos/eas.json`; `app.json` `extra.eas` block with all 5 app-extension declarations.)* → **TICKET-114**.
3. **Widgets** ("like the main app") — `lifeos/` had none. Four widget kinds + a focus Live Activity. *(Scaffolded: `lifeos/targets/widget/`, `lifeos/src/services/widgetBridge.ts`.)* → **TICKET-116/117/118**.
4. **Four net-new, user-toggleable features** — shareable milestone cards, accountability partner, app-wellbeing scoring, identity affirmations. *(Scaffolded: `lifeos/src/config/features.ts`.)* → **TICKET-119…123**.
5. **Finish notifications** (TICKET-110 was partial) → **TICKET-124**.
6. **Surface LifeOS from the main fitness app** (the "separate mobile tab" + whole-person streak) → **TICKET-125** (placement is **Q32**, founder choice).

Everything here honors the locked v2 decisions: **local-first, Pro-bundled, never marketed as a mental-health app, forgiving streaks, no money stakes, no runtime AI.**

---

## 1. Decisions applied (2026-06-20)

| # | Decision | Detail |
|---|----------|--------|
| **Q7** | **Name = "Peak Fettle LifeOS"** | `PRODUCT_NAME='Peak Fettle LifeOS'`, `PRODUCT_SHORT='LifeOS'`. Slug `pf-lifeos`, bundle `com.peakfettle.lifeos`, scheme `lifeos` unchanged. ⚠️ Trademark clearance still required before store submission (TICKET-127 / §8). |
| **Widgets** | Build **all four** | Streak ring, Today's-habits checklist (interactive), Focus-session Live Activity, Time-reclaimed/blocks-held counter. |
| **New features** | Add **all four**, each **user-toggleable** | "User can choose which to use and which to disable." All ship **OFF by default** and are switched in `You › Features` (TICKET-119). |
| **Q32** | Main-app surfacing of LifeOS | **OPEN — founder choice** (dedicated tab vs. card in the You/Profile tab). Recommendation + exact code in TICKET-125. |
| **Q33** | Accountability-partner data posture | **OPEN — founder choice** (invite-code + minimal server summary vs. share-sheet only / no server). Recommendation in TICKET-121. |

---

## 2. Architecture additions

All additions are **purely additive** to the v2 architecture (local-first, tiny server surface). No change to the tier policy, the existing schema v1 tables, or the blocker design.

### 2.1 Separate EAS build (TICKET-114)
- `lifeos/eas.json` — three profiles (`development`/`preview`/`production`) mirroring `mobile/eas.json` (same shared backend URL + Google client IDs; LifeOS uses the same `/auth/*` and entitlement endpoints).
- `lifeos/app.json › extra.eas`:
  - `projectId` — **placeholder** `"PENDING-run-eas-init-see-TICKET-114"`. Only the founder's EAS account can mint a real project ID (`eas init` from `lifeos/`). EAS will print a clear error until replaced.
  - `build.experimental.ios.appExtensions` — declares **all five** iOS app extensions for managed codesigning: `LifeOSWidget` + the four FamilyControls targets (`…Monitor`, `…ShieldConfig`, `…ShieldAction`, `…ActivityReport`), each with explicit bundle IDs and App-Group entitlements. *(The four FC target configs were given explicit `bundleIdentifier`s so EAS provisioning is deterministic.)*
- Build command (post-`eas init`): `cd lifeos && eas build --profile preview --platform ios`. This is the founder's "another eas build."

### 2.2 Widgets (TICKET-116/117/118)
- New `@bacons/apple-targets` widget target at `lifeos/targets/widget/` (`expo-target.config.js` + `index.swift`), mirroring the fitness app's proven widget target.
- New `lifeos/src/services/widgetBridge.ts` — computes a small JSON payload from **local data only** and writes it to the App Group (`group.com.peakfettle.lifeos`), then reloads the widget. Re-publishes (debounced) on `lo_habit_logs` / `lo_habits` / `lo_focus_events` / `lo_meta` change. **Reuses the authoritative `computeStreak` engine** — no second streak definition.
- Wiring: `startWidgetBridge()` is called once from `lifeos/app/_layout.tsx` (exact diff in TICKET-116).
- Live Activity (`LifeOSFocusAttributes`) is started/updated/ended from RN via an ActivityKit module (TICKET-118); it is not a timeline widget.

### 2.3 Feature-toggle framework (TICKET-119)
- `lifeos/src/config/features.ts` (scaffolded) — typed registry of the four optional features; defaults OFF.
- `lifeos/src/hooks/useFeatureFlags.ts` (new) — reads/writes the JSON map under `lo_meta` key `feature_flags`; exposes `flags` + `setFlag(key, on)`.
- `You › Features` settings screen — one switch per feature with the registry's label/description.
- **Schema v2 migration** adds the new feature tables (additive; runner already exists at `lifeos/src/db/migrations.ts`). Exact DDL in TICKET-119.

### 2.4 Local schema v2 (new tables — exact DDL in TICKET-119/121/122)
```sql
lo_app_ratings(token_label TEXT PRIMARY KEY, rating TEXT CHECK(rating IN ('energizing','neutral','draining')), updated_at TEXT)  -- TICKET-122
lo_share_events(id TEXT PRIMARY KEY, kind TEXT, ref TEXT, ts TEXT)                                                              -- TICKET-120 (local analytics only)
lo_partner(id TEXT PRIMARY KEY DEFAULT 'self', partner_label TEXT, invite_code TEXT, share_scope_json TEXT, paused INTEGER DEFAULT 0, created_at TEXT) -- TICKET-121
lo_affirmations(id TEXT PRIMARY KEY, text TEXT NOT NULL, identity_tag TEXT, enabled INTEGER DEFAULT 1, source TEXT)             -- TICKET-123 (seeded + user)
```
All four ride the encrypted backup (add to `BACKUP_TABLES`) **except** `lo_app_ratings` (keyed to device-scoped FamilyActivity tokens — re-tag on restore, same rule as `lo_focus_configs`).

---

## 3. Widgets — detailed spec

The widget payload contract is defined in `lifeos/src/services/widgetBridge.ts` (`LifeOSWidgetPayload`) and mirrored in `index.swift` (`LifeOSWidgetData`). Colors come from the payload `theme` block so widgets match the active in-app theme.

| Widget | Families | Data | Ticket | Notes |
|---|---|---|---|---|
| **Streak ring** | `systemSmall`, `accessoryCircular`, `accessoryInline` | `streakDays`, ring = today's habit completion, `milestone` | 116 | Lock-screen + home. |
| **Today's habits** | `systemMedium`, `systemLarge` | `todayHabits[]` (name/icon/done), `habitsDoneToday/Total` | 116 (display) → 117 (interactive) | v1 = display + deep link; **TICKET-117** adds App Intents check-off **without opening the app** (iOS 17+). |
| **Time reclaimed / blocks held** | `systemSmall`, `accessoryRectangular` | `reclaimedMinToday`, `blocksHeldToday` | 116 | Reads `lo_focus_events`. |
| **Focus status** (small) | `systemSmall` | `focusActive`, `focusName`, `focusEndsAt` | 116 | Static status; the live countdown is the Live Activity. |
| **Focus Live Activity** | Dynamic Island + lock-screen | `LifeOSFocusAttributes` (name, endsAt, blocksHeld) | 118 | Started from RN when a focus session starts; ends on session end. iOS 16.2+. `NSSupportsLiveActivities` set in `app.json`. |

**Constraints (from research, binding):** widget extensions cannot do network calls — they only read the App-Group payload (fits local-first perfectly); WidgetKit refresh is budgeted (~15–60 min) so the app calls `reloadAllTimelines()` on user actions for immediacy; widget code ships only via a full EAS build (no OTA); interactive check-off requires iOS 17 App Intents (graceful display-only fallback below 17).

---

## 4. New features — detailed spec (all user-toggleable, default OFF)

Each feature is gated by its `features.ts` flag and respects every CONTENT_SAFETY rule (no shame, no money stakes, forgiving). Research basis is cited in §6.

### 4.1 Shareable milestone cards — TICKET-120 (flag `shareCards`)
At a streak/goal milestone (7/30/66/100/365 — note 66 = the empirical habit-formation mean, Lally 2010), offer a **styled share image** (streak count, habit/stack names, a heat-snippet). Rendered on-device (`react-native-view-shot` → `expo-sharing`); **no in-app social feed** (avoids social-comparison toxicity). Local-only `lo_share_events` for "X cards shared" insight. Legal: low risk; user-initiated share of own data.

### 4.2 Accountability partner — TICKET-121 (flag `accountabilityPartner`)
Designate **one** person who can see a **daily summary** (e.g. "3/4 habits, streak intact") — **never raw data, mood notes, or which apps were blocked**. Posture is **Q33 (founder choice)**:
- **(a) Recommended:** invite-code pairing + a minimal server endpoint storing only the latest opaque summary string + a share scope; partner views via a lightweight link/their own app. Requires a tiny server surface + an App Privacy "shared data" disclosure.
- **(b) Lightest:** share-sheet only (daily summary text the user sends manually) — zero server, zero new disclosure, but no automatic delivery.
Either way: explicit opt-in, one partner, pause/revoke anytime, summary content shown to the user before first send.

### 4.3 App wellbeing scoring — TICKET-122 (flag `appWellbeingScoring`)
Let the user tag the apps they limit as **Energizing / Neutral / Draining** and see a weekly **"quality" score** (not just minutes). Because iOS returns **opaque app tokens** (you cannot read which app it is), tagging is keyed to the user's `FamilyActivitySelection` entries and rendered via system `Label(token)` — the rating is stored per opaque token label in `lo_app_ratings` (device-scoped; re-tag on restore). Distinct from Roots' patent-pending "Digital Dopamine" method — implement an independent additive score. On-device only.

### 4.4 Identity affirmations — TICKET-123 (flag `affirmations`)
Optional gentle morning/evening affirmations tied to the identity the user is building (from the direction survey's values ranking). Seeded, human-written library + user-authored lines (`lo_affirmations`); delivered via the existing notification pipeline (TICKET-124) at the user's chosen times, capped under the 2/day global limit. Apple Watch delivery is a later add. Must stay within CONTENT_SAFETY (no clinical/therapeutic claims).

---

## 5. Notifications completion (TICKET-124) & cross-app surfacing (TICKET-125)

**Notifications (finishes TICKET-110):** implement the `notification_queue` writers for `LO_STACK_REMINDER` (anchor-time), `LO_WEEKLY_REVIEW`, `LO_MOOD_PROMPT`, `LO_RECAP`, `LO_MICRO_CHECK`, plus `LO_AFFIRMATION` (TICKET-123). Build the client reminder-time UI. Rules unchanged: opt-in default-off, ≤2/day across all types, quiet hours, never shaming. Verify delivery on a device build.

**Cross-app surfacing (the "separate mobile tab", Q32):** the whole-person streak endpoint already exists (TICKET-111). This ticket surfaces LifeOS inside the fitness app. **Founder choice (Q32):**
- **(a) Recommended:** a card in the fitness app's `You/Profile` tab — "Your whole-person streak: N days" + a "Open LifeOS / Get LifeOS" CTA (deep link `lifeos://` if installed, else App Store). Lowest UX risk, no tab-bar crowding.
- **(b)** A sixth bottom tab in the fitness app linking out to LifeOS. More prominent; crowds the tab bar (already 5 tabs).
Exact code for (a) is in TICKET-125; (b) is described as the alternative.

---
## 6. Research-backed feature backlog (deep research, 2026-06-20)

Five parallel research passes (habit science, screen-time tech+law, widgets, competitor landscape, compliance) fed this spec. Below is the distilled, **legal-to-implement** feature universe, mapped to status. Sources in §10.

### 6.1 Already covered by the existing build (validation, not new work)
Identity-based habits, habit stacking, implementation intentions, forgiving streaks + grace, tiny-habit sizing, guided routine player, mood check-ins, CBT exercises, Opal-style blocking with friction, deterministic direction engine, on-device usage report — all present in TICKET-100…111. Research **confirms** these are the right, evidence-backed core (Fogg B=MAP, Clear, Lally 2010, Duolingo streak data, Gollwitzer).

### 6.2 Now ticketed in v3
Widgets incl. interactive check-off & Live Activity (research: interactive widgets lift re-entry; WidgetKit/ActivityKit constraints) → 116–118. Shareable milestone cards, accountability partner, app-wellbeing scoring, identity affirmations → 120–123.

### 6.3 Recommended for a later phase (NOT ticketed now — founder backlog)
Each is legal; deferred to keep v3 focused.

| Idea | Why valuable | Why deferred | Risk |
|---|---|---|---|
| **Consistency score** (rolling 30-day %) alongside streaks | Loss-aversion-resistant; survives a miss | Small add; fold into Insights later | none |
| **Endowed-progress onboarding** (start at "Day 1", partial rings) | Nunes & Drèze: ~2× completion | Polish item | none |
| **Temptation bundling** (pair a "want" with a habit) | Milkman: +51% adherence | Needs UX design | none |
| **Streak-freeze tokens** (earned, not bought) | Duolingo: +48% streak length | Current model already forgiving; validate need | none |
| **Non-daily cadence streaks** (3×/wk, weekdays) | Widens habit set | Data-model work | low |
| **Body-doubling / co-working** | Strong for focus/ADHD | Heavier infra (already parked in TICKET-112) | medium |
| **Commitment money-stakes** (charity forfeit) | Proven (Beeminder/StickK) | **Conflicts with locked Q19 "no money stakes"** — needs founder reversal + payment/legal review | high |
| **AI-personalized prompts** | Personalization lifts adherence | **Conflicts with locked Q25/Q8 "no runtime AI in v1"** | n/a v1 |

### 6.4 Pitfalls to keep designing against (research)
Streak anxiety / hard-reset churn; all-or-nothing collapse after a miss ("never miss twice"); streak gaming; notification fatigue (the ≤2/day cap is doing real work); loss-aversion tipping into coercion; "tracked ≠ formed" (surface the 66-day reality at that milestone). The existing forgiving design already addresses most of these — keep the guardrails.

---

## 7. Compliance & legal deltas (from research — affects shipping, not architecture)

1. **FamilyControls distribution entitlement is the critical-path gate.** Apply for **all four** extension bundle IDs **on day one** (not sequentially); observed approval window ranges from ~4 business days to 8 weeks. Dev/TestFlight works on the development entitlement meanwhile. This is already a founder day-1 action (v2 TICKET-102) — confirm it is submitted for the new bundle IDs in §2.1.
2. **iOS Screen Time API is real but fragile** — random opaque-token re-issuance and active iOS 26 `DeviceActivityMonitor` regressions are documented across Opal/one sec/ScreenZen. The shield/handoff code must degrade gracefully (never crash on an unknown token). Reflected in TICKET-127 acceptance.
3. **Android blocking (when it comes, deferred per Q21): use VpnService (local-only) — NOT AccessibilityService.** Google Play tightened AccessibilityService enforcement (Jan 2026) and Android 17 can auto-revoke it; using it for app-blocking risks removal.
4. **App Privacy / Data Safety updates** for the new features: the accountability partner (4.2a) introduces "shared data" — declare it; everything else stays on-device (declare usage data as not collected/processed off-device). Keep raw screen-time data on the phone (privacy-by-design = our compliance moat).
5. **Account deletion + data export** are mandatory on both stores — verify the LifeOS paths (TICKET-127).
6. **Trademark:** "Peak Fettle LifeOS" needs a USPTO clearance check (Classes 9 + 42) before submission. "LifeOS"/"Life OS" is a fairly common descriptive term — the compound with "Peak Fettle" is more defensible, but clear it. Avoid any copy resembling competitor marks (Opal/Streaks/Atoms/Fabulous/Finch). Do **not** use Apple's "Screen Time" as a feature brand.
7. **Accessibility (WCAG 2.2 AA):** widgets need `accessibilityLabel`s; ring/score must not be color-only; 44pt targets; Dynamic Type. Reflected in TICKET-116/127.
8. **Age rating 17+** + age gate (already the v2 posture) keeps COPPA exposure minimal.

---

## 8. Open items / founder actions

- **Q32** (main-app surfacing: card vs. tab) and **Q33** (accountability data posture) — answer in `OPEN_QUESTIONS_FOR_FOUNDER.md`; both have a recommended default and ship-ready code for the recommendation.
- **EAS:** run `eas init` from `lifeos/` to mint the real `projectId` (replaces the placeholder) — only the founder's account can.
- **Apple:** confirm the FamilyControls distribution-entitlement request is submitted for `com.peakfettle.lifeos` + the four extension bundle IDs.
- **macOS:** `npm install` in `lifeos/`, `npx expo prebuild -p ios`, fix any Swift signature drift, build the widget + FC targets.
- **Trademark:** clear "Peak Fettle LifeOS".
- Carried from v2: founder review of crisis copy / protocol templates; legal review of the privacy addendum; apply the `lifeos_activity_days` schema tail to Supabase.

---

## 9. Ticket index (v3 — full specs in `DEV_ROADMAP_2026-06-20-LIFEOS-V3.md`)

| Ticket | Title | Pri | Blocked by |
|---|---|---|---|
| **114** | Separate EAS build for LifeOS (eas.json, projectId, appExtensions) | 🔴 P0 (ship-gate) | — |
| **115** | Lock product name → "Peak Fettle LifeOS" (Q7) across code + assets | 🟠 P1 | — |
| **116** | iOS widgets: target + bridge + Streak / Today's-habits(display) / Reclaimed / Focus-status | 🟠 P1 | 114 |
| **117** | Today's-habits **interactive** check-off (App Intents, iOS 17+) | 🟡 P2 | 116 |
| **118** | Focus-session **Live Activity** (ActivityKit + Dynamic Island) | 🟡 P2 | 116 |
| **119** | Feature-toggle framework + schema v2 (settings, flags, new tables) | 🟠 P1 | — |
| **120** | Shareable milestone cards (flag `shareCards`) | 🟡 P2 | 119 |
| **121** | Accountability partner (flag `accountabilityPartner`) — Q33 | 🟡 P2 | 119 |
| **122** | App wellbeing scoring (flag `appWellbeingScoring`) | 🟡 P2 | 119 |
| **123** | Identity affirmations (flag `affirmations`) | 🟡 P2 | 119, 124 |
| **124** | Notifications completion (queue writers + reminder-time UI) | 🟠 P1 | — |
| **125** | Surface LifeOS in the fitness app (whole-person streak + entry) — Q32 | 🟡 P2 | — |
| **126** | *(reserved — folded into 119 schema v2)* | — | — |
| **127** | v3 verification, compliance & store-readiness delta | 🟠 P1 (pre-ship) | 114–125 |

Run order: **114 → 115 → 116 → (117, 118, 119) →** 119 unblocks **(120, 121, 122, 123)**; **124** parallel; **125** parallel; **127** gates ship.

---

## 10. Sources (representative; full lists in the research dossier)

**Habit & streak science:** Fogg Behavior Model (behaviormodel.org); James Clear — Atomic Habits / habit stacking (jamesclear.com); Lally et al. 2010, "How are habits formed", EJSP (onlinelibrary.wiley.com/doi/abs/10.1002/ejsp.674); Gollwitzer implementation intentions (en.wikipedia.org/wiki/Implementation_intention); Nunes & Drèze endowed-progress (papers.ssrn.com/sol3/papers.cfm?abstract_id=991962); Milkman temptation bundling (chibe.upenn.edu); Duolingo streak mechanics (blog.duolingo.com/how-duolingo-streak-builds-habit/); "never miss twice" (habitdex.com/methods/never-miss-twice).

**Screen-time tech & law:** Apple FamilyControls (developer.apple.com/documentation/familycontrols) & entitlement request (…/requesting-the-family-controls-entitlement); WWDC22 Screen Time API (developer.apple.com/videos/play/wwdc2022/110336/); Riedel "Screen Time API issues 2024" (riedel.wtf/state-of-the-screen-time-api-2024/); react-native-device-activity (github.com/kingstinct/react-native-device-activity); Google Play AccessibilityService policy (support.google.com/googleplay/android-developer/answer/10964491) & VpnService policy (…/answer/12564964); Android 17 accessibility revocation (thehackernews.com/2026/03/android-17-blocks-non-accessibility.html).

**Widgets:** Expo Widgets docs (docs.expo.dev/versions/latest/sdk/widgets/) & blog (expo.dev/blog/home-screen-widgets-and-live-activities-in-expo); Evan Bacon, expo-apple-targets (github.com/EvanBacon/expo-apple-targets); react-native-widget-extension (github.com/bndkt/react-native-widget-extension); react-native-android-widget (github.com/sAleksovski/react-native-android-widget); Apple WidgetKit timeline/refresh + App Intents (developer.apple.com/documentation/widgetkit).

**Competitors & compliance:** Opal, one sec, Jomo, ScreenZen, Brick, Forest, Fabulous, Finch, Habitica, Streaks, Atoms, Routinery, Stoic, Daylio, How We Feel, Beeminder/StickK (product sites + App Store listings); Apple App Store Review Guidelines (developer.apple.com/app-store/review/guidelines/); Apple App Privacy details; Google Play Data Safety (support.google.com/googleplay/android-developer/answer/10787469); FTC COPPA 2025 amendments; CCPA/CPRA 2026 updates; USPTO trademark search (tmsearch.uspto.gov); WCAG 2.2 mobile (w3.org/TR/wcag2mobile-22/).
