# Peak Fettle — Development Roadmap (v8)
**Date:** 2026-05-10
**From:** pf-1am-dev-ops (automated overnight session)
**Status:** ACTIVE — supersedes v7 (`DEV_ROADMAP_2026-05-05.md`)
**Anchor documents:** `INSTRUCTIONS.md`, `DEV_ROADMAP_2026-05-05.md` (v7), `workflow-optimization/context-slices/dev-context.md`

---

## Executive Summary

Phase B is now fully closed. This session confirmed that the items listed as "open" in v7 were either already implemented in code (confirmed by file inspection) or completed by this session. Two genuine gaps remained and are now resolved: Y-03 (stale exercise_prs rows on set-delete/downward-edit — fixed via new migration) and the dev-lead.md change-log entries (added this session). Phase C/D future tickets are carried forward unchanged.

---

## 1. Phase A — CLOSED ✅

All 8 tickets + N-series fixes confirmed in code as of v5. No action required.

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

All Phase B items confirmed complete as of 2026-05-10.

| Task | Status | Notes |
|------|--------|-------|
| Deploy marketing site to Vercel | ✅ Complete | Confirmed in `dev-context.md` (2026-05-04) |
| CI lint + test pipeline | ✅ Complete | Confirmed in `dev-context.md` (2026-05-04) |
| Clean Qt 6.11 build (zero warnings) | ✅ Complete | Confirmed in `dev-context.md` (2026-05-04) |
| `exercise_aliases` table + `/exercises/search` endpoint | ✅ Complete | `server/routes/exercises.js` — scored CTE search with alias join, `/exercises/search`, `/exercises/:id/aliases` all present |
| `/plans` CRUD skeleton | ✅ Complete | `server/routes/plans.js` — POST, GET (list), GET /:id, PATCH /:id, DELETE /:id all present; POST /plans/generate (TICKET-011) also complete |
| Percentile cron stub | ✅ Complete | `server/cron/percentile.js` — full `compute_percentile_batch()` call, confirmed in `dev-context.md` (2026-05-02) |
| **Y-03**: exercise_prs stale-PR on set-delete / downward edit | ✅ **Complete — 2026-05-10** | `migrations/20260510_exercise_prs_recompute_trigger.sql` — AFTER DELETE trigger recomputes rep-count PR + E1RM PR; AFTER UPDATE trigger (weight_kg, reps) handles downward edits via `recompute_exercise_pr()` helper |
| **Y-04**: Write-guard comment on `cosmetic_items` | ✅ Complete | `20260503_cosmetics.sql` and `20260503_rls_policies.sql` both contain `!! WRITE-GUARD !!` block with full rationale. No code change needed. |
| dev-lead.md change-log entries (TICKET-007/008/010, avatar, BUG-01) | ✅ **Complete — 2026-05-10** | `peak-fettle-agents/agents/dev-lead.md` — `## Change Log` section added with architectural decisions and implementation notes for all five items |

---

## 3. Sprints 1–5 — CLOSED ✅

All confirmed complete as of v7 (2026-05-05). No action required.

```
Sprint 1 ✅  requireAuth.js, auth.js, sets.js, index.js all fully restored
Sprint 2 ✅  authLimiter on /auth, CORS WEB_ORIGIN whitelist
Sprint 3 ✅  All Qt/C++ fixes (N-01, N-03/X-04/Y-02, N-04, N-05, N-06, N-15, X-06)
Sprint 4 ✅  pg_trgm in initial schema, daily_health_log deduped
Sprint 5 ✅  All landing page fixes (T-09, T-10, T-11, T-12, N-14)
Phase B  ✅  All items closed — see table above
```

**Beta invite gate:** ✅ MET (Sprint 1 + Sprint 2 confirmed). External beta expansion unblocked.

---

## 4. Phase C — IN PROGRESS (partially complete)

| Track | Task | Status |
|-------|------|--------|
| Database | `migrations/20260504_user_constraints.sql` | ✅ Complete (2026-05-04) |
| Database | `migrations/20260504_daily_health_metrics.sql` | ✅ Complete (2026-05-04) |
| Backend | `routes/constraints.js` — GET/POST/DELETE /constraints | ✅ Complete (2026-05-04) |
| Backend | `routes/plans.js` — POST /plans/generate (TICKET-011, Haiku 4.5) | ✅ Complete (2026-05-04) |
| Backend | `routes/healthMetrics.js` — GET/POST /health-metrics | ✅ Complete (2026-05-04) |
| Backend | `routes/user.js` — GDPR data export + account delete (TICKET-014) | ✅ Complete (2026-05-04) |
| Backend | `index.js` — Phase C routes wired | ✅ Complete (2026-05-04) |
| Policy | TICKET-015 — percentile routes ungated (free tier confirmed) | ✅ Confirmed (2026-05-04) |
| Native | Apple Watch companion app (SwiftUI — display workout, next exercise, rest timer) | 🔲 Phase D |

---

## 5. Phase C/D — Future Tickets (pending exec ratification)

Carried from v7. Full specs in `workflow-optimization/briefs/dev-roadmap-relay-2026-05-04.md`.

| Ticket | Description | Phase |
|--------|-------------|-------|
| TICKET-011 | Transparent AI Plan Reasoning | ✅ Complete (plans.js /generate) |
| TICKET-012 | Injury & Limitation Constraint Filter | ✅ Complete (constraints.js) |
| TICKET-013 | Smartwatch Integration — backend/DB layer | ✅ Partial (health metrics DB done; Apple Watch SwiftUI companion is Phase D) |
| TICKET-014 | Privacy Architecture Commitment (GDPR) | ✅ Complete (user.js) |
| TICKET-015 | Percentile Rankings free-tier policy confirm | ✅ Confirmed |

---

## 6. Issue Register (open items only)

All P0 and HIGH issues are resolved. No open items as of 2026-05-10.

| Rank | ID | Severity | Description | Status |
|------|----|----------|-------------|--------|
| — | Y-03 | 🟠 MEDIUM | exercise_prs stale PR on set-delete / downward edit | ✅ DONE (2026-05-10) |
| — | Y-04 | 🟡 LOW | cosmetic_items write-guard comment | ✅ DONE (already present) |

---

## 7. Next Actions

1. **Tester feedback round 2026-05-10** — schedule after this roadmap is reviewed
2. **Apple Watch SwiftUI companion** (TICKET-013 Phase D) — assign to dev-frontend-native when capacity allows
3. **`supabaseAdmin.auth.admin.deleteUser()` TODO** in `routes/user.js` — needs Supabase service role key wired in production env; blocked until prod deployment confirmed

---

*Roadmap v8 generated by pf-1am-dev-ops (automated overnight session) — 2026-05-10.*
*Confirmed: Phase B fully closed. Y-03 fixed via migration. dev-lead.md changelog added.*
*Supersedes `DEV_ROADMAP_2026-05-05.md` (v7).*
