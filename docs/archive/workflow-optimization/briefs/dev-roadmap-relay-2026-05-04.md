# Dev Roadmap Relay — 2026-05-04 (Exec Feature Additions)
**Date:** 2026-05-04
**From:** Workflow Coordinator
**To:** dev-lead → dev-frontend, dev-backend, dev-database
**Source:** Competitive Intelligence Report (competition_analysis_exec_report.docx, May 3 2026) + Exec strategic synthesis
**Supersedes:** Nothing — additive to `dev-roadmap-relay-2026-05-01.md`
**Status:** PENDING EXEC RATIFICATION — features below are exec-recommended additions; confirm before assigning to sprint

---

## COORDINATOR INTAKE

The Competition Analysis Agent report (May 3 2026) has been reviewed at exec level. Four feature additions and one integration track have been approved for roadmap inclusion. This relay captures the scope, rationale, and acceptance criteria for each so dev can plan ahead without waiting for the next full roadmap cycle.

**Phase assignments are indicative.** Phase A and Phase B scope is locked. These additions are Phase C and Phase D candidates. Exact phase placement will be confirmed at the next exec roadmap review. Nothing here blocks current next-tasks.

---

## EXEC-APPROVED FEATURE ADDITIONS

### TICKET-011 — Transparent AI Plan Reasoning
**Phase:** C (AI plans track)
**Owner:** dev-backend + dev-frontend
**Priority signal:** Highest — this is the primary paid-tier differentiation vs. Fitbod, Future, Caliber

**What it is:**
Every AI-generated workout must display a one-line human-readable explanation of why it was recommended, derived from the user's logged history. The algorithm need not change — the transparency layer is the differentiator.

**Examples of reasoning lines:**
- "We increased your bench volume 8% because you hit RPE 7 last session, below your RPE 9 target."
- "Squat intensity held this week — your sleep score averaged 5.2 hrs over the last 3 nights."
- "Romanian deadlift swapped in for conventional — you flagged lower back tightness on Tuesday."

**Acceptance criteria:**
- Every generated workout session includes a `reasoning` field (string, 1–2 sentences max) returned by the plan generation endpoint.
- The reasoning is displayed in the workout detail view, collapsed by default, expandable on tap ("Why this workout?").
- Reasoning references at least one specific data point from the user's logged history (RPE, volume delta, sleep, injury flag).
- Reasoning is never generic ("Here is your workout for today" does not pass).
- If insufficient history exists (new user, <3 sessions logged), reasoning states this honestly: "You're new — this plan will adapt as you log more sessions."

**Backend contract (to be written before dev starts):**
```
POST /plans/generate
→ 200 {
    session: { exercises: [...] },
    reasoning: "string — 1-2 sentences citing specific history data point"
  }
```

---

### TICKET-012 — Injury & Limitation Constraint Filter
**Phase:** C (AI plans track, alongside TICKET-011)
**Owner:** dev-backend + dev-frontend + dev-database
**Priority signal:** High — Fitbod's most-cited 1-star complaint; significant underserved segment

**What it is:**
An onboarding and settings flow that captures the user's physical constraints (injuries, chronic conditions, equipment limits) and hard-blocks those movement patterns from ever appearing in AI-generated plans. This is a constraint filter, not a swap suggestion system — blocked movements never surface at all.

**Scope:**
- Onboarding step: "Any exercises or movements to avoid?" with a multi-select of common constraint categories (lower back, knee, shoulder, wrist, no barbell, no jumping, bodyweight only, etc.) plus free-text.
- Constraints stored per-user in a `user_constraints` table (see database schema below).
- Plan generation endpoint reads `user_constraints` before exercise selection and filters the candidate pool.
- Settings screen allows editing constraints at any time; plan regenerates on next session.

**Database schema:**
```sql
CREATE TABLE user_constraints (
    constraint_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    constraint_type TEXT NOT NULL,   -- e.g. 'lower_back', 'knee', 'no_barbell', 'custom'
    custom_note     TEXT,            -- free-text for 'custom' type
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, constraint_type)
);
```

**Exercise tagging requirement (dev-database):**
- Add a `contraindications` TEXT[] column to the `exercises` table.
- Seed each exercise with relevant contraindication tags matching the constraint_type vocabulary.
- Example: Barbell Back Squat → `['lower_back', 'knee']`; Push-up → `['wrist', 'shoulder']`.

**Acceptance criteria:**
- A user with `lower_back` constraint set never receives Romanian Deadlifts, Good Mornings, or conventional Deadlifts in AI plans.
- Constraints survive app restart and account migration.
- The free-text `custom_note` is passed to the AI plan prompt context so it can be referenced in reasoning (TICKET-011).
- Onboarding skip is allowed — constraints default to none.

---

### TICKET-013 — Smartwatch Integration
**Phase:** C/D (integration track — exact phase at exec review)
**Owner:** dev-backend + dev-frontend
**Priority signal:** High — wearable sync is a ✗ for Peak Fettle in the competitor matrix; Strava and Whoop lead here; Apple Watch mandatory for Future users

**What it is:**
Two-way integration with Apple Watch (primary) and Garmin (secondary). Reads heart rate, active calories, and sleep data to feed the AI plan adaptation engine. Writes completed workout sessions from Peak Fettle to the watch's native health store.

**Phase C scope (MVP):**
- **Apple Watch → Peak Fettle (read):** Pull resting HR, HRV (if available), sleep duration, and active energy from Apple HealthKit. Store in a `daily_health_metrics` table. Use these values as context signals in AI plan reasoning (TICKET-011).
- **Peak Fettle → Apple Watch (write):** Write completed workout sessions to HealthKit as `HKWorkout` objects so they appear in the Apple Fitness app and count toward Activity rings.
- **Apple Watch companion app (basic):** Passive — displays current workout plan and rest timer. Logging still happens on the phone. Full watch-native logging is Phase D.

**Phase D scope (future, do not build now):**
- Garmin Connect IQ integration (read-only HR + sleep).
- Watch-native set logging (log reps/weight directly from the wrist).
- Galaxy Watch / Wear OS support.

**Database schema (Phase C):**
```sql
CREATE TABLE daily_health_metrics (
    metric_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    resting_hr_bpm  INT,
    hrv_ms          NUMERIC(6,2),
    sleep_hours     NUMERIC(4,2),
    active_kcal     INT,
    source          TEXT NOT NULL DEFAULT 'apple_healthkit',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date, source)
);
```

**Acceptance criteria (Phase C):**
- HealthKit read permission requested during onboarding with clear explanation of use ("We read your sleep and heart rate to personalise your training load").
- `daily_health_metrics` populated daily via background refresh.
- AI plan reasoning (TICKET-011) can reference sleep and HRV when available: "Your HRV dropped 18% this week — we've reduced intensity to let you recover."
- Completed workouts appear in Apple Health → Workouts within 60 seconds of session completion.
- Watch companion app displays: current day's workout name, next exercise, rest timer countdown.
- All HealthKit data processing happens on-device or in Supabase only — no third-party health data transmission (see TICKET-014).

**Open decisions for exec (flag before Phase C starts):**
1. Apple Watch companion app: native SwiftUI or React Native watch extension?
2. Garmin: Phase C or defer to Phase D entirely?
3. Does smartwatch HR data gate AI plan changes automatically, or does the user approve intensity adjustments?

---

### TICKET-014 — Privacy Architecture Commitment
**Phase:** C (foundational — should land before or alongside TICKET-013)
**Owner:** dev-backend + dev-database
**Priority signal:** Medium-High — growing user concern post-MFP breach (March 2025); no competitor is leading with this; first-mover opportunity

**What it is:**
A technical and product commitment that Peak Fettle does not share user health data with third parties, enforced at the architecture level. This becomes a marketing claim and must be auditable.

**Scope:**
- Audit all current and planned third-party SDKs. Remove any analytics, crash reporting, or ad SDKs that transmit health or workout data off-device to non-Peak-Fettle endpoints. PostHog (self-hostable, already in stack) is acceptable if self-hosted.
- Add a data handling section to the privacy policy: explicit list of what is collected, where it is stored (Supabase, user's device, HealthKit), and a clear statement that workout and health data is never sold or shared with third parties.
- Add a "Your data" screen in the app: shows the user every data category stored, links to privacy policy, and includes a "Export my data" and "Delete my account" action (GDPR/CCPA compliance baseline).

**Acceptance criteria:**
- Charles Proxy audit of the production app shows zero outbound health or workout data to any domain except Peak Fettle's Supabase project and PostHog (if self-hosted).
- Privacy policy updated before public launch.
- "Your data" screen shipped with export and delete account flows functional.
- Marketing can credibly say "We don't sell your health data" with a link to the architecture doc.

---

### TICKET-015 — Percentile Rankings on Free Tier (Confirm Tier Placement)
**Phase:** C (percentile track — already planned; this ticket is a policy confirmation, not a build task)
**Owner:** exec-product-manager (decision) + dev-backend (implementation)
**Priority signal:** Critical — the report identifies this as "the most differentiating free-tier move in the market"

**What it is:**
This ticket exists to formally confirm the exec decision that percentile rankings are a **free-tier feature**, not a paid-tier gate. The backend and paywall logic must reflect this before percentile launch.

**Context from competitive report:**
- Hevy wins the free tier by default — it doesn't gate core tracking.
- Strava gates segment leaderboards behind Summit ($11.99/mo).
- No competitor gives away competitive ranking data for free.
- Pairing a generous free tier with visible competitive data is Peak Fettle's most differentiating acquisition move.

**Decision required from exec-product-manager:**
- Confirm percentile rankings (basic cohort-matched percentile by age/weight class) are free-tier.
- Confirm which percentile features, if any, are paid-tier (e.g., historical percentile trend graphs, cross-exercise ranking leaderboards, downloadable rank card customisation).

**Acceptance criteria (once decision is confirmed):**
- Paywall logic in the backend does not gate the basic percentile score display.
- Free-tier users see their percentile rank on the exercise detail screen after logging sufficient history (minimum 3 sessions with that exercise).
- Paid-tier percentile features (TBD by exec-PM) gated appropriately.

---

## OPEN DECISIONS ADDED BY THIS RELAY

Added to the running blockers list (these do not block current Phase A/B tasks):

5. **TICKET-011 reasoning generation** — Does the reasoning string come from the AI model as part of the plan prompt, or is it a rule-based post-processor on top of the exercise selection algorithm? Impacts backend architecture.
6. **TICKET-013 watch companion** — Native SwiftUI vs React Native watch extension for Apple Watch companion.
7. **TICKET-013 Garmin** — Phase C or defer entirely to Phase D?
8. **TICKET-013 intensity adjustment approval** — Auto-adjust training load based on watch HR/HRV data, or surface a suggestion the user approves?
9. **TICKET-015 percentile tier placement** — Confirm basic percentile is free-tier. Define which advanced percentile features (if any) are paid.

---

## PHASE ROADMAP OVERVIEW (UPDATED)

| Phase | Track | Status |
|---|---|---|
| A | Qt prototype hardening (8 tickets) | 🔄 Active |
| B | Production stack foundation (DB + backend + web) | 🔄 Active (parallel) |
| C | AI plans (TICKET-011 reasoning, TICKET-012 constraints, TICKET-013 watch MVP, TICKET-014 privacy, TICKET-015 percentile confirm) | 🔲 Pending exec ratification |
| D | React Native app, full watch-native logging, Garmin, push notifications, web mirror | 🔲 Future |

---

## FILES MODIFIED BY THIS RELAY

- `workflow-optimization/briefs/dev-roadmap-relay-2026-05-04.md` *(new — this file)*

## CHANGE LOG ENTRY

> `2026-05-04` — Workflow Coordinator added exec-recommended feature tickets (TICKET-011–015) derived from Competition Analysis Agent report (May 3 2026). Additions: transparent AI plan reasoning, injury/limitation constraint filter, Apple Watch + Garmin integration, privacy architecture commitment, percentile free-tier policy confirmation. All additions are Phase C/D candidates — Phase A/B scope unchanged. Five open decisions flagged for exec-product-manager before Phase C planning begins.
