# TICKET-064 — Full-Codebase Audit Findings Register
**Date:** 2026-05-29  
**Auditor:** Sonnet (coordinator run)  
**Scope:** `mobile/app`, `mobile/src`, `peak-fettle-agents/server` (non-node_modules)  
**Definition of done:** @babel/parser sweep + `node --check` — both green ✅

---

## Parse Sweep Results

| Check | Result |
|-------|--------|
| @babel/parser sweep (mobile/app, mobile/src, peak-fettle-agents/server) | ✅ 0 broken files |
| `node --check` all server JS (routes, cron, middleware, lib) | ✅ 24/24 pass |
| Null byte scan | ✅ 0 files |

**No structural corruption in working tree.** The repo is now at `C:\Users\aavir\dev\Peak Fettle` (non-OneDrive), consistent with CLAUDE.md's recommended fix.

---

## Findings Register

### F-001 — cohort-graduation.js inserts wrong columns into notification_queue
**Severity:** 🔴 P0 (silent data loss — cohort graduation pushes never fire)  
**File:** `peak-fettle-agents/server/cron/cohort-graduation.js:93`  
**Pattern:** L-017, L-024 (RETURNING/SELECT references unapplied column)

The INSERT uses:
```sql
INSERT INTO notification_queue (user_id, payload, created_at)
```
But the `notification_queue` schema (migration `20260517_notification_queue.sql`) defines columns `type, title, body, data` — there is **no `payload` column**. Every cohort graduation push notification silently fails with a DB error (caught and logged as `notification_queue unavailable`). The `push-dispatcher` SELECT reads `nq.title, nq.body, nq.data` — all three columns that cohort-graduation never populates.

**Fix for TICKET-065:** Rewrite the INSERT in `cohort-graduation.js` to use the actual schema columns:
```js
INSERT INTO notification_queue (user_id, type, title, body, data, created_at)
VALUES ($1, 'cohort_graduation', $2, $3, $4::jsonb, now())
```
where title/body/data are derived from the existing `payload` JSON object.

---

### F-002 — exercises.ts has active mock fallback in getExercises()
**Severity:** 🟠 P1 (mock data silently served in production if /exercises endpoint fails)  
**File:** `mobile/src/api/exercises.ts:47–57`  
**Pattern:** L-003, L-010, L-016, L-021, L-022

`getExercises()` catches **all** errors and returns `MOCK_LIBRARY` with hardcoded UUIDs (`00000000-…`). These mock UUIDs are not rows in the production DB. Any user whose app fails to reach the /exercises endpoint gets mock exercises; if they then log a set, the FK violation causes a 500 and the set is lost.

The existing comment at line 69 correctly documents the danger for `searchExercises` and correctly returns empty results there. The same discipline must be applied to `getExercises`.

**Fix for TICKET-067:** Remove the mock fallback from `getExercises()`. On error, throw or return an empty library so the UI can surface an error state. Remove the `MOCK_EXERCISES`/`MOCK_LIBRARY` constants entirely, or gate them behind a `__DEV__` flag that is provably not reachable in production.

---

### F-003 — pushNotifications.ts stores token via patchProfile (fcm_token field) while pushTokens.ts module is a dead stub
**Severity:** 🟠 P1 (two competing token registration paths; one is never wired)  
**Files:** `mobile/src/services/pushNotifications.ts:61`, `mobile/src/api/pushTokens.ts:1–6`  
**Pattern:** L-013 / PUSH-001

The active path: `pushNotifications.ts` calls `patchProfile({ fcm_token: token.data })`, patching the `users.fcm_token` column directly via `PATCH /user/profile`. This path works.

The dead path: `pushTokens.ts` exports `registerPushToken` / `unregisterPushToken` that POST to `/user/push-token`, a **non-existent server endpoint** (confirmed by grepping `routes/user.js` — no route for `/user/push-token`). The file says "TODO(backend): not yet built." This module is never called anywhere.

**Risk:** The dead module may confuse future agents into wiring it instead of the working path. Also, the working path uses `patchProfile` which doesn't distinguish "new token" from "profile update," making debugging harder.

**Fix for TICKET-065 (push pipeline rewrite):** Decide on one canonical registration path. Either:
- (a) Implement `/user/push-token` on the server and switch `pushNotifications.ts` to use `registerPushToken`, OR
- (b) Delete `pushTokens.ts` and keep the `patchProfile` path, documented as intentional.

**Open question for founder:** Q6 — see OPEN_QUESTIONS section below.

---

### F-004 — /user/push-token server endpoint missing
**Severity:** 🟠 P1 (dead client module references it; no-op now but latent confusion)  
**File:** `peak-fettle-agents/server/routes/user.js` (endpoint absent)  
**Linked to:** F-003

No `/user/push-token` route exists in `user.js`. The `pushTokens.ts` client module documents the expected contract. Either build it or delete the client module (see F-003).

---

### F-005 — rankings.tsx uses `(user as any)?.primary_discipline`
**Severity:** 🟡 P2 (type safety hole; undefined if field not on user object)  
**File:** `mobile/app/(tabs)/rankings.tsx:737`  
**Pattern:** L-021

The cast `(user as any)?.primary_discipline` bypasses TypeScript. The TODO comment at line 431 confirms `primary_discipline` is not yet exposed on the user object from `useAuth()`. This will silently pass `null` to a component that may not handle it gracefully.

**Fix for TICKET-067 or TICKET-069:** Add `primary_discipline` to the user type and `useAuth` return value. Confirm it is returned by the `/user/profile` endpoint (check `routes/user.js` SELECT list).

---

### F-006 — index.tsx PR detection is client-side only (30-day window)
**Severity:** 🟡 P2 (PRs may be missed for users with long gaps between sessions)  
**File:** `mobile/app/(tabs)/index.tsx:9`  
**Pattern:** L-003 (mock/approximation standing in for real feature)

The TODO at line 9: "replace with GET /prs once backend endpoint ships." The current implementation is a client-side approximation that only looks at data already loaded in the local state. No `/prs` endpoint exists on the server.

**Fix:** Scope for TICKET-069 or a future ticket. For now, at least ensure the client-side fallback is documented as intentional. This is not a breakage, just a known approximation.

---

### F-007 — HealthKit is a graceful stub (onboarding.tsx, health-metrics.tsx)
**Severity:** 🟡 P2 (known, documented limitation — not a regression)  
**Files:** `mobile/app/onboarding.tsx:90–100`, `mobile/app/health-metrics.tsx:255–257`

HealthKit integration is stubbed with a `requestHealthKitPermissions()` that does nothing (`expo-health` not installed). The health-metrics screen shows a warning in a dev build. This is intentional per P0-003 but needs to be tracked as a pre-launch gap.

**Fix for TICKET-069:** Complete HealthKit integration before launch. Requires EAS development build.

---

### F-008 — ExercisePicker still uses direct API call, not PowerSync hook (TICKET-027 TODOs)
**Severity:** 🟡 P2 (outstanding migration left open from an earlier ticket)  
**File:** `mobile/src/components/ExercisePicker.tsx:12, 82, 101`

Three `TODO(TICKET-027)` comments mark where PowerSync hooks should replace direct API calls. TICKET-027 was supposed to complete this. Still open.

**Fix:** Verify whether TICKET-027 was actually completed. If the PowerSync layer is in place (it appears to be — `PowerSyncContext.tsx` and `usePowerSyncWorkout.ts` exist), complete the swap in `ExercisePicker`.

---

### F-009 — Broad empty catch blocks swallow errors silently
**Severity:** 🟡 P2 (resilience / observability gap)  
**Files:** multiple (see below)  
**Pattern:** L-004, L-008, L-011, L-018, L-019

Empty `} catch {` blocks (no logging, no rethrow) found in:
- `mobile/src/api/auth.ts:72` — logout failure silently swallowed (intentional — fire-and-forget, comment explains)
- `mobile/src/api/exercises.ts:53` — **getExercises fallback to mock** (see F-002)
- `mobile/src/api/sets.ts:85` — personal-best fetch returns null silently
- `mobile/src/context/AuthContext.tsx:187, 196, 299, 303, 338` — multiple auth state transitions can fail silently
- `mobile/src/services/pushNotifications.ts:62` — token registration failure silently dropped
- `mobile/src/theme/ThemeContext.tsx:85, 110, 118` — theme persistence failures silently ignored
- `mobile/app/(tabs)/index.tsx:363, 471` — home screen data fetches can silently fail

Most of these are reasonable resilience choices (UI must not crash), but none of them log errors. A `console.warn` at minimum would enable debugging in production via Sentry or similar.

**Fix for TICKET-069:** Add `console.warn` (and ideally Sentry breadcrumbs) to each catch block. Consider a lightweight `captureError()` helper that logs in dev and sends to Sentry in prod.

---

### F-010 — sets.js uses `RETURNING *` (risky with schema evolution)
**Severity:** 🟡 P2 (latent — not broken now, but a trap)  
**File:** `peak-fettle-agents/server/routes/sets.js:97`  
**Pattern:** L-017, L-024

`RETURNING *` returns all columns including any future ones added by migrations. If a migration adds a column with a constraint or default that differs from what the client expects, the response shape silently changes. All other routes use explicit RETURNING column lists.

**Fix for TICKET-068:** Replace `RETURNING *` with an explicit column list mirroring what the mobile client actually reads from the response.

---

### F-011 — notification_queue `type` values are not normalized across writers
**Severity:** 🟡 P2 (data quality — not a breakage today)  
**Files:** `peak-fettle-agents/server/cron/group-streaks.js`, `push-dispatcher.js`, `cohort-graduation.js`

The `type` column uses string literals (`'streak_milestone'`, `'plan_ready'`, `'cohort_graduation'`) defined independently in each writer. No shared enum or constant. A typo in any writer creates a row the dispatcher can read but the client cannot display correctly.

**Fix for TICKET-065 or TICKET-068:** Extract a shared `NOTIFICATION_TYPES` constant in a lib file and import it in all writers.

---

### F-012 — push-dispatcher nulls fcm_token on DeviceNotRegistered (risky per L-013)
**Severity:** 🟡 P2 (documented risk — auto-null on send failure)  
**File:** `peak-fettle-agents/server/cron/push-dispatcher.js:170`  
**Pattern:** L-013 / PUSH-001

The dispatcher nulls `users.fcm_token` on `DeviceNotRegistered`. This is the correct behavior for that specific error — but L-013 documented that the original bug was auto-nulling on a blanket transport error. Verify the current code only nulls on `DeviceNotRegistered` and not on other error codes.

**Status (requires verification in TICKET-065):** The code path at line 170 should be checked against the full error-type decision tree.

---

## Toolchain Status

| Tool | Status |
|------|--------|
| `peak-fettle-verify` skill | ✅ Installed (`.claude/skills/peak-fettle-verify/`) |
| `peak-fettle-commit` skill | ✅ Installed (`.claude/skills/peak-fettle-commit/`) |
| GSD (skill in system) | ✅ Available |
| `context-mode` | ❓ Not verified (no `/context-mode:ctx-stats` result — not invoked this session) |
| `claude-mem` | ❓ Not verified |
| `morph` (Flash Compact / WarpGrep) | ❓ Not verified (MORPH_API_KEY required) |
| `caveman` | ❓ Not verified |

The two project-critical skills (`peak-fettle-verify`, `peak-fettle-commit`) are confirmed present. The optional speed/cost tools (morph, caveman, claude-mem, context-mode) were not verified — they do not block execution but should be confirmed before a multi-hour autonomous run.

---

## Findings Summary Table

| ID | Severity | Area | Ticket | Title |
|----|----------|------|--------|-------|
| F-001 | 🔴 P0 | cron/push | TICKET-065 | cohort-graduation writes wrong columns to notification_queue — push never fires |
| F-002 | 🟠 P1 | mobile/api | TICKET-067 | getExercises() falls back to mock in production — FK violations on set logging |
| F-003 | 🟠 P1 | mobile/server | TICKET-065 | Two competing token registration paths; pushTokens.ts is a dead stub |
| F-004 | 🟠 P1 | server | TICKET-065 | /user/push-token endpoint missing |
| F-005 | 🟡 P2 | mobile | TICKET-067 | primary_discipline cast as `any` — type safety hole |
| F-006 | 🟡 P2 | mobile | TICKET-069 | PR detection client-side approximation (no /prs endpoint) |
| F-007 | 🟡 P2 | mobile | TICKET-069 | HealthKit is a graceful stub — needs real implementation pre-launch |
| F-008 | 🟡 P2 | mobile | TICKET-067 | ExercisePicker still uses direct API instead of PowerSync (TICKET-027 incomplete) |
| F-009 | 🟡 P2 | mobile/server | TICKET-069 | Broad silent catch blocks — no logging, invisible failures |
| F-010 | 🟡 P2 | server | TICKET-068 | sets.js RETURNING * — risky with schema evolution |
| F-011 | 🟡 P2 | server | TICKET-065 | notification_queue type strings not normalized across writers |
| F-012 | 🟡 P2 | cron | TICKET-065 | push-dispatcher token-null path needs verification against L-013 |

---

## New Open Questions Added

**Q6 — Push token registration: patchProfile vs /user/push-token?** `OPEN`  
Two paths exist: `pushNotifications.ts` uses `patchProfile({ fcm_token })` (works today); `pushTokens.ts` declares a `/user/push-token` endpoint (doesn't exist). Which path should be canonical for the push pipeline rewrite (TICKET-065)?
- **Options:** (a) Build `/user/push-token`, migrate off `patchProfile`; (b) Delete `pushTokens.ts`, keep `patchProfile` path as intentional; (c) other.
- **Recommendation:** (a) — a dedicated endpoint is cleaner and avoids accidentally clearing the token via a profile PATCH. But (b) is lower-risk short-term.
- **Impact:** gates TICKET-065 design.

---

## Remediation Plan (gating TICKET-065–070)

### Immediate (before any other TICKET)
1. **F-001** (P0): Fix `cohort-graduation.js` INSERT columns. **Assign to TICKET-065.**

### TICKET-065 (Push pipeline rewrite)
- Fix F-001 column mismatch in cohort-graduation.js
- Resolve F-003/F-004 (token path unification — answer Q6 first)
- Verify F-012 (dispatcher token-null only on DeviceNotRegistered)
- Fix F-011 (notification type constants)
- `/ultra-review` + `/codex:review` required (push is P0 infrastructure)

### TICKET-067 (Eradicate mock/stub fallbacks)
- Fix F-002 (exercises.ts getExercises mock fallback)
- Fix F-005 (primary_discipline type safety)
- Fix F-008 (ExercisePicker PowerSync migration — verify TICKET-027 status first)

### TICKET-068 (Data-layer audit)
- Fix F-010 (sets.js RETURNING *)
- Full migration cross-check (all RETURNING columns vs applied migrations)

### TICKET-069 (Error-handling pass)
- Fix F-009 (add logging to all empty catch blocks)
- Fix F-006 (document PR client-side approximation)
- Fix F-007 (complete HealthKit integration)

---

## Definition-of-Done Confirmation

- ✅ @babel/parser sweep: 0 broken files
- ✅ `node --check`: 24/24 server JS pass
- ✅ Null byte scan: clean
- ✅ Findings register written to `audits/AUDIT_2026-05-29_findings.md`
- ✅ OPEN_QUESTIONS_FOR_FOUNDER.md updated with Q6
- ⏳ Commit via `peak-fettle-commit` (next step)
- ⏳ Founder `git push` required before EAS sees any subsequent fixes

*No source files were modified in TICKET-064.*
