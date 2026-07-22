# Peak Fettle Life OS — Companion App v2 Spec (TICKET-100…113)

*TICKET-072 v2 output. Founder decisions Q15–Q31 applied (2026-06-11, see `OPEN_QUESTIONS_FOR_FOUNDER.md`).*
***Supersedes** `COMPANION_APP_ROADMAP_2026-05-29.md` (M-phase TICKET-075…081). The safety (M-073) and foundation (M-074) content carries forward, re-issued below as TICKET-100/101 with new numbering to avoid collisions with fitness tickets 073–099.*

---

## 1. Product definition

A **standalone Life OS app** on the shared Peak Fettle backend. Four pillars:

| Pillar | What it is | Benchmark |
|--------|-----------|-----------|
| **Block** | Opal-grade screen-time limiters & app blockers with real unlock friction | Opal, one sec |
| **Build** | Habit tracker + habit-stack creator with forgiving streaks and a guided stack player | (Peak Fettle's own streak engine) |
| **Aim** | Multi-domain goal setting: outcome → milestones → linked process habits, weekly review ritual | — |
| **Direct** | Survey-driven, **deterministically encoded** life-direction engine (research distilled offline into an on-device ruleset; no runtime AI) + CBT-informed toolkit (mood, thought records, exercises) | the training-engine pattern |

**Positioning rule (founder, Q16): this is NOT a mental-health app and must never be described or marketed as one.** It improves mental health *indirectly* — by giving users direction and removing dopamine spirals. Copy, App Store category, and store listing reflect "focus / habits / personal growth", not "mental wellbeing". The non-clinical safety guardrails still apply in full (§TICKET-100) because the app touches mood and CBT-adjacent content.

**Access:** bundled into the existing paid tier (`lifeos_access` derived server-side from `is_paid`; plumbing kept separable for a future standalone SKU — Q31). iOS-first; Android deferred (Q21). Name TBD (Q7 open) — built name-agnostic behind a `PRODUCT_NAME` constant.

---

## 2. Decisions applied

| # | Decision |
|---|----------|
| Q15 | Supersede the 2026-05-29 roadmap; re-spec on safety+foundation base |
| Q16 | Life-OS identity; standalone on shared backend; name re-brief = ascent/direction |
| Q17 | Spec now; build after the 094 local-first base is stable |
| Q18 | Apply for FamilyControls entitlement immediately; blockers behind a flag |
| Q19 | Friction v1 = escalating wait timer + breathing gate + snooze budget; strict mode v1.1; no money stakes |
| Q20 | v1 = scheduled sessions + daily limits + one-tap focus; websites P2 |
| Q21 | Android deferred; isolate iOS-only code |
| Q22 | Stacks = ordered habit groups with time/event anchors + guided player |
| Q23 | Forgiving streaks everywhere + milestone badges; never punitive |
| Q24 | 6 fixed goal domains; weekly review is a core ritual screen |
| Q25 | No runtime AI — deterministic versioned on-device ruleset |
| Q26 | 5–7 min survey; monthly micro-check; quarterly full re-survey |
| Q27 | Research = 7 fields, encoded as behavioral protocols only; liability boundaries in CONTENT_SAFETY.md |
| Q28 | Engine proposes; user accepts/edits; never auto-enrolls |
| Q29 | Safety scaffolding ships first; non-clinical |
| Q30 | Local-first day one (094 architecture); server = auth + entitlement + opaque encrypted blobs |
| Q31 | Bundled at launch; separable entitlement plumbing |

---

## 3. Architecture

- **Client:** new Expo app at `lifeos/` (TypeScript, Expo Router, the Primitive→Semantic→Component token system from `mobile/src/theme/tokens.ts`). **Custom dev client required from day one** (native Swift extension targets) — no Expo Go.
- **Local-first (Q30):** on-device SQLite is the source of truth, mirroring `mobile/src/db/localDb.ts` / `localSchema.ts` patterns from TICKET-094A. Backup = the 094B E2E-encrypted blob engine (client-side crypto, recovery code). The server never sees plaintext life data.
- **Server surface (deliberately tiny):** shared auth (`/auth/*`), `lifeos_access` entitlement on `GET /user/profile`, encrypted-blob backup endpoints (reuse 094B), push prefs/queue (reuse hardened pipeline). **No `lifeos_*` content tables server-side.** This replaces the old M-074 `mind_*` Postgres schema entirely.
- **Blocker (iOS):** main app + three native targets — `DeviceActivityMonitor` extension (schedule/threshold events), `ShieldConfiguration` extension (custom block screen), `ShieldAction` extension (button handling). `ManagedSettingsStore` applies shields; `FamilyActivityPicker` (SwiftUI, bridged) selects apps/categories; an **App Group** shares config between app and extensions; `DeviceActivityReport` extension renders usage stats **on-device only** (OS forbids exporting raw usage — accept this: no server screen-time analytics, ever).
- **Direction engine:** pure TypeScript function `generateProtocols(surveyAnswers, history) → DomainProtocol[]`, versioned (`directionModel.v1.ts`), deterministic, fully unit-testable, runs on device. Same discipline as the strength-model derivation: a human-readable derivation doc with citations is committed beside the code.
- **Cross-app:** event bridge via the existing server (workout-logged events → habit anchors / primes), opt-in.

### Local schema (SQLite, `lifeos/src/db/localSchema.ts`)

```sql
lo_stacks(id, name, anchor_type CHECK(anchor_type IN ('time','event')), anchor_value, archived_at, created_at)
lo_habits(id, name, icon, cadence, stack_id NULL, stack_position NULL, est_duration_sec NULL,
          forgiving_rules_json, trigger_event NULL, archived_at, created_at)
lo_habit_logs(id, habit_id, date, status CHECK(status IN ('done','rest','skip')), ts)
lo_goals(id, domain CHECK(domain IN ('health','professional','growth','interpersonal','financial','mind')),
         title, why, target_date NULL, status, created_at)
lo_milestones(id, goal_id, title, due NULL, position, completed_at NULL)
lo_goal_links(goal_id, habit_id)                 -- process-habit linkage
lo_survey_responses(id, survey_version, kind CHECK(kind IN ('onboarding','micro','full')), ts, answers_json)
lo_protocols(id, domain, model_version, generated_at, status CHECK(status IN ('proposed','active','dismissed','superseded')),
             accepted_at NULL, payload_json)
lo_mood_checkins(id, ts, mood CHECK(mood BETWEEN 1 AND 5), tags_json, note)
lo_exercises(id, slug UNIQUE, type, title, body, duration_sec)      -- seeded
lo_exercise_completions(id, exercise_id, ts)
lo_focus_configs(id, kind CHECK(kind IN ('session','limit','focus_now')), name, schedule_json,
                 selection_token BLOB,            -- opaque FamilyActivitySelection; never leaves device
                 friction_json, enabled, created_at)
lo_focus_events(id, ts, kind, meta_json)          -- local log: blocks, unlock attempts, snoozes (insights input)
lo_weekly_reviews(id, week_start, completed_at NULL, reflections_json)
```

All tables ride the 094B encrypted backup **except** `lo_focus_configs.selection_token` and `lo_focus_events` (device-scoped; selection tokens are not portable across devices by OS design — re-pick on restore).

---

## 4. Design direction (ui-ux-pro-max)

**Style:** calm-premium, dark-first, same token architecture as the fitness app but a **distinct primitive palette** (sibling, not clone — final pick from `COMPANION_APP_STYLE_OPTIONS_2026-05-29.md` once the name lands; re-brief toward "ascent/direction"). Vector icons only (single family, consistent stroke), no emoji icons, 4/8pt spacing rhythm, tabular figures for all timers/counters.

**Navigation (bottom tabs, 5 max):** `Today` · `Focus` · `Habits` · `Goals` · `You`.
- **Today** = daily driver: stack player entry, mood check-in card, active focus session state, "next milestone" nudge, direction-engine proposals surface here.
- **Focus** = blocker configs, sessions, limits, one-tap focus-now, on-device usage report.
- **Habits** = stacks + solo habits, rings, streaks, calendar detail.
- **Goals** = 6 domains, goal detail, weekly review entry point.
- **You** = insights, survey/re-check, settings, data handling, "Need help?" crisis link.

**Key interaction rules (binding for all UI tickets):**
- Shield/friction screens: breathing gate animation must respect `prefers-reduced-motion` (fallback: textual count); wait timer shows determinate progress with tabular numerals; all friction UI is interruptible ("give up & keep block" always available — never trap the user).
- Touch targets ≥44pt; haptic on habit/step completion; press feedback ≤100ms; micro-interactions 150–300ms, spring easing; stack-player step transitions use directional continuity (next = slide up).
- Streak UI: forgiving by design — a missed day renders as a gap, never red; copy never shames ("Pick it back up today" not "You broke your streak").
- One primary CTA per screen; weekly review is a full-screen staggered ritual (30–50ms item stagger), skippable.
- Charts: 14-day mood sparkline, weekly screen-time bars (from DeviceActivityReport, on-device), habit heat-calendar; legends + tap tooltips; never color-only encoding.
- Dark and light themes shipped together; AA contrast verified per theme.

---

## 5. Ticket index — Phase LO (Life OS)

| Ticket | Title | Area | Priority | Blocked by |
|--------|-------|------|----------|------------|
| **TICKET-100** | Safety & content scaffolding (re-issue of M-073, extended) | Infra+Legal | 🔴 P0 | — |
| **TICKET-101** | Foundation: `lifeos/` app, custom dev client, shared auth, entitlement, local-first DB + E2E backup | Infra | 🔴 P0 | 100 |
| **TICKET-102** | FamilyControls entitlement application + native blocker architecture | Native | 🔴 P0 (apply NOW) | — (founder action) |
| **TICKET-103** | Habits, stacks & stack player | Core | 🟠 P1 | 101 |
| **TICKET-104** | Blocker UX: sessions, limits, focus-now, shields, unlock friction | Core+Native | 🟠 P1 | 101, 102 |
| **TICKET-105** | Goals: 6 domains, milestones, habit linkage, weekly review | Core | 🟠 P1 | 101 |
| **TICKET-106** | Direction research + encoded model (`directionModel.v1.ts`) | Research+Algo | 🟠 P1 | — (parallel) |
| **TICKET-107** | Onboarding survey + protocol generation & acceptance flow | Core | 🟠 P1 | 103, 105, 106 |
| **TICKET-108** | Mind toolkit: mood check-ins + CBT exercise library | Core | 🟠 P1 | 101 |
| **TICKET-109** | Insights: weekly recap, on-device screen-time report, correlations | Core | 🟡 P2 | 103, 105, 108 |
| **TICKET-110** | Notifications (reuse hardened pipeline; gentle, capped) | Infra | 🟡 P2 | 101 |
| **TICKET-111** | Cross-app loop: whole-person streak, workout anchors, primes | Integration | 🟡 P2 | 103, 110 |
| **TICKET-112** | v1.1 backlog: Deep Focus strict mode + website blocking | Core | ⚪ v1.1 | 104 |
| **TICKET-113** | Security review + legal + App Store compliance + beta gate | QA/Sec | 🟠 P1 (pre-ship) | 100–111 |

### Run order

```
TICKET-102 entitlement APPLICATION (founder, day 1 — Apple review runs in background)
TICKET-100 (safety) → TICKET-101 (foundation)
   ├→ TICKET-103 (habits/stacks) ─┐
   ├→ TICKET-105 (goals)          ├→ TICKET-107 (survey + engine UI) ─┐
   ├→ TICKET-108 (mind toolkit)  ─┘                                    ├→ TICKET-109 (insights)
   └→ TICKET-110 (notifications) → TICKET-111 (cross-app)             │
TICKET-106 (research/model) runs fully parallel from day 1 ────────────┘
TICKET-104 (blocker UX) starts on 101+102-code; SHIPS only when the entitlement is granted (flag)
TICKET-113 gates GA. TICKET-112 is v1.1.
```

---

## 6. Ticket specs

### TICKET-100 — Safety & content scaffolding (P0, ships first)

Carries M-073 forward, extended for the Life-OS scope. Nothing else builds UI before this lands.

1. **Crisis resource component** (`CrisisResourcesBanner`): 988 (US default), locale-aware lookup; auto-shown when mood ≤2/5; permanent "Need help?" link in `You` tab.
2. **Onboarding disclaimer** (single, plain): wellbeing/self-improvement tool, not professional care; explicit "I understand".
3. **Data handling screen**: local-first explained in plain English — "your data lives on your device; backups are encrypted so we can't read them"; links to export/delete flows.
4. **`lifeos/CONTENT_SAFETY.md`** (extends the old rules):
   - No punishment mechanics, no money stakes, forgiving streaks only, no guilt copy.
   - **No clinical claims** anywhere; never "mental health app" in copy/listing (Q16).
   - **Direction-engine boundaries (Q27):** protocols are behavioral only. Banned output classes: investment/financial-product advice; medical/diet/supplement directives beyond "see the fitness app"; relationship directives framed as therapy; anything diagnosing the user. Every protocol template is human-reviewable text committed to the repo.
   - Friction must always have an escape route; the user can disable any non-strict block instantly from inside the app's settings (strict mode is the *only* exception, v1.1, with heavy informed-consent UX).
5. **Legal pass:** privacy-policy addendum draft for the new data categories (`legal` plugin, human-reviewed). Crisis copy `PENDING FOUNDER REVIEW` (Q9 carries over).

**DoD:** components render in the design-system sandbox; CONTENT_SAFETY.md committed; legal draft in `/legal/lifeos-privacy-addendum.md`; parse-sweep green.

### TICKET-101 — Foundation (P0)

1. `lifeos/` Expo app scaffold; bundle ID `com.peakfettle.lifeos` (placeholder until Q7); `PRODUCT_NAME` constant at `lifeos/src/config/product.ts`; token system imported; **expo-dev-client** configured (102's native targets need it).
2. Shared auth — same `/auth/*` endpoints, `apiClient` pattern from `mobile/src/api/client.ts`. Single account, two apps.
3. `lifeos_access` entitlement on `GET /user/profile` (derived from `is_paid`); free users get an upsell screen, not an error. Pen-test entry added to 113.
4. **Local DB:** `lifeos/src/db/` — localDb + localSchema (§3 schema) following the 094A pattern; migrations runner included from day 1 (learn from the missing-runner lesson, see memory `workout-routine-link`).
5. **E2E backup:** wire the 094B blob engine for `lo_*` tables (minus device-scoped focus tables); restore flow includes "re-pick your blocked apps" step.
6. Parse-sweep paths extended to `lifeos/app` + `lifeos/src`. 5-tab navigation shell with placeholder screens.

**DoD:** login → entitlement gate → empty Today screen on a real device via dev client; backup/restore round-trip of a seeded habit; sweep green.

### TICKET-102 — FamilyControls entitlement + native blocker architecture (P0 — apply day 1)

1. **Founder action (immediately):** request the **Family Controls (distribution)** entitlement for the new bundle ID via the Apple Developer portal (`com.apple.developer.family-controls`). Dev builds can use the development entitlement meanwhile — build/test does not wait on Apple.
2. Native targets (Swift):
   - `LifeOSDeviceActivityMonitor` — DeviceActivityMonitor ext: schedule start/end + usage-threshold events.
   - `LifeOSShieldConfig` — ShieldConfiguration ext: branded block screen (app name, time reclaimed today, "Unlock" / "Keep me blocked" buttons).
   - `LifeOSShieldAction` — ShieldAction ext: "Unlock" defers to the main app (deep link `lifeos://unlock/<configId>`); "Keep blocked" closes.
   - `LifeOSActivityReport` — DeviceActivityReport ext: on-device usage charts for the Focus tab.
3. **Expo config plugin** (`lifeos/plugins/withFamilyControls.ts`): injects entitlements, App Group (`group.com.peakfettle.lifeos`), and the four targets into the Xcode project at prebuild. All iOS-only code isolated under `lifeos/native/ios/` (Q21).
4. **RN bridge module**: present `FamilyActivityPicker` (SwiftUI sheet) and return an opaque selection token; apply/clear `ManagedSettingsStore` shields; read/write config via App Group UserDefaults.
5. Feature flag `BLOCKING_ENABLED` = dev-entitlement present (dev) / distribution entitlement granted (prod). The app is fully shippable with the flag off (Q18a).

**DoD:** on a dev build: pick an app → shield appears → shield button deep-links into the app. Entitlement request submitted (founder confirms). Sweep green (TS side) + `xcodebuild` compiles all targets.

### TICKET-103 — Habits, stacks & stack player (P1)

- **Model (Q22):** solo habits and stacks share one model; a stack is an ordered habit group with an anchor — `time` ("07:00") or `event` (`wake`, `workout_logged`, `focus_session_end`). Per-step optional durations. Partial stack completion counts: each step logs independently.
- **Forgiving streaks (Q23), computed locally:** streak survives a single miss if the next day is `done`; `rest` counts as active; `skip` never silently resets. Milestone badges at 7/30/100/365. Logic in `lifeos/src/engine/streaks.ts`, pure + unit-tested (port semantics from the fitness streak engine).
- **UI:** Habits tab (stacks as cards with step rings + streak chips; solo habits below); create/edit sheet (name, icon, cadence, anchor, stack membership with drag-reorder); habit detail (heat-calendar); **stack player** — full-screen, StepperLogger-style guided run-through: step name, optional countdown, check/skip, haptic per completion, directional slide-up transitions, summary screen ("4/5 — good morning").
- **Templates:** seeded stack templates (Morning: wake → read 10 pages → stretch → brush → wash face; Shutdown; Pre-workout; Wind-down) — these double as direction-engine protocol building blocks (106).

**DoD:** create the founder's example stack, run the player end-to-end, streak math passes a 30-case unit table (miss/rest/skip permutations); sweep green.

### TICKET-104 — Blocker UX & unlock friction (P1; ships behind flag)

- **Config kinds (Q20):** `session` (schedule: days + window, app selection, friction level), `limit` (per-app/category minutes/day → shield on threshold event), `focus_now` (one-tap: pick preset, duration chips 15/25/50/custom).
- **Unlock friction (Q19), all in-app after the shield deep-links over:**
  1. **Wait timer** — escalating: 1st unlock of the day 60s → 3 min → 5 → 10 → 15 (caps). Determinate ring, tabular numerals, app stays interactive ("Never mind, keep it blocked" exits anytime).
  2. **Breathing gate** — one guided breath cycle set (~45s) *before* the timer starts on higher escalations; reduced-motion fallback = textual count.
  3. **Snooze budget** — N quick-unlocks/day (default 3, user-configurable 0–5) that skip friction; spent budget shown honestly ("0 snoozes left — the timer it is").
  - On success: temporary exemption written via App Group → shield drops for a grant window (default 5 min, then auto-reshield).
  - **No money stakes. Strict mode deferred to TICKET-112.**
- Focus tab home: today's reclaimed time (from focus events), active session card, config list. All blocker UI hidden (with a teaser explaining why) when `BLOCKING_ENABLED` is off.
- Friction events logged to `lo_focus_events` (local only) for 109 insights.

**DoD:** physical-device demo: scheduled session blocks Instagram; unlock flow runs timer+breathing; snooze budget decrements; auto-reshield after grant window. Sweep + native build green.

### TICKET-105 — Goals & weekly review (P1)

- **Domains (Q24):** health, professional, growth, interpersonal, financial, mind (fixed v1).
- **Structure:** goal (title, "why", optional target date) → milestones (ordered, optional due) → **linked process habits/stacks** (`lo_goal_links`). Goal progress = milestones done + linked-habit consistency (last 28 days), shown as two separate honest signals — never a single judgmental score.
- **Weekly review (core ritual):** Sunday-default, full-screen staggered flow: last week's habit consistency per goal → milestone check-in (done / push / drop) → one reflection prompt per active domain → next-week intention → (107+) protocol adjustment proposals. Skippable, ≤5 min, autosaves to `lo_weekly_reviews`.
- UI: Goals tab = domain grid with goal counts → goal detail → milestone editor; "link a habit" picker creates from 103 templates inline.

**DoD:** create a goal in each domain, link habits, complete a full weekly review; sweep green.

### TICKET-106 — Direction research + encoded model (P1, parallel from day 1)

The "Fable 5 researcher" ticket. **No runtime AI (Q25)** — research happens at build time, the artifact is deterministic code + a derivation document.

1. **Research pass** (deep-research harness, multi-source, citation-graded) across 7 fields (Q27): focus/deep work & attention; skill acquisition (deliberate practice, spacing/retrieval); career advancement; sleep behavior; relationships (behavioral only — e.g. active-constructive responding, bids); personal finance **behaviors** (automation, tracking cadence — never instruments/advice); CBT-derived general principles (behavioral activation, implementation intentions/WOOP, habit-formation literature, cognitive-restructuring as a self-help skill). Output: `lifeos/DIRECTION_MODEL_DERIVATION.md` — every encoded rule cites sources with an evidence grade (A meta-analysis / B RCT / C expert consensus); rules below grade C don't ship.
2. **Encoding:** `lifeos/src/engine/directionModel.v1.ts` — pure, versioned, seeded-deterministic:
   `generateProtocols(survey, history) → DomainProtocol[]` where `DomainProtocol = { domain, rationaleKey, stacks: StackTemplate[], milestoneLadder: MilestoneTemplate[], blockerSuggestion?, exercises: slug[], weeklyTimeBudgetMin }`. Inputs: selected domains, per-domain self-assessment, hours/week, chronotype, blockers, values ranking, pain apps. Constraint solver: proposals must fit the user's stated time budget (never propose 10 h into a 3 h week).
3. **Content templates:** every rationale/protocol string is a reviewable template in `lifeos/src/content/protocols/` (no string assembly that could produce un-reviewed claims). Safety filter unit tests assert banned-class outputs are impossible (Q27 list from CONTENT_SAFETY.md).
4. **Tests:** golden-file tests — 12 persona surveys → snapshot protocols; determinism test (same input ⇒ byte-identical output); time-budget property test.

**DoD:** derivation doc committed with citations; model + tests green; founder skims the derivation doc and signs the protocol-content review checkbox.

### TICKET-107 — Survey + protocol acceptance flow (P1)

- **Onboarding survey (Q26):** 5–7 min, branching: domain selection (multi) → per-domain current-state self-assessment (1–10 + one free-text "what's in the way") → hours/week realistically available → chronotype/schedule shape → values ranking (drag-order 5 cards) → pain apps (informs blocker suggestion; just names, no OS data needed). Progress bar, back-navigable, autosaved per step.
- **Plan reveal:** engine output rendered as per-domain proposal cards — each shows the *why* (template rationale + citation count, tappable to a plain-English evidence note), the proposed stacks/milestones/blocker config, and **Accept / Edit / Not now** (Q28 — accept instantiates habits/goals/blocker drafts; nothing auto-enrolls; blocker drafts still require the user to run the FamilyActivityPicker themselves).
- **Cadence:** monthly micro-check (5 questions, push-prompted, optional) adjusts protocol intensity; quarterly full re-survey regenerates (old protocols → `superseded`, diff shown). Weekly review (105) surfaces one-tap tweaks ("reduce reading to 5 pages?") driven by completion-rate rules in the model.

**DoD:** fresh install → survey → accept 2 of 3 proposals → habits/goals exist and the Today tab reflects them; re-survey supersedes cleanly; sweep green.

### TICKET-108 — Mind toolkit (P1)

Carries M-076/M-078 forward, local-first, inside the Life-OS frame (a toolkit, not the identity):

- **Mood check-ins:** 1–5 scale (calm emoji range), tags (sleep_good/bad, stressed, calm, social, lonely, active, tired, focused, anxious), optional note (local DB; E2E backup — Q30 dissolves the old Q10 server-encryption answer). Sleep step included. Mood ≤2 → `CrisisResourcesBanner`. 14-day sparkline on Today.
- **Exercise library** (seeded, human-written, per M-078 list): 4-7-8 + box breathing, 5-4-3-2-1 grounding, thought record, three good things, body scan, values reflection, exam/high-stress pack, competition-prep pack. Player = text steps v1. Completions feed linked habits.
- CBT positioning per Q29: psychoeducation + thought records + behavioral activation + distortion-spotting as *skills*, within TICKET-100 guardrails.

**DoD:** check-in flow incl. crisis trigger path; every exercise playable; completion → habit credit; sweep green.

### TICKET-109 — Insights (P2)

- **Weekly recap card (+ optional push):** habits X/Y, stack consistency, average mood vs last week, screen-time reclaimed (from local focus events), goal/milestone movement, one bright spot. Never comparative/judgmental.
- **Focus insights:** DeviceActivityReport-rendered usage (on-device only) + friction stats (snoozes used, unlocks resisted = "blocks held").
- **Correlations (in-app only, soft copy, thresholds before showing):** mood × workout days (cross-app, needs fitness data opt-in), mood × screen-time-heavy days, habit consistency × weekly review completion. Correlation-not-causation framing, dismissable, ≥14 data-point minimums.

### TICKET-110 — Notifications (P2)

Reuse the hardened Expo Push pipeline + `notification_queue`. New types: `LO_STACK_REMINDER` (anchor-time), `LO_WEEKLY_REVIEW`, `LO_MOOD_PROMPT`, `LO_RECAP`, `LO_MICRO_CHECK`. Rules: all opt-in default-off; max 2/day across types; quiet hours respected; copy never shames; session-start blocking itself never needs a push (DeviceActivity schedules fire natively on-device).

### TICKET-111 — Cross-app loop (P2)

- **Whole-person streak:** day counts if (workout logged) OR (≥1 habit done). Server keeps only the *counter* (no content): `user_streaks.whole_person_streak`, updated by workout endpoint + a minimal `POST /lifeos/activity-ping {date}` (boolean presence, no detail — preserves local-first posture). Shown in both apps.
- **Workout anchors:** `workout_logged` event → fires event-anchored stacks/habits (e.g. post-workout wind-down) via push or local poll.
- **Primes:** pre-workout 30-s grounding offer in the fitness app (content slugs from 108); post-workout breath nudge. Both opt-in.

### TICKET-112 — v1.1 backlog (not scoped for v1 build)

- **Deep Focus strict mode:** uncancellable sessions (shield ignores snoozes/unlock). Heavy informed-consent flow (typed confirmation, max duration cap 4 h, emergency-call always unaffected). The only sanctioned exception to the "always an escape route" rule — gets its own mini safety review.
- **Website blocking:** Safari content-blocker extension + per-site shields via WebDomain tokens.
- Body-doubling focus sessions (old P4 idea) — parked.

### TICKET-113 — Security review + compliance + beta gate (P1, gates GA)

1. `/security-review` over: entitlement check (free user must not reach lifeos features by JWT manipulation), backup blob path reuse, App Group data exposure (what could another process read?), deep-link unlock flow (can a user forge `lifeos://unlock` to skip friction? — friction state must live app-side, not trust the link).
2. Legal: privacy addendum human-reviewed; **App Store listing review against Q16** — category Productivity (or Health & Fitness *without* mental-health claims), no treatment language; FamilyControls usage justification prepared for App Review notes.
3. Crisis copy founder-approved (Q9). CONTENT_SAFETY.md checklist pass over every protocol template (106) and exercise (108).
4. Data: retention/delete paths verified — local wipe, backup blob delete, account delete cascade.
5. **Beta:** 10–20 paid subscribers, 2 weeks; explicit checks: does friction feel respectful? any guilt reports (zero tolerance)? blocker reliability across reboots/OS updates.
6. `peak-fettle-verify` parse-sweep + native build = definition of done for every ticket above; this ticket re-runs it over the whole `lifeos/` surface.

---

## 7. Success metrics

- Paid-tier retention lift; LifeOS WAU among paid users.
- "Blocks held" rate (unlock attempts abandoned at friction) and reclaimed minutes — the Opal-style headline.
- Stack completion rate; weekly-review completion; protocol acceptance + 4-week survival rate (do accepted habits still get logged a month later?).
- Qualitative: feels respectful, directive, calm. Zero guilt/harm reports.

## 8. Open items

- **Q7 (name)** — still open; new brief = ascent/direction-flavored Life OS. Blocking only for store submission (TICKET-113), not for build.
- **Founder day-1 action:** submit the FamilyControls distribution-entitlement request (TICKET-102 §1) — the Apple review clock starts only when you do.
- New questions go to `OPEN_QUESTIONS_FOR_FOUNDER.md` as Q32+.
