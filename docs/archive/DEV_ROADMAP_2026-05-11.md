# Peak Fettle — Development Roadmap (v9)
**Date:** 2026-05-11
**From:** pf-exec-prompts (automated scheduled run — workflow coordinator)
**Status:** ACTIVE — supersedes v8 (`DEV_ROADMAP_2026-05-10.md`)
**Source inputs:** `pf-tester-feedback-2026-05-10.md`, `DEV_ROADMAP_2026-05-10.md` (v8), `ROADMAP.md` (product roadmap 2026-05-10)

---

## Executive Summary

**The codebase is in its healthiest state to date.** All Phase A, B, and C work is complete. Zero P0 or HIGH severity issues remain open. The backend runs, the marketing site deploys, and the mobile app's Group Streak Credits feature is code-verified.

Five small issues surfaced in the 2026-05-10 tester run are now formally incorporated into Phase D. One is Medium severity (an operational gap affecting GDPR compliance at scale); four are Low. All are bounded, quick fixes.

**The one external gate:** human beta tester sign-off on TICKET-025 (Group Streak Credits UI on staging) is still pending. TICKET-027 (PowerSync offline sync) is held until that confirmation arrives.

---

## 1. Phase A — CLOSED ✅

All 8 tickets + N-series fixes confirmed in code. No further action required.

| Ticket | Description | Status |
|--------|-------------|--------|
| TICKET-001 | kg/lbs toggle | ✅ |
| TICKET-002 | RIR label UX | ✅ |
| TICKET-003 | My Routines home section | ✅ |
| TICKET-004 | Start Workout CTA prominence | ✅ |
| TICKET-005 | Guided onboarding flow | ✅ |
| TICKET-007 | Exercise search aliases (Qt) | ✅ |
| TICKET-008 | PR badges | ✅ |
| TICKET-010 | Mixed lift+cardio session | ✅ |
| BUG-01 | Log Set button over-crop | ✅ |
| FEAT-01 | Avatar feature | ✅ |

---

## 2. Phase B — CLOSED ✅

All Phase B items confirmed complete as of 2026-05-10. The Y-03 stale-PR trigger (the final Phase B item) shipped as `migrations/20260510_exercise_prs_recompute_trigger.sql`.

| Task | Status |
|------|--------|
| Marketing site → Vercel | ✅ |
| CI lint + test pipeline | ✅ |
| Clean Qt 6.11 build | ✅ |
| `exercise_aliases` table + `/exercises/search` endpoint | ✅ |
| `/plans` CRUD skeleton | ✅ |
| Percentile cron stub | ✅ |
| **Y-03**: exercise_prs stale-PR trigger (set-delete / downward edit) | ✅ Done 2026-05-10 |
| **Y-04**: cosmetic_items write-guard comment | ✅ |
| dev-lead.md change-log entries | ✅ Done 2026-05-10 |

---

## 3. Sprints 1–5 — CLOSED ✅

```
Sprint 1 ✅  requireAuth.js, auth.js, sets.js, index.js fully restored
Sprint 2 ✅  authLimiter on /auth, CORS WEB_ORIGIN whitelist
Sprint 3 ✅  All Qt/C++ fixes (N-01, N-03/X-04/Y-02, N-04, N-05, N-06, N-15, X-06)
Sprint 4 ✅  pg_trgm in initial schema, daily_health_log deduped
Sprint 5 ✅  All landing page fixes (T-09, T-10, T-11, T-12, N-14)
```

**Beta invite gate:** ✅ MET. External beta expansion unblocked.

---

## 4. Phase C — CLOSED ✅

All backend and database work complete. Apple Watch companion (SwiftUI) deferred to Phase D as planned.

| Track | Task | Status |
|-------|------|--------|
| Database | `20260504_user_constraints.sql` | ✅ |
| Database | `20260504_daily_health_metrics.sql` | ✅ |
| Backend | `routes/constraints.js` — GET/POST/DELETE /constraints | ✅ |
| Backend | `routes/plans.js` — POST /plans/generate (TICKET-011, Haiku 4.5) | ✅ |
| Backend | `routes/healthMetrics.js` — GET/POST /health-metrics | ✅ |
| Backend | `routes/user.js` — GDPR data export + account delete (TICKET-014) | ✅ |
| Backend | `index.js` — Phase C routes wired | ✅ |
| Policy | TICKET-015 — percentile routes free-tier confirmed | ✅ |
| Native | Apple Watch companion (SwiftUI) | → Phase D |

---

## 5. Phase D — IN PROGRESS

Phase D has two tracks running in parallel: **feature development** (TICKET-025/027 and native work) and a **quick-fix sprint** incorporating all new issues from the 2026-05-10 tester run.

**Update 2026-05-11 (pf-dev-prompts run):** Quick-Fix Sprint **shipped**. All five items (AA-01, AA-03, Z-04, Z-05, AA-02) are complete and verified on disk. Awaiting tester sign-off — see `TESTER_PROMPT_2026-05-11-QUICK-FIX.md`. TICKET-025 staging verification and TICKET-027 status unchanged this run.

---

### 5A. Feature Track

| Ticket | Description | Status | Notes |
|--------|-------------|--------|-------|
| TICKET-025 | Group Streak Credits UI — staging verification | ⏳ **AWAITING HUMAN TESTERS** | Code fixes confirmed correct (automated). 9-item staging checklist in `TESTER_PROMPT_2026-05-09-TICKET-025.md`. No response received as of 2026-05-10. **This is the gate for TICKET-027.** |
| TICKET-027 | PowerSync offline sync | 🔲 BLOCKED | Blocked on TICKET-025 human sign-off. No code blockers otherwise. |
| TICKET-013 (Phase D) | Apple Watch SwiftUI companion | 🔲 READY TO ASSIGN | Assign to dev-frontend-native when capacity allows. |
| Infra | `supabaseAdmin.auth.admin.deleteUser()` prod wiring | 🔲 BLOCKED | Needs Supabase service role key in prod env. Blocked until prod deployment confirmed. Low urgency at beta scale. |

---

### 5B. Quick-Fix Sprint (from 2026-05-10 tester run — 5 new issues)

All five items are bounded and fast. Recommended: ship as a single PR before the next mobile release.

| ID | Severity | Description | Fix | Status |
|----|----------|-------------|-----|--------|
| **AA-01** | 🟠 MEDIUM | `cron/cleanup-orphaned-auth.js` exists but is never scheduled. Orphaned Supabase auth records accumulate silently after any failed `DELETE /user/account`. GDPR compliance gap at scale. | Added `.github/workflows/cleanup-orphaned-auth.yml` on `0 */6 * * *`. `workflow_dispatch` supported for manual runs. 10-minute timeout. Uses `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` secrets. | ✅ DONE 2026-05-11 |
| **AA-03** | 🟡 LOW | `sets.js` POST accepts `reps: 0` (Zod `min(0)`), but Qt's `logSetAt()` rejects reps ≤ 0. | Changed `reps: z.number().int().min(0)` → `min(1)` in `sets.js`. Annotated with AA-03 comment. | ✅ DONE 2026-05-11 |
| **Z-04** | 🟡 LOW | `marketing-site/app/layout.tsx` embeds deprecated `themeColor` and `viewport` fields inside the `metadata` export. | Moved both fields to a separate `export const viewport: Viewport` per Next.js 14 conventions. `Viewport` added to type-imports. Build no longer emits deprecation warnings. | ✅ DONE 2026-05-11 |
| **Z-05** | 🟡 LOW | Waitlist API has no duplicate-email guard. | Added a module-level `seenEmails: Set<string>` with a 10k LRU-style cap. Duplicates short-circuit to the same success response without re-sending emails. Cross-instance dedupe deferred to Phase D `waitlist_emails` table. | ✅ DONE 2026-05-11 |
| **AA-02** | 🟡 LOW | `migrations/20260503_exercise_prs.sql` doc-block references `sets.weight_kg` — a column dropped by the 2026-05-05 weight_raw migration. | Added an `AA-02` doc-block paragraph documenting that on-disk storage is `weight_raw` (SMALLINT, ÷8) and future triggers must use `(weight_raw / 8.0)`. | ✅ DONE 2026-05-11 |

---

## 6. Open Issue Register (as of 2026-05-11)

| Rank | ID | Severity | Description | Status |
|------|----|----------|-------------|--------|
| 1 | AA-01 | 🟠 MEDIUM | Orphaned auth cleanup cron not scheduled | ✅ DONE 2026-05-11 |
| 2 | TICKET-025 verification | 🟠 MEDIUM | Human staging sign-off pending — gates TICKET-027 | ⏳ Awaiting beta testers |
| 3 | Z-04 | 🟡 LOW | layout.tsx deprecated metadata fields | ✅ DONE 2026-05-11 |
| 4 | Z-05 | 🟡 LOW | Waitlist duplicate email guard absent | ✅ DONE 2026-05-11 |
| 5 | AA-03 | 🟡 LOW | reps=0 validation inconsistency (sets.js vs Qt) | ✅ DONE 2026-05-11 |
| 6 | AA-02 | 🟡 LOW | exercise_prs.sql doc-block references dropped column | ✅ DONE 2026-05-11 |

**Total open after 2026-05-11 dev run: 1 (TICKET-025 staging sign-off). 0 P0. 0 HIGH. 0 unresolved MEDIUM. 0 LOW.** Quick-Fix Sprint closed all five engineering items.

---

## 7. Recommended Action Order — This Cycle

1. **Nudge beta testers** to respond to `TESTER_PROMPT_2026-05-09-TICKET-025.md` → unblocks TICKET-027 immediately.
2. **Ship Phase D Quick-Fix Sprint** (AA-01, AA-03, Z-04, Z-05, AA-02) as a single PR. ~30 minutes total. Resolves the last Medium severity gap and eliminates all Low items before production scale.
3. **Assign Apple Watch SwiftUI companion** (TICKET-013 Phase D) to dev-frontend-native.
4. **Wire Supabase service role key in prod env** to complete the `supabaseAdmin.auth.admin.deleteUser()` flow — coordinate with DevOps at production deployment time.
5. **Begin TICKET-027 (PowerSync offline sync)** immediately after TICKET-025 staging verification is confirmed.

---

## 8. Product Roadmap Alignment

The product ROADMAP.md (updated 2026-05-10) defines three phases of user-facing features. The current dev roadmap (Phase D) maps to **Product Phase 1 — Pre-Launch Foundations**. Specifically:

- **Percentile architecture (1.6):** Backend cron stub complete (`percentile.js`). Reference data import (Open Powerlifting DB) and confidence ring UI are outstanding product deliverables not yet ticketed on the dev side.
- **RPE logging (2.1), 1RM formula selection (2.2), Deload week AI plans (2.4):** No dev tickets created yet. These are Phase 2 product items to be ticketed once Phase D feature track stabilizes.
- **Wearable integration (3.1):** Partially addressed by TICKET-013 (Apple Watch, Phase D). Garmin integration has no dev ticket yet.

**Action for PM:** Create dev tickets for Product Phase 1 items not yet on the dev board — especially percentile reference data import and confidence ring UI, which are designated pre-launch requirements.

---

*Roadmap v9 generated by pf-exec-prompts (automated scheduled run) — 2026-05-11.*
*Supersedes `DEV_ROADMAP_2026-05-10.md` (v8).*
*Source: pf-tester-feedback-2026-05-10.md (6 issues synthesized), DEV_ROADMAP_2026-05-10.md, ROADMAP.md.*
*Next recommended run: after Phase D Quick-Fix Sprint ships and TICKET-025 staging verification received.*
