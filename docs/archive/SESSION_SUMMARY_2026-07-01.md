# Peak Fettle — Work Session Summary

**Date:** 2026-07-01
**Repo:** `C:\Users\aavir\dev\Peak Fettle`
**Working model:** All substantive work executed by **Opus max-effort agents**; orchestration, independent verification, and gating done in the main session.
**Net result:** 2 of 3 bugs fixed + verified; 1 bug (free-tier lag) hardened with a real structural fix pending on-device confirmation; a full **parametric training-engine test run** built and delivered for approval (not yet ported into the app).

---

## 1. What was requested

Three reported bugs, to be fixed "with extensive reviews":

1. **Free-tier responsiveness** — glitches/lag on the free tier that are absent on the paid tier when toggled. Later clarified by the user: *"all of the screens feel laggy on touch on the free tier."*
2. **Toggle back to Pro** — a broken state when returning to Pro from the (formerly) paid tier.
3. **Sign-out / delete-account** — extremely glitchy with repeated sign-in pop-ups, only fixed by a delete + reinstall.

Plus a major feature request:

4. **Overhaul Pro-tier schedule generation** — fully account for days/week, time/session, and fitness goals; much deeper research (varying rep ranges, experience-based RIR — higher RIR for less experienced lifters); a deep survey; maximally beneficial routines with low injury risk; support powerlifting goals. **Deliver a test run before implementing.**

Constraint added mid-session: **all work should be done by Opus max-effort agents.**

---

## 2. Codebase context established

Peak Fettle is a **React Native / Expo** app with a **local-first** architecture (documented in `CLAUDE.md`):

- **Tier model:** FREE (`!is_paid`) = on-device SQLite only (`mobile/src/db/localDb.ts`); PRO = server + sync. Branch point: `mobile/src/data/backup/tierPolicy.ts` (`isLocalFirst`, `syncsToServer`, `usesBlobBackup`).
- **Training engine (current, "pf-engine-v1"):** `mobile/src/lib/trainingEngine/` — a template-driven pipeline (selectTemplate → scaleDown → sequence → exerciseFill → loading → reasoning). Rep ranges + RPE are baked into `templates.ts`; `loading.ts` has **no** experience-calibrated RIR (only a generic "RPE 7" fallback).
- **Survey:** `mobile/app/training-survey.tsx`. **Auth:** `mobile/src/context/AuthContext.tsx`. **Tier toggle:** `mobile/app/(tabs)/profile.tsx` ("Pro for now" — no real payment flow; runs the Free→Pro data migration).
- **Verification gate (non-negotiable per CLAUDE.md):** babel parse-sweep of `mobile/app`+`mobile/src`, migrations test, engine test, `tsc --noEmit` delta.
- **Environment caveats (confirmed live this session):** the file mount **silently truncates Write/Edit on files > ~33 KB**, and `rm`/`mv` are blocked. Nothing reaches the device without **push → EAS build → install**.

---

## 3. Decisions captured (engine overhaul)

Asked up front; user's answers:

| Question | Decision |
|---|---|
| How deep should the overhaul go? | **Full parametric rebuild** (generate split, volume, intensity, rep ranges, RIR from parameters — replace fixed templates) |
| Which goals to support first-class? | **Hypertrophy · Max strength & powerlifting · General fitness / fat-loss / recomp · Athletic power & conditioning · + major team-sport plans (soccer, basketball, etc.)** |
| How aggressive by default (injury risk)? | **User-configurable** (failure-proximity, progression speed, deload frequency exposed as survey settings, with safe bounds) |

---

## 4. Work stream A — Engine test run (parametric rebuild)

Built entirely under a new, standalone folder — **zero changes to `mobile/`** — so nothing ships before approval.

**Location:** `engine-v2-testrun/`

| File | Purpose |
|---|---|
| `RESEARCH.md` | Cited evidence synthesis: volume landmarks (MEV/MAV/MRV), RIR-by-experience, loading zones/Prilepin, frequency, periodization selection, powerlifting peaking, team-sport S&C, deloads, injury substitution, config-knob→param mappings |
| `DESIGN_SPEC.md` | Full input schema, new deep-survey flow + branching, stage-by-stage algorithm with formulas/tables/defaults, and mapping back onto the existing engine's output shape (so the port is mechanical) |
| `catalog.mjs`, `params.mjs`, `engine.mjs`, `run-samples.mjs` | Dependency-free ESM prototype (runs under plain `node`, deterministic) |
| `TEST_RUN.md` | Human-readable report: 6 full sample athletes + a contrast section |

**What it demonstrates (all parametric, pure on-device, deterministic):**

- **Experience-based RIR** — novice trains at RIR 4 (RPE 6), well shy of failure; intermediate/advanced tighten to RIR 3→2.
- **Varying rep ranges** by lift role and day (primary 5–10, accessory 10–15; DUP top-set/back-off).
- **Days/week + session length + goal** drive split, per-muscle volume (MEV→MRV ramp), and exercise count.
- **Powerlifting peaking** — blocks laid backward from a meet date with auto opener/2nd/3rd attempt suggestions.
- **Team sports + injuries + config knobs** — e.g. basketball in-season with knee-safe swaps; knobs shift RIR floor, progression speed, deload cadence.

**Six sample profiles generated:** (1) novice / general fitness / 3d / 45min / cautious; (2) intermediate / hypertrophy / 5d / 75min / chest+back priority; (3) advanced / powerlifting / 4d / meet in 10 weeks; (4) time-crunched / fat-loss / 3d / 30min; (5) basketball / in-season / knee-sensitive; (6) intermediate / athletic power / 4d.

**Honest refinements flagged for the port (not blockers):** the novice sample stacks too many squat-pattern variations in a week (contrary to the low-injury aim), and most lifts get tagged "primary," muting the role-based rep/RIR differentiation.

**Status:** ⏳ **Awaiting the founder's approval** before the parametric port into `training-survey.tsx` + the engine. This is the explicit gate.

---

## 5. Work stream B — Bug fixes

All changes left in the working tree (**not committed, not pushed**).

### Bug 3 — Sign-out / delete-account loop → FIXED & VERIFIED
- **Root cause:** `logout()`/`_clearAuthState()` cleared only the token + cached profile, leaving the prior user's local SQLite data, the `outbox`/`migration_state` bookkeeping, and onboarding/first-launch flags behind (the "reinstall to fix" state). Separately, the OAuth hook re-fired its retained `success` response on every remount — the *repeated sign-in pop-ups*.
- **Fix:** new `mobile/src/data/localReset.ts` — complete, idempotent, best-effort teardown of on-device personal tables + `outbox`/`migration_state` + onboarding AsyncStorage flags (verified against the app's **real** key names; `@peak_fettle/theme` deliberately preserved). Wired into `logout` and both delete-account tiers. Added a consume-once OAuth guard (`handledResponseRef`) in `OAuthButtons.tsx`. Respects Invariant 5 (teardown only on genuine logout / definitive 401, never a transient failure).

### Bug 2 — Toggle back to Pro → FIXED & VERIFIED
- **Root cause:** the "Pro for now" toggle re-runs `migrateLocalDataToServer` on every Free→Pro flip; the server `POST /routines` has no `ON CONFLICT`, so a ledger-loss window (or a Pro→Free→Pro cycle) could mint **duplicate** routines.
- **Fix:** `mobile/src/data/migrateToPro.ts` — `uploadRoutines` now fetches existing server routines once and dedups by name, making re-upload idempotent even without a ledger hit. (The `migration_state` ledger survives a toggle since downgrade is not a logout, so the normal cycle stays idempotent.)

### Bug 1 — Free-tier touch lag → STRUCTURAL FIX LANDED, PENDING ON-DEVICE CONFIRMATION
- **Investigation:** user clarified it's **all screens, laggy on touch, free tier only, gone when toggled to Pro**. Ruled out (with file:line evidence): set-logging is tier-gated so free never fills the `outbox`; `syncEngine` is idle for free; `SyncStatusIndicator` pulse is native-driven and skipped for free; `ReadinessCard` is Insights-only (Pro-gated); auto-backup is 6-hour-debounced/one-shot; Home screen has no spin loop; `useSyncStatus` is event-driven.
- **Proven defect fixed:** `AuthProvider` and `ThemeProvider` rebuilt their context `value` object **inline every render**, so every `useAuth`/`useTheme` consumer (essentially the whole tree, via the tab layout, `RootNavigator`, `ScreenLayout`) re-rendered on any incidental update — a classic app-wide "laggy on touch" amplifier. Wrapped both values in `useMemo` with correct dependency arrays (`AuthContext.tsx`, `ThemeContext.tsx`).
- **Honesty note:** a single definitive free-vs-pro per-touch stall was **not provable from static analysis** — every tier-branched path already early-returns for free. The memoization is a genuine, high-impact improvement and the most likely cause, but it needs an **on-device check after the next EAS build**. Also hardened the latent `useGroups`/`useGroupDetail` hooks with a 6s load deadline. If lag persists, a short screen recording of the laggy interaction will let us pin the exact culprit.

---

## 6. Verification (re-run independently in the main session after every agent)

| Check | Result |
|---|---|
| Babel parse-sweep (`mobile/app` + `mobile/src`) | **169 files, 0 failures** |
| Migrations test (`src/db/__tests__/migrations.test.js`) | **12 / 12 pass** |
| Engine test (`src/lib/trainingEngine/__tests__/engine.test.js`) | **8 / 8 pass** (engine untouched) |
| `tsc --noEmit` error count | **57 → 57 (delta 0)** — zero new type errors |
| Engine prototype (`node run-samples.mjs`) | **exit 0, deterministic, no errors** |

---

## 7. File inventory

**New / changed app code (bug fixes — working tree only):**
- `mobile/src/data/localReset.ts` *(new)*
- `mobile/src/context/AuthContext.tsx` *(teardown wiring + context memoization)*
- `mobile/src/theme/ThemeContext.tsx` *(context memoization)*
- `mobile/src/components/auth/OAuthButtons.tsx` *(consume-once OAuth guard)*
- `mobile/src/data/migrateToPro.ts` *(routine dedup idempotency)*
- `mobile/src/hooks/useGroups.ts` *(6s load deadline hardening)*

**New standalone deliverables (no app impact):**
- `engine-v2-testrun/` *(RESEARCH.md, DESIGN_SPEC.md, TEST_RUN.md, catalog.mjs, params.mjs, engine.mjs, run-samples.mjs)*
- `BUGFIX_REPORT_2026-06-30.md` *(detailed per-bug root cause + fix + on-device profiling steps)*
- `SESSION_SUMMARY_2026-07-01.md` *(this file)*

---

## 8. Open items & next steps

1. **Approve (or give feedback on) the engine test run** → then dispatch an Opus agent to do the full parametric port into `training-survey.tsx` + the engine (Task #9, currently blocked on this gate). During the port, apply the two flagged refinements (reduce squat-variation redundancy; tighten primary/secondary/accessory role tagging).
2. **Confirm Bug 1 on device** after push + EAS build. If any lag remains, send a screen recording of the specific interaction.
3. **Deploy the server-side `SRV-USER-02` fix to Railway** — required for paid-tier account deletion.
4. **Commit hygiene:** the large server-file diffs already in the working tree are **pre-existing June-audit line-ending rewrites, not from this session** — exclude them from the bug-fix commit.
5. **Ship:** commit → `git push origin main` (server deploy) → `eas build` → install → test. Nothing reaches the phone before that.

---

## 9. Task ledger (end of session)

| # | Task | Status |
|---|---|---|
| 1 | Root-cause the 3 reported bugs | ✅ completed |
| 2 | Audit current training engine + survey | ✅ completed |
| 3 | Deep exercise-science research → RESEARCH.md | ✅ completed |
| 4 | Design deep survey + algorithm → DESIGN_SPEC.md | ✅ completed |
| 5 | Build test-run prototype + TEST_RUN (GATE) | ⏳ delivered, awaiting approval |
| 6 | Fix bug 1 — free-tier responsiveness | ✅ structural fix + verified (on-device confirm pending) |
| 7 | Fix bug 2 — Pro tier toggle-back | ✅ completed |
| 8 | Fix bug 3 — sign-out / delete-account loop | ✅ completed |
| 9 | Implement engine + survey overhaul | ⛔ blocked on test-run approval |
| 10 | Verification pass | ✅ completed |
