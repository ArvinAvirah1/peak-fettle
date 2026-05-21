# Peak Fettle — Dev Tickets from Beta Testing Round 1
**Source:** 6 beta personas (Marcus, Priya, Derek, Jasmine, Linda, Tyler)
**Date consolidated:** 2026-04-30
**Routed to:** dev-frontend, dev-backend (as flagged per ticket)
**Workflow rule:** Load `dev-context.md` before acting on any ticket. Do NOT load beta persona files, marketing docs, or cost analysis during implementation.

---

## Ticket Priority Legend

| Priority | Meaning |
|---|---|
| 🔴 P0 — Critical | Breaks core functionality or causes wrong data. Affects all users or a major segment. |
| 🟠 P1 — High | Significant friction; likely to cause churn. Raised by 3+ personas. |
| 🟡 P2 — Medium | Notable friction; raised by 1–2 personas. Fixable without architectural change. |
| 🟢 P3 — Low | Polish / enhancement. Won't cause churn but improves experience for specific segments. |

---

## TICKET-001 — Weight Unit Toggle (kg / lbs)
**Priority:** 🔴 P0
**Raised by:** Marcus (critical — causes wrong data), Derek (label unclear), Linda (no unit confirmation), Tyler (no onboarding confirmation)
**Team:** dev-frontend + dev-backend

**Problem:**
The app currently defaults to lbs with no mechanism for users to switch to kg. For users who train in kg (international users, competitive powerlifters, anyone following a kg-based program), this means every weight logged is systematically incorrect. Marcus logged "200" intending kg — the app stored 200 lbs. His entire session history is wrong.

The unit label is also small and easy to miss at point of entry — Derek, Linda, and Tyler all reported uncertainty about which unit they were logging in.

**Acceptance criteria:**
- [ ] Global unit preference (kg / lbs) added to user profile settings
- [ ] Unit preference asked explicitly during onboarding (step: "Do you train in kg or lbs?")
- [ ] All weight input fields display the user's preferred unit label prominently next to the input (not just as small grey placeholder text)
- [ ] All weight display values (graphs, session history, exercise detail, percentile rankings) reflect the user's unit preference
- [ ] Unit conversion applied consistently: if user switches from lbs to kg mid-history, display converts; stored values in DB should be in a single canonical unit (recommend kg) with conversion on render
- [ ] Weight class brackets in percentile ranking system must be unit-aware (display "93 kg class" or "205 lb class" based on preference)

**Implementation note:**
Store all weights in the database in kg as the canonical unit. Apply conversion on the client side based on `user.unit_preference`. This avoids double-storing and makes future conversions clean. Flag for dev-database to confirm schema supports a `unit_preference` field on the users table and that `workouts` table stores weight as a numeric field without unit baked in.

---

## TICKET-002 — Effort Notation: Add RIR, Add Explanations
**Priority:** 🟠 P1
**Raised by:** Marcus (prefers RIR over RPE), Priya (RPE opaque — would prefer RIR), Derek (RPE meaningless without context), Jasmine (RPE ambiguous — prefers RIR), Linda (RPE caused anxiety — no context), Tyler (skipped field entirely, felt confused)
**Team:** dev-frontend

**Problem:**
RPE (Rate of Perceived Exertion) is shown as a bare label with no explanation. 5 of 6 testers expressed confusion, anxiety, or outright skipping the field. Even experienced users (Marcus) prefer RIR (Reps in Reserve) as it maps more directly to observable reality — "I had 2 reps left" vs. "I rate this set an 8/10." The field is also presented as if it's expected to be filled in, causing users like Linda to feel they're doing it wrong when they skip it.

**Acceptance criteria:**
- [ ] Add RIR (Reps in Reserve) as an alternative effort notation option
- [ ] User preference for effort notation: RPE / RIR / None (hidden) — configurable in settings
- [ ] Default for new users: RIR with inline tooltip explaining it ("How many more reps could you have done? Enter 0–5, or skip.")
- [ ] RPE option retains tooltip: "RPE scale: 10 = couldn't do one more rep, 1 = very easy. Most sets land between 6–9."
- [ ] Both fields are explicitly marked as optional (label + "(optional)" text or greyed-out state)
- [ ] Consider: if effort notation preference is "None," hide the field entirely from set logging view

**Notes for dev-backend:**
Effort values stored in the DB should support both RPE and RIR — either as two separate nullable columns (`set_rpe`, `set_rir`) or a single `effort_value` with an `effort_type` enum. Flag for dev-database schema decision.

---

## TICKET-003 — Workout Storage: Save as Named Routine / Template
**Priority:** 🟠 P1
**Raised by:** Priya, Derek, Linda, Tyler — all 4 could not find how to save and return to a workout as a template
**Team:** dev-frontend + dev-backend

**Problem:**
After completing a session, users cannot find a way to save that workout as a named routine they can re-open and start from. Currently workouts appear to only exist as session history entries. 4 of 6 testers explicitly mentioned rebuilding their workout from scratch on their second session — a high-churn friction point for users with consistent training structures (which is most users beyond their first week).

**Acceptance criteria:**
- [ ] "Save as Routine" option available at end of session (session summary screen) and from session history
- [ ] User can name the routine (e.g., "Push A," "Upper Day," "Monday Chest")
- [ ] "My Routines" section accessible from home screen (1-tap access, not buried in nav)
- [ ] Starting a new session offers: "Start from a routine" or "Start blank"
- [ ] Within a plan (paid tier), exercises within a plan day can be saved as a routine
- [ ] Routines are editable (add/remove/reorder exercises without starting a new session)

**Notes:**
This feature alone is likely to significantly improve D7 retention for structured lifters. Prioritize above aesthetic improvements.

---

## TICKET-004 — Home Screen Navigation: "Start Workout" CTA Visibility
**Priority:** 🟠 P1
**Raised by:** Linda (4 minutes to find), Tyler (almost gave up), Derek (minor friction)
**Team:** dev-frontend

**Problem:**
The primary user action — starting a workout — is not immediately obvious on the home screen. Linda spent 4 minutes before finding it. Tyler nearly churned. For an app where the core loop is "open app → log workout → close app," the start action must require zero searching.

**Acceptance criteria:**
- [ ] "Start Workout" button is the primary CTA on the home screen — largest button, high-contrast, immediately above the fold
- [ ] Button is visible without scrolling on all standard phone screen sizes (375px and above)
- [ ] Consider: floating action button pattern or pinned bottom bar "Start Workout" that persists across views
- [ ] A/B test: current position vs. new prominent position — measure tap-to-first-set time

---

## TICKET-005 — Onboarding: First-Session Guided Flow
**Priority:** 🟠 P1
**Raised by:** Tyler (5 minutes confused before first set), Linda (couldn't navigate to workout start), Derek (minor — onboarding worked but unit not confirmed)
**Team:** dev-frontend

**Problem:**
New users are dropped into the app without a guided path to their first logged set. Tyler spent 5 minutes confused before logging a single set — during that time he nearly deleted the app. Onboarding needs to take a new user from signup to first completed set in under 2 minutes.

**Acceptance criteria:**
- [ ] Onboarding wizard (shown once, on first launch after signup) with steps:
  - Step 1: "What's your main goal?" (Muscle building / Strength / General fitness / Athletic performance / Other) — maps to template recommendation
  - Step 2: "Do you train in kg or lbs?" — sets `unit_preference`
  - Step 3: "Pick a starting template or build your own" — routes to static template or blank session
  - Step 4: First logged set (guided with tooltips on first encounter with RPE/RIR field)
- [ ] Skip option available on each step for experienced users
- [ ] Onboarding completable in under 2 minutes (benchmark: <3 taps per step)
- [ ] First-time tooltip on effort field: "This is optional — skip it for now"
- [ ] Onboarding state tracked (`users.onboarding_completed` boolean) — don't show wizard again after completed

---

## TICKET-006 — UI Transitions: Performance on Android
**Priority:** 🟡 P2
**Raised by:** Jasmine (noticeable stutter on Android), Priya (lag on exercise detail page)
**Team:** dev-frontend

**Problem:**
Navigation transitions — particularly entering exercise detail views and returning to the exercise list — exhibit noticeable lag on Android. This was described as a stutter or pause before the animation starts. On iOS the issue was less pronounced. For an app with a premium aesthetic positioning, janky animations break trust.

**Acceptance criteria:**
- [ ] Profile animation performance on Android (mid-tier device: Pixel 6a or equivalent)
- [ ] Exercise detail screen transition: target < 100ms latency before animation begins
- [ ] Investigate: is the delay due to data fetch (loading graph data on mount)? If so, skeleton/loading state should display immediately while data loads in background
- [ ] Use `InteractionManager.runAfterInteractions` (React Native) for any non-critical data loads that don't need to block the transition
- [ ] No perceptible frame drops during list → detail and detail → list navigation on target device

---

## TICKET-007 — Exercise Search: Abbreviation and Common-Name Synonyms
**Priority:** 🟡 P2
**Raised by:** Marcus ("rdl" returned no results), Jasmine ("RDL" returned no results — required full name)
**Team:** dev-backend + dev-database

**Problem:**
The exercise search does not handle common abbreviations (RDL, OHP, DB, BB, SL) or gym-floor shorthand. Advanced users search by abbreviation as a reflex — failing to return results breaks trust and slows session logging.

**Acceptance criteria:**
- [ ] Synonym/alias mapping for common abbreviations: RDL → Romanian Deadlift, OHP → Overhead Press, DB → Dumbbell, BB → Barbell, SL → Single Leg, etc.
- [ ] Search is case-insensitive
- [ ] Fuzzy matching: partial matches ("Romanian" matches "Romanian Deadlift," "RDL") — consider trigram search or simple prefix matching
- [ ] Alias table stored in database and admin-editable (not hardcoded)
- [ ] Benchmark: "RDL" search should return Romanian Deadlift as first result

---

## TICKET-008 — PR Detection and Badge
**Priority:** 🟡 P2
**Raised by:** Marcus (flat callout — expected this feature, was absent)
**Team:** dev-frontend + dev-backend

**Problem:**
When a user logs a set that constitutes a PR (new best weight at any rep count, or new best estimated 1RM), there is no acknowledgment. For competitive and motivated users, PR detection is a core retention mechanic — it provides an in-session micro-reward.

**Acceptance criteria:**
- [ ] On set completion, compare against user's history for that exercise
- [ ] If PR: subtle visual badge on the set row ("🏆 New PR" or similar) — in-session
- [ ] On session summary screen: aggregate PRs from the session highlighted at top
- [ ] PR types to detect: weight PR at a given rep count (e.g., new best 5-rep squat), E1RM PR
- [ ] PR history stored in `exercise_prs` table per user (dev-database to confirm or create table)
- [ ] PR notifications: optional push notification ("New bench press PR: 225 lbs × 3")

---

## TICKET-009 — Percentile Rankings: "Progress vs. Self" View
**Priority:** 🟡 P2
**Raised by:** Derek (discouraging to see low percentile — wants relative progress), Linda (opted out but wants a personal-progress alternative)
**Team:** dev-frontend + dev-backend

**Problem:**
Percentile rankings are motivating for intermediate/advanced users and for users who are mid-table. For beginners, seeing "22nd percentile" without context is discouraging and may accelerate churn. The feature is opt-out, but even opt-out users want a way to see their improvement over time in a structured way.

**Acceptance criteria:**
- [ ] Add "Your Progress" tab alongside or replacing percentile view for opted-out users
- [ ] "Your Progress" shows: lift history trend for top 3–5 tracked exercises (% improvement over 30/60/90 days)
- [ ] Percentile view: consider showing "You were at 18th percentile 3 months ago — now 22nd" (progress framing alongside rank)
- [ ] Opt-out copy: "Compare yourself to others" (plain) vs. current "percentile cohort" language — replace jargon throughout ranking screens

---

## TICKET-010 — Mixed Session Type: Lifting + Cardio in Same Session
**Priority:** 🟡 P2
**Raised by:** Jasmine (athletic training requires this — splitting one workout into two sessions is a deal-breaker for hybrid athletes)
**Team:** dev-frontend + dev-backend

**Problem:**
A session can currently only contain one type of exercise logging (lifting sets, or cardio). Hybrid athletes (the athletic performance segment), functional fitness users, and anyone who does a cool-down run or warmup bike session alongside lifting cannot represent one training session accurately.

**Acceptance criteria:**
- [ ] Within a single session, user can add both lifting blocks and cardio blocks
- [ ] Lifting block: set / reps / weight logging (existing)
- [ ] Cardio block: distance / time / pace (or duration + effort for steady-state)
- [ ] Session summary shows both blocks together
- [ ] Streak system counts any session with ≥1 block logged (already works by design — verify this holds for mixed sessions)
- [ ] Percentile system: cardio data not included in lifting percentiles (separate data, separate rankings if built later)

---

## TICKET-011 — Workout Storage: Exercise Swap Without History Loss
**Priority:** 🟡 P2
**Raised by:** Priya (tried to swap cable flyes for pec deck, deleted data)
**Team:** dev-frontend + dev-backend

**Problem:**
Swapping one exercise for another within a session or plan currently requires deleting the original exercise entry, which destroys its historical log data. Users on hypertrophy programs frequently swap exercises based on equipment availability or muscle response — they should not lose history to do this.

**Acceptance criteria:**
- [ ] "Swap exercise" option on any exercise within a session or plan
- [ ] Swap creates a new exercise entry for the remainder of that session forward; history logged under the original exercise is preserved
- [ ] Within a saved routine/plan, swap can be applied to: this session only, all future sessions, or all sessions (full replacement)
- [ ] Original exercise history remains accessible in exercise detail view

---

## Summary: Frequency Matrix

| Issue | Marcus | Priya | Derek | Jasmine | Linda | Tyler | Total |
|---|---|---|---|---|---|---|---|
| kg/lbs toggle | 🔴 | — | 🟡 | — | 🟡 | 🟡 | 4 |
| RPE unclear / prefer RIR | 🟡 | 🔴 | 🔴 | 🟡 | 🔴 | 🟡 | 6 |
| No saved routines/templates | — | 🔴 | 🔴 | — | 🔴 | 🔴 | 4 |
| Start Workout hard to find | — | — | 🟡 | — | 🔴 | 🔴 | 3 |
| Onboarding too long/confusing | — | — | 🟡 | — | 🔴 | 🔴 | 3 |
| Android transition lag | — | 🟡 | — | 🔴 | — | — | 2 |
| Exercise search (abbreviations) | 🔴 | — | — | 🔴 | — | — | 2 |
| No PR detection | 🔴 | — | — | — | — | — | 1 |
| Percentile discouraging for beginners | — | — | 🟡 | — | 🟡 | — | 2 |
| Mixed session (lifting + cardio) | — | — | — | 🔴 | — | — | 1 |
| Exercise swap deletes history | — | 🔴 | — | — | — | — | 1 |

---

## Recommended Implementation Sequence for Dev Team

**Sprint 1 (fix before any new users arrive):**
1. TICKET-001: kg/lbs toggle + onboarding unit confirmation
2. TICKET-002: RIR option + effort field explanations + mark optional
3. TICKET-003: Save as routine / My Routines section
4. TICKET-004: Promote Start Workout CTA

**Sprint 2 (retention improvements):**
5. TICKET-005: Onboarding guided first-session flow
6. TICKET-007: Exercise search abbreviation synonyms
7. TICKET-008: PR detection + badge
8. TICKET-006: Android transition performance

**Sprint 3 (segment expansion):**
9. TICKET-009: Progress vs. self view
10. TICKET-010: Mixed session type
11. TICKET-011: Exercise swap without history loss

---

*For questions on any ticket, route to exec-product-manager or back to testing team via the beta-context slice.*
