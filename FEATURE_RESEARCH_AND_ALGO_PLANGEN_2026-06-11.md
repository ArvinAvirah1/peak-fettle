# Peak Fettle — Feature Research, Founder Pitches & Algorithmic Plan Generation

**Date:** 2026-06-11 · **Prepared by:** Claude (Cowork research run, 3 parallel research agents + repo sweep)
**Inputs:** 45+ web searches across Reddit fitness communities, App Store reviews, comparison journalism; full sweep of `workout_research/`, `peak-fettle-agents/server/routes/plans.js`, `mobile/app/onboarding.tsx`.

---

## Executive summary

1. **The most-praised features across all fitness apps are cheap.** Fast set logging, auto rest timers, per-exercise progress charts, plate calculators, and generous free tiers dominate user praise — all trivial-to-moderate builds. Peak Fettle is missing several of them.
2. **The most replicable competitive differentiator is Fitbod's muscle-recovery heatmap** — visually compelling, science-grounded, and powered entirely by data Peak Fettle already collects.
3. **AI skepticism is real and documented.** Users praise *adaptive* programming and roll their eyes at "AI-generated" branding. The recommendation: replace the Haiku plan-gen call with a **deterministic algorithm — and this is fully feasible** (§5). The `workout_research/` library was literally written as a rulebook; it can be executed by code instead of interpreted by a model.
4. **Survey gap blocks everything:** onboarding currently captures only sex + sport. Days/week, session length, goal, and equipment must be added before *any* generator (AI or algorithmic) can honor the inputs you listed.
5. **Sport-research gaps:** soccer, basketball, and bodybuilding-as-distinct-from-general-strength have zero coverage in `workout_research/`. Drafted tier-by-tier guidance for all three is in §6, sourced from NSCA/FIFA 11+/RP/Schoenfeld. Existing cycling and powerlifting docs verified current as of 2026.

---

## 1. What people LOVE about competitor apps — and what Peak Fettle should adopt

Ranked by frequency/intensity of praise across r/fitness, r/weightroom, r/powerlifting, App Store reviews, and 2025–2026 comparisons. "Pitch" = recommendation for Peak Fettle.

### Tier 1 — adopt now (trivial cost, table stakes)

| Feature | Best at | Why users love it | Pitch for Peak Fettle |
|---|---|---|---|
| **Sub-3-tap set logging with last session's numbers auto-shown** | Strong, Hevy | "The fastest app for logging sets mid-workout" is the #1 cited reason for choosing a tracker. Logging happens in 60–90s rest windows; friction kills the habit. | Audit the StepperLogger flow. If logging a set takes >3 taps or prior weights aren't visible at entry time, fix before building anything else. |
| **Plate calculator** | Hevy, Strong | Eliminates mid-workout mental math; a standalone paid app (Bar Is Loaded) exists just for this. | Pure arithmetic + small UI. A day of work. Attach it to the weight entry field. |
| **Per-exercise progress charts + PR pop-ups** | Strong, Hevy | "Metrics that actually tell you if a program is working." PR moments are "small but motivating touches." | Peak Fettle already computes e1RM (Epley, in plans.js and percentile.js). Surface it: per-exercise e1RM/volume charts + an in-workout PR toast. |
| **Auto rest timer that survives backgrounding** | Hevy, Strong | Users rage at timers that reset when switching apps. Hevy's notification-based timer is a top-3 praised feature. | Local notification fired on set log. Moderate iOS background work, high payoff. |
| **Volume per muscle group analytics** | Hevy (free tier) | Intermediates verify they're hitting volume targets and catching imbalances. | Exercise DB already has `muscle_groups[]`. Group + chart weekly sets/tonnage per muscle. |

### Tier 2 — high-leverage differentiators (moderate cost)

| Feature | Best at | Why it wins | Pitch |
|---|---|---|---|
| **Muscle recovery heatmap + recovery-aware session suggestions** | Fitbod | "Helped me visualize when to push and when to recover." Fitbod's signature feature; no hardware needed. | Body silhouette colored by per-muscle recency × volume from the sets table. Pairs perfectly with the algorithmic generator (§5) — "today's session targets fresh muscles." |
| **Daily readiness score** | Whoop, Garmin | A single actionable morning number (train hard / maintain / rest) synthesized from HRV, sleep, RHR, recent load. Whoop's most-praised feature. | Peak Fettle already ingests HRV/sleep/RHR into `daily_health_metrics`. A rule-based composite (no ML) gets 80% of the value. Becomes an intensity modifier input to the generator. |
| **Per-exercise friend leaderboards** | Hevy | "Seeing my friends' lifts totally changed my experience — super motivating." Works even on small networks because it's scoped to friends, not global. | Peak Fettle has groups + percentiles already. Add best-e1RM-per-exercise leaderboards scoped to a group. Reuses percentile math. |
| **Curated evidence-based program library** | Boostcamp | "All of Reddit's best free workouts in one slick app." Beginners want proven programs, not generators. | The algorithmic generator's template layer (§5) doubles as this: ship the workout_research tier templates as browsable, named programs (free tier). Two features, one build. |
| **Equipment-aware exercise substitution / "rack is taken" swap** | Fitbod | Daily commercial-gym friction point; heavily marketed by every app that has it. | Needs movement-pattern + equipment tags on the exercise DB (also required by §5 and by scheduling_guidelines' substitution ladders). One data-modeling effort, three features out. |

### Tier 3 — note but don't chase

**Strava segments/KOM, heatmap routes, kudos-scale feeds** — value is pure network effect (135M users); a small app cannot replicate the global layer. Group-scoped variants only, later. **Peloton instructor classes** — content production moat, not viable. **Caliber human coaching** — staffing business, not software. **MFP food database** — out of scope; if nutrition context is ever wanted, a minimal Apple Health macro read is the indie path. **JuggernautAI-grade autoregulation** — the full version is hard, but its praised core (RPE/RIR-reactive load adjustment) is achievable rule-based, see §5.4.

**Meta-lesson from the praise data:** users in 2025–2026 don't praise "AI gave me a plan." They praise *adaptation* — "the plan adjusted when I had a bad session." And the most defensible indie posture is Strong/FitNotes-style minimal bloat plus a genuinely useful free tier (Hevy's playbook; MFP's 2022 barcode paywall is still cited as a betrayal four years later).

---

## 2. What people WISH their fitness apps had — pitches + feasibility

Ranked by frequency × intensity of demand found in the research ("I switched apps over this" > "would be nice").

| # | Unmet need | Evidence (paraphrased) | Feasibility for Peak Fettle |
|---|---|---|---|
| 1 | **No paywall on core logging — ever** | MFP's 2022 paywall still cited as betrayal; Strava's price hikes triggered mass-switch threads; FitNotes has "legendary" goodwill purely from staying free. | **Trivial (positioning).** Keep logging/history/export free forever; monetize plans, analytics, cosmetics. Peak Fettle already does roughly this — make it an explicit public promise. |
| 2 | **True data export (CSV/JSON), no gate** | "Reddit is full of users who lost years of data." Users check export *before* committing. | **Trivial.** CSV import already exists; export is its mirror. Highest trust-per-engineering-hour available. |
| 3 | **Genuine offline-first reliability** | FitNotes' fanatical base exists because "it works offline without issues." Gym basements are dead zones. | **Moderate — and already planned.** LOCAL_FIRST_MIGRATION_PLAN_2026-06-06.md + PowerSync hooks mean this is in flight. The algorithmic generator (§5) makes *plan generation itself* offline-capable, which an API call never can be. |
| 4 | **Progressive overload guidance — "what should I do next"** | "Strong is purely a logger... it doesn't adapt your programme." Users pay Fitbod $10/mo just for this. | **Moderate, rule-based.** RIR is already logged — it's exactly the signal needed. "Hit top of rep range at RIR ≥2 for 2 sessions → +2.5kg" is a rule, not a model. Core of §5. |
| 5 | **Deload auto-detection** | StrongLifts praised for auto-deload after 3 failed sessions — noteworthy because it's rare. | **Moderate.** Rule triggers: 3 fails at a weight, sustained RIR collapse, weeks-since-deload ≥6 (TICKET-047 already touches deload weeks). |
| 6 | **Injury-aware substitution ("train around it")** | Users flag an injury and apps just delete the exercise, leaving a hole. | **Moderate.** `user_constraints` + `contraindications` hard-block already exists. Missing piece: substitute a same-pattern alternative instead of dropping the slot. Needs movement-pattern tags. |
| 7 | **Warm-up set calculator** | Strong's "warm-up helpers" called out by name; almost always paired with plate-calc demand. | **Trivial.** Ladder at 40/60/80% of working weight, rounded to loadable plates. Extends the plate calculator. |
| 8 | **Supersets/circuits that don't break the logger** | Hevy's own docs admit their circuit workaround is clunky; standalone interval apps exist because trackers fail here. | **Hard if schema is straight-set-only.** Audit the sets schema now — a `group_id`/`superset_key` column added early is cheap; retrofitting later is not. |
| 9 | **Strength + cardio in one app (the "two-app problem")** | "The industry decided strength and cardio are separate problems. Every comparison assumes you juggle 2–3 apps." | **Moderate-hard, but Peak Fettle is unusually positioned:** it already spans lifting AND running/cycling/swimming disciplines + has other_mixed.md interference rules. A scheduler that sees both is a genuine differentiator almost nobody has. |
| 10 | **Lightweight nutrition context (not a food diary)** | Users reject MFP bloat but want "am I in surplus on training days / did I hit protein." | **Trivial minimally:** read calories/protein from Apple Health if present; show next to training volume. Don't build food logging. |
| 11 | **Home screen / lock screen widget** | Today's workout + streak at a glance; dedicated widget apps exist to fill the gap. | **Moderate.** Expo widget support requires a native module; nice retention play, not urgent. |
| 12 | **Bodyweight exercise volume counted correctly** | Hevy review: "volume isn't added when doing bodyweight squats." | **Trivial-moderate.** Store user bodyweight at session time; volume = (BW factor + added load) × reps. |
| 13 | **Lifetime purchase option** | Strong's ~$120 lifetime praised; subscription fatigue is loud in Reddit fitness. | **Trivial.** One IAP SKU. Worth modeling against year_one_costs before committing. |
| 14 | **Transparent programming logic ("show me why")** | Black-box AI recommendations produce distrust; visible reasoning converts skeptics. | **Trivial with §5.** A deterministic generator can print its actual rule chain — something Haiku fundamentally cannot guarantee. |
| 15 | **Privacy-first posture** | 80% of fitness apps share data with third parties (TechRadar/Surfshark); users notice. | **Trivial (policy).** Local-first migration + "we don't sell data, plans are computed on-device" is a marketable sentence. |

### The AI-skepticism finding (directly relevant to your Haiku question)

The skepticism is real, documented, and specific — not generalized technophobia:

- **TIME (2024), "I Used ChatGPT as My Personal Trainer. It Didn't Go Well"** — AI plans "underwhelming and at times incomprehensible." (https://time.com/6958557/chatgpt-workout-plan/)
- **Fitbod algorithm complaints** — "workouts seem fundamentally random"; one user reported two years of use ending in muscle loss. (https://dr-muscle.com/fitbod-app-review-alternative/)
- **Reddit consensus pattern:** "AI-powered" in marketing gets the same eye-roll as "clinically proven" on supplements; but *software that personalizes from your actual data, with visible logic*, is welcomed.

**Implication:** your instinct is correct. Drop "AI/Claude Haiku" from plan-generation branding regardless of implementation. The winning frame is "evidence-based auto-programming" with the reasoning shown: *"Bench +2.5kg because you hit 3×8 at RIR 2 last session."* §5 makes that literally true rather than marketing copy.

---

## 3. Additional utility ideas — by cost

Ideas not already covered above, drawn from the research + repo context.

### Low cost (days, not weeks)
1. **"Minimum viable session" fallback button** — scheduling_guidelines.md §9 already defines MVS per plan. Expose it: a "Short on time — give me the 15-min version" button on today's workout. Directly implements the research library's adherence philosophy; almost no competitor has it.
2. **Rest-day / streak clarity card** — onboarding already promises "rest days don't break your streak." A small widget showing exactly what tonight needs to keep the streak reduces anxiety-driven churn.
3. **Export-my-data button** (wish #2) — trust play, mirrors existing CSV import.
4. **Warm-up + plate calculator** (wishes #7 + Tier-1) — one combined build.
5. **PR detection toast + PR history screen** — data already exists.
6. **Session RPE summary + weekly fatigue trend** — single chart from logged RIR; feeds deload detection later.
7. **"Why this exercise" info taps** — surface the coaching_note / sport-doc rationale per exercise; cheap education = retention (LoadMuscle's "education not just instruction" finding).

### Medium cost (1–3 weeks each)
8. **Readiness score** (Tier-2) — rule-based composite of HRV/sleep/RHR deltas vs. user baseline; feeds generator intensity modifier.
9. **Muscle recovery heatmap** (Tier-2) — recency × volume per muscle group from existing sets data.
10. **Deload auto-detect + one-tap deload week** (wish #5) — rules above; TICKET-047 groundwork exists.
11. **Group exercise leaderboards** (Tier-2) — reuses percentile + groups infrastructure.
12. **Equipment profiles + substitution** (Tier-2/wish #6) — requires the exercise-DB tagging effort; unlocks 3 features at once.
13. **Template/program library from workout_research tiers** (Tier-2) — ship named, browsable programs ("Beginner Powerlifting 3-Day LP") generated from the same data §5 uses.

### Higher cost (only if validated)
14. **Apple Watch companion logger** — top wearable demand; separate watchOS target, real maintenance burden. Validate demand with beta users first.
15. **Unified strength+cardio scheduling** (wish #9) — big differentiator, meaningful scope; natural Phase 2 of the §5 generator using other_mixed.md interference rules.
16. **Superset schema rework** (wish #8) — cost depends entirely on current schema; audit first, decide after.

---

## 4. Current state of plan generation (repo findings)

From `peak-fettle-agents/server/routes/plans.js` (POST `/plans/generate`):

- Calls **claude-haiku-4-5** (~2.5¢/plan per CTO guardrail), paid tier only, 3/day throttle, 30s timeout.
- Context assembled from DB: profile (experience_level, weight_class, sex, age_band), `user_constraints` (hard-blocked via `contraindications &&` overlap), candidate exercises (≤60), 14-day history with **inline Epley e1RM**, per-exercise PBs, 7-day HRV/sleep/RHR.
- Haiku returns a 3-week JSON program (3–4 sessions/wk, sets/reps/RPE/rest/coaching_note) + a reasoning string citing a history data point. Week 1 anchored at ~85–90% of PB.
- Known failure modes handled in code: `ai_timeout` (504), `ai_parse_error` (502), `ai_schema_error` (502).

**Two critical observations:**

1. **The prompt is already 90% algorithm.** Everything Haiku receives is deterministic DB output; everything it must obey is a hard rule (candidate list only, constraint blocks, set/rep/RPE ranges, week-over-week progression, PB-anchored loading). Haiku's actual creative contribution is exercise selection within a filtered list, slot arrangement, and English sentences.
2. **The survey doesn't yet collect what the generator needs.** `mobile/app/onboarding.tsx` captures only **sex + primary_discipline** (both skippable). The Haiku prompt receives *no* days/week, session length, goal, weight goal, or equipment — the personalization you described isn't reaching the model today either. Expanding the survey is a prerequisite for *any* generator and instantly improves whichever one ships.

---

## 5. Algorithmic plan generation — feasibility: **YES, fully**

**Verdict:** Plan generation from survey inputs (goal, time/session, sessions/week, weight goals, experience, equipment, constraints) can be done deterministically, with *better* reliability, cost, latency, privacy, and user trust than the Haiku path. The `workout_research/` library was explicitly written as a translation rulebook ("the per-sport docs define the target; scheduling_guidelines defines the translation rules" — its own words). A rulebook a model was told to follow is a rulebook code can execute.

### 5.1 Architecture (pure functions, no model)

```
survey + history + constraints
        │
  1. TEMPLATE SELECT   sport × experience tier → weekly skeleton
        │              (encoded from workout_research/ sport docs as JSON data)
  2. SCALE-DOWN        fit to sessions/week + minutes/session using
        │              scheduling_guidelines §7 hierarchy + §5 session recipes
  3. SEQUENCE          lay sessions across week (§4 rules: hard/easy alternation,
        │              48h same-muscle gap, priority on freshest days)
  4. EXERCISE FILL     slot movement patterns → concrete exercises from DB,
        │              filtered by equipment + contraindications (logic already
        │              exists in plans.js step 3), prefer user's historied lifts
  5. LOAD PRESCRIPTION e1RM (Epley — already computed inline in plans.js) →
        │              %1RM per rep target; Week 1 @ 85–90% of PB-derived target;
        │              weekly progression per sport doc; readiness modifier from
        │              HRV/sleep rules (optional)
  6. REASONING         template strings filled with the actual rule chain:
                       "3 days × 45 min → full-body LP per general_strength
                        beginner tier; bench starts 52.5kg = 87% of your 60kg PB"
```

Every step is table lookups + arithmetic. No step requires judgment that the sport docs don't already specify.

### 5.2 What must be built

| Piece | Effort | Notes |
|---|---|---|
| **Survey expansion** (goal, days/wk, min/session, equipment, weight goal) | Small | Required for Haiku path too. Add to onboarding + settings; PATCH /users/profile. |
| **Template data**: encode 7 sport docs × 3 tiers × day-count variants as JSON | Medium — the main cost | Mechanical transcription of docs that already specify weekly structures. ~20–30 templates. Can be generated once with AI assistance *offline* and human-reviewed — zero runtime AI. |
| **Exercise DB tagging**: movement_pattern + equipment fields | Medium | One-time data pass over the exercises table; also unlocks substitution + heatmap features (§1–2). |
| **Generator module** (~400–600 lines, pure functions) | Medium | Deterministic = unit-testable against fixtures, parse-sweepable, no API mocking. |
| **Reasoning templates** (~20 strings with slots) | Small | More specific than Haiku's output, because it cites the real rule fired. |

Rough total: **2–4 focused dev weeks**, mostly data encoding. Fits the Sonnet workhorse lane; the load-math belongs in the Opus lane per CLAUDE.md routing.

### 5.3 Algorithmic vs. Haiku — head-to-head

| Dimension | Haiku 4.5 path | Algorithmic path |
|---|---|---|
| Marginal cost | ~2.5¢/plan + API dependency | $0 |
| Latency | seconds–30s, 504s possible | <50ms |
| Failure modes | timeout / malformed JSON / schema drift (all handled but real) | none at runtime; bugs are testable |
| Offline | impossible | works — aligns with local-first migration |
| Determinism / QA | non-reproducible outputs | unit tests, golden fixtures, parse-sweep |
| 3/day throttle | needed (cost) | unnecessary — unlimited regenerations, free tier viable |
| Privacy story | history sent to external API | computed on-device/server, nothing leaves |
| Branding | "AI-generated" — documented skepticism | "evidence-based engine, here's the rule that fired" |
| Exercise variety / novelty | mild creativity | bounded by templates + seeded shuffle within equivalent-exercise pools (adequate) |
| Free-text constraints ("custom" notes) | handled natively | weak spot — see hybrid below |

### 5.4 Recommended rollout

1. **Phase 1:** Ship the algorithmic generator as the default for everyone (free tier included — instantly answers wish-list #1/#4). Brand it "Peak Fettle Training Engine — built on published sports science," show the rule chain. Keep `is_ai_generated=false`; the plans JSONB schema is already opaque/flexible, so no migration needed.
2. **Phase 2:** Layer rule-based adaptation (the thing users actually praise): RIR-triggered load bumps, deload detection, readiness modifier. All rules, all transparent.
3. **Optional hybrid (quiet):** keep one narrow Haiku call ONLY for parsing free-text custom constraints into structured tags at survey time (one call per user, not per plan), and/or an opt-in "coach commentary" paragraph for paid users — never in the generation critical path, never in the branding.
4. **Deprecate** `/plans/generate`'s Haiku call once parity is verified; keep the endpoint shape so the mobile client doesn't change.

Risk to flag honestly: the generator's quality ceiling is the quality of the encoded templates. That's mitigated by the fact the templates come from the already-vetted research library — and by filling its gaps, which is §6.

---

## 6. Sport research: library audit + new guidance (soccer, basketball, bodybuilding)

### 6.1 Audit of existing `workout_research/`

The library (compiled 2026-05-15) is **current and high quality**. Verified against 2026 sources:

- **Powerlifting** — LP → DUP → block by tier, RPE autoregulation, 10–25 set/wk landmarks: matches current consensus, no staleness.
- **Cycling** — Coggan 7-zone/FTP still the industry standard (TrainingPeaks/TrainerRoad 2026); pyramidal-base → polarized-pre-race matches the 2024 meta-analysis. Minor optional additions: FTP retest cadence (every 6–8 weeks) and HRV-guided day-to-day adjustment as an additive layer.
- **General strength** — already cites the 2026 ACSM update (first in 17 years): hypertrophy across wide rep ranges when effort is sufficient; ≥2×/wk per muscle as primary driver; ~10 sets/muscle/wk threshold; failure not required. Aligned.
- **Gaps:** soccer (largest recreational sport on earth), basketball, bodybuilding-distinct-from-general-strength. Also no CrossFit *tag* (other_mixed covers the content; users who self-identify as "CrossFit" won't match). Tennis/golf/martial arts: P3, skip for now.

The three gap sports below are summarized to the same structure as the existing docs and are ready to be expanded into full `workout_research/*.md` files (a good next agent run — the researcher-agent skill files in `workout_research/agents/` exist for exactly this).

### 6.2 SOCCER

Demands: aerobic capacity, repeated-sprint ability (RSA), power, agility; ~10–12km/match, 150–250 high-intensity actions. The defining axis is **in-season vs off-season**.

| Tier | Off-season | In-season |
|---|---|---|
| Beginner | 3 d/wk (2 strength full-body 2–3×8–12 @65–75% + 1 conditioning/small-sided games) | 1 strength session/wk, 2–3×8–12; matches supply conditioning |
| Intermediate | 3–4 d/wk, block: hypertrophy (wk1–3, 8–15 reps) → max strength (wk4–6, 4–6 reps @80–90%) → power (wk7–10, 3–5 explosive reps + plyos + SSGs) | 1–2 sessions/wk (1 = anti-detraining floor), 2–3×3–6 heavy; ~48h post-match and ≥48h pre-match |
| Advanced | 4-phase: transition → hypertrophy → max strength → power/speed; 4–5 d/wk | 2 sessions/wk @75–85% + plyos; pro-style MD-4/MD-3/MD-2 microcycle |

Essentials: **FIFA 11+ warm-up every session/match** (30% overall injury reduction, ~48% in youth; free, no equipment, ~15 min). **Nordic hamstring curls** (~50% hamstring strain reduction — highest-evidence single exercise). Conditioning gold standard = small-sided games (technical + physical simultaneously). Minimum effective dose in-season: 1 session/wk, 2 sets each of squat + hinge + upper pull at moderate-high intensity.
Sources: NSCA *Strength Training for Soccer*; FIFA 11+ systematic reviews (PMC5704377, PMC12371935); JSCR in-season maintenance studies; PMC11747014 (low-volume team-sport meta-analysis, 2025).

### 6.3 BASKETBALL

Demands: vertical power, lateral agility, RSA; long season makes in-season maintenance the dominant problem.

| Tier | Off-season | In-season |
|---|---|---|
| Beginner | 2–3 d/wk full-body LP, 3×8–12; low plyos (low box, 2–3×6–8) after strength base | 1 session/wk full-body, volume −40–50% |
| Intermediate | 12-wk block: hypertrophy (3–4×8–12 @65–75%) → max strength (4–5×3–6 @80–90%) → power (3–4×3–5 explosive + depth jumps 40–60cm) | 2 sessions/wk, 2–3×4–6 heavy, ~30–45 min; 48h post-game / 48h pre-game |
| Advanced | 4-phase block; Olympic-lift derivatives central if barbell available (else loaded jump squats/KB swings); periodized plyo continuum | 2–3 sessions/wk maintenance model |

Key evidence: combined heavy strength + plyometrics beats either alone for vertical jump (resistance alone +9.9cm vs plyo alone +5.2cm; complex training superior — PAP pairing heavy squat → box jump). Injury: ankle + ACL dominate; neuromuscular training programs cut ACL risk 25–33% (up to 50% in females) — Nordics, single-leg landing work, lateral band walks, 30–60 min/wk. Minimum dose in-season: 1 session/wk of 3×5 heavy squat + 3×5 jump squat maintains lower-body power.
Sources: PMC11235879 (plyo meta, 2024); Frontiers 2025 complex-training meta; PMC11355145 (injury prevention SR, 2024); NSCA team-sport periodization supplement.

### 6.4 BODYBUILDING (distinct from general_strength.md)

Why it needs its own doc: per-muscle volume landmarks ramped across mesocycles, isolation work as first-class (side/rear delts, arms, calves), exercise rotation between mesos, broad deliberate rep-range spectrum. A user selecting "bodybuilding" today gets a general-strength plan that undershoots all of this.

**RP volume landmarks (intermediate, sets/muscle/week):** MV ~4–6 · MEV ~6–8 · MAV ~12–20 (the sweet spot) · MRV ~18–30+. Per-muscle MEV/MAV/MRV table (chest 8/12–16/22, back 8/14–22/25+, quads 8/12–18/25, delts-side/rear 6/16–22/26, biceps 6/14–20/26, etc.) available in full agent output. 2025 Schoenfeld meta-regression: ~+0.24% hypertrophy per added weekly set, roughly linear with diminishing returns past ~20 — no sharp MRV cliff.

| Tier | Structure |
|---|---|
| Beginner | 3 d/wk full-body or 4-d upper/lower; start at MEV (6–8 sets/muscle/wk); 8–15 reps @65–75%, double progression |
| Intermediate | 4–5 d/wk U/L or PPL; mesocycle = start near MEV → ramp to MAV/MRV over 4–6 wks → 1-wk deload at MV; mixed ranges (5–8 heavy / 8–15 main / 15–25 pump); every muscle ≥2×/wk |
| Advanced | 5–6 d/wk (PPL×2); 15–25+ sets/muscle at peak; accumulation → intensification blocks; deload every 3–4 wks; intensity techniques as volume amplifiers |

Minimum dose: grow on ~6–8 hard sets/muscle/wk near failure; maintain on 4–6.
Sources: rpstrength.com volume-landmarks; Schoenfeld 2025 meta-regression (PubMed 41343037) + 2018 volume study (30153194); ACSM 2026 RT guidelines; Stronger By Science frequency analysis.

### 6.5 Recommended actions

1. Run the `workout_research/agents/` researcher pattern to produce full `soccer.md`, `basketball.md`, `bodybuilding.md` docs from the §6.2–6.4 skeletons (P1, P1, P2).
2. Add the three sports + "CrossFit/functional" alias to the onboarding discipline picker.
3. Add the in-season/off-season toggle to the survey for team-sport users — it changes everything about their plan and is a question no mainstream app asks (differentiator).
4. Encode all ten sport docs into the §5 template data once written.

---

## 7. Priority shortlist (if you only do five things)

1. **Expand the onboarding survey** (goal, days/wk, min/session, equipment, in/off-season) — prerequisite for everything, improves even the current Haiku output the day it ships.
2. **Build the algorithmic generator** (§5) and rebrand plans as the evidence-based Training Engine with visible reasoning — kills cost, latency, parse errors, the 3/day cap, and the AI-trust problem in one move.
3. **Ship the Tier-1 quick wins**: plate/warm-up calculator, PR toasts + e1RM charts, background-safe rest timer, data export.
4. **Muscle recovery heatmap + rule-based readiness score** — the two most replicable signature features in the market, powered by data already in the DB.
5. **Fill the sport gaps** (soccer/basketball/bodybuilding docs → templates → discipline picker).

---

## Appendix — primary sources

Competitor praise: setgraph.app Reddit roundups; corahealth.app; repreturn.com (Hevy); strong.app/love; hevyapp.com feature pages; dr-muscle.com reviews (Fitbod, JuggernautAI, Strong); cybernews.com (Whoop 2025); the5krunner.com (Garmin); ScienceDirect S0378873322000909 (kudos study); Strava press releases; Boostcamp App Store.
Wishlist/complaints: findyouredge.app; loadmuscle.com features-2026; TIME 6958557 (ChatGPT trainer); techcrunch.com FTC dark-patterns (2024); TechRadar fitness-privacy; Apple/Garmin community sync threads; Hevy help-center circuits doc; barisloadedapp.com.
Sport science: NSCA (soccer book, team-sport periodization); FIFA 11+ (PMC5704377, PMC12371935); JSCR in-season maintenance; PMC11235879, PMC12131147, PMC11355145 (basketball); rpstrength.com volume landmarks; Schoenfeld (PubMed 41343037, 30153194); acsm.org 2026 RT update; strongerbyscience.com; TrainingPeaks/TrainerRoad (Coggan/FTP).
