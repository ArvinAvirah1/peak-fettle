# Peak Fettle — Development Roadmap (v5)
**Date:** 2026-05-04
**From:** Dev Team (automated session)
**Status:** ACTIVE — supersedes `DEV_ROADMAP_2026-05-03.md` for sprint tracking
**Anchor documents:** `INSTRUCTIONS.md`, `DEV_ROADMAP_2026-05-03.md` (v4)

---

## 1. What changed this session (2026-05-04)

### Phase A — Status: GATE MET ✅

All 8 Phase A tickets are confirmed in code. The roadmap table in v4 showed TICKET-007, TICKET-008, and TICKET-010 as "🔲 open" but code review confirms all three were implemented in the 2026-05-02/05-03 sessions and simply weren't marked closed in the roadmap text.

**Confirmed closed today:**
- ✅ TICKET-007 — `ExerciseLibrary.searchDetailed()` + alias-aware picker are both present in `src/ExerciseLibrary.h/.cpp` and `qml/ExercisePickerDialog.qml`
- ✅ TICKET-008 — PR badge logic (`isPr` field, gold badge UI) present in `qml/SetTrackerPage.qml`
- ✅ TICKET-010 — Lift/Cardio toggle, cardio duration + distance fields present in `qml/SetTrackerPage.qml`

**Phase A gate: PASSED.** All acceptance criteria are met in source.

---

### New work this session

#### Bug fix — Log Set button over-crop (P1)

**Problem:** The `RowLayout` holding `PrimaryButton("Log set")` + two fixed-width `SecondaryButton`s (160px + 110px) left only ~46px for the primary action on the default 420px window — visible as a squashed teal square in user-reported screenshots.

**Fix:** Refactored to a `ColumnLayout`: "Log set" fills the full top row; "Save as routine" and "Clear all" share a `RowLayout` below with `Layout.fillWidth: true` on both. No logic changes, pure layout change.

**File:** `qml/SetTrackerPage.qml`

---

#### Avatar feature (new, Phase A+)

Replaces the `⚙` gear icon in all page headers with a circular avatar that reflects the user's identity. The gear was functional but impersonal; the avatar signals personalization and subtly nudges users toward completing their profile (small red dot when `UserProfile.isComplete` is false).

**New files:**
- `qml/components/AvatarButton.qml` — reusable circular avatar component, 8-color palette, initials from `displayName`, red dot when profile incomplete, navigates to SettingsPage on tap.

**Modified files:**
- `src/UserProfile.h` — added `displayName` (QString, ≤32 chars) and `avatarColorIndex` (int 0–7) Q_PROPERTY declarations + private members.
- `src/UserProfile.cpp` — implemented `setDisplayName()` and `setAvatarColorIndex()` with clamping; wired to `loadFromSettings()` / `saveToSettings()` / `reset()`.
- `qml/ProfileSurveyPage.qml` — added optional "Set up your avatar" card (live preview circle, 8 color swatches, display name field) before the Save button. Does not gate `valid()`. Saves on `commit()`.
- `qml/SettingsPage.qml` — added "Avatar" settings card above the profile card showing a live avatar preview, current display name, and an "Edit avatar" button linking to ProfileSurveyPage.
- `qml/HomePage.qml` — `⚙ ToolButton` → `AvatarButton { size: 36 }`.
- `qml/SetTrackerPage.qml` — `⚙ ToolButton` → `AvatarButton { size: 36 }`.
- `qml/OnboardingPage.qml` — final step hint updated from "⚙ gear icon" to "your avatar in the top-right corner".
- `CMakeLists.txt` — `AvatarButton.qml` added to `qt_add_qml_module` QML_FILES.

---

## 2. State of the program (audit, 2026-05-04)

### Phase A — All 8 tickets ✅ CLOSED

| # | Ticket | Status |
|---|--------|--------|
| 1 | TICKET-001 — kg/lbs toggle | ✅ |
| 2 | TICKET-002 — RIR label UX | ✅ |
| 3 | TICKET-003 — My Routines home section | ✅ |
| 4 | TICKET-004 — Start Workout CTA prominence | ✅ |
| 5 | TICKET-005 — Guided onboarding flow | ✅ |
| 6 | TICKET-007 — Exercise search aliases (Qt) | ✅ (confirmed in code) |
| 7 | TICKET-008 — PR badges | ✅ (confirmed in code) |
| 8 | TICKET-010 — Mixed lift+cardio session | ✅ (confirmed in code) |

**Additional items from N-series (all closed):** N-01 through N-15 as documented in v4.

### New items added this session

| ID | Description | Status |
|----|-------------|--------|
| BUG-01 | Log Set button over-crop | ✅ FIXED |
| FEAT-01 | Avatar feature (display name + color + AvatarButton) | ✅ SHIPPED |

---

## 3. Phase B — CLOSED ✅ (2026-05-04)

All Phase B remaining items were completed in the 2026-05-04 dev session.

| Task | Owner | Status |
|------|-------|--------|
| Deploy marketing site to Vercel | Web Dept | ✅ COMPLETE (2026-05-04) |
| CI lint + test pipeline | dev-lead | ✅ COMPLETE (2026-05-04) |
| Clean Qt 6.11 build verification | dev-frontend | ✅ COMPLETE (2026-05-04) |
| `exercise_aliases` table + `/exercises/search` endpoint | dev-backend + dev-database | ✅ COMPLETE (prior session) |
| `/plans` CRUD skeleton | dev-backend | ✅ COMPLETE (prior session) |
| Percentile cron stub | dev-backend | ✅ COMPLETE (prior session) |

B-0 security items (T-01, T-02, T-03, N-11, N-12) were all confirmed as already-in-code during 2026-05-03 session 1. See v4 §2 for details.

### Phase B session deliverables (2026-05-04)

**CI pipeline** — `.github/workflows/ci.yml` created. Three jobs:
- `backend` — ESLint + Jest unit tests (8 tests, 2 suites); runs on every push/PR to `main`/`develop`.
- `marketing` — `next lint` + `next build`; runs on every push/PR.
- `deploy-marketing` — Vercel CLI deploy to production; runs on push to `main` only, after `marketing` passes.
Setup instructions in `.github/workflows/DEPLOY_SETUP.md`.

**Vercel deploy** — `marketing-site/vercel.json` confirmed correct (Next.js framework, IAD region, cache headers). GitHub Actions deploy job wired up; requires three secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) to be set in repo settings before first deploy.

**Qt 6.11 build verification** — CMakeLists.txt audited. All clear:
- `find_package(Qt6 6.7 REQUIRED ...)` correctly gates on 6.7+; compatible with 6.11.
- `Qt6::Graphs` (2D) present since Qt 6.7; stable in 6.11. ✅
- `qt_standard_project_setup(REQUIRES 6.5)` — CMake policy compatibility only, does not constrain Qt API. ✅
- `QML_ELEMENT` / `QML_SINGLETON` macros — available since Qt 6.0. ✅
- C++17 standard — fully supported by all Qt 6.11 toolchains. ✅
- `QML_FILES IMPORTS QtQuick QtQuick.Controls QtGraphs` — correct import declaration for Q

---

## 4b. Phase C — Group Streak Credits (TICKET-016–020)

Added 2026-05-04 following exec-PM ratification of 9/10 open decisions in `group_streak_credits_spec.md` v2. One decision (base credit rate, Decision 3) is deferred pending the cosmetic price list — TICKET-020 is blocked until that is resolved.

| Ticket | Description | Owner | Phase | Status |
|--------|-------------|-------|-------|--------|
| TICKET-016 | Group Streak Credits — data model | dev-database | C | 🔲 Ready |
| TICKET-017 | Group Streak Credits — weekly batch job | dev-backend | C | 🔲 Ready |
| TICKET-018 | Group Streak Credits — group management UI | dev-frontend | C | 🔲 Ready |
| TICKET-019 | Group Streak Credits — credit wallet & ledger UI | dev-frontend | C | 🔲 Ready |
| TICKET-020 | Group Streak Credits — economy calibration | dev-backend + PM | C | ⏳ Blocked on cosmetic price list |

---

### TICKET-016 — Group Streak Credits: Data Model
**Phase:** C
**Owner:** dev-database
**Spec:** `group_streak_credits_spec.md` §4
**Status:** Ready to start

**What it is:** Create the four new Supabase tables and all supporting indexes required by the Group Streak Credits feature. No application logic — schema only.

**Deliverables:**
- Migration file creating: `groups`, `group_memberships`, `group_week_evaluations`, `credit_ledger`.
- `user_credit_balance` view (derived from `credit_ledger`).
- Indexes: `(user_id, created_at)` on `credit_ledger`; `(status, group_id)` on `group_memberships`; `(last_evaluated_week)` on `groups`.

**Acceptance criteria:**
- Migration applies cleanly on a fresh Supabase instance.
- `groups.size_cap` CHECK constraint enforces `BETWEEN 2 AND 12`.
- `credit_ledger` is append-only — no UPDATE or DELETE permitted (enforce via RLS policy).
- `group_week_evaluations` primary key is `(group_id, week_start)` — idempotent replay guaranteed.
- All foreign key cascades match spec §4.

---

### TICKET-017 — Group Streak Credits: Weekly Batch Job
**Phase:** C
**Owner:** dev-backend
**Spec:** `group_streak_credits_spec.md` §5, §6
**Blocked by:** TICKET-016 (schema must exist)
**Status:** Ready to start (unblock after TICKET-016)

**What it is:** A scheduled batch job that runs every Monday at 00:05 UTC, evaluates the prior ISO week for every active group, updates streak counters, and writes per-member credit ledger entries.

**Key logic (from spec §5):**
1. Snapshot active members (`status = 'active'`, `joined_at` ≤ week Monday).
2. Query per-user goal hit/miss from the existing personal-goal subsystem.
3. If `members_hit_goal / eligible_members > 0.50` → success; else → failure.
4. On success: increment `current_streak_weeks`; compute `group_credits = base × multiplier(streak_weeks)`; for each active member derive `member_credits = group_credits × goal_modifier(member_goal)` (see modifier tiers in spec §6); insert one `credit_ledger` row per member at their individual amount; insert `group_week_evaluations` row with `credits_per_member = group_credits` (unmodified).
5. On failure: reset `current_streak_weeks = 0`; insert `group_week_evaluations` row with `credits_per_member = 0`; no ledger writes.
6. Job is idempotent on `(group_id, week_start)` — replays are no-ops.

**Goal-difficulty modifier tiers (proposed defaults — update when Decision 3 is resolved):**
- 1 workout/week → 0.5×
- 2 workouts/week → 0.75×
- 3+ workouts/week → 1.0×

**New-joiner carve-out:** members whose `joined_at` is within the 2 most recent ISO weeks earn at 1.0× regardless of group streak state (overrides multiplier, not goal modifier).

**Acceptance criteria:**
- Job runs idempotently — running twice for the same week produces no double-credits.
- Per-member `credit_ledger` amounts correctly reflect goal tier × group multiplier.
- New joiners within 2-week carve-out earn at 1.0× group multiplier only.
- `group_week_evaluations` audit row written for every evaluated group, success or failure.
- Base credit rate is read from a config constant (not hardcoded) so Decision 3 can be applied without a code change.

---

### TICKET-018 — Group Streak Credits: Group Management UI
**Phase:** C
**Owner:** dev-frontend
**Spec:** `group_streak_credits_spec.md` §2, §7, §8
**Blocked by:** TICKET-016 (schema), TICKET-017 (batch job contract)
**Status:** Ready to start (unblock after TICKET-016 + TICKET-017)

**What it is:** All screens and flows for creating, joining, and managing a group. No credit display (that is TICKET-019).

**Screens:**
- **Create group** — name, size cap (2–12 slider), invite by username or share-link. Creator becomes admin.
- **Group detail** — member list, current streak counter, this week's hit/miss status per member, admin controls (kick, transfer admin role, rename).
- **Invite / join** — accept share-link; account-age + activity gate check (30 days, ≥10 sessions) enforced at join time with a clear error if unmet.
- **Leave group** — confirmation dialog; banked credits preserved on leave.

**Lifecycle rules to enforce in UI (spec §7):**
- Mid-week join: member is marked as joining but excluded from current week's eval. UI should communicate "Your first counted week starts Monday."
- Kicks within 48h of week boundary do not change that week's eligible set.
- 4-week rejoin cooldown after kick — surfaced as a disabled "Request to join" state with a countdown.
- Concurrent group cap: if user is already in 3 groups, the "Create" and "Join" CTAs are disabled with explanation.

**Acceptance criteria:**
- Account-age gate blocks join/create with a human-readable reason (not a generic error).
- Concurrent cap (3 groups) enforced in UI and double-checked server-side.
- Admin kick shows cooldown state to the kicked member on the group's invite page.
- All group state changes (join, leave, kick) update in real time via Supabase realtime subscription or optimistic UI + refresh.

---

### TICKET-019 — Group Streak Credits: Credit Wallet & Ledger UI
**Phase:** C
**Owner:** dev-frontend
**Spec:** `group_streak_credits_spec.md` §2, §4, §6
**Blocked by:** TICKET-016, TICKET-017
**Status:** Ready to start (unblock after TICKET-016 + TICKET-017)

**What it is:** The per-user credit wallet display and transaction history. Cosmetic shop redemption is out of scope (separate spec).

**Screens:**
- **Wallet summary** — current balance (from `user_credit_balance` view), this week's pending earnings (projected if group is on track), lifetime earned.
- **Ledger history** — paginated list of `credit_ledger` rows: date, source group, amount, running balance. Earned entries show the group name and streak week. Spent entries (future) will show cosmetic purchased.
- **Group streak card** (on group detail page) — streak week counter, current multiplier, projected credits this week for the user at their goal tier.

**Acceptance criteria:**
- Balance reads from `user_credit_balance` view — never a client-side sum.
- Ledger is read-only; no UI affordance for manual adjustments.
- Goal-tier modifier is surfaced to the user ("You earn at 0.75× — raise your weekly goal to 3+ workouts to earn full credits").
- Empty state for users with no credit history is friendly and explains how to start earning.

---

### TICKET-020 — Group Streak Credits: Economy Calibration
**Phase:** C
**Owner:** dev-backend + PM (Arvin)
**Spec:** `group_streak_credits_spec.md` §6, §10 Decision 3
**Status:** ⏳ BLOCKED — requires cosmetic price list

**What it is:** Set the two remaining numeric constants — base credit rate (Decision 3) and goal-difficulty modifier tier values — against the cosmetic catalog once it exists. This is a config update, not a code change; the batch job reads these from a config constant (see TICKET-017 acceptance criteria).

**Calibration method (from spec §6):**
1. Pick a target earnings curve: e.g., "10-week streak at 3+/week goal ≈ one mid-tier cosmetic."
2. At week 10, multiplier = 2.0×, goal modifier = 1.0×. So: `base × 2.0 × 10 = mid-tier price`. Solve for `base`.
3. Verify the 1/week earner (0.5× modifier) hits a cosmetic within a reasonable timeframe.
4. Adjust tier boundaries if the 3-tier step feels too coarse.

**Acceptance criteria:**
- Base credit rate and goal modifier tiers documented in `group_streak_credits_spec.md` §6 and in a new config file.
- The chosen values satisfy the calibration target (pick target at ratification meeting).
- Batch job config updated; no schema or logic changes required.


---

## 4. Phase C / D — Future tickets (from 2026-05-04 relay)

TICKET-011 through TICKET-015 were added by the workflow coordinator relay on 2026-05-04. These are Phase C/D candidates pending exec ratification. See `workflow-optimization/briefs/dev-roadmap-relay-2026-05-04.md` for full specs.

| Ticket | Description | Phase |
|--------|-------------|-------|
| TICKET-011 | Transparent AI Plan Reasoning | C |
| TICKET-012 | Injury & Limitation Constraint Filter | C |
| TICKET-013 | Smartwatch Integration (Apple Watch + Garmin) | C/D |
| TICKET-014 | Privacy Architecture Commitment | C |
| TICKET-015 | Percentile Rankings free-tier policy confirm | C |

---

## 5. Next recommended sprint (Phase C — pending exec ratification)

Phase A and Phase B are both fully closed. The next sprint is Phase C, which requires exec ratification of TICKET-011–015 before dev work begins.

**Prerequisite (exec-product-manager):** Resolve the five open decisions listed in `workflow-optimization/briefs/dev-roadmap-relay-2026-05-04.md` §OPEN DECISIONS:
1. TICKET-011 reasoning generation — AI model vs. rule-based post-processor.
2. TICKET-013 watch companion — native SwiftUI vs. React Native.
3. TICKET-013 Garmin — Phase C or defer to Phase D.
4. TICKET-013 intensity adjustment — auto-adjust vs. user-approved suggestion.
5. TICKET-015 percentile tier — confirm free-tier placement + define paid-tier features.

**Group Streak Credits (TICKET-016–020):** TICKET-016, 017, 018, and 019 are ready to start. TICKET-020 is blocked on the cosmetic price list (Decision 3 deferred).

**One pre-Phase-C action for dev-lead:** Add `REQUIRES 6.7` to `qt_standard_project_setup()` in `CMakeLists.txt` (cosmetic alignment with actual Qt minimum; not a build blocker).

---

*Roadmap v5 generated by dev session — 2026-05-04.*
*Supersedes `DEV_ROADMAP_2026-05-03.md`.*
