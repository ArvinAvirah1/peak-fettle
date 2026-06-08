# Peak Fettle — Development Roadmap (v25)
**Date:** 2026-05-25 (LATE — workflow-coordinator pass, founder-directed)
**Status:** ACTIVE — supersedes v24 (DEV_ROADMAP_2026-05-25-PM.md) for *new feature tickets only*
**Source inputs:** v24 priority stack (unchanged below) + founder feature directives (this pass)

> v24's infra/launch priority stack is **unchanged and still governs launch** (PUSH `a3be2ae` → EAS Build → migrations). The tickets below (TICKET-051…059) are **new product work** queued behind launch unless marked otherwise. Numbering continues from TICKET-050.

---

## Coordinator summary — what the founder asked for

Five workstreams were requested this pass:

1. **Rankings must work + a tier ladder.** The Rankings tab currently errors on open. Fix it. Then add an *overall* strength score driven by a **new, simpler sex-only (univariate) percentile** — each lift ranked against same-sex trainees only (no bodyweight/age/experience), with the overall score being the **mean of the user's per-lift percentiles**. Map that overall score to a **Rocket-League-style tier ladder** (Bronze → Silver → Gold → Platinum → Diamond → Champ → Grand Champ) that is **deliberately top-heavy** (much harder to climb the higher ranks). → **TICKET-051, 052, 053**
2. **Rest-day logging is broken, invalidating streaks.** Fix end-to-end so an intentional rest day preserves the streak. → **TICKET-054**
3. **Set-logging UX regressed vs. the original C++/QML app.** Keep the current visual language but make **saved routines and the pre-prepped PPL / Upper-Lower splits easily accessible from the logging surface**, with one-tap drill-in to the exercise you want — while **keeping the new PB-on-select context**. Make it cleaner / more exciting; theming mockups attached. → **TICKET-055, 056, 057**
4. **Finish/extend the existing Haiku plan generator.** `POST /plans/generate` already works (paid-gated, constraint-aware, Haiku 4.5). Close the gaps that make it feel unfinished — chiefly: no way to *log* a generated session, brittle name→ID resolution, single-session only, no cost throttle. → **TICKET-058** (+ requirements writeup, below)
5. **Open questions** were resolved with the founder before writing (tier cutoffs, Haiku scope, set-logging scope, delivery format). See each ticket's *Notes*.

### New ticket index
| ID | Title | Area | Owner | Sev |
|----|-------|------|-------|-----|
| TICKET-051 | Fix Rankings tab crash on open | Mobile + Backend | dev-frontend + dev-backend | 🔴 P0 (feature-blocking) |
| TICKET-052 | Sex-only univariate percentile model (data analyst) | Data/Analytics | data-analyst | 🟠 P1 |
| TICKET-053 | Overall strength percentile + tier ladder (Bronze→Grand Champ) | Backend + Mobile | dev-backend + dev-frontend | 🟠 P1 |
| TICKET-054 | Fix rest-day logging so streaks stay valid | Backend + Mobile | dev-backend + dev-frontend | 🟠 P1 |
| TICKET-055 | Surface Routines + Starter Splits on the Log tab | Mobile | dev-frontend | 🟡 P2 |
| TICKET-056 | One-tap routine → exercise drill-in (keep PB-on-select) | Mobile | dev-frontend | 🟡 P2 |
| TICKET-057 | Set-logging visual polish + theming | Mobile (design) | dev-frontend | 🟢 P3 |
| TICKET-058 | Finish/extend Haiku plan generator | Backend + Mobile | dev-backend + dev-frontend | 🟡 P2 |
| TICKET-063 | Insert Peak Fettle brand logo (scatter + trendline lockup) | Mobile (branding/assets) | dev-frontend | 🟢 P3 |

(Focus-stepper tickets TICKET-059…062 are indexed in the Addendum further down. TICKET-063 — brand logo — is detailed at the end of this doc.)

---

## ⚙️ MODEL ROUTING FOR AGENT RUNS — read this first (founder decision, 2026-05-25 LATE-4)

**Strategy chosen:** *Sonnet runs the whole backlog; Opus is used only for TICKET-052, TICKET-053, and the final integration + verification pass.* Haiku is **not** part of this plan.

**When you launch a dev agent, find the row for the model it is running and do only those tickets:**

| Model running | Tickets this agent should complete |
|---------------|-------------------------------------|
| **Opus** | **TICKET-052** (sex-only percentile model) and **TICKET-053** (overall percentile + tier ladder) — the correctness/math-critical work. **THEN the final pass:** integrate all merged tickets and run the full-repo verification (see "Definition of done" below). Nothing else. |
| **Sonnet** | **Everything else:** TICKET-051, 054, 055, 056, 057, 058, 059, 060, 061, 062, **063**. This is the default workhorse lane — assume any ticket not assigned to Opus is yours. |
| **Haiku** | **Not used.** If a Haiku agent is spun up anyway, restrict it to purely mechanical, well-specified chores only — Outfit-font token rollout (TICKET-057 typography), the `plan_ready` notification copy fix (TICKET-058 #4), and adding `session_type` to the `GET /workouts` SELECT (TICKET-054). **Never** give Haiku the math/architecture tickets (052, 053, 059, 060) or anything requiring debugging judgment (051). |

**Cross-model run order (so agents don't deadlock on dependencies):**
1. **Sonnet first:** TICKET-051 (rankings screen must open before the tier UI can render on it).
2. **In parallel:** Opus can start TICKET-052 (model/SQL has no app dependency).
3. **Opus next:** TICKET-053 — needs 051 (Sonnet, screen opens) **and** 052 (Opus, the model) done.
4. **Sonnet, any time:** 054, then the set-logging chain 055 → 056 → (059, 060 stepper) → 061 → 062; 057 (theming/Outfit) and 058 can run alongside. **063 (brand logo) should land *after* 057** so the bundled Outfit font + token exist for the wordmark to reuse (don't re-bundle the font).
5. **Opus last:** the final integration + verification pass over everything merged.

**Definition of done — applies to EVERY ticket on EVERY model (non-negotiable, model-independent):**
- Parse-sweep `mobile/app` + `mobile/src` with `@babel/parser` (jsx+typescript) **and** `node --check` every server `.js`, **on the committed HEAD blobs, not just the working tree** (CLAUDE.md / CORRUPT-001). A passing "looks done" is not done until the sweep is clean — this is exactly what masked PUSH-002 and CORRUPT-001.
- This sweep is *also* the core of the Opus final pass in step 5.

---

# TICKET-051 — Fix Rankings tab crash on open
**Owner:** dev-frontend + dev-backend
**Date opened:** 2026-05-25
**Sev:** 🔴 P0 (feature is completely inaccessible)
**Area:** `mobile/app/(tabs)/rankings.tsx`, `mobile/src/hooks/usePercentile.ts`, `peak-fettle-agents/server/routes/percentile.js`

## Problem
Opening the Rankings tab errors out. The screen is wrapped in `TabErrorBoundary` (so the user sees a "Something went wrong" card rather than a hard JS crash), which means the failure is either a **render-time throw inside `RankingsScreen`** or an **unhandled shape from `GET /percentile`** that the render code doesn't tolerate.

## Diagnosis steps (do these first — do NOT guess the fix)
1. Reproduce on a real account and capture the exact message from the `TabErrorBoundary` fallback **and** the Sentry stack.
2. Hit `GET /percentile` directly for that user and inspect the JSON. Confirm the response actually has the columns the SELECT claims:
   - `percentile.js` SELECTs `upr.cohort_size_internal`, joins `user_confirmed_1rm`, and references `upr.percentile_simple`, `upr.is_estimated`, `upr.model_version`. **Verify every one of those columns/tables exists in the live Supabase schema** (a missing column/table → 500 → surfaces as the error banner; a partial row → render throw). Cross-check against `all_migrations.sql` / `migrations/`.
3. Parse-sweep `rankings.tsx` and its imports with `@babel/parser` (jsx+typescript). Note: v24/CORRUPT-001 found `rankings.tsx` and `liftNames.ts` truncated in HEAD and repaired them in the working tree — **confirm the repaired blobs are the ones running** (origin/main may still carry the corrupt copies until `a3be2ae` is pushed). A truncated `liftNames.ts` (`liftIdToName`) would throw on the first card render.
4. Audit the most likely render-time throws in `RankingsScreen`:
   - `PercentileRankHeroCard`: sorts/derefs `rankings`; safe-guards exist but re-verify when `percentile` is `null` for all rows.
   - `confidenceRingTooltip(ranking.cohort_size_internal)` and `<ConfidenceRing cohortSize={…}>` when `cohort_size_internal` is `null`/`undefined`.
   - `ranking.wilks_score.toFixed(1)` is guarded by `!= null` — OK, but confirm the server always returns the key.

## Acceptance criteria
1. Rankings tab opens without triggering the error boundary for: (a) a brand-new user with **no** rankings, (b) a user with rankings where `percentile`/`percentile_simple` are `null` (batch not yet run), (c) a user with a full set of computed rankings.
2. Any genuinely missing schema object identified in step 2 is added via a migration in `migrations/` (named `20260525_*.sql`) and `node --check`'d.
3. Every value the render path derefs is null-guarded; no `.toFixed`/`.map`/`.sort` on possibly-undefined values.
4. The empty state (`EmptyState`) — not the error banner — is what a no-rankings user sees.
5. A regression test (component or e2e) renders `RankingsScreen` against each of the three fixtures in AC#1 without throwing.

## Notes
- Do **not** add an `is_paid` gate — percentile is free-tier (CTO guardrail, see the file header).
- This ticket is the prerequisite for TICKET-053 (tier ladder renders on this screen). Land 051 first.

---

# TICKET-052 — Sex-only univariate percentile model (data analyst)
**Owner:** data-analyst (math + SQL), reviewed by dev-backend
**Date opened:** 2026-05-25
**Sev:** 🟠 P1
**Area:** `data_analyst_skill.md`, `strength_curve_model.md`, `compute_percentile.sql`, `lift_vectors_seed.sql`
**Blocks:** TICKET-053

## Goal
Produce a **third, deliberately simple** percentile equation that the tier ladder will sit on top of. Today the model has two equations (`compute_percentile()` = sex×BW×age×training-years, and `compute_percentile_simple()` = sex+BW). The founder wants an even simpler **univariate-on-sex** measure:

> Each lift is ranked **only against trainees of the same biological sex** — *no* bodyweight normalisation, *no* age, *no* experience adjustment. A user's **overall strength percentile = the arithmetic mean of their per-lift sex-only percentiles.**

Rationale: this is the score a casual user intuitively expects ("how strong am I for a guy/girl?"), it is cheap to compute, and it produces a single 0–100 number that maps cleanly onto a tier.

## Acceptance criteria
1. **Math doc update** in `strength_curve_model.md`: add a "Sex-only univariate model (v2.1)" section. For each lift define a sex-keyed log-normal of *absolute* lifted load (kg) ignoring bodyweight: `pctile = 100·Φ((ln(L) − mu_sex) / sigma_sex)`. Document data sources (reuse the existing Bielik / OpenPowerlifting / StrengthLevel populations already cited; collapse out the bodyweight covariate by integrating over the population BW distribution per sex). Show one worked example per sex.
2. **Seed data**: extend `lift_vectors_seed.sql` with `mu_sex_m, sigma_sex_m, mu_sex_f, sigma_sex_f` columns (nullable; accessories inherit from their parent compound by the existing ratio mechanism). Keep `model_version` semantics; tag these as part of the v2.1 additive layer (do **not** delete v2 columns).
3. **SQL function** `compute_percentile_sex_only(lift_id, sex, weight_kg)` added to `compute_percentile.sql`, returning a 0–100 double. Undisclosed sex → average the two sex curves (mirror the existing `μ_mid`/`σ_mid` convention).
4. **Overall aggregation**: define `overall_strength_percentile(user_id)` = `AVG` of the per-lift sex-only percentile across the lifts the user has logged (use the same "best e1RM per lift" input the weekly batch already derives; min 1 lift). Document the **minimum-lifts** rule for a *stable* overall score and the founder's open choice in Notes.
5. Calibration sanity table: for each of ~5 anchor lifts, show what kg corresponds to the 50th / 90th / 99th / 99.9th sex-only percentile for each sex, and confirm it passes a smell test against known standards.
6. Findings-log row appended to `data_analyst_skill.md` per the standing methodology.

## Implementation plan
- This is primarily an **analysis + SQL** deliverable, not app code. Output is the updated three docs + the new function, ready for TICKET-053 to call from the weekly batch.
- Reuse existing population fits; the only genuinely new estimation is **marginalising out bodyweight per sex** (the existing model conditions on BW; here we want the unconditional same-sex distribution). The data analyst can do this analytically from the already-fitted conditional model + the population BW distribution — no new external dataset required.

## Open decisions for the founder (flagged, not blocking the math)
- **Min lifts for an overall score / tier:** recommend ≥3 distinct logged lifts before showing a tier (otherwise a single bench PR makes someone "Diamond"). Defaulting to 3 unless told otherwise.
- **Per-lift weighting:** recommend an unweighted mean (founder said "mean"). Squat/bench/deadlift weighting is a possible v2 but not in scope.

## Notes
- Keep the existing two equations intact and surfaced — this is **additive**. The two-score card (TICKET-033) stays; the tier is a *new* third lens.

---

# TICKET-053 — Overall strength percentile + tier ladder (Bronze → Grand Champ)
**Owner:** dev-backend (batch + API) + dev-frontend (UI)
**Date opened:** 2026-05-25
**Sev:** 🟠 P1
**Area:** weekly percentile cron, `percentile.js`, `mobile/app/(tabs)/rankings.tsx`, `mobile/src/types/api.ts`
**Blocked by:** TICKET-051 (screen must open), TICKET-052 (sex-only model must exist)

## Goal
Compute and display a single **overall strength tier** for the user, derived from the TICKET-052 overall sex-only percentile, using a **top-heavy** ladder.

## Tier ladder (founder-specified; top-heavy)
The three highest bands are **fixed by the founder**; the lower four are proposed here for data-analyst confirmation under the "much harder to climb the higher ranks" directive:

| Tier | Meaning | Overall percentile cutoff |
|------|---------|---------------------------|
| **Grand Champ** | Top 0.1% | ≥ 99.9 *(fixed)* |
| **Champ** | Top 1% | ≥ 99.0 *(fixed)* |
| **Diamond** | Top 5% | ≥ 95.0 *(fixed)* |
| **Platinum** | Top 15% | ≥ 85.0 *(proposed)* |
| **Gold** | Top 35% | ≥ 65.0 *(proposed)* |
| **Silver** | Top 60% | ≥ 40.0 *(proposed)* |
| **Bronze** | Everyone else | < 40.0 *(proposed)* |

Note the intentional widening of the gaps toward the top (Plat→Diamond is 10 points, Diamond→Champ 4, Champ→GC 0.9) so each higher tier is materially harder to reach. The four "proposed" rows are tunable by data-analyst in TICKET-052's calibration; the three "fixed" rows are not.

## Acceptance criteria
1. **Batch**: the weekly percentile cron computes, per user, `overall_strength_percentile` (TICKET-052 aggregation) and resolves it to a `tier` enum, persisting both to a new table/columns (e.g. `user_strength_tier(user_id PK, overall_percentile, tier, computed_at)`). Batch-only — **no live math per request** (CTO guardrail #2).
2. **Migration** `20260525_strength_tier.sql` creates the storage + a `tier` enum/check (`bronze|silver|gold|platinum|diamond|champ|grand_champ`).
3. **API**: `GET /percentile` response gains an `overall` object: `{ percentile: number|null, tier: string|null, computed_at, min_lifts_met: boolean }`. Null/`min_lifts_met:false` when the user has fewer than the TICKET-052 minimum logged lifts.
4. **UI**: Rankings tab shows a **tier hero** above the per-lift cards: tier name, a tier emblem/color, the overall percentile ("Top X%"), and a progress indicator toward the next tier. When `min_lifts_met` is false, show "Log N more lifts to earn your rank" instead of a tier.
5. Tier colors are defined as **design tokens** (not inline hex) so they theme correctly in both light/dark (coordinate with `mobile/src/theme/tokens.ts`; see TICKET-057 mockups for the palette).
6. The cutoffs live in **one** shared constant (server) — the client reads `tier` from the API and never re-derives cutoffs, so there is a single source of truth.
7. Graceful states: batch-not-run-yet (pending), no lifts (empty), tier present (full).

## Implementation plan
- **Backend/batch:** after the per-lift sex-only percentiles are written (TICKET-052 function), add a finalisation step that averages them per user, maps to a tier via the cutoff table, and upserts `user_strength_tier`.
- **API:** extend the `/percentile` SELECT/response in `percentile.js` to LEFT JOIN `user_strength_tier` and emit the `overall` object. Keep all existing fields (additive).
- **Mobile:** add `OverallTier` to `types/api.ts`; render a `TierHeroCard` in `rankings.tsx` above `PercentileRankHeroCard`. Reuse `PFProgressRing` for the "progress to next tier" arc.

## Test plan
1. Fixture users at the boundary of each tier (e.g. 94.9 vs 95.0) resolve to the correct tier.
2. A user with 2 logged lifts (below min) shows the "log more" state, not a tier.
3. Tier colors pass WCAG AA against both theme backgrounds.
4. Cutoffs changed in the server constant propagate to the client with no client change.

## Notes
- Founder directive verbatim: *"top .1 percent for gc, top 1 for champ, top 5 for diamond and so on; it should be much harder to traverse the higher ranks."* Honour the fixed top three exactly.
- Keep it free-tier (no paywall on tier).

---

# TICKET-054 — Fix rest-day logging so streaks stay valid
**Owner:** dev-backend + dev-frontend
**Date opened:** 2026-05-25
**Sev:** 🟠 P1
**Area:** `peak-fettle-agents/server/routes/workouts.js`, `mobile/src/api/workouts.ts`, `mobile/src/types/api.ts`, `mobile/src/hooks/useStreak.ts` + `useWorkoutHistory.ts`, `mobile/app/(tabs)/index.tsx`, `mobile/app/(tabs)/log.tsx`, the streak cron

## Problem
The founder reports rest-day logging is "broken" and streaks are invalid. The server **does** have the routes (`POST /workouts/rest-day`, `DELETE /workouts/rest-day/today`, writing `session_type='rest_day'`), so the break is in the **data round-trip and the streak definition**, not a missing endpoint:

1. **`GET /workouts` never returns `session_type`.** Its SELECT (workouts.js ~L180) returns `id,user_id,day_key,notes,created_at,updated_at` + aggregated set stats — **no `session_type`**. So the client cannot tell a rest day from a training day. `mobile/app/workout-day.tsx` already reads `workout.session_type === 'rest_day'`, but the list endpoint never populates it → the rest-day badge and any rest-aware logic silently see `undefined`.
2. **Two different streak definitions.** The client `computeStreak()` (useStreak.ts) counts **consecutive ISO weeks** with ≥1 workout *row* (any `day_key`), while the server route comments describe a **streak cron that counts `rest_day` as an active day** (a daily notion). These can disagree, so the number the user sees may not reflect the rest day they logged.
3. **Button state isn't hydrated.** `restDayLoggedToday` (index.tsx) and `restDayLogged` (log.tsx) both initialise to `false` with no fetch of *today's* status, so an already-logged rest day doesn't reflect in the UI across app restarts, and the rest-day affordance in log.tsx only appears while `totalSets === 0`.

## Acceptance criteria
1. `GET /workouts` returns `session_type` for every row (NULL coalesced to `'lift'` is acceptable, but the column must be present and accurate for `'rest_day'`). `Workout` type in `types/api.ts` gains `session_type?: 'lift' | 'rest_day' | 'cardio_import'`.
2. **One streak definition, documented and shared.** Decide (with PM) whether the canonical streak is weekly (current client) or daily (cron comments) and make server + client agree. Whichever is chosen, a logged **rest day counts as an active day/week** and therefore **preserves** the streak. Add a comment in `useStreak.ts` and the cron pointing at the shared definition.
3. `computeStreak()` provably counts a rest-day-only week/day as active. Add unit tests: (a) week with only a rest day → streak unbroken; (b) gap week with neither workout nor rest day → streak breaks; (c) rest day today in an otherwise empty current week → streak still "live".
4. The rest-day button reflects reality on mount: on app open, the client knows whether today is already a rest day (from the `GET /workouts` `session_type` for today, or a lightweight `GET /workouts/today`) and renders the "✓ Rest day logged — your streak is safe" state without requiring a tap.
5. The undo path (`DELETE /workouts/rest-day/today`) is wired to a visible affordance ("Actually, I worked out") and flips the button back; logging a set on a rest day also clears the rest-day flag for that day (a day with real sets is a training day, not a rest day).
6. Rest days are **excluded** from "real session" counts used for the paywall (this already exists in `countRealSessions`/NEW-002 — regression-test it still holds after the `session_type` plumbing changes).

## Implementation plan
- **Backend:** add `w.session_type` to the `GET /workouts` SELECT + GROUP BY; confirm `GET /workouts/:id` also returns it. Verify the streak cron's day/week logic matches the chosen canonical definition.
- **Mobile:** thread `session_type` through `Workout`; in `useWorkoutHistory.ts` keep feeding `computeStreak` (now session-aware). Hydrate rest-day button state on mount in both `index.tsx` and `log.tsx`; add the undo affordance.

## Test plan
1. Log a rest day → streak count does not drop; badge shows on the home + history; persists across app restart.
2. Undo the rest day → state reverts; logging a real set the same day converts it to a training day.
3. Skip a full week with no activity → streak breaks (rest day is the *only* thing that should save it).
4. Paywall session count unchanged by rest days (NEW-002 regression).

## Notes
- `workouts` is upserted on `(user_id, day_key)`; a day is therefore a single row whose `session_type` is the source of truth. Don't create a second row per day.

---

# TICKET-055 — Surface Routines + Starter Splits on the Log tab
**Owner:** dev-frontend
**Date opened:** 2026-05-25
**Sev:** 🟡 P2
**Area:** `mobile/app/(tabs)/log.tsx`, `mobile/app/templates.tsx`, `mobile/src/api/*` (templates/plans), `mobile/src/components/*`

## Context — what regressed
In the original C++/QML app (`qml/SetTrackerPage.qml`) the **log surface and the routine/template surface were the same screen**: a "Start Today's Workout" CTA, a **My Routines** strip (user-saved), and a **Starter Templates** strip (built-in PPL / Upper-Lower) all sat directly above the "Log a set" card, so a user could tap a routine and immediately start logging its exercises. In the production RN app these moved to a **separate `templates.tsx` screen** reached from elsewhere, and the Log tab (`log.tsx`) is a bare active-workout list + modal picker. The founder's complaint: **routines and the pre-prepped splits are no longer easily accessible from where you actually log.**

The founder does **not** want a full visual rewrite — keep the current RN look — just make routines/splits reachable in one tap from the logging flow.

## Acceptance criteria
1. The Log tab shows, above or alongside the active-workout list, two compact, collapsible strips:
   - **My Routines** — the user's saved routines (with the existing empty-state copy guiding them to "Save as routine").
   - **Starter Splits** — the built-in PPL and Upper/Lower templates, visually marked as built-in (star/badge), sourced from the same data as `templates.tsx` (GET /templates).
2. Tapping a routine/template opens a lightweight sheet listing its exercises (reusing the existing template-detail sheet from `templates.tsx` where possible) — **not** a navigation away to a different tab.
3. From that sheet, "Start" loads the routine into the current day's workout and drops the user into the per-exercise logging flow (handed to TICKET-056).
4. The strips are **dismissible/collapsible** so power users who just want the picker aren't pushed down the screen (mirror the QML "hide CTA after 10 sets" instinct: collapse the strips once the user has logged ≥1 set today).
5. No regression to the existing modal `ExercisePicker` / `SetEntryForm` free-entry path — routines are additive, not a replacement.
6. Reuse existing components/tokens; **no new color literals** (theme tokens only).

## Implementation plan
- Factor the template-detail sheet out of `templates.tsx` into a shared component so both the Templates screen and the Log tab render the same sheet.
- Add a `RoutinesStrip` + `SplitsStrip` to `log.tsx` fed by the existing routines/templates APIs. Keep them above the set list; collapse on first set of the day.
- Decide where "saved routines" live server-side (the QML app had a routine list; confirm the RN app's equivalent — likely `plans` with `is_template=false` or a dedicated routines table — and reuse it; do not invent a new store without checking).

## Test plan
1. New user: Starter Splits visible; My Routines shows empty-state.
2. Tap PPL "Push Day" → sheet lists its exercises → Start → lands in logging flow with the first exercise queued.
3. After 1 logged set, strips auto-collapse; can be re-expanded.
4. Free-entry logging still works unchanged.

## Notes
- This is the "easily accessible routines/splits" half of the founder's request. Visual polish is TICKET-057; the drill-in interaction is TICKET-056.

---

# TICKET-056 — One-tap routine → exercise drill-in (keep PB-on-select)
**Owner:** dev-frontend
**Date opened:** 2026-05-25
**Sev:** 🟡 P2
**Area:** `mobile/app/(tabs)/log.tsx`, `mobile/src/components/SetEntryForm.tsx`, `mobile/src/components/ExercisePicker.tsx`, `mobile/src/api/sets.ts` (`getPersonalBest`)
**Blocked by:** TICKET-055 (strips/sheet must exist)

## Goal
Recreate the QML app's fast path: once a routine/split is chosen, the user can **tap straight to the specific exercise they want** within that routine and start logging it — without retyping or hunting in the full library — **while keeping the new PB-on-select context** (when an exercise is selected, the user sees their personal best / suggested rep range for it, already wired via `getPersonalBest` in `log.tsx`).

## Acceptance criteria
1. After "Start" on a routine (TICKET-055), the Log tab shows that routine's exercises as an ordered, tappable checklist. Tapping any exercise:
   - opens `SetEntryForm` pre-filled with that exercise (no library search), and
   - displays the user's **PB / last-best for that exercise** and a suggested rep range, using the existing `getPersonalBest` path (this is the "context into what rep range to aim for" the founder wants preserved).
2. Exercises can be logged **in any order** (not forced sequential) — tapping exercise #3 first is allowed (QML parity: the QML app preloaded the first exercise but let you pick any).
3. Logged exercises in the routine show a ✓/checked state and set count, so the user can see session progress at a glance.
4. "Free" exercises logged outside the routine still appear in the day's set list and don't corrupt the routine checklist.
5. PB lookup is debounced/cached so re-tapping exercises doesn't spam `GET` (respect the existing caching in `sets.ts` if present; add light memoisation otherwise).
6. Works offline-first (PowerSync): selecting an exercise and logging a set queues normally; PB context degrades gracefully to "No PB yet" when offline/none.

## Implementation plan
- Maintain a `routineSession` state in `log.tsx`: `{ routineId, exercises: [{exerciseId, name, targetSetsReps, done, loggedSets}] }`.
- Reuse `SetEntryForm`'s existing PB display (already present per the `getPersonalBest`/`PersonalBest` import) — pass the selected exercise straight in, bypassing `ExercisePicker` search.
- Keep the modal `ExercisePicker` reachable via a "+ Add another exercise" affordance for off-routine work.

## Test plan
1. Start a routine, tap its 2nd exercise → form opens with that exercise + PB shown; log a set → exercise shows ✓ and "1 set".
2. PB context shows correct last-best and a sensible rep-range hint; shows "No PB yet" for a never-logged exercise.
3. Log an off-routine exercise via "+ Add another" → appears in day list, routine checklist unaffected.
4. Airplane mode: selection + logging still queue; PB context degrades without throwing.

## Notes
- Founder verbatim: keep "the new functionality where the user sees their pb in the workout they are about to record once the user selects the workout, allowing the user context into what rep range to aim for." Do **not** remove PB-on-select.

---

# TICKET-057 — Set-logging visual polish + theming
**Owner:** dev-frontend (with design input)
**Date opened:** 2026-05-25
**Sev:** 🟢 P3
**Area:** `mobile/app/(tabs)/log.tsx`, `mobile/src/theme/tokens.ts`, `mobile/src/components/SetEntryForm.tsx`, tier colors shared with TICKET-053

## Goal
Keep the current RN visual language but make the set-logging surface **cleaner and more exciting** — clearer hierarchy, a more rewarding "set logged"/PR moment, and a coherent palette that also houses the new tier colors. The founder asked for **theming options as visual renders**; three are attached (see *Theming mockups* below) for a pick.

## Typography — DECIDED (2026-05-25 LATE-4): Outfit
The app font is **Outfit** for **all** text (display, body, labels, numerals). Bundle Outfit via `expo-font` (variable or 400/500/700 weights), register it as the default text family, and expose it as a token in `theme/tokens.ts` (e.g. `typography.fontFamily`). Replace ad-hoc system-font usage on the set-logging surface (and ideally app-wide) with the Outfit token. Mockup reference: the "Outfit" card in `set-logging-font-options.html`.

## Acceptance criteria
0. **Outfit is the global text font.** It is bundled offline (no runtime network fetch), set as the default family, and consumed via a `theme/tokens.ts` token — no hard-coded font names scattered in components. Numerals use Outfit with `tabular-nums` where weights/reps/percentiles are shown.
1. The Log tab uses a single clear vertical hierarchy: (a) today header + streak/“live” state, (b) routines/splits strips (TICKET-055, collapsible), (c) active set list, (d) primary "Log a set"/"+ " action that is always full-width and never visually squished (the QML notes call out a past bug where the primary button got crushed by secondary actions — don't reintroduce it).
2. A satisfying confirmation on log: subtle haptic (already have `haptics`) + a brief animated affirmation; **PR sets get a distinct celebratory treatment** (badge + accent), consistent with the existing PR concept.
3. All colors come from `theme/tokens.ts`; the chosen theme option is implemented as token values (light + dark) and passes WCAG AA for text on each surface.
4. Tier emblem colors (TICKET-053) are defined here as tokens so rankings + logging share one palette.
5. Reduced-motion respected (`useReduceMotion`) — animations degrade to instant.
6. No functional regressions to logging; this is a presentation-layer ticket.

## Theming mockups
Three options were rendered for the founder this pass (saved alongside this roadmap as `set-logging-theme-mockups.html`):
- **Option A — "Midnight Turf"**: the current deep-navy + turquoise, tightened spacing, brighter accent on primary actions and PRs. Lowest-risk evolution of today's look.
- **Option B — "Summit"**: cooler slate base with an energetic lime/teal gradient accent and a bolder PR/streak celebration. More "exciting", still dark-first.
- **Option C — "Daybreak"**: a light-mode-leaning option with high-contrast cards and a warm accent, for users who train in bright gyms.
Founder to pick one (or mix); the chosen palette becomes the token set implemented here.

## Test plan
1. Visual QA on narrow (≈360px) and large phone widths — primary action never truncates.
2. Log a normal set vs a PR set — PR gets the celebratory treatment; normal set gets the subtle one.
3. Toggle reduce-motion — no animation, no layout jump.
4. Contrast audit on the chosen palette (both schemes).

## Notes
- Scope is **polish + theming only** — the founder explicitly said keep the current visuals, just cleaner and more exciting. No information-architecture changes beyond what TICKET-055/056 introduce.

---

# TICKET-058 — Finish/extend the Haiku-powered plan generator
**Owner:** dev-backend + dev-frontend
**Date opened:** 2026-05-25
**Sev:** 🟡 P2
**Area:** `peak-fettle-agents/server/routes/plans.js`, `mobile/app/(tabs)/plans.tsx`, `mobile/src/api/plans.ts`, `mobile/src/hooks/usePlans.ts`

## What already works (so we don't rebuild it)
`POST /plans/generate` is **live and reasonably hardened**: paid-tier gate (defence-in-depth on client + server), constraint hard-blocking (`user_constraints` + `exercises.contraindications`), 14-day history + 7-day health-metric context, profile context, Haiku 4.5 pinned (`claude-haiku-4-5`, `max_tokens:1024`, ~2.5¢/plan), a 30s timeout (NEW-005), structured 502/504 errors for bad/missing AI output, name→ID resolution, plan persistence, and a `plan_ready` push enqueue. The client `plans.tsx` has the upsell card, plan list, generate CTA, and a detail modal with reasoning. **This ticket finishes the rough edges — it does not rewrite the generator.**

## Requirements writeup — what "the custom workout powered by Haiku" needs to feel finished
Ordered by impact. Items marked **[no input needed]** can ship without founder decisions; items marked **[needs founder]** are flagged for a call before building.

1. **Log a generated session [no input needed].** Today a generated session is *displayed* but there's no one-tap path to turn it into a loggable workout. Add "Start this workout" that seeds the day's workout with the session's exercises and hands off to the TICKET-056 drill-in flow. This is the single biggest "unfinished" gap.
2. **Robust exercise name→ID resolution [no input needed].** `resolvedExercises` sets `exercise_id: null` when Haiku returns a name that doesn't exactly match (case-folded) a candidate. Null IDs break logging and PB lookup. Fix: constrain Haiku to emit the exact candidate string *and* add a fuzzy fallback (normalise punctuation/synonyms) on the server; if still unresolved, drop the exercise and backfill from the candidate pool so a session always has 4–6 resolvable exercises.
3. **Per-user generation throttle / cost guard [needs founder]** — there is a paid gate but **no rate limit**, so a paid user can spam `/generate` and run up Haiku cost. Recommend e.g. N generations/day. Founder to set N and whether over-limit is a hard block or a soft "are you sure".
4. **Notification copy mismatch [no input needed].** The `plan_ready` push says "workout program"/"training program" but the feature produces a **single session**. Align copy to "your workout is ready" until/unless multi-week ships.
5. **Regenerate / swap-an-exercise [no input needed].** Let the user regenerate the whole session or swap one exercise (re-prompt for a single replacement from the candidate pool, preserving the rest). Common expectation for AI workout tools.
6. **PB/rep-range grounding [no input needed].** Feed the same PB context used on the Log tab (TICKET-056) into the prompt so `reps`/`rpe_target` are anchored to the user's actual bests, and surface PB next to each generated exercise in the detail modal.
7. **Multi-week programming [needs founder]** — currently single-session. Extending to a structured multi-week block (progression, deloads — note TICKET-047 deload work) is a **product scope decision** (and a bigger token/cost footprint). Flagged, not in this ticket's default scope.
8. **Model/budget review [needs founder]** — `max_tokens:1024` truncates richer sessions; raising it and/or the 5k prompt-token guardrail has cost implications. Founder/CTO to confirm any budget change.

## Acceptance criteria (the [no input needed] set — ship these now)
1. "Start this workout" on a generated session creates/updates today's workout with the session's exercises and lands the user in the TICKET-056 logging flow; every exercise resolves to a real `exercise_id`.
2. Server guarantees a generated session contains **only resolvable exercises** (fuzzy match + candidate backfill); no `exercise_id: null` ever reaches the client.
3. "Regenerate" and per-exercise "Swap" work and respect constraints (swaps re-draw only from the constraint-filtered candidate pool).
4. Generated exercises show the user's PB and a suggested rep range in the detail modal, consistent with the Log tab.
5. `plan_ready` notification + any in-app copy says "workout", not "program".
6. All existing guard rails (paid gate, constraint block, 30s timeout, structured AI errors) remain intact and regression-tested.

## Acceptance criteria (the [needs founder] set — do NOT build until answered)
7. A per-user generation throttle exists with the founder-chosen limit and over-limit behaviour.
8. Any change to `max_tokens` / prompt-token budget is explicitly approved.
9. Multi-week programming is either scoped into its own ticket or explicitly deferred.

## Test plan
1. Generate → "Start this workout" → all exercises log-able, PB shown, no null IDs.
2. Force Haiku to return a near-miss name (fixture) → server fuzzy-resolves or backfills; client never sees null.
3. Swap one exercise → only that slot changes; constraints still honoured.
4. Free user → 403 unchanged; paid user over the (future) throttle → chosen behaviour.
5. Constraint user → contraindicated movements never appear, incl. after regenerate/swap.

## Notes
- Founder scope decision (this pass): **finish/extend the existing feature** rather than build a separate free generator. Items 3, 7, 8, 9 need a founder/CTO call before implementation; everything else is unblocked.
- Coordinate "Start this workout" with TICKET-056 so both the AI session and saved routines share one drill-in logging path.

---

## Sequencing & dependencies
1. **TICKET-051** (rankings crash) is a hard prerequisite for **TICKET-053** (tier UI lives on that screen).
2. **TICKET-052** (sex-only model) blocks **TICKET-053** (tier needs the overall percentile).
3. **TICKET-055** (strips/sheet) blocks **TICKET-056** (drill-in), and **TICKET-056** is the shared logging path reused by **TICKET-058 #1** ("Start this workout").
4. **TICKET-057** (theming) shares tier colors with **TICKET-053** — align tokens once, consume in both.
5. All of the above sit **behind the v24 launch gate** (push `a3be2ae` → EAS build → migrations) unless the founder pulls the rankings crash fix (051) forward as a pre-launch hotfix.

## Founder decisions still open (carried from the tickets above)
- Tier ladder: confirm the four "proposed" lower bands (Plat/Gold/Silver/Bronze) — the top three are locked.
- Overall score: confirm the min-distinct-lifts threshold (recommended 3) before a tier shows.
- Streak: confirm canonical definition (weekly vs daily) for TICKET-054.
- Haiku: generation throttle limit + behaviour; any token-budget change; whether to scope multi-week programming.
- Set-logging theme: pick Option A / B / C (or a mix) from the attached mockups.

*Roadmap v25 written by the workflow-coordinator pass — 2026-05-25 LATE. New tickets TICKET-051…058; numbering continues from TICKET-050. v24's launch priority stack is unchanged and still governs ship.*

---
---

# Addendum — Focus Stepper logging model (2026-05-25 LATE-2)

The founder reviewed the six structural layout options and **chose the Focus Stepper** (option 4) as the logging model, with modifications. This supersedes the "polish only / keep current structure" framing of **TICKET-057** — the structure is now decided. TICKET-057 remains the *theming/polish* ticket; the structure + interactions are specified below (TICKET-059…062). TICKET-055/056 (routines accessible on the log surface, one-tap drill-in, PB-on-select) feed into these.

Founder decisions captured this pass:
- **Stepper is the primary logging surface for everyone**, not just routine users. **DECIDED (LATE-3):** non-routine **free-tier** users get **Variant 1 (add-as-you-go)**; non-routine **paid-tier** users get **Variant 3 (smart-suggest)** with an extra **"Finish & save routine"** button beneath the suggestion (TICKET-062).
- **Routine management** — **DECIDED (LATE-3): Option A, a dedicated Routines page.** Option B (bottom-sheet builder) is dropped (TICKET-061).
- **Typography** — **DECIDED (LATE-4): Outfit** for the whole app (bundled offline, exposed as a `theme/tokens.ts` token). Specified in TICKET-057.
- **Off-routine add** uses **"ask where to place it"** (TICKET-060).
- **Switcher** lists **all routine exercises with completed ones marked** (TICKET-060).

### Addendum ticket index
| ID | Title | Owner | Sev |
|----|-------|-------|-----|
| TICKET-059 | Focus Stepper logging mode (core + Continue/Select buttons) | dev-frontend | 🟡 P2 |
| TICKET-060 | Exercise switcher sheet + off-routine "add to routine" placement prompt | dev-frontend + dev-backend | 🟡 P2 |
| TICKET-061 | Routine management — dedicated Routines page (Option A, decided) | dev-frontend | 🟡 P2 |
| TICKET-062 | Non-routine stepper — free: add-as-you-go; paid: smart-suggest + save routine (decided) | dev-frontend + dev-backend | 🟡 P2 |

---

# TICKET-059 — Focus Stepper logging mode (core)
**Owner:** dev-frontend
**Date opened:** 2026-05-25
**Sev:** 🟡 P2
**Area:** `mobile/app/(tabs)/log.tsx`, new `mobile/src/components/StepperLogger.tsx`, `SetEntryForm.tsx`, `mobile/src/api/sets.ts` (`getPersonalBest`)
**Builds on:** TICKET-055 (routines accessible), TICKET-056 (one-tap drill-in + PB-on-select)

## Goal
Make logging a **one-exercise-at-a-time, full-screen stepper** the primary set-logging experience. Each step focuses on a single exercise: large exercise name, PB + suggested rep-range context, large weight/reps fields, and a full-width **Log set** action. Multiple sets per exercise are logged in place (set 1, set 2, …) before advancing.

## Behaviour after a set is logged — the two-button pattern (founder spec #1)
Replace the generic "Next exercise →" with **two** explicit actions:
1. **Primary:** `Continue to <next exercise name>` — the button **names the actual next exercise** in the routine, e.g. "Continue to Shoulder Press". On the final exercise this becomes **"Finish workout"**.
2. **Secondary:** `Select different exercise` — opens the switcher sheet (TICKET-060).

## Acceptance criteria
1. Routine sessions render as a stepper: progress indicator ("Exercise 3 of 5" + dots), current exercise name, PB/last-best + suggested rep range (reuse `getPersonalBest` from TICKET-056), weight/reps fields, full-width "Log set".
2. The primary advance button's label is **dynamic** and shows the next exercise's name; last step shows "Finish workout".
3. Logging a set keeps the user on the current exercise and increments the set counter (set 1 → set 2 …); a small per-exercise set history is visible. Advancing is always an explicit tap (never auto-advance).
4. Progress dots are tappable to revisit any exercise (jumps via the same path as the switcher).
5. "Select different exercise" is always available as the secondary action (TICKET-060).
6. PB-on-select context is preserved exactly (founder requirement); shows "No PB yet" gracefully.
7. Reduce-motion respected (`useReduceMotion`); transitions degrade to instant. Offline-first via PowerSync — selecting/logging queues normally.
8. Non-routine sessions also use the stepper — covered by TICKET-062 (this ticket is the routine path + the shared stepper shell).

## Implementation plan
- New `StepperLogger` component owning `stepperSession` state: `{ source: 'routine'|'free', routineId?, exercises:[{exerciseId,name,target,loggedSets:[]}], currentIndex }`.
- Reuse `SetEntryForm` field/PB internals; the stepper is the chrome around it.
- `log.tsx` becomes the host: routine start (TICKET-055/056) seeds `stepperSession` and mounts `StepperLogger`.

## Test plan
1. Start a 5-exercise routine → step 1 shows correct PB; "Continue to <ex2>" names exercise 2.
2. Log 3 sets on one exercise without advancing → set counter increments; no auto-advance.
3. Tap progress dot 1 after reaching step 3 → returns to exercise 1 with its logged sets intact.
4. Last exercise → button reads "Finish workout"; finishing returns to the day summary.
5. Airplane mode → logging still queues; PB degrades to "No PB yet".

## Notes
- Founder requirement #1 verbatim: a button that states "continue to <next exercise name>" and another that says "select different exercise."

---

# TICKET-060 — Exercise switcher sheet + off-routine "add to routine" placement prompt
**Owner:** dev-frontend + dev-backend
**Date opened:** 2026-05-25
**Sev:** 🟡 P2
**Area:** new `ExerciseSwitcherSheet.tsx`, `ExercisePicker.tsx`, routine store + `routes/*` (routine CRUD), `StepperLogger.tsx`
**Blocked by:** TICKET-059

## Goal
Implement "Select different exercise" (founder spec #2) and the off-routine add flow (founder spec #3).

## Behaviour
- **Switcher sheet** (founder spec #2 + Q4 answer): a sheet listing **all exercises in the current routine, with completed ones marked** (✓ + set count); the current exercise is highlighted; tapping any routine exercise jumps the stepper to it. Below the routine list, a **"Browse library"** entry opens the existing `ExercisePicker` (full search) so the user can pick **any** exercise, including ones not in the routine.
- **Off-routine add prompt** (founder spec #3 + Q3 answer = *ask where to place it*): when the user selects an exercise that is **not** in the current routine, the stepper loads it immediately (logging is never blocked). A **dismissible prompt pinned to the bottom** asks: *"Add <exercise> to <routine> for next time?"* Tapping **Add** opens a **placement chooser** — **End of routine**, **After current exercise**, or **Pick position** (reorderable list) — and on confirm persists the change to the saved routine. Dismissing logs the set for today only and leaves the routine unchanged.

## Acceptance criteria
1. Switcher lists **all** routine exercises; done ones show ✓ + set count; current is highlighted; tap = jump.
2. "Browse library" opens `ExercisePicker`; selecting any exercise loads it into the current step.
3. Selecting an off-routine exercise does **not** block logging; the set logs to today regardless of the add decision.
4. The bottom add-prompt appears only for off-routine exercises, is dismissible, and does not obscure the Log action.
5. "Add" → placement chooser with the three placement options; **Pick position** offers a reorderable view; confirm persists to the routine definition (server) and updates progress dots/count + "Continue to <next>" labels.
6. Declining/dismissing makes no change to the routine.
7. Works offline: the add queues with other writes; UI reflects the pending state.

## Implementation plan
- Confirm where routines are stored (per TICKET-055 note — likely a routines table or `plans` with `is_template=false`); add/verify an endpoint to append/insert an exercise at a position and to reorder.
- `ExerciseSwitcherSheet` composes the routine list + a "Browse library" row that mounts `ExercisePicker`.
- Placement chooser is a small modal; "Pick position" reuses a drag-reorder list (shared with TICKET-061).

## Test plan
1. Open switcher mid-routine → all exercises listed, 2 marked done, current highlighted; jump works.
2. Browse → pick "Pec Deck" (not in routine) → loads into step; bottom prompt appears.
3. Add → choose "After current exercise" → routine now shows Pec Deck in that slot for future sessions; "Continue to <next>" relabels correctly.
4. Dismiss the prompt → today's set still logged; routine unchanged next session.

## Notes
- Founder requirements #2 and #3 verbatim drive this ticket; Q-answers: list = all (done marked), placement = ask where to place it.

---

# TICKET-061 — Routine management surface (dedicated Routines page)
**Owner:** dev-frontend
**Date opened:** 2026-05-25
**Sev:** 🟡 P2
**Area:** new `app/routines.tsx`, routine CRUD endpoints
**DECISION (2026-05-25 LATE-3): Option A — a dedicated Routines page.** Option B (bottom-sheet builder) is dropped; build Option A only.

## Goal
Give users a clean way to **create, edit, reorder, and delete routines** (founder spec #4: "set routines as a different page on the device or in another seamless manner"), delivered as a **dedicated Routines page** (Option A, chosen).

## Shared acceptance criteria (both options)
1. Create a routine (name + ordered exercise list with per-exercise target sets/reps).
2. Edit: add/remove exercises, **drag to reorder**, edit targets.
3. Delete a routine (with confirm).
4. Mark/launch a routine to start a stepper session (hands to TICKET-059).
5. Changes persist server-side and reflect immediately in the logger's quick-start (TICKET-055).

## Design (Option A — dedicated Routines page)
- A standalone screen (own tab or route pushed from the logger header) listing the user's routines, each with **Start** (launches the stepper, TICKET-059) and **Edit**.
- Built-in starter splits (PPL / Upper-Lower) shown as duplicable starting points.
- Full editor with drag-reorder and per-exercise target (sets × reps) editing.
- Reachable from: a Routines entry in nav, and the quick-start strip on the Log tab (TICKET-055).

## Test plan
1. Create a 5-exercise routine, reorder via drag, set targets → persists; appears in quick-start.
2. Edit an existing routine (add + remove) → reflected in the next stepper session.
3. Delete with confirm → removed everywhere.
4. Duplicate a starter split → becomes an editable user routine.

## Notes
- The drag-reorder list component is shared with TICKET-060's "Pick position" placement chooser.
- Mockup: see Section 2 / Option A in `set-logging-stepper-flow.html`.

---

# TICKET-062 — Stepper for non-routine / one-off logging (tier-split)
**Owner:** dev-frontend + dev-backend (paid gate + suggest endpoint)
**Date opened:** 2026-05-25
**Sev:** 🟡 P2
**Area:** `StepperLogger.tsx`, `ExercisePicker.tsx`, new Haiku "suggest next exercise" endpoint, `is_paid` gate
**DECISION (2026-05-25 LATE-3):** the non-routine stepper behaviour is **split by tier**:
- **Free tier → Variant 1 (add-as-you-go).**
- **Paid tier → Variant 3 (smart-suggest)**, with an additional **"Finish & save routine"** button shown beneath the suggested-next action.

## Goal
The stepper is the logging surface for **everyone**, including users with no saved routine. Behaviour now depends on tier.

### Free tier — Variant 1 (add-as-you-go)
Session starts empty; the user picks the first exercise (Browse), logs sets, then the primary button is **"+ Add next exercise"** (opens Browse) rather than "Continue to <name>". Open-ended progress (no "of N"). A secondary **"Finish"** ends the session. Lowest friction; no AI.

### Paid tier — Variant 3 (smart-suggest) + Finish & save routine
After each logged exercise the stepper proposes a likely **next** exercise (from recent history / muscle-group balance, generated by a lightweight **Haiku** "suggest next" call — same model/budget guardrails as the plan generator, TICKET-058). Surfaced as:
- **Primary:** `Continue to <suggested exercise>` (one tap to accept the suggestion).
- **Secondary:** `Select different exercise` (opens the switcher / Browse — TICKET-060).
- **Below those:** `Finish & save routine` — ends the session **and** saves the exercises just performed as a new named routine (feeds TICKET-061), so an ad-hoc paid session becomes a reusable routine in one tap.

## Acceptance criteria
1. Tier detection drives which non-routine UI renders (reuse the `is_paid` flag; server enforces the suggest endpoint as paid-only, defence-in-depth — mirror `plans.js`).
2. **Free:** "+ Add next exercise" + "Finish"; no AI calls; PB-on-select shown for each exercise.
3. **Paid:** smart-suggest with "Continue to <suggested>", "Select different exercise", and a distinct **"Finish & save routine"** button beneath them; PB-on-select shown.
4. The Haiku suggest call respects user constraints (no contraindicated movements) and recent history; it degrades gracefully (if it fails/times out, fall back to "+ Add next exercise" so logging is never blocked).
5. "Finish & save routine" creates a routine from the session's exercises (name prompt, sensible default) and it appears in the Routines page (TICKET-061) + Log-tab quick-start (TICKET-055).
6. Cost guardrail: the suggest call is cheap and rate-limited per the TICKET-058 throttle decision; never blocks the set log.

## Test plan
1. Free user, no routine → "+ Add next exercise" flow; no network AI call fires; logs land in today's sets.
2. Paid user, no routine → after logging, a constraint-respecting suggestion appears; "Continue to <suggested>" accepts it; "Select different" opens the switcher.
3. Paid "Finish & save routine" → routine created from the session; visible in Routines + quick-start.
4. Suggest endpoint as a free user → 403 (server gate); client shows the free-tier flow, no error surfaced.
5. Suggest timeout/failure (paid) → falls back to "+ Add next exercise"; logging unaffected.

## Notes
- Smart-suggest is intentionally a **paid** perk (consistent with AI plans being paid-tier); free users still get a fully functional stepper.
- Mockups: Variant 1 and Variant 3 are in Section 3 of `set-logging-stepper-flow.html` (Variant 3 will gain the "Finish & save routine" button per this decision).
- Variant 2 (build-then-step) is **not** being built; retained here only as rejected context.

---

# TICKET-063 — Insert the Peak Fettle brand logo (scatter + trendline lockup)
**Owner:** dev-frontend
**Date opened:** 2026-05-26
**Sev:** 🟢 P3 (branding; not launch-blocking)
**Area:** `mobile/assets/brand/peak-fettle-logo.svg` (source asset, already committed), in-app branding surfaces (splash / onboarding / auth header / "About"), `app.json`, depends on the Outfit font work in TICKET-057
**Depends on:** TICKET-057 (Outfit must already be bundled offline + exposed as a `theme/tokens.ts` token). Land 063 *after* 057.

## Goal
Adopt the founder-approved brand logo across the app's brand surfaces. The logo is a **vertical lockup**: a scatter plot whose **least-squares trendline rises left-to-right to a highlighted summit point** (the brand metaphor — strength trending up over time), with the wordmark **"Peak Fettle" set in Outfit (700)** centered directly beneath the graph. Brand colors: deep slate `#13415C` (axes, dots, wordmark) and teal `#0F9D8E` (trendline + summit). Source SVG: `mobile/assets/brand/peak-fettle-logo.svg`.

## Important rendering note (read before starting)
The source SVG embeds the Outfit font as a base64 `@font-face` so it renders correctly in browsers / design tools. **React Native (`react-native-svg`) does NOT honor an in-SVG `@font-face`** — `<SvgText>` resolves fonts against fonts registered with the RN runtime. So do **not** assume the embedded font will "just work" on device. Pick one of the approaches in AC#1 and confirm the wordmark actually renders in Outfit on a real device, not a fallback system font.

## Acceptance criteria
1. **The logo renders correctly on device** (iOS + Android), with the wordmark in **Outfit 700** — verified on a real build, not just in a browser preview. Use one of:
   - (a) Render the SVG via `react-native-svg` / `react-native-svg-transformer`, with the wordmark drawn as an RN `<Text style={{ fontFamily: <Outfit token from TICKET-057> }}>` (not as in-SVG `<text>` relying on the embedded face); **or**
   - (b) ship a high-res rasterized `@1x/@2x/@3x` PNG export of the lockup for fixed placements (splash/onboarding) where vector scaling isn't needed.
2. The logo appears on the agreed brand surface(s) — see the **open question** below; do not guess. At minimum it must be reachable somewhere a user sees branding (e.g. onboarding/auth header).
3. Brand colors are sourced from / consistent with the `theme/tokens.ts` palette (slate `#13415C`, teal `#0F9D8E`); if these become tokens, reuse them rather than hard-coding.
4. Light **and** dark scheme: the logo is legible on both. On dark backgrounds the slate elements (axes/wordmark) must not disappear — provide a light-on-dark variant or a contrasting container.
5. If the OS **app icon** (`app.json` `icon` / `adaptiveIcon` / `favicon`) is in scope (see open question), a **mark-only** version (graph, no wordmark) is used — the full wordmark is illegible at icon sizes. Do not cram the lockup into the icon.
6. No layout regression on the screens the logo is added to; respects safe-area insets.

## Definition of done (model-independent — same as all tickets)
- Parse-sweep `mobile/app` + `mobile/src` with `@babel/parser` (jsx+typescript) and `node --check` every server `.js`, **on the committed HEAD blobs**, per CLAUDE.md / CORRUPT-001.
- Any new asset (PNG exports, mark-only icon) must be **committed AND pushed to origin/main** before an EAS build will see it — see the EAS section in CLAUDE.md (an unpushed `assets/*` reference fails prebuild with `ENOENT … ./assets/...`).

## Open questions — ASK THE FOUNDER, don't assume
1. **Where should the logo go?** Splash screen, onboarding, the auth/login header, an "About" screen, the in-app top bar — or some subset? (This lockup is tall; it suits splash/onboarding more than a compact nav bar.)
2. **Replace the OS app icon too?** If yes, we need a **mark-only** variant (graph without the wordmark) — confirm whether to produce that now or keep the current `icon.png`.
3. **Dark-mode treatment:** light-on-dark recolor of the same lockup, or place it inside a light card?
4. **One lockup or also a horizontal version?** Several horizontal + alternate-font iterations exist in `/logos/`; confirm this vertical Outfit lockup is the single canonical mark or whether a horizontal variant is also wanted for wide surfaces.

## Notes
- All explored logo directions live in the repo at `/logos/` with a comparison gallery at `Peak Fettle logos.html`; the chosen one is `scatter_09_outfit-stacked.svg` (copied to `mobile/assets/brand/peak-fettle-logo.svg`).
- The trendline is a genuine least-squares fit of the plotted points (slope ≈ −0.60 in screen space, R² ≈ 0.85) — it intentionally rises to the right and ends on the summit point. Keep that property if the mark is ever regenerated; don't replace it with an arbitrary diagonal.
