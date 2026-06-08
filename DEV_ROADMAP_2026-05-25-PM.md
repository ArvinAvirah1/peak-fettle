# Peak Fettle — Development Roadmap (v24)
**Date:** 2026-05-25 (automated PM dev pass, `pf-dev-prompts`)
**Status:** ACTIVE — supersedes v23 (DEV_ROADMAP_2026-05-25.md)
**Source inputs:** v23 + independent HEAD-blob parse sweep this pass

---

## Executive Summary

**v23 was wrong about the build being unblocked. This pass found and fixed a P0: seven mobile source files were corrupt in `HEAD`/`origin-main` and would have failed the EAS build.** v23 declared "98/98 files clean, all dev-actionable items resolved, EAS Build is the only gate" — but its sweep parsed only the **working tree**. EAS builds from `origin/main`, where the committed blobs were corrupt.

This pass parsed the **committed HEAD blobs** (not just the working tree) and found 7 corrupt files, all introduced by `63038c3` (2026-05-21). The working tree already held the correct repairs; they had simply never been committed. Fixed by committing the working-tree versions → **`a3be2ae`**. Full HEAD-blob sweep is now **101/101 clean**.

This is the PUSH-002 lesson, generalized and recorded as **CORRUPT-001** in `dev_learnings.md`.

---

## This Pass — Actions Taken (2026-05-25 PM)

### CORRUPT-001 fixed — commit `a3be2ae`

| File | Corruption in HEAD | Type |
|------|--------------------|------|
| `mobile/app/(tabs)/profile.tsx` | cut at `alignItems` (L1314) | truncation |
| `mobile/app/(tabs)/rankings.tsx` | cut at `fontSize: fo` (L1074) | truncation |
| `mobile/app/groups.tsx` | duplicate `StyleSheet.create` block to L1175 (legit end L944) | duplicated block |
| `mobile/app/templates.tsx` | cut after `variant="primary"` (L582) | truncation |
| `mobile/src/components/ThemeSelector.tsx` | `// E-003: was 18` dropped mid-line, commented out `color: meta.accentHex` (L84) | E-003 annotation |
| `mobile/src/hooks/useWorkoutHistory.ts` | cut at `setLoading` (L176) | truncation |
| `mobile/src/utils/liftNames.ts` | cut at `toUpperCase` (L48) | truncation |

- Working-tree versions verified to parse clean (babel jsx+typescript). `groups.tsx` WT confirmed byte-identical to HEAD L1–944 (correct repair, duplicate dropped).
- Committed via temp-index plumbing (CLAUDE.md method). New HEAD: `a3be2ae`.
- **Post-fix sweep: 101/101 committed blobs clean; 80/80 working-tree mobile files clean; 23/23 server JS clean; no null bytes.**

---

## ⚠️ Two Founder actions now gate the build (was one)

1. **`git push origin main`** — `a3be2ae` exists **only locally**; the sandbox cannot push (`Host key verification failed`). **Until this is pushed, EAS will still build the corrupt blobs and fail.** Confirm with `git rev-list --count origin/main...HEAD` → must be `0` after push.
2. **EAS Build** — unchanged from v23, but only meaningful *after* step 1.
3. **Apply** `20260524_notification_queue_retry_cap.sql` in Supabase (unchanged, NEW-003).

---

## Working tree is ahead of origin in other (non-corruption) files — Founder review

Beyond the 7 corruption fixes, the working tree has uncommitted, **non-corrupt** (parses clean) changes vs origin. These are legitimate in-progress edits plus CRLF/line-ending noise — NOT build-breakers — but they mean `origin/main` lags the tested app. Founder/dev should review `git status` and decide what else to commit before launch. Notable: `mobile/src/services/healthKit.ts` (real impl in both, iterated further in WT), `mobile/src/context/AuthContext.tsx`, `mobile/app.json`, `mobile/src/db/powerSyncClient.ts`, `mobile/src/components/SyncStatusIndicator.tsx`. (HealthKit real implementation is present in BOTH HEAD and WT — P0-003 not at risk from this.)

---

## Priority Stack (as of 2026-05-25 PM)

| Rank | ID | Sev | Description | Owner | Status |
|------|----|-----|-------------|-------|--------|
| 0 | **PUSH `a3be2ae`** | 🔴 INFRA | CORRUPT-001 fix is local-only; must reach origin/main or EAS rebuilds corrupt blobs | **Founder** | 🔲 USER ACTION |
| 1 | **EAS Build** | 🔴 INFRA | After push: blocks device testing, push verify, HealthKit verify, store submission | **Founder** | 🔲 USER ACTION |
| 2 | **NEW-003 migration** | 🟡 P2 | Apply `20260524_notification_queue_retry_cap.sql` in Supabase | **Founder** | 🔲 PENDING |
| 3 | **PUSH-001 on-device verify** | 🟠 P1 | Confirm Expo receipt + device delivery | QA | ⏳ AWAITING BUILD |
| 4 | **P0-003 HealthKit device test** | 🔴 P0 | Real impl confirmed in code; needs build + Apple device | QA | ⏳ AWAITING BUILD |
| 5 | **OD-5 tab architecture** | 🟠 EXEC | Progress vs Log as Tab 2 | **Exec (PM)** | 🔲 EXEC DECISION |
| 6 | **TICKET-025 / 027** | 🟠 P1 | Group Streak Credits UI / PowerSync offline | QA/Dev | ⏳ AWAITING BUILD |
| 7 | **Commit remaining WT work** | 🟡 P2 | Review/commit non-corrupt uncommitted changes (see section above) | Dev/Founder | 🔲 OPEN |
| 8 | **CSV-003 / service-role key / store prep** | 🟡 P2 | unchanged from v23 | various | 🔲 OPEN |
| 9 | **Phase 2 tickets** | 🟢 P3 | TICKET-044→050 | Dev | 🔲 POST-LAUNCH |

---

## Confirmed This Pass

| Check | Result |
|-------|--------|
| HEAD-blob parse sweep (101 mobile+server source files) | ✅ 101/101 clean after `a3be2ae` |
| Working-tree mobile sweep | ✅ 80/80 clean |
| Server JS `node --check` | ✅ 23/23 clean |
| Null bytes (server routes/cron) | ✅ none |
| Server JS HEAD blobs | ✅ clean (the v23-pass "28 corrupt" was a checker false-positive: `node --check` on an extension-less temp file) |

---

*Roadmap v24 written by `pf-dev-prompts` (automated scheduled run) — 2026-05-25 PM.*
*Current local HEAD: `a3be2ae` (fix: restore 7 OneDrive-corrupted source files). NOT yet on origin/main.*
*Parse method upgrade recorded in dev_learnings.md (CORRUPT-001): always sweep HEAD blobs, not just the working tree.*
