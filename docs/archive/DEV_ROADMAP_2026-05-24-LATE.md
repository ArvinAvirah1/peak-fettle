# Peak Fettle — Development Roadmap (v23)
**Date:** 2026-05-24 (automated late dev pass)
**From:** pf-dev-prompts (scheduled dev task)
**Status:** ACTIVE — supersedes v22 (DEV_ROADMAP_2026-05-24-NIGHT.md)
**Source inputs:**
- v22 (2026-05-24 1AM dev pass)
- Fresh parse-sweep of `mobile/app`, `mobile/src`, `peak-fettle-agents/server` (104 files)

---

## Executive Summary

v22 declared the dev backlog clean ("no unresolved code defects remain") and the
single launch gate to be EAS Build. **That was wrong.** A fresh `@babel/parser`
sweep this pass found a **P0 corruption sitting in HEAD**: `push-dispatcher.js`
was committed truncated by commit `40bce69` (the "NEW-003/004 rewrite"), so the
push cron threw a `SyntaxError` on load and every push silently failed.

This pass reconstructed the file and committed the fix (`263556d`). The push
dispatcher now parses and passes `node --check`. The whole tree is clean again
(104/104 files parse).

**One blocking caveat:** the fix is committed **locally only**. The sandbox
cannot `git push` (no SSH creds). **The founder must push `263556d` to
`origin/main`** before EAS Build — EAS builds from the remote, so a build run now
would still ship the broken dispatcher.

---

## What Changed This Pass (commit `263556d`)

| ID | Fix | Files |
|----|-----|-------|
| **PUSH-002** | Restored `push-dispatcher.js` truncated by OneDrive at `40bce69` (line 224, mid-comment). Rebuilt the `run()` dispatch loop on the intact NEW-003/004 helpers: chunks pending rows into `EXPO_CHUNK_SIZE` (100) groups, one Expo API request per chunk, maps tickets back by position, records failures via `markFailed` (retry_count + failed_permanently cap). Verified: babel parse + `node --check`. | `push-dispatcher.js` |

Dev context (`CLAUDE.md`) updated with: the PUSH-002 error writeup + best practice
(always re-run the parse sweep before trusting a "clean backlog" roadmap; verify
the HEAD blob parses, walk history to find the newest compiling blob), and a
corrected commit recipe (plumbing via `commit-tree` + hand-written loose ref,
since `git commit`/`update-ref` are both lock-blocked on this mount).

---

## ⚠️ Required Founder Action (NEW — blocks everything downstream)

1. **`git push origin main`** from a machine with GitHub credentials. Local HEAD is
   `263556d`; `origin/main` is still `8e5cb93` (the broken-dispatcher state).
   Until this push lands, EAS Build will compile the truncated dispatcher.

---

## Priority Stack (as of 2026-05-24 late)

| Rank | ID | Sev | Description | Owner | Status |
|------|----|-----|-------------|-------|--------|
| 0 | **Push `263556d` to origin/main** | 🔴 INFRA | PUSH-002 fix is local-only; EAS builds from remote | **Founder** | 🔲 USER ACTION |
| 1 | **EAS Build** | 🔴 INFRA | No `.ipa`/`.apk`; blocks device testing, push verify, P0-003, store submission. Run *after* Rank 0. | **Founder** | 🔲 USER ACTION |
| 2 | **PUSH on-device verify** | 🟠 P1 | Now covers PUSH-001 *and* PUSH-002: queue a push, confirm `status:"ok"` Expo ticket + device delivery. Dispatcher has broken twice silently — treat as unproven until verified. | QA | ⏳ AWAITING EAS BUILD |
| 3 | **P0-003 HealthKit device test** | 🔴 P0 | Verify `requestHealthKitPermissions()` end-to-end on Apple device | QA | ⏳ AWAITING EAS BUILD |
| 4 | **OD-5 tab architecture** | 🟠 EXEC | Progress vs. Log as Tab 2 — blocks P1-007, layout freeze | **Exec (PM)** | 🔲 EXEC DECISION |
| 5 | **TICKET-025** | 🟠 P1 | Group Streak Credits UI — staging sign-off | QA | ⏳ AWAITING EAS BUILD |
| 6 | **TICKET-027** | 🟠 P1 | PowerSync offline sync — real-device test | Dev/QA | 🔲 BLOCKED on TICKET-025 |
| 7 | **NEW-003 migration apply** | 🟡 P2 | `20260524_notification_queue_retry_cap.sql` must be applied in Supabase — the PUSH-002 dispatcher now *requires* `retry_count` + `failed_permanently` columns; without it the dispatcher errors on every row | **Founder/Dev** | 🔲 PENDING DB APPLY |
| 8 | **Supabase service role key** | 🟡 P2 | For `auth.admin.deleteUser()` + cohort-graduation cron | **Founder** | 🔲 OPEN |
| 9 | **CSV-003** | 🟡 P2 | Strava pace unit unconfirmed | QA/Tester | ⚠️ PARTIAL |
| 10 | **Store submission prep** | 🟡 P2 | Screenshots, metadata, `PrivacyInfo.xcprivacy`, Play listing | Dev | 🔲 OPEN |

> Note: Rank 7 (migration apply) is upgraded in importance this pass. The restored
> dispatcher's SQL references `failed_permanently` / `retry_count`; if the migration
> is not applied, the dispatcher will throw on every batch. Apply it together with
> the Rank 0 push.

---

## Verification This Pass

- Parse sweep: **104/104** files in `mobile/app`, `mobile/src`, `peak-fettle-agents/server` parse with `@babel/parser` (jsx + typescript). 0 null-byte files.
- `push-dispatcher.js`: `node --check` passes; helper signatures (`sendExpoChunk(messages)→tickets[]`, `markSent(client,id)`, `markFailed(client,notif,errMsg)`) line up with the reconstructed loop.
- Migration `20260524_notification_queue_retry_cap.sql` confirmed present and defines exactly the columns/index the dispatcher uses.
- Commit `263556d` verified on local `main` (parent `8e5cb93`); committed blob's tail is intact (ends at `}`, not truncated).

---

## Phase Status Snapshot

| Phase | Name | Status |
|-------|------|--------|
| A–E | Core, data, AI, social, Phase-F prep | ✅ COMPLETE |
| **F** | EAS Build, store submission, post-launch polish | 🟡 IN PROGRESS — gated on the Rank 0 push, then EAS Build |

---

*Roadmap v23 written by pf-dev-prompts (automated scheduled run) — 2026-05-24.*
*Commit `263556d` restores the push dispatcher truncated at `40bce69` (PUSH-002).*
*Action required: founder must `git push origin main` and apply the retry-cap migration before EAS Build.*
