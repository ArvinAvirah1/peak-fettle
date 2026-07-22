# Peak Fettle — Development Roadmap (v10)
**Date:** 2026-05-12
**From:** workflow-coordinator (session close summary)
**Status:** ACTIVE — supersedes v9 (`DEV_ROADMAP_2026-05-11.md`)
**Source inputs:** Live dev session 2026-05-11/12, `DEV_ROADMAP_2026-05-11.md` (v9)

---

## Executive Summary

Significant infrastructure progress made in this session. The codebase is now fully on GitHub for the first time. The Quick-Fix Sprint is merged and closed. The mobile dev environment is functional but revealed a critical blocker: PowerSync requires a native build — Expo Go cannot run the app. EAS Build is the path forward for all mobile testing on Windows.

One persistent external blocker: Supabase is experiencing an IPv6 connectivity issue affecting direct DB connections and the password reset flow. The `cleanup-orphaned-auth.yml` workflow cannot complete until this is resolved.

---

## 1. Phase A — CLOSED ✅
No changes. All 8 tickets confirmed complete.

---

## 2. Phase B — CLOSED ✅
No changes. All Phase B items confirmed complete.

---

## 3. Sprints 1–5 — CLOSED ✅
No changes.

---

## 4. Phase C — CLOSED ✅
No changes. All backend and database work complete.

---

## 5. Phase D — IN PROGRESS

### 5A. Feature Track

| Ticket | Description | Status | Notes |
|--------|-------------|--------|-------|
| TICKET-025 | Group Streak Credits UI — staging verification | ⏳ **AWAITING HUMAN TESTERS** | Still pending. Cannot test in Expo Go — requires EAS Build (native). EAS Build setup is prerequisite. |
| TICKET-027 | PowerSync offline sync | 🔲 BLOCKED | Blocked on TICKET-025 sign-off. PowerSync also requires native build — EAS Build needed. |
| TICKET-013 (Phase D) | Apple Watch SwiftUI companion | 🔲 READY TO ASSIGN | No change. |
| Infra | `supabaseAdmin.auth.admin.deleteUser()` prod wiring | 🔲 BLOCKED | Needs Supabase service role key in prod env. |

### 5B. Quick-Fix Sprint — CLOSED ✅

All five items (AA-01, AA-02, AA-03, Z-04, Z-05) merged to `main` on 2026-05-12.

---

## 6. GitHub & Infrastructure (New — completed 2026-05-12)

| Item | Status | Notes |
|------|--------|-------|
| GitHub repo created | ✅ DONE | `ArvinAvirah1/peak-fettle`, private, branch `main` |
| Full codebase committed | ✅ DONE | Backend, mobile, migrations, marketing-site all on `main` |
| `.gitignore` configured | ✅ DONE | node_modules, .env files, resume files excluded |
| GitHub Actions secrets | ✅ DONE | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` wired |
| `cleanup-orphaned-auth.yml` | ⚠️ PARTIAL | Workflow fixed (Node 22, npm install, SUPABASE_DB_URL mapping). Failing due to Supabase IPv6 DB connection issue — external blocker, not a code problem. Retry after Supabase resolves. |
| Supabase DB password reset | 🔲 BLOCKED | Supabase dashboard itself cannot connect to DB via IPv6. Check `status.supabase.com` before retrying. |

---

## 7. Mobile Dev Environment (New — completed 2026-05-12)

| Item | Status | Notes |
|------|--------|-------|
| Expo dependencies installed | ✅ DONE | SDK 54, `--legacy-peer-deps` required |
| `npx expo start --tunnel` | ✅ WORKING | Dev server starts and serves the app |
| Expo Go testing | ❌ NOT VIABLE | PowerSync (`@journeyapps/react-native-quick-sqlite`) is a native module — cannot run in Expo Go |
| EAS Build setup | 🔲 NEXT STEP | Required for all mobile testing. Needs Expo account + `eas login` + `eas build --profile development --platform ios` |

**Critical finding:** All mobile testing going forward requires EAS Build or a Mac with Xcode. Expo Go is permanently ruled out for this project due to PowerSync's native SQLite dependency.

---

## 8. Open Issue Register (as of 2026-05-12)

| Rank | ID | Severity | Description | Status |
|------|----|----------|-------------|--------|
| 1 | TICKET-025 | 🟠 MEDIUM | Human staging sign-off pending — gates TICKET-027 | ⏳ Awaiting beta testers — requires EAS Build first |
| 2 | cleanup-orphaned-auth workflow | 🟡 LOW | DB connection fails due to Supabase IPv6 issue | ⏳ External blocker — check status.supabase.com |
| 3 | EAS Build setup | 🟡 LOW | Required before any mobile testing can happen | 🔲 Next immediate action |

---

## 9. Recommended Action Order — Next Session

1. **Set up EAS Build** — `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios`. This unblocks all mobile testing including TICKET-025.
2. **Check Supabase status** — if IPv6 issue resolved, reset DB password and re-test `cleanup-orphaned-auth.yml` workflow.
3. **Send TICKET-025 tester prompt** to beta testers with the EAS Build `.ipa` link once the build is ready.
4. **Apply v2 percentile migration** in Supabase SQL editor (Step 4 from `DEV_NEXT_STEPS_2026-05-11.md`) — no blockers, can be done any time.
5. **Begin Phase 1 product items** (Steps 8–12 from `DEV_NEXT_STEPS_2026-05-11.md`) — glossary, onboarding redesign, rest days, streak messaging, paid preview.

---

## 10. Product Roadmap Alignment
No changes from v9. Phase 1 product items remain unticketed and are the next major dev focus after EAS Build is set up.

---

*Roadmap v10 generated by workflow-coordinator (session close) — 2026-05-12.*
*Supersedes `DEV_ROADMAP_2026-05-11.md` (v9).*
*Next recommended run: start of next dev session.*
