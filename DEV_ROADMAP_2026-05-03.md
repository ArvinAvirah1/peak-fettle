# Peak Fettle — Development Roadmap (v4)
**Date:** 2026-05-03
**From:** Executive Team — exec-ceo, exec-cto, exec-product-manager
**To:** Dev Team — App Department + Web Department (relayed via Workflow Coordinator)
**Status:** APPROVED — supersedes `DEV_ROADMAP_2026-05-02.md`
**Anchor document:** `INSTRUCTIONS.md` (product spec)
**Beta source:** `pf-tester-feedback-2026-05-02.md` (builds on `pf-beta-feedback-2026-05-01.md`)

---

## 1. Why this revision exists

The v3 roadmap (2026-05-02) was written after Beta Round 2. This v4 revision incorporates the 2026-05-02 automated tester run, which surfaced 15 new issues (N-01 through N-15) across the Qt/QML layer, Express backend, and Supabase migrations. All v3 content is preserved; this is an additive revision.

**Two changes of immediate consequence:**

1. **T-01, T-02, T-03 remain unresolved.** These were P0 in v3 and are still P0. Zero progress was made on the security sprint items in the 2026-05-01 code push. The Phase B gate cannot open until they close.

2. **Phase A has three new critical items (N-01, N-02, N-03)** that should be treated as same-sprint work alongside the open Phase A tickets. All three are small, localized fixes — none requires more than 30 minutes of dev time. They affect the credibility and correctness of the core workout-logging surface and should not be deferred.

---

## 2. State of the program (audit, 2026-05-03)

### Completed (carried from v3)

- ✅ TICKET-001 — kg/lbs toggle (shipped)
- ✅ TICKET-002 — RIR field UX (in code; change-log entry still owed from dev-lead)
- ✅ Phase B first tasks — migrations, Express skeleton, JWT auth, workouts + sets endpoints

### Issue tracker: all open items, unified

The table below merges all prior-open issues (T-series) with new issues from the 2026-05-02 run (N-series), ranked by severity. This is the master list for sprint planning.

| Rank | ID | Category | Description | Severity | Phase |
|------|----|----------|-------------|----------|-------|
| 1 | T-01 | Security | `requireAuth` accepts refresh tokens as access tokens — 30-day auth bypass | 🔴 P0 | B-0 |
| 2 | T-03 | Security | POST /sets does not verify workout ownership — horizontal privilege escalation | 🔴 P0 | B-0 |
| 3 | T-02 | Security | No refresh token revocation or logout endpoint — stolen token valid 30 days | 🔴 P0 | B-0 |
| 4 | N-11 | Security | No rate limiting on /auth/login and /auth/signup — brute force + email enumeration | 🔴 HIGH | B-0 |
| 5 | N-03 | Calculation | E1RM formula inflates 1-rep maxes by 3.3% — credibility issue with powerlifters | 🔴 HIGH | A |
| 6 | T-04 | Backend | POST /workouts returns 201 on upsert UPDATE — breaks client cache/optimistic UI | 🟠 HIGH | B-1 |
| 7 | T-07 | Backend | No /exercises endpoint — sets API non-functional from any non-Qt client | 🟠 HIGH | B-1 |
| 8 | N-01 | Qt/QML | EditSetDialog uses SpinBoxes for date/time — regression of SetTrackerPage fix | 🟠 HIGH | A |
| 9 | N-02 | Qt/C++ | Set constructor bypasses RIR clamping — dirty data can enter the model | 🟠 HIGH | A |
| 10 | N-07 | Database | `compute_percentile_batch` references undefined view `v_user_lift_inputs` | 🟠 HIGH | D |
| 11 | T-08 | Backend | GET /sets hardcoded LIMIT 1000 — power users hit ceiling in ~10 weeks | 🟠 MEDIUM | B-1 |
| 12 | N-04 | Qt/C++ | 14 exercises appear twice in ExercisePickerDialog browse mode (cross-category dups) | 🟠 MEDIUM | A |
| 13 | N-06 | Qt/C++ | Renamed exercises leave empty ghost buckets in exerciseNames() forever | 🟠 MEDIUM | A |
| 14 | N-08 | Database | lift_vectors seed + percentile SQL not in migrations/ — skipped on db push and db reset | 🟠 MEDIUM | B-1 |
| 15 | N-09 | Database | daily_health_log and habits defined in both initial_schema and separate migrations — trigger conflict | 🟠 MEDIUM | B-1 |
| 16 | N-10 | Database | pg_trgm extension not created in migration — trgm index absent, degrades TICKET-007 search quality | 🟠 MEDIUM | B-1 |
| 17 | N-12 | Backend | CORS defaults to `*` if WEB_ORIGIN env var unset — removes origin protection in production | 🟠 MEDIUM | B-0 |
| 18 | T-05 | Frontend | Landing notify form accepts malformed emails — garbage enters waitlist | 🟡 MEDIUM | B-2 |
| 19 | T-06 | Frontend | Free tier shows 2 templates in copy vs. 3 in SVG illustration | 🟡 MEDIUM | B-2 |
| 20 | N-05 | Qt/QML | ExercisePickerDialog rebuilds full list on every keystroke — no debounce | 🟡 MEDIUM | A |
| 21 | N-13 | Backend | No DELETE /sets or DELETE /workouts endpoints | 🟡 MEDIUM | B-1 |
| 22 | N-14 | Qt/QML | Backdated form does not reset date after logging — silent multi-set backdating | 🟡 LOW | A |
| 23 | N-15 | Qt/C++ | Exercise name has no max length — overflow risk at backend layer | 🟡 LOW | A |
| 24 | T-09 | Frontend | Smooth scroll offset 60px vs. 72px nav — first line of every section hides under navbar | 🟡 LOW | B-2 |
| 25 | T-12 | Frontend | Mobile menu display:none blocks opacity transition — snaps open | 🟡 LOW | B-2 |
| 26 | T-10 | Accessibility | Mobile menu missing aria-modal + focus trap — WCAG 2.1 failure | 🟡 LOW | B-2 |
| 27 | T-11 | Frontend | Stat chip CSS + countUp JS with no HTML elements — dead code | 🟡 LOW | B-2 |

**2026-05-03 sprint status (closed this session):**
- ✅ T-01: JWT type check — already in code (confirmed)
- ✅ T-02: logout + token revocation — already in code (confirmed)
- ✅ T-03: workout ownership check — already in code (confirmed)
- ✅ N-11: rate limiting applied to /auth/* routes in index.js
- ✅ N-12: CORS whitelist replaces `|| '*'` fallback
- ✅ N-03: E1RM `reps > 0` → `reps > 1` in workouttracker.cpp (2 sites)
- ✅ N-01: EditSetDialog SpinBoxes → inputMask text fields
- ✅ N-02: Set constructor RIR clamp — already in code (confirmed via std::clamp)
- ✅ N-04: ExerciseLibrary.grouped() dedup with seen-set
- ✅ N-05: ExercisePickerDialog 180ms debounce Timer
- ✅ N-06: editSet() ghost bucket cleanup after rename
- ✅ N-14: backdated form resets to now after logging
- ✅ N-15: exercise name 100-char guard in logSetAt() + DB CHECK constraint
- ✅ N-08: percentile_engine.sql DELETE→UPSERT idempotency
- ✅ N-09: daily_health_log/habits removed from initial_schema; add_* files are sole source
- ✅ N-10: pg_trgm extension added to initial_schema

**Still open after 2026-05-03 session 1:** T-04, T-05, T-06, T-07 (already had /exercises endpoint), T-08 (already fixed with cursor pagination), T-09, T-10, T-11, T-12, N-07 (Phase D), N-13

**Closed in 2026-05-03 session 2:**
- ✅ T-04: xmax trick already in workouts.js (confirmed)
- ✅ N-13: DELETE /sets/:id + DELETE /workouts/:id with ownership check
- ✅ T-05: WaitlistForm.tsx — noValidate removed, client-side regex guard added
- ✅ T-06: resolved by Next.js migration (no SVG/template count in page.tsx)
- ✅ T-09: scroll-margin-top: 76px on #features + #waitlist in globals.css
- ✅ T-10: Nav.tsx — role=dialog + aria-modal + focus trap + Escape handler
- ✅ T-11: resolved by Next.js migration (no stat chip dead code)
- ✅ T-12: Nav.module.css — visibility/opacity animation replaces display:none
- ✅ N-07: migrations/20260503_lift_inputs_view.sql created; percentile_engine.sql E1RM guardrail synced

**Remaining open (all in Phase B gate or Phase D):** deploy marketing site to Vercel; CI lint+test; clean Qt 6.11 build.

---

## 3. Phased plan (v4)

### Phase A — Qt reference sprint (App Dept) — **scope expanded with 3 critical + 5 standard fixes**

Phase A is the active sprint. Three new items (N-01, N-02, N-03) are added as P1 work to be completed alongside the existing open tickets. They are small, isolated fixes and should not extend the sprint timeline meaningfully.

#### Phase A open tickets (carried from v3)

| # | Ticket | Owner | Status |
|---|--------|-------|--------|
| 1 | TICKET-001 — kg/lbs toggle | dev-frontend + dev-backend | ✅ closed |
| 2 | TICKET-002 — RIR label UX | dev-frontend | ✅ in code; change-log entry owed |
| 3 | TICKET-003 — My Routines home section | dev-frontend | 🔲 open |
| 4 | TICKET-004 — Start Workout CTA prominence | dev-frontend | 🔲 open |
| 5 | TICKET-005 — Guided onboarding flow | dev-frontend | 🔲 open |
| 6 | TICKET-007 — Exercise search aliases (Qt surface only) | dev-frontend | 🔲 open |
| 7 | TICKET-008 — PR badges | dev-frontend + dev-backend | 🔲 open |
| 8 | TICKET-010 — Mixed lift+cardio session | dev-frontend + dev-backend | 🔲 open |

#### New Phase A items from 2026-05-02 tester run

| # | ID | Fix | File(s) | Action |
|---|-----|-----|---------|--------|
| A-1 | N-03 | E1RM 1-rep max inflation | `src/workouttracker.cpp` (`progressSeries`, `exerciseStats`) | Change branch condition from `reps > 0` to `reps <= 1` → return `weightKg` directly when reps ≤ 1, no multiplier. This is a one-line change. **Communicate to beta testers:** E1RM for logged singles will revise downward to the actual lifted weight. |
| A-2 | N-01 | EditSetDialog SpinBox regression | `qml/EditSetDialog.qml` | Replace SpinBox for all five date/time fields (year, month, day, hour, minute) with text fields using `inputMask`, matching the pattern already used in `SetTrackerPage.qml`. Consider extracting a shared `DateTimeEditor` component to prevent recurrence. Add phone-width test to TICKET-004 acceptance criteria. |
| A-3 | N-02 | Set constructor bypasses RIR clamp | `src/set.cpp` | In the parameterised constructor `Set(name, weightKg, reps, rir, ts)`, replace direct initialisation `m_rir(rir)` with `m_rir(qBound(-1, rir, 10))`. Zero functional risk. |
| A-4 | N-04 | Duplicate exercises in browse mode | `src/ExerciseLibrary.cpp` | Deduplicate within `grouped()` using a seen-set, or deduplicate `m_byCategory` buckets during `seed()` after applying the same seen-set that de-dupes `m_all`. If cross-category listing is intentional, display a light "also in: [Category]" tag rather than showing the exercise twice. |
| A-5 | N-05 | No debounce on exercise search | `qml/ExercisePickerDialog.qml` | Add a 150–200ms debounce Timer before calling `rebuildModel()`. Standard QML pattern: `Timer { id: searchDebounce; interval: 180; onTriggered: dialog.rebuildModel() }` with `onTextChanged: searchDebounce.restart()`. Critical pre-condition for TICKET-007 backend fuzzy search. |
| A-6 | N-06 | Ghost exercise buckets after rename | `src/workouttracker.cpp` (`editSet`) | After detaching a Set from its old exercise in `editSet()`, check `if (oldExercise->setCount() == 0)` and if so, remove it from `m_exercises` and delete it. Prevents phantom entries from accumulating in exercise name selectors and progress graph. |
| A-7 | N-14 | Backdated form silent multi-set backdating | `qml/SetTrackerPage.qml` | After each set is logged in backdate mode, consider resetting `logUseNow = true` with a confirmation chip: "Last set backdated to [date] — continue backdating?" Matches iOS Health out-of-order data entry pattern. Mark as optional UX polish if sprint is time-constrained. |
| A-8 | N-15 | No exercise name max length | `src/workouttracker.cpp` (`logSetAt`) | Add a length cap in `logSetAt`: reject names beyond 100 characters with an appropriate error return. Add a corresponding `CHECK (length(name) <= 100)` constraint to the `exercises.name` column in the initial migration. |

**Phase A gate (updated):** All 8 Phase A tickets merged on `main`; N-01, N-02, N-03 fixed and verified; clean Qt 6.11 build; dev-lead.md "Recently completed" updated per ticket; casual gym-goer completes a session end-to-end on desktop prototype without docs; no SpinBox date/time fields in EditSetDialog; E1RM for a 200 kg single displays exactly 200 kg.

---

### Phase B — Production stack (parallel, ~3–4 weeks) — **scope updated**

Phase B absorbs the P0 security items, all backend/database gaps from prior runs, and landing page fixes. T-01, T-02, and T-03 remain entirely unresolved. No shared environment may be opened to external testers until they are closed.

#### B-0: Security (dev-backend) — **P0, must close before any external exposure**

Four security items now sit in B-0. T-01, T-02, T-03 are carried from v3 unchanged. N-11 and N-12 are new additions from the 2026-05-02 run.

| Fix | ID | File(s) | Action |
|-----|----|---------|--------|
| JWT type check | T-01 | `server/middleware/requireAuth.js` | Add `if (payload.type === 'refresh') return res.status(401).json(...)`. Single line. Alternatively: use a separate signing secret for refresh tokens and document both in the server README. |
| Token revocation + logout | T-02 | `server/routes/auth.js` + new migration | Add `refresh_tokens` table (token_hash, user_id, expires_at). Store hash on issue; DELETE on logout. Add `POST /auth/logout` endpoint. |
| Workout ownership check | T-03 | `server/routes/sets.js` | Before inserting a set: `SELECT id FROM workouts WHERE id = $1 AND user_id = $2`. Return 403 if not found. |
| Rate limiting on auth routes | N-11 | `server/index.js` (or auth router) | `express-rate-limit` is already installed — it is simply not applied. Add: `const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }); app.use('/auth', authLimiter, authRoutes);` |
| CORS production hardening | N-12 | `server/index.js` | Replace `process.env.WEB_ORIGIN \|\| '*'` with a whitelist that defaults to `['http://localhost:3000']` in development and fails loudly if `WEB_ORIGIN` is unset in a non-development environment. |

B-0 is still the smallest diff-surface of the entire sprint. T-01 is a single conditional. T-03 is one SELECT before an INSERT. N-11 is five lines. All five items can be landed in a single afternoon. They are the prerequisite to merging any other Phase B work into a shared environment.

#### B-1: Backend + database gaps (dev-backend + dev-database)

New items from the 2026-05-02 run (N-07, N-08, N-09, N-10, N-13) are added alongside the prior open items.

| Task | ID | Notes |
|------|-----|-------|
| `GET/POST /exercises` endpoint | T-07 | Required for the sets API to function from any non-Qt client. Include name, category, muscle groups. Seed with ~150 lifts + cardio types. |
| `POST /workouts` status code | T-04 | Add `(xmax = 0) AS inserted` to RETURNING clause; return 200 on update, 201 on create. |
| Pagination on `GET /sets` | T-08 | Cursor-based via `logged_at`. Drop the hardcoded LIMIT 1000. Accept `?cursor=` and `?limit=` params (default 50). |
| `exercise_aliases` table | — | Required for TICKET-007. Add in migration; wire to `/exercises/search`. |
| `DELETE /sets/:id` and `DELETE /workouts/:id` | N-13 | Verify ownership via `WHERE id = $1 AND user_id = $2` before deleting. Required for React Native phase. |
| Move percentile + lift_vectors into migrations/ | N-08 | Move `compute_percentile.sql` and `lift_vectors_seed.sql` to `migrations/` with date prefix (`20260502_compute_percentile.sql`, `20260502_lift_vectors_seed.sql`). Replace the `DELETE FROM lift_vectors WHERE model_version = 1` with `INSERT ... ON CONFLICT DO UPDATE` for idempotency. Update Phase B gate to include these migrations. |
| Resolve migration schema duplication | N-09 | Remove `daily_health_log` and `habits` blocks from `20260430_initial_schema.sql` and treat the separate `add_daily_health_log` and `add_habits` migration files as the sole source of truth. Or vice versa — either way, the tables must not be defined in two places. |
| Add pg_trgm extension to migration | N-10 | Add `CREATE EXTENSION IF NOT EXISTS pg_trgm;` immediately after `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` in `20260430_initial_schema.sql`. Without this, the trgm GIN index is absent and TICKET-007 fuzzy search degrades silently to exact ILIKE matching. |
| `/plans` skeleton | — | CRUD only; no AI logic yet. |
| Percentile cron stub | — | Scheduled placeholder only. |
| `v_user_lift_inputs` view design | N-07 | The `compute_percentile_batch()` function references this view, which does not exist anywhere in the repo. Define the schema for aggregating best-1RM-per-exercise-per-user, then create `migrations/20260503_lift_inputs_view.sql`. This is a Phase D prerequisite — add it as an explicit Phase D gating item so the batch job cannot be declared working until its dependency exists. |

#### B-2: Web / landing page (Web Dept + dev-backend)

No new items. All items are carried from v3 unchanged.

| Task | ID | Notes |
|------|-----|-------|
| Signup / waitlist CTA | — | Replace "Start Free" / "Find your fettle" with links to a real form or app store. Highest acquisition priority. |
| Email validation on notify form | T-05 | Use `input.checkValidity()`. Reject partial addresses before they enter the waitlist. |
| Template count fix | T-06 | Remove "Full Body 3x" from the Free Tier SVG, or add it to the copy. Align to INSTRUCTIONS.md (2 templates). |
| Scroll offset | T-09 | Change `60` → `76` in the scroll handler, or read nav height dynamically. |
| Mobile menu animation | T-12 | Replace `display: none / flex` with `visibility: hidden` + `pointer-events: none`. |
| Accessibility: focus trap | T-10 | Add `aria-modal="true"` to `.mobile-menu`. Implement Tab/Shift+Tab focus trap. |
| Stat chips dead code | T-11 | Add real `.chip` elements to the hero, or delete the `.stat-chips` CSS and `countUp()` JS. |
| Beginner entry point | — | "New to fitness? Start here" path or secondary CTA. Inline definitions for 1RM, PPL, progressive overload on first use. |
| Runner value prop | — | Surface cohort percentiles in a running context on landing. Elevate Garmin/wearable roadmap note to a visible callout. |
| React marketing site scaffold | — | Separate repo; waitlist form wired to Resend; Vercel deploy; Lighthouse ≥90. |

**Phase B gate (updated from v3):** T-01, T-02, T-03, N-11, N-12 all closed and reviewed; `supabase db push` runs cleanly on a fresh project (including the relocated N-08 migrations and the N-10 pg_trgm extension); `signup → login → POST /workouts → POST /sets → GET /sets?cursor=` smoke test passes; `/exercises` endpoint returns seeded data; no schema duplication between initial_schema and add_* files (N-09); marketing site live at public URL with working, validating waitlist form; CI green on lint + tests.

---

### Phase C — React Native migration (~6–8 weeks) — unchanged

Port Qt reference to RN + PowerSync + Supabase offline-first. Scope strictly limited to parity with Phase A tracker. DELETE endpoints (N-13) must be live before Phase C ships, since RN users need to be able to remove incorrect data.

**Phase C gate:** RN app on iOS + Android via TestFlight/internal track; airplane-mode logging syncs on reconnect; progress chart within ±2 px of Qt reference; Android transition lag < 100ms before animation begins.

---

### Phase D — MVP feature completion (~4–6 weeks) — one addition

All v3 Phase D items are unchanged. One item is added:

- **`v_user_lift_inputs` view** (N-07): Creating this view is a Phase D gate item, not just a note. The percentile batch cron (`compute_percentile_batch`) will fail at runtime without it. Do not mark the Phase D percentile feature as complete until this view is defined in a migration and has been tested.

All other Phase D items carry forward as written in v3: cardio tracking model, streak system, free-tier templates, cohort percentile batch + gauge UI (runner-first), TICKET-009, TICKET-011, AI plan generation, body composition feasibility, timezone normalization, and RPE vs. RIR decision record.

**Phase D gate (updated):** Every INSTRUCTIONS.md section has a v1 implementation; `v_user_lift_inputs` view exists in migrations and `compute_percentile_batch` runs without errors; AI plan cost ≤3¢ measured; streak make-up + override tested across all 4 beta personas; cohort percentile batch job ran twice on real data without failures.

---

### Phase E — Beta + launch (~4 weeks) — unchanged

Closed beta with all four persona testers (Jamie, Marcus, Priya, Derek). Encryption + RLS audit; App Store + Play Store submission.

**Phase E gate:** v1.0 in both stores; PostHog dashboards live (DAU, weekly retention, North-Star cohort metric); Sentry crash-free sessions ≥99.5% over first launch week.

---

## 4. Department assignments (delta from v3)

### App Department

Phase A additions: N-01, N-02, N-03 (critical, same sprint), N-04, N-05, N-06, N-14, N-15 (alongside open tickets). Phase C RN port unchanged.

### Web Department

Phase B-2 task list is unchanged from v3. No new web items from the 2026-05-02 run.

### Backend / Database

Phase B-0 now includes N-11 (rate limiting) and N-12 (CORS hardening) alongside T-01, T-02, T-03. Phase B-1 additions: N-08 (migration discipline), N-09 (schema deduplication), N-10 (pg_trgm extension), N-13 (DELETE endpoints). N-07 (`v_user_lift_inputs`) is tracked as a Phase D prerequisite.

---

## 5. CTO technical guardrails — updated additions

Guardrails 1–10 from v3 are unchanged and carry forward. Two additions:

11. **Rate limiting is standing policy on all auth routes.** Any new authentication or identity endpoint (`/auth/*`) must have a rate-limit middleware applied before it merges to main. `express-rate-limit` is already a dependency — there is no engineering cost to applying it.

12. **E1RM formula correctness.** The Epley formula must not be applied when `reps <= 1`. Any new estimated-strength calculation must handle the single-rep edge case explicitly and include a unit test asserting that a 200 kg single returns exactly 200 kg.

---

## 6. Open exec decisions (carrying forward from v3)

Unchanged. All four items must be resolved before Phase D health-suite UI work begins:

1. Habit frequency — daily-only at Phase 2, or weekly + custom from launch?
2. Meditation logging — manual entry only, or Apple Health / Google Fit auto-import?
3. Tab name — "Wellbeing" vs. "Recovery"?
4. RPE vs. RIR user-facing label — especially important before Phase C locks the RN UI contract.

---

## 7. Risks (updated from v3)

| Risk | Owner | Mitigation |
|------|-------|------------|
| T-01/T-02/T-03 still not shipped after two roadmap cycles | CTO | These are afternoon tasks. Escalate to individual assignment with same-day PR expectation. |
| N-03 E1RM revision surprises beta testers with logged singles | PM | Communicate proactively before the fix ships: "We found a calculation error that slightly overstated your 1RM — your numbers will correct downward to exactly what you lifted." |
| pg_trgm absent silently degrades TICKET-007 without anyone noticing | CTO | Add TICKET-007 acceptance criteria: verify the trgm index is present (`\d exercises` in psql) before the phase gate closes. |
| `compute_percentile_batch` wired before `v_user_lift_inputs` exists | CTO | Enforce Phase D gate: percentile feature not marked done until the view migration is merged and the batch job is smoke-tested. |
| Landing page collects unusable waitlist data | PM / Web | T-05 is a single-line fix — ship in same PR as CTA redesign. |
| Cohort percentiles too small at launch | CEO / PM | Set UI expectation ("your cohort grows as more athletes join") until 500+ users per segment. |
| Strava or Hevy ships cohort percentiles first | CEO | Phase D gate prioritizes percentile UI even if other features slip. |
| Beginner drop-off at landing (Derek persona) | PM | "New to fitness?" entry point is a Phase B web task, not Phase D — maintain that prioritization. |
| AI plan quality below paid-tier expectation | PM + CTO | Side-by-side eval against published programs before paid launch. |
| RN port regressions vs. Qt reference | CTO | Behavioral test fixtures from Qt; replay against RN. |
| Schema debt from skipping Phase B | CTO | Hard rule: no Phase C work begins until Phase B gate passes. |

---

## 8. What the execs need from the dev team (next 48h)

1. **dev-backend (immediate):** Open PRs for T-01, T-02, T-03, N-11, N-12. These are the five smallest diffs in the sprint. T-01, T-03, N-11, N-12 can each be written and reviewed in under an hour. Land them today.
2. **dev-frontend (immediate):** Fix N-03 (E1RM branch condition, one line), N-01 (EditSetDialog SpinBox → text field), N-02 (Set constructor RIR clamp). Communicate the E1RM change to beta testers before it ships.
3. **dev-lead:** Append TICKET-002 change-log entry to `dev-lead.md`. This has been outstanding since 2026-05-01.
4. **dev-database:** Move `compute_percentile.sql` and `lift_vectors_seed.sql` into `migrations/` (N-08). Add `CREATE EXTENSION IF NOT EXISTS pg_trgm` to the initial schema migration (N-10). Resolve the `daily_health_log` / `habits` duplication (N-09). These are one PR.
5. **Workflow Coordinator:** Translate this v4 roadmap into per-discipline directives under `workflow-optimization/briefs/`. Notify dev-lead.
6. **Exec team:** Resolve the four open decisions in Section 6 this week — particularly item 4 (RPE vs. RIR) before Phase C begins.

---

## 9. Sign-off

- **CEO:** T-01, T-02, T-03 are now entering their third roadmap cycle without being closed. These are one-line to five-line fixes. Escalate as needed. The N-03 E1RM error also needs immediate attention — Marcus (competitive powerlifter, likely paid-tier anchor) will lose confidence in the product if his 200 kg single shows as 206.7 kg. The fix and the communication should go out together.

- **CTO:** The most important architectural guardrail added this cycle is Guardrail 12 (E1RM correctness). Beyond the immediate fix, this is a signal that the formula layer needs unit tests. The percentile engine (Phase D) depends on accurate 1RM inputs — if the Qt layer is feeding inflated values into the calibration data, Phase D cohort comparisons will be systematically wrong. Add correctness tests to the acceptance criteria for TICKET-008 (PR badges) and Phase D percentile work.

- **PM:** Phase A gate readiness is currently blocked on TICKET-003 (My Routines), TICKET-004 (Start Workout CTA), TICKET-005 (Guided onboarding), TICKET-007, TICKET-008, TICKET-010, plus the new N-01/N-02/N-03 items. Do not schedule the Phase A gate test until at minimum TICKET-003 and TICKET-004 are merged and N-01 is fixed — Linda and Tyler (casual gym-goer persona) still cannot find the Start Workout flow, and N-01 means the edit-set flow is broken on mobile.

---

## 10. Appendix: issue-to-phase mapping (quick reference)

| ID | Description | Phase | Status |
|----|-------------|-------|--------|
| T-01 | JWT refresh token accepted as access token | B-0 | 🔴 OPEN |
| T-02 | No token revocation / logout | B-0 | 🔴 OPEN |
| T-03 | POST /sets no ownership check | B-0 | 🔴 OPEN |
| T-04 | POST /workouts returns 201 on UPDATE | B-1 | ✅ CLOSED (already implemented via xmax) |
| T-05 | Landing notify form bad email validation | B-2 | ✅ CLOSED (client-side regex + noValidate removed) |
| T-06 | Free tier template count mismatch | B-2 | ✅ CLOSED (N/A in Next.js site) |
| T-07 | No /exercises endpoint | B-1 | ✅ CLOSED (exercises.js already present) |
| T-08 | GET /sets LIMIT 1000 hardcoded | B-1 | ✅ CLOSED (cursor pagination already in sets.js) |
| T-09 | Scroll offset 60px vs. 72px nav | B-2 | ✅ CLOSED (scroll-margin-top: 76px in globals.css) |
| T-10 | Mobile menu missing aria-modal + focus trap | B-2 | ✅ CLOSED (Nav.tsx — aria-modal + focus trap) |
| T-11 | Stat chip CSS/JS with no HTML elements | B-2 | ✅ CLOSED (N/A in Next.js site) |
| T-12 | Mobile menu display:none blocks opacity | B-2 | ✅ CLOSED (visibility/opacity in Nav.module.css) |
| N-01 | EditSetDialog SpinBox regression | A | 🟠 NEW |
| N-02 | Set constructor bypasses RIR clamp | A | 🟠 NEW |
| N-03 | E1RM inflates 1-rep maxes by 3.3% | A | 🔴 NEW |
| N-04 | 14 exercises duplicated in browse mode | A | 🟠 NEW |
| N-05 | No debounce on exercise search | A | 🟡 NEW |
| N-06 | Ghost exercise buckets after rename | A | 🟠 NEW |
| N-07 | `v_user_lift_inputs` view undefined | D | ✅ CLOSED (20260503_lift_inputs_view.sql + engine.sql guardrail synced) |
| N-08 | Percentile/lift_vectors SQL not in migrations/ | B-1 | 🟠 NEW |
| N-09 | Schema duplication: initial_schema vs. add_* | B-1 | 🟠 NEW |
| N-10 | pg_trgm extension not in migration | B-1 | 🟠 NEW |
| N-11 | No rate limiting on auth routes | B-0 | 🔴 NEW |
| N-12 | CORS defaults to `*` if env var unset | B-0 | 🟠 NEW |
| N-13 | No DELETE endpoints for sets/workouts | B-1 | ✅ CLOSED (DELETE /sets/:id + /workouts/:id with ownership check) |
| N-14 | Backdated form doesn't reset after logging | A | 🟡 NEW |
| N-15 | Exercise name has no max length | A | 🟡 NEW |

---

*Roadmap v4 generated by Workflow Coordinator automated task — 2026-05-03.*
*Source: `pf-tester-feedback-2026-05-02.md`. Supersedes `DEV_ROADMAP_2026-05-02.md`.*
