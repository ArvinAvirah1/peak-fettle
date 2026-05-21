# Peak Fettle — Development Roadmap (v2)
**Date:** 2026-05-01
**From:** Executive Team — exec-ceo, exec-cto, exec-product-manager
**To:** Dev Team — App Department + Web Department (relayed via Workflow Coordinator)
**Status:** APPROVED — supersedes `DEV_ROADMAP_2026-04-30.md` and folds in the Beta Round 1 update brief
**Anchor document:** `INSTRUCTIONS.md` (product spec)
**Companion brief:** `workflow-optimization/briefs/beta-round1-roadmap-update-2026-05-01.md`

---

## 1. Why this revision exists

The 2026-04-30 roadmap correctly sequenced phases A–E but predated Beta Round 1 results. The beta surfaced three P1 tickets (TICKET-002, -003, -004) absent from the original Phase A sprint. The Workflow Coordinator's 2026-05-01 update brief recommended adding all three to Phase A; execs concur. This v2 roadmap is the single source of truth — the dev team should work from the relay file produced from this document, not from the 04-30 version.

Two facts also moved during the 24h since v1: TICKET-001 shipped (kg/lbs toggle), and Phase B's first tasks (initial Supabase migration, Express skeleton + auth + sets/workouts endpoints) closed. The remaining work in each phase is therefore narrower than v1 implied.

---

## 2. State of the program (audit, 2026-05-01)

This audit checks INSTRUCTIONS.md against what is actually in the repo.

### Built and shipping

- **Lifting tracker (Qt 6.11 prototype)** — Workout/Set/WorkoutTracker model with RIR notation; best-of-day progress aggregation; Strength Score 0–1000 (Epley E1RM, k=0.00916); today banner; named-routine save flow; recent-sets list with edit dialog; backdated logging with preset chips.
- **TICKET-001 — kg/lbs display toggle** — `UnitPreference` singleton, `WeightLabel` component, SettingsPage segmented control. Persisted via QSettings. Storage canonical kg.
- **TICKET-002 — RIR field UX (in code)** — `EffortPreference` singleton with `rir`/`off` modes, SettingsPage toggle, conditional visibility on SetTrackerPage and EditSetDialog, "(optional)" labels and inline tooltip. *Not yet logged in dev-lead.md "Recently completed" — coordinator to chase.*
- **Templates / routines strip** — pre-seeded PPL + Upper/Lower templates plus user routines surface on the tracker page. Save-as-routine dialog ships.
- **Production stack foundation (Phase B first tasks)** —
  - `migrations/20260430_initial_schema.sql` — users, exercises, workouts, sets, plans, streaks, percentile_vectors. UUID PKs, timestamps, RLS.
  - `migrations/20260430_add_daily_health_log.sql`, `migrations/20260430_add_habits.sql` — Health-Suite Phase 1 tables.
  - `peak-fettle-agents/server/` — Express skeleton with helmet + CORS, JWT auth (signup/login/refresh), `POST /workouts`, `POST /sets`, `GET /sets`. Centralized error handler. JWT middleware on protected routes.

### Spec'd, not yet built

- **TICKET-003** — "My Routines" home-screen section (4/6 testers couldn't find current save flow — needs a discoverable surface).
- **TICKET-004** — "Start Workout" CTA prominence on the home surface (3/6 testers had material friction finding it).
- **TICKET-005** — ✅ Guided onboarding first-session flow (3-step wizard, 2026-05-02).
- **TICKET-007** — ✅ Exercise search synonyms/aliases (2026-05-02): `exercise_aliases` table + `/exercises/search` backend done; `ExerciseLibrary::searchDetailed()` added to Qt prototype with ~80 aliases; `ExercisePickerDialog` shows "also: OHP" hint on alias-matched results.
- **TICKET-008** — ✅ PR detection + badge (2026-05-02).
- **TICKET-010** — ✅ Mixed lift+cardio in one session (2026-05-02): Set.kind discriminant, logCardioSet/logCardioSetAt API, Lift/Cardio toggle UI in SetTrackerPage, cardio-aware recent sets delegate.
- Cardio tracking model + UI (cardio set kind exists in the contract; ✅ basic prototype wired — full Phase D scope covers pace zones, GPS import, etc.).
- Wilks/DOTS as alternative scoring to Peak Fettle Score.
- Cohort percentile batch job (cron stub queued; logic absent).
- Habit / streak system (rules in spec, no make-up window or override flag in code).
- Free-tier static templates beyond the two surfaced (full PPL day variants, Upper/Lower variants).
- Opening survey + AI plan generation (Claude Haiku 4.5).
- Body composition feasibility logic.
- React Native production app (Qt is the reference prototype).
- Web mirror / marketing site (waitlist scaffold not yet built).
- Wearable integration (explicitly future).

### Open exec-decision items still pending

Carried over from the Health-Suite brief — these unblock dev-database when Phase D health-suite UI work begins. Not blockers right now.

1. Habit frequency options — daily-only at Phase 2, or weekly + custom from day one? Recommendation: daily-only.
2. Meditation logging — manual entry only, or Apple Health / Google Fit auto-import?
3. "Wellbeing" vs. "Recovery" tab name — pending exec-product-manager.

---

## 3. Phased plan (v2)

Five phases, gated. Phases A and B run in parallel until both close; C–E are mostly serial because they depend on B.

### Phase A — Qt reference sprint, revised scope (App Dept, ~2 weeks)

Eight tickets total. TICKET-001 ✅ closed. TICKET-002 effectively done in code; coordinator adds change-log entry. The remaining six are open.

| # | Ticket | Owner(s) | Status |
|---|---|---|---|
| 1 | TICKET-001 — kg/lbs toggle | dev-frontend + dev-backend | ✅ closed 2026-05-01 |
| 2 | TICKET-002 — RIR label UX | dev-frontend | ✅ closed 2026-05-02 (change-log entry added) |
| 3 | TICKET-003 — My Routines home section | dev-frontend | ✅ closed 2026-05-02 |
| 4 | TICKET-004 — Start Workout CTA prominence | dev-frontend | ✅ closed 2026-05-02 |
| 5 | TICKET-005 — Guided onboarding flow | dev-frontend | ✅ closed 2026-05-02 |
| 6 | TICKET-007 — Exercise search aliases | dev-database + dev-backend + dev-frontend | ✅ closed 2026-05-02 |
| 7 | TICKET-008 — PR badges | dev-frontend + dev-backend | ✅ closed 2026-05-02 |
| 8 | TICKET-010 — Mixed lift+cardio session | dev-frontend + dev-backend | ✅ closed 2026-05-02 |

**Phase A gate (revised):** All 8 tickets merged on `main` + clean Qt 6.11 build + casual gym-goer beta tester completes a session end-to-end on the desktop prototype (open app, find Start Workout, log a session, save as routine, return to it) without docs.

### Phase B — Production stack foundation (parallel, ~3–4 weeks)

| Track | Status | Remaining |
|---|---|---|
| Database | ✅ first task closed | ✅ Exercise library seed (2026-05-02): ~160 exercises + ~100 aliases in `migrations/20260502_seed_exercise_library.sql`; `exercise_aliases` table ✅ (was in initial schema) |
| Backend | ✅ first task closed | ✅ `GET /exercises/search` (alias-aware, scored) + `GET /exercises` — `server/routes/exercises.js` (2026-05-02) · ✅ `/plans` CRUD — `server/routes/plans.js` (2026-05-02) · ✅ Percentile cron stub — `server/cron/percentile.js` (2026-05-02) |
| Web | 🔲 not started | ✅ Next.js 14 scaffold created in `marketing-site/` (2026-05-02): landing page, waitlist form, Resend API route, Vercel config. **TODO: deploy to Vercel, set env vars, verify Lighthouse ≥90.** |

**Phase B gate (unchanged):** signup → login → POST /workouts → POST /sets → GET /sets smoke test passes; marketing site live at a public URL with working waitlist; CI green on lint + tests across all three tracks.

### Phase C — React Native migration (App Dept, ~6–8 weeks) — unchanged

Port Qt reference behavior to RN; PowerSync against Supabase; offline-first set logging. Scope strictly limited to existing tracking loop. Per beta brief, **TICKET-006 (Android transition lag) is a Phase C acceptance criterion, not Phase D** — measure during the port, not after.

**Gate:** RN app reaches Qt parity on iOS + Android, installs from TestFlight / internal track, airplane-mode log syncs on reconnect, progress chart visual regression within ±2 px of Qt reference.

### Phase D — MVP feature completion (~4–6 weeks) — unchanged with two pickups

Adds the gap to INSTRUCTIONS.md. P2 tickets routed here:

- Cardio tracking model + UI (full).
- Streak system with make-up window + emergency override.
- Free-tier templates (full PPL/Upper-Lower variants seeded as plan rows).
- Cohort percentile batch job (weekly cron, writes `percentile_vectors`) + percentile gauge UI.
- **TICKET-009** — "Progress vs. Self" view for opt-out + low-percentile users.
- **TICKET-011** — Exercise swap without history loss.
- Opening survey + AI plan generation (Claude Haiku 4.5; cache by survey-input hash).
- Body composition feasibility check (LLM-evaluated; user keeps final say).

**Gate:** every INSTRUCTIONS.md section has a v1 implementation; AI plan cost ≤3¢ measured; streak make-up + override tested with all four beta personas; percentile cron has run twice on real data.

### Phase E — Beta + launch (~4 weeks) — unchanged

Closed beta with the four persona testers; encryption + RLS audit; App Store + Play Store submission. **Gate:** v1.0 in stores; PostHog dashboards live (DAU, weekly retention, North-Star cohort metric); Sentry crash-free sessions ≥99.5% over the first launch week.

---

## 4. Department split (this is the deliverable to web + app departments)

### App Department

Owns the Qt prototype through Phase A, then the React Native iOS + Android app from Phase C. On-device behavior is theirs end-to-end: offline sync conflict handling (PowerSync), in-session tracker performance, push notifications via FCM, mobile telemetry (PostHog mobile SDK + Sentry mobile).

**Phase A scope owned by App Dept:** TICKET-002 (close out the change-log entry), TICKET-003, TICKET-004, TICKET-005, TICKET-007 (UI surface), TICKET-008 (UI badge), TICKET-010 (UI for mixed sessions).

**Phase C scope:** the entire Qt → RN port. The work-product is "everything the user touches" on iOS + Android.

### Web Department

Owns the React marketing site (separate repo from the app), the web mirror of the app for users on Windows / browser (read-only progress views in v1, full tracker in v2), Resend-backed waitlist + transactional emails, and ASO landing copy with marketing.

**Phase B scope owned by Web Dept:** marketing site scaffold + waitlist form, deployed at a public URL with Lighthouse ≥90.

**Phase D / E scope:** web mirror v1 (read-only progress), then v2 (full tracker).

### Shared services (consumed by both departments)

dev-backend and dev-database staff Express + Supabase. Both departments consume the API. Schema migration discipline is non-negotiable — every change is a migration file under `/migrations/` with a date prefix; no raw production edits.

---

## 5. CTO technical guardrails (carried over, unchanged)

These hold across all phases and apply to both departments.

1. **Health data:** Encryption at rest (Supabase default) and in transit (TLS). Verify RLS on every user-scoped table at migration time.
2. **Percentile rankings stay batch.** Weekly cron writes `percentile_vectors`. Do not "improve" to real-time without a cost analysis approving the change.
3. **AI plan generation:** Claude Haiku 4.5, ~5,000–7,000 tokens/plan, ~2.5¢/plan target. Cache by survey-input hash. No retry-storms on transient API errors.
4. **Offline-first for logging.** All set logging queues locally and syncs when online. Gym connectivity is unreliable.
5. **Schema evolution discipline.** Date-prefixed migration files only. Never edit production schema directly.
6. **Units.** Persist all weights in **kg** in the model. Display-time conversion to lbs is the UI's job. Never round-trip both units.
7. **Effort notation.** RIR is canonical (`rir == -1` not recorded, `rir == 0` taken to failure). Legacy `rpe` is read-only.
8. **Build hygiene.** Run the dev-lead.md pre-build checklist before declaring a Qt ticket "compiles." Stale MOC cache cost a sprint already.

---

## 6. PM acceptance criteria per phase (refreshed)

A phase only gets greenlit to the next once all of these are objectively true.

**Phase A done:** all 8 tickets merged on `main`; clean Qt 6.11 build; updated `dev-lead.md` "Recently completed" log entry per ticket; casual gym-goer can complete a session end-to-end on the desktop prototype without reading docs.

**Phase B done:** `supabase db push` runs cleanly against a fresh project; `signup → login → POST /workouts → POST /sets → GET /sets?from=…` smoke test passes; marketing site deployed at a public URL with a working waitlist; CI configured for lint + tests across all three tracks.

**Phase C done:** RN app installs on iOS + Android via TestFlight / internal track; user can log in airplane mode and sync on reconnect; progress chart matches Qt reference within ±2 px; **Android transition lag profiled and < 100ms before animation begins**.

**Phase D done:** every INSTRUCTIONS.md section has a v1 implementation; AI plan cost per plan ≤3¢ measured; streak make-up + override tested across all 4 beta personas; cohort percentile batch job ran twice on real data without failures.

**Phase E done:** v1.0 in App Store + Google Play; PostHog dashboards show DAU, weekly retention, North-Star cohort metric; Sentry crash-free sessions ≥99.5% over the first week post-launch.

---

## 7. Risks the execs are watching (unchanged from v1)

| Risk | Owner | Mitigation |
|---|---|---|
| AI plan quality not meeting paid-tier expectations | PM + CTO | Side-by-side eval against published programs; iterate prompt before public paid launch |
| RN port introduces regressions vs. Qt reference | CTO | Behavioral test fixtures captured from Qt prototype; replay against RN |
| Strava or Hevy ships cohort percentiles first | CEO | Phase D gate prioritizes percentile UI even if other features slip |
| Solo founder bandwidth | CEO | Phases gated, not stacked. Marketing budget held back until D is greenlit |
| Schema-debt from skipping Phase B foundation | CTO | Hard rule: no Phase C work begins until Phase B gate passes |

---

## 8. What the execs need from the dev team (next 48h)

1. **Workflow Coordinator** translates this v2 roadmap into a per-discipline directive document. Land it under `workflow-optimization/briefs/` and notify dev-lead. Format: same as `dev-roadmap-relay-2026-04-30.md`.
2. **dev-lead** appends the missing TICKET-002 change-log entry to `dev-lead.md` "Recently completed (2026-05-01)" so the next exec status report rolls up cleanly.
3. **dev-frontend, dev-backend, dev-database** each pick up their next-task per the relay and ship a v1 artifact this sprint.
4. **Open Health-Suite exec decisions** (habit frequency, meditation logging mode, Wellbeing vs. Recovery name) — clear this week.

---

## 9. Sign-off

- **CEO:** Sequencing still prioritizes time-to-PMF over feature completeness. Phase A revised scope reflects beta tester reality, not feature creep — three of the additions are pure UI fixes on existing data contracts.
- **CTO:** Tech stack and guardrails unchanged from the Tech Stack memo. Migration discipline remains the single biggest risk; treat it as such.
- **PM:** Ticket ordering is impact-vs-effort first, dependency second. TICKET-003 + TICKET-004 share a file surface and ship together. Anything not listed here is explicitly out of scope until a phase gate opens.
