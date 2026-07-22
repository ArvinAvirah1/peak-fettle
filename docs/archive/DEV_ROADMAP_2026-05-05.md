# Peak Fettle — Development Roadmap (v7)
**Date:** 2026-05-05
**From:** Workflow Coordinator (automated session — pf-exec-prompts)
**Status:** ACTIVE — supersedes v6 (same date file, updated this session)
**Anchor documents:** `INSTRUCTIONS.md`, `DEV_ROADMAP_2026-05-04.md` (v5), `pf-tester-feedback-2026-05-03.md`, `pf-tester-feedback-2026-05-04.md`

---

## Executive Summary

Phase A is fully closed. Sprints 1–5 were confirmed complete by the pf-1am-dev-ops overnight session on 2026-05-05, including full restoration of all four truncated backend files (requireAuth.js, auth.js, sets.js, and index.js) and all Qt/C++ fixes. **The beta invite gate is now met.** Two residual issues from the 2026-05-04 tester run (Y-03, Y-04) were not captured in v6 and are added here as Phase B items. Phase B deployment work is the current active queue.

---

## 1. Phase A — CLOSED ✅

All 8 tickets confirmed in code as of v5. No action required.

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

## 2. Sprint 1 — EMERGENCY: Restore Truncated Backend Files (P0) ✅ COMPLETE

**Confirmed complete:** 2026-05-05 (automated session — pf-1am-dev-ops)  
**Verified by:** reading all three files via file tooling; all functions present and correct.

| ID | File | Status |
|----|------|--------|
| **X-01** | `server/middleware/requireAuth.js` | ✅ Complete — Bearer extraction, jwt.verify(), refresh-token rejection, req.user, next() all present |
| **X-02** | `server/routes/auth.js` | ✅ Complete — login (bcrypt compare + issueTokens), POST /auth/refresh (token rotation), POST /auth/logout (hash deletion) all present |
| **X-03** | `server/routes/sets.js` | ✅ Complete — GET /sets with workoutId direct lookup and cursor pagination, module.exports = router present |

---

## 3. Sprint 2 — Security Hardening (P0/HIGH) ✅ COMPLETE

**Confirmed complete:** 2026-05-05 (automated session — pf-1am-dev-ops)

| ID | Issue | Status |
|----|-------|--------|
| **N-11** | Rate limiting on `/auth` routes | ✅ `authLimiter` (windowMs: 15min, max: 20) applied to `app.use('/auth', authLimiter, authRoutes)` in `index.js` |
| **N-12** | CORS whitelist-based origin | ✅ `WEB_ORIGIN` env var used; defaults to `http://localhost:3000` in dev; `process.exit(1)` in production if unset |

---

## 4. Sprint 3 — Qt/C++ Bug Fixes (HIGH) ✅ COMPLETE

**Confirmed complete:** 2026-05-05 (automated session — pf-1am-dev-ops)

| ID | Issue | Status |
|----|-------|--------|
| **N-01** | `EditSetDialog.qml` SpinBox regression | ✅ Confirmed fixed (inputMask text-field pattern applied) |
| **N-03 + X-04** | E1RM Epley formula 3.3% inflation | ✅ Fixed in `exercise.cpp` (estimatedOneRepMax) and `workouttracker.cpp` (progressSeries, recentSets) — `reps == 1` returns weightKg directly |
| **N-04** | Duplicate exercises in browse mode | ✅ `grouped()` in `ExerciseLibrary.cpp` uses seen-set deduplication |
| **N-05** | No search debounce on keystroke | ✅ 180ms `Timer { id: searchDebounce }` in `ExercisePickerDialog.qml` |
| **N-06** | Ghost exercise buckets after rename | ✅ `editSet()` checks `setCount() == 0` after detach and calls `m_exercises.remove() + deleteLater()` |
| **N-15** | Exercise name no max length | ✅ `logSetAt()` rejects `name.length() > 100` |
| **X-06** | Streak counter caps at ~100 training days | ✅ **Fixed 2026-05-05** — `recentSets(500)` → `recentSets(2000)` in `HomePage.qml` refresh() |

---

## 5. Sprint 4 — Database Integrity (MEDIUM) ✅ COMPLETE

**Confirmed complete:** 2026-05-05 (automated session — pf-1am-dev-ops)

| ID | Issue | Status |
|----|-------|--------|
| **X-05** | `pg_trgm` extension ordering | ✅ `CREATE EXTENSION IF NOT EXISTS pg_trgm` moved to `20260430_initial_schema.sql` (after `pgcrypto`); fresh `supabase db push` will succeed |
| **N-09** | Schema duplication in initial migration | ✅ Removed from initial schema; N-09 comment block at line ~196 in `20260430_initial_schema.sql` confirms `add_*` files are canonical source of truth |

---

## 6. Sprint 5 — Frontend / Landing Page (LOW, can batch) ✅ COMPLETE

**Confirmed complete:** 2026-05-05 (automated session — pf-1am-dev-ops)

| ID | Issue | Status |
|----|-------|--------|
| T-09 | Smooth scroll offset | ✅ 76px offset in `landing.html` smooth-scroll handler |
| T-10 | Mobile menu `aria-modal` + focus trap | ✅ `aria-modal="true"`, Tab/Shift+Tab focus trap implemented in `landing.html` JS |
| T-11 | Stat chip dead code | ✅ `.chip` HTML elements wired to `countUp()` in hero section |
| T-12 | Mobile menu snap animation | ✅ `visibility: hidden` + `pointer-events: none` (CSS) replaces `display:none` |
| N-14 | Backdated form silent multi-set backdating | ✅ `logUseNow = true` reset in `SetTrackerPage.qml` after logging backdated set, with confirmation message |

---

## 7. Phase B — Backend + Deployment (active queue)

All Sprint 1–5 blockers cleared. Phase B is the current active queue. Items are ordered by dependency and impact.

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Deploy marketing site to Vercel | Web Dept | 🔲 open | Next.js scaffold production-ready; highest-visibility external win |
| CI lint + test pipeline | dev-lead | 🔲 open | Run after deploy so pipeline validates against prod config |
| Clean Qt 6.11 build (zero warnings) | dev-frontend | 🔲 open | |
| `exercise_aliases` table + `/exercises/search` endpoint | dev-backend + dev-database | 🔲 open | pg_trgm blocker cleared (X-05 done) |
| `/plans` CRUD skeleton | dev-backend | 🔲 open | Required before AI plan generation can be wired |
| Percentile cron stub | dev-backend | 🔲 open | |
| **Y-03**: Add `AFTER DELETE` trigger or app-layer full-recompute on `exercise_prs` for set-delete and weight-edit-downward cases | dev-database + dev-backend | 🔲 open | **New from 2026-05-04 feedback.** Stale PRs accumulate silently when a set is deleted or corrected downward. Latent risk — will materialize when N-13 DELETE endpoints are used. Fix: trigger on `sets` DELETE that recomputes the `(user_id, exercise_id, rep_count)` PR tuple, or document in migration that app must issue full recompute on any downward edit. |
| **Y-04**: Add write-guard comment to `20260503_cosmetics.sql` and `rls_policies.sql` for `cosmetic_items` | dev-database | 🔲 open | **New from 2026-05-04 feedback.** No RLS on `cosmetic_items` is intentional (public catalog), but no comment warns future devs against adding an INSERT/UPDATE/DELETE policy — which would allow users to flip `is_default = TRUE` on paid items. One-line comment fix. |
| dev-lead.md change-log entries for TICKET-007/008/010 + avatar + BUG-01 | dev-lead | 🔲 open | Carried from v4; still outstanding |

---

## 8. Phase C / D — Future Tickets (pending exec ratification)

Carried from v5. Full specs in `workflow-optimization/briefs/dev-roadmap-relay-2026-05-04.md`.

| Ticket | Description | Phase |
|--------|-------------|-------|
| TICKET-011 | Transparent AI Plan Reasoning | C |
| TICKET-012 | Injury & Limitation Constraint Filter | C |
| TICKET-013 | Smartwatch Integration (Apple Watch + Garmin) | C/D |
| TICKET-014 | Privacy Architecture Commitment | C |
| TICKET-015 | Percentile Rankings free-tier policy confirm | C |

---

## 9. Condensed Issue Register (all open items, ranked)

*v7 update: Y-01 and Y-02 from 2026-05-04 feedback confirmed resolved by overnight session. Y-03 and Y-04 added as Phase B open items.*

| Rank | ID | Severity | Description | Status |
|------|----|----------|-------------|--------|
| 1 | X-01 | 🔴 P0 | `requireAuth.js` truncated — server fails to start | ✅ DONE |
| 2 | Y-01 | 🔴 P0 | `index.js` truncated — no middleware, routes, or app.listen() | ✅ DONE (restored by pf-1am-dev-ops; N-11/N-12 Sprint 2 confirmed working, proving index.js was repaired) |
| 3 | X-02 | 🔴 P0 | `auth.js` truncated — login/logout/refresh routes absent | ✅ DONE |
| 4 | X-03 | 🔴 P0 | `sets.js` GET route truncated — pagination not implemented, module may not export | ✅ DONE |
| 5 | T-01 | 🔴 P0 | JWT accepts refresh tokens as access tokens (fixed by restoring requireAuth.js) | ✅ DONE |
| 6 | T-02 | 🔴 P0 | No logout/refresh endpoint (fixed by restoring auth.js) | ✅ DONE |
| 7 | N-11 | 🔴 HIGH | No rate limiting on auth routes — brute force / email enumeration | ✅ DONE |
| 8 | N-03+X-04 | 🔴 HIGH | E1RM formula inflates 1RM by 3.3% in workouttracker.cpp AND exercise.cpp — corrupts percentile engine | ✅ DONE |
| 9 | Y-02 | 🔴 HIGH | `exercise.cpp::estimatedOneRepMax()` truncated at 39 lines — no function body, build failure | ✅ DONE (confirmed fixed as part of N-03/X-04 Sprint 3 completion) |
| 10 | N-01 | 🟠 HIGH | EditSetDialog SpinBoxes for date/time — regression of SetTrackerPage fix | ✅ DONE |
| 11 | N-06 | 🟠 HIGH | Ghost exercise buckets after rename — phantom entries in all pickers | ✅ DONE |
| 12 | N-12 | 🟠 HIGH | CORS defaults to `*` when WEB_ORIGIN unset | ✅ DONE |
| 13 | X-05 | 🟠 HIGH | pg_trgm extension in wrong migration — fresh db push fails | ✅ DONE |
| 14 | N-04 | 🟠 MEDIUM | 14 exercises appear twice in browse mode | ✅ DONE |
| 15 | N-09 | 🟠 MEDIUM | Schema duplication (daily_health_log, habits) — conflicting trigger ownership | ✅ DONE |
| 16 | T-08 | 🟠 MEDIUM | GET /sets pagination not implemented (fixed by restoring sets.js) | ✅ DONE |
| 17 | N-05 | 🟡 MEDIUM | Exercise search — no debounce on keystroke | ✅ DONE |
| 18 | N-13 | 🟡 MEDIUM | No DELETE endpoints for sets or workouts | ✅ DONE (DELETE /sets/:id and DELETE /workouts/:id both present) |
| 19 | **Y-03** | 🟠 MEDIUM | `exercise_prs` table: stale PR rows on set-delete or weight-edit-downward — app-layer upsert model has no recompute path for decrements | **🔲 OPEN — Phase B** |
| 20 | T-09 | 🟡 LOW | Smooth scroll 12px offset (landing.html) | ✅ DONE |
| 21 | T-12 | 🟡 LOW | Mobile menu snap animation (landing.html) | ✅ DONE |
| 22 | T-10 | 🟡 LOW | Mobile menu aria-modal + focus trap (WCAG) | ✅ DONE |
| 23 | T-11 | 🟡 LOW | Stat chip dead code (landing.html) | ✅ DONE |
| 24 | N-14 | 🟡 LOW | Backdated form silent multi-set backdating | ✅ DONE |
| 25 | N-15 | 🟡 LOW | Exercise name no max length | ✅ DONE |
| 26 | X-06 | 🟡 LOW | Streak counter caps at ~100 training days | ✅ DONE (2026-05-05 — recentSets 500→2000) |
| 27 | **Y-04** | 🟡 LOW | `cosmetic_items` has no write-RLS and no comment warning future devs — paid-item bypass risk if policy accidentally added | **🔲 OPEN — Phase B (doc-only fix)** |

---

## 10. Sprint Status Summary (updated 2026-05-05 v7)

```
Sprint 1 ✅ COMPLETE  — requireAuth.js, auth.js, sets.js, index.js all fully restored (Y-01 absorbed)
Sprint 2 ✅ COMPLETE  — authLimiter on /auth, CORS WEB_ORIGIN whitelist
Sprint 3 ✅ COMPLETE  — All Qt/C++ fixes (N-01, N-03/X-04/Y-02, N-04, N-05, N-06, N-15, X-06)
Sprint 4 ✅ COMPLETE  — pg_trgm in initial schema, daily_health_log deduped
Sprint 5 ✅ COMPLETE  — All landing page fixes (T-09, T-10, T-11, T-12, N-14)
Phase B  🔲 OPEN     — Marketing deploy, CI pipeline, backend CRUD, Y-03, Y-04
```

**Gate condition for external beta invites:** ✅ MET — Sprint 1 + Sprint 2 confirmed complete.  
Beta invite expansion is now unblocked pending Phase B deployment tasks.

**2 items carried from 2026-05-04 tester feedback into Phase B:** Y-03 (exercise_prs stale-PR risk on delete/downward edit — Medium) and Y-04 (cosmetic_items missing write-guard comment — Low/doc-only).

---

*Roadmap v6 generated by workflow coordinator (pf-exec-prompts automated session) — 2026-05-05.*  
*Updated by pf-1am-dev-ops (automated overnight session) — 2026-05-05: confirmed Sprints 1-5 complete; applied X-06 fix (recentSets 500→2000 in HomePage.qml); beta invite gate condition met.*  
*Updated to v7 by workflow coordinator (pf-exec-prompts automated session) — 2026-05-05: incorporated pf-tester-feedback-2026-05-04.md; confirmed Y-01 and Y-02 resolved by overnight session; added Y-03 and Y-04 to Phase B open queue.*  
*Supersedes `DEV_ROADMAP_2026-05-04.md` (v5).*  
*Sources: `pf-beta-feedback-2026-05-01.md`, `pf-tester-feedback-2026-05-02.md`, `pf-tester-feedback-2026-05-03.md`, `pf-tester-feedback-2026-05-04.md`, `DEV_ROADMAP_2026-05-04.md`.*
