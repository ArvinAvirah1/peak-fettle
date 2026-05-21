# Peak Fettle — Development Roadmap (v11)
**Date:** 2026-05-14
**From:** workflow-coordinator (exec synthesis + beta feedback integration)
**Status:** ACTIVE — supersedes v10 (`DEV_ROADMAP_2026-05-12.md`)
**Source inputs:**
- `DEV_ROADMAP_2026-05-12.md` (v10) — carried forward
- `beta-feedback-report-2026-05-11.md` — May 10 release, testers: Derek, Jamie, Marcus, Priya
- `ROADMAP.md` — product roadmap (May 10 synthesis)
- `TESTER_PROMPT_2026-05-11-QUICK-FIX.md` — Quick-Fix Sprint verification items

---

## Executive Summary

**The May 10 release contains three P0 database/API bugs that must be hotfixed before the release can go to production.** All three were surfaced by the May 11 beta tester run and confirmed via code review. The Rankings screen is broken for 100% of users (BUG-002), the weekly percentile batch cron will fail silently for all users (BUG-001), and conflicting trigger migrations create a broken schema state (BUG-003). These are not polish items — they are hard stops.

Separately, two P1 data-integrity issues also require pre-launch attention: a bodyweight fallback regression that distorts percentiles for runners and beginners (BUG-006), and a silent type mismatch in the percentile compute function that is one refactor away from breaking all rankings (BUG-004).

The infrastructure wins from v10 stand: GitHub is live, the Quick-Fix Sprint is merged, and the mobile dev environment is functional via EAS Build. The Supabase IPv6 issue remains an external blocker on the auth-cleanup workflow.

After hotfixes are cleared, the recommended next focus is EAS Build setup (to unblock TICKET-025 human verification → TICKET-027 PowerSync), followed by Phase 1 product items from the ROADMAP.md backlog.

---

## 1. Phase A — CLOSED ✅
No changes.

---

## 2. Phase B — CLOSED ✅
No changes.

---

## 3. Sprints 1–5 — CLOSED ✅
No changes.

---

## 4. Phase C — CLOSED ✅
No changes.

---

## 5. Hotfix Sprint — REQUIRED BEFORE PRODUCTION (NEW)

These three issues were identified in the May 11 beta tester run on the May 10 release. **No production deployment should proceed until all three are resolved.** They can be batched into a single hotfix migration and deployment.

| ID | Priority | Area | Description | Effort | Reporter |
|----|----------|------|-------------|--------|----------|
| BUG-001 | P0 🔴 | DB / Cron | `v_user_lift_inputs` references dropped column `s.weight_kg` → percentile batch cron dead for all users | S | Marcus + code audit |
| BUG-002 | P0 🔴 | API | `GET /percentile` crashes on nonexistent column `e1rm_kg` → Rankings screen broken for 100% of users | S | All testers |
| BUG-003 | P0 🔴 | DB | Duplicate Y-03 trigger implementations — 4 triggers on `sets`, one referencing dropped column | M | Marcus, Derek |

**BUG-001 fix:** In `migrations/20260510_percentile_arch_1_6.sql`, replace `s.weight_kg` with `s.weight_raw / 8.0` in the `v_user_lift_inputs` view definition. Must be applied together with BUG-006 fix (same view).

**BUG-002 fix:** In `peak-fettle-agents/server/routes/percentile.js`, replace the `MAX(s.e1rm_kg)` subquery with an inline Epley calculation using `weight_raw` — apply the formula `CASE WHEN s.reps = 1 THEN s.weight_raw / 8.0 ELSE (s.weight_raw / 8.0) * (1.0 + s.reps / 30.0) END`.

**BUG-003 fix:** Delete `migrations/20260510_exercise_prs_recompute_trigger.sql` entirely. The correct implementation is in `20260510_exercise_prs_delete_trigger.sql` (uses `weight_raw` throughout). Audit database for any partially-applied state before rerunning migrations.

---

## 6. Pre-Launch Data Integrity Sprint — REQUIRED BEFORE LAUNCH (NEW)

These P1 issues are functionally masked today but represent hard breaks on the next schema/type refactor. Address in the sprint immediately following the Hotfix Sprint.

| ID | Priority | Area | Description | Effort |
|----|----------|------|-------------|--------|
| BUG-006 | P1 🟠 | DB | Bodyweight fallback regressed to hardcoded 75 kg — distorts percentiles for runners (Priya ~20 pts too low) and casual users with no weight class set | S |
| BUG-004 | P1 🟠 | DB | `compute_percentile()` parameter typed `CHAR(1)` but receives `'MALE'`/`'FEMALE'` strings — silent truncation works today; becomes NULL-returning hard break on next type refactor | S |
| BUG-005 | P1 🟠 | DB / Cron | `compute_percentile_batch()` redefined 3 times across the May 10 migration set with incompatible signatures — cron breaks on any partial application | S |

**BUG-006 fix:** In the `v_user_lift_inputs` view rebuild in `20260510_percentile_arch_1_6.sql`, restore sex-based fallback: `COALESCE(u.weight_class_kg, CASE u.sex WHEN 'MALE' THEN 83 ELSE 66 END)`. Must be co-applied with BUG-001 fix in the same view.

**BUG-004 fix:** Update `compute_percentile()` and `compute_percentile_simple()` to accept `TEXT` parameters. Update inner checks to `p_sex NOT IN ('MALE','FEMALE')`.

**BUG-005 fix:** Add a migration guard note that all three `20260510_*` files must be applied atomically. Consider consolidating the three `compute_percentile_batch()` definitions into a single final version in `20260510_1rm_confirmation.sql` and making intermediate versions no-ops.

---

## 7. Phase D — IN PROGRESS

### 7A. Feature Track

| Ticket | Description | Status | Notes |
|--------|-------------|--------|-------|
| TICKET-025 | Group Streak Credits UI — staging verification | ⏳ **AWAITING HUMAN TESTERS** | Blocked on EAS Build setup (prerequisite for native testing). |
| TICKET-027 | PowerSync offline sync | 🔲 BLOCKED | Blocked on TICKET-025 sign-off. EAS Build also required. |
| TICKET-013 (Phase D) | Apple Watch SwiftUI companion | 🔲 READY TO ASSIGN | No change. |
| Infra | `supabaseAdmin.auth.admin.deleteUser()` prod wiring | 🔲 BLOCKED | Needs Supabase service role key in prod env. |

### 7B. Quick-Fix Sprint — CLOSED ✅
All five items (AA-01, AA-02, AA-03, Z-04, Z-05) merged to `main` on 2026-05-12.

---

## 8. GitHub & Infrastructure

| Item | Status | Notes |
|------|--------|-------|
| GitHub repo created | ✅ DONE | `ArvinAvirah1/peak-fettle`, private, branch `main` |
| Full codebase committed | ✅ DONE | |
| GitHub Actions secrets | ✅ DONE | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` wired |
| `cleanup-orphaned-auth.yml` | ⚠️ PARTIAL | Failing due to Supabase IPv6 DB connection issue — external blocker. Check `status.supabase.com` before retrying. |
| Supabase DB password reset | 🔲 BLOCKED | IPv6 issue affects Supabase dashboard itself. |

---

## 9. Mobile Dev Environment

| Item | Status | Notes |
|------|--------|-------|
| Expo SDK 54 installed | ✅ DONE | `--legacy-peer-deps` required |
| `npx expo start --tunnel` | ✅ WORKING | |
| Expo Go testing | ❌ NOT VIABLE | PowerSync native module incompatible. Permanent. |
| EAS Build setup | 🔲 **NEXT STEP** | Required before any mobile testing. `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios`. |

---

## 10. Medium Priority — Beta Feedback Queue (NEW)

Issues from the May 11 tester run that do not block launch but will generate disproportionate support tickets or trust erosion from engaged users. Address in the sprint after Pre-Launch Data Integrity.

| ID | Priority | Area | Description | Effort |
|----|----------|------|-------------|--------|
| BUG-008 | P2 🟡 | Mobile | Option C 1RM confirmation state disappears on app restart (shows "Confirm your max" CTA again despite DB save) — fix: derive confirmed state from `ranking.confirmed_1rm_kg` in API response rather than in-memory `useState` | S |
| BUG-007 | P2 🟡 | Mobile | Rankings copy inconsistency: EmptyState says "every Monday", API `COHORT_NOTE` says "Sunday 03:00 UTC" — align to "every Sunday night" | XS |
| BUG-009 | P2 🟡 | Backend | JS `yearsBand()` helper uses `'3-5'`/`'5+'` bands; SQL uses `'3-7'`/`'7+'` — fix helper + add unit test asserting alignment | XS |
| BUG-010 | P2 🟡 | Mobile | Option B estimated-max banner: purple text `#a78bfa` on brown `#1c1917` fails WCAG AA — change to `#f8fafc` or `#fef3c7` | XS |

---

## 11. Low Priority — Beta Feedback Queue (NEW)

Polish items and UX improvements surfaced by the May 11 tester run. Bundle into the first post-launch sprint.

| ID | Priority | Area | Description | Effort |
|----|----------|------|-------------|--------|
| BUG-011 | P3 ⚪ | Mobile | "Confirm estimated maxes" toggle not found in Settings UI — verify `use_1rm_confirmation` is exposed in Settings screen; update Option B banner copy if not yet wired | M |
| BUG-012 | P3 ⚪ | API | Documented alias route `GET /percentile/lift/:liftId` not implemented — add passthrough handler | XS |
| BUG-013 | P3 ⚪ | Mobile | ConfirmSheet auto-close at 1.4s too fast for accessibility — increase to 2000ms; consider adding a "Done" button | XS |
| UX-001 | P3 ⚪ | Mobile | "RIR" label unexplained for new users — add one-time tooltip: "RIR (Reps In Reserve): how many more reps you could have done" | XS |
| UX-002 | P3 ⚪ | Mobile | Discipline picker: "Weightlifting" vs "General Strength" ambiguous for beginners — add subtitle clarifying Olympic lifting; rename "General Strength" → "Gym / General Fitness" | XS |
| UX-003 | P3 ⚪ | Mobile | ConfidenceRing tooltip too technical for free-tier users — add casual variant: "Your score is based on X people like you" for non-strength-discipline users | S |
| UX-004 | P3 ⚪ | Mobile | Empty Rankings state lacks action prompt — add: "Log 3 workouts to unlock your first ranking" | XS |
| UX-005 | P3 ⚪ | Mobile | Streak philosophy not surfaced in-app — add during onboarding or first streak display: "Even a 5-minute session counts. Rest days don't break your streak — consecutive missed sessions do." | S |

---

## 12. Open Issue Register — Unified (as of 2026-05-14)

| Rank | ID | Severity | Description | Status |
|------|----|----------|-------------|--------|
| 1 | BUG-001 | P0 🔴 | `v_user_lift_inputs` references dropped column → percentile batch dead | 🔴 HOTFIX REQUIRED |
| 2 | BUG-002 | P0 🔴 | `GET /percentile` crashes on `e1rm_kg` → Rankings screen broken 100% | 🔴 HOTFIX REQUIRED |
| 3 | BUG-003 | P0 🔴 | Duplicate Y-03 triggers — 4 on sets, one references dropped column | 🔴 HOTFIX REQUIRED |
| 4 | BUG-006 | P1 🟠 | Bodyweight fallback regressed to hardcoded 75 kg — distorts runner/beginner percentiles | 🟠 PRE-LAUNCH |
| 5 | BUG-004 | P1 🟠 | `compute_percentile()` CHAR(1) vs MALE/FEMALE — silent truncation, fragile | 🟠 PRE-LAUNCH |
| 6 | BUG-005 | P1 🟠 | 3 incompatible `compute_percentile_batch()` signatures in one migration set | 🟠 PRE-LAUNCH |
| 7 | TICKET-025 | 🟠 MEDIUM | Human staging sign-off pending — gates TICKET-027 | ⏳ AWAITING EAS BUILD |
| 8 | EAS Build setup | 🟡 LOW | Required before any mobile testing | 🔲 NEXT IMMEDIATE ACTION |
| 9 | BUG-008 | P2 🟡 | Option C confirmed state disappears on app restart | 🔲 QUEUED |
| 10 | cleanup-orphaned-auth | 🟡 LOW | DB connection fails — Supabase IPv6 | ⏳ EXTERNAL BLOCKER |
| 11 | BUG-007 | P2 🟡 | Rankings copy: Monday vs. Sunday UTC inconsistency | 🔲 QUEUED |
| 12 | BUG-009 | P2 🟡 | JS `yearsBand()` bands mismatch SQL | 🔲 QUEUED |
| 13 | BUG-010 | P2 🟡 | Option B banner fails WCAG AA contrast | 🔲 QUEUED |
| 14–21 | BUG-011 to UX-005 | P3 ⚪ | Polish and UX improvements (8 items) | 🔲 POST-LAUNCH SPRINT |

---

## 13. Product Roadmap Phase 1 — Ticketing Queue

The following Phase 1 product items from `ROADMAP.md` remain unticketed. They are the primary dev focus after EAS Build is configured and the P0 hotfixes are cleared.

| Roadmap Item | Description | Segment |
|---|---|---|
| 1.1 | Jargon Glossary & Contextual Tooltips (also covers UX-001, UX-002 from this run) | B, C |
| 1.2 | Onboarding Survey Redesign (3-question fast track + optional deep-dive) | B, C |
| 1.3 | Rest Day Designation (3-state streak: logged / rest / missed) | R, ALL |
| 1.4 | Streak Messaging Overhaul (encouragement-first, proactive make-up window; also covers UX-005) | B, C |
| 1.5 | Free-to-Paid Value Demonstration (contextual upgrade prompt at session 5) | C |
| 1.6 | Percentile System Architecture — apply v2 migration (Step 4 from `DEV_NEXT_STEPS_2026-05-11.md`) | ALL |

---

## 14. Recommended Action Order — Next Session

1. **Apply Hotfix Sprint** (BUG-001, BUG-002, BUG-003) — fix `v_user_lift_inputs` column reference, replace `e1rm_kg` subquery with inline Epley, delete duplicate trigger migration. Deploy before any user-facing release.
2. **Apply Pre-Launch Data Integrity Sprint** (BUG-006, BUG-004, BUG-005) — restore sex-based bodyweight fallback (co-apply with BUG-001), update `compute_percentile()` to accept `TEXT`, consolidate batch function signatures.
3. **Set up EAS Build** — `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios`. Unblocks all mobile testing including TICKET-025.
4. **Send TICKET-025 tester prompt** once EAS Build `.ipa` link is ready.
5. **Check Supabase IPv6 status** — if resolved, reset DB password and re-test `cleanup-orphaned-auth.yml` workflow.
6. **Apply v2 percentile migration** (Step 4, `DEV_NEXT_STEPS_2026-05-11.md`) — no blockers.
7. **Begin Phase 1 product ticketing** (items 1.1–1.5 from ROADMAP.md) — glossary, onboarding redesign, rest day designation, streak messaging, paid preview.

---

## 15. Product Roadmap Alignment

No changes to phases 2–3 of `ROADMAP.md` from v10. Phase 1 product items (1.1–1.6) remain next major dev focus after EAS Build and hotfixes are cleared.

---

*Roadmap v11 generated by workflow-coordinator (exec synthesis + beta feedback) — 2026-05-14.*
*Supersedes `DEV_ROADMAP_2026-05-12.md` (v10).*
*Source: `beta-feedback-report-2026-05-11.md`, `DEV_ROADMAP_2026-05-12.md`, `ROADMAP.md`.*
*Next recommended run: after Hotfix Sprint is applied and EAS Build is configured.*
