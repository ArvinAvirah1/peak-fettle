# Tester Prompt — Hotfix + Pre-Launch Data Integrity Sprint Verification
**Date:** 2026-05-15
**From:** pf-dev-prompts (automated dev run, web-and-application-dev)
**To:** Beta testers (`beta-beginner` / Derek, `beta-casual-gymgoer` / Jamie, `beta-competitive-lifter` / Marcus, `beta-runner` / Priya)
**Cc / report destination:** Exec team (`exec-ceo`, `exec-cto`, `exec-product-manager`)
**Status:** ACTION REQUIRED — please file feedback to the exec team after running through the checklist below
**Source:** `DEV_ROADMAP_2026-05-14.md` §5 (Hotfix) + §6 (Pre-Launch Data Integrity)

---

## What changed in this drop

The Hotfix + Pre-Launch Data Integrity Sprint shipped today (2026-05-15) as a single coordinated change. All six bugs you (and the code audit) surfaced in the 2026-05-11 feedback run have been resolved. The Rankings screen should now work for 100% of users, the weekly percentile cron will no longer fail silently, and the schema is no longer fragile against the next type/column refactor.

| ID | Severity | What was fixed | How |
|----|----------|----------------|-----|
| **BUG-001** | 🔴 P0 | The `v_user_lift_inputs` view referenced the dropped `weight_kg` column → percentile batch cron was dead for all users | View now uses `weight_raw / 8.0` (verified already on disk; sprint confirmed and documented) |
| **BUG-002** | 🔴 P0 | `GET /percentile` crashed on the dropped `e1rm_kg` column → Rankings screen broken for 100% of users | Route now computes Epley inline from `weight_raw` (verified already on disk; sprint confirmed and documented) |
| **BUG-003** | 🔴 P0 | Two conflicting Y-03 trigger migrations — one referenced the dropped `weight_kg` column | The duplicate file `20260510_exercise_prs_recompute_trigger.sql` was neutralized to a no-op (the canonical implementation lives in `20260510_exercise_prs_delete_trigger.sql`) |
| **BUG-006** | 🟠 P1 | Bodyweight fallback regressed to a hardcoded 75 kg → distorted percentiles for runners (Priya) and casual users (Jamie) without a weight class set | View now uses sex-based fallback: `COALESCE(weight_class_kg, CASE sex WHEN 'MALE' THEN 83 ELSE 66 END)` (verified already on disk; sprint confirmed and documented) |
| **BUG-004** | 🟠 P1 | `compute_percentile()` and `compute_percentile_simple()` were typed `CHAR(1)` but receiving `'MALE'`/`'FEMALE'` strings — silent truncation today, hard NULL break on the next type refactor | New migration `20260515_percentile_hotfix_consolidation.sql` widens the parameter to `TEXT` and translates `'MALE'`/`'FEMALE'` → `'M'`/`'F'` internally. Both old and new callers work. |
| **BUG-005** | 🟠 P1 | Three incompatible `compute_percentile_batch()` definitions in the May 10 migration set — partial application would break the cron | Same new migration `DROP`s the function and re-`CREATE`s a single canonical 7-column version: `(user_id, lift_id, percentile, percentile_simple, cohort_size_internal, is_estimated, computed_at)`. Matches what `cron/percentile.js` already SELECTs. |

**No application-side change is required for any of these — the JS layer was already written against the consolidated 7-column return.**

---

## What we need from you

A focused verification pass on the **user-visible behavior** of the Rankings screen and the weekly percentile flow. You do **not** need to re-test TICKET-025 (Group Streak Credits UI) as part of this prompt — that remains a separate, still-pending verification item gated on EAS Build setup.

For each item below, please reply with one of:
- ✅ Verified working as described
- ⚠️ Working but with a caveat (describe)
- ❌ Not working / regressed (describe with steps to reproduce)
- 🤷 Could not verify (describe why — missing access, env setup, etc.)

### 1. BUG-002 — Rankings screen no longer crashes (every persona)

1. Open the **mobile app** → Rankings tab.
2. Confirm the screen renders without an error toast / red banner / crash.
3. Confirm at least one ranking card is visible if you have logged 3+ sets in the past week (otherwise the EmptyState is expected).
4. If you see the EmptyState, log a quick set on a main lift, force a sync, and check Rankings again.
5. **Marcus only:** confirm both the experience-adjusted percentile ("vs. lifters at your level") and the population percentile ("vs. all strength trainees") are showing.

### 2. BUG-001 — Weekly percentile cron is alive (Marcus, anyone with API access)

1. After the next Sunday 03:00 UTC weekly run (or by triggering `cron/percentile.js` manually if you have access), check that `user_percentile_rankings` has a row whose `computed_at` is within the last 24 hours.
2. Confirm the row's `cohort_size_internal` is non-NULL (it may be 0 if you are alone in your cohort — that is expected).
3. Confirm `is_estimated` is `TRUE` if you have not confirmed your 1RM, and `FALSE` if you have used the "Confirm your max" CTA.

### 3. BUG-006 — Bodyweight fallback no longer pegged to 75 kg (Priya + Jamie)

1. Make sure your profile does **NOT** have a weight class set. (If it does, temporarily clear it via Profile → Settings.)
2. Log a few main-lift sets so the next batch run picks you up.
3. After the next batch run, your percentile should be derived from a sex-appropriate default (83 kg for MALE, 66 kg for FEMALE) — not 75 kg.
4. **Priya:** the runner-relevant signal here is that your strength percentile should no longer be ~20 points too low compared to a hand-calculated DOTS reference.

### 4. BUG-003 — No duplicate trigger fires on set delete (Marcus, Derek)

1. Log a set that beats one of your existing PRs.
2. Delete the set via the workout history view.
3. Confirm the previous PR row is restored — there should be exactly one PR row for the (user, exercise, rep_count) tuple, and its `set_id` should point at the previous best.
4. Previously this would have either raised a SQL error (column `weight_kg` does not exist) OR fired two triggers and produced duplicate / inconsistent PR rows.

### 5. BUG-004 — Sex parameter accepts both forms (any persona; this is mostly a regression check)

This is a defense-in-depth fix; you should not see any user-visible difference. The ask is just: confirm Rankings still works correctly for users with `sex = 'MALE'`, `sex = 'FEMALE'`, AND `sex = 'UNDISCLOSED'`. The UNDISCLOSED case is the most interesting — it should now produce a midpoint percentile rather than a NULL.

### 6. BUG-005 — Cron upsert succeeds end-to-end (Marcus, anyone with API access)

1. Trigger or wait for the weekly cron.
2. Confirm there are no errors in the cron logs about column count mismatches or "function compute_percentile_batch does not exist".
3. Confirm `user_percentile_rankings` rows for your user have all 7 fields populated (`percentile`, `percentile_simple`, `cohort_size_internal`, `is_estimated`, plus the existing `computed_at` and the user/lift keys).

---

## Where to send your feedback

File a single consolidated report in your usual feedback file format (e.g., `pf-tester-feedback-2026-05-15.md`) addressed to the exec team. Use the same persona-headed structure you used in the 2026-05-11 run. The exec team will:

1. Roll your findings into the next `DEV_ROADMAP_*` synthesis pass
2. Decide whether the May 10 release is now production-ready (gated on this verification + EAS Build setup)
3. Re-prioritize the P2/P3 backlog (BUG-007 through UX-005) based on what you surface

If you find any new issues outside the six bugs listed here, please flag them in a separate "New issues this run" section so they can be triaged into the next sprint rather than blocking sign-off on the hotfix sprint itself.

---

## Out-of-scope for this verification

- **TICKET-025 Group Streak Credits UI** — still gated on EAS Build setup; separate prompt will follow once a `.ipa` link is available.
- **TICKET-027 PowerSync offline sync** — gated on TICKET-025.
- **TICKET-028 Apple Watch / TICKET-029 Garmin** — both blocked on dev account provisioning; not in this run.
- **P2/P3 polish items (BUG-007 to UX-005)** — queued for the post-hotfix sprint per `DEV_ROADMAP_2026-05-14.md` §10–§11.

---

*Generated by web-and-application-dev (automated dev sprint run) — 2026-05-15.*
*Source: `DEV_ROADMAP_2026-05-14.md` §5 (Hotfix Sprint), §6 (Pre-Launch Data Integrity Sprint).*
*Migration shipped: `migrations/20260515_percentile_hotfix_consolidation.sql` (515 lines).*
*Dev-context updated: `workflow-optimization/context-slices/dev-context.md` (Hotfix + Pre-Launch Data Integrity Sprint section + Lessons §9 / §10 / §11).*
