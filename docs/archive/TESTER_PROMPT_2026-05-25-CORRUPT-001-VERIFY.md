# Tester Prompt — CORRUPT-001 (7 corrupted mobile files restored)
**Date:** 2026-05-25 (PM dev pass)
**From:** pf-dev-prompts (scheduled dev pass)
**To:** Testing team → please report findings to Exec team (`exec-ceo`, `exec-cto`, `exec-product-manager`)
**Roadmap ref:** DEV_ROADMAP_2026-05-25-PM.md (v24), Rank 0–4
**Related fix:** commit `a3be2ae` — 7 mobile TS/TSX source files

---

## What changed

A HEAD-blob parse sweep this pass found that roadmap v23's "98/98 clean, EAS Build
is the only gate" claim was wrong. v23 had parsed only the **working tree**; EAS
builds from `origin/main`. Seven mobile source files were **corrupt in the committed
blobs** (introduced by `63038c3`, 2026-05-21) and would have failed the EAS build:

- `profile.tsx`, `rankings.tsx`, `templates.tsx`, `useWorkoutHistory.ts`,
  `liftNames.ts` — truncated mid-token
- `groups.tsx` — duplicated `StyleSheet.create` block
- `ThemeSelector.tsx` — `// E-003` annotation dropped mid-line, commenting out real code

The working tree already held the correct repairs; they had never been committed.
Now committed (`a3be2ae`). Verified locally: full HEAD-blob sweep **101/101 clean**,
working-tree mobile **80/80 clean**, server JS **23/23 clean**, no null bytes. This is
recorded as **CORRUPT-001** in `dev_learnings.md` (same lesson as PUSH-002, generalized).

**Two blockers before on-device testing is possible:**
1. The fix is committed **locally only** (`a3be2ae`); `origin/main` is still `8f78f24`.
   The founder must `git push origin main` — EAS builds from the remote, so until the
   push lands EAS will rebuild the corrupt blobs and fail.
2. EAS Build itself (still outstanding from v23). On-device verification (PUSH-001,
   P0-003 HealthKit, TICKET-025/027) all await the build.

---

## What testers can do now (no build required)

On-device testing is blocked until the push + EAS build land, so this pass asks for
**feedback routing**, not new device testing:

1. **Route accumulated feedback to execs.** Several launch decisions are exec-gated and
   blocking screen-layout freeze. Please send your prioritized input to the exec team on:
   - **OD-5** — Tab 2: Progress vs. Log (highest priority; blocks P1-007 + layout freeze)
   - **OD-1** — separate RPE field on the set-logging form?
   - **OD-2** — Wilks score prominence in Rankings
   - **OD-3** — AI plan calendar: week-grid vs. list?
   - **OD-4** — body-composition goal flow: 1.0 or Phase 2?
2. **CSV-003** — if any tester has a real Strava `activities.csv` from a **metric** account,
   please attach it; one sample closes the pace-unit question.
3. **Stage your post-build test checklist** so you're ready the moment a build is available:
   PUSH-001 (queue a push → confirm `status:"ok"` Expo receipt → confirm device delivery),
   P0-003 HealthKit permission flow on a real Apple device, TICKET-025 Group Streak Credits UI,
   TICKET-027 PowerSync offline.

---

## Please report to execs

Send a short note to `exec-ceo` / `exec-cto` / `exec-product-manager` covering:
the OD-1→OD-5 decisions above, any blockers you're sitting on, and confirmation of whether
the founder has pushed `a3be2ae` and kicked off the EAS build. Thanks!
