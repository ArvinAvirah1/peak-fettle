# Tester Prompt — Mock-Removal + Type/Filter Hotfix Sprint Verification
**Date:** 2026-05-16
**From:** pf-dev-prompts (automated dev run, web-and-application-dev)
**To:** Beta testers (`beta-beginner` / Derek, `beta-casual-gymgoer` / Jamie, `beta-competitive-lifter` / Marcus, `beta-runner` / Priya)
**Cc / report destination:** Exec team (`exec-ceo`, `exec-cto`, `exec-product-manager`)
**Status:** ACTION REQUIRED — please file feedback to the exec team after running through the checklist below
**Source:** `pf-tester-feedback-2026-05-16.md` §2 (NEW SHIP BLOCKERS) + §3 (NEW P1)

---

## What changed in this drop

The four issues you (and the code audit) surfaced in the 2026-05-16 feedback report have all been resolved in a single coordinated change. Two of them — MOCK-001 and MOCK-002 — were P0 ship blockers introduced during early dev-mock scaffolding that would have wrecked any production build. The other two — TYPE-001 and EPLEY-001 — were data-correctness defects flagged as P1.

| ID | Severity | What was fixed | How |
|----|----------|----------------|-----|
| **MOCK-001** | 🔴 P0 | `USE_MOCK_AUTH = true` was hardcoded in `mobile/src/context/AuthContext.tsx`, meaning any build (including production) would accept any credentials and grant a hardcoded `tier: 'paid'` profile. | The flag is now gated on `__DEV__ && process.env.EXPO_PUBLIC_USE_MOCK_AUTH === 'true'`. Production / preview EAS profiles (where `__DEV__` is false) can never enable it. Default in dev is also OFF unless a developer explicitly sets the env var in `.env.local`. |
| **MOCK-002** | 🔴 P0 | `MOCK_WORKOUT` (id = `'mock-workout-today'`) was hardcoded in `mobile/app/(tabs)/log.tsx`. Every set log payload sent the fake UUID, which the server's T-03 ownership check rejected with 403. | `MOCK_WORKOUT` removed. The Log tab now uses `usePowerSyncLog()` (TICKET-027), which calls `createWorkout()` on mount to obtain a real server-assigned workout UUID and reactively watches the local SQLite `sets` table for both local writes and server sync. |
| **TYPE-001** | 🟠 P1 | `LiftSet.e1rm_kg: number \| null` lingered in the mobile TypeScript types after the column was dropped server-side in `20260505_sets_weight_raw.sql`. Any client `set.e1rm_kg != null` branch silently evaluated false. | Removed `e1rm_kg` from the `LiftSet` interface and from the LiftSet construction in `usePowerSyncLog.ts` and `usePowerSyncWorkout.ts`. The audit also surfaced two transitive server-side `s.e1rm_kg` SELECTs in `routes/plans.js` (Haiku plan generation) and `routes/user.js` (GDPR export) that would have crashed at runtime — both were replaced with the inline Epley `CASE` pattern already used in `routes/percentile.js`. |
| **EPLEY-001** | 🟠 P1 | The Epley subquery in `GET /percentile` and `GET /percentile/:liftId` filtered on `s.weight_raw > 0` and `s.reps >= 1` but had no explicit `s.kind = 'lift'` guard. Safe in the common case but a known defensive gap from the prior sprint. | Added `AND s.kind = 'lift'` to both Epley subqueries. One-line defensive addition. |

**No application-side migration is required for any of these — the changes are code-level only and ship in the next mobile build + the next server deploy.**

---

## What we need from you

A focused verification pass on the **user-visible behavior** of the auth flow, the Log tab, and the Rankings screen. You do **not** need to re-test TICKET-025 (Group Streak Credits UI) as part of this prompt — that remains a separate, still-pending verification item gated on EAS Build setup.

For each item below, please reply with one of:
- ✅ Verified working as described
- ⚠️ Working but with a caveat (describe)
- ❌ Not working / regressed (describe with steps to reproduce)
- 🤷 Could not verify (describe why — missing access, env setup, etc.)

### 1. MOCK-001 — Real authentication is wired (every persona)

1. Build and install a fresh version of the mobile app (production / preview profile if possible).
2. On the Login screen, try to log in with an obviously invalid email + password (e.g. `nobody@nowhere.invalid` / `wrong`).
3. **Expected:** the login attempt fails with a real error (network or 401). Previously, any credentials succeeded.
4. Then log in with your real test account credentials. Confirm you land on the Home tab and your real profile data (name, weight class, sex) loads — not a hardcoded "Dev User" / `dev@peakfettle.com`.
5. **Marcus, Derek (paid-tier checks):** confirm that paid-tier gating on AI plans behaves as expected — free-tier accounts should not see the AI-plan flow, paid-tier accounts should.

### 2. MOCK-002 — Set logging hits the real backend (every persona)

1. Open the Log tab.
2. **Expected:** the screen shows today's real workout (created server-side via `POST /workouts`). The sync status pill ("synced" / "syncing" / "offline") should appear in the header.
3. Tap `+`, pick an exercise, log a set. Confirm the set appears in the list immediately (optimistic write via PowerSync local SQLite).
4. Force-quit the app, reopen it, and confirm the set is still in the Log tab — it has been synced to the server and back down.
5. **Marcus, Priya:** confirm the workout history view (other dates) also displays correctly with your real synced data.

### 3. TYPE-001 — No silent `undefined` reads from `e1rm_kg` (every persona)

1. This is mostly a regression check — there should be no user-visible difference, but any screen that previously appeared "stale" or "blank" because of the `e1rm_kg` field returning undefined should now behave correctly (because the field was removed entirely and Epley is computed inline server-side).
2. Open the Rankings screen and confirm `epley_estimate_kg` shows a number when you have logged sets for that lift (used to prefill the "Confirm your max" sheet — Option C).
3. **Marcus:** tap "Confirm your max" on any lift card, verify the modal pre-fills with the correct Epley estimate based on your highest weight × reps combo.

### 4. EPLEY-001 — Epley subquery is filtered to lift sets only (Marcus, Priya)

1. This is a defensive correctness fix and is unlikely to produce a user-visible change in the common case.
2. If you have ever logged the same exercise as both a lift kind and a cardio kind (uncommon but possible via the picker), confirm that the `epley_estimate_kg` on your Rankings card now reflects only the lift sets — not any spurious cardio rows.
3. **Priya:** since your usage skews cardio-heavy, please double-check that none of your cardio exercises now show up in Rankings with an unexpected Epley estimate.

### 5. Server-side transitive fixes (Marcus, paid-tier; anyone with GDPR export access)

1. **Marcus:** trigger an AI plan generation (`POST /plans/generate`). Confirm it returns a 200 with a session + reasoning + plan_id. Previously the server-side `s.e1rm_kg` SELECT would have crashed this endpoint with `column "e1rm_kg" does not exist`.
2. Any persona: trigger a GDPR data export (`GET /user/data-export` via the profile screen's "Export my data" button if exposed, else via the API directly). Confirm the export returns a valid JSON blob with sets including an `e1rm_kg` field (now computed inline). Previously this endpoint would have crashed.

---

## Where to send your feedback

File a single consolidated report in your usual feedback file format (e.g., `pf-tester-feedback-2026-05-17.md` or the next dated file) addressed to the exec team. Use the same persona-headed structure you used in prior runs. The exec team will:

1. Roll your findings into the next `DEV_ROADMAP_*` synthesis pass.
2. Decide whether the May 10 release (now hardened with two consecutive hotfix sprints) is finally production-ready, gated on this verification + EAS Build setup.
3. Re-prioritize the P2/P3 backlog (BUG-007 through UX-005) based on what you surface — these remain queued and were intentionally not touched in this sprint to keep the change set focused on ship blockers.

If you find any new issues outside the four items listed here, please flag them in a separate "New issues this run" section so they can be triaged into the next sprint rather than blocking sign-off on this hotfix sprint.

---

## Out-of-scope for this verification

- **TICKET-025 Group Streak Credits UI** — still gated on EAS Build setup; separate prompt will follow once a `.ipa` link is available.
- **TICKET-027 PowerSync offline sync** — the hook itself is wired into `log.tsx` as part of MOCK-002 fix, but the broader staging sign-off remains gated on EAS Build.
- **TICKET-028 Apple Watch / TICKET-029 Garmin** — both blocked on dev account provisioning; not in this run.
- **P2/P3 polish items (BUG-007 to UX-005)** — queued for the post-hotfix sprint per `DEV_ROADMAP_2026-05-14.md` §10–§11.

---

*Generated by web-and-application-dev (automated dev sprint run) — 2026-05-16.*
*Source: `pf-tester-feedback-2026-05-16.md` §2 (NEW SHIP BLOCKERS) + §3 (NEW P1).*
*Files changed in this drop:*
- *`mobile/src/context/AuthContext.tsx` — MOCK-001 (gating fix)*
- *`mobile/app/(tabs)/log.tsx` — MOCK-002 (usePowerSyncLog wiring)*
- *`mobile/src/types/api.ts` — TYPE-001 (e1rm_kg removal + comment update)*
- *`mobile/src/hooks/usePowerSyncLog.ts` — TYPE-001 (SetRow + LiftSet cleanup)*
- *`mobile/src/hooks/usePowerSyncWorkout.ts` — TYPE-001 (SetRow + LiftSet cleanup)*
- *`peak-fettle-agents/server/routes/percentile.js` — EPLEY-001 (kind filter in both Epley subqueries)*
- *`peak-fettle-agents/server/routes/plans.js` — TYPE-001 transitive (server SELECT inline Epley)*
- *`peak-fettle-agents/server/routes/user.js` — TYPE-001 transitive (server SELECT inline Epley)*

*Dev-context updated: `workflow-optimization/context-slices/dev-context.md` (Mock-Removal + Type/Filter Hotfix Sprint section + Lessons §12 / §13).*
