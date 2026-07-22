# DATA-HUNT: Academic literature on predicting 1RM from anthropometrics + training-age

**Author:** math-validation research agent · **Date:** 2026-06-19
**Question driving this hunt:** Can a multi-factor 1RM model `f(sex, bodymass, height, age, training-years)` be meaningfully MORE accurate than a `f(sex, bodymass)` model — and specifically, does adding **height / limb length** buy us anything once bodyweight is in the model? Does **training-age** add real signal, and with what dose-response shape?

**TL;DR verdict (numbers up front):**
- **Height adds essentially nothing over bodyweight WITHIN a sex.** Best estimate of incremental ΔR² for height-over-bodyweight: **≈ 0.00–0.04** (often negative after adjustment). The large pooled "height predicts strength" correlations (r≈0.66–0.75) are an artifact of pooling men+women — they collapse to r ≈ −0.16 to +0.37 (mostly non-significant) inside a single sex. Limb LENGTHS are weak-to-zero predictors of absolute 1RM (arm length r≈0.04; thigh r≈0.23–0.34; forearm r≈0.27–0.45). What you actually want is body MASS / lean mass / a girth, not a length.
- **Training-age is a WEAK cross-sectional predictor with steep diminishing returns.** No paper isolates a clean ΔR² for "years lifting" against 1RM in a multivariate model; where measured, training-volume/experience terms drop OUT of stepwise models (Reynolds 2006) or carry near-zero bivariate r (0.12–0.23). The dose-response of strength vs years trained is logarithmic: ~+7–25% in year 1, asymptoting by ~3 years, with cumulative ~20–40% over a decade. Modeled as variance explained, "trained vs untrained / years" is real but small once you condition on current bodyweight & lean mass (which already absorb most of the training effect).
- **Most usable directly-plug-in equation:** Stanelle/Lambert 2021 (Sports Med Health Sci), N=147 mixed-sex, `R²=0.68–0.83`, gives per-exercise multiple-regression equations on height/weight/age/sex/lengths (and DEXA lean masses). It is the closest published thing to `f(sex, bodymass, height, age, …)`. Caveat: machine-based lifts (leg press, chest press), not free-bar squat/bench/DL, and the published abstract lists the predictor SET but the per-exercise coefficients sit behind the paywalled tables — see "Equations" section for what IS public + the fully-public Ferland 2020 and Reynolds 2006 coefficient sets.

---

## (a) STUDY TABLE — predictors, R²/r, N, population, equation availability

| # | Study (year, journal) | N / population | Predictors examined | Key R² / r | Equation published? |
|---|---|---|---|---|---|
| 1 | **Stanelle, Crouse, Heimdal, Riechman, Remy, Lambert 2021**, *Sports Med Health Sci* 3(1):34–39 | 147 healthy adults (74 M / 73 F), 35±12 yr, 174±10 cm, 88±19 kg; mixed training status | height, weight, BMI, age, sex, regional lean masses, fat mass, FFM, %BF, arm/leg/trunk length, shoulder width | **Multiple-reg R²=0.68–0.83** across 7 lifts (regional/DEXA models highest); all models p<0.05 | **YES** — per-exercise stepwise equations (machine lifts: leg press, chest press, leg curl, lat pulldown, leg ext, triceps pushdown, biceps curl). Coefficients in paywalled tables; predictor set + R² range public. |
| 2 | **Reynolds, Gordon, Robergs 2006**, *J Strength Cond Res* 20(3):584–592 | 70 adults (34 M / 36 F), 18–69 yr, varied training (16 untrained, 37 circuit, 17 split) + 20 cross-val | 5/10/20RM load, sex, age, height, weight, LBM, %BF, arm/chest/thigh girth, **training volume** | Bivariate to 1RM: **LBM r=0.71 (leg press), 0.77 (chest press)**; height r=0.47 (LP)/0.59 (CP); weight r=0.58/0.56; **training volume r=0.12–0.23**. Full model R² driven by 5RM (LP 0.974, CP 0.993). | **YES** (fully public PDF). BUT key negative result: stepwise DROPPED all anthropometry + sex + training volume — only 5RM survived. |
| 3 | **Ferland, Laurier, Comtois 2020**, *Int J Exerc Sci* 13(4):1512–1531 | **59 male classic powerlifters**, 26.2±4.8 yr, 174.2±6.8 cm, BW untabulated, LBW 71.1±9.7 kg | age, height, BW, BMI, BF%, LBW, hip/waist/torso C, arm/forearm/thigh/lower-leg/trunk L, reach, + ratios | **Absolute strength: BW r=0.78 (SQ)/0.70 (BP)/0.64 (DL); Torso C r=0.78/0.77/0.69; LBW r=0.67/0.62/0.66; HEIGHT r=0.34/0.27/0.37; arm L r=0.04/0.04/0.22; thigh L r=0.34/0.23/0.33; forearm L r=0.34/0.27/0.45; reach r=0.35/0.26/0.48** | **YES** (fully public PDF) — stepwise equations for kg-lifted + Wilks (see Equations §). Within-sex elite sample: HEIGHT IS A WEAK PREDICTOR; girth/mass dominate. |
| 4 | **Falch, Guldteig Rædergård, van den Tillaar 2023**, *J Funct Morphol Kinesiol* 8(1):19 (PMC9944492) | 36 resistance-trained (19 M / 17 F), ~22–24 yr, ~4.2–4.7 yr experience | lean mass, %fat, height, thigh/shank/upper-arm/lower-arm length | **POOLED: lean mass r=0.86 (BP)/0.81 (SQ); height r=0.75 (BP)/0.66 (SQ).** **WITHIN-SEX height collapses: males r=−0.16 (BP)/0.09 (SQ) ns; females r=0.28 (BP)/−0.05 (SQ) ns.** Within-sex lean mass: F r=0.75 (BP)/0.57 (SQ); M r=0.29/0.46 ns. | **NO** — bivariate correlations only, no R², no equation. (Crucial for the height-confound point.) |
| 5 | **Keogh, Hume, Pearson, Mellow 2007/2009** (cited in Ferland as ref 38; "anthropometric prediction of powerlifting") | competitive powerlifters | age, body mass, 6 skinfolds, arm CSA, **forearm length**, thigh C | Full multivariate: **bench AMS R²=0.689 (68.9%)** from age+mass+skinfolds+arm CSA+forearm L; **deadlift AMS R²=0.624 (62.4%)** from age+mass+skinfolds+thigh C | Reported R² + predictor list; length terms are the WEAKEST contributors (mass/CSA/girth dominate). |
| 6 | **Lovera & Keogh-style / Italian classic PL upper-limb anthropometry 2023** (ResearchGate 368397032) | 47 male Italian classic powerlifters | upper-limb lengths, CSAs, ratios, FFM | Bench: **UALR (upper-arm length ratio) r=0.57; UMLR r=0.45; upper-arm muscle CSA r=0.56; FFM r=0.31; arm fat index r=−0.37** (vs Wilks/relative) | Partial; main predictors = lean/CSA + length RATIOS, not absolute length. |
| 7 | **Mayhew, Ball, Ward, Hart, Arnold 1991**, *J Sports Med Phys Fitness* 31:135–141 | college males | upper-arm CSA, fat, chest circumference, arm length, height | Bench: **R=0.83 (R²≈0.69), SEE=11.6 kg** | **YES:** `Bench (kg) = 7.05·(flexed upper-arm girth) − 3.92·(arm-length/height index) + 38.4` |
| 8 | **Hetzler et al. 2010**, *J Strength Cond Res* 24(6):1429–1439 | Division IA college football | reps@225, arm circumference, arm length | NFL-225 R improved **0.87 → 0.90** by adding anthropometry | **YES:** `1RM (lb) = 299.08 + 2.47·armCirc(cm) − 4.60·armLength(cm) + 5.84·reps@225` |
| 9 | **Caruso et al. 2012** (allometric, NSCA) / NCAA D-IA football allometric | college / football | body-mass allometric exponent | Bench scales to **BM^0.45–0.57**; squat **BM^0.49–0.60**; theory predicts BM^0.67 | Allometric `Strength = a·BM^b` — see Allometry §. |
| 10 | **Stark et al. / general body-comp reviews** | varied | FFM, muscle CSA | FFM/muscle CSA typically explains **~50–80%** of between-person strength variance; the single best non-test predictor | — |

---

## (b) QUESTION 1 — How much variance does HEIGHT / LIMB LENGTH add BEYOND body mass? (the crux)

**Answer: almost none, within a sex. Incremental ΔR² of height over a bodyweight-only model ≈ 0.00–0.04, frequently ≤0.**

Lines of evidence:

1. **The pooled-vs-within-sex collapse (Falch 2023, PMC9944492, N=36 trained).**
   - Pooled men+women: height ↔ 1RM bench **r=0.75**, squat **r=0.66** → looks like height matters (r²≈0.44–0.56 "explained").
   - But this is sex masquerading as height: tall people in the pool are mostly the men, who are categorically stronger.
   - WITHIN males (n=19): height ↔ 1RM bench **r=−0.16 (ns)**, squat **r=0.09 (ns)** → height explains ~0–2.6%.
   - WITHIN females (n=17): height ↔ 1RM bench **r=0.28 (ns)**, squat **r=−0.05 (ns)** → ~0–8%, n.s.
   - Authors' own words: *"individuals with greater body height/segment lengths might also have greater lean mass without having more contractile tissue"* and the height/lean-mass associations are *"most likely explained"* by between-sex stature/composition differences. **No partial correlation isolating height was run — but the within-sex nulls are decisive.**

2. **Within-sex elite sample (Ferland 2020, N=59 male PLers).** Even before partialing out mass, raw height correlations are already weak: **SQ r=0.34, BP r=0.27, DL r=0.37** (height r² ≈ 0.07–0.14), while **body weight is r=0.64–0.78 (r²≈0.41–0.61)** and torso circumference r=0.69–0.78. Since height and BW are themselves correlated, height's UNIQUE contribution over BW is a small fraction of even that 0.07–0.14 — i.e. ΔR² ≈ a few %, and in the stepwise models **height never entered** (torso C, torso C/height, waist C, reach/height, age did). The model SELECTED girths/mass/ratios and dropped raw height entirely.

3. **Reynolds 2006 (N=70 mixed).** Height bivariate r=0.47 (LP)/0.59 (CP), but **LBM (r=0.71/0.77) and weight (r=0.58/0.56) beat it**, and in stepwise regression *anthropometry + sex were dropped* once a strength test (5RM) was present — i.e. the lift load already encodes whatever height/mass would have told you. Their explicit conclusion: adding anthropometry+sex "did not significantly improve the accuracy of prediction."

4. **Limb LENGTHS specifically are weak predictors of ABSOLUTE 1RM.** Across Ferland 2020: arm length r=0.04/0.04/0.22 (SQ/BP/DL), thigh length r=0.34/0.23/0.33, forearm length r=0.27–0.45, reach r=0.26–0.48. The strongest "length" signals are RATIOS (forearm/torso C r=−0.49 to −0.67; reach/height for deadlift β=0.37) — and these predict RELATIVE strength / which-lift-you're-better-at, not raw 1RM. Keogh ref-38: even a kitchen-sink model needs arm CSA + body mass + skinfolds to hit R²=0.689 for bench; forearm length is the marginal add-on, not the driver.

5. **Why mechanically:** longer limbs simultaneously (a) lengthen the lever (bad for the lift, ↓ strength) and (b) accompany greater muscle length/PCSA and greater body mass (good, ↑ strength). These cancel. Net effect of a pure height/length term, holding mass constant, is near zero or slightly negative — exactly what the data show. A taller lifter at the SAME bodyweight is not predicted to be stronger (if anything marginally weaker on relative terms — Falch: height ↔ relative bench r=−0.59 in males).

**Bottom line for the app:** a HEIGHT factor, added on top of sex + bodyweight, is expected to move R² by **≈ +0.00 to +0.04 at most**, and could be net-zero. It mostly re-encodes information bodyweight already carries. If anything, height is useful only as a *denominator* (to form BMI / FFMI / reach-ratios), not as a standalone "+strength" term.

---

## (c) QUESTION 2 — How much does TRAINING-AGE / experience explain, and what's the dose-response shape?

**Answer: small unique variance once you know current bodyweight/lean mass; steep diminishing-returns (logarithmic) curve.**

1. **Cross-sectional unique variance is small / drops out of models.**
   - Reynolds 2006: training VOLUME bivariate r to 1RM = **0.12–0.23** (near zero) and was **eliminated in stepwise regression** for both lifts. Their verdict: training volume is "either unrelated to 1RM strength … or so interrelated to strength" that the strength test absorbs it.
   - Falch 2023: training experience (4.2 vs 4.7 yr) did NOT differ between the strong-vs-less-strong contrasts and was not a modelled predictor; the authors attribute non-significant within-male lean-mass correlations partly to *training-history heterogeneity* — i.e. experience is noise-laden, not a clean linear predictor.
   - No located study reports a clean standalone ΔR² for "years lifting → 1RM" in a multivariate model. The honest read: **its incremental R² over bodyweight + lean mass is small (order of a few %).** Most of the training effect is already *embodied* in the lifter's current lean mass / bodyweight, so conditioning on mass double-counts it.

2. **Dose-response SHAPE is logarithmic (strong diminishing returns).** Converging non-RCT evidence:
   - Novice "newbie gains": +50% or more on major lifts is common in the first ~3 months; neuromuscular gains plateau ~12 weeks; year-1 muscle ~+15–25 lb (men) / 8–12 lb (women).
   - Competitive trajectory: ~+7.5–12.5% in year 1, cumulative ~20% by year 10 — *logarithmic, not linear*, with most relative gain in the first 2–3 years (multiple coaching/meta sources; SportRxiv dose-response meta-regressions show "diminishing returns for strength considerably more pronounced than for hypertrophy").
   - Experienced lifters need progressively MORE volume for the same increment (2008 trained-vs-untrained hormonal-response work; volume meta-regressions).
   - Practical curve: a saturating function (e.g. `gain% ≈ A·(1 − e^(−k·years))` or `A·ln(1+years)`) fits far better than linear. By ~3–5 years a trainee is near their structural ceiling for a given bodyweight; beyond that, 1RM moves mostly via bodyweight/lean-mass change (which the mass term already captures).

3. **Age (chronological, not training-age)** explains **~13–25% of strength variance in males, ~21–25% in females** in population data (lower-limb strength normative study) — but that is largely the aging decline, relevant only across wide age spans, and is a *separate* axis from training-age.

**Bottom line for the app:** a training-years input is worth including as a **bounded, concave (logarithmic / saturating) adjustment**, NOT a linear term, and you should expect it to add only a few % of explained variance beyond sex+bodyweight — because lean mass already encodes most of the accumulated training. Its biggest legitimate use is separating a true novice (who is far below their mass-predicted ceiling) from a trained lifter (at it). Modeling it as "+X kg per year, linearly" would over-credit veterans and is unsupported.

---

## (d) QUESTION 3 — Directly-usable multivariate equations `1RM = f(sex, bodymass, height, age, training-years)`?

**Partial yes. There is no single perfectly-matching free-bar equation, but these are the usable published ones:**

### Most complete predictor set — Stanelle/Lambert 2021 (N=147, R²=0.68–0.83)
Predictor variables identified (all p<0.05), coded as published:
`height(cm); weight(kg); BMI; age; sex (0=F,1=M); regional lean masses(kg); fat mass(kg); FFM(kg); %BF; arm/leg/trunk length(cm); shoulder width(cm)`
- Per-exercise stepwise equations exist for: Leg Press, Chest Press, Leg Curl, Lat Pulldown, Leg Extension, Triceps Pushdown, Biceps Curl.
- "Without-DEXA" variants use only height/weight/BMI/age/sex/lengths/shoulder width — i.e. exactly the `f(sex, bodymass, height, age)` family you want.
- **Coefficients are in the paywalled Tables 2–3** (abstract gives the variable set + R² range only). ACTION: to actually implement, pull the full PDF (DOI 10.1016/j.smhs.2021.02.001) — the regional-model coefficient tables are what you'd port. This is the single best target for a "comprehensive multi-factor" engine, but note exercises are machine-based, NOT barbell squat/bench/DL.

### Fully-public, ready-to-use coefficient sets

**Reynolds 2006 (free PDF) — 1RM from a sub-max test (NOT anthropometry):**
- `1RM Leg Press (kg)  = 1.09703 × (5RM kg) + 14.2546`   (R²=0.974, SEE=16.16 kg; cross-val R²=0.988)
- `1RM Chest Press (kg) = 1.1307 × (5RM kg) + 0.6998`     (R²=0.993, SEE=2.98 kg; cross-val R²=0.998)
- *Negative result to cite:* adding sex/age/height/weight/LBM/girths/training-volume did NOT improve these — stepwise kept only the rep test.

**Ferland 2020 (free PDF) — male classic powerlifters, kg lifted (recommend kg, not Wilks, forms):**
- `Squat kg = Torso C × 8.605 + 137.281`  *(stepwise: torso C only)*
- `Total kg = Torso C × 8.766 − (Waist C/Hip C) × 317.859 + (Forearm L/Arm L) × 380.762 − 365.626`
- `Bench Wilks = (Torso C/Height) × 299.938 − (Waist C/Height) × 171.154 + Age × 0.927 − (Reach/Height) × 162.786 + 141.212`
- `Deadlift Wilks = (Reach/Height) × 315.303 − 164.951`
- `Deadlift % of total = (Leg L/Height) × 0.548 − BMI × 0.003 + (Reach/Height) × 0.335 + (Hip C/Height) × 0.083 − 0.047`
- Note: these are SEX-SPECIFIC (male only) and population-specific (competitive PL). **Height appears only inside ratios; raw height never entered any model.** Age enters bench with a tiny +0.927 Wilks/yr coefficient.

**Mayhew 1991 (bench, college males):** `Bench (kg) = 7.05 × (flexed upper-arm girth cm) − 3.92 × (arm-length/height index) + 38.4`  (R=0.83, SEE=11.6 kg) — note the LENGTH term enters NEGATIVELY (longer arm ⇒ weaker), girth positively.

**Hetzler 2010 (football, lb):** `1RM (lb) = 299.08 + 2.47 × armCirc(cm) − 4.60 × armLength(cm) + 5.84 × reps@225`  (R 0.87→0.90). Again: arm LENGTH coefficient is NEGATIVE.

**Keogh (ref 38) — reported R², predictor set (coefficients not in our copy):** bench AMS R²=0.689 from {age, body mass, 6 skinfolds, arm CSA, forearm L}; deadlift AMS R²=0.624 from {age, body mass, 6 skinfolds, thigh C}.

### Allometric scaling (if comparing across bodyweights rather than predicting raw kg)
`Strength = a × BodyMass^b`, with empirically-fitted b BELOW the theoretical 0.67:
- Bench press b ≈ **0.45–0.57**; Squat b ≈ **0.49–0.60** (Caruso; NCAA football: bench 0.559, squat 0.496, clean 0.287).
- Practical normalizers: BP·BM^−0.57, SQ·BM^−0.60. (Wilks/IPF-GL are the productized versions of this idea.)

---

## CROSS-CHECKS / HONESTY NOTES (reporting weak predictors as weak)
- **Height as a +strength term: WEAK-to-NULL within sex.** Pooled r≈0.66–0.75 is a sex confound; within-sex r≈−0.16…+0.37, mostly n.s. ΔR² over bodyweight ≈ 0.00–0.04.
- **Limb LENGTHS: WEAK for absolute 1RM** (arm L r≈0.04; thigh r≈0.23–0.34; forearm r≈0.27–0.45) and often enter regressions with NEGATIVE sign. They matter more for which-lift-you-favor (sumo vs conventional, bench leverage) than for total kg.
- **Training-years: WEAK unique signal** (volume r≈0.12–0.23; dropped from stepwise models) because lean mass already embodies it; SHAPE is logarithmic/saturating, not linear.
- **Bodyweight / lean mass / a limb girth: STRONG** (r≈0.6–0.86; FFM the single best non-test predictor). A sex + bodyweight model is already capturing the lion's share.
- **The strongest predictor of 1RM is a sub-maximal strength TEST** (5RM → 1RM R²≈0.97–0.99), which dominates every anthropometric variable. If the app ever has even one logged working set, that beats any anthropometric guess.

## DATA-QUALITY CAVEATS
- Falch (N=36) and Ferland (N=59) are small; several moderate r's are non-significant. Mixed-sex pooled correlations are inflated by sex and should not be read as within-person effects.
- Stanelle/Lambert R²=0.68–0.83 is for MACHINE lifts (leg/chest press etc.), not barbell SQ/BP/DL — and those R² are in-sample (likely optimistic vs cross-validated).
- Ferland equations are male-only, elite-PL-only; do not generalize coefficients to women or novices.

## SOURCES (most authoritative first)
1. Stanelle ST, Crouse SF, Heimdal TR, Riechman SE, Remy AL, Lambert BS. Predicting muscular strength using demographics, skeletal dimensions, and body composition measures. Sports Med Health Sci. 2021;3(1):34-39. DOI 10.1016/j.smhs.2021.02.001
2. Reynolds JM, Gordon TJ, Robergs RA. Prediction of one repetition maximum strength from multiple repetition maximum testing and anthropometry. J Strength Cond Res. 2006;20(3):584-592. (full PDF: unm.edu/~rrobergs/478RMStrengthPrediction.pdf)
3. Ferland PM, Laurier A, Comtois AS. Relationships Between Anthropometry and Maximal Strength in Male Classic Powerlifters. Int J Exerc Sci. 2020;13(4):1512-1531. (full PDF via CORE/SemanticScholar)
4. Falch HN, Guldteig Rædergård H, van den Tillaar R. Association of Strength Performance in Bench Press and Squat with Anthropometric Variables between Resistance-Trained Males and Females. J Funct Morphol Kinesiol. 2023;8(1):19. PMC9944492. DOI 10.3390/jfmk8010019
5. Mayhew JL, Ball TE, Ward TE, Hart CL, Arnold MD. Relationships of structural dimensions to bench press strength in college males. J Sports Med Phys Fitness. 1991;31:135-141.
6. Hetzler RK, Schroeder BL, Wages JJ, Stickley CD, Kimura IF. Anthropometry increases 1RM predictive ability of NFL-225 test. J Strength Cond Res. 2010;24(6):1429-1439.
7. Keogh JWL et al. (cited as ref 38 in Ferland 2020) anthropometric prediction of powerlifting AMS (bench R²=0.689; deadlift R²=0.624).
8. Lovera/Italian classic-PL upper-limb anthropometry. Prediction of bench press performance in powerlifting: the role of upper limb anthropometry. (ResearchGate 368397032)
9. Caruso et al.; Allometric Modeling of the Bench Press and Squat (JSCR 2000); NCAA D-IA football allometric scaling (JSCR/PubMed 24875427).
10. Lower-limb muscle strength normative population study (age variance) PMC7007641.
