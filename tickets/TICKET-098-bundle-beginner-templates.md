# TICKET-098 — Bundle Beginner Templates (PPL 3-day, PPL 6-day, Upper/Lower) + Safe Swaps

**Owner:** dev-frontend (mobile) + data
**Date opened:** 2026-06-06
**Updated:** 2026-06-06 — scope expanded to three splits (founder: 3-day + 6-day PPL **and** an Upper/Lower split).
**Phase:** R — Revision & Hardening
**Source:** Founder request 2026-06-06 ("PPL not pulling; ship with the app; no high-risk lifts; give both 3- and 6-day PPL plus an upper/lower split").

## Goal
Ship beginner training templates **with the app (bundled, not DB-fetched)** so they always load, covering three splits, with high-risk **barbell back squat** and **conventional deadlift** replaced by beginner-safe alternatives:

1. **PPL — 3-day** (Push / Pull / Legs, once each per week)
2. **PPL — 6-day** (Push/Pull/Legs ×2, with A/B variation)
3. **Upper / Lower — 4-day** (Upper A · Lower A · Upper B · Lower B)

## Background
Templates are currently served from the server/DB (`peak-fettle-agents/server/routes/plans.js`, `is_template`), which is why they can fail to load. Bundling removes the network/DB dependency and aligns with the local-first direction (TICKET-094).

## Safe-swap policy (all templates)
No barbell back squat, no conventional (barbell) deadlift. Beginner-safe substitutes:
- **Squat pattern →** Leg Press (or Hack Squat machine)
- **Hinge/Deadlift pattern →** DB Romanian Deadlift or Hip Thrust
- **Presses/rows →** machine or dumbbell variants (no spotter needed)

## Bundled template definitions
Sets × reps are beginner defaults (tunable). Exercises referenced by **stable slug**, resolved to library ids at load.

### 1) PPL — 3-day
- **Push:** Machine/DB Chest Press 3×8–12 · Incline DB Press 3×8–12 · Machine Shoulder Press 3×8–12 · Lateral Raise 3×12–15 · Triceps Pushdown 3×10–15
- **Pull:** Lat Pulldown 3×8–12 · Seated Cable Row 3×8–12 · Face Pull 3×12–15 · DB Curl 3×10–15
- **Legs:** Leg Press 3×8–12 · DB Romanian Deadlift *or* Hip Thrust 3×8–12 · Seated Leg Curl 3×10–15 · Leg Extension 3×10–15 · Calf Raise 3×12–15

### 2) PPL — 6-day (A/B variation)
- **Push A / Pull A / Legs A** = the 3-day templates above.
- **Push B:** Incline Machine/DB Press 3×8–12 · Flat DB Press 3×8–12 · DB Shoulder Press 3×8–12 · Cable Lateral Raise 3×12–15 · Overhead Triceps Extension 3×10–15
- **Pull B:** Chest-Supported Row 3×8–12 · Close-Grip Lat Pulldown 3×8–12 · Rear-Delt Fly 3×12–15 · Hammer Curl 3×10–15
- **Legs B:** Hack Squat *or* Leg Press 3×8–12 · Hip Thrust 3×8–12 · Lying Leg Curl 3×10–15 · Leg Extension 3×10–15 · Seated Calf Raise 3×12–15

### 3) Upper / Lower — 4-day
- **Upper A:** Machine/DB Chest Press 3×8–12 · Lat Pulldown 3×8–12 · Machine Shoulder Press 3×8–12 · Seated Cable Row 3×8–12 · Triceps Pushdown 3×10–15 · DB Curl 3×10–15
- **Lower A:** Leg Press 3×8–12 · Seated Leg Curl 3×10–15 · Leg Extension 3×10–15 · Hip Thrust 3×8–12 · Calf Raise 3×12–15
- **Upper B:** Incline DB Press 3×8–12 · Chest-Supported Row 3×8–12 · Lateral Raise 3×12–15 · Close-Grip Lat Pulldown 3×8–12 · Hammer Curl 3×10–15 · Overhead Triceps Extension 3×10–15
- **Lower B:** Hack Squat *or* Leg Press 3×8–12 · DB Romanian Deadlift 3×8–12 · Lying Leg Curl 3×10–15 · Leg Extension 3×10–15 · Seated Calf Raise 3×12–15

## Scope — in
- A bundled `beginnerTemplates` data file (JSON/TS) shipped in the app, containing all three splits above.
- Exercises referenced by **stable slug**; a resolver maps slug → library exercise id at load, degrading gracefully (clear, logged fallback) if one is missing.
- Wire `app/templates.tsx` / plans to read the bundled templates (not the network) for these beginner templates.
- Template picker presents the three splits with day breakdowns; selecting a day/template builds a routine session that opens in the stepper.

## Scope — out
AI plan generation; intermediate/advanced templates; removing the server template path for other (non-beginner) plans.

## Acceptance criteria
1. All three splits (3-day PPL, 6-day PPL, Upper/Lower) appear and start a session **without network/DB**.
2. No barbell back squat or conventional deadlift in any bundled template.
3. Every referenced exercise resolves to a library entry, or shows a clear logged fallback.
4. Selecting any day builds a valid routine session that opens in the stepper with the mapped exercises and target sets/reps.

## Test plan
Airplane mode → templates list shows all three splits → start a day from each → stepper opens with the listed exercises; confirm no barbell squat/deadlift; confirm each slug resolves.

## Open / prerequisites
- **Confirm the exercise identifier scheme** (slug vs UUID) so the bundled file can reference exercises stably — the one remaining blocker to implementing.
- Confirm the listed exercises exist in the library (or add the missing ones, e.g. Hack Squat, Chest-Supported Row, Hip Thrust) before wiring.
- Runtime device test required to satisfy "ensure they are functioning."

## Notes
Old open decision (3-day vs 6-day) is **resolved: ship both, plus Upper/Lower.** Once the slug↔library mapping is confirmed, this is a contained implementation (bundled data + resolver + wiring) with no server/native dependency. Superseded filename: the prior `TICKET-098-bundle-ppl-beginner-templates.md` is replaced by this expanded version.
