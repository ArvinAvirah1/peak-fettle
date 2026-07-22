# Peak Fettle — Complete Dev Next Steps
**Generated:** 2026-05-11  
**Source:** DEV_ROADMAP_2026-05-11.md (v9), ROADMAP.md, group_streak_credits_spec.md, peak_fettle_data_analyst memory, full codebase scan  
**Status:** Reference doc — supersedes the "Recommended Action Order" section of the roadmap

---

## How to read this doc

Steps are ordered by dependency. Each step lists: what to do, where the relevant file lives, and what it unblocks. Do not skip ahead of a gate item (marked **🔒 GATE**) without the listed prerequisite being satisfied.

---

## PART 1 — TODAY (2026-05-11)

---

### Step 1 — Open the Phase D Quick-Fix Sprint PR

**What:** All five quick-fix items (AA-01, AA-03, Z-04, Z-05, AA-02) are code-verified on disk as of this morning. They have not been merged yet. Open a single PR now.

**Exact files changed:**
- `peak-fettle-agents/server/routes/sets.js` — reps min changed from 0 → 1 (AA-03)
- `marketing-site/src/app/layout.tsx` — viewport/themeColor moved to `export const viewport` (Z-04)
- `marketing-site/src/app/api/waitlist/route.ts` — in-memory `seenEmails` Set with 10k LRU cap (Z-05)
- `migrations/20260503_exercise_prs.sql` — AA-02 doc-block added explaining weight_raw / 8.0 pattern
- `.github/workflows/cleanup-orphaned-auth.yml` — new file, runs `cron/cleanup-orphaned-auth.js` on `0 */6 * * *` (AA-01)

**PR description should include:** the table from `DEV_ROADMAP_2026-05-11.md` §5B. Each fix is one logical change; bundle them in one PR but keep commits atomic for review.

**Before merging:** confirm CI (`ci.yml`) passes — specifically that `sets.js` tests still green after the Zod min change.

**What this unblocks:** Closes the last MEDIUM severity gap (GDPR orphaned-auth gap). Eliminates all LOW items. Roadmap is clean with zero open engineering issues post-merge.

---

### Step 2 — Send `TESTER_PROMPT_2026-05-11-QUICK-FIX.md` to Beta Testers

**What:** The tester prompt is already written at `TESTER_PROMPT_2026-05-11-QUICK-FIX.md`. Route it now to all four beta personas (beta-beginner, beta-casual-gymgoer, beta-competitive-lifter, beta-runner).

**Expected output:** Testers file `pf-tester-feedback-2026-05-11.md` in the project root. If everything is green, Quick-Fix Sprint is officially closed and the roadmap advances.

**If red/yellow items come back:** dev-prompts picks them up in the next session before moving to Step 5+.

---

### Step 3 — Separately Nudge Testers on TICKET-025 (Group Streak Credits Staging)

**What:** TICKET-025 has been awaiting human sign-off since 2026-05-09. The 9-item staging checklist lives in `TESTER_PROMPT_2026-05-09-TICKET-025.md`. No response has been received.

**Action:** Send a pointed follow-up directly to beta-competitive-lifter and beta-casual-gymgoer (the personas most likely to exercise the Group Streak Credits flow). Ask for one of: ✅ verified / ⚠️ caveat / ❌ broken, per checklist item.

**Why this is urgent:** TICKET-025 sign-off is the **🔒 GATE** for TICKET-027 (PowerSync offline sync). PowerSync has been ready to go for days and is being held exclusively by this human confirmation.

---

## PART 2 — DATABASE MIGRATIONS (This Week, No Gate)

---

### Step 4 — Apply the Percentile v2 Schema Migration

**What:** The v2 percentile model (strength_curve_model.md, compute_percentile.sql) requires two schema changes that have not been applied to the database. They are documented as ALTER statement comments inside `compute_percentile.sql`.

**Exact changes to apply:**

```sql
-- Make bw_ref_kg and training_floor nullable (accessory lifts inherit from parent, have no direct value)
ALTER TABLE lift_vectors
  ALTER COLUMN bw_ref_kg    DROP NOT NULL,
  ALTER COLUMN training_floor DROP NOT NULL;

-- Add pop_mu and pop_sigma for the "simple" population-level percentile function
ALTER TABLE lift_vectors
  ADD COLUMN IF NOT EXISTS pop_mu    FLOAT,
  ADD COLUMN IF NOT EXISTS pop_sigma FLOAT;
```

**How:** Create a new migration file `migrations/20260511_percentile_v2_schema.sql` with the above, apply it to Supabase via the dashboard or `supabase db push`. Do not edit the existing percentile migration files.

**After applying:** Run `lift_vectors_seed.sql` (it seeds model_version=2 rows). Verify with `SELECT model_version, COUNT(*) FROM lift_vectors GROUP BY model_version;` — you should see v1 and v2 rows for this audit cycle.

**What this unblocks:** The `compute_percentile_simple()` function (which reads pop_mu/pop_sigma) is broken until these columns exist. The confidence ring cohort size logic also depends on the v2 schema being present.

---

### Step 5 — Wire `waitlist_emails` Table (Cross-Instance Deduplication)

**What:** Z-05 fixed duplicate waitlist signups with an in-memory Set. This works within one serverless instance but not across cold-start instances or different regions. The spec calls for a `waitlist_emails` Supabase table as the cross-instance fix.

**Create migration** `migrations/20260511_waitlist_emails.sql`:

```sql
CREATE TABLE IF NOT EXISTS waitlist_emails (
  email      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No RLS needed — this is insert-only from the server-side service role.
```

**Update `marketing-site/src/app/api/waitlist/route.ts`:** After the in-memory Set check passes, attempt `INSERT INTO waitlist_emails (email) VALUES ($1) ON CONFLICT (email) DO NOTHING` using the Supabase service client. Check `rowCount`: if 0, it was a duplicate — short-circuit the same way the in-memory guard does. Keep the in-memory Set as a fast first-pass cache (avoids DB roundtrip for hot duplicates).

**Env requirement:** The waitlist API route needs `SUPABASE_SERVICE_ROLE_KEY` available in the marketing-site's Vercel environment. Add it to Vercel project settings under Environment Variables → Production.

---

## PART 3 — AFTER TICKET-025 SIGN-OFF 🔒 GATE

*Do not begin Step 6 until TICKET-025 beta tester sign-off is received in writing.*

---

### Step 6 — TICKET-027: PowerSync Offline Sync Integration

**What:** Wire PowerSync into the production mobile app and verify end-to-end offline behavior. The infrastructure is already built: `mobile/src/db/connector.ts`, `mobile/src/db/powerSyncClient.ts`, `mobile/src/context/PowerSyncContext.tsx`, `mobile/src/db/schema.ts`, and `sync-rules.yaml` are all written and in place. This step is about testing, production config, and patching any schema gaps.

**Step 6a — Verify sync-rules.yaml covers all current tables.**  
The current `sync-rules.yaml` (generated 2026-05-03) predates Phase C additions. Check that the following tables are covered:
- `daily_health_metrics` (added in `20260504_daily_health_metrics.sql`) — must be in `user_private` bucket
- `user_constraints` (added in `20260504_user_constraints.sql`) — must be in `user_private` bucket
- `exercise_prs` (added in `20260503_exercise_prs.sql`) — verify it's in `user_private` or `global_library`

If any are missing, add them to `sync-rules.yaml` following the existing pattern (id alias for composite PKs, appropriate bucket).

**Step 6b — Set PowerSync service URL in mobile `.env`.**  
The production PowerSync instance URL and token endpoint need to be set. In `mobile/.env.production` (create if it doesn't exist):
```
EXPO_PUBLIC_POWERSYNC_URL=https://your-instance.powersync.journeyapps.com
```
This value comes from your PowerSync dashboard. The Supabase connector in `connector.ts` handles token fetch — confirm the Supabase project URL and anon key are already in the env.

**Step 6c — Smoke test offline behavior on a physical device (not simulator).**  
The test matrix:
1. Log in on a device with network connectivity. Confirm initial sync completes (SyncStatusBar shows "Synced").
2. Enable Airplane Mode. Log a workout (sets, reps, weight). Confirm data appears locally immediately.
3. Confirm `SyncStatusIndicator` shows pending/offline state.
4. Re-enable network. Confirm sync completes within ~30 seconds and data appears on the backend.
5. Repeat from a second device logged into the same account — confirm data propagates.

**Step 6d — Verify `usePowerSyncWorkout` and `usePowerSyncLog` hooks are used in the workout logging screen (`app/(tabs)/log.tsx`).**  
These hooks exist but confirm the log screen is actually consuming them rather than the raw REST API client. If it's still using `api/workouts.ts` directly for writes, swap it to the PowerSync-backed hooks so offline logging works.

**Step 6e — Update CI pipeline to include PowerSync config validation.**  
Add a step to `.github/workflows/ci.yml` that validates `sync-rules.yaml` is syntactically correct (PowerSync CLI has a `validate` command). This prevents a broken sync-rules deploy from silently killing offline sync.

---

## PART 4 — PROD ENVIRONMENT WIRING (Coordinate with Deployment)

---

### Step 7 — Wire Supabase Service Role Key in Production

**What:** `routes/user.js` calls `supabaseAdmin.auth.admin.deleteUser(userId)` for `DELETE /user/account`. The `supabaseAdmin.js` lib needs `SUPABASE_SERVICE_ROLE_KEY` in the production environment. This is currently a TODO comment in `user.js` and is low urgency at beta scale but must be done before public release.

**Action:** In your production host (wherever the Node.js backend is deployed — likely Railway, Render, or Fly.io based on the project structure), add `SUPABASE_SERVICE_ROLE_KEY` as an environment variable. Get the key from Supabase dashboard → Project Settings → API → Service role key (keep this secret — it bypasses RLS).

**Also:** Add the same key plus `SUPABASE_URL` and `DATABASE_URL` as GitHub Actions repository secrets (Settings → Secrets and variables → Actions) so the `cleanup-orphaned-auth.yml` workflow (AA-01) can execute. Without these secrets the workflow will fail every 6 hours with a missing-env error.

**Verification:** After wiring, trigger the `cleanup-orphaned-auth.yml` workflow manually via the `workflow_dispatch` button in the GitHub Actions tab. Confirm it runs to completion with either "0 orphans found" or a resolution count.

---

## PART 5 — PHASE 1 PRODUCT ITEMS (All Must Ship Before Public Release)

These five items are pre-launch requirements from `ROADMAP.md §Phase 1`. None of them have dev tickets yet. Create a ticket for each before starting work.

---

### Step 8 — ROADMAP 1.1: Jargon Glossary & Contextual Tooltips

**Target users:** Beginners (Derek), Casual (Jamie)  
**No existing component found** for this feature — build from scratch.

**Step 8a — Build the Glossary screen.**  
Create `mobile/app/glossary.tsx`. This is a searchable flat list of fitness terms. At minimum, define entries for: Set, Rep, 1RM, PR, RPE, Progressive Overload, Wilks Score, DOTS Score, Percentile, Normalized Strength Score, RIR (Reps in Reserve), Deload, Periodization, AMRAP. Each entry has a term, a one-sentence plain-English definition, and optionally a "learn more" link.

Store the glossary data in `mobile/src/utils/glossaryTerms.ts` as a typed constant array — this keeps it out of component state and makes it easy to extend.

Add a persistent `?` help icon to the global navigation header that opens the glossary as a modal. This must be reachable from every screen.

**Step 8b — Build the first-encounter tooltip system.**  
Create a `Tooltip` component in `mobile/src/components/Tooltip.tsx`. It wraps any text node and, on the first time a user sees it (tracked via a persisted Set in `AsyncStorage` keyed by term slug), shows an inline tooltip bubble with the glossary definition. On tap, it links to the full Glossary modal filtered to that term.

The "seen" tracking must use `AsyncStorage` so it persists across sessions. Key: `@peak_fettle/tooltip_seen` → JSON array of seen term slugs.

**Step 8c — Instrument the key screens.**  
Add tooltip wrappers to the following terms at minimum:
- `app/(tabs)/rankings.tsx` — wrap "Percentile", "DOTS Score"
- `app/(tabs)/log.tsx` — wrap "1RM", "RPE", "Set", "Rep"
- `app/(tabs)/plans.tsx` — wrap "Deload", "Periodization", "Progressive Overload"
- `app/onboarding.tsx` — wrap all technical terms in onboarding survey questions

---

### Step 9 — ROADMAP 1.2: Onboarding Survey Redesign

**Target users:** Beginners (Derek)  
**Existing file:** `mobile/app/onboarding.tsx`

**Step 9a — Restructure into two stages.**  
Stage 1 (Fast track — always shown, 3 questions max):
1. What's your primary fitness goal? (Build strength / Lose weight / Improve cardio / Stay active)
2. How experienced are you with working out? (Never done it / Some experience / Regular trainer / Competitive athlete)
3. How many days per week can you train? (1–2 / 3–4 / 5+)

Stage 2 (Deep dive — optional, prompted with "Want a more personalized plan? (2 min)"):
- Injury history / contraindications
- Available equipment
- Preferred training style
- Biological sex (per 1.6 spec: Male / Female / I'd rather not say, with the one-line explanation)

**Step 9b — Make Stage 2 skippable with smart defaults.**  
If the user skips Stage 2, the AI plan generator must not error. In `routes/plans.js`, make all Stage 2 fields optional in the request schema. Apply sensible fallbacks: no contraindications (empty array), full gym equipment assumed, no sex bias (use undisclosed/midpoint distribution). Document these defaults with a comment in the route file.

**Step 9c — Store the "biological sex" field correctly.**  
Per the exec decision in `exec-percentile-decisions.md` and ROADMAP 1.6: sex is stored as `MALE | FEMALE | UNDISCLOSED` in the `users` table. Confirm the column exists (`sex` column is already in the `user_private` sync-rules bucket — it's there). Confirm it is excluded from all public API responses and PostHog analytics event payloads. Audit `routes/user.js` GET handler — strip the `sex` field before returning the user object to the client.

**Step 9d — Progress indicator.**  
Add a step indicator (e.g., "Step 1 of 2") to the onboarding screen. Stage 2 should have a clearly labeled "Skip for now" button, not a back button.

---

### Step 10 — ROADMAP 1.3: Rest Day Designation

**Target users:** Runners (Priya), All users  
**No existing component** for this — build fresh.

**Step 10a — Three-state day model.**  
The streak system currently distinguishes two states: workout logged vs. not logged. Add a third state: **planned rest day**. A planned rest day must not count against the streak or the weekly goal evaluation.

Add a `rest_day_logs` table:
```sql
CREATE TABLE rest_day_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  log_date   DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, log_date)
);
```
Create migration `migrations/20260511_rest_day_logs.sql`.

**Step 10b — Add REST API endpoint.**  
In `routes/workouts.js` (or a new `routes/restDays.js`): `POST /rest-days` with body `{ date: "YYYY-MM-DD" }` — inserts a rest_day_logs row. `DELETE /rest-days/:date` to un-designate a rest day. Both require auth.

**Step 10c — Update streak logic.**  
In the streak calculation (examine `cron/` or wherever streak is computed — likely streak reads from `streaks` table updated by a trigger or batch job): when determining if a day counts as a "miss", check for a `rest_day_logs` row first. If a rest day is logged for that date, do not count it against the streak. Do not award a workout credit either — it's neutral.

**Step 10d — Update the Group Streak Credits weekly job.**  
In `cron/group-streaks.js`, the goal-hit evaluation queries the personal goal subsystem. Ensure that when counting "workouts completed this week" for a given user, rest days are not counted as workout completions but also do not count as misses against the goal fraction calculation. A user who logs 3 workouts + 1 rest day on a "4 workouts/week" goal has hit 3 of 4 — their goal evaluation is based on workouts only.

**Step 10e — Mobile UI.**  
On the home screen calendar / streak view, add a "Log rest day" option (e.g., a long-press on a day, or a secondary button alongside "Start Workout"). Logged rest days should appear as a distinct visual state — e.g., a moon/bed icon — distinct from both the green checkmark (workout) and the red/grey (missed).

Add the `rest_day_logs` table to `sync-rules.yaml` under `user_private` bucket. Add `useRestDays.ts` hook in `mobile/src/hooks/`. Update `mobile/src/api/` with `restDays.ts` client.

---

### Step 11 — ROADMAP 1.4: Streak Messaging Overhaul

**Target users:** Beginners (Derek), Casual (Jamie)

**Step 11a — Audit all streak-related copy.**  
Search the mobile codebase for all strings containing: "missed", "broke your streak", "streak lost", "failed", "streak reset". Replace each with encouragement-first language:
- "You missed a day" → "Rest days happen — see you tomorrow 💪"
- "Streak broken" → "New streak starts now"
- "Streak reset" → "Every comeback starts somewhere"

**Step 11b — Proactive make-up window explanation.**  
The make-up window rules must be explained to the user *before* they miss a day — not after. Add a one-time educational banner that appears after the user's 5th logged session: "Life happens. If you miss a day, you have [X] hours to log a make-up session and keep your streak alive." Dismiss permanently with a "Got it" tap (persist dismissal in `AsyncStorage`).

**Step 11c — Override flag UX.**  
The streak override flag (streak_overrides table) must be triggerable via a single tap on the missed day in the calendar, not buried in settings. On the missed-day tooltip: show "Mark this as a rest day" and "Log a make-up session" as two distinct CTAs. Tapping "Mark as rest day" goes to Step 10's rest day flow.

**Step 11d — Streak loss notification copy.**  
If push notifications are enabled (`services/pushNotifications.ts`), any streak-related notification payload must use the same encouragement-first language. Audit the push payload construction and update accordingly.

---

### Step 12 — ROADMAP 1.5: Free-to-Paid Value Demonstration

**Target users:** Casual free-tier users (Jamie)

**Step 12a — Session count trigger.**  
In the home tab (`app/(tabs)/index.tsx`), add logic that checks the user's total logged session count (queryable from the `workouts` table via `useWorkoutHistory`). When `count === 5` (exactly), store a flag in `AsyncStorage` (`@peak_fettle/shown_plan_preview`) and, if not already set, navigate to the plan preview screen.

**Step 12b — Build the plan preview screen.**  
Create `mobile/app/plan-preview.tsx`. This screen shows a blurred/frosted-glass preview of what a personalized AI plan would look like for the user's logged data. The preview is *not* generated by a real Haiku call — it's a static template populated with the user's most-logged lifts and their weight class. The blur makes the detail unreadable.

Overlay copy: **"Here's what your personalized plan would look like"** (not "Upgrade now"). Below the blur: a CTA button "Unlock My Plan" → navigates to the paywall/subscription screen. Add a secondary "Maybe later" text link that dismisses without setting any block flag — this means the preview will reappear the next time session count reaches a new milestone (10, 20, etc.).

**Step 12c — Paywall screen.**  
Create or confirm `mobile/app/paywall.tsx` exists. It must show the concrete delta between free and paid: "Free: Set tracking, percentile rankings, exercise library. Paid: AI-generated personalized plans, deload weeks, plan history." Use the user's actual logged lifts in the copy where possible ("Your bench press plan would include…").

---

## PART 6 — PERCENTILE SYSTEM COMPLETION (Pre-Launch, 1.6)

The percentile engine (v2 math), backend routes, and ConfidenceRing component are all built. Two major pieces are missing.

---

### Step 13 — Open Powerlifting Reference Data Import

**What:** The `ROADMAP.md §1.6` requires importing the Open Powerlifting database as the reference population before launch. No import script exists in the codebase.

**Step 13a — Download the dataset.**  
Open Powerlifting provides a free CSV download at `https://openpowerlifting.gitlab.io/opl-csv/bulk-csv.html`. The main file is `openpowerlifting-YYYY-MM-DD.csv`, roughly 400–600MB. Download this and store it temporarily (do not commit to the repo).

**Step 13b — Write the import script.**  
Create `scripts/import_openpowerlifting.py` (Python, using pandas for large CSV handling):
1. Read the CSV in chunks (use `pd.read_csv(..., chunksize=10000)`)
2. Filter to: `Equipment == 'Raw'` (our percentile system is raw strength only)
3. Extract columns: `Sex`, `BodyweightKg`, `Age`, `Best3SquatKg`, `Best3BenchKg`, `Best3DeadliftKg`, `TotalKg`
4. Exclude rows where any of the three main lifts is null or ≤ 0
5. Map Sex: `M → MALE`, `F → FEMALE`
6. Insert into a new `reference_population` table (see below) — do not insert into the `lift_vectors` table, which stores model coefficients not raw data.

**Step 13c — Create the reference_population table.**  
Create migration `migrations/20260511_reference_population.sql`:
```sql
CREATE TABLE reference_population (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        TEXT NOT NULL,        -- 'open_powerlifting' | 'race_results'
  sex           TEXT NOT NULL,        -- 'MALE' | 'FEMALE'
  bodyweight_kg FLOAT,
  age           FLOAT,
  lift_id       TEXT NOT NULL,        -- matches exercises.name slug
  lift_kg       FLOAT NOT NULL,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON reference_population (lift_id, sex, bodyweight_kg);
```

**Step 13d — Update the percentile batch job.**  
The weekly `cron/percentile.js` job must use this reference data to supplement internal user data when computing `compute_percentile()`. If a cohort (sex + age bracket + experience band) has fewer than 30 internal users, blend in reference population data. The `compute_percentile.sql` functions already handle the math; the job just needs to feed them the right population.

**Step 13e — Race results import.**  
For cardio percentiles: find a public 5K/10K/half-marathon result dataset (e.g., race-results-api.com provides bulk downloads, or use the IAAF world statistics). Create `scripts/import_race_results.py` with the same pattern as Step 13b. Insert into `reference_population` with `source = 'race_results'` and appropriate `lift_id` slugs (e.g., `run_5k`, `run_10k`, `run_half_marathon`).

---

### Step 14 — Wire ConfidenceRing to Live Cohort Counts

**What:** `mobile/src/components/ConfidenceRing.tsx` exists. Verify it's receiving real cohort size data, not a static placeholder.

**Step 14a — Backend endpoint.**  
In `routes/percentile.js`, add a `GET /percentile/cohort-size?lift=<lift_id>&sex=<sex>&age_bracket=<bracket>&experience=<level>` endpoint that returns `{ internal_count: N, reference_count: M }`. This query runs against the `user_percentile_rankings` table and `reference_population` table.

**Step 14b — Mobile hook.**  
Confirm `mobile/src/hooks/usePercentile.ts` fetches this data or add a `useCohortSize(liftId)` hook. Pass the result to `ConfidenceRing` as props: `{ internalCount: N }`.

**Step 14c — Tooltip copy.**  
Per the exec decision: the ring tooltip must read: *"Your cohort has [N] Peak Fettle athletes. Rankings become more precise as more athletes join."* The reference population count must NOT be included in the displayed N — external data does not inflate user-facing cohort confidence.

---

## PART 7 — TICKET-013: Apple Watch SwiftUI Companion

**Status:** READY TO ASSIGN. No code exists yet. Assign to dev-frontend-native.

---

### Step 15 — Apple Watch SwiftUI Companion App

**Step 15a — Xcode project setup.**  
Add a new WatchKit App target to the existing iOS project (if there's an Xcode project under `peak-fettle-app/` or separate iOS folder). Target: watchOS 10+. Use SwiftUI lifecycle. Name: "Peak Fettle Watch".

**Step 15b — WatchConnectivity session.**  
Create `WatchConnectivityManager.swift` on both the iOS app side and Watch extension side. On iOS: activate `WCSession`, send `applicationContext` updates when new workouts complete. On Watch: receive context and update local state.

**Step 15c — Watch app screens (minimum viable).**  
Three screens only for v1:
1. **Active Workout screen** — shows current exercise name, last set logged (reps × weight), and a "Log Set" button.
2. **Log Set screen** — digital crown to pick reps (1–20), digital crown press to confirm. Weight is inherited from the last set logged for this exercise.
3. **Rest Timer screen** — countdown from 90 seconds (configurable in iOS app settings) with haptic alert at 0.

**Step 15d — HealthKit heart rate integration.**  
Request `HKQuantityTypeIdentifier.heartRate` permission. During an active workout, start an `HKWorkoutSession` (required for background HR reading). Write the active workout HR data to HealthKit with `HKWorkoutBuilder`. The iOS app's `services/healthKit.ts` already reads HealthKit data — this means Watch-logged HR will automatically feed into the `daily_health_metrics` pipeline once the workout ends.

**Step 15e — Complication.**  
Add a simple corner complication showing the current streak count (fetched via WatchConnectivity from the iOS app). This is a one-number display: "🔥 14" for a 14-day streak. Tapping launches the Watch app.

**Step 15f — Account provisioning pre-requisite.**  
You will need: an Apple Developer Program membership ($99/year, at `developer.apple.com`) to sign and distribute the Watch app (it's bundled with the iOS app). This should already be in place if you plan an App Store release. Confirm account status before starting Xcode work.

---

## PART 8 — GROUP STREAK CREDITS: LAST OPEN ITEM

---

### Step 16 — Build the Cosmetic Price List (Gates Decision 3)

**What:** Decision 3 (base credit rate = proposed 50) is deferred pending the cosmetic price list. The cosmetic catalog spec is out of scope for `group_streak_credits_spec.md` but is the gate for finalizing the batch job constants.

**Step 16a — Define cosmetic catalog (separate product task).**  
Produce a `cosmetics_catalog_spec.md` document with: item names, rarities (common / rare / epic / legendary), and prices in credits. Suggested price anchors to design around:
- Common item: 100–200 credits
- Rare item: 500 credits
- Epic item: 1,500 credits
- Legendary item: 5,000 credits

**Step 16b — Calibrate Decision 3.**  
With the price list in hand, apply the calibration formula from `group_streak_credits_spec.md §6`: pick a target (e.g., "10 weeks of streak ≈ one Rare item"). At 10 weeks, multiplier = `1 + 0.10 × 10 = 2.0×`. So `base × 2.0 = 500` → `base = 250`. Compare this to the proposed base of 50 — either adjust the base or adjust item prices. Write the rationale in the spec.

**Step 16c — Update the batch job constants.**  
In `cron/group-streaks.js`, find the `BASE_CREDITS` and `MULTIPLIER` constants (or wherever they're defined). Update them to the calibrated values. Also update the goal-difficulty modifier tier values (§6 of the spec) to be consistent with the price list.

**Step 16d — Update the spec.**  
Mark Decision 3 as ✅ Ratified in `group_streak_credits_spec.md §10`. Update the credit table in §6 with the finalized numbers. Change `status: Draft v2` to `status: Final` in the frontmatter.

---

## PART 9 — PHASE 2 TICKETING (Create Before Public Launch)

These are not pre-launch requirements but must be ticketed and scoped *before* launch so they're ready to ship in the first 60 days. No code needed yet — tickets only.

---

### Step 17 — Create Phase 2 Dev Tickets

Create the following tickets in the `tickets/` folder (follow the format of existing tickets like `TICKET-001-kg-lbs-toggle.md`):

**TICKET-028 — RPE Logging Field** (ROADMAP 2.1)  
Scope: Add optional `rpe` field (1–10 integer) to the `sets` table. Zod optional in `routes/sets.js`. UI: new stepper field in `SetEntryForm.tsx`, shown below the reps/weight fields, labeled "RPE (optional)". Add RPE trend chart to session history view. Add RPE tooltip (links to glossary from Step 8).

**TICKET-029 — 1RM Formula Selection** (ROADMAP 2.2)  
Scope: Add `onerm_formula` preference column to `users` table (`epley` default, enum: `epley | brzycki | lombardi | mayhew`). Expose in settings screen. All 1RM calculations in the mobile client and backend must respect this preference. Show formula name + equation in a settings info panel.

**TICKET-030 — Wilks/DOTS Formula Transparency** (ROADMAP 2.3)  
Scope: Add "How is this calculated?" link on any Wilks/DOTS display. Link opens a modal with the formula, variable definitions, and a worked example using the user's own numbers. Modal must state explicitly that DOTS drives the percentile ranking.

**TICKET-031 — Deload Week Support in AI Plans** (ROADMAP 2.4)  
Scope: Update the Haiku prompt in `routes/plans.js` to include deload week planning instructions. Deload weeks should appear in the plan calendar view with a distinct visual treatment and a tooltip explanation. Every plan for a user with >3 months of logged data should include at least one deload week per 4–6 week cycle.

**TICKET-032 — Exercise Demonstrations for Free Templates** (ROADMAP 2.5)  
Scope: Add a `demo_url` field to the `exercises` table (nullable, TEXT — a YouTube URL initially). Seed URLs for the top 30 most-logged exercises. Display a "Watch Demo" button in the exercise detail view. For high-risk movements (deadlift, squat, overhead press), add a safety note field (`safety_note TEXT`) and display it prominently.

**TICKET-033 — Session Data Export (CSV/JSON)** (ROADMAP 2.7)  
Scope: New endpoint `GET /user/export?format=csv|json` in `routes/user.js`. Returns all sessions with fields: date, exercise, sets, reps, weight_kg, rpe (if logged), notes. Implement the UI entry point in the profile settings screen. The GDPR data export (already live as `GET /user/data-export`) covers raw data — this is a user-friendly workout-history-only export.

**TICKET-034 — Cohort Graduation Batch Job Wiring** (ROADMAP 2.8)  
Scope: `cron/cohort-graduation.js` exists but needs to be wired to the push notification system and in-app notification banner. The job already computes inferred cohort — verify it updates `experience_level` in the `users` table and triggers a `POST` to FCM via the push notification service for the "You've been promoted" event. Schedule this job via a new GitHub Actions workflow running weekly (Sundays, after the percentile job).

---

## PART 10 — PHASE 3 PROVISIONING (Plan Ahead)

These are 90–180 day items but require accounts/access that take time to provision.

---

### Step 18 — Garmin Connect IQ Developer Account

**What:** ROADMAP 3.1 lists Garmin as Priority 1 for wearable integration (ahead of Apple Watch, which is being handled in Step 15). Garmin Connect IQ development requires a free developer account at `developer.garmin.com`.

**Action now:** Register for a Garmin Connect IQ developer account. Download the Connect IQ SDK. Familiarize yourself with the app types: Data Fields, Watch Faces, Activities, and Widgets. For Peak Fettle, the target is an **Activity** app that logs workout sets and syncs via Bluetooth to the phone app.

**No code yet** — just provisioning and orientation.

---

### Step 19 — App Store / Google Play Submission Prep

**What:** Public release requires App Store Connect and Google Play Console accounts.

**App Store Connect:** Requires Apple Developer Program ($99/year). Create App ID `com.peakfettle.app`. Configure bundle identifier, push notification entitlements, HealthKit entitlements, and WatchKit companion app entitlements in the Apple Developer portal before writing any distribution code.

**Google Play Console:** $25 one-time fee. Create an app listing for Peak Fettle. Configure the data safety form (you will need to declare: health and fitness data collected, account data, app activity). This form takes non-trivial time — start it early.

**Privacy policy:** Both stores require a privacy policy URL. The GDPR work (Phase C) is done on the backend; now write a user-facing privacy policy document and host it on the marketing site at `/privacy`. At minimum it must cover: data collected, how it's used, third-party processors (Supabase, PostHog, Sentry, FCM), how to delete your account, and the biological sex data handling policy (per exec decision: stored for computation only, not displayed or shared).

---

## Dependency Graph Summary

```
Step 1 (PR) ─────────────────────────────────────────────────────────┐
Step 2 (tester prompt) ──────────────────────────────────────────────┤
Step 3 (TICKET-025 nudge) ──→ [TICKET-025 SIGN-OFF] ──→ Step 6 (TICKET-027 PowerSync)
Step 4 (v2 migration) ──→ Step 13d (percentile batch wiring)
Step 5 (waitlist table) — no dependencies
Steps 8–12 (Phase 1 product) — no hard dependencies, build in parallel
Steps 13–14 (reference data + confidence ring) — Step 4 must be done first
Step 15 (Apple Watch) — no code dependencies; needs Apple Dev account
Step 16 (cosmetic price list → Decision 3) — no code dependencies
Step 17 (Phase 2 tickets) — no dependencies; do now while capacity allows
Step 7 (prod env secrets) — coordinate with production deployment
Steps 18–19 (provisioning) — start immediately, takes calendar time
```

---

## Ordered Priority List (What to Do First)

1. **Right now:** Steps 1, 2, 3 (PR, testers, TICKET-025 nudge)
2. **Today:** Step 4 (v2 migration), Step 7 (GitHub secrets for AA-01 cleanup workflow)
3. **This week:** Steps 8–12 (Phase 1 product items — all pre-launch gates)
4. **This week:** Step 17 (ticket creation for Phase 2 work)
5. **When TICKET-025 signs off:** Step 6 (PowerSync)
6. **This week/next:** Steps 13–14 (Open Powerlifting import + confidence ring wiring)
7. **Ongoing:** Step 5 (waitlist table), Step 15 (Apple Watch), Step 16 (cosmetics → Decision 3)
8. **Now to avoid calendar delay:** Steps 18–19 (account provisioning)

---

*Generated 2026-05-11. Next recommended update: after TICKET-025 sign-off received and Phase 1 product items are ticketed.*
