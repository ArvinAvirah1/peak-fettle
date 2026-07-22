# Tester Prompt — 2026-05-19 Evening Verification

**From:** Web & application dev team
**To:** QA / testing-team, with feedback addressed to execs (`exec-ceo`, `exec-cto`, `exec-product-manager`)
**Roadmap version:** v16 (see `DEV_ROADMAP_2026-05-19.md`)
**Triggering report:** `pf-tester-feedback-2026-05-19.md` (16:16 run)

## Scope of This Verification Pass

The 2026-05-19 16:16 tester run surfaced four new issues. The evening dev pass resolved three of them; the fourth is partially mitigated pending input. Please re-run the relevant code-level checks and exercise the user-facing flows where applicable.

## Items to Verify

### 1. PLANS-001 — `is_active` end-to-end wiring (🟠 P1)

**Files touched:**

- `peak-fettle-agents/server/routes/plans.js` — `is_active` added to SELECT in `GET /plans` (sorted active-first) and `GET /plans/:id`; `is_active` in the POST insert RETURNING clause; new `POST /plans/:id/activate` (transactional, deactivates siblings first); new `POST /plans/deactivate`.
- `mobile/src/types/api.ts` — `is_active: boolean` added to `Plan`.
- `mobile/src/api/plans.ts` — `activatePlan(id)` and `deactivateAllPlans()`.
- `mobile/app/(tabs)/plans.tsx` — `PlanCard` shows ACTIVE badge + 2px accent border on the active plan; "Set as active" button on every other user-owned card; single-flight guard.

**Code-level checks to run:**

1. Confirm `is_active` appears in both SELECT column lists in `plans.js` (`GET /plans`, `GET /plans/:id`) and in the POST RETURNING list.
2. Confirm `POST /plans/:id/activate` opens a transaction, deactivates siblings, then activates the target, and releases the client in `finally`.
3. Confirm `Plan` interface in `api.ts` requires `is_active: boolean` (not optional) and that no mock Plan constructions break the TS build.
4. Confirm `activatingPlanId` in `plans.tsx` is a single string (single-flight) and that the activate button's `onPress` calls `e.stopPropagation?.()` so the card's onPress does not also fire.

**Manual smoke (requires EAS build):**

- Create two user plans → tap "Set as active" on plan A → confirm ACTIVE badge appears on A and disappears from any prior active plan.
- Force-quit the app → reopen → confirm the active state persists (proves we read `is_active` from the server, not in-memory).
- Tap "Set as active" on plan B → confirm A loses ACTIVE and B gains it within one network round-trip.

### 2. CSV-002 — `activity_type` data loss (🟡 P2)

**Files touched:**

- `migrations/20260519_workouts_activity_type.sql` — new migration.
- `peak-fettle-agents/server/routes/csvImport.js` — INSERT extended.

**Checks:**

1. Run the new migration against a clean DB. Verify the column, CHECK constraint, and partial index all create.
2. Confirm the INSERT's column list and values array are aligned (`activity_type` between `session_type` and `duration_seconds`).
3. Import a sample Strava export → query `SELECT activity_type, count(*) FROM workouts WHERE session_type='cardio_import' GROUP BY 1` → expect a populated distribution, not all NULLs.

### 3. CSV-003 — Strava pace unit (⚠️ Partial)

**Files touched:**

- `peak-fettle-agents/server/routes/csvImport.js` — clamp added.

**Status:** The formula `1000 / speed` is mathematically correct **only if** Strava's `Average Speed` is in m/s. The parser also reads `Distance` as km (`× 1000`), which is **only** consistent with the single-activity Export-CSV button (km / km/h export), not the bulk export (meters / m/s). One of the two assumptions is wrong.

**What we need from you:**

- Please supply a real Strava `activities.csv` export from a metric account (Settings → Account → Download Your Data, and also one obtained via the single-activity Export-CSV button on web). Drop both files into `peak-fettle-agents/test-fixtures/strava/` and post the filenames in the next feedback report.
- Until then, the clamp `120 ≤ avg_pace ≤ 1800 sec/km` ensures we write `NULL` instead of a wildly wrong pace value. Duration and distance still import.

### 4. POOL-001 — CSV bulk-insert refactor (🟢 P3)

Queued post-launch. No action required this pass.

## Format for Your Feedback to Execs

Use the standard `pf-tester-feedback-YYYY-MM-DD.md` template. Please file the next report under `pf-tester-feedback-2026-05-20.md` and address it to the exec trio.

Specifically include:

- **Verdict per item** (PLANS-001 ✅/❌, CSV-002 ✅/❌, CSV-003 verified-unit?).
- **Any regression** of prior-resolved items (MOCK-001, MOCK-002, TYPE-001, EPLEY-001, EX-001, P1-008b, BUG-008, CSV-001, 1.5 backend, TICKET-024, workout-history, cosmetics).
- **New issues** discovered during this pass.
- **Recommended priority ranking for execs.**

## Reminders

- Code-only checks do not require EAS Build. Manual smoke flows do.
- OD-5 (tab architecture) remains the single largest blocker for the next chunk of Phase F work; please flag any UX feedback that bears on Progress-vs-Log-as-Tab-2.
- The pace-unit ambiguity (CSV-003) is the only item dev cannot close without exec/tester data. A 60-second action from anyone with a Strava account unblocks it.
