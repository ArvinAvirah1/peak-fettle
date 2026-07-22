# Peak Fettle — Code Iteration Feedback Report
**Run date:** 2026-05-03
**Scope:** Most recent code iterations (2026-05-02/03): Marketing site scaffold (Next.js), New QML pages (HomePage, OnboardingPage, PercentilesPage, ProfileSurveyPage, SignUpPage), updated landing.html, backend routes (exercises, percentile, plans), migration `20260502_percentile_engine.sql`, migration `20260502_refresh_token_revocation.sql`, migration `20260502_seed_exercise_library.sql`
**Methodology:** Deep static analysis of all source files, cross-referenced against beta feedback, schema, DEV_ROADMAP_2026-05-03.md (v4), and prior automated run (pf-tester-feedback-2026-05-02.md).
**Prior report status:** Issues T-01 through T-12 and N-01 through N-15 from the 2026-05-02 run reproduced below and marked OPEN, CLOSED, or PARTIAL based on current code state.

---

## SECTION 1 — STATUS OF PRIOR REPORT ISSUES

### T-series (prior sprint issues)

| ID | Issue | Status |
|----|-------|--------|
| T-01 | JWT middleware accepts refresh tokens as access tokens | ⚠️ PARTIAL — comment added to requireAuth.js, but the file is **TRUNCATED** (see X-01 below). Fix is in comments only; the implementation is missing. |
| T-02 | No refresh token revocation / logout | ⚠️ PARTIAL — `issueTokens()` infrastructure and migration exist, but auth.js is **TRUNCATED** (see X-02). /auth/login, /auth/refresh, and /auth/logout routes are all incomplete. |
| T-03 | POST /sets does not verify workout ownership | ✅ CLOSED — ownership check (`SELECT id FROM workouts WHERE id = $1 AND user_id = $2`) is present and correct in sets.js. |
| T-04 | POST /workouts always returns 201 on upsert | ✅ CLOSED — xmax trick implemented correctly; returns 201 on create, 200 on update. |
| T-05 | Weak email validation in notify form (landing.html) | ✅ CLOSED — `input.checkValidity()` now used in the submit handler. |
| T-06 | Free tier template count mismatch (2 copy vs 3 SVG) | ✅ CLOSED — 3rd template (Full Body 3x) removed from SVG; comment in source confirms intentional. |
| T-07 | No /exercises endpoint | ✅ CLOSED — `exercises.js` route file exists and is wired in index.js. |
| T-08 | GET /sets hardcoded LIMIT 1000 | ⚠️ PARTIAL — cursor pagination described in comments, but sets.js GET route is **TRUNCATED** (see X-03). Implementation is not present. |
| T-09 | Smooth scroll 12px offset mismatch | 🔴 OPEN — landing.html not in scope for this pass; unchanged. |
| T-10 | Mobile menu missing aria-modal + focus trap | 🔴 OPEN — landing.html accessibility items unchanged. |
| T-11 | Stat chip CSS+JS with no HTML elements | 🔴 OPEN — landing.html dead code unchanged. |
| T-12 | Mobile menu display:none blocks opacity transition | 🔴 OPEN — landing.html unchanged. |

### N-series (2026-05-02 tester run issues)

| ID | Issue | Status |
|----|-------|--------|
| N-01 | EditSetDialog still uses SpinBoxes for date/time | 🔴 OPEN — all five date/time fields (yearSpin, monthSpin, daySpin, hourSpin, minuteSpin) are still SpinBox controls in EditSetDialog.qml. No change from prior run. |
| N-02 | Set constructor bypasses RIR clamping | ✅ CLOSED — Set constructor now uses `std::clamp(rir, -1, 10)` correctly. |
| N-03 | E1RM formula inflates 1-rep maxes by 3.3% | 🔴 OPEN — `workouttracker.cpp` still uses `(s->reps() > 0)` condition in both `recentSets()` and `progressSeries()`. Additionally confirmed present in `exercise.cpp`'s `estimatedOneRepMax()` — see X-04 below. |
| N-04 | 14 exercises duplicated in browse mode | 🔴 OPEN — `grouped()` in ExerciseLibrary.cpp still iterates `m_byCategory` without a seen-set deduplication pass. |
| N-05 | No debounce on exercise search | 🔴 OPEN — `onTextChanged: dialog.rebuildModel()` still fires synchronously on every keystroke in ExercisePickerDialog.qml. |
| N-06 | Ghost exercise buckets after rename | 🔴 OPEN — `editSet()` comment unchanged: "We do NOT collapse the old bucket if it becomes empty." No pruning logic added. |
| N-07 | `compute_percentile_batch` references undefined view | ✅ CLOSED — `v_user_lift_inputs` view is now defined in `20260502_percentile_engine.sql` (lines 224–254). |
| N-08 | Percentile/lift_vectors SQL not in migrations | ✅ CLOSED — `20260502_percentile_engine.sql` migration now contains both the percentile engine and lift_vectors seed data with idempotent `INSERT ... ON CONFLICT DO UPDATE`. Root-level `compute_percentile.sql` and `lift_vectors_seed.sql` still exist but are superseded. |
| N-09 | Schema duplication: initial_schema vs. add_* migrations | 🔴 OPEN — `20260430_initial_schema.sql` still defines `daily_health_log` and `habits` (lines 190–285). The `add_daily_health_log` and `add_habits` migration files still also define these tables. Duplication unresolved. |
| N-10 | pg_trgm extension not in initial migration | ⚠️ PARTIAL — `CREATE EXTENSION IF NOT EXISTS pg_trgm` is now present in `20260502_seed_exercise_library.sql` (line 14). However, the trgm GIN index is created in `20260430_initial_schema.sql` (line 61), which runs *before* the seed migration. On a fresh `supabase db push`, the index creation at line 61 will still fail with `operator class "gin_trgm_ops" does not exist` because pg_trgm is not yet loaded at that point. Fix requires moving the extension creation to the initial schema. |
| N-11 | No rate limiting on auth routes | 🔴 OPEN — `index.js` still has `app.use('/auth', authRoutes)` with no `authLimiter` applied. `express-rate-limit` is installed but unused. |
| N-12 | CORS defaults to `*` if env var unset | 🔴 OPEN — `index.js` line 26 still reads `cors({ origin: process.env.WEB_ORIGIN || '*' })`. No change. |
| N-13 | No DELETE endpoints for sets or workouts | 🔴 OPEN — No DELETE routes added to sets.js or workouts.js. |
| N-14 | Backdated form silent multi-set backdating | 🔴 OPEN — SetTrackerPage.qml backdate form reset behavior unchanged. |
| N-15 | Exercise name has no max length | 🔴 OPEN — `logSetAt` still only checks `name.isEmpty()`. No max-length guard added. |

---

## SECTION 2 — NEW ISSUES FOUND IN THIS ITERATION

The following are bugs and risks discovered in the 2026-05-02/03 code pushes. They are not present in the prior report.

---

### X-01 — CRITICAL: `requireAuth.js` is truncated — server cannot start

**File:** `peak-fettle-agents/server/middleware/requireAuth.js`
**Category:** Backend — broken file / server startup failure

The file is **663 bytes and 12 lines long**. It ends mid-sentence in the middle of the `requireAuth` function body:

```js
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? 
```

The function body is entirely absent: no `jwt.verify()` call, no type check for T-01, no `req.user` population, no `next()` call, no module export. Node.js will throw a **SyntaxError** when `index.js` calls `require('./middleware/requireAuth')`, preventing the server from starting at all.

**Impact:** The entire Express backend is non-functional. All protected endpoints (`/workouts`, `/sets`, `/plans`, `/percentile`) cannot be reached. T-01 has a comment describing the fix but zero implementation.

**Likely cause:** A file write to disk was interrupted mid-write during the 2026-05-03 code push. The git commit presumably contains the truncated version.

**Fix:** Restore the complete `requireAuth.js`. The full implementation should: extract the Bearer token, call `jwt.verify()`, check `if (payload.type === 'refresh') return res.status(401).json(...)`, assign `req.user`, and call `next()`. This is the T-01 fix rolled into the correction.

---

### X-02 — CRITICAL: `auth.js` is truncated — login, logout, and refresh routes missing

**File:** `peak-fettle-agents/server/routes/auth.js`
**Category:** Backend — broken file / auth system non-functional

`auth.js` ends at line 89, mid-execution in the POST `/auth/login` handler:

```js
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = LoginSchema.parse(req.body);
        const { rows } = await pool.quer   ← ENDS HERE
```

The login handler has no password comparison, no token issuance, and no response. Additionally, **no `/auth/refresh` or `/auth/logout` routes are present** in the file — the T-02 token revocation infrastructure (`issueTokens()`, `hashToken()`, the `refresh_tokens` migration) exists, but the endpoints that use it are never defined.

**Impact:** Users cannot log in. Signup exists but returns tokens that can never be refreshed or revoked. The server will not throw at startup for this file (the truncation is in the middle of a router handler registered but never completed), but every POST `/auth/login` request will hang or crash the route.

**Fix:** Restore the complete auth.js. Required endpoints: POST `/auth/login` (password check via bcrypt, call `issueTokens()`), POST `/auth/refresh` (validate token hash against DB, issue new pair), POST `/auth/logout` (DELETE token hash from DB).

---

### X-03 — HIGH: `sets.js` GET route is truncated — pagination not implemented

**File:** `peak-fettle-agents/server/routes/sets.js`
**Category:** Backend — broken route / T-08 remains unresolved

`sets.js` ends at 76 lines. The file ends mid-comment:

```
// Response i
```

The GET `/sets` route — with its cursor-based pagination — is described in comments but never implemented. The POST route is complete. The module likely has no `module.exports = router` at the end, which means `index.js`'s `require('./routes/sets')` may return an empty object and the `/sets` prefix silently goes unregistered.

**Impact:** GET `/sets` returns 404. The cursor pagination fix for T-08 is not present. Beta clients cannot retrieve their logged sets from the API.

**Fix:** Restore the complete sets.js. The GET handler should: accept `?cursor=` (ISO timestamp) and `?limit=` (default 50, max 200) params, query `WHERE logged_at < cursor ORDER BY logged_at DESC LIMIT limit`, and return `{ sets: [...], nextCursor: lastRow.logged_at }`.

---

### X-04 — HIGH: E1RM inflation confirmed in `exercise.cpp` in addition to `workouttracker.cpp`

**File:** `src/exercise.cpp` (`estimatedOneRepMax`)
**Category:** Qt/C++ — calculation error (extends N-03 scope)

N-03 reported the Epley 1-rep inflation bug in `workouttracker.cpp`. Static analysis of `exercise.cpp` confirms the same error is present in `Exercise::estimatedOneRepMax()`:

```cpp
double Exercise::estimatedOneRepMax() const {
    double best = 0.0;
    for (const Set *s : m_sets) {
        if (s->reps() <= 0) continue;                        // ← skips reps=0 only
        const double e1rm = s->weightKg() * (1.0 + s->reps() / 30.0);   // ← inflates reps=1
        if (e1rm > best) best = e1rm;
    }
    return best;
}
```

This function is called by:
- `WorkoutTracker::exerciseStats()` → populates the "e1rm" stat card displayed to the user
- `WorkoutTracker::percentileForExercise()` → feeds the **percentile ranking engine**
- `WorkoutTracker::percentilesForAll()` → feeds the PercentilesPage

**Impact beyond N-03:** A user who logs a 200 kg single will see `e1rmKg = 206.7 kg` on the PercentilesPage, and that inflated value is what gets ranked against the cohort percentile model. If the lift_vectors model was calibrated against true 1RMs, inflated inputs push users to artificially high percentiles. The v4 roadmap fix description targets only `workouttracker.cpp`; this file must also be patched.

**Fix:** Change `if (s->reps() <= 0) continue;` to apply Epley only when `reps > 1`. When `reps == 1`, return `weightKg` directly. Mirrors the fix prescribed for workouttracker.cpp.

---

### X-05 — MEDIUM: N-10 partial fix creates a migration order dependency that still fails on fresh push

**Files:** `migrations/20260430_initial_schema.sql` (line 61), `migrations/20260502_seed_exercise_library.sql` (line 14)
**Category:** Database — migration order risk

The trgm GIN index is in the **initial schema** (which runs first):
```sql
-- 20260430_initial_schema.sql line 61:
CREATE INDEX idx_exercises_name_trgm ON exercises USING gin (name gin_trgm_ops);
```

The pg_trgm extension is now in the **seed migration** (which runs later):
```sql
-- 20260502_seed_exercise_library.sql line 14:
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

On a fresh `supabase db push` or `supabase db reset`, migrations run in filename order. The initial schema creates the trgm index at migration step 1; the seed migration creates the extension at step 4. This fails at step 1 with `ERROR: operator class "gin_trgm_ops" does not exist` — the same failure mode as before the partial fix.

**Fix:** Move `CREATE EXTENSION IF NOT EXISTS pg_trgm;` to `20260430_initial_schema.sql` immediately after `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`, as specified in the N-10 fix in DEV_ROADMAP v4. The partial fix in the seed migration is correct but insufficient without updating the initial schema.

---

### X-06 — LOW: `HomePage.qml` streak counter uses recentSets(500) — caps at ~3 months of daily training

**File:** `qml/HomePage.qml`
**Category:** Qt/QML — data coverage edge case

The streak computation pulls `WorkoutTracker.recentSets(500)`. At 5 sets per session, 500 sets covers ~100 training days (~3.3 months). A user with a 4-month streak who averages 6 sets per session would hit the ceiling at ~83 days: the oldest sets fall outside the window, the streak walk encounters a day with no sets, and the counter resets to 0 — even though the actual streak is unbroken.

This is a low-severity edge case for a new app (no user will have a 100+ day streak at launch), but the algorithm does not degrade gracefully as the dataset grows. The correct fix is to query unique dayKeys rather than full set rows when computing streaks.

**Fix:** Add a `WorkoutTracker.uniqueTrainingDays(int limitDays)` method that returns only the distinct `dayKey` values for the past N days, bypassing the set-count ceiling. Alternatively, raise `recentSets()` to 2000 as a short-term guard.

---

## SECTION 3 — WHAT SHIPPED CORRECTLY IN THIS ITERATION

The following items from the v4 roadmap were implemented and are confirmed correct:

- **TICKET-005 (Guided onboarding)** — `OnboardingPage.qml` is complete and well-structured. Three-step tap-only flow (experience level → starting template → CTA). QSettings keys written correctly. Skip links on every step.
- **ProfileSurveyPage.qml** — Collects sex, age, years training, and bodyweight. Correctly calls `UnitPreference.toKg()` for bodyweight conversion. `isComplete` gating logic is sound.
- **PercentilesPage.qml** — Profile-gated correctly. Delegates to `WorkoutTracker.percentilesForAll()`. Proper ranked vs. unranked row separation.
- **SignUpPage.qml** — Form validation and navigation logic appear correct.
- **Marketing site scaffold** — Next.js app with WaitlistForm and `/api/waitlist` route is well-implemented. Server-side email validation via regex is correct. Resend integration properly structured. `noValidate` on the form is intentional (custom JS validation). The page copy and CTA are coherent with INSTRUCTIONS.md.
- **T-03 (workout ownership check)** — Cleanly implemented in sets.js.
- **T-04 (201/200 on upsert)** — xmax trick is correct.
- **N-02 (RIR constructor clamp)** — `std::clamp(rir, -1, 10)` is correct.
- **N-07 (v_user_lift_inputs view)** — Defined and coherent in the percentile migration.
- **N-08 (percentile engine migration discipline)** — Engine and seed data are now in a properly dated migration. `ON CONFLICT DO UPDATE` used for idempotency.

---

## SECTION 4 — WORKFLOW COORDINATOR RANKING

*All issues (prior open + new) unified into a single ranked list for executive context.*

### Master Ranked Issue List — 2026-05-03

| Rank | ID | Category | Description | Severity | Change from v4 |
|------|----|----------|-------------|----------|----------------|
| 1 | X-01 | Backend — BROKEN FILE | `requireAuth.js` truncated — server fails to start, all protected endpoints non-functional | 🔴 P0 | NEW |
| 2 | X-02 | Backend — BROKEN FILE | `auth.js` truncated — login, logout, refresh routes incomplete/absent | 🔴 P0 | NEW |
| 3 | X-03 | Backend — BROKEN FILE | `sets.js` GET route truncated — cursor pagination not implemented, module may fail to export | 🔴 P0 | NEW |
| 4 | T-01 | Security | JWT middleware accepts refresh tokens — T-01 fix comment exists but code is missing (see X-01) | 🔴 P0 | CARRIED |
| 5 | T-02 | Security | Auth.js truncated — no logout or refresh endpoints (infrastructure exists, routes don't) | 🔴 P0 | CARRIED + X-02 |
| 6 | N-11 | Security | No rate limiting on /auth/login and /auth/signup — brute force + email enumeration | 🔴 HIGH | CARRIED |
| 7 | N-03 | Calculation | E1RM formula inflates 1-rep maxes by 3.3% — confirmed in both workouttracker.cpp AND exercise.cpp | 🔴 HIGH | SCOPE EXPANDED (X-04) |
| 8 | X-04 | Calculation | E1RM inflation in exercise.cpp feeds inflated values to the percentile engine | 🟠 HIGH | NEW |
| 9 | N-01 | Qt/QML | EditSetDialog still uses SpinBoxes for date/time — regression of SetTrackerPage fix | 🟠 HIGH | CARRIED |
| 10 | N-06 | Qt/C++ | Renamed exercises leave empty ghost buckets in exerciseNames forever | 🟠 HIGH | CARRIED |
| 11 | N-12 | Backend | CORS defaults to `*` if WEB_ORIGIN env var unset | 🟠 HIGH | CARRIED |
| 12 | X-05 | Database | pg_trgm partial fix creates migration order failure — initial schema still lacks extension | 🟠 HIGH | NEW |
| 13 | N-04 | Qt/C++ | 14 exercises appear twice in ExercisePickerDialog browse mode | 🟠 MEDIUM | CARRIED |
| 14 | N-09 | Database | daily_health_log and habits defined in both initial_schema and add_* migrations | 🟠 MEDIUM | CARRIED |
| 15 | T-08 | Backend | GET /sets cursor pagination route is truncated and non-functional | 🟠 MEDIUM | CARRIED + X-03 |
| 16 | N-05 | QML | ExercisePickerDialog rebuilds full list on every keystroke — no debounce | 🟡 MEDIUM | CARRIED |
| 17 | N-13 | Backend | No DELETE endpoints for sets or workouts | 🟡 MEDIUM | CARRIED |
| 18 | T-05 | Frontend | Landing notify form — T-05 is CLOSED in landing.html; marketing site (Next.js) uses `noValidate` correctly with server-side validation | ✅ CLOSED | — |
| 19 | T-06 | Frontend | Free tier template count mismatch — CLOSED | ✅ CLOSED | — |
| 20 | T-09 | Frontend | Smooth scroll 12px offset (landing.html) | 🟡 LOW | CARRIED |
| 21 | T-12 | Frontend | Mobile menu display:none transition (landing.html) | 🟡 LOW | CARRIED |
| 22 | T-10 | Accessibility | Mobile menu missing aria-modal + focus trap (landing.html) | 🟡 LOW | CARRIED |
| 23 | T-11 | Frontend | Stat chip dead code (landing.html) | 🟡 LOW | CARRIED |
| 24 | N-14 | QML — UX | Backdated form silent multi-set backdating | 🟡 LOW | CARRIED |
| 25 | N-15 | Qt/C++ | Exercise name has no max length | 🟡 LOW | CARRIED |
| 26 | X-06 | Qt/QML | HomePage streak counter caps at ~100 days at 5 sets/session | 🟡 LOW | NEW |

---

## SECTION 5 — EXECUTIVE BRIEF

*Prepared for: CEO, CTO, Product Manager*
*Prepared by: Workflow Coordinator (automated run — pf-tester-prompts, 2026-05-03)*

---

### Overall Status: The 2026-05-03 code push introduced three broken files that make the entire backend non-functional. This is the most urgent finding across all tester runs to date.

The sprint delivered meaningful progress: OnboardingPage (TICKET-005), ProfileSurveyPage, PercentilesPage, and the marketing site scaffold are correctly implemented and represent solid feature work. T-03, T-04, N-02, N-07, N-08 are cleanly resolved. This is not a low-quality sprint — it is a sprint with a file-write failure that happened to hit three critical files.

---

### For the CTO — three truncated files require immediate restoration

**X-01 / X-02 / X-03:** `requireAuth.js`, `auth.js`, and `sets.js` are all truncated mid-write. The server cannot start (X-01 causes a SyntaxError on `require`). Even if the startup issue is patched manually, login is broken (X-02) and set retrieval returns 404 (X-03). These are not logic bugs — they are literally incomplete files. The dev team should:

1. Check the git commit that introduced these files. If the commit contains the truncated versions, they need to be restored from a prior state or rewritten.
2. Confirm whether this was a disk-write interruption, a file-size limit issue, or a tool error during the push.
3. Restore all three files before any further backend testing or beta access.

**X-04 (E1RM in exercise.cpp):** The v4 roadmap's N-03 fix plan targeted only `workouttracker.cpp`. The same Epley-on-reps=1 bug is also in `exercise.cpp::estimatedOneRepMax()`, which feeds the percentile engine. The fix must also be applied to this file or percentile rankings will receive inflated inputs even after the workouttracker fix ships.

**X-05 (pg_trgm order dependency):** The N-10 fix landed in the wrong migration file. `CREATE EXTENSION IF NOT EXISTS pg_trgm` must be in `20260430_initial_schema.sql` — the file that creates the trgm GIN index — not in the later seed migration. A fresh `supabase db push` still fails at the index creation step.

---

### For the CEO — the three file-truncation issues are more urgent than the security backlog

T-01, T-02, T-03 were the standing P0 security items. T-03 is now closed. T-01 and T-02 have their fixes described but the files that contain those fixes are truncated. This means the security work was attempted but didn't land. The file restoration (X-01, X-02) is the prerequisite to even confirming T-01 and T-02 are resolved.

N-11 (rate limiting on auth routes) remains unaddressed and is a five-line addition. It should be bundled with the file restoration PR.

No external beta invites should go out until X-01, X-02, X-03 are resolved and the server can be confirmed to start and accept logins.

---

### For the PM — Phase A gate is blocked; two items closed, three new blockers added

**Closed this sprint:** TICKET-005 (OnboardingPage ✅), T-03, T-04, T-05, T-06, N-02, N-07, N-08.

**Phase A gate still blocked on:**
- TICKET-003 (My Routines) — not implemented
- TICKET-004 (Start Workout CTA) — not implemented
- TICKET-007, TICKET-008, TICKET-010 — not implemented
- N-01 (EditSetDialog SpinBoxes) — not fixed
- N-03 (E1RM inflation) — not fixed (now also confirmed in exercise.cpp)

**Do not schedule the Phase A gate test** until at minimum N-01 and N-03 are fixed and TICKET-003/004 are merged. The edit-set flow is broken on mobile, and the core strength metric is wrong for competitive users.

The marketing site (Phase B-2) is in excellent shape and could go live independently once the waitlist backend is wired. This is the one area of the sprint that is fully ready.

---

*Report generated automatically by the pf-tester-prompts scheduled task.*
*Run date: 2026-05-03.*
*Next recommended run: after dev team restores requireAuth.js, auth.js, and sets.js; applies N-03 fix to both workouttracker.cpp and exercise.cpp; and fixes pg_trgm migration order (X-05).*
