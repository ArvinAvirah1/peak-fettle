# Peak Fettle — Development Roadmap (v13)
**Date:** 2026-05-18
**From:** Workflow Coordinator (exec synthesis)
**Status:** ACTIVE — supersedes v12 (`DEV_ROADMAP_2026-05-16.md`)
**Source inputs:**
- `DEV_ROADMAP_2026-05-16.md` (v12) — carried forward
- `dev-roadmap-relay-2026-05-17.md` — Phase E completion + Session 2 sprint output
- `e009-design-qa-report-2026-05-17.md` — Design QA P0/P1/P2 audit
- `pf-tester-feedback-2026-05-16.md` — prior tester findings (all addressed or tracked)

---

## Executive Summary

**Phase E is fully closed as of 2026-05-17.** All nine Phase E tickets (E-001 through E-009) are complete. The design token system, typography, component library, screen layouts, motion/haptics, accessibility audit, and Design QA sprint are all done.

In the same session, BUG-007 through BUG-013, all UX-001–005 items, twelve P1 polish items, three P2 polish items, and four new pre-launch feature tickets (TICKET-043, PL-1, PL-2, PL-3) were delivered.

**The app is now in Phase F — EAS Build, App Store submission, and post-launch polish.** The single highest-priority action is EAS Build setup (user-action required). Everything else is unblocked and ready to build.

Six P1/P2 design gaps from the E-009 audit remain open and should be closed in Phase F before store submission. Four exec decisions are outstanding and must be resolved to unblock specific Phase F screens.

---

## 1. Phases A–D — CLOSED ✅

No changes from v12. TICKET-028 (Apple Watch) and TICKET-029 (Garmin) remain blocked on dev account provisioning — independent of all other work.

---

## 2. Phase E — FULLY CLOSED ✅ (2026-05-17)

| Ticket | Description | Status |
|--------|-------------|--------|
| E-001 | Design token system (ThemeContext, 5 themes, AsyncStorage) | ✅ COMPLETE (2026-05-16) |
| E-001b | 470+ hardcoded hex values replaced with semantic tokens | ✅ COMPLETE (2026-05-16) |
| E-002 | Theme switcher — DB migration, PATCH endpoint, ThemeSelector components | ✅ COMPLETE (2026-05-16) |
| E-003 | Typography system — 205 replacements across 17 files | ✅ COMPLETE (2026-05-17) |
| E-004 | Component library — PFButton (5 variants), PFCard (4 types), PFInput, PFProgressRing, ScreenLayout, PressableCard | ✅ COMPLETE (2026-05-17) |
| E-005 | Screen layout overhaul — spacing grid, safe areas, responsive margins across all 8 primary screens | ✅ COMPLETE (2026-05-17) |
| E-006 | Motion & haptics — animation timings, haptic patterns, Reduce Motion fallbacks | ✅ COMPLETE (2026-05-17) |
| E-007 | Onboarding theme step (Step 3) — ThemeSelectorInline wired in `onboarding.tsx` | ✅ COMPLETE (2026-05-17) |
| E-008 | Contrast & accessibility audit — WCAG 2.1 AA across all 5 themes, 48×48 pt touch targets | ✅ COMPLETE (2026-05-17) |
| E-009 | Design QA sprint (P0 gaps vs. spec) — all 7 P0 items resolved | ✅ COMPLETE (2026-05-17) |

### E-009 P0 Items — All Resolved (2026-05-17)

| ID | Description | Resolution |
|----|-------------|------------|
| P0-001 | Tab bar: emoji icons replaced → Ionicons; FAB center tab (56×56, accentDefault, flash icon); AnimatedTabIcon spring; `?` headerRight → /glossary | ✅ |
| P0-002 | PR badge: `statusWarning` → `statusSuccess` (+ `'26'` hex-alpha for 15% opacity) | ✅ |
| P0-003 | Onboarding Step 4 HealthKit screen added (4 progress dots, Connect Apple Health CTA + Skip ghost, `requestHealthKitPermissions` stub) | ✅ |
| P0-004 | APPEARANCE section added to profile screen with ThemeSelectorModal | ✅ |
| P0-005 | AI Plan card, Recent PRs horizontal scroll, Quick Stats row added to home screen | ✅ |
| P0-006 | PercentileRankHeroCard added to rankings screen (sorted by percentile, PFProgressRing, 82% width) | ✅ |
| P0-007 | `buttonText` primitive added to all 5 themes; `buttonPrimaryText` properly mapped | ✅ |

---

## 3. Sprints — CLOSED ✅

| Sprint | Status |
|--------|--------|
| Hotfix Sprint (BUG-001–003) | ✅ COMPLETE (2026-05-15) |
| Pre-Launch Data Integrity Sprint (BUG-004–006) | ✅ COMPLETE (2026-05-15) |
| Phase D Quick-Fix Sprint (AA-01–03, Z-04–05) | ✅ COMPLETE (2026-05-11) |
| Mock-Removal + Type/Filter Sprint (MOCK-001, MOCK-002, TYPE-001, EPLEY-001) | ✅ COMPLETE (2026-05-16) |
| P1/P2 Polish + Bug Sprint (BUG-007–013, UX-001–005) | ✅ COMPLETE (2026-05-17) |

---

## 4. Phase F — EAS Build, Store Submission & Post-Launch Polish (IN PROGRESS)

Phase F is the final pre-launch phase. It has three parallel tracks:

### Track 1 — Infrastructure (BLOCKING)

| Item | Status | Action |
|------|--------|--------|
| **EAS Build setup** | 🔴 **USER ACTION REQUIRED** | `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios` |
| TICKET-025 — Human staging sign-off | ⏳ AWAITING EAS BUILD | Run tester prompt once `.ipa` is ready |
| TICKET-027 — PowerSync human verification | 🔲 BLOCKED on TICKET-025 | |
| Supabase service role key | 🔲 OPEN | Required for `auth.admin.deleteUser()` in `DELETE /user/account` |
| `cleanup-orphaned-auth.yml` | ⚠️ EXTERNAL BLOCKER | Supabase IPv6 issue. Check `status.supabase.com` before retry. |

**EAS Build is the single highest-priority infrastructure action.** PowerSync offline sync cannot be tested until a real device build exists — which blocks TICKET-025 and TICKET-027.

### Track 2 — Store Submission Prep

| Item | Status | Notes |
|------|--------|-------|
| App Store screenshots | 🔲 OPEN | Use Phase E completed screens (iPhone 14 390×844 pt viewport). Capture all 8 primary screens. |
| App Store Connect metadata | 🔲 OPEN | Description, keywords, privacy manifest, age rating |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | 🔲 OPEN | Required for App Store submission since iOS 17.4 |
| Android Play Store listing | 🔲 OPEN | Parallel to iOS — screenshots + store listing copy |
| TICKET-028 — Apple Watch companion | 🔲 BLOCKED (Apple dev account) | Independent of other submission prep |
| TICKET-029 — Garmin Connect IQ | 🔲 BLOCKED (Garmin dev account) | Independent of other submission prep |

### Track 3 — Phase F Polish (Pre-Submission)

These are the remaining open E-009 P1/P2 gaps. They should be resolved before app store submission.

#### 3a — Open P1 Items (Must Fix Before Launch)

| ID | Description | File | Effort |
|----|-------------|------|--------|
| **P1-007** | **Progress & Analytics screen entirely absent.** Spec §6.5 requires a full progress tab (Tier 1 metric callout cards, Tier 2 charts, Tier 3 per-lift deep-dive, time period selector). Current Tab 2 is "Log" — product decision required: is Log correct as Tab 2, or does Tab 2 become Progress? This blocks the tab architecture. | Missing file (`progress.tsx`) | L — requires product decision first |
| **P1-008** | **AI Plan detail screen:** "Personalised for your goals." sub-header missing; coaching notes per exercise missing; "Start This Workout" primary button missing; "Regenerate Plan" ghost button missing; reasoning card `borderColor` wrong (`accentSecondary` → `accentDefault`, `borderLeftWidth:2`). | `mobile/app/(tabs)/plans.tsx` lines 220–303 | S |

> **Exec decision required for P1-007:** Confirm tab architecture. Per spec §5.1: Home / Progress / Workout (FAB) / Rankings / Profile. Current implementation: Home / Log / Rankings / Plans / Profile. Is "Log" replacing "Progress"? Is "Plans" a replacement for the tab or a push screen? Resolve this before Phase F screen work begins.

#### 3b — Open P2 Items (Polish / Post-Launch)

| ID | Description | File | Effort |
|----|-------------|------|--------|
| **P2-002** | **Exercise Library screen:** screen slot registered in `_layout.tsx` but implementation is pending. Spec §6.4: bottom sheet with search, filter chips, exercise rows with last performance summary, exercise detail screen with history chart + PR + percentile rank. | Missing `exercise-library.tsx` — `ExercisePicker` needs browse-mode extension | M |
| **P2-005** | **ScreenLayout component unused:** all screens implement their own `SafeAreaView`/`ScrollView` with manual padding (numerically correct but not token-referenced). Not a visual regression now, but causes drift over time. | All screen files | S — post-launch refactor |
| **P2-006** | **Input components bypass PFInput:** `groups.tsx`, `rankings.tsx` (ConfirmSheet), `profile.tsx` (AddConstraintModal) all use raw `TextInput`. Missing 1pt→1.5pt focus border transition. | 3 files | S |
| **P2-007** | **Bottom sheet spring animation:** all modals use `animationType="slide"` (linear). Spec §7 requires spring with 280ms/damping 0.8 overshoot. | All modal screens | M — replace with `@gorhom/bottom-sheet` or custom Reanimated |

---

## 5. New Features Delivered (2026-05-17) — Status Check

| Feature | Status | Notes |
|---------|--------|-------|
| TICKET-043 — Glossary (`glossary.tsx`, `glossaryTerms.ts`, `GlossaryTerm` component) | ✅ COMPLETE | 14 terms, searchable, deep-linkable via `?term=slug`. RIR and DOTS Score wired on Rankings screen. |
| PL-1 — Template Library (`templates.tsx`, `GET /templates`, DB migration) | ✅ COMPLETE | 6 seeded templates. Requires verification: confirm seeded templates cover all 4 persona disciplines (Powerlifting, Weightlifting, General Fitness, Cardio/Endurance). |
| PL-2 — CSV Import (`csv-import.tsx`, `POST /import/csv`, DB migration) | ✅ COMPLETE | Garmin/Strava format detection, dedup. Bridges Priya persona gap while TICKET-029 is blocked. |
| PL-3 — Rest Day Designation (`session_type` 3-state column, REST endpoints) | ✅ COMPLETE | Backend + frontend REST button wired. Closes Phase 1 item 1.3. |

---

## 6. Phase 1 Product Items — Status Update

| Item | Description | Status |
|------|-------------|--------|
| 1.1 — Jargon Glossary & Tooltips | TICKET-043 delivered | ✅ COMPLETE |
| 1.2 — Onboarding Survey Redesign | Depends on Phase F tab architecture decision (P1-007) | 🔲 BLOCKED on exec decision |
| 1.3 — Rest Day Designation | PL-3 delivered | ✅ COMPLETE |
| 1.4 — Streak Messaging Overhaul | UX-005 streak banner delivered; StreakBadge + StreakDetailSheet delivered | ✅ COMPLETE |
| 1.5 — Free-to-Paid Value Demo | Session-count paywall trigger — backend not yet built | 🔲 OPEN (backend independent of Phase F frontend) |
| 1.6 — Percentile Architecture | Confirmed done in TICKET-035 | ✅ CLOSED |

**Build now (no Phase F frontend dependency):** 1.5 backend — session-count trigger at session 5, paywall event logic.

---

## 7. Outstanding Exec Decisions (Action Required)

These four decisions are blocking specific Phase F work. They must be resolved before the relevant screen work begins.

| ID | Decision | Blocking |
|----|----------|----------|
| **OD-1** | **RPE vs. RIR:** Does the current RIR implementation satisfy Marcus persona, or is a separate RPE field needed on the set logging form? | Set logging form in `log.tsx` (Phase F polish) |
| **OD-2** | **Wilks score:** Implement now or defer to Phase 3? Wilks ranking would complement DOTS and strengthen the competitive differentiation story. | Rankings screen Phase F |
| **OD-3** | **AI plan calendar view:** Is a week-grid view required at launch, or is the current list view sufficient? | `plans.tsx` Phase F — calendar view is an L-effort addition |
| **OD-4** | **Body composition goal flow:** Include at launch or defer to Phase 3? | Onboarding flow + AI plan generation |
| **OD-5 (new)** | **Tab architecture:** Confirm whether Tab 2 = Progress (per spec) or Log (current impl), and whether Plans is a tab or push screen. | P1-007 — Progress screen, and the entire tab layout freeze |

---

## 8. P3 / Post-Launch Queue

Not blocking launch. Address in the first post-launch sprint.

| ID | Area | Description |
|----|------|-------------|
| BUG-011 | Mobile | "Confirm estimated maxes" toggle — verify `use_1rm_confirmation` exposed in Settings (confirmed resolved in prior run, but verify in Phase F QA pass) |
| P2-005 | Mobile | ScreenLayout migration — cosmetic drift risk, not a visual bug |
| P2-006 | Mobile | Replace raw `TextInput` in modals with `PFInput` |
| P2-007 | Mobile | Bottom sheet spring animation (`@gorhom/bottom-sheet` or custom Reanimated) |

---

## 9. Infrastructure

| Item | Status | Notes |
|------|--------|-------|
| GitHub repo (`ArvinAvirah1/peak-fettle`) | ✅ DONE | Private, branch `main` |
| GitHub Actions secrets | ✅ DONE | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` |
| `cleanup-orphaned-auth.yml` | ⚠️ PARTIAL | Failing — Supabase IPv6 DB connection issue. External blocker. |
| Supabase DB password reset | 🔲 BLOCKED | IPv6 issue affects Supabase dashboard. External blocker. |
| Supabase service role key | 🔲 OPEN | Needed for `auth.admin.deleteUser()` |
| EAS Build | 🔲 **IMMEDIATE USER ACTION REQUIRED** | See §4 Track 1 above. |

---

## 10. Open Issue Register — Unified (as of 2026-05-18)

| Rank | ID | Severity | Description | Status |
|------|----|----------|-------------|--------|
| 1 | EAS Build | 🔴 INFRA | Not configured — blocks all device testing | 🔲 USER ACTION |
| 2 | OD-5 | 🟠 EXEC | Tab architecture decision (Progress vs. Log as Tab 2) | 🔲 EXEC DECISION |
| 3 | TICKET-025 | 🟠 | Human staging sign-off for Group Streak Credits | ⏳ AWAITING EAS BUILD |
| 4 | TICKET-027 | 🟠 | PowerSync human verification | 🔲 BLOCKED on TICKET-025 |
| 5 | P1-007 | Phase F | Progress & Analytics screen — missing tab | 🔲 BLOCKED on OD-5 |
| 6 | P1-008 | Phase F | AI Plan detail screen polish (sub-header, Start/Regenerate buttons, border fix) | 🔲 OPEN (S effort) |
| 7 | 1.5 backend | Phase 1 | Session-count paywall trigger — build now, no frontend dependency | 🔲 OPEN |
| 8 | Store prep | Phase F | Screenshots, App Store Connect metadata, privacy manifest | 🔲 OPEN (after EAS Build) |
| 9 | P2-002 | Phase F | Exercise Library screen (pending from Session 2) | 🔲 OPEN |
| 10 | OD-1–4 | EXEC | RPE/RIR, Wilks, calendar view, body composition — resolve before screen freeze | 🔲 EXEC DECISIONS |
| 11 | Supabase service role key | Infra | Needed for `DELETE /user/account` | 🔲 OPEN |
| 12 | TICKET-028 | Phase D | Apple Watch companion | 🔲 BLOCKED — Apple dev account |
| 13 | TICKET-029 | Phase D | Garmin integration | 🔲 BLOCKED — Garmin dev account |
| 14 | cleanup-orphaned-auth | Infra | GitHub Actions DB connection | ⏳ EXTERNAL (Supabase IPv6) |
| 15–18 | P2-005–007, P3 items | Post-launch | Polish queue (ScreenLayout migration, PFInput in modals, bottom sheet animation) | 🔲 POST-LAUNCH |

---

## 11. Recommended Action Order — Next Session

1. **Exec decision: OD-5 (tab architecture)** — 15-minute call. Unblocks P1-007 and the Phase F screen layout freeze. This is the highest-leverage decision currently on the table.
2. **EAS Build setup** (user action) — `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios`. Unblocks all device testing, TICKET-025, and TICKET-027.
3. **P1-008: AI Plan detail polish** — S effort, no blockers. Fix `accentSecondary` → `accentDefault` border, add "Personalised for your goals." sub-header, add Start/Regenerate PFButtons to `PlanDetailModal`.
4. **1.5 backend** — session-count trigger at session 5, paywall event logic. Fully independent of Phase F frontend.
5. **OD-1–4** — resolve remaining exec decisions so Phase F screens can be locked.
6. **TICKET-025 tester prompt** — once EAS `.ipa` is ready.
7. **Store submission prep** — screenshots + App Store Connect metadata + privacy manifest. Can begin in parallel with other Phase F work once EAS Build is configured.
8. **P1-007** — once OD-5 tab architecture decision is made.
9. **P2-002 (Exercise Library)** — M effort, no blockers once EAS Build is up for testing.
10. **PL-1 verification** — confirm 6 seeded templates cover all 4 persona disciplines.

---

*Roadmap v13 generated by workflow-coordinator — 2026-05-18.*
*Supersedes `DEV_ROADMAP_2026-05-16.md` (v12).*
*Source: `dev-roadmap-relay-2026-05-17.md`, `e009-design-qa-report-2026-05-17.md`, `pf-tester-feedback-2026-05-16.md`, exec decisions 2026-05-16.*
*Next recommended run: after OD-5 tab architecture decision and EAS Build are resolved.*
