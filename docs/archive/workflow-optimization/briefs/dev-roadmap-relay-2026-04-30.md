# Dev Roadmap Relay — 2026-04-30
**Date:** 2026-04-30
**From:** Workflow Coordinator
**To:** dev-lead → dev-frontend, dev-backend, dev-database
**Source:** `DEV_ROADMAP_2026-04-30.md` (exec-approved)
**Status:** ACTIVE — pick up next-tasks below

---

## COORDINATOR INTAKE

Execs (CEO, CTO, PM) have signed off on a 5-phase plan to take Peak Fettle from "Qt prototype with lifting tracker" to "v1.0 in App Store + Play Store." Strategy rationale and phase gates live in the source roadmap. Dev team does **not** need to read the exec doc — everything you need to start is below in the Dev Context framing.

Coordinator's translation rule: each discipline gets one **first-task** to start now plus a **queue** of follow-ups for this phase. No multi-phase commitments — phase gates re-confirm scope before unlocking.

This relay focuses on **Phases A and B** (current sprint + next 3–4 weeks). Phase C onward is mentioned only for context.

---

## DEV TEAM DIRECTIVE

### What changed and why (summary)

The exec team has bucketed all remaining work to ship v1.0 into five gated phases. We are running Phase A (finish Qt reference sprint) and Phase B (production stack foundation) in parallel because they touch different code surfaces. Backend and database work in Phase B is greenfield; frontend work in Phase A continues in the existing Qt repo.

The work below is the **next-task** for each specialist. Anything past your first task is queued for this phase but not started until the first task is closed.

---

### Phase A — Qt prototype hardening (frontend-led)

Five tickets routed for this sprint, ordered by impact:

| # | Ticket | Owner | Notes |
|---|---|---|---|
| 1 | TICKET-001 — kg/lbs display toggle | dev-frontend | Persist in kg per project rule. Display-only conversion. |
| 2 | TICKET-008 — PR badges on progress chart | dev-frontend | Annotate best-of-day series; do not change aggregation. |
| 3 | TICKET-005 — guided onboarding flow | dev-frontend | First-launch only; skippable. Capture demographics for future cohort percentile work. |
| 4 | TICKET-007 — exercise search with synonyms / aliases | dev-database + dev-frontend | New `exercise_aliases` table; UI consumes via `WorkoutTracker::searchExercises`. |
| 5 | TICKET-010 — mixed lift+cardio in one session | dev-frontend + dev-backend | Adds cardio-set type to model; requires schema field. Coordinate contract with dev-backend before code. |

**Discipline rule:** Run the dev-lead.md pre-build checklist before declaring any of these "compiles." Stale MOC cache cost us a sprint already.

---

### Phase B — Production stack foundation (parallel tracks)

Three tracks kick off the moment each owner finishes their Phase-A involvement.

#### Database track (dev-database)
**First task:** Author the initial Supabase migration file. Single SQL file under `migrations/20260430_initial_schema.sql` covering: `users`, `exercises`, `workouts`, `sets`, `plans`, `streaks`, `percentile_vectors`. Then layer the already-greenlit Health-Suite Phase 1 tables (`daily_health_log`, `habits`) on top. Every user-scoped table gets an RLS policy in the same migration. UUID primary keys. Timestamp every row.

**Acceptance:**
- `supabase db reset` runs the file cleanly
- `\dt` shows all expected tables
- RLS is enabled and policy exists for every table where `user_id` is a column
- Schema matches the data entities listed in `dev-context.md` (users, workouts, percentile_vectors, plans, streaks)

**Queue after first task:**
- Seed file for the exercise library (~150 common lifts + cardio activities)
- `exercise_aliases` table for TICKET-007 (Phase A dependency — coordinate with dev-frontend on timing)

#### Backend track (dev-backend)
**First task:** Initialize the Express server skeleton at `peak-fettle-agents/server/`. Wire JWT auth (signup, login, refresh) against the Supabase `users` table. Stand up `POST /workouts`, `POST /sets`, `GET /sets?userId=&from=&to=`. Use `pg` against the Supabase Postgres URL. Validate inputs with Zod.

**Acceptance:**
- Postman / curl smoke test: signup → login → POST `/workouts` → POST `/sets` → GET `/sets` returns the set
- All three endpoints validate input and return clear 4xx errors on bad payloads
- No password hashing shortcuts — bcrypt with cost factor ≥10
- Sentry initialized; PostHog server-side event for `set_logged`

**Queue after first task:**
- `/exercises/search` endpoint to back TICKET-007
- `/plans` skeleton (no AI yet — just CRUD for templates)
- Cron stub for the percentile batch job (no logic yet — verify the schedule fires)

#### Web track (deferred to dev-frontend after Phase A)
**First task:** React marketing site scaffold. One landing page at the project root URL, one `/waitlist` form posting to Resend. Tailwind, no other deps. Deploy to Vercel free tier. Copy will be drafted by exec-product-manager + marketing — for now use placeholder text marked `<!-- TBD: marketing copy -->`.

**Acceptance:**
- Landing page deployed at a public URL
- Waitlist form submits to Resend and returns confirmation
- Lighthouse score ≥90 on Performance, Accessibility, Best Practices, SEO

**Queue after first task:** None this phase. Web mirror of the app is Phase D.

---

## CONTRACT: TICKET-010 mixed lift+cardio session

Anything that crosses two specialists must have its integration contract written before code starts. This is the only Phase A ticket that crosses disciplines.

```
// Set model — cardio variant
struct Set {
    SetKind kind;            // LIFT | CARDIO
    QString dayKey;          // ISO YYYY-MM-DD (unchanged)

    // LIFT-only
    int reps;                // -1 if not applicable
    double weightKg;         // -1 if not applicable
    int rir;                 // -1 not recorded, 0 to failure (unchanged)

    // CARDIO-only
    int durationSec;         // -1 if not applicable
    double distanceMeters;   // -1 if not applicable
    double avgPaceSecPerKm;  // -1 if not applicable
}
```

dev-frontend renders the appropriate input form based on `kind`. dev-backend receives unified `POST /sets` payload with the discriminator field.

Both specialists post their stub against this contract before integration day.

---

## OUTPUT FORMAT (per dev-context rule)

After every task, each specialist outputs:

1. Summary of what changed and why
2. Files modified (with paths)
3. Change log entry for reporter-teacher
4. Blockers or decisions needing executive input

Append your change log entry to `dev-lead.md` "Recently completed" section. Coordinator will roll it up into the next exec status report.

---

## BLOCKERS / DECISIONS NEEDING EXEC INPUT

Carried over from the Health-Suite brief and still unresolved — these block dev-database from sealing the Phase B migration:

1. **Habit frequency options** — daily-only at Phase 2, or weekly + custom from day one? Recommendation: daily-only.
2. **Meditation logging** — manual entry only, or Apple Health / Google Fit auto-import? Significant scope difference.
3. **Wellbeing vs. Recovery tab** — naming decision pending exec-product-manager.

These are not blockers for the dev-database **first task** (initial schema migration) because the Health-Suite tables can be added in their already-spec'd form. They become blockers when Phase 2 UI work starts.

---

## FILES MODIFIED BY THIS RELAY

- `workflow-optimization/briefs/dev-roadmap-relay-2026-04-30.md` *(new — this file)*

## CHANGE LOG ENTRY

> `2026-04-30` — Workflow Coordinator relayed exec roadmap to dev team. Phase A (Qt sprint) and Phase B (production stack foundation) running in parallel. First tasks assigned to dev-frontend (TICKET-001 kg/lbs toggle), dev-database (initial Supabase migration), dev-backend (Express skeleton + auth + sets endpoints).
