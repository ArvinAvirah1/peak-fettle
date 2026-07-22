# Peak Fettle — Development Roadmap (v19)
**Date:** 2026-05-22 (PM automated dev pass)
**From:** pf-dev-prompts (scheduled dev task)
**Status:** ACTIVE — supersedes v18 (DEV_ROADMAP_2026-05-22.md, 1AM pass)
**Source inputs:**
- v18 — carried forward
- `pf-tester-feedback-2026-05-22.md` (tester pass, 17:03 — arrived AFTER the v18 1AM pass)

---

## Executive Summary

The v18 (1AM) pass closed all then-known unblocked dev work. A tester pass landed later the same day (17:03) and surfaced **PUSH-001 — a P0 / Rank-1 defect**: push notifications were silently failing for **all** users because the server dispatched Expo push tokens to FCM's Legacy HTTP API, which rejected them and then nulled the stored token.

**This PM pass fixed PUSH-001 (Option A — Expo Push API).** This was the single highest-priority item in the tester report and was fully unblocked (server-only, no exec decision, no mobile change).

Item completed this session:

- **PUSH-001 — Push token / transport mismatch ✅ DONE** — `peak-fettle-agents/server/cron/push-dispatcher.js` now sends via the Expo Push API (`https://exp.host/--/api/v2/push/send`) instead of FCM's Legacy HTTP endpoint. The dispatcher accepts the stored `ExponentPushToken[...]` format directly, drops the `FCM_SERVER_KEY` dependency, and clears stale tokens on Expo's `DeviceNotRegistered` receipt. Committed locally as `1879c5b`. **Not yet pushed to `origin/main`** — see Track 1.

As a knock-on effect, **PUSH-002 (Android `google-services.json`) is now resolved-by-design** — with the Expo Push API path, Expo's own build infrastructure owns FCM credentials, so no `google-services.json` is required in the app repo. Downgraded to 🟢 P3 / no action.

---

## 1. Phases A–E — CLOSED ✅

No changes from v18.

---

## 2. Phase F — EAS Build, Store Submission & Post-Launch Polish (IN PROGRESS)

### Track 1 — Infrastructure (BLOCKING)

| Item | Status | Action |
|------|--------|--------|
| **Push commit `1879c5b` not on remote** | 🔴 **USER ACTION REQUIRED** | `git push origin main` from a credentialed environment. EAS builds from `origin/main`; the PUSH-001 fix will not reach a build until pushed. (Sandbox dev pass has no GitHub SSH credentials.) |
| **EAS Build setup** | 🔴 **USER ACTION REQUIRED** | `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios` |
| TICKET-025 — Human staging sign-off | ⏳ AWAITING EAS BUILD | Run tester prompt once `.ipa` is ready |
| TICKET-027 — PowerSync human verification | 🔲 BLOCKED on TICKET-025 | |
| Supabase service role key | 🔲 OPEN | Required for `auth.admin.deleteUser()` in `DELETE /user/account` |
| `cleanup-orphaned-auth.yml` | ⚠️ EXTERNAL BLOCKER | Supabase IPv6 issue. Check `status.supabase.com` before retry. |

### Track 2 — Store Submission Prep

Unchanged from v18: App Store screenshots, App Store Connect metadata, `PrivacyInfo.xcprivacy`, Android Play Store listing, TICKET-028 (Apple Watch, blocked), TICKET-029 (Garmin, blocked).

### Track 3 — Phase F Polish

Unchanged from v18. P1-007 (Progress tab registration) still 🔲 BLOCKED on OD-5. CSV-003 still ⚠️ PARTIAL (needs a real Strava export). P2-005 / P2-007 post-launch.

---

## 3. Push Notifications — Status After This Pass

| ID | Severity | Status | Notes |
|----|----------|--------|-------|
| **PUSH-001** | 🔴 P0 → ✅ | **FIXED (code)** | Expo Push API dispatcher. Commit `1879c5b`. Needs push + EAS build to verify on-device. |
| **PUSH-002** | 🟠 P1 → 🟢 P3 | **RESOLVED BY DESIGN** | Option A path: Expo owns FCM creds; no `google-services.json` needed in repo. No action. |
| PUSH-001 on-device verify | — | ⏳ AWAITING EAS BUILD | Send a queued notification, confirm delivery + receipt `status: "ok"`. |

---

## 4. Outstanding Exec Decisions (Action Required) — unchanged from v18

| ID | Decision | Blocking |
|----|----------|----------|
| **OD-1** | RPE vs. RIR — separate RPE field on set logging form? (lean: yes → ship TICKET-044) | `log.tsx` |
| **OD-2** | Wilks score placement prominence | Rankings screen |
| **OD-3** | AI plan calendar view — week-grid at launch or list? | `plans.tsx` |
| **OD-4** | Body composition goal flow — launch or defer? | Onboarding + AI plan |
| **OD-5** | Tab architecture — Progress (per spec) or Log as Tab 2? | P1-007, tab freeze, 1.2 redesign |

OD-5 remains the highest-leverage exec decision.

---

## 5. Phase 2 Tickets — unchanged from v18

TICKET-044 through TICKET-050 written and ready to assign. Recommended order: TICKET-046 → TICKET-044 (pending OD-1) → TICKET-047 → TICKET-045 → TICKET-048 → TICKET-049 → TICKET-050.

---

## 6. Carry-Forward / Open Issue Register (as of 2026-05-22 PM)

| Rank | ID | Severity | Description | Status |
|------|----|----------|-------------|--------|
| 1 | Push commit on remote | 🔴 INFRA | `1879c5b` not pushed | 🔲 USER ACTION |
| 2 | EAS Build | 🔴 INFRA | Not configured | 🔲 USER ACTION |
| 3 | P0-003 HealthKit | 🔴 P0 | `requestHealthKitPermissions` stub (needs `react-native-health` + EAS) | 🔲 OPEN |
| 4 | OD-5 | 🟠 EXEC | Tab architecture decision | 🔲 EXEC DECISION |
| 5 | CSV-003 | 🟡 P2 | Strava pace unit clamp — needs real export | ⚠️ PARTIAL |
| 6 | TICKET-025 | 🟠 | Human staging sign-off | ⏳ AWAITING EAS BUILD |
| 7 | TICKET-027 | 🟠 | PowerSync verification | 🔲 BLOCKED on TICKET-025 |
| 8 | BUG-008 | 🟢 P3 | `confirmedThisSession` in-memory (same-night edge case) | 🟢 POST-LAUNCH |
| — | PUSH-001 | ✅ | Expo Push API dispatcher | ✅ DONE 2026-05-22 PM |
| — | PUSH-002 | ✅ | Resolved by design (Option A) | ✅ N/A 2026-05-22 PM |

---

## 7. Recommended Action Order — Next Session

1. **Push commit `1879c5b` to `origin/main`** (user action) — so EAS builds include the push fix.
2. **EAS Build setup** (user action) — unblocks all on-device testing incl. PUSH-001 verification, TICKET-025/027, P0-003.
3. **PUSH-001 on-device verification** — once a build exists: queue a notification, confirm delivery and an `ok` Expo receipt.
4. **P0-003 HealthKit** — install `react-native-health`, replace the stub; verify on an Apple device.
5. **Exec decision: OD-5 (tab architecture)** — unblocks P1-007 and 1.2 Onboarding Redesign.
6. **Exec decisions: OD-1, OD-3, OD-4** — freeze Phase F screens before QA.
7. **Supabase service role key** — needed for `DELETE /user/account` and `cohort-graduation.yml`.
8. **CSV-003 verification** — supply a real Strava `activities.csv`.
9. **Phase 2 tickets** — begin TICKET-046 once OD-1/OD-3/OD-4 are resolved.

---

## 8. Issues Resolved This Session (2026-05-22 PM)

| ID | Severity | Description | Fix | Files Changed |
|----|----------|-------------|-----|---------------|
| PUSH-001 | 🔴 P0 | Expo push tokens sent to FCM Legacy API → all push silently failed and tokens were nulled on first attempt | Rewrote the dispatcher to POST to the Expo Push API; accepts `ExponentPushToken[...]` directly; dropped `FCM_SERVER_KEY`; stale-token cleanup on `DeviceNotRegistered`. Node `--check` clean. | `peak-fettle-agents/server/cron/push-dispatcher.js` (commit `1879c5b`) |
| PUSH-002 | 🟠→🟢 | Android `google-services.json` missing | Moot under Option A — Expo build infra owns FCM creds. Documented; no repo change. | (none) |

---

## 9. Dev Context — Implementation Notes (this pass)

See the dedicated "PUSH-001 dispatcher transport" entry added to `CLAUDE.md` for the root-cause summary and the best-practice rule (verify token format ↔ send transport agree). Key points:

- **Token ↔ transport must match.** `getExpoPushTokenAsync()` → Expo Push API. `getDevicePushTokenAsync()` → raw FCM/APNs. Never cross them. The DB column is still named `fcm_token` for migration compatibility, but it now holds an Expo token — do not let the column name imply the transport.
- **`FCM_SERVER_KEY` is no longer read** by the dispatcher. It can be removed from server env once the change is deployed.
- **Optional `EXPO_ACCESS_TOKEN`** is sent as a Bearer header if present (only needed if the Expo project enables Enhanced push security).
- **Git on this mount:** committing required a temp index (`GIT_INDEX_FILE=/tmp/pf.idx`) because `.git/index.lock` cannot be unlinked on the OneDrive mount. The default-index path is unusable for staging here. See CLAUDE.md.

---

*Roadmap v19 written by pf-dev-prompts PM pass — 2026-05-22.*
*Supersedes v18. PUSH-001 fixed in code (commit `1879c5b`, not yet pushed). PUSH-002 resolved by design.*
*Next action required from founder: push `1879c5b` + EAS Build setup; then OD-5 exec decision.*
