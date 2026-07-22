# Dev Roadmap Relay — 2026-05-01 (v2)
**Date:** 2026-05-01
**From:** Workflow Coordinator
**To:** dev-lead → dev-frontend, dev-backend, dev-database
**Source:** `DEV_ROADMAP_2026-05-01.md` (exec-approved v2)
**Supersedes:** `dev-roadmap-relay-2026-04-30.md`
**Status:** ACTIVE — pick up next-tasks below

---

## COORDINATOR INTAKE

The exec team (CEO, CTO, PM) ratified an updated roadmap today that folds in Beta Round 1 results. Phase A scope grew from 5 tickets to 8; first-tasks for Phase B database and backend tracks both closed yesterday. Web track for Phase B remains unstarted. This relay reflects all three changes.

You don't need to read the exec doc — everything you need to start your next-task is below. Coordinator's translation rule is unchanged: each discipline gets one **next-task** to start now plus a **queue** of follow-ups for the current phase. No multi-phase commitments; phase gates re-confirm scope before unlocking.

This relay is **App Department + Web Department + shared services (backend/database)** combined, because the next-tasks span all three.

---

## DEV TEAM DIRECTIVE

### What changed since the last relay

1. **TICKET-001 (kg/lbs toggle) closed** — `UnitPreference` singleton, `WeightLabel` component, SettingsPage section all merged; dev-lead.md change log updated.
2. **TICKET-002 (RIR label UX) is in code but missing from the change log.** `EffortPreference` singleton with `rir`/`off` modes ships, SettingsPage has the toggle, SetTrackerPage and EditSetDialog respect `EffortPreference.showRir`, "(optional)" labels and tooltip are present. Coordinator action: add the change-log entry retroactively.
3. **Phase A scope grew by 3** — TICKET-002 (already done), TICKET-003, TICKET-004 added per Beta Round 1 update brief. New Phase A total = 8 tickets.
4. **Phase B first tasks closed (database, backend)** — initial schema migration, health-suite migrations, Express skeleton with auth + sets/workouts endpoints. Each track now moves to its queue.
5. **Phase B web track is the only Phase B first-task still open.**

---

### Phase A — Qt prototype hardening (App Dept)

| # | Ticket | Owner | State |
|---|---|---|---|
| 1 | TICKET-001 — kg/lbs toggle | dev-frontend + dev-backend | ✅ closed |
| 2 | TICKET-002 — RIR label UX | dev-frontend | ✅ in code; change-log only |
| 3 | TICKET-003 — My Routines home section | dev-frontend | 🔲 open |
| 4 | TICKET-004 — Start Workout CTA prominence | dev-frontend | 🔲 open (combine with #3) |
| 5 | TICKET-005 — Guided onboarding | dev-frontend | 🔲 open |
| 6 | TICKET-007 — Exercise search aliases | dev-database + dev-backend + dev-frontend | 🔲 open (tri-disciplinary) |
| 7 | TICKET-008 — PR badges | dev-frontend + dev-backend | 🔲 open |
| 8 | TICKET-010 — Mixed lift+cardio session | dev-frontend + dev-backend | 🔲 open (contract written 04-30) |

**Discipline rule (unchanged):** Run the dev-lead.md pre-build checklist before declaring any of these "compiles." Stale MOC cache cost a sprint already.

---

### Phase B — Production stack foundation (parallel tracks)

#### Database track (dev-database) — first task closed

**Next-task:** Author `migrations/20260501_exercise_aliases.sql` containing:
- `exercise_aliases` table (`alias_id` UUID PK, `exercise_id` UUID FK → `exercises.id`, `alias` TEXT NOT NULL, `created_at` TIMESTAMPTZ).
- Unique index on `LOWER(alias)` for case-insensitive lookups.
- Seed rows for the canonical abbreviations: RDL → Romanian Deadlift, OHP → Overhead Press, BP → Bench Press, DL → Deadlift, SQ → Squat, BB → Barbell Row, DB → Dumbbell, SL → Single Leg.

**Acceptance:**
- `supabase db reset` runs clean with the new file in date order.
- A `SELECT * FROM exercise_aliases WHERE LOWER(alias) = 'rdl'` returns the Romanian Deadlift row.
- Migration ordering preserved — the new file's date prefix makes it land after the initial schema.

**Queue after next-task:**
- Exercise library seed (~150 common lifts + cardio activities) — depends on alias table being live first.
- `exercise_prs` table for TICKET-008 (one row per user × exercise × rep_count tracking the best set).

#### Backend track (dev-backend) — first task closed

**Next-task:** Add `GET /exercises/search?q=...` to the Express server.
- Mount under existing `peak-fettle-agents/server/routes/`.
- Query path: trim, lowercase, search `exercise_aliases.alias` (exact + prefix), then fall back to `exercises.name` ILIKE.
- Response shape: `{ results: [{ id, name, primaryMuscle, kind: 'lift'|'cardio' }], matchedVia: 'alias'|'name' }`.
- Validate `q` with Zod (1–48 chars). 4xx on missing/bad input.
- Public route — no auth required (the exercise library is global).

**Acceptance:**
- `curl 'http://localhost:4000/exercises/search?q=rdl'` returns the Romanian Deadlift entry with `matchedVia: 'alias'`.
- `curl 'http://localhost:4000/exercises/search?q=Rom'` returns Romanian Deadlift via `matchedVia: 'name'`.
- Empty / missing `q` returns 400 with a clear error message.
- PostHog server-side event `exercise_search_executed` fires once per request.

**Queue after next-task:**
- `/plans` skeleton (CRUD only — no AI yet).
- Cron stub for percentile batch job (registers schedule, no logic, verifies the schedule fires).
- `POST /sets` extension to accept the cardio-set discriminator from TICKET-010 (already contract-defined 04-30).

#### Frontend track (dev-frontend) — Phase A continues; pick TICKET-008 next

**Next-task:** TICKET-008 — PR detection + badge.
- Add `Set::isPersonalRecord` semantic at the model layer (computed at render time from `WorkoutTracker::recentSets` history). PR types to detect: weight-PR at a given rep count and E1RM-PR.
- In `SetTrackerPage.qml` recent-sets list delegate: if the row is a PR, show a small "🏆 PR" badge to the right of the weight × reps cluster, in `Theme.turquoise`.
- In `EditSetDialog.qml`: if editing a set that is the user's current PR, surface a non-blocking note ("Editing your current PR for {exercise} — this will recompute history.").
- Do NOT add a notifications system yet — push notifications are Phase D.

**Acceptance:**
- Logging a heavier weight at a given rep count surfaces the badge on the new row.
- Logging a higher Epley E1RM (across any reps) surfaces the badge.
- Editing a PR row recomputes correctly — the badge moves if the edit demotes the set below history.
- All 7 pre-build-checklist items verified before declaring "compiles."

**Queue after next-task:** TICKET-003 + TICKET-004 (combine in one PR — same surface), then TICKET-005, then TICKET-010 frontend.

#### Web track (dev-frontend, after Phase A) — first task still open

**First task (unchanged from prior relay):** React marketing site scaffold. One landing page at the project root URL, one `/waitlist` form posting to Resend. Tailwind only. Vercel free tier deploy.

**Acceptance:** landing page deployed at a public URL; waitlist form returns confirmation; Lighthouse ≥90 across Performance, Accessibility, Best Practices, SEO.

**Queue after first task:** none this phase. Web mirror of the app is Phase D.

---

## CONTRACT: TICKET-007 cross-discipline (database → backend → frontend)

The next-tasks for dev-database and dev-backend share a contract — write it down before either writes code.

```
exercise_aliases:
    alias_id     UUID PK
    exercise_id  UUID FK → exercises.id
    alias        TEXT NOT NULL  -- preserve original case for display
    created_at   TIMESTAMPTZ DEFAULT NOW()
    UNIQUE INDEX on LOWER(alias)

GET /exercises/search?q=<1..48 chars>
  → 200 { results: [{ id, name, primaryMuscle, kind }], matchedVia: 'alias'|'name' }
  → 400 { error: 'q must be 1-48 chars' }

Search algorithm (pseudo):
    q' = trim(lower(q))
    rows = SELECT e.* FROM exercises e
           JOIN exercise_aliases a ON a.exercise_id = e.id
           WHERE LOWER(a.alias) = q'         -- exact alias
    IF empty:
        rows = ... WHERE LOWER(a.alias) LIKE q' || '%'   -- prefix alias
    IF still empty:
        rows = SELECT e.* FROM exercises e
               WHERE e.name ILIKE '%' || q' || '%'
               LIMIT 20
    return rows + matchedVia
```

dev-frontend consumes this against `WorkoutTracker::searchExercises` (Qt-side wrapper) and the React Native version when Phase C lands.

---

## CONTRACT: TICKET-010 — carried forward unchanged

`Set` cardio variant from the 04-30 relay still applies. dev-frontend renders form by `kind`, dev-backend accepts unified `POST /sets` payload with the discriminator.

---

## OUTPUT FORMAT (per dev-context rule)

After every task, each specialist outputs:

1. Summary of what changed and why
2. Files modified (with paths)
3. Change log entry for reporter-teacher
4. Blockers or decisions needing executive input

Append your change-log entry to `dev-lead.md` "Recently completed" section. Coordinator rolls it up into the next exec status report.

---

## BLOCKERS / DECISIONS NEEDING EXEC INPUT

Carried over from Health-Suite brief — still unresolved, still not blockers for the current next-tasks:

1. **Habit frequency options** — daily-only at Phase 2, or weekly + custom? Recommendation: daily-only.
2. **Meditation logging** — manual only, or auto-import from Apple Health / Google Fit?
3. **Wellbeing vs. Recovery tab** — naming pending exec-product-manager.

These become blockers when Phase D health-suite UI work begins, not now.

---

## FILES MODIFIED BY THIS RELAY

- `workflow-optimization/briefs/dev-roadmap-relay-2026-05-01.md` *(new — this file)*

## CHANGE LOG ENTRY

> `2026-05-01` — Workflow Coordinator relayed exec roadmap v2 to dev team. Phase A scope grew to 8 tickets (added -002 already in code, -003, -004 per beta brief). Phase B database + backend first tasks confirmed closed. Next-tasks: dev-database → `exercise_aliases` migration; dev-backend → `GET /exercises/search`; dev-frontend → TICKET-008 (PR badges). Web track first task (marketing site) remains open after Phase A.
