# Peak Fettle — Development Roadmap (v22)
**Date:** 2026-05-24 (automated 1AM dev pass)
**From:** pf-1am-dev-ops (scheduled dev task)
**Status:** ACTIVE — supersedes v21 (DEV_ROADMAP_2026-05-24.md)
**Source inputs:**
- v21 (2026-05-24 morning exec pass)
- `pf-tester-feedback-2026-05-23.md` — all 5 new issues resolved this pass

---

## Executive Summary

This pass closed **all four dev-actionable issues from the 2026-05-23 tester report** in a single commit (`40bce69`). NEW-001 was already fixed in commit `1f72f57`. The git push and origin/main are current — all 6 commits since `1879c5b` are on `origin/main`. P0-003 HealthKit stub was replaced with a real implementation (also in `1f72f57`; `react-native-health` is in `package.json` and `app.json`).

**The remaining launch blockers are exclusively infra and founder actions.** No unresolved code defects remain in the dev backlog. The next required step is EAS Build.

---

## What Changed This Pass (commit `40bce69`)

| ID | Fix | Files |
|----|-----|-------|
| **NEW-002** | Removed Path A paywall push enqueue (double notification on session 5); fixed Path B `COUNT(*)` → `countRealSessions()` so rest days don't trigger premature paywall | `workouts.js` |
| **NEW-003** | Added `retry_count` + `failed_permanently` columns to `notification_queue`; dispatcher skips permanently-failed rows and caps retries at MAX_RETRIES (5) | `push-dispatcher.js`, new migration `20260524_notification_queue_retry_cap.sql` |
| **NEW-004** | Batched Expo Push API calls — chunks pending rows into groups of 100 (EXPO_CHUNK_SIZE), sends each chunk as one HTTP request, maps ticket responses back by position | `push-dispatcher.js` |
| **NEW-005** | Wrapped `anthropic.messages.create()` in a `Promise.race` with a 30-second timeout; returns HTTP 504 with retry message if Haiku is unresponsive | `plans.js` |

## Already Resolved (Pre-existing, Confirmed This Pass)

| ID | Fix | Commit |
|----|-----|--------|
| **PUSH-001** | Expo Push API dispatcher | `1879c5b` |
| **NEW-001** | `AuthContext.tsx` import fixed (`registerForPushNotificationsAsync`); dead `registerPushToken` call removed | `1f72f57` |
| **P0-003 HealthKit** | `requestHealthKitPermissions()` real implementation (not stub); `react-native-health` in package.json + app.json plugin | `1f72f57` |
| **BUG-008** | `confirmedThisSession` persisted via AsyncStorage in `rankings.tsx` | `1f72f57` |

---

## Priority Stack (as of 2026-05-24 night)

| Rank | ID | Sev | Description | Owner | Status |
|------|----|-----|-------------|-------|--------|
| 1 | **EAS Build** | 🔴 INFRA | No `.ipa`/`.apk`; blocks all device testing, TICKET-025/027, push verification, P0-003 device test, App Store submission | **Founder** | 🔲 USER ACTION |
| 2 | **PUSH-001 on-device verify** | 🟠 P1 | Queue a push notification, confirm `status: "ok"` Expo receipt, confirm device delivery | QA | ⏳ AWAITING EAS BUILD |
| 3 | **P0-003 HealthKit device test** | 🔴 P0 | Real implementation is in code + package installed; needs EAS build + Apple device to verify `requestHealthKitPermissions()` works end-to-end | QA | ⏳ AWAITING EAS BUILD |
| 4 | **OD-5 tab architecture** | 🟠 EXEC | Progress vs. Log as Tab 2 — blocks P1-007, Phase F screen layout freeze | **Exec (PM)** | 🔲 EXEC DECISION |
| 5 | **TICKET-025** | 🟠 P1 | Group Streak Credits UI — human staging sign-off | QA | ⏳ AWAITING EAS BUILD |
| 6 | **TICKET-027** | 🟠 P1 | PowerSync offline sync — real-device test | Dev/QA | 🔲 BLOCKED on TICKET-025 |
| 7 | **CSV-003** | 🟡 P2 | Strava pace unit unconfirmed — needs one real `activities.csv` from any metric account | QA/Tester | ⚠️ PARTIAL |
| 8 | **Supabase service role key** | 🟡 P2 | Required for `auth.admin.deleteUser()` and cohort-graduation cron | **Founder** | 🔲 OPEN |
| 9 | **NEW-003 migration** | 🟡 P2 | `20260524_notification_queue_retry_cap.sql` must be applied to the Supabase database before the new dispatcher columns are live | **Founder/Dev** | 🔲 PENDING DB APPLY |
| 10 | **Store submission prep** | 🟡 P2 | Screenshots, metadata, `PrivacyInfo.xcprivacy`, Play Store listing | Dev | 🔲 OPEN |

---

## Note on Roadmap Items Now Cleared

The v21 roadmap listed "PUSH commit not on origin/main" as Rank 1. That was resolved prior to this pass — `git log origin/main` confirms all commits through `1f72f57` are on the remote. The git remote is current; no push action is needed.

---

## Phase Status Snapshot

| Phase | Name | Status |
|-------|------|--------|
| A | Core infrastructure & auth | ✅ COMPLETE |
| B | Data model & session logging | ✅ COMPLETE |
| C | AI plans & scoring | ✅ COMPLETE |
| D | Social / groups / streaks | ✅ COMPLETE |
| E | Phase F prep | ✅ COMPLETE |
| **F** | **EAS Build, store submission, post-launch polish** | 🟡 IN PROGRESS — EAS Build is the single gate |

---

## Phase F — Remaining Work by Track

### Track 1 — Infrastructure (single gating action)

1. EAS Build: `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios` **[Founder, ~30 min first-time setup]**
2. PUSH-001 on-device verification — queue notification, confirm delivery receipt
3. Apply migration `20260524_notification_queue_retry_cap.sql` in Supabase dashboard

### Track 2 — QA / Staging (all await EAS build)

4. P0-003 HealthKit — verify `requestHealthKitPermissions()` on Apple device
5. TICKET-025 — Group Streak Credits UI staging sign-off
6. TICKET-027 — PowerSync offline real-device verification (after TICKET-025)
7. CSV-003 — supply a real Strava `activities.csv`

### Track 3 — Store Submission Prep

8. App Store screenshots (all 4 personas, iPhone 15 Pro / iPhone SE frames)
9. App Store Connect metadata (description, keywords, privacy policy URL, support URL)
10. `PrivacyInfo.xcprivacy` — required for App Store submission
11. Android Play Store listing

### Track 4 — Exec-Decision-Gated Polish

12. P1-007 — Progress tab registration (blocked on OD-5)
13. Weekly/daily calendar view for AI plans (blocked on OD-3)
14. Body composition goal flow (blocked on OD-4)
15. RPE field on set-logging form (blocked on OD-1)

---

## Outstanding Exec Decisions

| ID | Decision | Blocking | Status |
|----|----------|----------|--------|
| **OD-5** | Tab architecture: Progress vs. Log as Tab 2 | P1-007, Phase F screen layout freeze | 🔴 HIGHEST PRIORITY |
| **OD-1** | RPE vs. RIR — separate RPE field? | `log.tsx` set-logging form | 🔲 OPEN |
| **OD-2** | Wilks score prominence in Rankings | Rankings screen layout | 🔲 OPEN |
| **OD-3** | AI plan calendar view — week-grid or list? | `plans.tsx` layout | 🔲 OPEN |
| **OD-4** | Body composition goal flow — 1.0 or Phase 2? | Onboarding + AI plan screen | 🔲 OPEN |

---

## Confirmed Not Regressed (Parse Sweep Base: `1f72f57`)

The tester report from 2026-05-23 confirmed 0 syntax errors across 106 files. The 4 files modified in `40bce69` are:
- `peak-fettle-agents/server/routes/workouts.js` — targeted surgical edits, no new syntax
- `peak-fettle-agents/server/cron/push-dispatcher.js` — full rewrite, reviewed manually
- `peak-fettle-agents/server/routes/plans.js` — Promise.race wrapper, no schema changes
- `peak-fettle-agents/server/migrations/20260524_notification_queue_retry_cap.sql` — new file

All 13 carry-forward confirmed items remain not regressed.

---

*Roadmap v22 written by pf-1am-dev-ops (automated scheduled run) — 2026-05-24.*
*Commit `40bce69` closes NEW-002, NEW-003, NEW-004, NEW-005.*
*All prior dev backlog items resolved. EAS Build is the single remaining launch gate.*
