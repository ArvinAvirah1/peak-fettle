# SPEC — Peak Fettle Training Engine v1 + Insight Features (BINDING)

**Date:** 2026-06-11 · **Status:** APPROVED by founder (replace Haiku entirely; all 7 disciplines; full stack incl. mobile survey)
**This document is the contract.** Implementation agents build exactly this; checker agents diff implementations against this. Deviations require a note in the agent's final report, not silent improvisation.

## 0. NON-NEGOTIABLE WORKING RULES (mount safety — every agent)

1. **NEVER use the Write or Edit tools on this mount — they corrupt/truncate files.** All file creation and modification goes through bash: `cat > path << 'EOF'` heredocs, or copy file to /tmp, patch there (python3/sed), `cat /tmp/x > path` back. Verify EVERY write with `wc -lc` and `tail -3`.
2. Back up any existing file to /tmp before overwriting.
3. `rm`/`mv` fail on the mount. Never rename; only overwrite in place. No `git` commands (orchestrator commits at the end).
4. **Definition of done per agent:** every touched `.js` passes `node --check`; every touched `.tsx/.ts` parses with `@babel/parser` ({plugins:['jsx','typescript']}); stay strictly inside your file-ownership list (§8). If you need a file you don't own, write what you need in your final report instead of editing it.
5. Match existing code style: server = CommonJS, zod validation, `pool.query` parameterized SQL, comment-banner sections; mobile = TypeScript, expo-router, `useTheme()` tokens, existing component patterns. Read 2–3 neighboring files before writing.
6. No new server npm dependencies. Mobile: expo-notifications only if not already present (check package.json first; if absent, note in report instead of installing).

## 1. Product summary

Replace the Claude Haiku call in `POST /plans/generate` with a deterministic, sports-science-rule engine ("Peak Fettle Training Engine", `pf-engine-v1`). Paid-tier gate stays. Add six insight features powered by existing data: muscle recovery heatmap, rule-based readiness score, deload auto-detection, equipment-aware substitution, warm-up calculator (extends existing plate calc), PR toasts + e1RM charts, background-safe rest timer, and full data export. Branding everywhere: **"evidence-based Training Engine"** — the word "AI" must not appear in any new user-facing copy. Every recommendation shows its rule chain.

## 2. Database migrations (Agent B owns; Agent A codes against them)

`peak-fettle-agents/server/migrations/20260611_engine_profile_fields.sql`:
```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS training_goal TEXT CHECK (training_goal IN ('strength','hypertrophy','endurance','sport_performance','general_fitness')),
  ADD COLUMN IF NOT EXISTS sessions_per_week SMALLINT CHECK (sessions_per_week BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS session_minutes SMALLINT CHECK (session_minutes IN (15,30,45,60,90)),
  ADD COLUMN IF NOT EXISTS goal_weight_kg NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS equipment_profile TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS season_phase TEXT CHECK (season_phase IN ('off_season','in_season')),
  ADD COLUMN IF NOT EXISTS last_deload_at DATE;
```
`20260611_exercise_tagging.sql`: add `movement_pattern TEXT`, `equipment TEXT[]` to exercises + a seed UPDATE pass tagging every existing exercise (names visible in 20260607_expand_exercise_library.sql + the original seed — read both, tag all rows by name; default `equipment = ARRAY['machine']`/best judgment, movement_pattern from taxonomy below). Idempotent (`IF NOT EXISTS` / WHERE movement_pattern IS NULL).

**Movement-pattern taxonomy (closed set):** `squat, hinge, lunge, horizontal_push, vertical_push, horizontal_pull, vertical_pull, isolation_arms, isolation_shoulders, isolation_chest, isolation_back, isolation_legs, isolation_calves, core, carry, olympic, plyometric, cardio`.
**Equipment vocabulary (closed set):** `barbell, dumbbell, kettlebell, machine, cable, bodyweight, bands, bench, rack, pullup_bar, bike, treadmill, pool, track`.

## 3. Training Engine (Agent A) — `peak-fettle-agents/server/lib/trainingEngine/`

Files: `index.js` (public `generatePlan(ctx)`), `templates.js` (data: 7 disciplines × 3 tiers), `scaleDown.js`, `sequence.js`, `exerciseFill.js`, `loading.js`, `reasoning.js`. Pure functions only — no DB access inside the module; `plans.js` assembles `ctx` from SQL (reuse its existing queries) and passes plain objects.

`ctx = { profile {experience_level, sex, age_band, weight_class_kg, training_goal, sessions_per_week, session_minutes, goal_weight_kg, equipment_profile, season_phase, primary_discipline}, exercises[] (id,name,muscle_groups,is_compound,movement_pattern,equipment,contraindications), history[] (exercise_name, weight_kg, reps, rir, e1rm_kg, day_key), pbs[] (exercise_name, weight_kg, reps), metrics[] (date, resting_hr_bpm, hrv_ms, sleep_hours), constraints[], today }`

Defaults when survey fields NULL: sessions_per_week=3, session_minutes=60, training_goal='general_fitness', equipment_profile=['barbell','dumbbell','machine','cable','bodyweight','bench','rack'], tier from experience_level (beginner|intermediate|advanced, default beginner).

**Pipeline (each stage appends human-readable strings to `ruleTrace[]`):**
1. **selectTemplate(discipline, tier, goal, season_phase)** — templates.js exports per discipline×tier: `{ idealDays, sessions: [{archetype, slots: [{pattern, sets, reps, rpe, rest_seconds, priority (1=core,2=secondary,3=accessory)}], cardio?: [{zone, minutes, description}] }], progression: {model: 'linear'|'dup'|'block', weeklyRule}, deloadEvery }`. Content transcribed from `workout_research/<discipline>.md` (read them). bodybuilding goal on general_strength uses higher-volume variant. Endurance disciplines (running/cycling/swimming): sessions are cardio prescriptions (zones per the docs) + 1–2 strength-support sessions; mixed = other_mixed.md High-Low model.
2. **scaleDown(template, sessions_per_week, session_minutes)** — implements scheduling_guidelines.md §7 hierarchy exactly: cut priority-3 slots first, then easy volume, then sets (floor 2), reduce frequency last; session-length recipes §5 (15min→single quality; 30→one quality+warmup; 45→quality+secondary; 60/90→full). Never cut intensity. If user days > template idealDays, add a recovery/easy session, don't invent volume.
3. **sequence(sessions, days)** — §4 rules: alternate hard/easy, ≥48h same muscle group, priority sessions earliest in week. Output day_labels "Day 1 – Push" style.
4. **exerciseFill(slots, exercises, history, equipment_profile, constraints)** — per slot pick by: matching movement_pattern → equipment ⊆ profile → not contraindicated → prefer exercise present in history/PBs (stickiness) → then is_compound for priority 1 → deterministic tiebreak by seeded shuffle (seed = userId+weekISO so regenerate varies weekly, stable within week). If no candidate: relax equipment to bodyweight pattern equivalent; if still none, drop slot + ruleTrace note.
5. **loading(filled, history, pbs)** — e1RM via Epley `w*(1+min(reps,12)/30)` (same cap as plans.js pbMap). Week-1 working weight = 85–90% of slot rep-target weight derived from e1RM (`target = e1rm / (1+reps/30)`), rounded to 2.5kg. No history for that lift → prescribe RPE-only ("start light, find an RPE 7"). 3-week progression per template model: linear +2.5kg/wk lower, +1.25–2.5 upper; dup varies daily; week 3 = peak or deload per template. Cardio: zone/duration progression per doc.
6. **reasoning(ruleTrace, ctx)** — returns `reasoning` (1–2 sentences citing a real data point: a PB, e1RM, HRV trend, or "fewer than 3 sessions logged — plan adapts as you log") + `rule_trace[]` (the full chain).

**Output schema (superset of existing — client keeps working):** `{ weeks: [{week_number, sessions: [{day_label, exercises: [{exercise_id, name, sets, reps, rpe_target, rest_seconds, coaching_note, warmup?: [{weight_kg, reps}] }], cardio?: [...] }]}], reasoning, rule_trace, engine: 'pf-engine-v1' }`. coaching_note from a template-string bank keyed by pattern+context (≥25 distinct strings, fill slots with user numbers — never generic).

**plans.js changes (Agent A):** remove Anthropic import/client/prompt/timeout/parse blocks from `/generate`; keep paid gate; daily throttle 3→20 (copy: "20 plans/day"); extend profile SELECT with new columns; exercises SELECT adds movement_pattern+equipment; call engine synchronously; save with `is_ai_generated = FALSE`, name `'Training Engine Plan — <date>'`; response `{ session?, weeks, reasoning, rule_trace, engine, plan_id }`. Keep Zod CreatePlanSchema untouched. **Unit tests** `server/__tests__/trainingEngine.test.js` (jest, match existing test style): ≥12 cases — every discipline generates; 2-day powerlifting scale-down keeps core lifts; constraints exclude patterns; equipment filter falls back; loading math vs hand-computed e1RM; determinism (same seed → same plan); 15-min session = single quality.

## 4. Insight endpoints (Agent B) — new file `peak-fettle-agents/server/routes/insights.js` (+ mount in index.js)

All authenticated (same middleware pattern as other routes). All responses include `rule_trace[]`.

**GET /insights/recovery** — muscle recovery heatmap data. For each muscle group present in user's last-14-day sets: `freshness = min(100, round(hours_since_last_worked / tau * 100))` where `tau = 48 + 12 * min(sets_in_last_session_for_muscle / 5, 2)` hours (i.e., 48–72h). Response: `{ muscles: [{muscle, freshness, last_worked, sets_last_session}], generated_at, rule_trace }`. Muscles never trained: freshness 100, last_worked null.

**GET /insights/readiness** — daily readiness 0–100. Components vs user's own 28-day baseline (skip any component lacking ≥7 baseline days; reweight the rest):
- HRV (weight .35): today/7d-avg vs baseline; ratio≥1 → 100; linear down to 0 at ratio .7.
- Resting HR (weight .25): inverted; ratio≤1 → 100; 0 at ratio 1.15.
- Sleep (weight .20): last night / 8h, capped 100.
- Acute:chronic load (weight .20): 7d tonnage / 28d weekly-avg tonnage; ACR ≤0.8 → 100, 1.0 → 85, 1.3 → 50, ≥1.5 → 20 (linear between).
Bands: ≥67 `push`, 34–66 `maintain`, <34 `rest`. Response `{ score, band, components: [{name, value, weight, detail}], rule_trace }`. No data at all → `{score: null, band: 'unknown'}`.

**GET /insights/deload** — returns `{ recommended: bool, triggers: [...], prescription, rule_trace }`. Triggers (any → recommended): (a) e1RM down ≥2% across 3 consecutive sessions on any lift with ≥6 sessions logged; (b) same exercise+weight failed (reps below target... use: reps decreased session-over-session at same weight) 3 consecutive sessions; (c) mean RIR < 1 over trailing 14 days with ≥6 sets; (d) `users.last_deload_at` older than 42 days (or NULL with ≥42 days of history). Prescription: "1 week: same exercises, 50–60% of normal sets, weights −10%". POST /insights/deload/ack sets last_deload_at = today.

**GET /exercises/:id/substitutes** (Agent B, in exercises.js) — query params optional `equipment` CSV. Rank same `movement_pattern` exercises: equipment-compatible first, then same primary muscle_groups overlap desc, then is_compound match. Exclude contraindicated (reuse user_constraints overlap). Top 5. `{ substitutes: [{id, name, equipment, muscle_groups, why}], rule_trace }`.

**GET /user/export** (Agent B, in user.js) — full JSON dump: profile (minus internal flags), workouts+sets (decoded weight_kg = weight_raw/8.0), plans, constraints, health metrics, PBs. **GET /user/export.csv** — sets flattened CSV (`day_key,exercise,weight_kg,reps,rir,kind`). Stream-friendly (res.write rows). Free tier included — no paid gate on export.

## 5. Mobile — Agent C (survey + plans UI)

**Files owned:** `mobile/app/onboarding.tsx`, `mobile/app/(tabs)/profile.tsx`, `mobile/app/(tabs)/plans.tsx`, `mobile/src/api/user.ts`, `mobile/src/api/plans.ts`, new `mobile/app/training-survey.tsx`.
- Onboarding: insert survey steps after discipline — training_goal (5 options), sessions_per_week (1–7 chips), session_minutes (15/30/45/60/90 chips), equipment (multi-select chips, closed vocabulary §2), goal_weight_kg (optional numeric + skip), season_phase (only shown if discipline maps to team/mixed sport). All skippable, same OptionButton pattern + PATCH /users/profile.
- `training-survey.tsx`: same steps re-editable any time; entry row in profile.tsx ("Training profile").
- plans.tsx: rebrand strings — "Training Engine" not "AI"; generated plan detail shows `reasoning` prominently + collapsible "Why this plan" list rendering `rule_trace[]`; CTA copy "Generate my plan — built from published sports science". Keep paid-gate UX as is. Add profile.tsx rows: "Training profile", "Readiness & recovery" → `/insights`, "Export my data" → `/data-export` (screens owned by Agent D).

## 6. Mobile — Agent D (logger features + insight screens)

**Files owned:** `mobile/src/components/StepperLogger.tsx`, `WorkoutLoggerHost.tsx`, `PlateCalculatorSheet.tsx`, new `mobile/src/components/PRToast.tsx`, `ReadinessCard.tsx`, `MuscleHeatmap.tsx`, new `mobile/app/insights.tsx`, `mobile/app/data-export.tsx`, new `mobile/src/api/insights.ts`, `mobile/src/hooks/useRestTimer.ts`.
- **AUDIT FIRST:** PlateCalculatorSheet, LiftProgressChart, one-rm.tsx, trends.tsx already exist — extend, never duplicate. Check package.json for expo-notifications before using.
- **Warm-up calculator:** extend PlateCalculatorSheet with a "Warm-up" tab: ladder 40/55/70/85% of working weight (skip rungs <20kg above bar), plate-rounded, each rung tappable to show plate breakdown.
- **PR toast:** on set save in logger, compute e1RM (Epley, reps capped 12) vs prior max for that exercise (from local/PowerSync data or existing hooks); if exceeded → non-blocking toast "🏆 New best: Bench 102.5kg e1RM (+2.5)". Component PRToast.tsx, themed.
- **Rest timer:** `useRestTimer.ts` — on set log, store target end timestamp; schedule a local notification (expo-notifications) at end; UI countdown derives from timestamp (survives background/kill); cancel on next set. Per-exercise rest from plan's rest_seconds, default 120s, adjustable ±15s. Integrate into logger host UI minimally.
- **insights.tsx screen:** ReadinessCard (score dial, band copy, component breakdown, rule trace collapsible) + MuscleHeatmap (front/back body SVG, muscle groups colored by freshness: theme danger→warning→success; tap muscle → freshness detail + "suggest substitute exercises" link) + deload banner when /insights/deload recommends (CTA: "Start deload week" → POST ack). Data via `mobile/src/api/insights.ts` (follow client.ts patterns).
- **data-export.tsx:** two buttons (JSON / CSV) hitting export endpoints, share-sheet via existing expo APIs (check what csv-import.tsx uses), plus copy about data ownership.
- e1RM charts: verify LiftProgressChart/one-rm.tsx already chart e1RM per exercise; if yes, only add PR markers if trivial; report findings.

## 7. Copy & branding rules (all agents)
Never "AI", "Claude", "Haiku", "generated by artificial intelligence" in new user-facing strings. Use: "Training Engine", "evidence-based", "built from published sports science", "here's why" + rule chain. Reasoning strings must cite a concrete user data point when one exists.

## 8. File ownership matrix (collision prevention — STRICT)
| Agent | Owns (only these) |
|---|---|
| A | `server/lib/trainingEngine/*` (new), `server/routes/plans.js`, `server/__tests__/trainingEngine.test.js` (new) |
| B | `server/migrations/20260611_*.sql` (new), `server/routes/insights.js` (new), `server/routes/exercises.js`, `server/routes/user.js`, `server/index.js` (mount insights router only) |
| C | `mobile/app/onboarding.tsx`, `mobile/app/training-survey.tsx` (new), `mobile/app/(tabs)/profile.tsx`, `mobile/app/(tabs)/plans.tsx`, `mobile/src/api/user.ts`, `mobile/src/api/plans.ts` |
| D | `mobile/src/components/{StepperLogger,WorkoutLoggerHost,PlateCalculatorSheet}.tsx`, new `PRToast/ReadinessCard/MuscleHeatmap`, `mobile/app/{insights,data-export}.tsx` (new), `mobile/src/api/insights.ts` (new), `mobile/src/hooks/useRestTimer.ts` (new) |

Shared contracts live only in this spec. Cross-agent needs → final report, not edits.

## 9. Acceptance criteria (checkers verify)
1. `grep -ri "anthropic\|haiku" server/routes/plans.js` → no hits (except changelog comments).
2. `node --check` passes on every touched server .js; @babel/parser passes on every touched mobile file; **full sweep** of mobile/app, mobile/src, server at the end.
3. `npx jest __tests__/trainingEngine.test.js` green.
4. Engine output validates against §3 schema; deterministic for fixed seed; honors constraints/equipment in tests.
5. Migrations idempotent (re-runnable). Every seeded exercise gets movement_pattern + equipment.
6. Endpoint responses match §4 shapes exactly (field names verbatim).
7. No new user-facing "AI" strings; paid gate intact on /plans/generate; export endpoints NOT paid-gated.
8. File-ownership matrix respected (checkers diff `git status` paths per agent report).
