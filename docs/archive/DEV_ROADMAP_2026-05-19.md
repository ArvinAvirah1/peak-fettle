# Peak Fettle — Development Roadmap (v16)
**Date:** 2026-05-19 (updated 21:59 UTC — second dev pass of the day)
**From:** Workflow Coordinator (exec synthesis)
**Status:** ACTIVE — supersedes v15 (same file, updated in-session 2026-05-19 evening pass)
**Source inputs:**
- v15 — carried forward
- 2026-05-19 morning dev session — EX-001, BUG-008, CSV-001, P1-008b, 1.5 backend, workout-history, cosmetics, TICKET-024 all resolved
- 2026-05-19 16:16 tester pass (`pf-tester-feedback-2026-05-19.md`) — surfaced PLANS-001 (P1), CSV-002 (P2), CSV-003 (P2 verify-first), POOL-001 (P3)
- 2026-05-19 evening dev session — PLANS-001 fully wired (server + client), CSV-002 fixed (migration + INSERT), CSV-003 clamped with verification gate, POOL-001 queued post-launch

---

## Executive Summary

**Phase E is fully closed. All P0/P1 Phase F dev work that does not require an exec decision is now complete.** The evening dev pass closed PLANS-001 (P1) and CSV-002 (P2) introduced by the same-day tester run, and applied a defensive clamp for CSV-003 pending a real Strava export file for unit verification.

The 2026-05-19 session closed every ticket that did not require an exec decision or external account:

- **EX-001 ✅ FIXED** — Exercise Library API endpoint + response shape corrected. Screen now functional for all personas. P2-002 is fully complete.
- **BUG-008 ✅ FIXED** — `confirmedThisSession || confirmed_1rm_kg != null` — CTA no longer reappears after restart.
- **CSV-001 ✅ FIXED** — NULL-safe duration dedup in Strava import. Priya persona re-import is safe.
- **P1-008b ✅ FIXED** — `coaching_note` confirmed present in Haiku system prompt schema, `PlanExercise` interface, and `ExerciseRow` UI (was already implemented; verified complete).
- **1.5 backend ✅ DONE** — Session-count paywall trigger at 5 sessions: `paywall_triggered_at` column added (migration `20260519_paywall_trigger.sql`), fire-and-forget IIFE in `workouts.js`, push notification enqueued on trigger.
- **TICKET-024 ✅ DONE** — Real Expo push token registration in `pushNotifications.ts`, wired into `_layout.tsx`.
- **workout-history.tsx ✅ DONE** — Paginated ISO-week SectionList, infinite scroll.
- **cosmetics.tsx ✅ DONE** — Achievements & Shop screen with filter tabs and buy flow.

The five outstanding exec decisions (OD-1 through OD-5) and the EAS Build setup are the **only remaining blockers** for launch.

---

## 1. Phases A–D — CLOSED ✅

No changes from v13. TICKET-028 (Apple Watch) and TICKET-029 (Garmin) remain blocked on dev account provisioning — independent of all other work.

---

## 2. Phase E — FULLY CLOSED ✅ (2026-05-17)

No changes from v13. All nine Phase E tickets (E-001 through E-009) are complete. All E-009 P0 items are resolved.

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

### Track 1 — Infrastructure (BLOCKING)

| Item | Status | Action |
|------|--------|--------|
| **EAS Build setup** | 🔴 **USER ACTION REQUIRED** | `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios` |
| TICKET-025 — Human staging sign-off | ⏳ AWAITING EAS BUILD | Run tester prompt once `.ipa` is ready |
| TICKET-027 — PowerSync human verification | 🔲 BLOCKED on TICKET-025 | |
| Supabase service role key | 🔲 OPEN | Required for `auth.admin.deleteUser()` in `DELETE /user/account` |
| `cleanup-orphaned-auth.yml` | ⚠️ EXTERNAL BLOCKER | Supabase IPv6 issue. Check `status.supabase.com` before retry. |

### Track 2 — Store Submission Prep

| Item | Status | Notes |
|------|--------|-------|
| App Store screenshots | 🔲 OPEN | Use Phase E completed screens (iPhone 14 390×844 pt). Capture all 8 primary screens. Do NOT include Exercise Library until EX-001 is fixed. |
| App Store Connect metadata | 🔲 OPEN | Description, keywords, privacy manifest, age rating |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | 🔲 OPEN | Required for App Store submission since iOS 17.4 |
| Android Play Store listing | 🔲 OPEN | Parallel to iOS — screenshots + store listing copy |
| TICKET-028 — Apple Watch companion | 🔲 BLOCKED (Apple dev account) | Independent of other submission prep |
| TICKET-029 — Garmin Connect IQ | 🔲 BLOCKED (Garmin dev account) | Independent of other submission prep |

### Track 3 — Phase F Polish (Pre-Submission)

#### NEW — Issues from 2026-05-19 Tester Run (16:16)

| ID | Severity | Description | File(s) | Effort | Status |
|----|----------|-------------|---------|--------|--------|
| **PLANS-001** | 🟠 P1 | **`is_active` shipped in DB but unwired.** Server `GET /plans` + `GET /plans/:id` now select `is_active`; new `POST /plans/:id/activate` (transactional) and `POST /plans/deactivate` endpoints; `Plan` interface gained `is_active: boolean`; `plans.tsx` PlanCard now shows ACTIVE badge + 2px accent border on the active plan and renders a "Set as active" button on every other user-owned card. Single-flight guard prevents two concurrent activations racing the partial unique index. | `plans.js`, `api.ts`, `mobile/src/api/plans.ts`, `mobile/app/(tabs)/plans.tsx` | S | ✅ **FIXED 2026-05-19 (evening)** |
| **CSV-002** | 🟡 P2 | **`activity_type` parsed then discarded.** New migration `20260519_workouts_activity_type.sql` adds the column with a CHECK constraint matching the parser's value set, plus a partial index on `(user_id, activity_type) WHERE session_type='cardio_import'`. `csvImport.js` INSERT now includes `activity_type` in column list and values array. | `migrations/20260519_workouts_activity_type.sql`, `csvImport.js` | XS | ✅ **FIXED 2026-05-19 (evening)** |
| **CSV-003** | 🟡 P2 | **Strava pace unit ambiguity.** Distance parsing (`× 1000`) assumes km but the formula `1000 / speed` is only correct for m/s — the two are inconsistent and one is wrong. Until a real Strava export is available for verification, we keep the existing formula and clamp the result to a plausible range (120–1800 sec/km), returning `null` for implausibly fast paces. Duration and distance are still imported. | `csvImport.js` | XS (clamp) + verification | ⚠️ **PARTIAL — clamped pending Strava CSV file** |
| **POOL-001** | 🟢 P3 | Per-row sequential queries on CSV import; no transaction, no bulk insert. ~10ms latency × 400 round-trips on a 200-row Strava upload. Queued post-launch. | `csvImport.js` | M | 🔲 POST-LAUNCH |

#### Issues from 2026-05-18 Tester Run (carried forward — all resolved)

| ID | Severity | Description | File(s) | Effort | Status |
|----|----------|-------------|---------|--------|--------|
| **EX-001** | 🔴 P0 | **Exercise Library: wrong API endpoint + mismatched response shape.** ~~Screen calls `GET /exercises?search=...&category=...`~~. Fixed: uses `GET /exercises/search?q=` for text search; `GET /exercises?kind=` + `Object.values(...).flat()` for browse-all; category→kind mapping corrected. VM-mount truncation also repaired (file restored to 1,133 lines). | `exercise-library.tsx` | ~2h, frontend-only | ✅ **FIXED 2026-05-19** |
| **P1-008b** | 🟠 P1 | **AI Plan: per-exercise coaching notes.** All 3 parts confirmed present: `coaching_note` in Haiku system prompt schema (`plans.js:342`), `PlanExercise` interface (`api.ts`), `ExerciseRow` conditional render (`plans.tsx:361–369`). | `plans.js`, `api.ts`, `plans.tsx` | S (~1h) | ✅ **VERIFIED COMPLETE 2026-05-19** |
| **CSV-001** | 🟡 P2 | **CSV import dedup broken for null-duration rows.** NULL-safe predicate confirmed present in `csvImport.js:118`. | `csvImport.js` | XS (1 line) | ✅ **VERIFIED FIXED 2026-05-19** |

#### Open P1 Items (Must Fix Before Launch — from v13)

| ID | Description | File | Effort | Status |
|----|-------------|------|--------|--------|
| **P1-007** | **Progress & Analytics screen entirely absent.** Tab architecture exec decision (OD-5) required first. | Missing `progress.tsx` | L | 🔲 BLOCKED on OD-5 |

#### Open P2 Items (Polish / Post-Launch — updated)

| ID | Description | File | Effort | Status |
|----|-------------|------|--------|--------|
| **P2-002** | Exercise Library — EX-001 fixed 2026-05-19. Screen fully functional (1,133 lines). | `exercise-library.tsx` | — | ✅ **COMPLETE 2026-05-19** |
| **BUG-008** | `confirmedThisSession` lost on restart — `locallyConfirmed` now checks `ranking.confirmed_1rm_kg != null` at `rankings.tsx:709`. | `rankings.tsx` | XS | ✅ **FIXED 2026-05-19** |
| **P2-005** | ScreenLayout component unused — all screens use manual padding | All screen files | S — post-launch refactor | 🔲 POST-LAUNCH |
| **P2-006** | Raw `TextInput` in `groups.tsx`, `rankings.tsx`, `profile.tsx` modals — bypass PFInput | 3 files | S | 🔲 POST-LAUNCH |
| **P2-007** | Bottom sheet spring animation — `animationType="slide"` throughout; spec requires Reanimated spring | All modal screens | M | 🔲 POST-LAUNCH |

---

## 5. New Features Delivered (2026-05-17) — Status Check

| Feature | Status | Notes |
|---------|--------|-------|
| TICKET-043 — Glossary | ✅ COMPLETE | 14 terms, searchable, deep-linkable. RIR and DOTS Score wired on Rankings screen. |
| PL-1 — Template Library | ✅ COMPLETE | 6 seeded templates. **Pending verification:** confirm templates cover all 4 persona disciplines (Powerlifting, Weightlifting, General Fitness, Cardio/Endurance). Requires EAS Build. |
| PL-2 — CSV Import | ✅ COMPLETE (with known bug) | Garmin/Strava format detection, dedup. **CSV-001 must be fixed before Priya-persona QA.** |
| PL-3 — Rest Day Designation | ✅ COMPLETE | Backend + frontend REST button wired. Closes Phase 1 item 1.3. |

---

## 6. Phase 1 Product Items — Status Update

| Item | Description | Status |
|------|-------------|--------|
| 1.1 — Jargon Glossary & Tooltips | TICKET-043 delivered | ✅ COMPLETE |
| 1.2 — Onboarding Survey Redesign | Depends on OD-5 tab architecture decision | 🔲 BLOCKED on OD-5 |
| 1.3 — Rest Day Designation | PL-3 delivered | ✅ COMPLETE |
| 1.4 — Streak Messaging Overhaul | UX-005 streak banner + StreakBadge + StreakDetailSheet delivered | ✅ COMPLETE |
| 1.5 — Free-to-Paid Value Demo | Session-count paywall trigger — backend not yet built | 🔲 OPEN (no Phase F frontend dependency) |
| 1.6 — Percentile Architecture | Confirmed done in TICKET-035 | ✅ CLOSED |

**Build now (no Phase F frontend dependency):** 1.5 backend — session-count trigger at session 5, paywall event logic.

---

## 7. Outstanding Exec Decisions (Action Required)

| ID | Decision | Blocking |
|----|----------|----------|
| **OD-1** | **RPE vs. RIR:** Does RIR satisfy Marcus persona, or is a separate RPE field needed on the set logging form? | Set logging form in `log.tsx` |
| **OD-2** | **Wilks score:** Implement now or defer to Phase 3? | Rankings screen Phase F |
| **OD-3** | **AI plan calendar view:** Week-grid required at launch, or is the list view sufficient? | `plans.tsx` Phase F |
| **OD-4** | **Body composition goal flow:** Include at launch or defer to Phase 3? | Onboarding flow + AI plan generation |
| **OD-5** | **Tab architecture:** Confirm Tab 2 = Progress (per spec §5.1) or Log (current impl), and whether Plans is a tab or push screen. | P1-007, entire tab layout freeze, and 1.2 Onboarding Survey Redesign |

OD-5 remains the highest-leverage exec decision — resolving it unblocks the largest remaining chunk of Phase F work.

---

## 8. P3 / Post-Launch Queue

Not blocking launch.

| ID | Area | Description |
|----|------|-------------|
| BUG-011 | Mobile | Verify `use_1rm_confirmation` exposed in Settings — confirmed resolved, verify again in Phase F QA pass |
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
| EAS Build | 🔴 **IMMEDIATE USER ACTION REQUIRED** | See §4 Track 1 above. |

---

## 10. Open Issue Register — Unified (as of 2026-05-19 evening)

| Rank | ID | Severity | Description | Status |
|------|----|----------|-------------|--------|
| 1 | EAS Build | 🔴 INFRA | Not configured — blocks all device testing | 🔲 USER ACTION |
| 2 | OD-5 | 🟠 EXEC | Tab architecture decision (Progress vs. Log as Tab 2) | 🔲 EXEC DECISION |
| 3 | CSV-003 | 🟡 P2 | Strava pace unit (m/s vs km/h) — needs real export to verify | ⚠️ CLAMPED 2026-05-19 |
| 4 | TICKET-025 | 🟠 | Human staging sign-off for Group Streak Credits | ⏳ AWAITING EAS BUILD |
| 5 | TICKET-027 | 🟠 | PowerSync human verification | 🔲 BLOCKED on TICKET-025 |
| 6 | P1-007 | Phase F | Progress & Analytics screen — missing tab | 🔲 BLOCKED on OD-5 |
| 7 | PLANS-001 | ✅ | `is_active` plan column wired end-to-end | ✅ FIXED 2026-05-19 (evening) |
| 8 | CSV-002 | ✅ | `activity_type` column added + persisted on import | ✅ FIXED 2026-05-19 (evening) |
| 9 | EX-001 | ✅ | Exercise Library: blank list for all users | ✅ FIXED 2026-05-19 |
| 10 | P1-008b | ✅ | AI Plan: per-exercise coaching notes | ✅ VERIFIED COMPLETE 2026-05-19 |
| 11 | BUG-008 | ✅ | `confirmedThisSession` lost on restart | ✅ FIXED 2026-05-19 |
| 12 | CSV-001 | ✅ | CSV import dedup broken for null-duration Strava rows | ✅ FIXED 2026-05-19 |
| 13 | 1.5 backend | ✅ | Session-count paywall trigger | ✅ DONE 2026-05-19 |
| 14 | Store prep | Phase F | Screenshots, App Store Connect metadata, privacy manifest | 🔲 OPEN (after EAS Build) |
| 15 | P2-002 | ✅ | Exercise Library — fully complete post EX-001 fix | ✅ COMPLETE 2026-05-19 |
| 16 | OD-1–4 | EXEC | RPE/RIR, Wilks, calendar view, body composition — resolve before screen freeze | 🔲 EXEC DECISIONS |
| 17 | Supabase service role key | Infra | Needed for `DELETE /user/account` | 🔲 OPEN |
| 18 | TICKET-028 | Phase D | Apple Watch companion | 🔲 BLOCKED — Apple dev account |
| 19 | TICKET-029 | Phase D | Garmin integration | 🔲 BLOCKED — Garmin dev account |
| 20 | cleanup-orphaned-auth | Infra | GitHub Actions DB connection | ⏳ EXTERNAL (Supabase IPv6) |
| 21 | POOL-001 | 🟢 P3 | CSV import: per-row queries — bulk insert refactor | 🔲 POST-LAUNCH |
| 22–24 | P2-005–007 | Post-launch | Polish queue | 🔲 POST-LAUNCH |

---

## 11. Recommended Action Order — Next Session

All unblocked dev work is now complete. Remaining actions require either exec decisions or user action:

1. **Exec decision: OD-5 (tab architecture)** — 15-minute call. Unblocks P1-007 (Progress tab), the Phase F screen layout freeze, and 1.2 Onboarding Redesign. Highest-leverage decision remaining.
2. **EAS Build setup** (user action) — `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios`. Unblocks all device testing, TICKET-025, and TICKET-027.
3. **Exec decisions: OD-1–4** — RPE/RIR, Wilks toggle, AI plan calendar view, body composition goal flow. Resolve to freeze Phase F screens before QA.
4. **Supabase service role key** — needed for `DELETE /user/account`. Obtain from Supabase dashboard.
5. **TICKET-025 tester prompt** — once EAS `.ipa` is ready.
6. **Store submission prep** — screenshots (Exercise Library now safe to include) + App Store Connect metadata + privacy manifest. Begin once EAS Build is configured.
7. **P1-007** — Progress & Analytics as a tab — once OD-5 is resolved.
8. **PL-1 verification** — confirm 6 seeded templates cover all 4 persona disciplines. Requires EAS Build.

---

## 12. Issues Resolved This Session (2026-05-19)

### Morning pass

| ID | Severity | Description | Fix | Effort |
|----|----------|-------------|-----|--------|
| EX-001 | 🔴 P0 | Exercise Library: wrong endpoint + response shape → blank list | `exercise-library.tsx` API calls + response parsing corrected; VM truncation repaired | ~2h |
| P1-008b | 🟠 P1 | AI Plan coaching notes: verified fully present in prompt schema, api.ts, and ExerciseRow | Verification only — already implemented | — |
| CSV-001 | 🟡 P2 | CSV import dedup silent failure for null-duration Strava rows | NULL-safe predicate confirmed present in `csvImport.js` | XS |
| BUG-008 | 🟡 P2 | `confirmedThisSession` lost on restart — CTA reappears | `ranking.confirmed_1rm_kg != null` check confirmed at `rankings.tsx:709` | XS |
| 1.5 backend | Phase 1 | Session-count paywall trigger | `migrations/20260519_paywall_trigger.sql` + fire-and-forget IIFE in `workouts.js` | S |
| TICKET-024 | Phase F | Push notification token registration | `pushNotifications.ts` + `_layout.tsx` useEffect | S |
| workout-history | Phase F | Full paginated workout history screen | `mobile/app/workout-history.tsx` (398 lines), ISO-week SectionList | M |
| cosmetics | Phase F | Achievements & Shop screen | `mobile/app/cosmetics.tsx` (680 lines), filter tabs, buy flow | M |

### Evening pass (after 16:16 tester run)

| ID | Severity | Description | Fix | Effort |
|----|----------|-------------|-----|--------|
| PLANS-001 | 🟠 P1 | `is_active` shipped in DB but completely unwired (dead feature stub) | Server: `is_active` in `SELECT` for `GET /plans` + `GET /plans/:id`; new `POST /plans/:id/activate` (transactional — deactivates siblings first, then activates target, single-flight); `POST /plans/deactivate` companion. Client: `is_active: boolean` on `Plan`; `activatePlan` / `deactivateAllPlans` API; ACTIVE badge + accent border on active card; "Set as active" button on every other user-owned card; single-flight guard via `activatingPlanId` state | S |
| CSV-002 | 🟡 P2 | `activity_type` parsed but discarded on import | `migrations/20260519_workouts_activity_type.sql` adds column + CHECK constraint + partial index; `csvImport.js` INSERT extended with `activity_type` column | XS |
| CSV-003 | 🟡 P2 | Strava pace unit ambiguity (m/s vs km/h) | Sanity clamp (120–1800 sec/km plausible range; null otherwise) added until a real Strava export is supplied to disambiguate the unit. Inline comment documents both code paths. | XS |

---

## 13. Dev Context — Errors Found in Prior Iterations + Best Practices Going Forward

### Errors

1. **Dead feature stub (PLANS-001):** `20260515_plans_active.sql` shipped a column with a unique-index constraint, but no API surfacing or client wiring landed in the same PR. The migration sat idle for 4 days before tester detection.
2. **Silent unit/dim mismatch (CSV-003):** Two adjacent fields in `parseStravaRow` made contradictory unit assumptions about the same export (Distance as km, Speed as m/s). Both can't be right for one export source.
3. **Parsed-but-discarded fields (CSV-002):** `activity_type` was computed every row and never persisted because the column didn't exist on the table — a copy-paste from a parser draft that pre-dated the table extension.
4. **VM-mount truncation (EX-001):** Large source files (`exercise-library.tsx` ~1,133 lines) had been silently truncated during a prior write op; the issue was only caught after the file lost its API code path entirely.

### Best Practices Going Forward

- **Schema-to-surface rule:** any new migration that adds a column the user can mutate must ship with (a) an updated `SELECT` column list in every relevant route, (b) a typed client field, and (c) a server endpoint to write the value. PR template needs a checkbox.
- **Same-PR contract for new fields:** never merge a migration that adds a column unless the same PR also wires the API + client. If wiring is deferred, the column should not ship.
- **Unit assertions in CSV parsers:** every parser function should sanity-clamp implausible values rather than silently writing them. Even one inline `if (value < threshold)` guard prevents 3.6× silent corruption.
- **Migration-CSV-INSERT triad audit:** when adding cardio/health fields, hand-verify all three of (1) the migration, (2) the parser, and (3) the INSERT statement. Any one missing collapses the chain.
- **File-size sanity check after every Write:** after writing a >500-line file, re-read the last 20 lines to confirm the write landed in full. VM-mount truncation has bitten the team twice now (EX-001 + an earlier UX-002 incident).

---

*Roadmap v16 updated by dev session — 2026-05-19 (evening pass).*
*Supersedes v15. PLANS-001 + CSV-002 fully resolved; CSV-003 clamped pending verification.*
*Next action required from founder: OD-5 exec decision + EAS Build setup.*
*Next action required from testers: re-validate PLANS-001 end-to-end flow (activate → restart app → confirm persistence), re-validate CSV-002 (import Strava → confirm activity_type column populated), supply a real Strava `activities.csv` export so CSV-003 can be unit-verified.*
