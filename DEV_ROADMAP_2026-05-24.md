# Peak Fettle — Development Roadmap (v21)
**Date:** 2026-05-24 (automated morning pass)
**From:** pf-exec-prompts (scheduled exec task)
**Status:** ACTIVE — supersedes v20 (DEV_ROADMAP_2026-05-23.md)
**Source inputs:**
- v20 (2026-05-23 automated morning pass) — carried forward
- `pf-tester-feedback-2026-05-23.md` — **5 new issues absorbed this pass (NEW-001 through NEW-005)**

---

## Executive Summary

v20 was written before the 2026-05-23 tester feedback was available. This v21 pass absorbs that report, which added **one P1 and three P2 issues** in the push and paywall infrastructure — all in already-touched code. The good news: PUSH-001 is confirmed fixed, parse sweep is clean across 106 files, and none of the new issues are regressions of prior fixes.

**Net status:** Two P0s remain (HealthKit stub, git push not executed). The new P1 (AuthContext dead import) is a cleanup item — push notifications work via `_layout.tsx` today, but the broken `AuthContext` path will trap any future developer. The three new P2s (double paywall notification, no retry cap, no API batching) should be fixed before public launch but are not launch blockers at current user scale.

**Most critical founder action remains unchanged:** `git push origin main` + EAS Build setup.

---

## Priority Stack (as of 2026-05-24)

| Rank | ID | Sev | Description | Owner | Status |
|------|----|-----|-------------|-------|--------|
| 1 | **PUSH commit** | 🔴 INFRA | `1879c5b` not on `origin/main` — no EAS build includes the PUSH-001 fix until this runs | **Founder** | 🔲 USER ACTION |
| 2 | **EAS Build** | 🔴 INFRA | No `.ipa` / `.apk`; blocks all on-device testing, TICKET-025/027, push verification, App Store submission | **Founder** | 🔲 USER ACTION |
| 3 | **P0-003 HealthKit** | 🔴 P0 | `requestHealthKitPermissions()` returns `false`; HealthKit onboarding is non-functional; `NSHealthShareUsageDescription` is declared in `app.json` — Apple reviewers will test this path | Dev | 🔲 OPEN |
| 4 | **OD-5 tab architecture** | 🟠 EXEC | Progress vs. Log as Tab 2 — largest single unfrozen design decision; blocks P1-007 and Phase F screen layout freeze | **Exec (PM)** | 🔲 EXEC DECISION |
| 5 | **NEW-001** | 🟠 P1 | `registerForPushNotifications` import in `AuthContext.tsx` resolves to `undefined` — push registration via AuthContext silently fails forever; also calls a `/user/push-token` endpoint that does not exist | Dev | 🆕 NEW |
| 6 | **PUSH-001 on-device verify** | 🟠 P1 | Queue a push notification, confirm `status: "ok"` Expo receipt, confirm device delivery | QA | ⏳ AWAITING EAS BUILD |
| 7 | **TICKET-025** | 🟠 P1 | Group Streak Credits UI — human staging sign-off | QA | ⏳ AWAITING EAS BUILD |
| 8 | **TICKET-027** | 🟠 P1 | PowerSync offline sync — `usePowerSyncLog` real-device test | Dev/QA | 🔲 BLOCKED on TICKET-025 |
| 9 | **NEW-002** | 🟡 P2 | Double paywall push notification at session 5 — two independent code paths both enqueue; also Path B uses `COUNT(*)` instead of `countRealSessions()`, causing premature triggers for users with rest days / cardio imports | Dev | 🆕 NEW |
| 10 | **NEW-003** | 🟡 P2 | `notification_queue` has no retry cap — failed notifications retry every 5 minutes forever; a corrupt payload or transient Expo outage can create an infinite retry loop consuming DB connections and API quota at scale | Dev | 🆕 NEW |
| 11 | **NEW-004** | 🟡 P2 | Expo Push API called one-message-per-request instead of batching 100 — harmless now, but one group-streak event can enqueue 100+ notifications; sequential HTTP calls will back up the queue for time-sensitive alerts | Dev | 🆕 NEW |
| 12 | **CSV-003** | 🟡 P2 | Strava pace unit unconfirmed (`1000 / speed` clamped but unit ambiguous) — needs one real `activities.csv` from any metric account | QA/Tester | ⚠️ PARTIAL |
| 13 | **Supabase service role key** | 🟡 P2 | Required for `auth.admin.deleteUser()` and cohort-graduation cron | **Founder** | 🔲 OPEN |
| 14 | **BUG-008** | 🟢 P3 | `confirmedThisSession` in-memory only; CTA reappears on restart before nightly batch; one-line AsyncStorage fix | Dev | 🟢 POST-LAUNCH |
| 15 | **NEW-005** | 🟢 P3 | AI plan generation (`plans.js`) has no request timeout on Anthropic API call — hangs indefinitely if Haiku is unresponsive; fix with `Promise.race` or AbortSignal | Dev | 🆕 NEW |

---

## New Issues Absorbed From 2026-05-23 Tester Report

### 🟠 NEW-001 — AuthContext push registration is silent dead code (P1)

**Files:** `mobile/src/context/AuthContext.tsx` (lines 65, 305, 308), `mobile/src/services/pushNotifications.ts` (line 38)

`AuthContext.tsx` imports `registerForPushNotifications` — a name that does not exist. The actual export is `registerForPushNotificationsAsync`. The import resolves to `undefined` at runtime; the call on line 305 throws a `TypeError` that is swallowed by a surrounding `try/catch`. Additionally, line 308 calls `registerPushToken()` which POSTs to `/user/push-token` — an endpoint that does not exist in `user.js`.

**Why push still works today:** `_layout.tsx` independently calls `registerForPushNotificationsAsync()` (correctly named) after auth resolves. That path is the real push registration path and works correctly. The `AuthContext` path is unreachable dead code.

**Recommended fix (Option A — lowest risk):** Delete the `_registerPushToken` callback block from `AuthContext.tsx` entirely and remove `pushTokens.ts`. Document `_layout.tsx` as the canonical push registration path. Eliminates the trap for future developers while touching nothing that works today.

---

### 🟡 NEW-002 — Double paywall push notification at session 5 (P2)

**File:** `peak-fettle-agents/server/routes/workouts.js` (lines 64–135)

On `POST /workouts`, two independent code paths both execute when a free-tier user hits their session limit. Path A (synchronous, pre-response) enqueues a `paywall_session_limit` notification. Path B (async fire-and-forget, post-response) checks `paywall_triggered_at` before enqueuing — but Path A runs *before* Path B sets `paywall_triggered_at`, so the guard is ineffective. On session 5, both enqueue, and the user receives two push notifications with different titles and bodies for the same paywall event.

Secondary bug: Path B uses `COUNT(*) FROM workouts` (counts rest days, cardio imports, and soft-deleted rows) while Path A uses `countRealSessions()` (correct). A user with 3 real lifts + 2 rest days triggers Path B's count but not Path A's, producing a paywall alert at a count that doesn't represent 5 real workouts.

**Recommended fix:** Remove Path A's push enqueue (keep the in-response `paywallTrigger` flag for the frontend signal). Fix Path B's count query to use `countRealSessions()` logic. Path B's `paywall_triggered_at` guard then works correctly as the dedup mechanism.

---

### 🟡 NEW-003 — No retry cap on `notification_queue` (P2)

**Files:** `peak-fettle-agents/server/cron/push-dispatcher.js`, `peak-fettle-agents/server/migrations/20260517_notification_queue.sql`

The schema has no `retry_count` or `failed_permanently` column. Any notification whose delivery fails for a reason other than `DeviceNotRegistered` retries every 5 minutes indefinitely. A corrupt payload, a `MessageTooBig`, or a misclassified transient error will churn the queue forever.

**Recommended fix:** Add `retry_count INTEGER NOT NULL DEFAULT 0` and `failed_permanently BOOLEAN NOT NULL DEFAULT FALSE` via a new migration. Increment `retry_count` on each failure; set `failed_permanently = TRUE` after 5 retries (or immediately for `DeviceNotRegistered`). Add `WHERE NOT failed_permanently` to the dispatcher fetch query.

---

### 🟡 NEW-004 — Expo Push API not batching (P2 — performance)

**File:** `peak-fettle-agents/server/cron/push-dispatcher.js` (line 84)

Each notification is sent as a single-item array (`body: JSON.stringify([message])`). The Expo Push API accepts up to 100 messages per request. With `BATCH_SIZE = 50`, the cron makes 50 sequential HTTP round-trips where 1 would suffice. At current scale this is harmless. When TICKET-025 (Group Streak Credits) goes live, a single group-streak event can produce 100+ queued notifications — sequential 50-call batches will delay time-sensitive streak alerts by multiple cron cycles.

**Recommended fix:** Chunk the pending rows into groups of 100, send each chunk as a single request, map the positionally-aligned ticket array back to row IDs for status updates. Fix before TICKET-025 ships.

---

### 🟢 NEW-005 — AI plan generation has no request timeout (P3)

**File:** `peak-fettle-agents/server/routes/plans.js` (line 455)

The `anthropic.messages.create()` call has no `AbortSignal`, no `Promise.race`, and no timeout. If the Anthropic API is slow or unresponsive, the Express request hangs indefinitely. Under sustained API degradation, worker threads accumulate and the server becomes unresponsive.

**Recommended fix:** Wrap in `Promise.race` against a 30-second `setTimeout` rejection, or pass an `AbortSignal` via the SDK's `signal` option. Return HTTP 504 with a human-readable retry message.

---

## Tester Issues Incorporated From 2026-05-23 Report

| Tester ID | Severity | Tester Recommendation | Roadmap Action |
|-----------|----------|-----------------------|----------------|
| PUSH-001 (verify) | — | Confirm fix on device | ⏳ Awaiting EAS Build (Rank 6) |
| P0-003 HealthKit | 🔴 P0 | Install `react-native-health`, replace stub, test on device | 🔲 Rank 3 — open |
| NEW-001 | 🟠 P1 | Delete dead `_registerPushToken` callback from AuthContext; remove `pushTokens.ts` | 🆕 Rank 5 — new |
| NEW-002 | 🟡 P2 | Remove Path A enqueue; fix Path B count query | 🆕 Rank 9 — new |
| NEW-003 | 🟡 P2 | Add retry cap + `failed_permanently` column via migration | 🆕 Rank 10 — new |
| NEW-004 | 🟡 P2 | Batch up to 100 messages per Expo API request | 🆕 Rank 11 — new (fix before TICKET-025) |
| NEW-005 | 🟢 P3 | Add 30-second timeout via `Promise.race` or AbortSignal | 🆕 Rank 15 — new |
| BUG-008 | 🟢 P3 | Persist `confirmedThisSession` to AsyncStorage | 🟢 Rank 14 — post-launch, unchanged |
| CSV-003 | 🟡 P2 | Validate pace formula with real Strava CSV | ⚠️ Rank 12 — partial, unchanged |
| TICKET-025 | 🟠 P1 | Human staging sign-off on Group Streak Credits UI | ⏳ Rank 7 — awaiting EAS Build |
| TICKET-027 | 🟠 P1 | PowerSync offline real-device test | 🔲 Rank 8 — blocked on TICKET-025 |

All 13 items confirmed resolved-and-not-regressed in the 2026-05-23 parse sweep remain ✅.

---

## Outstanding Exec Decisions

| ID | Decision | Blocking | Status |
|----|----------|----------|--------|
| **OD-5** | Tab architecture: Progress vs. Log as Tab 2 | P1-007, Phase F screen layout freeze, 1.2 Onboarding Redesign | 🔴 HIGHEST PRIORITY exec decision |
| **OD-1** | RPE vs. RIR: does RIR satisfy Marcus's RPE request, or is a separate 1–10 RPE field required? | `log.tsx` set-logging form layout | 🔲 OPEN |
| **OD-2** | Wilks score prominence in Rankings screen | Rankings screen layout | 🔲 OPEN |
| **OD-3** | AI plan calendar view — week-grid at launch or list? | `plans.tsx` layout freeze | 🔲 OPEN |
| **OD-4** | Body composition goal flow — launch with 1.0 or defer to Phase 2? | Onboarding + AI plan screen | 🔲 OPEN |

---

## Phase Status Snapshot

| Phase | Name | Status |
|-------|------|--------|
| A | Core infrastructure & auth | ✅ COMPLETE |
| B | Data model & session logging | ✅ COMPLETE |
| C | AI plans & scoring | ✅ COMPLETE |
| D | Social / groups / streaks | ✅ COMPLETE |
| E | Phase F prep (screen layout, exercise library, CSV import) | ✅ COMPLETE |
| **F** | **EAS Build, store submission, post-launch polish** | 🟡 IN PROGRESS — 2 infra gates + 1 P1 + 3 P2 remain |

---

## Phase F — Remaining Work by Track

### Track 1 — Infrastructure (gating everything else)

1. `git push origin main` — push commit `1879c5b` (PUSH-001 fix) **[Founder, ~1 min]**
2. EAS Build: `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios` **[Founder, ~30 min]**
3. PUSH-001 on-device verification — queue notification, confirm `status: "ok"` Expo receipt

### Track 2 — Core P0/P1 Dev Work

4. **P0-003 HealthKit** — install `react-native-health`, replace `requestHealthKitPermissions()` stub, verify on Apple device via EAS build
5. **NEW-001** — delete `_registerPushToken` block from `AuthContext.tsx`; remove dead `pushTokens.ts`; document `_layout.tsx` as canonical push registration path

### Track 3 — Push Infrastructure Hardening (P2, fix before launch)

6. **NEW-002** — Remove Path A paywall push enqueue in `workouts.js`; fix Path B `COUNT(*)` → `countRealSessions()` logic
7. **NEW-003** — Add `retry_count` + `failed_permanently` columns to `notification_queue` via migration; update dispatcher to skip permanently-failed rows and cap at 5 retries
8. **NEW-004** — Refactor dispatcher to batch up to 100 messages per Expo API request; map ticket responses back by position (fix before TICKET-025 goes live)
9. Supabase service role key — obtain from Supabase dashboard, add to server env

### Track 4 — QA / Staging

10. TICKET-025 — Group Streak Credits UI staging sign-off (once `.ipa` exists)
11. TICKET-027 — PowerSync offline real-device verification (once TICKET-025 cleared)
12. CSV-003 — supply a real Strava `activities.csv` to verify pace unit formula

### Track 5 — Store Submission Prep

13. App Store screenshots (all 4 personas, iPhone 15 Pro / iPhone SE frames)
14. App Store Connect metadata (description, keywords, privacy policy URL, support URL)
15. `PrivacyInfo.xcprivacy` — required for App Store submission
16. Android Play Store listing (parallel to iOS)

### Track 6 — P3 / Post-Launch

17. **NEW-005** — Add 30-second `Promise.race` timeout to `plans.js` Anthropic call
18. **BUG-008** — AsyncStorage persistence for `confirmedThisSession` (one line)
19. TICKET-028 — Apple Watch (blocked, Phase 2)
20. TICKET-029 — Garmin (blocked, Phase 2)

### Track 7 — Exec-Decision-Gated Polish

21. P1-007 — Progress tab registration (blocked on OD-5)
22. Weekly/daily calendar view for AI plans (blocked on OD-3)
23. Body composition goal flow (blocked on OD-4)
24. RPE field on set-logging form (blocked on OD-1)

---

## Recommended Action Order — Next 48 Hours

**Founder actions (non-delegatable):**
1. `git push origin main` — 30 seconds; unblocks every downstream action
2. EAS Build setup — ~30 min; highest-leverage infra action remaining
3. Exec decision on OD-5 (tab architecture) — unblocks largest cluster of Phase F screen work

**Dev actions (parallelizable once git push done):**
4. NEW-001 — delete dead `AuthContext` push registration block (~30 min, zero risk)
5. NEW-002 — fix double paywall notification + count query (~1 hr)
6. NEW-003 — add retry cap migration + dispatcher update (~1 hr)
7. NEW-004 — batch Expo push API calls (~1 hr, do before TICKET-025 sign-off)
8. P0-003 HealthKit — install `react-native-health`, replace stub (needs EAS build + Apple device)

**QA / tester actions:**
9. Supply a real Strava `activities.csv` to close CSV-003 (any metric account, 60 seconds)
10. TICKET-025 sign-off once `.ipa` available

---

## Issues Resolved (Carried Forward from v20)

| ID | Fix | Commit |
|----|-----|--------|
| PUSH-001 | Expo Push API dispatcher — accepts `ExponentPushToken[...]`, drops `FCM_SERVER_KEY` dependency, clears on `DeviceNotRegistered` | `1879c5b` (2026-05-22 PM) |
| PUSH-002 | Resolved by design — Option A path means Expo build infra owns FCM creds | N/A |

---

*Roadmap v21 written by pf-exec-prompts (automated scheduled run) — 2026-05-24.*
*Supersedes v20. Absorbs 5 new issues from `pf-tester-feedback-2026-05-23.md` (NEW-001 through NEW-005).*
*No new code changes this pass — tester feedback from 2026-05-23 fully incorporated into priority stack.*
*Next required founder actions: `git push origin main` + EAS Build setup + OD-5 exec decision.*
