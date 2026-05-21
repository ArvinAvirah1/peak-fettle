# Peak Fettle — Development Roadmap
**Date:** 2026-04-30
**From:** Executive Team (CEO, CTO, PM)
**To:** Dev Team — App Department + Web Department
**Status:** APPROVED for sequencing; phase gates require exec re-confirmation
**Anchor document:** `INSTRUCTIONS.md` (product spec)

---

## 1. Why this document exists

The product spec in `INSTRUCTIONS.md` describes the full Peak Fettle experience: tracking across all disciplines, cohort-matched percentiles, behavioral streaks, AI-generated adaptive plans, body composition guidance, and a free-tier with templates. Today, only the lifting tracking loop is partially live in a Qt 6.11 desktop prototype. This roadmap sequences the work to close the gap between the spec and what runs in users' hands without burning the solo-founder budget on premature scaling.

---

## 2. Where we are (state of the program, 2026-04-30)

**Built and working (Qt prototype):**
- Workout / Set / WorkoutTracker model with RIR effort notation (RPE deprecated)
- Best-of-day progress aggregation (one point per training day on graphs)
- Strength Score (0–1000 from Epley E1RM, asymptotic curve calibrated to 100 kg → ~600)
- Today banner and named-routine save flow on the tracker page

**Spec'd, not yet built:**
- Cardio tracking (splits, pace, consistency)
- Wilks/DOTS as alternative scoring to Peak Fettle Score
- Cohort-matched percentile engine (schema sketched, batch job and UI not started)
- Habit / streak system (rules defined, no make-up window or override flag in code)
- Free-tier static templates (PPL, Upper/Lower)
- Opening survey
- AI plan generation pipeline (Claude Haiku)
- Body composition goal feasibility logic
- React Native production app (Qt is the reference prototype only)
- Express backend (no API exists yet)
- Supabase schema and migration history (only the Health-Suite Phase 1 brief is greenlit)
- Web mirror / marketing site
- Wearable integration (explicitly future)

**Open tickets routed to current Qt sprint:**
TICKET-001 (kg/lbs toggle), TICKET-005 (guided onboarding), TICKET-007 (exercise search aliases), TICKET-008 (PR badges), TICKET-010 (mixed lift+cardio session).

**Active brief in flight:**
`workflow-optimization/briefs/health-suite-expansion-brief.md` — Phase 1 schema work (`daily_health_log`, `habits`) is greenlit, migration files not yet authored.

---

## 3. Phased plan (CEO sequencing rationale)

Five phases, gated. Each gate requires exec re-confirmation before unlocking the next. Phases A and B run in parallel across departments; Phases C–E are mostly serial because they depend on B's foundation.

### Phase A — Finish the Qt reference sprint (App Dept, ~2 weeks)
Close TICKET-001, -005, -007, -008, -010. The Qt prototype is the behavior reference for the production React Native build. Every behavior we leave ambiguous here becomes a re-litigation later. **Gate:** all five tickets merged + a clean build pass.

### Phase B — Production stack foundation (parallel — ~3–4 weeks)
Three tracks, all kick off simultaneously:
- **Database track** — Supabase project provisioned, initial schema migration covering users, exercises, workouts, sets, plans, streaks, percentile_vectors, plus the already-greenlit `daily_health_log` and `habits` tables. RLS policies on every user-scoped table.
- **Backend track** — Express skeleton, JWT auth (signup/login/refresh), and the `/sets`, `/workouts`, `/exercises` endpoints required to back the existing Qt UI semantics.
- **Web track** — React marketing site scaffold; one landing page, one waitlist form pointing at Resend.

**Gate:** Local end-to-end smoke test — sign up via API, log a set via API, read it back; landing page deployed.

### Phase C — React Native migration (App Dept, ~6–8 weeks)
Port the Qt reference behavior into React Native, wired to the Phase-B backend. PowerSync wired against Supabase Postgres for offline-first set logging. Scope is limited to the existing tracking loop — no new features in this phase. **Gate:** RN app reaches feature parity with Qt prototype (excluding desktop-only ergonomics) on iOS and Android.

### Phase D — MVP feature completion (~4–6 weeks)
The features that close the gap to `INSTRUCTIONS.md`:
- Cardio tracking model + UI
- Streak system with make-up window + emergency override
- Free-tier templates (PPL, Upper/Lower) seeded as plan rows
- Cohort percentile batch job (weekly cron, writes `percentile_vectors`) + percentile gauge UI
- Opening survey + AI plan generation via Claude Haiku, with response caching
- Body composition goal feasibility check (LLM-evaluated, user keeps final say)

**Gate:** All `INSTRUCTIONS.md` sections have at least a v1 implementation. Beta personas (casual gym-goer, competitive lifter, runner, beginner) can complete a full session-to-progress loop.

### Phase E — Beta and launch (~4 weeks)
Closed beta with the four persona testers, fix critical issues, encryption + RLS audit, App Store / Play Store submission. **Gate:** v1.0 in stores, North-Star metric instrumentation live in PostHog.

---

## 4. Department split

### App Department — owns
- Qt prototype maintenance through Phase A
- React Native iOS + Android app from Phase C onward
- All on-device behavior: offline sync conflict handling, PowerSync wiring, push notifications via FCM, in-session tracker performance
- Mobile-specific telemetry (PostHog mobile SDK, Sentry mobile)

### Web Department — owns
- React marketing site (one repo, separate from app)
- Web mirror of the app for users on Windows / browser (read-only progress views v1, full tracker v2)
- Resend-backed waitlist + transactional emails
- ASO landing copy in coordination with marketing

### Shared (Backend + Database — staffed by dev-backend and dev-database, consumed by both depts)
- Express API and Supabase schema
- Auth, percentile job, AI plan service
- Schema migration discipline — no raw production edits, ever

---

## 5. CTO technical guardrails (non-negotiables)

These hold across all phases and apply to both departments.

1. **Health data:** Encryption at rest (Supabase default) and in transit (TLS). Verify RLS on every user-scoped table at migration time, not later.
2. **Percentile rankings stay batch.** Weekly cron writes `percentile_vectors`. Do not "improve" this to real-time without a cost analysis approving the change.
3. **AI plan generation:** Claude Haiku 4.5, ~5,000–7,000 tokens/plan, ~2.5¢/plan target. Cache by survey-input hash. Do not retry-storm on transient API errors.
4. **Offline-first for logging.** All set logging must queue locally and sync when online. Gym connectivity is unreliable.
5. **Schema evolution discipline.** Every change is a migration file under `/migrations/` with a date-prefixed name. No raw schema edits in production.
6. **Units.** Persist all weights in **kg** in the model. Display-time conversion to lbs is the UI's job. Never round-trip through both units.
7. **Effort notation.** RIR is canonical (`rir == -1` not recorded, `rir == 0` taken to failure). Legacy `rpe` field is read-only.
8. **Build hygiene.** Run the dev-lead.md pre-build checklist before declaring any Qt ticket "compiles." MOC cache traps are well-documented and have already cost us a sprint.

---

## 6. PM acceptance criteria per phase

A phase only gets greenlit to the next once all of these are objectively true.

**Phase A done:**
- All five Qt tickets merged on `main`
- Clean build with no warnings on Qt 6.11
- Updated `dev-lead.md` "Recently completed" log entry
- A casual-gym-goer beta tester can complete a session end-to-end on the desktop prototype without reading docs

**Phase B done:**
- `supabase db push` runs cleanly against a fresh project
- Postman / curl smoke test: signup → login → POST `/workouts` → POST `/sets` → GET `/sets?from=…` returns the set
- Marketing site deployed at a public URL with a working waitlist form
- All three tracks have CI configured (lint + tests passing)

**Phase C done:**
- RN app installs on an iOS device and an Android device from a TestFlight / internal track
- A user can log a workout in airplane mode and see it sync when reconnected
- Visual regression: progress chart matches Qt reference within ±2 px tolerance

**Phase D done:**
- All `INSTRUCTIONS.md` sections answered with at least a v1 feature
- AI plan generation cost per plan measured and matches budget (≤3¢)
- Streak make-up window and override flag tested with the 4 beta personas
- Cohort percentile batch job has run twice on real data without failures

**Phase E done:**
- v1.0 live in the App Store and Google Play
- PostHog dashboards show DAU, weekly retention, and the North-Star cohort metric
- Sentry crash-free sessions ≥99.5% over the first week post-launch

---

## 7. Risks the execs are watching

| Risk | Owner | Mitigation |
|---|---|---|
| AI plan quality not meeting paid-tier expectations | PM + CTO | Side-by-side eval against published programs; iterate prompt before public paid launch |
| RN port introduces regressions vs. Qt reference | CTO | Behavioral test fixtures captured from Qt prototype; replay against RN |
| Strava or Hevy ships cohort percentiles first | CEO | Phase D gate prioritizes percentile UI even if other features slip |
| Solo founder bandwidth | CEO | Phases gated, not stacked. Marketing budget held back until D is greenlit |
| Schema-debt from skipping Phase B foundation | CTO | Hard rule: no Phase C work begins until Phase B gate passes |

---

## 8. What the execs need from the dev team

1. **Workflow Coordinator** translates this roadmap into a per-discipline directive document (next-task assignments) following the format of `workflow-optimization/briefs/health-suite-expansion-brief.md`. Land it under `workflow-optimization/briefs/` and notify dev-lead.
2. **dev-lead** confirms Phase A ticket order and reports any new blockers within 48h.
3. **dev-database, dev-backend, dev-frontend** each pick up their first task from the relayed directive and produce a v1 artifact this sprint.
4. **Open exec-decision items** still pending from the Health-Suite brief — habit frequency options (daily-only?), meditation logging mode (manual vs. Apple Health import), and "Wellbeing" vs. "Recovery" tab name — should be cleared this week so dev-database isn't blocked when Phase B database work begins.

---

## 9. Sign-off

- **CEO:** Sequencing prioritizes time-to-PMF over feature completeness. Phase gates protect us from over-engineering before product-market fit.
- **CTO:** Tech stack and guardrails are unchanged from the Tech Stack memo. Migration discipline is the single biggest risk; treat it as such.
- **PM:** Ticket ordering is impact-vs-effort first, dependency second. Anything not listed here is explicitly out of scope until a phase gate opens.
