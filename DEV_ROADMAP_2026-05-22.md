# Peak Fettle — Development Roadmap (v18)
**Date:** 2026-05-22 (1AM automated dev pass)
**From:** Workflow Coordinator (1AM DevOps scheduled task)
**Status:** ACTIVE — supersedes v17 (DEV_ROADMAP_2026-05-21.md)
**Source inputs:**
- v17 — carried forward
- 2026-05-22 1AM dev pass — cardio analytics, Phase 2 ticket creation

---

## Executive Summary

**The 1AM pass delivered two launch-gate items and created all seven Phase 2 dev tickets.** No exec decisions were resolved (those require founder input). No new bugs were introduced.

Items completed this session:

- **ROADMAP §2.4 — Weekly mileage chart + 10% warning ✅ DONE** — Two new backend endpoints (`GET /workouts/mileage-weekly`, `GET /workouts/pace-trend`) added to `workouts.js`. Progress screen extended with weekly mileage bar chart (with warning banner on >10% mileage jump) and running pace trend line chart (last 6 months, monthly roll-up). Both sections are conditioned on data existence — users with no cardio imports see no change.
- **ROADMAP §2.4 — Pace trend monthly roll-up ✅ DONE** — Included in above. `GET /workouts/pace-trend` returns monthly avg pace per activity type; Progress screen renders a VictoryLine chart for run sessions with inverted Y-axis (lower = faster).
- **Phase 2 tickets created ✅ DONE** — TICKET-044 through TICKET-050 created in `tickets/`. See §7.

Launch gate checklist updated: two items promoted from 🔲 NOT BUILT to ✅ DONE.

---

## 1. Phases A–D — CLOSED ✅

No changes from v17.

---

## 2. Phase E — FULLY CLOSED ✅ (2026-05-17)

No changes from v17.

---

## 3. Sprints — CLOSED ✅

No changes from v17.

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
| App Store screenshots | 🔲 OPEN | Use Phase E completed screens (iPhone 14 390×844 pt). |
| App Store Connect metadata | 🔲 OPEN | Description, keywords, privacy manifest, age rating |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | 🔲 OPEN | Required for App Store submission since iOS 17.4 |
| Android Play Store listing | 🔲 OPEN | Parallel to iOS |
| TICKET-028 — Apple Watch companion | 🔲 BLOCKED (Apple dev account) | |
| TICKET-029 — Garmin Connect IQ | 🔲 BLOCKED (Garmin dev account) | |

### Track 3 — Phase F Polish

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| **POOL-001** | 🟢 P3 | CSV import bulk-insert refactor | ✅ DONE 2026-05-21 |
| **1.5 frontend** | 🟠 Phase 1 | Paywall upgrade modal on session 5 | ✅ DONE 2026-05-21 |
| **P1-007** | Phase F | Progress & Analytics screen — tab registration | 🔲 BLOCKED on OD-5 |
| **CSV-003** | 🟡 P2 | Strava pace unit — clamped pending real export file | ⚠️ PARTIAL |
| **P2-005** | Post-launch | ScreenLayout migration (cosmetic) | 🔲 POST-LAUNCH |
| **P2-006** | Post-launch | PFInput in modal TextInputs | ✅ COMPLETE (verified) |
| **P2-007** | Post-launch | Bottom sheet spring animation | 🔲 POST-LAUNCH |

---

## 5. Phase 1 Product Items — Status Update

| Item | Description | Status |
|------|-------------|--------|
| 1.1 — Jargon Glossary & Tooltips | TICKET-043 delivered | ✅ COMPLETE |
| 1.2 — Onboarding Survey Redesign | Depends on OD-5 | 🔲 BLOCKED on OD-5 |
| 1.3 — Rest Day Designation | PL-3 delivered | ✅ COMPLETE |
| 1.4 — Streak Messaging Overhaul | UX-005 + StreakBadge + StreakDetailSheet | ✅ COMPLETE |
| 1.5 — Free-to-Paid Value Demo | Backend (2026-05-19) + Frontend (2026-05-21) | ✅ FULLY COMPLETE |
| 1.6 — Percentile Architecture | TICKET-035 | ✅ CLOSED |

---

## 6. Outstanding Exec Decisions (Action Required)

| ID | Decision | Blocking |
|----|----------|----------|
| **OD-1** | RPE vs. RIR — separate RPE field needed on set logging form? | `log.tsx` (TICKET-044 is ready to ship once this is decided: answer is yes, implement RPE) |
| **OD-2** | Wilks score — already wired, conditional on `wilks_score != null`. Moot unless more prominent placement desired. | Rankings screen display priority |
| **OD-3** | AI plan calendar view — week-grid at launch or list sufficient? | `plans.tsx` |
| **OD-4** | Body composition goal flow — include at launch or defer? | Onboarding + AI plan |
| **OD-5** | Tab architecture — Progress (per spec) or Log as Tab 2? | P1-007, tab freeze, 1.2 redesign |

OD-5 remains the highest-leverage exec decision. OD-1 is now unblocked by TICKET-044 (ticket is written; just needs the exec go-ahead).

---

## 7. Phase 2 Tickets — Created This Session ✅

All seven Phase 2 dev tickets are now written and ready to assign. Created 2026-05-22.

| Ticket | Title | ROADMAP ref | Effort est. |
|--------|-------|-------------|-------------|
| TICKET-044 | RPE Logging Field on Set Entry Form | §2.3 | S–M (2–3 days) |
| TICKET-045 | 1RM Formula Selection in Settings | §2.3 | S (1–2 days) |
| TICKET-046 | Wilks/DOTS Formula Transparency Modal | §2.3 | S (1 day) |
| TICKET-047 | Deload Week Support in AI-Generated Plans | §2.3 | M (2–3 days) |
| TICKET-048 | Exercise Demonstrations for Free Templates | §2.2, §2.5 | M (2–3 days) |
| TICKET-049 | User-Facing Session Data Export (CSV/JSON) | §3.5 | S (1–2 days) |
| TICKET-050 | Cohort Graduation Batch Job — Notification Wiring | §2.8 | S (1 day) |

Recommended order: TICKET-046 (smallest, highest Marcus-persona value) → TICKET-044 (pending OD-1) → TICKET-047 → TICKET-045 → TICKET-048 → TICKET-049 → TICKET-050.

---

## 8. P3 / Post-Launch Queue

| ID | Area | Description |
|----|------|-------------|
| BUG-011 | Mobile | Verify `use_1rm_confirmation` in Settings — re-check in Phase F QA |
| P2-005 | Mobile | ScreenLayout migration |
| P2-007 | Mobile | Bottom sheet Reanimated spring |
| CSV-003 | Server | Strava pace unit — verify once real `activities.csv` is available |

---

## 9. Infrastructure

| Item | Status | Notes |
|------|--------|-------|
| GitHub repo | ✅ DONE | |
| GitHub Actions secrets | ✅ DONE | |
| `cleanup-orphaned-auth.yml` | ⚠️ PARTIAL | Supabase IPv6 issue — external blocker |
| Supabase service role key | 🔲 OPEN | Needed for `DELETE /user/account` |
| EAS Build | 🔴 **IMMEDIATE USER ACTION REQUIRED** | |
| `cohort-graduation.yml` | 🔲 OPEN | Defined in TICKET-050; requires secrets wired first |

---

## 10. Open Issue Register — Unified (as of 2026-05-22 1AM)

| Rank | ID | Severity | Description | Status |
|------|----|----------|-------------|--------|
| 1 | EAS Build | 🔴 INFRA | Not configured | 🔲 USER ACTION |
| 2 | OD-5 | 🟠 EXEC | Tab architecture decision | 🔲 EXEC DECISION |
| 3 | CSV-003 | 🟡 P2 | Strava pace unit clamp | ⚠️ PARTIAL |
| 4 | TICKET-025 | 🟠 | Human staging sign-off | ⏳ AWAITING EAS BUILD |
| 5 | TICKET-027 | 🟠 | PowerSync verification | 🔲 BLOCKED on TICKET-025 |
| 6 | P1-007 | Phase F | Progress & Analytics tab | 🔲 BLOCKED on OD-5 |
| 7 | §2.4 mileage chart | ✅ | Weekly mileage + 10% warning | ✅ DONE 2026-05-22 |
| 8 | §2.4 pace trend | ✅ | Running pace monthly roll-up | ✅ DONE 2026-05-22 |
| 9 | Phase 2 tickets | ✅ | TICKET-044 through TICKET-050 | ✅ DONE 2026-05-22 |
| 10–24 | (others) | — | Unchanged from v17 | see v17 |

---

## 11. Recommended Action Order — Next Session

All unblocked dev work is now complete. Remaining actions require either exec decisions or user action:

1. **Exec decision: OD-5 (tab architecture)** — Unblocks P1-007 and 1.2 Onboarding Redesign.
2. **EAS Build setup** (user action) — `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios`.
3. **Exec decisions: OD-1, OD-3, OD-4** — Freeze Phase F screens before QA.
4. **Supabase service role key** — Needed for `DELETE /user/account` and `cohort-graduation.yml`.
5. **TICKET-025 tester prompt** — Once EAS `.ipa` is ready.
6. **Store submission prep** — Screenshots + App Store Connect metadata + privacy manifest.
7. **P1-007** — Progress tab registration — once OD-5 is resolved.
8. **CSV-003 verification** — Supply a real Strava `activities.csv` to unit-verify pace formula.
9. **Phase 2 tickets** — Begin TICKET-046 (smallest) once exec decisions OD-1/OD-3/OD-4 are resolved.

---

## 12. Issues Resolved This Session (2026-05-22 1AM)

| ID | Severity | Description | Fix | Files Changed |
|----|----------|-------------|-----|---------------|
| ROADMAP §2.4 mileage | 🔴 Launch gate | Weekly mileage chart + 10% overshoot warning missing from Progress screen | Added `GET /workouts/mileage-weekly` endpoint (8-week cardio distance per activity type + `ten_pct_warning` boolean). Added mileage bar chart + warning banner to Progress screen. | `peak-fettle-agents/server/routes/workouts.js`, `mobile/app/progress.tsx` |
| ROADMAP §2.4 pace | 🔴 Launch gate | Running pace trend (monthly roll-up) not built | Added `GET /workouts/pace-trend` endpoint (monthly avg pace per activity type, last 6 months). Added VictoryLine pace trend chart to Progress screen with inverted Y-axis and per-point tooltips. Conditioned on ≥ 2 months of run data. | `peak-fettle-agents/server/routes/workouts.js`, `mobile/app/progress.tsx` |
| Phase 2 tickets | 📋 Planning | TICKET-044–050 not yet written (Step 17 from DEV_NEXT_STEPS) | Created all 7 tickets: RPE field, 1RM formula, Wilks/DOTS transparency, deload weeks, exercise demos, data export, cohort graduation wiring. | `tickets/TICKET-044` through `tickets/TICKET-050` |

---

## 13. Dev Context — Implementation Notes

- **Route ordering (workouts.js):** `/mileage-weekly` and `/pace-trend` are registered BEFORE `/:id`. This ordering is load-bearing — do not reorder. Any new named sub-routes (`/foo`) must also precede `/:id`.
- **Cardio sections in progress.tsx are additive:** Both chart sections are conditioned on data existence (`mileageBuckets.length > 0`, `runPaceTrend.length >= 2`). Users with no cardio imports see no visual change. Cardio fetch errors are swallowed silently (`.catch(() => null)`) to never block the main progress load.
- **10% warning logic:** Compares the two most-recent ISO weeks summed across all activity types. A user who runs 30 km one week and 35 km the next (≈ 17% increase) sees the warning. Threshold is strict >10%, not ≥10%.
- **OneDrive truncation (ongoing risk):** Both modified files exceeded the ~33 KB Write-tool limit and were truncated mid-write. Reconstruction required bash `cat >` with line-count verification. Until the repo is moved to a non-synced path, all large-file edits must go through bash, not the Write tool.

---

*Roadmap v18 written by 1AM automated dev pass — 2026-05-22.*
*Supersedes v17. Cardio analytics endpoints + Progress screen charts complete. Phase 2 tickets created.*
*Next action required from founder: OD-5 exec decision + EAS Build setup.*
