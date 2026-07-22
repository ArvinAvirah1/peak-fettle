# TICKET-075 — Restore End-to-End App Functionality ("nothing works but sign-up")
**Owner:** Opus (lead) + dev-backend + dev-frontend
**Date opened:** 2026-06-01
**Phase:** R — Revision & Hardening (P0 — gates everything)
**Source:** Founder directive 2026-06-01 ("nothing on the app is functional apart from the sign up"); builds on TICKET-064 (audit), 067 (mocks), 068 (data contract), 069 (resilience).

---

## Goal
Get the app to a state where a real user can sign up **and** complete the core loop — start a
workout, log sets, see history/PBs, view rankings, manage routines — against the real backend,
with **no silent failures**. The founder reports only sign-up works; this ticket finds *why*
each other surface fails and fixes it, screen by screen, with evidence.

## What we already know / fixed (2026-06-01)
- ✅ **Set logging 500'd** because `routes/sets.js` did `RETURNING … is_pr` and no `is_pr`
  column exists. **Fixed** (column removed from RETURNING; PR status is client-derived). This
  is one confirmed cause of "set addition doesn't work".
- ⚠️ **DB schema was drifted** across two migration dirs + loose SQL; now consolidated into
  `db/schema.sql` (TICKET-073 validates + cuts over). A wrong/partial schema is a prime source
  of always-500 tabs (L-024) and undefined-column breaks (L-017).
- ⚠️ The mobile working tree is **mid-refactor** (many uncommitted `MM`/`D`/untracked files as
  of 2026-06-01) and the git index is in a phantom `D`+`??` state for tracked files — see
  "Environment hazard" below. Functionality must be assessed on a **clean, building tree**.

## Acceptance criteria
1. A **functional smoke matrix**: for each screen/tab (home, log, rankings, routines, profile,
   groups, cosmetics, progress, exercise-library) record PASS/FAIL against the real backend
   with the actual error for each FAIL. No screen shows a blank/crash/phantom-reset.
2. Every FAIL is traced to a root cause and either fixed here or routed to the owning ticket
   (mock fallback → 067; schema contract → 068/073; error handling → 069; push → 065;
   percentile → 066). No FAIL left undiagnosed.
3. The core loop works end-to-end on a device build: sign up → start workout → log lift + cardio
   sets → see them in history with correct weight/reps/RIR → PB card updates → rankings tab
   loads a number (not a spinner/500).
4. `peak-fettle-verify` parse-sweep is clean across `mobile/app`, `mobile/src`, and
   `peak-fettle-agents/server` (no truncation/duplication/null-byte).
5. No mock/stub fallback silently substitutes for a failing real call (cross-check TICKET-067).

## Implementation plan
- First stabilize the build: resolve the in-progress mobile refactor so the tree compiles
  (Metro starts, no missing-module/duplicate-symbol). Decide per file whether the refactor
  lands or reverts — **with the founder** where intent is unclear (TICKET-071).
- Then run the smoke matrix against a backend on the validated `db/schema.sql` (TICKET-073).
- Fix backend contract breaks (the remaining 52 query sites — TICKET-068 sweep) before chasing
  UI symptoms; an always-500 endpoint looks like a dozen different UI bugs.

## Test plan
1. `expo start` / EAS build boots with no Metro error.
2. Smoke matrix executed and attached; all core-loop rows PASS.
3. Integration test for the core loop (sign-up → log set → read back) green in CI.

## Environment hazard (flag for the founder — not app code)
The repo's git **index** currently reports tracked files as both staged-deleted (`D`) and
untracked (`??`) while the files exist on disk (e.g. `mobile/src/components/Icon.tsx`,
the migration files). A naive `git add -A && commit` in this state would record **mass
deletions**. Commit with a temp index built from HEAD (the `peak-fettle-commit` skill) and add
only intended paths until the index is reset cleanly. Consider `git reset` (mixed) from a
known-good HEAD on the founder's machine to clear the phantom state.
