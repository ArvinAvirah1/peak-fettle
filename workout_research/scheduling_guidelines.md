# Scheduling Guidelines — Haiku Agent Reference

**Audience:** Peak Fettle's Claude Haiku routine-generation agent.
**Compiled:** 2026-05-15 · Workout Research Subteam
**Purpose:** Convert the "ideal" routine from a sport doc into a *real* plan that fits a user's available days, session length, equipment, and recovery capacity — **without losing the core training stimulus.** Read this file together with the relevant sport doc; never use one without the other.

---

## How to use this doc

The per-sport docs (`powerlifting.md`, `running.md`, etc.) define the *target*. This file defines the *translation rules*. The standard flow:

1. Read the user's sport tag, experience tier, available days/week, session length, equipment, and any constraints (injuries, recovery markers, life context).
2. Open the matching sport doc and identify the ideal weekly structure for the user's tier.
3. Apply the **scale-down hierarchy** (§7) until the plan fits the user's constraints.
4. Apply the **sequencing rules** (§4) to lay sessions across the week.
5. Apply the **session-length recipes** (§5) to set what goes into each session.
6. Define a **minimum viable session** (§9) the user can fall back to on bad days.
7. Build in deloads and recovery (§3).

---

## 1. Core principle — protect intensity above all

When time/days/recovery are short, the agent must protect **intensity and effort** (proximity to failure on lifts; high-quality interval work on cardio). Everything else — total volume, accessory work, easy filler — is more expendable. This is the variable that drives adaptation *and* maintains fitness on minimal volume. Never the first thing cut.

---

## 2. Minimum effective dose — what's actually achievable on very little time

The evidence is encouraging: meaningful fitness is achievable on remarkably little time, *provided intensity is high*.

**Strength — minimal dose to *improve*:**
- **2 sessions/week, 1–2 sets per exercise** is enough to drive significant 1RM gains in resistance-trained men.
- Even **1 set, 1–3×/week** induces significant 1RM gains.
- Practical floor: a single set of **6–12 reps at ~70–85% 1RM, 2–3×/week, taken close to failure**, for 8–12 weeks.
- A **2-day/week full-body plan** clears the minimum effective dose.
- **Effort is the non-negotiable variable** — low volume works *only* if proximity to failure is high.

**Strength — minimal dose to *maintain* (Spiering et al. 2021):**
- **1 session/week is enough to maintain 1RM strength** (vs the usual 2–3).
- 1 session every *two* weeks → significant strength decline.
- A single working set, 1 day/week, maintains strength in both young and older lifters.
- Caveat for muscle *size*: younger lifters can maintain size on 1 set/bodypart 1×/week; **older lifters need 2×/week, 2–3 sets/bodypart** to maintain mass.

**Cardio / VO2max — minimal dose:**
- **20–30 minutes of HIIT per week** (intensity >90% HRmax), typically as 3 sessions/week, produces meaningful VO2max improvement.
- Effective protocols: running HIIT ~140s work / ~165s recovery, or sprint-interval training (≤30s sprints, <97s recovery), 3×/week, 3–6 weeks.
- **To maintain cardio:** intensity is the protected variable. Cutting intensity by ~33% reduced VO2max but preserved endurance capacity; cutting it by ~66% degraded both. Frequency and duration can drop substantially if intensity stays high.

**Health-floor baseline (ACSM / Physical Activity Guidelines for Americans):** ≥150 min/week moderate *or* 75 min/week vigorous aerobic, plus strength training ≥2 days/week covering all major muscle groups.

**Decision rule for the Haiku agent:**
- A user with **2 × 20 min/week** → still *improves*. E.g., two full-body high-effort strength sessions, or strength + a short HIIT block.
- A user with **3 × 20–30 min/week** → meaningfully builds both strength and VO2max.
- A user with **1 × short session/week** → maintenance only; frame honestly.

---

## 3. Recovery science — what the agent must respect

**Between sessions, same muscle group:** ~48 hours before re-training; if still sore, wait longer (up to 5 days for significant DOMS). Soreness persisting beyond 48–72 hours is a flag for under-recovery.

**By intensity type:** high-intensity sessions need more recovery than moderate/easy work. Schedule a **rest day every 7–10 days** for users doing regular high-intensity work; **at least 1 full rest day per week** for everyone. Easy aerobic work can serve as active recovery and can be done more frequently.

**Sleep:** the target is **7–9 hours uninterrupted** — the single highest-leverage recovery variable. If the user reports chronic sleep <6h, the agent should flag this and reduce planned load.

**Overtraining / under-recovery flags** the agent should check for periodically: persistent fatigue and not feeling recovered between sessions; performance decline / inability to push in workouts; mood changes (anxiety, irritability, depression, restlessness); soreness beyond the normal 48–72h window; elevated illness frequency; elevated resting HR; poor sleep. **Recovery from true overtraining syndrome takes 4–14 weeks** — prevention >> cure. Build in deloads proactively (see each sport doc).

---

## 4. Sequencing rules

### Within a day (when two modalities share a day)
- **Goal = strength/muscle/power → strength FIRST.** Lifting-first groups show higher lower-body 1RM and better explosive-strength/muscular-endurance gains.
- **Goal = endurance → cardio FIRST.**
- **Goal = fat loss → strength first** (greater reductions in total and visceral fat observed).
- **If schedule allows, separate the two by 4–6 hours** for better performance in both.
- **If concurrent in one session, keep the cardio portion <30 minutes** to limit interference with the strength work.

### Within a week
- **Alternate hard and easy days** — never stack high-intensity sessions back-to-back.
- Space same-muscle-group strength sessions ~48h apart.
- Put the highest-priority / most-specific sessions on days when the user is freshest (after a rest/easy day).
- Place a rest or easy day after the hardest session.
- For concurrent training, separating strength and endurance onto **different days** (or by several hours) reduces molecular interference.

---

## 5. Session-length recipes — what fits in what duration

A practical mapping the agent can use as a starting point:

- **15 min — one thing only.** A focused HIIT block (short sprint intervals) OR a brief full-body high-effort strength circuit (a few compound lifts, minimal rest). No warm-up luxury — movement prep is built into the first set. Maintenance-to-modest-improvement territory.
- **30 min — one quality done well with a real warm-up.** A complete HIIT session (20–30 min HIIT/week is the effective dose, so one 30-min session is substantial), OR a full-body strength session of ~3–4 compound lifts, OR a moderate continuous cardio bout. Enough to *improve* at 2–3×/week.
- **45 min — one quality plus a secondary component.** Strength session + short finisher/conditioning block; or a structured endurance session with warm-up, main set, cooldown.
- **60 min — full single-discipline session** with proper warm-up, main work, accessory work, cooldown. Or a deliberately sequenced concurrent session (strength then ≤30 min cardio).
- **90 min — full sport-specific session** with technique work, or a long endurance session, or strength + meaningful conditioning with adequate rest between. Allows the "complete" version of most routines.

**Key principle:** as session length drops, cut *volume and accessory work*, not intensity. The core stimulus (a few hard sets / the interval block) is preserved; warm-up, accessories, and easy volume are trimmed.

---

## 6. Triage — prioritizing sessions when days are scarce

When the user has few days available, allocate by **goal type**:

- **Goal = strength / muscle:** keep full-body compound strength sessions taken near failure. 2 days → 2 full-body sessions. Drop isolation/accessory work first. Strength can be *maintained* on as little as 1 session/week, so even a 1-day week isn't a write-off.
- **Goal = cardiovascular fitness / VO2max:** keep HIIT/interval sessions (highest stimulus per minute). 2 days → 2 short HIIT sessions. Drop long slow distance first when time-crunched.
- **Goal = endurance event (race-specific):** keep one threshold/tempo session and one long(er) aerobic session — the two highest-transfer sessions. Drop easy "filler" volume.
- **Goal = general health / longevity:** hit the ACSM floor — combine strength + cardio in each session, since the goal is broad coverage not peak specificity.
- **Goal = sport-specific (e.g., swimming):** keep the most sport-specific sessions (in-water technique + threshold) over generic dryland; dryland is the first thing to cut under time pressure.

**General rule:** keep sessions that are (a) highest-specificity to the goal and (b) highest-stimulus-per-minute; cut accessory volume, easy filler, and generic cross-training first.

---

## 7. Scale-down hierarchy — the order in which to cut

When constraints tighten (fewer days, less time, lower recovery), the Haiku agent should cut in this order:

1. **Protect intensity/effort first.** Never the first thing cut.
2. **Cut accessory and isolation work first.** Keep compound, multi-joint, high-transfer movements.
3. **Cut easy/filler volume second.** Long slow distance and junk volume are the most expendable; intensity preserves the engine.
4. **Reduce sets before reducing frequency.** Drop from 3–4 sets to 1–2 hard sets per exercise — still produces gains if effort is high.
5. **Reduce frequency last.** Maintenance floors: strength on 1 session (even 1 set) per week; VO2max largely maintainable if intensity stays high even with reduced frequency/duration.
6. **Trim warm-up/cooldown duration, not existence.** Build movement prep into early working sets when time is critical.
7. **Consolidate via concurrent training** when days are scarce — combine strength + cardio in one session (interference is minimal for non-power goals); sequence by primary goal (§4).
8. **Define a minimum viable session** (see §9).

**Core principle:** the "perfect" routine is a *volume-and-accessory* construct layered on top of a small, non-negotiable core stimulus. Scaling down means stripping the layers while keeping the core intact — high-effort compound work and high-intensity intervals.

---

## 8. Concurrent training / interference effect — quick reference

- **For general fitness, health, and endurance goals, concurrent training is safe and efficient.** Hypertrophy and (for trained lifters) maximal strength are largely robust.
- **The real casualty is power/explosiveness** — relevant for sprint/power athletes and weightlifting, largely irrelevant for general-fitness and endurance users.
- **Modifiers that reduce interference:**
  - Separate modalities by **>3 hours**, ideally different days, to avoid acute molecular interference.
  - Lower-intensity / lower-volume aerobic work interferes less; high-intensity aerobic work interferes more.
  - Adequate protein intake mitigates the disruptive effect.
  - Cycling/rowing interfere less than running (eccentric/muscle damage).
- **Practical takeaway for the agent:** for general-fitness and endurance goals, don't over-worry interference. For power-focused users, separate modalities by time/day, prioritize the power session when fresh, and keep concurrent aerobic work moderate. See `other_mixed.md` for the full picture.

---

## 9. Adherence — design for the user who actually shows up

This is the most important section, because **the best routine is the one the user actually does.**

- **Habit formation timeline.** Average ~66 days to form a habit, with enormous variance — up to **254 days for complex daily exercise**. The agent and app must support a *months-long* formation window, not a weeks-long one.
- **Event-based cues beat time-based cues.** Anchoring exercise to an existing routine event ("after morning coffee," "after work") builds habit strength; just picking a clock time does not. **The agent should ask the user about anchor events** and propose schedules built around them.
- **Identity-based framing.** Framing around identity ("I am someone who exercises") rather than outcomes ("I want to lose weight") increased adherence by ~32%. The agent's tone should reinforce identity language.
- **Flexibility beats rigidity.** **80–90% consistency produces nearly the same long-term results as 100%**, with far less psychological strain. **Design plans for ~85% adherence, not 100%.** Treat missed sessions as normal, not failure — never use all-or-nothing framing.
- **Other strong predictors:** simple/easy activities, consistent routines, positive emotional experiences during exercise, personalized guidance, social/accountability dynamics.
- **Define a Minimum Viable Session (MVS) for every user** — the smallest version that still delivers the core stimulus (e.g., one HIIT block, or 2–3 compound lifts near failure). A time-crunched day becomes a *scaled session*, not a *skipped session*. This is the practical mechanism that hits the 80–90% adherence target.

---

## 10. Day-by-day construction recipe (the actual algorithm)

When generating a routine, the Haiku agent should walk through this sequence:

1. **Inputs.** Sport tag · experience tier · available days/week · typical session length · equipment available · injuries/limitations · adherence anchor events · the user's goal (look athletic / event prep / strength / longevity).
2. **Open the sport doc.** Identify the *ideal* weekly structure for the tier (volume, frequency, key sessions).
3. **Reality check days.** If user's available days ≥ ideal frequency, use the ideal structure. If fewer, run §6 triage to choose which sessions survive.
4. **Reality check time.** Apply the §5 session-length recipe to each surviving session.
5. **Reality check equipment.** Walk each exercise down the ladder in the sport doc to the user's available level; for weightlifting/swimming, **honestly flag** when the no-equipment fallback is "attribute training," not equivalent.
6. **Layout.** Apply §4 sequencing — alternate hard/easy days, separate strength and hard cardio when possible (≥6h or different days), put highest-priority sessions on the freshest day (after rest), end with a rest/easy day after the hardest day.
7. **Recovery.** Confirm ≥1 rest day/week; schedule a deload roughly per the sport doc's tier guidance (typically every 3–6 weeks).
8. **Minimum Viable Session.** Define the MVS for this user (one HIIT block, or 2–3 compounds near failure for strength) and surface it as an explicit "if you only have 15 minutes" fallback.
9. **Adherence framing.** Anchor sessions to the user's named life events; phrase milestones in identity language; explicitly state that 85% completion is success.
10. **Honest expectations.** State the realistic weekly time commitment and the realistic adaptation timeline. If the user's time/days fall below minimum effective dose for their goal, say so plainly and propose a maintenance-or-better alternative goal.

---

## 11. Key sources

- Resistance Exercise Minimal Dose Strategies for Increasing Muscle Strength (Sports Med): https://pmc.ncbi.nlm.nih.gov/articles/PMC11127831/
- The Minimum Effective Training Dose to Increase 1RM Strength in Resistance-Trained Men (Systematic Review & Meta-Analysis): https://pubmed.ncbi.nlm.nih.gov/31797219/
- Spiering et al. 2021 — Maintaining Physical Performance: The Minimal Dose of Exercise: https://pubmed.ncbi.nlm.nih.gov/33629972/
- Minimalist Training: Is Lower Dosage or Intensity Resistance Training Effective? (Narrative Review): https://pmc.ncbi.nlm.nih.gov/articles/PMC10933173/
- Different HIIT protocols for VO2max improvements (meta-analysis): https://pubmed.ncbi.nlm.nih.gov/30733142/
- HIIT and cardiorespiratory fitness in adults (umbrella review): https://onlinelibrary.wiley.com/doi/10.1111/sms.14652
- Physical Activity Guidelines for Americans, 2nd edition: https://odphp.health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf
- ACSM — Physical Activity Guidelines: https://acsm.org/education-resources/trending-topics-resources/physical-activity-guidelines/
- Optimizing concurrent training programs (review): https://pmc.ncbi.nlm.nih.gov/articles/PMC11688070/
- Effect of Strength and Endurance Training Sequence on Endurance Performance: https://pmc.ncbi.nlm.nih.gov/articles/PMC11359207/
- Stronger By Science — Research Spotlight: The interference effect is getting less scary: https://www.strongerbyscience.com/research-spotlight-interference-effect/
- Cleveland Clinic — Overtraining Syndrome: https://my.clevelandclinic.org/health/diseases/overtraining-syndrome
- A Behavioral Perspective for Improving Exercise Adherence: https://pmc.ncbi.nlm.nih.gov/articles/PMC11102891/
- Time to Form a Habit — Systematic Review & Meta-Analysis: https://www.mdpi.com/2227-9032/12/23/2488
- ACE — The Science of Habit Formation: https://www.acefitness.org/continuing-education/certified/march-2025/8825/the-science-of-habit-formation-a-guide-for-health-and-exercise-professionals/
