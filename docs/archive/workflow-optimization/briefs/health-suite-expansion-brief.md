# Health Suite Expansion — Workflow Brief
**Date:** 2026-04-30
**From:** Exec (CEO)
**To:** Workflow Coordinator → Dev Team
**Status:** APPROVED — implement phased plan

---

## COORDINATOR INTAKE

Arvin has approved the phased integration plan for expanding Peak Fettle beyond fitness into overall health (mental health, habit tracking, screen time blocking, meditation reminders). The decision is to **not** build a separate app yet. Instead, execute a 3-phase plan that keeps Peak Fettle unified in the short term, lays groundwork now for cross-domain data, and only spins out a companion app once fitness PMF is confirmed and demand for mental health features is validated.

**Coordinator action:** Translate the three phases below into dev-team-ready technical directives using dev-context framing. Do not pass exec-level strategy rationale to the dev team — give them the schema work, the feature flags, and the sequencing. Flag anything requiring an executive decision before implementation can begin.

---

## THE THREE PHASES (Exec Summary)

**Phase 1 — Data layer prep (do this now, costs almost nothing)**
Add support for general health primitives to the database — sleep, mood, stress, screen time — even though no UI reads from it yet. Architect for it now so there's no painful migration later.

**Phase 2 — Wellbeing module inside Peak Fettle (after fitness PMF)**
Add a "Wellbeing" or "Recovery" tab within the existing app. Lightweight features only: habit tracking, sleep logging, mood check-in. Frame everything around recovery and performance, not standalone mental health. No OS-level permissions required at this stage.

**Phase 3 — Companion app (only after Phase 2 validates demand)**
Spin out a separate app with its own identity for deeper features: screen time blocking (requires OS-level integration), guided meditation, full mental health suite. Shares the same Supabase account, cross-references fitness data for insights. This is the suite model — two products, one account, one shared backend.

---

---

## DEV TEAM DIRECTIVE
**From:** Workflow Coordinator
**To:** dev-lead, dev-backend, dev-database
**Re:** Health Suite Expansion — Phase 1 Implementation + Phase 2 Scoping

---

### What Changed and Why (Summary)

Executive approved expansion of Peak Fettle's data model to support cross-domain health tracking. Phase 1 is greenlit immediately: add health primitive logging to the database schema without building any UI for it yet. This is a schema-forward investment — we're paying a small migration cost now to avoid a large one later when the Wellbeing tab ships. Phases 2 and 3 are scoped below for awareness but are **not** greenlit for implementation yet.

---

### Phase 1 — Schema Work (GREENLIT, implement now)

**Objective:** Add a `daily_health_log` table to Supabase that stores general health primitives per user per day. Nothing reads from this yet — this is foundation-only.

**New table: `daily_health_log`**

```sql
CREATE TABLE daily_health_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,

  -- Sleep
  sleep_hours NUMERIC(4,2),           -- e.g. 7.5
  sleep_quality SMALLINT,             -- 1–5 self-reported

  -- Mood / stress
  mood_score SMALLINT,                -- 1–5 self-reported
  stress_score SMALLINT,              -- 1–5 self-reported

  -- Screen time (manual entry for now, auto-import in Phase 3)
  screen_time_minutes INTEGER,

  -- Habit completions (array of habit IDs completed that day)
  habits_completed UUID[],

  -- Meditation
  meditation_minutes INTEGER,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, log_date)           -- one log per user per day
);

-- Index for time-series queries (perf + percentile correlation later)
CREATE INDEX idx_daily_health_log_user_date
  ON daily_health_log(user_id, log_date DESC);
```

**Also add: `habits` table** (Phase 2 UI will need it; define it now to avoid a second migration)

```sql
CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'daily',   -- 'daily' | 'weekly'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration discipline:** Follow standard migration file convention. No raw schema edits in production. File this under `/migrations/` with a descriptive name (e.g., `20260430_add_daily_health_log.sql`).

**Encryption:** `daily_health_log` contains sensitive health data. Confirm encryption at rest is applied (already configured in Supabase — verify RLS policies are set so users can only read/write their own rows).

**RLS policies to add:**
```sql
ALTER TABLE daily_health_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own health logs"
  ON daily_health_log FOR ALL
  USING (auth.uid() = user_id);

ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own habits"
  ON habits FOR ALL
  USING (auth.uid() = user_id);
```

---

### Phase 2 — Wellbeing Tab (SCOPED, not yet greenlit)

**When it ships:** After fitness PMF confirmation (exec decision gate).

**What it is:** A new tab in the existing React Native app — "Wellbeing" or "Recovery." Reads and writes to `daily_health_log`. Features:
- Sleep logging (hours + quality slider)
- Mood / stress check-in (quick 1–5 tap)
- Habit completion tracker (checkboxes against `habits` table)
- Simple streak logic for habits (mirror existing streak logic from workout streaks)

**Key constraint:** No OS-level permissions at this stage. No Screen Time API, no notification blocking. Everything is manual user input. This keeps the feature lightweight and reviewable without platform-specific complexity.

**Cross-domain insight (the product differentiator):** Once `daily_health_log` is populated alongside `workouts`, the backend can surface correlations — e.g., *"Your strength output is 12% lower on days following <6 hours of sleep."* This is the moat. Plan for a `correlations` computation job similar to the existing `percentile_vectors` batch job — weekly batch, pre-computed, stored.

**Feature flag:** Gate the Wellbeing tab behind a feature flag from day one so it can be toggled per user/cohort for beta testing without a new release.

---

### Phase 3 — Companion App (AWARENESS ONLY, not scoped yet)

This is a future separate React Native app sharing the same Supabase backend. Will require:
- Screen Time API integration (iOS) + Digital Wellbeing API (Android) — significant platform-specific work
- Shared auth across two apps (same JWT / Supabase session)
- Separate App Store listings, separate CI/CD pipeline

**Do not scope or start Phase 3 until exec gives the green light post-Phase 2 validation.** It's on the radar — not on the board.

---

### Blockers / Decisions Needing Executive Input Before Proceeding

1. **Habit frequency options** — should habits support weekly and custom frequencies at Phase 2, or daily only to start? Recommend daily-only for simplicity; flagging for exec confirmation.
2. **Meditation logging** — is this manual (user inputs minutes) or does Phase 2 need to integrate with Apple Health / Google Fit for auto-import? Significant scope difference.
3. **Naming** — "Wellbeing" tab vs. "Recovery" tab. Marketing decision, not dev. Flag to exec-product-manager.

---

### Files Modified
- `/migrations/20260430_add_daily_health_log.sql` *(new)*
- `/migrations/20260430_add_habits.sql` *(new, or combine with above)*
- Supabase RLS policy updates for both tables

### Change Log Entry
> `2026-04-30` — Schema foundation for health suite expansion. Added `daily_health_log` and `habits` tables with RLS. No UI changes. Phase 2 (Wellbeing tab) scoped pending exec greenlight.

### Blockers
See "Blockers / Decisions Needing Executive Input" section above — 3 items require exec response before Phase 2 implementation begins.
