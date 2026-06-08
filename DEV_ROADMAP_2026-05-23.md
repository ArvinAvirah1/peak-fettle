# Peak Fettle — Development Roadmap (v20)
**Date:** 2026-05-23 (automated morning pass)
**From:** pf-exec-prompts (scheduled exec task)
**Status:** ACTIVE — supersedes v19 (DEV_ROADMAP_2026-05-22-PM.md)
**Source inputs:**
- v19 (2026-05-22 PM dev pass) — carried forward
- `pf-tester-feedback-2026-05-22.md` (tester pass, 17:03 on 2026-05-22)
- No new tester feedback file for 2026-05-23 (none generated yet today)

---

## Executive Summary

v19 closed the last unblocked P0 in code (PUSH-001 — Expo Push API dispatcher, commit `1879c5b`). **That commit has not been pushed to `origin/main`** — it will not appear in any EAS build until the founder runs `git push`. This is the single most critical action before any further QA.

The codebase is otherwise in strong shape. Six issues were resolved in the May-21 mega-commit; PUSH-002 was resolved by design when PUSH-001 chose Option A. **Two P0s remain open:** one requires a git push (trivial, user action), the other requires a native library install plus an EAS build device (P0-003 HealthKit). All other open items are P2/P3 or blocked on infrastructure.

**This roadmap focuses on three gate-clearance actions:** push the PUSH-001 fix, stand up EAS Build, and get an OD-5 exec decision on tab architecture to unfreeze the Phase F screen layout.

---

## Priority Stack (as of 2026-05-23)

| Rank | ID | Sev | Description | Owner | Status |
|------|----|-----|-------------|-------|--------|
| 1 | **PUSH commit** | 🔴 INFRA | `1879c5b` not on `origin/main` — zero EAS builds will include the push fix until this is done | **Founder** | 🔲 USER ACTION |
| 2 | **EAS Build** | 🔴 INFRA | No `.ipa` / `.apk` exists; blocks all on-device testing, TICKET-025/027, push verification, App Store submission | **Founder** | 🔲 USER ACTION |
| 3 | **P0-003 HealthKit** | 🔴 P0 | `requestHealthKitPermissions()` is a stub returning `false`; iOS onboarding health step is non-functional; `NSHealthShareUsageDescription` is declared in `app.json` — Apple reviewers will test it | Dev | 🔲 OPEN |
| 4 | **OD-5 tab architecture** | 🟠 EXEC | Progress vs. Log as Tab 2 — largest single unfrozen design decision; blocks P1-007, 1.2 Onboarding Redesign screen layout freeze | **Exec (PM)** | 🔲 EXEC DECISION |
| 5 | **PUSH-001 on-device verify** | 🟠 P1 | Queue a push notification, confirm `status: "ok"` Expo receipt, confirm device delivery | QA | ⏳ AWAITING EAS BUILD |
| 6 | **TICKET-025** | 🟠 P1 | Group Streak Credits UI — human staging sign-off | QA | ⏳ AWAITING EAS BUILD |
| 7 | **TICKET-027** | 🟠 P1 | PowerSync offline sync — `usePowerSyncLog` real-device test | Dev/QA | 🔲 BLOCKED on TICKET-025 |
| 8 | **CSV-003** | 🟡 P2 | Strava pace unit unconfirmed (`1000 / speed` clamped but unit ambiguous) — needs a real `activities.csv` from any Strava metric account | QA/Tester | ⚠️ PARTIAL |
| 9 | **BUG-008** | 🟢 P3 | `confirmedThisSession` in-memory; CTA reappears if user restarts before nightly batch; one-line AsyncStorage fix available | Dev | 🟢 POST-LAUNCH |
| 10 | **Supabase service role key** | 🟡 P2 | Required for `auth.admin.deleteUser()` in `DELETE /user/account` and cohort-graduation cron | **Founder** | 🔲 OPEN |

---

## Tester Issues Incorporated From 2026-05-22 Report

The table below maps every open item from `pf-tester-feedback-2026-05-22.md` to its current roadmap status.

| Tester ID | Tester Severity | Tester Recommendation | Roadmap Action |
|-----------|-----------------|----------------------|----------------|
| PUSH-001 | 🔴 P0 | Switch dispatcher to Expo Push API (Option A) | ✅ **FIXED in code** — commit `1879c5b`; awaits `git push` (Rank 1) |
| PUSH-002 | 🟠 P1 (if Option A) | No action needed under Option A | ✅ **Resolved by design** (Rank 10+, no action) |
| P0-003 HealthKit | 🔴 P0 | Install `react-native-health`, replace stub, verify on Apple device | 🔲 **Rank 3 — open; needs dev + EAS build** |
| BUG-008 | 🟢 P3 | Persist `confirmedThisSession` to AsyncStorage (one-line fix) | 🟢 **Rank 9 — post-launch** |
| CSV-003 | 🟡 P2 | Validate `1000 / speed` formula against real Strava export | ⚠️ **Rank 8 — partial; tester needs to supply real Strava CSV** |
| TICKET-025 | 🟠 | Human staging sign-off on Group Streak Credits UI | ⏳ **Rank 6 — awaiting EAS build** |
| TICKET-027 | 🟠 | PowerSync offline real-device test | 🔲 **Rank 7 — blocked on TICKET-025** |

All 13 items confirmed resolved-and-not-regressed from prior reports remain ✅ (MOCK-001/002, TYPE-001, EPLEY-001, BUG-007/012/013, EX-001, PLANS-001, P1-008, CSV-001/002, POOL-001).

---

## Outstanding Exec Decisions

| ID | Decision | Blocking | Status |
|----|----------|----------|--------|
| **OD-5** | Tab architecture: Progress (per spec) vs. Log as Tab 2 | P1-007, Phase F screen layout freeze, 1.2 Onboarding Redesign | 🔴 HIGHEST PRIORITY exec decision |
| **OD-1** | RPE vs. RIR — separate RPE field on set logging form? (lean: yes → ship TICKET-044) | `log.tsx` set-logging UX | 🔲 OPEN |
| **OD-2** | Wilks score prominence in Rankings screen | Rankings screen layout | 🔲 OPEN |
| **OD-3** | AI plan calendar view — week-grid at launch or list? | `plans.tsx` layout freeze | 🔲 OPEN |
| **OD-4** | Body composition goal flow — launch with 1.0 or defer to Phase 2? | Onboarding + AI plan screen | 🔲 OPEN |

**OD-5 is the single most important exec decision.** It unblocks the largest cluster of Phase F work. All other ODs are Phase F polish and can be decided in order after OD-5.

---

## Phase Status Snapshot

| Phase | Name | Status |
|-------|------|--------|
| A | Core infrastructure & auth | ✅ COMPLETE |
| B | Data model & session logging | ✅ COMPLETE |
| C | AI plans & scoring | ✅ COMPLETE |
| D | Social / groups / streaks | ✅ COMPLETE |
| E | Phase F prep (screen layout, exercise library, CSV import) | ✅ COMPLETE |
| **F** | **EAS Build, store submission, post-launch polish** | 🟡 IN PROGRESS — 2 infra gates remain |

---

## Phase F — Remaining Work by Track

### Track 1 — Infrastructure (gating everything else)

1. `git push origin main` — push commit `1879c5b` (PUSH-001 fix) **[Founder, ~1 min]**
2. EAS Build setup: `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios` **[Founder, ~30 min first-time setup]**
3. PUSH-001 on-device verification — queue notification, confirm delivery receipt `status: "ok"`
4. Supabase service role key — obtain from Supabase dashboard, add to server env

### Track 2 — Core P0 Dev Work

5. **P0-003 HealthKit** — install `react-native-health` (unblock the import in `healthKit.ts`), replace `requestHealthKitPermissions()` stub with real implementation, test on Apple device via EAS build. *(Note: `NSHealthShareUsageDescription` is already declared in `app.json` — Apple reviewers will exercise this flow.)*

### Track 3 — QA / Staging

6. TICKET-025 — Group Streak Credits UI staging sign-off (once `.ipa` exists)
7. TICKET-027 — PowerSync offline real-device verification (once TICKET-025 cleared)
8. CSV-003 — supply a real Strava `activities.csv` to verify pace unit formula

### Track 4 — Store Submission Prep

9. App Store screenshots (all 4 personas + iPhone 15 Pro / iPhone SE frames)
10. App Store Connect metadata (description, keywords, privacy policy URL, support URL)
11. `PrivacyInfo.xcprivacy` — required for App Store submission (Apple privacy manifest)
12. Android Play Store listing (parallel to iOS)
13. TICKET-028 — Apple Watch (blocked, Phase 2)
14. TICKET-029 — Garmin (blocked, Phase 2)

### Track 5 — Exec-Decision-Gated Polish

15. P1-007 — Progress tab registration (blocked on OD-5)
16. Weekly/daily calendar view for AI plans (blocked on OD-3)
17. Body composition goal flow (blocked on OD-4)
18. RPE field on set-logging form (blocked on OD-1)

---

## Phase 2 — Queued Tickets (Post-Launch)

Ready to assign. Recommended order once Phase F clears:

| Ticket | Description |
|--------|-------------|
| TICKET-046 | Cohort details screen ("You're ranked vs. 247 male powerlifters…") |
| TICKET-044 | RPE field on set-logging form (pending OD-1) |
| TICKET-047 | Full AI-plan opening survey (goal/preference structured form) |
| TICKET-045 | User-facing score toggle: Wilks / DOTS / PF Score in settings |
| TICKET-048 | Split times per run segment (Phase 1.3 carry-forward) |
| TICKET-049 | Pace trend UI: 4-week and 12-week rolling windows |
| TICKET-050 | Weekly mileage summary (runners + cyclists) |

---

## Recommended Action Order — Next 48 Hours

**Founder actions (non-delegatable):**
1. `git push origin main` — takes 30 seconds, unblocks everything downstream
2. EAS Build setup — takes ~30 min; highest-leverage infra action remaining
3. Exec decision on OD-5 (tab architecture) — unblocks the largest cluster of Phase F screen work

**Dev actions (once push + EAS are done):**
4. P0-003 HealthKit — install `react-native-health`, replace stub, verify on device
5. BUG-008 AsyncStorage fix — one line, no risk

**QA / tester actions:**
6. Supply a real Strava `activities.csv` (any metric account) to close CSV-003
7. TICKET-025 sign-off once `.ipa` available

---

## Issues Resolved in v19 (Carried to This Version)

| ID | Fix | Commit |
|----|-----|--------|
| PUSH-001 | Expo Push API dispatcher — accepts `ExponentPushToken[...]`, drops `FCM_SERVER_KEY` dependency, clears on `DeviceNotRegistered` | `1879c5b` (2026-05-22 PM) |
| PUSH-002 | Resolved by design — Option A path means Expo build infra owns FCM creds | N/A |

---

*Roadmap v20 written by pf-exec-prompts (automated scheduled run) — 2026-05-23.*
*Supersedes v19. No new code changes this pass — tester feedback from 2026-05-22 fully absorbed into priority stack.*
*Next action required from founder: `git push origin main` + EAS Build setup + OD-5 exec decision.*
