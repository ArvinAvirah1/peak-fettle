# Peak Fettle Mind — Companion App Roadmap
*TICKET-072 output. Approved by founder 2026-05-29.*
*Builds on `COMPANION_APP_PITCH_2026-05-29.md`. Pitch decisions applied; open sub-questions resolved using pitch recommendations — override any in OPEN_QUESTIONS_FOR_FOUNDER.md.*

---

## Decisions applied (pitch defaults)

| Question | Applied decision |
|----------|-----------------|
| **Name** | **Peak Fettle Mind** (sibling brand, clear positioning) |
| **Platform priority** | **iOS-first** — single platform reduces App Store compliance risk; Android follows post-beta |
| **v1 scope** | Habits/streaks + mood check-ins + seeded exercise library + weekly recap. Screen-time = intention-only. AI reflection deferred to P4. |
| **AI in v1** | Deferred. No LLM in v1 — too sensitive for a first build without moderation infra. |
| **Screen-time depth** | Self-report only in v1. iOS FamilyControls/DeviceActivity entitlements are a P4 stretch goal. |

---

## Additional ideas incorporated (beyond original pitch)

The following were generated post-pitch and folded into the ticket map:

| Idea | Included in |
|------|-------------|
| Training–mood correlation insights | TICKET-077 (Insights v1) |
| Recovery awareness nudge (HRV + fatigue) | TICKET-077 (fast-follow flag) |
| Pre/post-workout mindset primes (cross-app) | TICKET-080 (cross-app loop) |
| Gratitude streaks with evidence framing | TICKET-075 (habit types) |
| Sleep quality self-report | TICKET-076 (mood check-in — sleep tag) |
| Body-doubling focus sessions | TICKET-P4-A (P4 backlog, not scoped yet) |
| Habit stacking with training events | TICKET-080 (cross-app loop) |
| Weekly wellbeing letter (push) | TICKET-077 (weekly recap) |
| Themed content packs (exam season, etc.) | TICKET-078 (content library) |

---

## Ticket index — Peak Fettle Mind (Phase M)

| Ticket | Title | Area | Priority | Blocked by |
|--------|-------|------|----------|------------|
| **TICKET-073** | Safety scaffolding — crisis resources, disclaimers, data policy | Infra + Legal | 🔴 P0 (ships first, gates all UI) | nothing |
| **TICKET-074** | Foundation — new Expo app, shared auth, entitlement flag, `mind_*` schema | Infra | 🔴 P0 | TICKET-073 |
| **TICKET-075** | Habits & forgiving streaks | Core feature | 🟠 P1 | TICKET-074 |
| **TICKET-076** | Mood check-ins (daily prompt, tags, optional note) | Core feature | 🟠 P1 | TICKET-074 |
| **TICKET-077** | Insights — weekly recap + training–mood correlation | Core feature | 🟠 P1 | TICKET-075, 076 |
| **TICKET-078** | Guided exercise library (breathing, grounding, reframing, gratitude) | Content | 🟠 P1 | TICKET-074 |
| **TICKET-079** | Notifications + push pipeline wiring (reuse TICKET-065 infra) | Infra | 🟡 P2 | TICKET-074 |
| **TICKET-080** | Cross-app loop — whole-person streak + pre/post-workout primes | Integration | 🟡 P2 | TICKET-075, 076 |
| **TICKET-081** | Security review + beta gate | QA / Security | 🟠 P1 (pre-ship) | TICKET-073…080 |

---

## TICKET-073 — Safety scaffolding (P0, ships first)

**Why first:** safety infrastructure must ship before any wellness UI. No screen in Mind is built without these guardrails in place.

**Deliverables:**
1. **Crisis resource component** — a `CrisisResourcesBanner` component (reusable across all Mind screens) that shows the 988 Suicide & Crisis Lifeline (US default), with locale-aware content lookup. Always visible on the mood check-in screen if mood score ≤ 2/5. Accessible from a permanent "Need help?" link in the app's settings.
2. **Onboarding disclaimer screen** — shown once at first launch: *"Peak Fettle Mind is a wellbeing tool, not a substitute for professional mental-health care. If you're in crisis, please reach out to a professional."* Requires explicit acknowledgement (tap "I understand") to proceed.
3. **Data handling declaration** — a plain-English in-app "How we handle your Mind data" screen: encrypted at rest, not shared/sold, GDPR-exportable, deletable. Links to the existing GDPR export (TICKET-014) and account deletion (TICKET-030) flows.
4. **Content safety rules document** (`mind/CONTENT_SAFETY.md` in the repo) — formalises: no calorie/weight hooks, no punishment mechanics, forgiving streaks only, no absolute privacy promises. Acts as a checklist for every future content PR.
5. **Legal plugin pass** — use the `legal` plugin to draft updated privacy policy language covering `mind_*` data categories. Flag for human review before shipping.

**Definition of done:** component library item renders on every mock screen; disclaimer shown and gated; data declaration accessible; `CONTENT_SAFETY.md` committed; legal plugin draft in `/legal/mind-privacy-addendum.md`.

---

## TICKET-074 — Foundation (P0)

**Deliverables:**
1. **New Expo app scaffold** at `mind/` in the repo root — same structure as `mobile/` (Expo Router, TypeScript, `useTheme()` token system copied/shared). Separate `app.json`, separate bundle ID (`com.peakfettle.mind`).
2. **Shared auth** — `mind/` app uses the same `/auth/login`, `/auth/refresh`, `/auth/logout` endpoints. The `apiClient` pattern copied from `mobile/src/api/client.ts`. Single account, two apps.
3. **Entitlement flag** — `GET /user/profile` extended with `mind_access: boolean` (derived server-side from `is_paid`). Mind app checks at login; free users see an upsell screen, not an error.
4. **`mind_*` database schema** — migration `20260529_mind_schema.sql`:
   ```sql
   CREATE TABLE mind_habits (id UUID PK, user_id UUID FK, name TEXT, cadence TEXT, forgiving_rules JSONB, created_at TIMESTAMPTZ);
   CREATE TABLE mind_habit_logs (id UUID PK, habit_id UUID FK, user_id UUID FK, date DATE, status TEXT CHECK (status IN ('done','rest','skip')));
   CREATE TABLE mind_mood_checkins (id UUID PK, user_id UUID FK, ts TIMESTAMPTZ, mood SMALLINT CHECK (mood BETWEEN 1 AND 5), tags JSONB, note_encrypted TEXT);
   CREATE TABLE mind_exercises (id UUID PK, slug TEXT UNIQUE, type TEXT, title TEXT, body TEXT, duration_sec INT);
   CREATE TABLE mind_exercise_completions (id UUID PK, user_id UUID FK, exercise_id UUID FK, ts TIMESTAMPTZ);
   CREATE TABLE mind_journal_entries (id UUID PK, user_id UUID FK, ts TIMESTAMPTZ, body_encrypted TEXT);
   CREATE TABLE mind_screen_intentions (id UUID PK, user_id UUID FK, date DATE, target_minutes INT, self_reported_minutes INT);
   ```
   All `mind_*` tables: RLS enabled, `user_id = auth.uid()`, ON DELETE CASCADE from users.
5. **Server routes stub** — `peak-fettle-agents/server/routes/mind.js` registered at `/mind` with `requireAuth`. Empty to start; tickets 075–078 fill it in.
6. **Parse-sweep extended** — update `peak-fettle-agents/server/scripts/parse-sweep.js` to include `mind/app` and `mind/src` in its scan paths.

---

## TICKET-075 — Habits & forgiving streaks (P1)

**Scope:**
- `POST /mind/habits` — create a habit (name, cadence: daily/weekdays/custom, forgiving_rules)
- `GET /mind/habits` — list user's habits
- `PATCH /mind/habits/:id` — update
- `DELETE /mind/habits/:id` — soft-delete (archived, not lost)
- `POST /mind/habits/:id/log` — log a day as done/rest/skip
- **Forgiving streak logic** (server-side): a streak survives a single miss if the following day is logged `done`. A `rest` day is counted as active (mirrors Peak Fettle fitness streaks). No streak counter resets on a skip without warning.

**UI screens:**
- Habits home screen: list of habits with today's completion rings and streak counters
- New/edit habit sheet: name, cadence, forgiving toggle
- Habit detail: mini calendar view of completions

**Habit types included:** meditate, journal, walk, no-phone-in-bed, gratitude prompt, breathing, custom. **Gratitude** gets a special `type: 'gratitude'` that pops a one-line prompt ("Name one thing you're grateful for today") on log — evidence framing copy included.

---

## TICKET-076 — Mood check-ins (P1)

**Scope:**
- `POST /mind/mood` — upsert today's check-in (mood 1–5, tags JSONB, optional note, encrypted)
- `GET /mind/mood` — list check-ins (paginated, reverse-chron)
- **Tags palette:** sleep_good, sleep_bad, stressed, calm, social, lonely, active, tired, focused, anxious
- **Note encryption:** encrypted client-side before POST (AES-256-GCM, key derived from user's Supabase session). Server stores ciphertext only.
- **Sleep quality tag** surfaced as its own step in the check-in flow ("How was your sleep last night?") — feeds the correlation engine in TICKET-077.
- **Crisis resource trigger:** if `mood ≤ 2`, render `CrisisResourcesBanner` (TICKET-073) after save.

**UI:**
- Daily check-in card on home screen — one-tap access
- 5-point emoji scale (calm range, not clinical extremes)
- Optional tags row
- Optional freeform note (end-to-end encrypted, clearly labelled)
- Mood trend sparkline on the home screen (last 14 days)

---

## TICKET-077 — Insights: weekly recap + correlation (P1)

**Weekly recap (every Friday push):**
- Habits completed this week (X/Y)
- Average mood this week vs last week
- Exercises completed
- Screen-time intention adherence (if set)
- One "bright spot" line: the highest-streak habit, best mood day, etc.
- Delivered as a push notification + in-app recap card

**Training–mood correlation (in-app only, never a notification):**
- Query: for the past 90 days, compare `mind_mood_checkins.mood` on workout days vs non-workout days (joining with `workouts` table).
- Render as a soft insight card: *"On days you trained, your average mood was 3.8 vs 3.1 on rest days."*
- **Copy guardrails:** always framed as correlation, not causation. Never prescriptive ("you should train more"). Optional dismiss. Not shown until user has ≥14 mood check-ins and ≥7 logged workouts.

**Recovery nudge (fast-follow, flagged for P4):**
- If HRV from `daily_health_metrics` is significantly below the user's 4-week baseline AND mood was low two days running, surface: *"Your body and mind data both suggest a recovery day might help. No pressure."* Never a push — in-app only, dismissable.

---

## TICKET-078 — Guided exercise library (P1)

**Seeded content (committed as migration seed data, not hardcoded in client):**

| Slug | Type | Title | Duration |
|------|------|-------|----------|
| `breathing-4-7-8` | breathing | 4-7-8 Breathing | 3 min |
| `breathing-box` | breathing | Box Breathing | 4 min |
| `grounding-54321` | grounding | 5-4-3-2-1 Grounding | 5 min |
| `reframing-thought-record` | cbt | Thought Record | 8 min |
| `gratitude-three-good` | gratitude | Three Good Things | 3 min |
| `body-scan` | mindfulness | Body Scan | 7 min |
| `values-reflection` | reflection | What Matters Most | 5 min |
| **Pack: Exam/High-stress** | — | — | — |
| `breathing-calming` | breathing | Calming Breath | 2 min |
| `reframing-perspective` | cbt | Zoom Out | 5 min |
| **Pack: Competition Prep** | — | — | — |
| `visualisation-performance` | mindfulness | Performance Visualisation | 6 min |
| `grounding-pre-lift` | grounding | Pre-Lift Grounding | 2 min |

**UI:**
- Exercise library screen: cards by type, filterable by pack
- Exercise player: title, duration, step-by-step text + audio cue option (v1: text only)
- Completion logged to `mind_exercise_completions`
- Completion contributes to the relevant habit if the user has a "mindfulness" or "breathing" habit

---

## TICKET-079 — Notifications (P2)

Reuses the push pipeline from TICKET-065 (Expo Push API, `notification_queue`).

**New notification types** (add to `NOTIFICATION_TYPES` in `lib/notificationTypes.js`):
- `MIND_HABIT_REMINDER` — gentle daily reminder at user-chosen time
- `MIND_WEEKLY_RECAP` — Friday weekly recap (TICKET-077)
- `MIND_MOOD_PROMPT` — optional daily mood check-in nudge

**Rules:**
- All reminders are opt-in, defaulting to off
- No habit-shame: a reminder says "Time for your gratitude practice 🌱", never "You missed yesterday"
- Max 1 Mind notification per day to avoid overloading users who also have fitness notifications
- Quiet hours: respect system Do Not Disturb; server checks `notification_preferences` before queuing

---

## TICKET-080 — Cross-app loop (P2)

**Whole-person streak:**
- A day counts toward a "whole-person" streak if the user logged a workout *or* completed a Mind habit. Displayed in both apps.
- Server: new `user_streaks.whole_person_streak` column (migration); updated by both the fitness workout cron and the Mind habit-log endpoint.
- UI: shown on Peak Fettle home screen as a secondary streak badge; shown on Mind home screen as the primary streak.

**Pre/post-workout mindset primes:**
- In the Peak Fettle fitness app, after a workout is logged (`POST /workouts`), the server checks if the user has the Mind app and a breathing/grounding habit. If so, it queues a push: *"Nice session. A 2-min cool-down breath might help your recovery."*
- Pre-workout: when a user opens a workout in the fitness app, offer a "30-second prime" (pulled from the exercise library via `/mind/exercises?type=grounding&max_duration=60`).
- Both are opt-in. No notification if the user has Mind push turned off.

**Habit stacking with training:**
- In Mind's habit creation, users can set a trigger: "after I log a workout in Peak Fettle." The server fires the habit reminder push immediately after the workout is logged.
- Implementation: `mind_habits.trigger_event TEXT` (e.g. `'workout_logged'`); checked in `POST /workouts` handler.

---

## TICKET-081 — Security review + beta gate (P1, pre-ship)

**Checklist (gate for GA):**
1. `security-guidance` plugin pass over all Mind routes and the entitlement check
2. `/security-review` over `mind_*` schema and the mood note encryption implementation
3. `legal` plugin draft of the Mind-specific privacy addendum — human review required before app store submission
4. **Mental-health data retention policy**: mood notes encrypted, journal encrypted, retention cap (e.g. 2 years default with user-deletable history)
5. **App Store compliance check**: Health & Fitness + Mental Wellbeing categories; review Apple's sensitive-topic guidelines; confirm no treatment/medical-device claims in copy
6. **Pen-test the entitlement check**: confirm a free user cannot access `mind_*` endpoints by manipulating the JWT or calling routes directly
7. **Crisis resource review**: a human (not an agent) reads the crisis copy and confirms it is accurate and up to date for each locale at launch
8. **Beta**: 10–20 paid subscribers, explicit opt-in, 2-week observation, qualitative exit interview

---

## Run order

```
TICKET-073 (safety) → TICKET-074 (foundation)
  → TICKET-075 (habits)    ─┐
  → TICKET-076 (mood)       ├→ TICKET-077 (insights)
  → TICKET-078 (exercises) ─┘
  → TICKET-079 (notifications)
  → TICKET-080 (cross-app loop)
  → TICKET-081 (security + beta gate) → GA
```

073 and 074 are serial (safety before code). 075, 076, 078 can be parallel. 077 needs 075+076. 079 and 080 can run alongside 077. 081 gates everything.

---

## New open questions (add to OPEN_QUESTIONS_FOR_FOUNDER.md)

- **Q7 — App name confirmed?** "Peak Fettle Mind" applied as default above. Override if desired.
- **Q8 — AI reflection timeline?** The pitch recommended deferring to P4. Confirm, or move it to v1.
- **Q9 — Who writes and human-reviews the crisis copy?** An agent can draft it; a human must approve before any build ships with it. Nominate a reviewer.
- **Q10 — Encryption key management for mood notes?** Client-side AES (key from session) is simplest but means notes are lost if the session key rotates without migration. Alternatives: server-side encryption (simpler, less private), or a proper key-derivation scheme. Decide before TICKET-076 builds the note feature.
