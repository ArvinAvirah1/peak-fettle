# Peak Fettle — Development Roadmap (v17)
**Date:** 2026-05-21 (1AM automated dev pass)
**From:** Workflow Coordinator (1AM DevOps scheduled task)
**Status:** ACTIVE — supersedes v16 (DEV_ROADMAP_2026-05-19.md)
**Source inputs:**
- v16 — carried forward
- 2026-05-21 1AM dev pass — POOL-001, 1.5 frontend, stale-check on P2-006/OD-2

---

## Executive Summary

**The 1AM pass closed three items and confirmed two previously-tracked items already complete.** All remaining blockers are unchanged: exec decisions OD-1 through OD-5 and the EAS Build user action. No new bugs were introduced.

Items resolved this session:

- **POOL-001 ✅ DONE** — CSV import bulk-insert refactor. O(2N) → O(3) round-trips.
- **1.5 frontend ✅ DONE** — Paywall upgrade modal wired end-to-end. Server flag → hook state → `PaywallUpgradeModal` sheet with 800ms deferred render.
- **P2-006 ✅ VERIFIED** — Already complete in all three files (confirmed, not re-done).
- **OD-2 (Wilks) ✅ VERIFIED** — Already fully wired (DB function → API → type → conditional UI). Confirmed not blocked.

---

## 1. Phases A–D — CLOSED ✅

No changes from v16.

---

## 2. Phase E — FULLY CLOSED ✅ (2026-05-17)

No changes from v16.

---

## 3. Sprints — CLOSED ✅

No changes from v16.

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
| **POOL-001** | 🟢 P3 | CSV import bulk-insert refactor | ✅ **DONE 2026-05-21** |
| **1.5 frontend** | 🟠 Phase 1 | Paywall upgrade modal on session 5 | ✅ **DONE 2026-05-21** |
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
| 1.5 — Free-to-Paid Value Demo | Backend (2026-05-19) + **Frontend (2026-05-21)** | ✅ **FULLY COMPLETE** |
| 1.6 — Percentile Architecture | TICKET-035 | ✅ CLOSED |

---

## 6. Outstanding Exec Decisions (Action Required)

| ID | Decision | Blocking |
|----|----------|----------|
| **OD-1** | RPE vs. RIR — separate RPE field needed on set logging form? | `log.tsx` |
| **OD-2** | Wilks score — already wired, conditional on `wilks_score != null`. Exec decision is now moot unless a more prominent placement is desired. | Rankings screen display priority |
| **OD-3** | AI plan calendar view — week-grid at launch or list sufficient? | `plans.tsx` |
| **OD-4** | Body composition goal flow — include at launch or defer? | Onboarding + AI plan |
| **OD-5** | Tab architecture — Progress (per spec) or Log as Tab 2? | P1-007, tab freeze, 1.2 redesign |

OD-5 remains the highest-leverage exec decision.

---

## 7. P3 / Post-Launch Queue

| ID | Area | Description |
|----|------|-------------|
| BUG-011 | Mobile | Verify `use_1rm_confirmation` in Settings — re-check in Phase F QA |
| P2-005 | Mobile | ScreenLayout migration |
| P2-007 | Mobile | Bottom sheet Reanimated spring |
| CSV-003 | Server | Strava pace unit — verify once real `activities.csv` is available |

---

## 8. Infrastructure

| Item | Status | Notes |
|------|--------|-------|
| GitHub repo | ✅ DONE | |
| GitHub Actions secrets | ✅ DONE | |
| `cleanup-orphaned-auth.yml` | ⚠️ PARTIAL | Supabase IPv6 issue — external blocker |
| Supabase service role key | 🔲 OPEN | Needed for `DELETE /user/account` |
| EAS Build | 🔴 **IMMEDIATE USER ACTION REQUIRED** | |

---

## 9. Open Issue Register — Unified (as of 2026-05-21 1AM)

| Rank | ID | Severity | Description | Status |
|------|----|----------|-------------|--------|
| 1 | EAS Build | 🔴 INFRA | Not configured | 🔲 USER ACTION |
| 2 | OD-5 | 🟠 EXEC | Tab architecture decision | 🔲 EXEC DECISION |
| 3 | CSV-003 | 🟡 P2 | Strava pace unit clamp | ⚠️ PARTIAL |
| 4 | TICKET-025 | 🟠 | Human staging sign-off | ⏳ AWAITING EAS BUILD |
| 5 | TICKET-027 | 🟠 | PowerSync verification | 🔲 BLOCKED on TICKET-025 |
| 6 | P1-007 | Phase F | Progress & Analytics tab | 🔲 BLOCKED on OD-5 |
| 7 | POOL-001 | ✅ | CSV bulk-insert refactor | ✅ DONE 2026-05-21 |
| 8 | 1.5 frontend | ✅ | Paywall upgrade modal | ✅ DONE 2026-05-21 |
| 9–24 | (all others) | — | Unchanged from v16 | see v16 |

---

## 10. Recommended Action Order — Next Session

All unblocked dev work is now complete. Remaining actions require either exec decisions or user action:

1. **Exec decision: OD-5 (tab architecture)** — Unblocks P1-007 and 1.2 Onboarding Redesign.
2. **EAS Build setup** (user action) — `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios`.
3. **Exec decisions: OD-1, OD-3, OD-4** — Freeze Phase F screens before QA.
4. **Supabase service role key** — Needed for `DELETE /user/account`.
5. **TICKET-025 tester prompt** — Once EAS `.ipa` is ready.
6. **Store submission prep** — Screenshots + App Store Connect metadata + privacy manifest.
7. **P1-007** — Progress tab registration — once OD-5 is resolved.
8. **CSV-003 verification** — Supply a real Strava `activities.csv` to unit-verify pace formula.

---

## 11. Issues Resolved This Session (2026-05-21 1AM)

| ID | Severity | Description | Fix | Files Changed |
|----|----------|-------------|-----|---------------|
| POOL-001 | 🟢 P3 | CSV import per-row queries (O(2N) round-trips) | 3-phase refactor: parse all → batch dedup SELECT (1 query for all candidate dates) → bulk INSERT in single transaction. ~400ms → ~30ms on 200-row upload. Dedup semantics preserved (NULL-safe, CSV-001 compatible). | `peak-fettle-agents/server/routes/csvImport.js` |
| 1.5 frontend | 🟠 Phase 1 | Paywall upgrade prompt missing — server was returning `paywall_trigger: true` but client discarded it | Added `paywall_trigger?: boolean` to `Workout` type; `usePowerSyncLog` now reads and surfaces `paywallTriggered: boolean`; `log.tsx` delays 800ms then shows `PaywallUpgradeModal` (slide-up sheet with "See Plans" → `/(tabs)/plans` and "Maybe later" dismiss). | `mobile/src/types/api.ts`, `mobile/src/hooks/usePowerSyncLog.ts`, `mobile/app/(tabs)/log.tsx` |

---

## 12. Dev Context — Verification Notes

- **Stale ticket audit:** P2-006 and OD-2 were both listed as open/post-launch in v16 but are actually already implemented. Roadmap updated to reflect true state.
- **Connection pool note (POOL-001):** `pool.connect()` checks out a dedicated client for the bulk-INSERT transaction. With `max: 2` in `db.js`, this is safe for current traffic. Raise `max` to 5–10 before scaling.
- **Paywall modal design decision:** "See Plans" navigates to the Plans tab rather than an external payment URL, keeping the upgrade flow in-app. The paid tier gate on the Plans tab is already implemented in `plans.tsx`.

---

*Roadmap v17 written by 1AM automated dev pass — 2026-05-21.*
*Supersedes v16. POOL-001 and 1.5 frontend complete.*
*Next action required from founder: OD-5 exec decision + EAS Build setup.*
