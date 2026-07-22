# Peak Fettle — Code Iteration Feedback Report
**Run date:** 2026-05-04
**Scope:** Most recent code iterations (2026-05-04): Avatar feature (AvatarButton.qml, UserProfile displayName/avatarColorIndex), Log Set button layout fix (BUG-01), five new migrations (20260503_cosmetics.sql, 20260503_exercise_prs.sql, 20260503_group_streak_credits.sql, 20260503_lift_inputs_view.sql, 20260503_rls_policies.sql). Cross-checked against all prior open issues from pf-tester-feedback-2026-05-03.md.
**Methodology:** Static analysis of all modified and newly created source files. All prior open issues (X-01 through X-06, T-series, N-series) re-verified against current file state.
**Prior report status:** Issues from 2026-05-03 run reproduced below with updated OPEN / CLOSED / PARTIAL status.

---

## SECTION 1 — STATUS OF PRIOR REPORT ISSUES

### X-series (critical file truncation issues from 2026-05-03)

| ID | Issue | Status |
|----|-------|--------|
| X-01 | `requireAuth.js` truncated — server cannot start | 🔴 OPEN — File is **still 12 lines**, identical to prior run. No restoration attempt. Server still fails to start. |
| X-02 | `auth.js` truncated — login/logout/refresh routes absent | 🔴 OPEN — File is **still 89 lines**, ending mid-login handler at `pool.quer`. No `/auth/refresh` or `/auth/logout` routes. Identical to prior run. |
| X-03 | `sets.js` GET route truncated — pagination not implemented | 🔴 OPEN — File is **still 76 lines**, ending mid-comment at `// Response i`. No GET route, no `module.exports`. Identical to prior run. |
| X-04 | E1RM inflation in `exercise.cpp::estimatedOneRepMax()` | ⚠️ PARTIAL — Fix comment is present in `exercise.cpp` (lines 31–38), but the file is **still only 39 lines** and **ends mid-comment**. The actual conditional logic (`if (reps > 1)`) is absent — the function has no return statement. `workouttracker.cpp` is fully fixed (see N-03 below). `exercise.cpp` is a second, independent truncated file. |
| X-05 | pg_trgm extension in wrong migration — fresh db push fails | ✅ CLOSED — `CREATE EXTENSION IF NOT EXISTS pg_trgm` is now on lines 18–21 of `20260430_initial_schema.sql`, immediately after the `pgcrypto` extension at line 17, and **before** the trgm GIN index at line 67. Fresh `supabase db push` will now succeed. |
| X-06 | HomePage streak counter caps at ~100 training days | 🔴 OPEN — `qml/HomePage.qml` still calls `WorkoutTracker.recentSets(500)`. The comment even acknowledges the limitation: "covers ~3+ months of daily training." No `uniqueTrainingDays()` method added; limit unchanged. |

### T-series (carried from prior sprints)

| ID | Issue | Status |
|----|-------|--------|
| T-01 | JWT middleware accepts refresh tokens as access tokens | 🔴 OPEN — Blocked by X-01. requireAuth.js is still truncated; the fix remains comment-only. |
| T-02 | No refresh token revocation / logout | 🔴 OPEN — Blocked by X-02. auth.js still truncated; infrastructure exists, routes do not. |
| T-08 | GET /sets cursor pagination | 🔴 OPEN — Blocked by X-03. sets.js GET route still absent. |
| T-09 | Smooth scroll 12px offset (landing.html) | 🔴 OPEN — No change. |
| T-10 | Mobile menu missing aria-modal + focus trap | 🔴 OPEN — No change. |
| T-11 | Stat chip dead code (landing.html) | 🔴 OPEN — No change. |
| T-12 | Mobile menu display:none transition (landing.html) | 🔴 OPEN — No change. |

### N-series (from 2026-05-02/03 tester runs)

| ID | Issue | Status |
|----|-------|--------|
| N-01 | EditSetDialog SpinBoxes for date/time | ✅ CLOSED — `EditSetDialog.qml` line 236 confirms SpinBoxes replaced with `ThemedTextField` using `inputMask: "9999-99-99;_"` (date) and `inputMask: "99:99;_"` (time). Pattern matches the SetTrackerPage implementation. |
| N-03 | E1RM formula inflates 1-rep maxes (workouttracker.cpp) | ✅ CLOSED — `workouttracker.cpp` correctly implements `(s->reps() > 1) ? s->weightKg() * (1.0 + s->reps() / 30.0) : s->weightKg()` in both `progressSeries()` and `recentSets()`. Fix is correct and complete. Note: `exercise.cpp` carries the same bug and remains truncated (see X-04). |
| N-04 | 14 exercises appear twice in browse mode | ✅ CLOSED — `ExerciseLibrary::grouped()` now deduplicates with `QSet<QString> seen`. The seen-set correctly gates each exercise to its first encountered category, and groups that become empty after dedup are skipped via `if (unique.isEmpty()) continue`. |
| N-05 | No debounce on exercise search | ✅ CLOSED — `ExercisePickerDialog.qml` has a `Timer { id: searchDebounce; interval: 180; repeat: false; onTriggered: dialog.rebuildModel() }`. The text field uses `onTextChanged: searchDebounce.restart()`. Correctly implemented. |
| N-06 | Ghost exercise buckets after rename | 🔴 OPEN — No `editSet()` pruning logic found in `ExerciseLibrary.cpp`. A grep across all 472 lines for the function name and related patterns returned no results. The empty-bucket comment from the prior report remains the only relevant text. |
| N-09 | Schema duplication: daily_health_log and habits | ✅ CLOSED — `20260430_initial_schema.sql` no longer contains `daily_health_log` or `habits` table definitions. Both tables are defined exclusively in their respective `add_*` migration files. Duplication resolved. |
| N-11 | No rate limiting on auth routes | 🔴 OPEN — `express-rate-limit` is imported in `index.js` (line 10), but `index.js` is **newly truncated** (see Y-01 below) and ends before any `rateLimit({...})` configuration or `app.use('/auth', authLimiter, ...)` call. The import is present; the application is not. |
| N-12 | CORS defaults to `*` if WEB_ORIGIN unset | ⚠️ PARTIAL — `index.js` contains a comment block (lines 24–30) describing the N-12 fix policy: production should fail loud if WEB_ORIGIN is unset, development defaults to localhost:3000. However, `index.js` is truncated mid-comment before the `cors({...})` configuration is ever written. The described fix does not exist in code. |
| N-13 | No DELETE endpoints for sets or workouts | 🔴 OPEN — `workouts.js` has only `router.post` and `router.get`. `sets.js` is truncated. No DELETE routes anywhere in the backend. |
| N-14 | Backdated form silent multi-set backdating | 🔴 OPEN — No change to SetTrackerPage.qml backdate reset behavior. |
| N-15 | Exercise name has no max length | ✅ CLOSED — `workouttracker.cpp::logSetAt()` line 83: `if (name.isEmpty() || name.length() > 100 || reps <= 0) return 0;`. Max length of 100 characters enforced. Cardio variant (line 117) also trims but lacks the > 100 guard — acceptable given cardio exercises are seeded, not user-named. |

---

## SECTION 2 — NEW ISSUES FOUND IN THIS ITERATION

---

### Y-01 — CRITICAL: `index.js` is newly truncated — server has no middleware, routes, or listen call

**File:** `peak-fettle-agents/server/index.js`
**Category:** Backend — broken file / fourth truncated file
**Line count:** 30 lines

`index.js` now ends mid-comment at line 30:

```
// N-12: CORS — whitelist-based origin policy.
// In production, WEB_ORIGIN must be set explicitly. In development it defaults
// to localhost:3000. If NODE_ENV is 'production' and WEB_ORIGIN is absent,
// fail loud so the misconfiguration is visible at startup.
// ------------
```

The file ends here. **Everything after this line is absent:**
- `const corsOptions = cors({...})` — the actual CORS configuration
- `app.use(helmet())`, `app.use(express.json())` — core middleware
- `const authLimiter = rateLimit({...})` — rate limiting (N-11 fix)
- All `app.use('/auth', ...)`, `app.use('/workouts', ...)`, `app.use('/sets', ...)` etc. route registrations
- `app.use(requireAuth)` — auth middleware guard
- `app.use(errorHandler)` — error handler
- `app.listen(...)` — server startup

**Impact:** This is the fourth truncated file in the backend, compounding X-01, X-02, and X-03. The prior three truncations already made the server non-functional (X-01 causes a SyntaxError on `require('./middleware/requireAuth')`). Even if X-01 were restored, the truncated `index.js` means:
- No routes are registered (all endpoints return 404)
- No middleware is applied (no authentication, no JSON parsing, no CORS headers)
- `app.listen()` is never called (server never binds to a port)

This also means N-11 (rate limiting) and N-12 (CORS) cannot be evaluated as implemented — their fix comments exist only in the truncated preamble, not in code.

**Likely cause:** Same file-write interruption pattern as X-01/X-02/X-03. This truncation is new to the 2026-05-04 push.

**Fix:** Restore the complete `index.js`. The file should configure CORS (reject `*` in production; default `localhost:3000` in development), register `helmet()`, `express.json()`, `authLimiter`, all route prefixes, `requireAuth`, and `errorHandler`, then call `app.listen(process.env.PORT || 3001)`.

---

### Y-02 — HIGH: `exercise.cpp::estimatedOneRepMax()` is truncated — fix comment present, implementation absent

**File:** `src/exercise.cpp`
**Category:** Qt/C++ — truncated file / X-04 remains functionally unresolved
**Line count:** 39 lines

`exercise.cpp` is 39 lines. The N-03/X-04 fix comment occupies lines 31–39 and ends mid-sentence:

```cpp
double Exercise::estimatedOneRepMax() const {
    // Epley: 1RM = w * (1 + reps/30). Only meaningful for reps >= 2;
    // ...
    // N-03/X-04 (2026-05-03): when reps == 1 the user already performed a
    // true 1-rep-max attempt — return weightKg directly so a 200 kg single
    // shows as exactly 200 kg, not 206.7 kg (3.3% Epley inflation).
    // This function feeds exerciseStats(), percentileForExercise(), and
    // percentilesForAll() — inflated inputs would push users to artificially
    // high cohort
```

The file ends here. There is no `for` loop, no `if (s->reps() > 1)` conditional, no `return best`, no closing brace. The function has no body and no return statement — it will either fail to compile or return undefined behavior.

**Impact:** The C++ build will fail to compile `exercise.cpp`. If it somehow compiled (unlikely), `estimatedOneRepMax()` would return garbage, causing `exerciseStats()`, `percentileForExercise()`, and `percentilesForAll()` to produce nonsense values. The fix in `workouttracker.cpp` (N-03, now CLOSED) is correct and complete, but `exercise.cpp` feeds those same downstream methods and must also be fixed.

**Note:** The prior run (pf-tester-feedback-2026-05-03.md) marked X-04 as NEW and noted the function was computing inflated values. The current state is arguably worse: the function exists but is syntactically incomplete.

**Fix:** The complete implementation, consistent with the `workouttracker.cpp` fix:
```cpp
double Exercise::estimatedOneRepMax() const {
    double best = 0.0;
    for (const Set *s : m_sets) {
        if (s->reps() <= 0) continue;
        const double e1rm = (s->reps() > 1)
            ? s->weightKg() * (1.0 + s->reps() / 30.0)
            : s->weightKg();
        if (e1rm > best) best = e1rm;
    }
    return best;
}
```

---

### Y-03 — MEDIUM: New migration `20260503_exercise_prs.sql` defines an app-maintained table with no trigger safety net — stale PRs possible on set delete or edit

**File:** `migrations/20260503_exercise_prs.sql`
**Category:** Database — correctness risk in maintenance model

`exercise_prs.sql` (102 lines) defines the `exercise_prs` table and explicitly documents that it is **not self-maintaining via triggers** — the application layer (WorkoutTracker C++ model) is responsible for issuing upserts after every new set. The migration header states:

> "This table is NOT self-maintaining via triggers on sets. The application layer (WorkoutTracker C++ model) is responsible for issuing an upsert after every new set is logged."

The risk is that two operations are **not accounted for**:

1. **Set deletion** — when a user deletes a set that was their PR (e.g., a 200 kg single), `exercise_prs` retains the stale record. The next time `estimatedOneRepMax()` is computed from live sets, the C++ model will compute a lower value, but the database row still shows 200 kg. Any backend percentile re-ranking that reads `exercise_prs` directly will use the stale figure.

2. **Set editing** — when a user edits a set's weight or reps, the old PR row is not invalidated. A corrected 180 kg → 200 kg edit will trigger a new upsert correctly, but a 200 kg → 180 kg correction (downgrade) leaves the 200 kg PR in place permanently.

There are also **no DELETE endpoints for sets** (N-13 is still open), so the delete case cannot be triggered by users today — but the risk is latent and will materialize when N-13 is resolved.

**Impact:** Medium. The table is new and has no data. The upsert-on-insert path is described correctly. But the maintenance model is incomplete for a mutable dataset.

**Fix:** Either (a) add a `AFTER DELETE ON sets` trigger that recomputes the PR for the affected `(user_id, exercise_id, rep_count)` tuple, or (b) document in the migration that the application must also issue a full PR recompute when a set is deleted or its weight/reps are edited downward.

---

### Y-04 — LOW: `20260503_cosmetics.sql` omits RLS on `cosmetic_items` — intentional, but undocumented risk if anon access policy changes

**File:** `migrations/20260503_cosmetics.sql`
**Category:** Database — deliberate policy gap / forward risk

`cosmetic_items` intentionally has no RLS. The migration comment says:

> "No RLS on cosmetic_items intentionally — it is a public catalog."

And `rls_policies.sql` confirms the omission is deliberate (line 27, line 145). This is a reasonable design decision for an unauthenticated shop preview. However, the table stores `is_default = TRUE` rows that govern whether a user can equip an item without purchasing it. The equip endpoint (not yet implemented) is described as checking `is_default OR ownership`. If cosmetic_items is entirely public and unprotected at the DB level, a future implementation error in the equip endpoint could allow any user to set `is_default = TRUE` on any item (granting free access to paid cosmetics) if a write policy is accidentally added.

**Impact:** Low. The equip endpoint does not exist yet, and the service-role seed writes are fine. This is a forward risk, not a present bug.

**Fix:** Add a `-- NOTE: write access is service-role only; no INSERT/UPDATE/DELETE policy should be added` comment to the migration and to `rls_policies.sql` for future maintainers. No schema change needed.

---

## SECTION 3 — WHAT SHIPPED CORRECTLY IN THIS ITERATION

The following items from DEV_ROADMAP v5/v6 were implemented and are confirmed correct:

- **BUG-01 (Log Set button layout)** — `SetTrackerPage.qml` refactored to `ColumnLayout`: "Log set" fills the full top row; "Save as routine" and "Clear all" share a `RowLayout` below. Clean fix, no logic changes.
- **FEAT-01 (Avatar feature)** — `AvatarButton.qml` is 122 lines and complete. UserProfile.h/cpp additions for `displayName` and `avatarColorIndex` are present. ProfileSurveyPage.qml and SettingsPage.qml integration confirmed. CMakeLists.txt updated. `OnboardingPage.qml` hint copy updated from "gear icon" to "avatar." End-to-end implementation looks correct.
- **N-01 (EditSetDialog SpinBoxes)** — Replaced with inputMask TextFields. Confirmed closed.
- **N-03 in workouttracker.cpp** — E1RM reps>1 guard implemented correctly in both `progressSeries()` and `recentSets()`. Confirmed closed.
- **N-04 (Exercise deduplication)** — `grouped()` deduplication with seen-set confirmed correct.
- **N-05 (Search debounce)** — 180ms Timer confirmed in ExercisePickerDialog.qml.
- **N-09 (Schema duplication)** — daily_health_log and habits removed from initial_schema. Confirmed closed.
- **N-15 (Exercise name max length)** — 100-character cap in `logSetAt()`. Confirmed closed.
- **X-05 (pg_trgm order)** — Extension now in initial_schema before the GIN index. Confirmed closed.
- **20260503_rls_policies.sql** — Covers `user_percentile_rankings` and `refresh_tokens` (the two previously unguarded user-scoped tables). Global read-only tables (`exercises`, `exercise_aliases`, `percentile_vectors`, `lift_vectors`) get permissive SELECT policies. Intentional omission of `cosmetic_items` is documented. Well-reasoned.
- **20260503_exercise_prs.sql** — Table structure is sound. The E1RM singles exception (`reps = 1 → E1RM = weight_kg`) is correctly documented in the migration header, consistent with the N-03/X-04 fix. Composite PK on `(user_id, exercise_id, rep_count)` is correct.
- **20260503_group_streak_credits.sql** — Full data model for group streak credits per spec. Views (`user_credit_balance`, `group_active_member_count`) are correctly defined.
- **20260503_cosmetics.sql** — Cosmetic shop schema with correct rarity tiers, ownership ledger, and equipped loadout model.

---

## SECTION 4 — WORKFLOW COORDINATOR RANKING

*All issues (prior open + new) unified into a single ranked list for executive context.*

### Master Ranked Issue List — 2026-05-04

| Rank | ID | Category | Description | Severity | Change from v6 |
|------|----|----------|-------------|----------|----------------|
| 1 | X-01 | Backend — BROKEN FILE | `requireAuth.js` still truncated at 12 lines — server cannot start | 🔴 P0 | CARRIED — NOT FIXED |
| 2 | Y-01 | Backend — BROKEN FILE | `index.js` newly truncated at 30 lines — no routes, no middleware, no app.listen() | 🔴 P0 | NEW |
| 3 | X-02 | Backend — BROKEN FILE | `auth.js` still truncated — login/logout/refresh routes absent | 🔴 P0 | CARRIED — NOT FIXED |
| 4 | X-03 | Backend — BROKEN FILE | `sets.js` GET route still truncated — pagination absent, module likely fails to export | 🔴 P0 | CARRIED — NOT FIXED |
| 5 | T-01 | Security | JWT refresh-token rejection fix exists in comment only (blocked by X-01) | 🔴 P0 | CARRIED |
| 6 | T-02 | Security | No logout/refresh endpoint (blocked by X-02) | 🔴 P0 | CARRIED |
| 7 | Y-02 | Qt/C++ — BROKEN FILE | `exercise.cpp` truncated at 39 lines — `estimatedOneRepMax()` has no body; build likely fails | 🔴 HIGH | NEW |
| 8 | N-11 | Security | Rate limiting on /auth described in comment; implementation absent (index.js truncated) | 🔴 HIGH | CARRIED — WORSENED (was partial; now no code at all) |
| 9 | N-12 | Backend | CORS fix described in comment; implementation absent (index.js truncated) | 🟠 HIGH | CARRIED — WORSENED |
| 10 | N-06 | Qt/C++ | Ghost exercise buckets after rename — no fix found in ExerciseLibrary.cpp | 🟠 HIGH | CARRIED |
| 11 | X-06 | Qt/QML | Streak counter still caps at ~100 training days (recentSets(500)) | 🟡 LOW→MEDIUM | CARRIED |
| 12 | Y-03 | Database | exercise_prs table: stale PRs possible on set delete or weight edit-downward | 🟠 MEDIUM | NEW |
| 13 | N-13 | Backend | No DELETE endpoints for sets or workouts | 🟡 MEDIUM | CARRIED |
| 14 | T-08 | Backend | GET /sets pagination (blocked by X-03) | 🟡 MEDIUM | CARRIED |
| 15 | T-09 | Frontend | Smooth scroll offset (landing.html) | 🟡 LOW | CARRIED |
| 16 | T-12 | Frontend | Mobile menu transition (landing.html) | 🟡 LOW | CARRIED |
| 17 | T-10 | Accessibility | Mobile menu aria-modal + focus trap (landing.html) | 🟡 LOW | CARRIED |
| 18 | T-11 | Frontend | Stat chip dead code (landing.html) | 🟡 LOW | CARRIED |
| 19 | N-14 | QML — UX | Backdated form silent multi-set backdating | 🟡 LOW | CARRIED |
| 20 | Y-04 | Database | cosmetic_items has no RLS — intentional but undocumented write risk | 🟡 LOW | NEW |

**Closed this sprint (removed from list):** N-01, N-03 (workouttracker.cpp), N-04, N-05, N-09, N-15, X-05, BUG-01, FEAT-01.

---

## SECTION 5 — EXECUTIVE BRIEF

*Prepared for: CEO, CTO, Product Manager*
*Prepared by: Workflow Coordinator (automated run — pf-tester-prompts, 2026-05-04)*

---

### Overall Status: The file-truncation crisis has grown. A fourth broken file (`index.js`) was introduced this sprint while the original three (requireAuth.js, auth.js, sets.js) remain unrestored. The Qt build likely no longer compiles due to the truncated exercise.cpp. Despite this, the feature work in this sprint is of high quality.

---

### For the CTO — four truncated backend files; Qt build likely broken

**The file-truncation count has increased from 3 to 4.** `index.js` — the Express server entry point — is now 30 lines and ends mid-CORS-comment. Even if X-01, X-02, and X-03 were restored today, the server still cannot start because `index.js` has no `app.listen()`, no middleware registration, and no route wiring.

The restoration priority order is:

1. `index.js` — restore first; nothing else can be tested without it
2. `requireAuth.js` — restore; eliminates SyntaxError on server startup (T-01 fix bundled)
3. `auth.js` — restore; restores login, refresh, logout (T-02 fix bundled)
4. `sets.js` — restore GET route with cursor pagination (T-08 fix bundled)

These four files should be treated as a single PR. Bundle N-11 (rate limiting) and N-12 (CORS) into the same restoration PR since their configurations belong in `index.js` and the comments describing them are already there.

**The Qt build is likely broken.** `exercise.cpp` is 39 lines and ends mid-comment inside `estimatedOneRepMax()` — no function body, no closing brace. The compiler will reject this. The N-03/X-04 fix in `workouttracker.cpp` is correct and complete; `exercise.cpp` needs the same one-conditional fix applied and the file restored to its complete state.

**N-06 (ghost exercise buckets) has not been addressed.** This results in phantom exercise names persisting in all exercise pickers and graph selectors after any rename. It is the only Qt bug from the original high-priority list that has not been touched.

---

### For the CEO — backend still non-functional; Qt feature work is solid

The seven issues closed this sprint (N-01, N-03/workouttracker, N-04, N-05, N-09, N-15, X-05) represent meaningful progress: the exercise picker works correctly, the date/time editors are repaired, the strength calculation is accurate in the chart layer, and the database migration ordering is fixed. The Avatar feature and button layout fix shipped cleanly.

However, the Express backend has now been non-functional across two full sprint cycles. The four truncated files are a systemic tooling or process issue, not a logic error — a write interruption is hitting critical files consistently. The dev team should identify why this keeps happening before the next backend push.

**No external beta invites should go out until the server can start, accept logins, and return sets.** That requires all four files restored and confirmed running.

The marketing site (Next.js) remains production-ready and can be deployed to Vercel independently of the Express backend. This is the fastest path to any external-facing progress.

---

### For the PM — Sprint 1 (backend restoration) is now blocking three consecutive sprints

DEV_ROADMAP v6 flagged Sprint 1 (restore requireAuth.js + auth.js + sets.js) as an emergency blocker. This sprint added `index.js` to that list and did not address the original three. Phase B gates (CI pipeline, exercise_aliases endpoint, /plans CRUD) cannot be meaningfully tested until the server is running.

Recommended immediate actions:
1. Assign a dedicated backend session specifically and only to restoring the four broken files. No new feature work in that session.
2. After restoration, run a smoke test confirming the server starts, `/auth/signup` returns 201, `/auth/login` returns tokens, and `GET /sets` returns a paginated list.
3. Only after smoke test passes: re-open the Phase B sprint queue.

Phase C/D tickets (TICKET-011 through TICKET-015) are appropriately deferred. The cosmetics, exercise_prs, and group_streak_credits migrations are well-designed and unblocked — good preparatory work.

---

*Report generated automatically by the pf-tester-prompts scheduled task.*
*Run date: 2026-05-04.*
*Next recommended run: after dev team restores index.js, requireAuth.js, auth.js, and sets.js; and after exercise.cpp::estimatedOneRepMax() is completed with the N-03/X-04 fix.*
