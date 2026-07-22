# Engine v2 — Requirements Addendum (founder decisions, 2026-07-02)

**Status:** the engine-v2 test run is **APPROVED — build for real**, with the additions below folded in.
**Gating decision:** the new plan-generation experience is **PRO ONLY**. Free keeps the current basic generation untouched.
**Trial design decision:** "I don't know" split → **sequential trials, 3 weeks each** (see §2).

These extend `DESIGN_SPEC.md`; where they conflict, this addendum wins.

## 1. Deep survey on "Generate plan"

Tapping Generate Plan (Pro) launches an expansive survey — deeper than the app's
opening survey, pre-filled from it where answers exist. NEW required dimension:

**Split preference** — one of:
- Push / Pull / Legs (PPL)
- Upper / Lower
- Body-part split (chest day, back day, arms day, … aka "bro split")
- **"I don't know"** → triggers the trial-splits flow (§2)

Rationale to capture in survey copy: split choice is individual — e.g. push days
front-load compounds and suit some lifters, while others accumulate too much
fatigue/soreness to perform later exercises; trials let the user find out.

All other v2 survey dimensions stand as designed (days/week, session length,
goals incl. powerlifting w/ meet date, experience→RIR, injury constraints,
config knobs for failure-proximity / progression speed / deload cadence).

## 2. "I don't know" → sequential trial splits

- Generate a **sequence of three 3-week trial blocks**: PPL → Upper/Lower →
  Body-part (order fixed for fair comparison; each block scaled to the user's
  days/week + session length).
- At the end of EACH block (and at sequence end), prompt: *"Make this your main
  split?"* — the user may adopt early without finishing all three.
- On adoption: regenerate a full plan on the chosen split (with the user's full
  survey inputs), **integrate it into the calendar/schedule**, and redirect the
  user to the schedule screen to set timing/days.
- On completing all three without adopting: summary comparison prompt → user
  picks → same adoption path. User may also re-request a new plan with an
  explicit preference at any time.

## 3. Post-generation meta-changes

After a plan exists, expose **"Request changes"**: structured meta-adjustments
that regenerate the plan without redoing the whole survey — e.g. change
days/week, session length, split, emphasis (muscle priorities), swap disliked
exercises, more/less aggressive progression, deload timing. Applied as a
parameter patch → deterministic regeneration; show a diff-style summary of what
changed.

## 4. Pro quick-swap during workout (busy machine)

In the workout logger (Pro), each exercise gets a quick action: **"Machine
busy? Swap"** → list alternative exercises for the **same specific region**
(see §5), filtered by the user's equipment profile and injury constraints,
ranked by movement-pattern similarity. Swap applies to today's session only
(plan itself unchanged) unless the user opts to make it permanent (meta-change).

## 5. Exercise taxonomy maturation (prerequisite for §4)

The catalog's muscle tagging must move from generic ("chest") to
**region-level** so swaps are not counterproductive:

- e.g. incline press → **upper chest**; flat press → mid chest; dips/decline →
  lower chest; rows → mid-back/lats split; curls → biceps long/short head where
  meaningful; delts → front/side/rear; quads/hams/glutes/calves split; etc.
- Schema: add `region` (specific target) alongside the existing coarse
  `muscle_group`, + `movement_pattern` (horizontal press, vertical pull, hinge,
  squat, lunge, isolation-curl, …) and `equipment` tags needed for §4 ranking.
- Applies to the on-device catalog (engine + quick-swap are local-first);
  server catalog follows the same shape for Pro sync.

## 6. Staging

1. **Stage 1 (now):** port the parametric engine (TS, on-device, deterministic)
   incl. split-preference + trial-sequence generation; build the deep survey UI
   (Pro-gated). Apply the two flagged test-run refinements (squat-pattern
   redundancy; primary/secondary/accessory role tagging).
2. **Stage 2:** trial-block lifecycle (block end prompts, adoption, calendar
   integration + redirect), meta-change requests.
3. **Stage 3:** taxonomy enrichment of the catalog + quick-swap UI in the
   logger.

Non-negotiables: local-first invariant (free path makes no personal REST
calls — unchanged since the feature is Pro-only but generation itself stays
ON-DEVICE); deterministic engine (no Date.now()/Math.random() in logic — clock
injected); verification gate (babel sweep, node tests, tsc delta) before any
commit.
