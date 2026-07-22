# Peak Fettle Engine v2 — Deep Research Synthesis (CITED)

**Date:** 2026-06-30 · **Purpose:** Evidence base for the full *parametric* rebuild of the Pro-tier workout schedule-generation engine (`engine-v2-testrun/`). This is a design-input document — a founder-reviewable, source-grounded synthesis with concrete numbers/ranges. Every claim is cited inline as (Source, URL); a consolidated "Sources" list is at the end.

**How this was produced:** four parallel deep-research passes (WebSearch + source fetching) across the ten required areas, then triangulated against the repo's existing evidence base — `strengthModelV3.ts`, `audits/full-review-2026-06-19/math-validation/TRAINING-AGE-RESEARCH.md` (the double-exponential training-age curve, reused verbatim below), `strength_curve_model.md`, and `TRAINING_ENGINE_SPEC_2026-06-11.md`.

**Scope of the numbers.** Where a value is peer-reviewed (meta-analysis / RCT / large survey) it is flagged as such. Where a value is well-triangulated practitioner consensus (RP/Israetel, Helms/3DMJ, Stronger by Science, JTS/Barbell Medicine) rather than trial-proven, it is flagged as *practitioner consensus* — those are used for defaults and are always clamped by experience-gated safe bounds. RP per-muscle landmark numbers vary ±2 sets across secondary reproductions; the anchors below were cross-validated across the official RP guide, the Israetel table, and LiftVault.

---

## 0. Experience taxonomy this engine uses (reused from repo)

The app already ships a 5-level experience taxonomy (`beginner / novice / intermediate / advanced / elite`) and maps each to an approximate **training age in years** (`strengthModelV3.ts` `EXPERIENCE_TO_YEARS`): beginner 1, novice 2, intermediate 4, advanced 6, elite 9. Engine v2 keys all experience-dependent parameters (volume, RIR, periodization, deload cadence) off this same taxonomy so the two systems stay consistent.

The training-age → strength dose-response is the repo's fitted **double-exponential** (`TRAINING-AGE-RESEARCH.md`): `gain(t) = 28·(1−e^(−1.70·t)) + 35·(1−e^(−0.24·t))` (% gain vs untrained, asymptote ≈ 63%, SSE 0.57 vs pooled Steele 2022 / Latella 2024 / Rhea 2003 anchors). Two independent methods — meta-analytic effect sizes and within-person longitudinal growth models on 9,000–15,000 lifters — converge on a **steeply front-loaded, saturating** curve with a practical plateau by ~1–2 years. **The engine-design consequence:** less-experienced lifters need *less* volume, recover faster, and adapt to simpler progression; more-experienced lifters need *more* volume, more frequent deloads, more periodization structure. This single fact drives most of the experience-scaling below.

---

## 1. Weekly volume landmarks (MV / MEV / MAV / MRV), hard sets per muscle per week

### 1.1 The RP / Israetel framework — definitions

Coined by Mike Israetel / Renaissance Periodization (RP Strength, *Training Volume Landmarks for Muscle Growth*, https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth):

- **MV — Maintenance Volume:** minimum sets to *retain* muscle. RP's blanket figure ≈ **6 sets/muscle/week** when trained ≥2×/week, "whether you're a beginner or advanced lifter."
- **MEV — Minimum Effective Volume:** the *lowest* volume that still grows muscle; "the starting point for each mesocycle." For beginners MEV sits close to MV; the MEV–MV gap widens with training age.
- **MAV — Maximum Adaptive Volume:** the *range* between MEV and MRV where the best gains occur — you ramp *through* it week to week (not a fixed number).
- **MRV — Maximum Recoverable Volume:** the ceiling you can still recover from. Chronically training at/above it stalls progress; briefly touching it can trigger supercompensation before a deload.

**Set-counting convention (critical for the engine):** count only sets where the target muscle is **prime mover or direct isolation**; indirect/synergist work is already discounted into the landmark numbers (RP counts a compound as 1.0 for the prime mover, ~0.5 for synergists — bench = 1 chest, 0.5 triceps, 0.5 front delt) (Tailored Coaching Method, https://tailoredcoachingmethod.com/training-volume-how-many-sets-per-week/). Working-set definition: **30–85% 1RM, 5–30 reps, 0–4 RIR** (RP Strength, same URL).

### 1.2 Per-muscle landmark table (weekly hard sets)

Consolidated from the official RP hypertrophy guides (as reproduced by the RP-guide visualizer, verified per-muscle), the Israetel table (https://drmikeisraetel.com/dr-mike-israetel-mv-mev-mav-mrv-explained/), and the LiftVault RP summary (https://liftvault.com/programs/bodybuilding/mike-israetel-5-week-hypertrophy-workout-routine-spreadsheet/):

| Muscle | MV | MEV | MAV (range) | MRV | Freq/wk |
|---|---|---|---|---|---|
| **Chest** | 8 | 10 | 12–20 | 22 | 1.5–3× |
| **Back** | 8 | 10 | 14–22 | 25 | 2–4× |
| **Quads** | 6 | 8 | 12–18 | 20 | 1.5–3× |
| **Hamstrings** | 3–4 | 6 | 10–16 | 20 | 2–3× |
| **Glutes** | 0 | 0–4 | 4–12 | 16+ | 2–3× |
| **Side/Rear Delts** | 0 (6 if trained) | 8 | 16–22 | 26+ | 2–6× |
| **Front Delts** | 0–6 | 6–8 | 10–12 | 16–20 | 2–4× (often covered by pressing) |
| **Biceps** | 4–6 | 8 (indirect adds ~6) | 14–20 | 20–26 | 2–6× |
| **Triceps** | 4–6 | 6–10 | 10–14 | 18 (some 22) | 2–4× |
| **Calves** | 6 | 8 | 12–16 | 20 | 2–4× |
| **Abs** | 0 | 0–6 | 16–25 | 25 | 3–5× |
| **Traps** | 0 | 12 | 20–26 | 26+ | 2–4× |
| **Forearms** | 2 | 8 | 10–16 | 20–25 | 2–4× |

Verified anchors (fetched directly from the RP-guide visualizer, which reproduces the official rpstrength.com guides): Quads MV6/MEV8/MAV12–18/MRV20; Back MV8/MEV10/MAV14–22/MRV25; Rear-Side Delts MV0/MEV8/MAV16–22/MRV26.

**Small-muscle / indirect-volume rule:** halve the direct-work numbers for muscles that also get large indirect volume — **rear delts, biceps, triceps, abs** — because every row/pulldown/press feeds them (Tailored Coaching Method, https://tailoredcoachingmethod.com/training-volume-how-many-sets-per-week/; drmikeisraetel.com).

**Cluster for the engine:** most muscles sit at **MEV ≈ 8–10, MRV ≈ 18–22**; back/delts/traps tolerate more (MRV 25–26+); glutes/abs can be maintained at ~0 direct sets in many programs.

### 1.3 Dose-response evidence — how much volume actually grows muscle

- **Schoenfeld, Ogborn & Krieger 2017** (*Dose-response relationship between weekly RT volume and muscle mass*, J Sports Sci 35(11):1073–82; https://pubmed.ncbi.nlm.nih.gov/27433992/): graded dose-response, ≈ **+0.37% muscle gain per weekly set** (ES ≈ +0.023/set). Categorical: **<5 sets/wk ≈ +5.4%**, **5–9 ≈ +6.6%**, **≥10 ≈ +9.8%** — **10+ clearly beats <10**.
- **Baz-Valle et al. 2022** (*Systematic Review of Different RT Volumes on Hypertrophy*, J Hum Kinet 81:199–210; PDF https://bazmanscience.com/wp-content/uploads/2024/02/Baz-Valleetal.-2022-ASystematicReviewoftheEffectsofDifferentResistanceTrainingVolumesonMuscleHypertrophy.pdf): young trained men, groups low <12 / moderate 12–20 / high >20 sets/wk. Effect sizes (moderate vs high): **quads ES −0.2 (CI −0.49,0.10), p=0.19 (n.s.)**; **biceps ES −0.1, p=0.59 (n.s.)**; **triceps ES −0.5, p=0.01 (significant, favoring high)**. **Conclusion (verbatim): "a range of 12–20 weekly sets per muscle group may be an optimum standard recommendation … in young, trained men,"** with >20 helping only synergists that get less direct volume (triceps), not quads/biceps at 2×/wk frequency.
- **Upper end (diminishing / uncertain returns):** some studies push 30–40 sets/muscle/wk and find *more* growth, but adherence/recovery make that impractical and the effect is inconsistent (Tailored Coaching Method). The 2024–2025 Pelland/Robinson/Steele/Zourdos meta-regression (*The Resistance Training Dose Response*, Sports Med; https://pubmed.ncbi.nlm.nih.gov/41343037/) finds hypertrophy still rising with weekly volume but with **widening uncertainty past ~20 sets** and clearer diminishing returns for strength than for size.

**Engine "sweet spot": ~10–20 hard sets/muscle/week** is the well-supported optimum; ≥10 beats <10 robustly; benefit is small/uncertain from ~20→30+ while cost (fatigue, time, injury) rises. Use **MEV ≈ 10** as the growth floor and treat **20** as steep-diminishing-returns for most muscles.

### 1.4 How landmarks scale with training experience

RP principle: **MV stays ~flat (~6); MEV and MRV rise with training age** (RP Strength). Experience-tiered *starting* volumes (Tailored Coaching Method, applying RP):

| Experience | Start (most muscles) | Priority muscles | Ceiling behavior |
|---|---|---|---|
| **Brand-new (0 yr)** | **~5 sets/muscle/wk** | 1–2 at ~10 | grows on very low volume; ~5–10 = whole useful range |
| **Novice (≤~2 yr)** | **~10** | 1–2 at ~15 | bottom of the 10–20 bell curve |
| **Intermediate (~4 yr)** | **~15** | 1–2 at 17–20 | mid bell curve |
| **Advanced (~6 yr+)** | **~20**, then +1–2 sets/wk to MRV | — | lives near MRV; needs the most volume |

Corroboration: beginners grow on 5–9 sets/wk and can gain near maintenance (Schoenfeld 2017 categorical data; https://www.hevyapp.com/how-many-sets/). Practical mapping the engine uses: **beginner ~8–12, novice ~10–13, intermediate ~12–16, advanced ~16–22+** sets/muscle/wk (small muscles halved). Progression *jumps* between plateaus should be small (5→8→12, not 5→18).

### 1.5 Minimum effective dose for MAINTENANCE (in-season / time-crunched)

- **RP MV ≈ 6 sets/muscle/wk** maintains size when trained ≥2×/wk (RP Strength).
- **Bickel, Cross & Bamman 2011** (*Exercise dosing to retain RT adaptations*, Med Sci Sports Exerc; https://pubmed.ncbi.nlm.nih.gov/21131862/): after building at 27 sets/wk, **young adults maintained (even kept gaining) on 1/3 volume (9 sets/wk) and maintained on 1/9 (3 sets/wk)**; **older adults (60–75) needed ≥1/3 volume** (1/9 failed). Load/intensity must be maintained.

**Engine rule:** maintenance = **~1/3 of the user's growth-phase weekly sets, floor ~2–6 sets/muscle/wk, ≥1×/week, intensity held near normal**; raise the floor for older users.

### 1.6 MEV→MAV ramp within a mesocycle (the volume-progression algorithm)

RP model: **start at MEV, add sets each week through MAV toward MRV, then deload to MV** (RP Strength). Canonical worked example (MEV 12 → MRV 20):

| Week | Sets/muscle | Stage |
|---|---|---|
| 1 | 12 | MEV |
| 2 | 14 | +2 |
| 3 | 16 | MAV |
| 4 | 18 | MAV |
| 5 | 20 | ≈MRV |
| 6 | 6 | deload → MV |

Practical ramp rate: **+1–2 sets/muscle/week** (MesoStrength, https://mesostrength.com/blog/how-to-structure-a-4-week-mesocycle-for-hypertrophy; RP, https://rpstrength.com/blogs/articles/in-defense-of-set-increases-within-the-hypertrophy-mesocycle). Intensity rises with volume across the meso: **~3–4 RIR at MEV → ~0–1 RIR near MRV**, then deload.

---

## 2. Proximity to failure / RIR by experience and goal

### 2.1 The RIR-based RPE scale (Zourdos 2016; Helms/3DMJ)

**Zourdos, Klemp et al. 2016** (*Novel RT-Specific RPE Scale Measuring Reps in Reserve*, J Strength Cond Res 30(1):267–75; https://pubmed.ncbi.nlm.nih.gov/26049792/) established the modern **RPE = 10 − RIR** mapping. Operational scale (Helms/3DMJ, https://rippedbody.com/rpe/):

| RPE | Meaning | RIR |
|---|---|---|
| 10 | max, no more reps | 0 |
| 9.5 | no more reps, could add load | 0 |
| 9 | 1 more rep | 1 |
| 8 | 2 more reps | 2 |
| 7 | 3 more reps | 3 |
| 5–6 | 4–6 more reps | 4–6 |

Companion "reps-allowed" ranges (widen with lower load / vary by training status): 100%=1, 95%=2–4, 90%=3–6, 85%=5–9, 80%=8–12, 75%=9–15, 70%=11–18 (Helms, https://rippedbody.com/rpe/).

### 2.2 Hypertrophy vs strength respond differently to proximity-to-failure

**Robinson, Pelland, Refalo, Steele, Zourdos et al. 2024** (*Dose–Response Between Proximity to Failure, Strength Gain, and Hypertrophy: Meta-Regressions*, Sports Med 54:2209–2231; https://link.springer.com/article/10.1007/s40279-024-02069-2), adjusted for load/volume/duration/status:
- **Hypertrophy:** marginal RIR slopes negative, CIs excluding null → **muscle growth increases as sets are terminated closer to failure** (lower RIR = more growth).
- **Strength:** RIR slope CIs **contain null → negligible relationship**; "strength gains were similar across a wide range of RIR."
- Bottom line: **only hypertrophy is meaningfully influenced by RIR**; strength is driven by load/specificity.

Failure-vs-non-failure when **volume is equated**: trivial hypertrophy edge (Refalo et al. 2023, ES ≈ 0.15–0.21; https://pmc.ncbi.nlm.nih.gov/articles/PMC9935748/). Practically, **adding a set beats squeezing out the last RIR** (Stronger by Science, https://www.strongerbyscience.com/reps-in-reserve/). **Single-joint / low-load work must go closer to failure** — untrained on isolation grew ~2× going closer (12.3% vs 6.2%), while trained on multi-joint showed no difference (Nuckols re-analysis, https://www.strongerbyscience.com/effective-reps/) — because near-full motor-unit recruitment occurs at ~70% 1RM well before failure on compounds, but light/isolation work needs to approach failure to recruit high-threshold units. **Strength work is best left at ~1–3 RIR** on heavy compounds (fatigue cost of failure is disproportionate; Helms 2018 RCT: %1RM vs RPE load selection gave equal strength & hypertrophy; https://pubmed.ncbi.nlm.nih.gov/29628895/).

### 2.3 RIR self-estimation accuracy improves with experience; novices UNDERSHOOT

- **Zourdos 2016** (https://pubmed.ncbi.nlm.nih.gov/26049792/): at a true 1RM, **experienced squatters rated RPE 9.80 ± 0.18 vs novices 8.96 ± 0.43 (p=0.023)** — novices under-rated a maximal effort as sub-maximal, i.e. they misjudge how close to failure they are. RPE–velocity correlation stronger in experienced (r=−0.88) than novice (r=−0.77). The scale is **less accurate at higher reps / lighter loads**.
- **Halperin et al. 2022** (scoping review + meta, 12 studies, 414 participants; https://link.springer.com/article/10.1007/s40279-021-01559-x): people **underpredict reps-to-failure by ~0.95 reps on average** ("2 left" → really ~3). Accuracy improves **closer to failure** and at **≤12 reps/set**.
- Intraset accuracy improves toward set-end: RIR error ~1.2 at 5 RIR → ~0.46 at 1 RIR (Remmert 2023, https://pubmed.ncbi.nlm.nih.gov/37036795/). Coaches from video are off ~4.8 reps at 33% of a set → 1.2 at 90% (Emanuel 2022, https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9588140/).
- **Real-world caveat:** lab accuracy is flattered by monitoring and forced-to-failure sets; untrained lifters who have never actually reached failure have a poorly-calibrated sense of 1–2 RIR (Helms, https://rippedbody.com/rpe/). **Gauging RIR is a trainable skill.**

### 2.4 Effective / stimulating reps ("last ~5 reps")

Concept: only reps with simultaneous high-threshold motor-unit recruitment + slow shortening velocity drive hypertrophy — in practice **the last ~5 reps before failure** (Beardsley; Stronger by Science, https://www.strongerbyscience.com/effective-reps/). Full recruitment ≈ 85% max force ≈ a 5RM, or the last ~5 reps of a submaximal set to failure; EMG plateaus ~3–5 reps from failure (Sundstrup 2012). This explains why, when all sets go near failure, **rep ranges from ~5 to ~30 grow muscle equally** — every near-failure set banks ~5 effective reps. **Nuckols' caveat:** the *strict* "only last 5 count" model is not well supported (trained multi-joint lifters recruit fully far from failure); the *soft* version holds — get reasonably close to failure, but 0 RIR isn't required. **Engine use:** treat **≤5 RIR** as the "stimulating zone"; count a set as effective only within ~0–4 RIR (exactly RP's "hard set" definition).

### 2.5 Practical RIR by experience × goal + safe floors

**By goal** (Helms/3DMJ; Robinson 2024; RPETraining, https://rpetraining.com/blog/rpe-and-rir-complete-guide):
- **Hypertrophy: ~0–3 RIR, mostly 1–2** (RPE 7–9); closer on isolation/light work; failure not required every set.
- **Strength (main lifts): ~1–3 RIR**, rarely true failure; heavy singles at higher RIR (RPE ≤9); back-offs ~3–4 RIR.
- **Local/muscular endurance (light loads): to/near failure (0–1 RIR)** — metabolic stress matters more at light loads.

**By experience** (Zourdos 2016; Helms; RPETraining):
- **Novice: further from failure, ~3–4 RIR (RPE 6–7)**, broad targets, no decimals. (They under-report RIR so a nominal "2" is often 0; technique breaks near failure; never 0 RIR on technical compounds.)
- **Intermediate: ~1–3 RIR**, combine RIR with %1RM.
- **Advanced: 0–2 RIR on select work** (isolation to 0–1), precise RPE on top sets/peaking.

**Experience × goal → default RIR (target range)** — the pattern is literature-supported; exact cell values are practitioner-triangulated:

| | Novice | Intermediate | Advanced |
|---|---|---|---|
| **Hypertrophy** | 3–4 | 1–3 (≈2) | 0–2 (isolation 0–1) |
| **Strength (main lifts)** | 3–4 | 2–3 | 1–3 (heavy singles ≥1, rarely 0) |
| **Endurance (light)** | 2–3 | 1–2 | 0–1 |

**Safe RIR FLOORS (closest-to-failure the engine may ever prescribe), by experience** — from the accuracy + technique evidence:
- **Novice floor ≈ 2 RIR** on compounds (true RIR ~1 lower than reported; never 0 on technical multi-joint lifts); isolation machines may go a touch lower.
- **Intermediate floor ≈ 1 RIR** on compounds; 0 occasionally on machines/isolation.
- **Advanced floor ≈ 0 RIR** on isolation/machines and select compounds, but **heavy low-rep compounds ≥1 RIR**.
- Universal guardrail: if technique degrades or bar speed collapses, RIR is effectively too low — raise it. Because everyone tends to undershoot RIR by ~1 rep, the engine can apply a **+1-rep calibration to novice self-reports** (Halperin 2022; Stronger by Science, https://www.strongerbyscience.com/reps-in-reserve/).

---

## 3. Loading zones / rep ranges & %1RM; varying rep ranges; Prilepin

### 3.1 The strength–endurance continuum

| Zone | Reps/set | %1RM | Primary adaptation |
|---|---|---|---|
| **Strength** | 1–5 | ~80–100% (heavy ≥85%) | maximal force, neural |
| **Hypertrophy** | 6–12 (effective 5–30 near failure) | ~60–80% (~65–85%) | muscle cross-section |
| **Local endurance** | 15–30+ | <60–67% | endurance, capillarity |

NSCA: strength 1–5 @ 80–100%; hypertrophy 8–12 @ 60–80%; endurance 15+ @ <60% (NSCA *Essentials*; https://www.nsca.com/education/articles/nsca-coach/using-intensity-based-on-sets-and-repetitions-over-50-years-of-experience-a-brief-overview-of-load-setting-and-programming-strategy/). ACSM Position Stand: novice/intermediate strength 60–70% for 8–12; advanced 80–100% for 1–6; endurance <70% for 15–25 (https://www.ideafit.com/progression-models-in-resistance-training-for-healthy-adults/).

**Key modern nuance:** when sets are near failure, **hypertrophy is similar across low vs high load (30–85%)**, but **1RM strength significantly favors high load** (Schoenfeld/Grgic low-vs-high-load meta, https://journals.lww.com/nsca-jscr/fulltext/2017/12000/strength_and_hypertrophy_adaptations_between_low_.31.aspx). ⇒ Load is the primary lever for **strength**; for **hypertrophy** load is flexible and RIR is the real driver.

### 3.2 NSCA %1RM ↔ reps table (verbatim from the NSCA Training Load Chart)

Adapted from Landers 1984 (NSCA Training Load Chart PDF, https://www.nsca.com/contentassets/61d813865e264c6e852cadfe247eae52/nsca_training_load_chart.pdf):

| Reps (RM) | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **% 1RM** | 100 | 95 | 93 | 90 | 87 | 85 | 83 | 80 | 77 | 75 | 70 |

Standard extrapolation below 70%: ~15 reps ≈ 65%. Upper-body lifts allow slightly fewer reps at a given %1RM than lower-body; treat this as a single-set-to-near-failure estimate.

### 3.3 Varying rep ranges within a week/block (DUP + top-set/back-off)

**Daily Undulating Periodization (DUP)** — vary load/reps each session. **Rhea et al. 2002** (volume/intensity equated; https://pubmed.ncbi.nlm.nih.gov/11991778/): DUP rotating 8RM/6RM/4RM within each week beat linear 8→6→4 over 12 wk (**bench +28.8% vs +14.4%; leg press +55.8% vs +25.7%**). *Honest caveat:* Harries 2015 and Grgic's periodization meta found **no significant LP-vs-undulating difference** when better-controlled, so Rhea's effect is likely inflated — treat undulating as **at least as good** as linear while letting you hit multiple rep ranges (Stronger by Science, https://www.strongerbyscience.com/daily-undulating-periodization/).

**Top-set + back-off structure:** one heavy top set (strength stimulus, high %1RM/low reps) + lighter higher-rep back-off sets (hypertrophy + volume) lets a single session cover strength + hypertrophy + connective-tissue loading while capping intensity exposure — the practical single-session analogue of DUP (Helms *Muscle & Strength Pyramid*; https://sisyphusstrength.com/blog/2021/3/30/the-muscle-and-strength-pyramids-a-review). Combining heavy + moderate + light across a week/block covers the full continuum. **This is the founder's "varying rep ranges" principle, and it is well grounded.**

### 3.4 Prilepin's chart (strength/power)

From A.S. Prilepin's analysis of ~1,000+ elite Olympic weightlifters (70's Big, https://70sbig.com/blog/2012/05/prilepins-chart/; PowerliftingTechnique, https://powerliftingtechnique.com/prilepins-chart/):

| %1RM | Reps/set | Optimal total reps | Total-rep range |
|---|---|---|---|
| **<70%** | 3–6 | 24 | 18–30 |
| **70–80%** | 3–6 | 18 | 12–24 |
| **80–90%** | 2–4 | 15 | 10–20 |
| **≥90%** | 1–2 | 7 | 4–10 |

Popularized for powerlifting via Westside/Louie Simmons. It is a **ceiling guide for strength/power volume** (built on explosive lifts), best applied to fast heavy compound work; exceeding the top of the range yields more fatigue than adaptation.

---

## 4. Frequency

### 4.1 ≥2×/week per muscle beats 1× (meta-analytic)

- **Schoenfeld, Ogborn & Krieger 2016** (frequency meta; https://pubmed.ncbi.nlm.nih.gov/27102172/): 2×/week > 1×/week for hypertrophy.
- **Nuckols/SBS volume-equated re-analysis** (13 studies, 305 subjects; https://www.strongerbyscience.com/frequency-muscle/): higher frequency → significantly more hypertrophy but the **overall effect is trivial-to-small (d≈0.11)**; low-freq 0.42%/wk vs high-freq 0.58%/wk. Advantage larger for **untrained (d=0.62) than trained (d=0.38)** and larger at **low volume (d=0.82) than high volume (d=0.34)**.
- **Schoenfeld, Grgic & Krieger 2019** (larger meta; https://pubmed.ncbi.nlm.nih.gov/30558493/): **when volume is equated, frequency does not significantly affect hypertrophy** — pick by logistics.
- **Strength — Grgic et al. 2018** (https://link.springer.com/article/10.1007/s40279-018-0872-x): ES rose with sessions (0.74/0.82/0.93/1.08 for 1/2/3/≥4×) BUT **no significant effect on the volume-equated subgroup (p=0.421)** → frequency's strength benefit is mostly a vehicle for more volume.

**Engine rule:** **2×/week per muscle is the evidence-based default**; **3×+ is primarily a distribution tool for high weekly volume**. Higher frequency helps most for beginners, lagging muscles, and when weekly volume would exceed the per-session ceiling.

### 4.2 Productive sets per muscle per session (junk-volume ceiling)

- RP: roughly **2–4 hard sets/muscle/session** before per-session diminishing returns; total per-session ~15–25 sets workable, **>30 total = "junk volume"** (RP Strength, https://rpstrength.com/blogs/podcasts/training-frequency-decoded-the-11-set-rule-every-lifter-should-know).
- Practitioner/lit consensus: **~4–8 hard sets/muscle/session productive; beyond ~10 shows steep diminishing returns** (per-session MPS response plateaus after a handful of sets; https://www.strongerbyscience.com/frequency-muscle/; Baz-Valle inverted-U, https://pubmed.ncbi.nlm.nih.gov/30063555/).

**Engine rule of thumb:** cap **~4–8 working sets/muscle/session (hard cap ~10)**; if the weekly target exceeds that, **add a session (raise frequency)** rather than piling sets into one workout.

### 4.3 Distributing weekly volume across sessions

Weekly sets ÷ frequency = per-session sets; keep within ~4–8 (max ~10):

| Weekly sets/muscle | 2×/wk | 3×/wk | 4×/wk |
|---|---|---|---|
| 10 | 5 | ~3–4 | ~2–3 |
| 16 | 8 | ~5 | 4 |
| 20 | 10 (at ceiling) | ~6–7 | 5 |

Weekly volume is the primary hypertrophy driver; frequency is the delivery mechanism that keeps each session under the per-session ceiling. At ≤10 sets/muscle 2×/wk is plenty; at 16–20+ split into 3+ sessions.

---

## 5. Periodization model selection by experience + goal

### 5.1 Novice → Linear Progression

Works because the newbie-gains curve is steep — a beginner recovers and adds load **every session**. Starting Strength / StrongLifts 5×5: add a small fixed load each workout after hitting all reps — **squat +10 lb early then +5 lb; press/bench +5 lb → +2.5 lb microloading**; StrongLifts default **+2.5–5 lb/session** (Starting Strength, https://startingstrength.com/get-started/programs; Legion, https://legionathletics.com/stronglifts-5x5/). Stalls at ~3–6 months / heavier loads; reset (repeat weight; ~10% deload and re-climb) once or twice, then graduate to weekly/undulating (Texas Method, 5/3/1) (https://forgegymapp.com/articles/programmes/stronglifts-5x5.html).

### 5.2 Intermediate → Weekly progression or DUP

Per-session progression is exhausted; the stress→recovery→adaptation cycle now spans a **week**. Options: **Texas Method** (Mon volume 5×5 ~90% of 5RM / Wed light / Fri intensity new top set, +5 lb lower / +2.5 upper per week; Rippetoe, https://startingstrength.com/article/the_texas_method) or **DUP / weekly-undulating** (rotate rep ranges within the week). Trigger: linear per-session stall.

### 5.3 Advanced → Block Periodization

**Issurin block model** (concentrate on a minimal set of abilities per block; block = 2–4 wk, stage = 6–10 wk; https://academy.sportlyzer.com/wiki/block-periodization/):

| Block | Length | Volume | Intensity | Focus |
|---|---|---|---|---|
| **Accumulation** | 2–6 wk (often 3–4) | **high** | lower (~65–75%, higher reps) | work capacity, hypertrophy, general strength |
| **Transmutation / Intensification** | 2–4 wk (often 3) | moderate → lower | higher (~80–90%+, lower reps) | convert base to specific max strength |
| **Realization / Peak** | 1–2 wk taper (block ~2–4 wk) | lowest | maintained→reduced | dissipate fatigue, express peak strength |

Powerlifting/hypertrophy application (Helms, https://sisyphusstrength.com/...; EliteFTS, https://elitefts.com/blogs/powerlifting/block-periodization-in-the-sport-of-powerlifting): Hypertrophy block → Strength block → Peaking block (4–5 wk, reps ≤3 on main lifts, highest intensity, ending in a 1–2 wk taper). Volume descends, intensity ascends across the macrocycle. Also foundational: Bompa & Buzzichelli, *Periodization: Theory and Methodology of Training*.

### 5.4 Selection logic table (experience × goal → model)

| | **Hypertrophy** | **Strength / Powerlifting** | **General fitness** |
|---|---|---|---|
| **Novice** | linear volume/load progression; +load or +set weekly; 2×/wk/muscle | **linear** (SS / 5×5), add load each session | **linear**, full-body 2–3×/wk, 8–12 @ 60–70% |
| **Intermediate** | **volume-progression / weekly- or daily-undulating** (MEV→MRV, deload) | **DUP or weekly progression** (Texas, 5/3/1) | **simple undulating** (heavy/light days) |
| **Advanced** | **undulating + volume periodization** (set-progression to MRV, deload; can stay undulating indefinitely) | **block** (accumulation→intensification→realization/peak) | linear or undulating, autoregulated (RPE) |

**Governing logic (encoded in v2):** (1) hypertrophy can stay undulating/volume-progression at ALL levels — driver is progressive *volume* toward MRV with deloads; block is optional. (2) strength/powerlifting escalates with training age: linear → DUP/weekly → block, lengthening the progression cycle (session → week → block). (3) general fitness stays simple. (4) the trigger to advance a model is always a **stall** at the current cadence. ACSM supports experience-scaled loading: 60–70%/8–12 novice → 70–85% intermediate → 70–100% periodized advanced (https://www.ideafit.com/progression-models-in-resistance-training-for-healthy-adults/).

---

## 6. Powerlifting peaking / taper (parameterized by weeks-to-meet)

### 6.1 Block sequence and prep length

Phase potentiation: hypertrophy/accumulation → strength → peaking/realization → taper → meet (JTS, https://www.jtsstrength.com/peaking-powerlifting/). Typical: hypertrophy ~4–8 wk (~65–75%, sets 6–12) → strength ~4–8 wk (~80–90%, sets 3–6) → peak ~2–4 wk → taper (final 1–3 wk). Full prep commonly ~12–16 wk; short periodized 6–10-wk programs improve PL performance ~2–11% (Travis et al. 2020 review, https://www.mdpi.com/2075-4663/8/9/125).

### 6.2 Intensity ramp + week-by-week peak

Cut volume first (drives fatigue), keep intensity high, cut intensity last; shift to **sets of 1–3** on comp lifts ("strength is displayed at 1 rep") (JTS/Israetel). Converging final ~3-week shape:
- **Wk −3:** top single/double ~**87–92% 1RM** (RPE 8–9), volume already cut sharply.
- **Wk −2:** top single ~**92–97%** (RPE 8.5–9.5) — often heaviest single of the prep; very few sets.
- **Wk −1 / taper:** opener-simulation single ~**88–92%** early week, then light technical only; last real session ~5–7 days out.
- **Meet week:** short cessation (2–7 days).

Barbell Medicine's free 3-week peak has **novice** (mostly 3×5) vs **advanced fast/slow** variants — novices peak on higher reps, advanced shift to singles/doubles earlier (https://www.barbellmedicine.com/peaking-template-3/). Israetel endorses a **planned overreach ~1 week before the volume drop** to trigger supercompensation (JTS).

### 6.3 Taper magnitude + evidence

**Travis et al. 2020** (*Tapering and Peaking Maximal Strength for Powerlifting*, Sports 8(9):125; https://www.mdpi.com/2075-4663/8/9/125) — most directly relevant. Recommendation: **reduce volume ~30–70%, maintain intensity ≥85% or reduce slightly, exponential/step taper over 1–2 weeks, then 2–7-day cessation.** Key findings: optimal duration ~2 weeks; **smaller-to-moderate cuts (~30–50%) beat larger (>50–70%)**; **avoid ≤25% (too small) and ≥70% (too large — one national lifter −2% and lost VL CSA at >70%/3wk)**; maintained-intensity studies +1–6%, decreased-intensity +2–10% → volume matters more than intensity. PL-only outcomes: **squat +2.3–5.9%, bench +1.8–6.4%, deadlift +3.8–4.8%, total +3.2–4.4%.** Detrain rates: strength maintained ~30±5 days; cessation >7 days erodes 1–4%; by 28 days squat −6%/bench −9% → hence the 2–7-day window.

**Bosquet et al. 2007** (tapering meta, 27 studies; https://pubmed.ncbi.nlm.nih.gov/17762369/): most effective = ~2-week progressive (exponential) taper, **volume −41–60%, intensity + frequency held**, small-but-meaningful gain (~0.5–6%, pooled ~2–3%). **Pritchard et al. 2015** (strength athletes; https://www.strongerbyscience.com/tapering/): volume −58.9±8.4%, taper 2.4±0.9 wk, last session 3.7±1.6 days out.

**Rationale:** "fatigue masks fitness" — the taper dissipates fatigue while a residual training effect preserves fitness so preparedness peaks.

### 6.4 Attempt selection (opener / 2nd / 3rd)

Practitioner + competition-data consensus (LiftPremier incl. IPF Worlds 2012–2019 data, https://www.liftpremier.com/post/powerlifting-attempt-selection; PowerliftingTechnique, https://powerliftingtechnique.com/how-to-pick-attempts-for-powerlifting/):
- **Opener ≈ 88–93% of gym max** (a "bad-day" weight, ~comfortable 3RM effort / easy double) ≈ **91% of the goal 3rd attempt**.
- **2nd ≈ 93–98% of gym max** (near-PR) ≈ **96% of goal 3rd**.
- **3rd = 100–104%+ of gym max** (PR attempt).

IPF Worlds lifters who made their 3rd had, on average, **opened at 91% and taken 96% on the 2nd** of that 3rd attempt.

### 6.5 Parameterize by weeks-to-meet (engine logic)

Lay phases out **backward from the meet date**, scaling by weeks + level (JTS + Travis 2020):
- **≥12 wk:** accumulation (~4–6) → strength (~4–6) → peak (~2–3) → taper (last 3–7 days folded in).
- **~8–11 wk:** strength emphasis (~5–7) → peak (~2–3).
- **~6–7 wk:** strength (~4) + peak (~2–3).
- **~4–5 wk:** short strength touch + peak (~2–3).
- **<4 wk:** peak/taper only (~2 wk) + 2–7-day cessation.

Taper length scales with size/strength/experience: elite/heavy ~4 wk (deadlift volume drops earliest, ~4 wk out; intensity cuts trail volume ~1 wk), intermediate ~3 wk, novice/light ~2 wk (often just a deload — over-tapering a novice makes them weaker). Cut order: assistance first, then deadlift, then squat, then bench (bench can be cut as late as the final week).

---

## 7. Team-sport S&C (soccer, basketball, and similar)

### 7.1 Season phasing (volume / intensity / frequency)

Goal: **maintain high injury-free fitness across a long season**, not a single peak (NSCA *Periodization and Programming for Team Sports*, https://www.nsca.com/contentassets/f9d5e4180ffe4cecb9c8ae2a6c2ac6eb/periodization-and-programming-for-team-sports_supplement.pdf; NSCA *Periodization in College Soccer*, https://journals.lww.com/nsca-scj/fulltext/2018/06000/periodization_in_college_soccer.5.aspx):
- **Off-season (preparatory):** highest volume; hypertrophy + max-strength base + aerobic base; strength **2–4 sessions/wk** toward ~80–90% 1RM.
- **Pre-season:** convert base to **power/speed**; ramp sport conditioning; on-field tactical work intensifies.
- **In-season (competitive):** **MAINTENANCE** — strength held with **lower volume, higher relative intensity, ~1–2 sessions/wk (~2–5 sets × 3–6 reps)**; keep leg volume low for 1–3 matches/wk.
- **Transition/off:** active rest, restore, address injuries.

### 7.2 In-season strength maintenance

**Rønnestad, Nymark & Raastad 2011** (JSCR 25(10):2653–60; https://journals.lww.com/nsca-jscr/Fulltext/2011/10000/Effects_of_In_Season_Strength_Maintenance_Training.3.aspx): after a 10-wk pre-season (2×/wk), **1 session/week maintained 1RM strength AND 40 m sprint through 12 weeks in-season**, whereas **every-2-weeks lost strength (−10%) and sprint (−1.1%)**. Rec: **1 strength maintenance session/week, 1–2 days after a match and 2–3 days before the next**, load ~3×4RM. Caveats: longer seasons / stronger athletes may need higher frequency; 2×/wk can be too much when match load is heavy. Soccer/endurance alone does NOT maintain max strength (6–7 wk without lifting cut strength/power). **Bickel 2011** corroborates the "keep intensity, slash volume" logic (maintenance on 1/3–1/9 of original volume; https://pubmed.ncbi.nlm.nih.gov/21131862/).

### 7.3 Plyometrics + sprint / COD

Foot-contact volume by level (NSCA CSCS Ch. 18; https://www.ptpioneer.com/personal-training/certifications/nsca-cscs/cscs-chapter-18/):
- **Beginner 80–100 · Intermediate 100–120 · Advanced 120–140** contacts/session (advanced protocols up to ~120–198; ~50 low, ~200+ high). Intensity ↑ ⇒ contacts ↓.
- **Frequency 1–3/wk, 48–72 h between intense plyo sessions.** Progress extensive → intensive (jumps-in-place/low hops → depth jumps/bounds).

Sprint/COD: low-volume, high-quality, full recovery (a few reps of 10–40 m, ~2–4 min rest, done fresh/early); progress pre-planned → reactive agility. In-season 6-wk sprint+jump programs improved strength-speed and kicking in youth soccer (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3916921/).

**Injury reduction — FIFA 11+:** ~20-min neuromuscular warm-up ≥2×/wk reduces injuries **~30–50%** (Soligard et al. RCT ~32%; Silvers-Granelli −46.1%; https://pmc.ncbi.nlm.nih.gov/articles/PMC5704377/).

### 7.4 Concurrent-training interference & mitigation

- **Hickson 1980** (https://link.springer.com/article/10.1007/BF00421333): concurrent S+E matched endurance-only for VO2max but **strength plateaued at wk 7–8 then declined** vs strength-only — the original "interference effect."
- **Wilson et al. 2012** (concurrent-training meta, 21 studies, 422 ES; https://pubmed.ncbi.nlm.nih.gov/22002517/): interference scales with endurance **modality, frequency, duration**. ES — hypertrophy: strength 1.23 / concurrent 0.85 / endurance 0.27; power: 0.91 / 0.55 / 0.11. **Running (not cycling)** impaired hypertrophy/strength (eccentric damage). Endurance frequency (r −0.26 to −0.35) and duration (r −0.29 to −0.75) negatively correlate with strength/power/hypertrophy — **more/longer endurance = more interference.**

**Mitigation (AMPK vs mTOR; Baar/GSSI, https://www.gssiweb.org/sports-science-exchange/article/sse-136-using-nutrition-and-molecular-biology-to-maximize-concurrent-training):** separate strength and hard endurance by **≥3 h, ideally ≥6 h, or different days** (AMPK subsides in ~3 h; mTOR stays elevated ~18 h post-lift); **do strength before endurance** when same-session; cap endurance frequency/volume; prioritize the goal modality; keep in-season leg volume low; prefer cycling/rowing over running when protecting strength.

### 7.5 In-season microcycle around game day (MD±)

Pro-soccer load-based microcycle (Akenhead/Owen; Barça Innovation Hub, https://barcainnovationhub.fcbarcelona.com/blog/microcycles-in-football-weekly-structure-from-md-5-to-md1/; PMC https://pmc.ncbi.nlm.nih.gov/articles/PMC5424454/):
- **Load peaks 72 h out (MD-4/MD-3)** then progressively unloads to the match; MD-1 is light/CNS-priming.
- Typical: **MD+1** recovery (starters) / higher load (non-starters); **MD+2** rest/regeneration; **MD-4** highest load; **MD-3** high load + tactical (**the strength-session day** — CNS load far from match); **MD-2** moderate; **MD-1** light/activation.
- Maps to Rønnestad's timing (lift **1–2 days post-match, 2–3 days pre-match** ⇒ around MD+2/MD-3). Basketball/court sports (2–4 games/wk) use the same match-anchored logic with even lower lifting volume ("highest-load day = day furthest from next game").

---

## 8. Deloads / fatigue management

### 8.1 What & why

A deload is a **planned reduction in training stress** to (a) dissipate fatigue, (b) allow supercompensation / re-sensitize anabolic signaling, (c) reduce injury/overtraining (NFOR) risk. Peer-reviewed survey (**Rogerson et al. 2024**, *Deloading Practices in Strength and Physique Sports*, Sports Med Open 10:26, n=246; https://link.springer.com/article/10.1186/s40798-024-00691-y): **92.3%** deload "to decrease fatigue"; **87.8%** judged fatigue successfully reduced afterward. NSCA: NFOR causes underperformance lasting up to 3 weeks — deloading keeps a lifter on the functional side of that line (https://www.nsca.com/education/articles/kinetic-select/functional-and-nonfunctional-overreaching-and-overtraining/).

### 8.2 How often

- **Empirical central tendency (peer-reviewed):** athletes deload **every 5.6 ± 2.3 weeks** (range 1–12), duration **6.4 ± 1.7 days** (Rogerson 2024).
- **Practitioner ratios:** 3:1 / 4:1 / 5:1 up:down microcycles all common; Israetel: **"4–6 weeks is the sweet spot"** (https://fitnessvolt.com/exercise-scientist-de-load-overtraining/). 3:1 default for intermediates; 2:1 for advanced/older/high-intensity; 5:1–6:1 for great recoverers/novices (LiftStrong, https://www.liftstrong.com/articles/how-to-deload-strategic-recovery-weeks).
- **Scales with training age & intensity:** novices train far from MRV → rarely need scheduled deloads early (can run 8–12 wk of accumulation, or as-needed); intermediates ~5–6 wk; advanced/heavier/older ~3–4 wk.
- **Proactive vs reactive (peer-reviewed split):** 47.2% proactive, 13.4% purely reactive, **39.4% combination** (Rogerson 2024). Reactive rule (Henselmans, https://mennohenselmans.com/autoregulation-reactive-deloading-avt/): pre-plan the *rule* — trigger a deload if progress is <~50% of expected, on the muscles that need it.

**Engine recommendation:** default to **proactive scheduling by experience** with a **reactive override** (auto-insert early if performance drops ≥~1 rep at target load across sessions, RIR collapses, or logged joint pain) — mirroring the 39% "combination" majority.

### 8.3 How

Two levers (Rogerson 2024; RP):
- **Lever 1 — cut VOLUME (primary):** **78.9%** reduce weekly sets; RP drops to **MV ≈ 6 sets/muscle** (from ~16–20 end-of-accumulation); ~**50%** set reduction is typical.
- **Lever 2 — slightly reduce INTENSITY/effort:** intensity decreased on **83.7%** of multi-joint / **60.2%** single-joint exercises; effort/failure-proximity reduced on **84.9%** (multi-joint) via increased RIR; magnitude ~**10%** lighter (or 60–70% of working weight). Keep some load to retain neural fitness (Israetel: a volume-only deload "misses very little productivity" because heavy work preserves adaptation).

**Engine default 1-week deload:** same exercises, same/slightly-reduced frequency, **~50% of sets** (or MV ≈ 6/muscle), **~10% lighter** (or 60–70% of working weight), **+2–3 RIR vs accumulation**, full ROM, **~1 week (5–7 days).** Bosquet 2007's ~41–60% volume cut / hold-intensity taper is the peak-performance analogue validating "volume is the lever."

### 8.4 Mesocycle shape

MV ≈ 6 → MEV (growth start) → MAV (progression zone) → MRV (ceiling). Start near MEV wk1, add **1–2 sets/muscle/week** through MAV over **~3–5 weeks (up to 8)** toward MRV, then **1-week deload at ~MV**, then reset at MEV (often new variations). RIR drops ~3–4 → 0–1 across accumulation, so volume *and* effort peak just before the deload.

---

## 9. Injury / contraindication-aware substitution

**General principles (all regions):** (1) **train the pain-free ROM** (restrict the provocative angle, expand as it settles); (2) **reduce load / increase reps** — manage loading, don't fully offload; (3) **prefer machine / supported / neutral-grip variants**; (4) **avoid the specific provocative position** while training the same muscles; (5) for tendons, pain ≤3–4/10 that settles within 2–4 h is acceptable loading (Barbell Medicine, *Guide to Tendinopathy*, https://www.barbellmedicine.com/blog/tendinopathy-guide/).

**Mapping table — limitation → patterns to limit/avoid → safer swaps (same muscles):**

| Region / condition | Patterns to LIMIT / AVOID | Why | Safer substitutions |
|---|---|---|---|
| **Knee (PFP / meniscus)** | deep loaded knee flexion (squats >90° early), end-range loaded leg extension, high-impact plyometrics, deep lunges | PFJ reaction force / shear rises with flexion depth & open-chain end-range load | box squat / leg press in pain-free 0–30° → 0–60° ROM, terminal-knee-extension (TKE), sled push, step-ups, spanish squat (ExaktHealth https://www.exakthealth.com/en/blog/patellofemoral-pain-syndrome-exercises; Reinold https://mikereinold.com/biomechanics-of-patellofemoral/) |
| **Low back (disc / erector)** | heavy axial loading (conventional deadlift, back squat, good morning), loaded spinal flexion (rounded-back rows/DLs, loaded sit-ups), heavy hyperextension | compression + shear + flexion load on lumbar spine/disc | **trap-bar deadlift** (upright torso, less lumbar shear; Healthline https://www.healthline.com/health/fitness-exercise/deadlift-alternative), **hip thrust / glute bridge** (neutral spine), **chest-supported row**, cable pull-through, front/rear-foot-elevated split squat, belt squat, machine leg press |
| **Shoulder (impingement / cuff)** | heavy overhead press, wide-grip bench, upright row, dips, behind-neck | overhead + internal-rotation narrows subacromial space | **neutral-grip / landmine press**, floor press, DB neutral press, cable work, ring/supported rows; add cuff/scapular work — face pulls, band pull-aparts, external rotations (TrainingByRobyn https://trainingbyrobyn.com/...) |
| **Shoulder (AC joint)** | wide-grip bench, dips, full bottom-range bench, heavy flyes | distraction + compression + shear across the AC joint (worst at wide-bench bottom & dips) | **close-grip bench**, floor / Spoto press (partial ROM, no bottom-range distraction), incline close-grip (TheGamePlanPT https://www.thegameplanpt.com/blog/shoulder-pain-with-bench-pressing-ac-joint-pain) |
| **Hip (FAI / labral)** | deep squats (below parallel, sumo/wide), forward lunges, deep hip flexion + IR | deep flexion pinches the anterior labrum | box/bench-limited squat to ~parallel, goblet/front squat (anterior load opens hip space), step-ups, hip thrust, abductor/stabilizer work (Squat University https://squatuniversity.com/2017/10/21/fixing-hip-impingement/) |
| **Elbow (tennis/golfer's) / wrist** | heavy straight-bar direct arm work, provocative forearm position, heavy gripping, loaded end-range wrist extension | loads the aggravated common extensor/flexor origin / extended wrist | neutral-grip / DB curls, EZ-bar or rope work, cable/rope pressdowns, hammer curls, **neutral wrist**; DB/handle push-ups, strap ("California") front-rack; heavy slow-resistance once pain ≤2–3/10 (E3Rehab https://e3rehab.com/golfers-elbow-rehab/; Barbell Medicine https://www.barbellmedicine.com/blog/lateral-elbow-pain-for-lifters/) |

Tendon rehab entry point: ~**2–4 sets × 8–10 @ RPE 8, 3-0-3 tempo**, ROM modified to avoid the provocative position (Barbell Medicine, https://www.barbellmedicine.com/blog/tendinopathy-guide/). **Guardrail:** train pain-free; stop on sharp pain; the app is not a medical device — defer acute/severe/neuro symptoms to a clinician.

---

## 10. User-configurable knobs → engine parameters, with SAFE bounds

Three survey knobs; each maps to concrete engine parameters with experience-gated safe bounds grounded in §2 / §8.

### 10.1 Failure proximity (RIR floor)

Controls the **minimum allowed RIR** on working sets. Anchors: hypertrophy occurs across ~0–4 RIR (sweet spot ~1–3); most evidence-based programs prescribe 1–4 RIR not uniform 0; novices under-estimate RIR; compounds ≥1 RIR, 0 RIR reserved for isolation (MASS/Helms via https://massresearchreview.com/2023/05/22/rpe-and-rir-the-complete-guide/; Stronger by Science https://www.strongerbyscience.com/reps-in-reserve/).

Safe floors (lowest RIR the engine will ever prescribe):

| Experience | Compound floor | Isolation floor |
|---|---|---|
| Novice | **≥2** | **≥2** |
| Intermediate | **≥1** | 1 (occasional 0 on machines) |
| Advanced | **≥1** on heavy compounds | **0** allowed on isolation only |

Three-setting slider → target RIR range (still clamped by the floor above):
- **Cautious:** target 3–4 RIR (floor 2).
- **Balanced (default):** target 1–3 RIR (floor 1 compound / 1 isolation).
- **Aggressive:** target 0–2 RIR (floor 1 compound / 0 isolation) — *only unlocked at intermediate+*; a novice on "aggressive" is still clamped to floor 2.

RIR also auto-decreases across a mesocycle (≈3→2→1→0 buffer wk1→peak) independent of this knob, then resets up at the deload.

### 10.2 Progression speed

Controls (a) **load increment** per successful session/week and (b) **volume ramp rate** (sets/muscle/week), plus reactive-deload coupling.

- Load increments (double/linear): lower body ~**+2.5 kg**/successful session, upper ~**+1.25–2.5 kg**; big compounds ~+5 kg early. Percent guide: conservative ~1–2%/wk, aggressive up to ~5%/wk but **capped** (increments must shrink as the lifter advances) (Legion https://legionathletics.com/double-progression/; RippedBody https://rippedbody.com/progression/).
- Volume ramp: **+1–2 sets/muscle/week** best-supported.

| Setting | Load increment | Volume ramp | Deload coupling |
|---|---|---|---|
| **Conservative** | upper +1.25–2.5 kg, lower +2.5 kg, only at top-of-range at target RIR | +0–1 set/muscle/wk | more frequent deloads |
| **Balanced (default)** | upper +2.5 kg, lower +2.5–5 kg (double progression) | +1 set/muscle/wk | scheduled by experience |
| **Aggressive** | upper +2.5–5 kg, lower +5(–10) kg on big compounds, **capped ≤~5%/session** | +1–2 sets/muscle/wk | **reactive deload required** (auto-trigger on stall) |

Hard bounds regardless of setting: never add max load *and* max volume the same week; cap weekly load jump ~5%; cap the ramp so end-of-meso volume ≤ estimated MRV; on a missed target (≥1 rep short at the prescribed RIR) **hold or reduce**, don't progress.

### 10.3 Deload frequency

Controls the accumulation-block length before an inserted 1-week deload — **bounded, never "never."** Allowed range **every 3 to every 8 weeks** (matches the 5.6±2.3-wk empirical mean and the 4–6-wk sweet spot; Rogerson 2024; Israetel).

| Setting | Cadence | Default lands here for… |
|---|---|---|
| **Infrequent** | every 6–8 wk (+ reactive override) | novices |
| **Standard (default)** | every 5–6 wk | intermediates |
| **Frequent** | every 3–4 wk | advanced / older / high-stress |

Always-on reactive override regardless of the knob: insert a deload early on performance drop (can't match prior week / ≥1 rep short across sessions), RIR collapse, persistent joint pain, or tanked sleep/motivation. Deload duration stays ~1 week across all settings.

**Cross-knob coupling to enforce:** the three knobs are not independent — **aggressive RIR floor + aggressive progression must force a more frequent (or reactive) deload**, because faster fatigue accrual near failure at higher volume shortens time-to-MRV. Cautious + conservative can safely run the 6–8-wk cadence.

---

## Key numbers to hard-code (quick reference)

- **Volume sweet spot:** 10–20 hard sets/muscle/wk; ≥10 > <10 (robust); ~20 = diminishing returns. **MEV ≈ 8–10, MRV ≈ 18–22** (muscle-specific table §1.2); **MV ≈ 6**. Small muscles (bi/tri/rear delt/abs) halved.
- **Per-set dose:** ≈ +0.37% hypertrophy/weekly set (Schoenfeld 2017).
- **Experience start (sets/muscle/wk):** beginner 8–12 · novice 10–13 · intermediate 12–16 · advanced 16–22, then +1–2/wk to MRV.
- **Maintenance:** ~1/3 of growth volume, floor ~2–6 sets/muscle/wk, intensity held (Bickel 2011).
- **Meso ramp:** MEV → +1–2 sets/wk → MRV → deload to MV; RIR 3–4 → 0–1 across the block.
- **RPE = 10 − RIR.** Hypertrophy 0–3 RIR (mostly 1–2); strength 1–3 RIR; novices +1–2 RIR further out (floor 2 on compounds). Apply +1-rep calibration to novice self-reports.
- **Frequency:** 2×/wk/muscle default; per-session cap ~4–8 (max ~10) sets/muscle → add a session past that.
- **Loading zones:** strength 1–5 @ ≥85%; hypertrophy 6–12 @ 65–80% (effective 5–30 near failure); endurance 15–30 @ <65%. NSCA %1RM↔reps table §3.2. Prilepin §3.4.
- **Periodization:** novice linear → intermediate DUP/weekly → advanced block. Hypertrophy can stay undulating at all levels.
- **PL taper:** volume −30–50% (avoid <25% / >70%), hold intensity ≥85% then drop last few days, ~2 wk, 2–7-day cessation; openers 88–93% gym max (91% of goal 3rd), 2nd 93–98% (96%), 3rd 100–104%+.
- **In-season team sport:** 1 strength session/wk maintains strength & sprint (Rønnestad 2011); plyo 80–140 contacts by level, 48–72 h apart; separate hard conditioning from lifting ≥3–6 h; keep leg volume low; MD-3/MD+2 lift placement.
- **Deload:** every 5.6±2.3 wk (novice 6–8 / intermediate 5–6 / advanced 3–4), ~1 wk, ~50% sets + ~10% lighter + +2–3 RIR.

---

## Sources

**Volume landmarks / RP:**
- RP Strength, Training Volume Landmarks for Muscle Growth — https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth
- Dr. Mike Israetel MV/MEV/MAV/MRV Explained — https://drmikeisraetel.com/dr-mike-israetel-mv-mev-mav-mrv-explained/
- LiftVault / Israetel 5-week hypertrophy — https://liftvault.com/programs/bodybuilding/mike-israetel-5-week-hypertrophy-workout-routine-spreadsheet/
- Tailored Coaching Method, Training Volume: How Many Sets Per Week — https://tailoredcoachingmethod.com/training-volume-how-many-sets-per-week/
- Hevy, How Many Sets Per Muscle Group — https://www.hevyapp.com/how-many-sets/
- MesoStrength, MV/MEV/MAV/MRV — https://mesostrength.com/blog/mv-mev-mav-mrv-explained ; 4-week mesocycle — https://mesostrength.com/blog/how-to-structure-a-4-week-mesocycle-for-hypertrophy
- Arvo, RP Training / Volume Landmarks — https://arvo.guru/resources/methods/rp-training
- RP, In Defense of Set Increases — https://rpstrength.com/blogs/articles/in-defense-of-set-increases-within-the-hypertrophy-mesocycle
- RP, Training Frequency / 11-set rule — https://rpstrength.com/blogs/podcasts/training-frequency-decoded-the-11-set-rule-every-lifter-should-know

**Dose-response / volume / frequency meta-analyses:**
- Schoenfeld, Ogborn & Krieger 2017 (weekly volume dose-response) — https://pubmed.ncbi.nlm.nih.gov/27433992/
- Baz-Valle et al. 2022 (RT volume systematic review) — https://bazmanscience.com/wp-content/uploads/2024/02/Baz-Valleetal.-2022-ASystematicReviewoftheEffectsofDifferentResistanceTrainingVolumesonMuscleHypertrophy.pdf
- Baz-Valle 2018 (total sets as volume quantification) — https://pubmed.ncbi.nlm.nih.gov/30063555/
- Schoenfeld 2019 (RT volume enhances hypertrophy, trained men) — https://pmc.ncbi.nlm.nih.gov/articles/PMC6303131/
- Pelland/Robinson/Steele/Zourdos 2025 (RT dose response) — https://pubmed.ncbi.nlm.nih.gov/41343037/
- Schoenfeld/Ogborn/Krieger 2016 (frequency meta) — https://pubmed.ncbi.nlm.nih.gov/27102172/
- Schoenfeld/Grgic/Krieger 2019 (frequency meta) — https://pubmed.ncbi.nlm.nih.gov/30558493/
- Grgic et al. 2018 (frequency-strength meta) — https://link.springer.com/article/10.1007/s40279-018-0872-x
- Stronger by Science, Frequency for Muscle Growth — https://www.strongerbyscience.com/frequency-muscle/

**Maintenance:**
- Bickel, Cross & Bamman 2011 — https://pubmed.ncbi.nlm.nih.gov/21131862/

**Proximity to failure / RIR:**
- Zourdos et al. 2016 (RIR-based RPE scale) — https://pubmed.ncbi.nlm.nih.gov/26049792/
- Helms/Morgan/Valdez, RPE/RIR guide — https://rippedbody.com/rpe/
- RPETraining, RPE & RIR Complete Guide — https://rpetraining.com/blog/rpe-and-rir-complete-guide
- MASS Research Review, RPE and RIR complete guide — https://massresearchreview.com/2023/05/22/rpe-and-rir-the-complete-guide/
- Robinson/Refalo et al. 2024 (proximity-to-failure meta-regressions) — https://link.springer.com/article/10.1007/s40279-024-02069-2
- Refalo et al. 2023 (proximity-to-failure & hypertrophy meta) — https://pmc.ncbi.nlm.nih.gov/articles/PMC9935748/
- Stronger by Science, Reps in Reserve — https://www.strongerbyscience.com/reps-in-reserve/
- Stronger by Science, Effective Reps — https://www.strongerbyscience.com/effective-reps/
- Halperin et al. 2022 (accuracy predicting reps to failure) — https://link.springer.com/article/10.1007/s40279-021-01559-x
- Remmert et al. 2023 — https://pubmed.ncbi.nlm.nih.gov/37036795/
- Emanuel et al. 2022 (coaches predicting RIR) — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9588140/
- Helms et al. 2018 (RPE vs %1RM RCT) — https://pubmed.ncbi.nlm.nih.gov/29628895/

**Loading zones / rep ranges / periodization:**
- NSCA Training Load Chart (PDF) — https://www.nsca.com/contentassets/61d813865e264c6e852cadfe247eae52/nsca_training_load_chart.pdf
- NSCA, Using Intensity Based on Sets and Repetitions — https://www.nsca.com/education/articles/nsca-coach/using-intensity-based-on-sets-and-repetitions-over-50-years-of-experience-a-brief-overview-of-load-setting-and-programming-strategy/
- ACSM Position Stand, Progression Models in RT (summary) — https://www.ideafit.com/progression-models-in-resistance-training-for-healthy-adults/
- Schoenfeld/Grgic, low- vs high-load meta — https://journals.lww.com/nsca-jscr/fulltext/2017/12000/strength_and_hypertrophy_adaptations_between_low_.31.aspx
- Rhea et al. 2002 (LP vs DUP) — https://pubmed.ncbi.nlm.nih.gov/11991778/
- Stronger by Science, DUP — https://www.strongerbyscience.com/daily-undulating-periodization/
- Helms Muscle & Strength Pyramid review — https://sisyphusstrength.com/blog/2021/3/30/the-muscle-and-strength-pyramids-a-review
- Prilepin's chart — https://70sbig.com/blog/2012/05/prilepins-chart/ ; https://powerliftingtechnique.com/prilepins-chart/
- Starting Strength programs — https://startingstrength.com/get-started/programs
- Legion, StrongLifts 5×5 — https://legionathletics.com/stronglifts-5x5/
- Rippetoe, The Texas Method — https://startingstrength.com/article/the_texas_method
- Issurin / Block Periodization — https://academy.sportlyzer.com/wiki/block-periodization/
- EliteFTS, Block Periodization in Powerlifting — https://elitefts.com/blogs/powerlifting/block-periodization-in-the-sport-of-powerlifting

**Powerlifting peaking / taper:**
- Travis et al. 2020 (Tapering and Peaking Maximal Strength for Powerlifting) — https://www.mdpi.com/2075-4663/8/9/125
- Bosquet et al. 2007 (tapering meta) — https://pubmed.ncbi.nlm.nih.gov/17762369/
- Pritchard et al. 2015 / SBS overview — https://www.strongerbyscience.com/tapering/
- JTS/Israetel, Peaking for Powerlifting — https://www.jtsstrength.com/peaking-powerlifting/
- Barbell Medicine peaking template — https://www.barbellmedicine.com/peaking-template-3/
- Attempt selection (IPF Worlds data) — https://www.liftpremier.com/post/powerlifting-attempt-selection ; https://powerliftingtechnique.com/how-to-pick-attempts-for-powerlifting/

**Team-sport S&C:**
- Rønnestad, Nymark & Raastad 2011 (in-season strength maintenance, soccer) — https://journals.lww.com/nsca-jscr/Fulltext/2011/10000/Effects_of_In_Season_Strength_Maintenance_Training.3.aspx
- Wilson et al. 2012 (concurrent-training meta) — https://pubmed.ncbi.nlm.nih.gov/22002517/
- Hickson 1980 (interference effect) — https://link.springer.com/article/10.1007/BF00421333
- Baar/GSSI (concurrent-training molecular mitigation) — https://www.gssiweb.org/sports-science-exchange/article/sse-136-using-nutrition-and-molecular-biology-to-maximize-concurrent-training
- NSCA plyometric program design (CSCS Ch. 18) — https://www.ptpioneer.com/personal-training/certifications/nsca-cscs/cscs-chapter-18/
- FIFA 11+ systematic review — https://pmc.ncbi.nlm.nih.gov/articles/PMC5704377/
- Sprint+jump in-season youth soccer — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3916921/
- NSCA, Periodization and Programming for Team Sports — https://www.nsca.com/contentassets/f9d5e4180ffe4cecb9c8ae2a6c2ac6eb/periodization-and-programming-for-team-sports_supplement.pdf
- NSCA, Periodization in College Soccer — https://journals.lww.com/nsca-scj/fulltext/2018/06000/periodization_in_college_soccer.5.aspx
- Soccer microcycle / MD± (Barça Innovation Hub) — https://barcainnovationhub.fcbarcelona.com/blog/microcycles-in-football-weekly-structure-from-md-5-to-md1/ ; https://pmc.ncbi.nlm.nih.gov/articles/PMC5424454/

**Deloads:**
- Rogerson et al. 2024 (Deloading Practices survey) — https://link.springer.com/article/10.1186/s40798-024-00691-y
- NSCA, Functional and Nonfunctional Overreaching and Overtraining — https://www.nsca.com/education/articles/kinetic-select/functional-and-nonfunctional-overreaching-and-overtraining/
- Israetel deload how-to (FitnessVolt) — https://fitnessvolt.com/exercise-scientist-de-load-overtraining/
- Menno Henselmans, Autoregulation / reactive deloading — https://mennohenselmans.com/autoregulation-reactive-deloading-avt/
- LiftStrong, How to Deload — https://www.liftstrong.com/articles/how-to-deload-strategic-recovery-weeks

**Injury / rehab:**
- Barbell Medicine, Guide to Tendinopathy — https://www.barbellmedicine.com/blog/tendinopathy-guide/ ; Lateral Elbow Pain for Lifters — https://www.barbellmedicine.com/blog/lateral-elbow-pain-for-lifters/
- ExaktHealth, PFP exercises — https://www.exakthealth.com/en/blog/patellofemoral-pain-syndrome-exercises
- Mike Reinold, Biomechanics of Patellofemoral Rehab — https://mikereinold.com/biomechanics-of-patellofemoral/
- Healthline, Deadlift alternatives — https://www.healthline.com/health/fitness-exercise/deadlift-alternative
- The Game Plan PT, AC joint pain with bench — https://www.thegameplanpt.com/blog/shoulder-pain-with-bench-pressing-ac-joint-pain
- Squat University, Fixing Hip Impingement — https://squatuniversity.com/2017/10/21/fixing-hip-impingement/
- E3 Rehab, Golfer's Elbow Rehab — https://e3rehab.com/golfers-elbow-rehab/
- Training By Robyn, Lifting with a rotator cuff injury — https://trainingbyrobyn.com/blog/lifting-with-a-rotator-cuff-injury-what-you-need-to-knowbr

**Training-age curve (repo, reused):**
- `audits/full-review-2026-06-19/math-validation/TRAINING-AGE-RESEARCH.md` (double-exponential gain(t), pooled Steele 2022 / Latella 2024 / Rhea 2003) — internal
