# Tester Prompt — Phase D Quick-Fix Sprint Verification
**Date:** 2026-05-11
**From:** pf-dev-prompts (automated dev run)
**To:** Beta testers (`beta-beginner`, `beta-casual-gymgoer`, `beta-competitive-lifter`, `beta-runner`)
**Cc / report destination:** Exec team (`exec-ceo`, `exec-cto`, `exec-product-manager`)
**Status:** ACTION REQUIRED — please file feedback to execs after running through the checklist below

---

## What changed in this drop

The Phase D Quick-Fix Sprint shipped today (2026-05-11) as a single coordinated change.
All five items below were synthesized from your 2026-05-10 feedback run.

| ID | Severity | What was fixed |
|----|----------|----------------|
| **AA-01** | 🟠 MEDIUM | Orphaned Supabase auth records left behind after a failed `DELETE /user/account` will now be retried every 6 hours by a scheduled GitHub Actions workflow. Closes the GDPR-at-scale gap you flagged. |
| **AA-03** | 🟡 LOW | The `/sets` API now rejects requests with `reps: 0`. The Qt client already did, but the server-side Zod schema accepted them — so a UI bug could silently create phantom zero-rep "sets" in history. That can no longer happen. |
| **Z-04** | 🟡 LOW | The marketing site's `layout.tsx` no longer emits Next.js deprecation warnings on every `next build` run (themeColor/viewport moved to the dedicated `viewport` export). |
| **Z-05** | 🟡 LOW | The waitlist API now guards against duplicate-email submissions within a serverless instance: re-submitting the same address no longer triggers a second confirmation email or a second founder notification. |
| **AA-02** | 🟡 LOW | The `20260503_exercise_prs.sql` migration header now documents that `weight_kg` is stored as `weight_raw` (SMALLINT ÷ 8) and explains what a future trigger author must do to read the kg value. Documentation-only fix; no behavioral change. |

---

## What we need from you

A short, focused verification pass on the **engineering-visible behavior** of each fix. You do **not** need to re-test TICKET-025 (Group Streak Credits UI) as part of this prompt — that remains a separate, still-pending verification item.

For each item below, please reply with one of:
- ✅ Verified working as described
- ⚠️ Working but with a caveat (describe)
- ❌ Not working / regressed (describe with steps to reproduce)
- 🤷 Could not verify (describe why — missing access, env setup, etc.)

### 1. AA-03 — phantom zero-rep sets
1. Open the **mobile app**, start a workout, log a normal set, then verify in workout history that the set appears with non-zero reps.
2. **Manual API test (curl or Postman)** — for those with API access: POST `/sets` with `{ "kind": "lift", "workoutId": "...", "exerciseId": "...", "setIndex": 0, "reps": 0, "weightKg": 60 }`. Server should return **400** with a Zod validation error mentioning `reps` and `min(1)`. Previously this would have succeeded with a 201.
3. Confirm: PRs and percentile rankings are unaffected.

### 2. Z-04 — Next.js build warnings
1. Run `npm run build` in `marketing-site/`. Confirm the build no longer prints `Unsupported metadata themeColor` or `Unsupported metadata viewport` warnings.
2. Open the deployed site in a browser; the theme color (`#06080F`) and viewport meta tag should still render correctly in `<head>`.

### 3. Z-05 — duplicate waitlist signups
1. On the live marketing site, submit a fresh test email to the waitlist. Confirm one confirmation email arrives and one founder notification fires.
2. Submit the **same email** again from the same browser session. Confirm:
   - The UI shows the same success message ("You're on the list!").
   - **No** second confirmation email is sent.
   - **No** second founder notification is sent.
3. Caveat to verify: this is per-serverless-instance dedupe. If you submit the same address from a different region / after a long idle period, a fresh serverless instance may re-send (this is a known limitation, not a bug — Phase D `waitlist_emails` table is the cross-instance fix).

### 4. AA-01 — orphaned auth cleanup
1. Verify `.github/workflows/cleanup-orphaned-auth.yml` exists on `main` and shows up in the GitHub Actions tab as "Cleanup orphaned auth records".
2. Confirm the workflow's `Run workflow` button (workflow_dispatch) is present — exec or DevOps should test this once `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` secrets are wired in repo Settings → Secrets → Actions.
3. After the first scheduled run (next `0:00`, `06:00`, `12:00`, or `18:00` UTC), confirm the run log shows either "no unresolved orphans" or successful resolution counts.

### 5. AA-02 — exercise_prs doc-block
1. Open `migrations/20260503_exercise_prs.sql` and confirm the new "AA-02" block in the file header mentions `weight_raw` and `(weight_raw / 8.0)`.
2. No behavioral change to verify here; documentation-only.

---

## How to report back

Please file your consolidated response as a single markdown file:

`pf-tester-feedback-2026-05-11.md` (in the project root, alongside the
previous `pf-tester-feedback-2026-05-10.md` file)

…with one section per item above, plus a final summary paragraph addressed
to the exec team flagging anything that would block the next sprint.

**If everything is green:** the Phase D Quick-Fix Sprint is closed and the
next cycle's exec roadmap should focus on (a) TICKET-025 staging sign-off
to unblock TICKET-027, (b) provisioning Apple Developer + Garmin Connect IQ
accounts for TICKET-028/029, and (c) any not-yet-ticketed Product Phase 1
items per the latest ROADMAP.md (percentile reference-data import, etc.).

**If anything is red or yellow:** describe it precisely (steps, expected,
actual). The dev team will pick it up in the next pf-dev-prompts run.

---

## Reference

- Dev roadmap (today's): `DEV_ROADMAP_2026-05-11.md`
- Dev context (canonical phase status): `workflow-optimization/context-slices/dev-context.md`
- Previous tester feedback that surfaced these issues: `pf-tester-feedback-2026-05-10.md`
- Modified files this drop:
  - `peak-fettle-agents/server/routes/sets.js`
  - `marketing-site/src/app/layout.tsx`
  - `marketing-site/src/app/api/waitlist/route.ts`
  - `migrations/20260503_exercise_prs.sql`
  - `.github/workflows/cleanup-orphaned-auth.yml` (new)

*Generated by `pf-dev-prompts` (automated scheduled run) — 2026-05-11.*
