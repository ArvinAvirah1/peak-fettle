# DATA HUNT — Datasets linking STRENGTH ↔ anthropometrics ↔ training history
### Can the multi-factor 1RM model (age, sex, height, bodyweight, training-years) be empirically improved from open data?

Compiled 2026-06-19. Method: WebSearch + direct fetch of dataset pages / data dictionaries / preprint full-text.
Scope: open / parseable datasets and large-scale surveys. Three buckets per brief.

---

## TL;DR VERDICT (read this first)

**The ideal combined dataset — 1RM + height + training-years in the SAME records, at large N, openly downloadable — DOES NOT EXIST.** Every candidate fails on at least one axis. The fields fragment cleanly:

- **1RM at massive N** exists (OpenPowerlifting ~3M+ entries; Fitbod 303k sets; StrengthLevel 153M lifts) — but **NONE of these carry HEIGHT, and NONE carry TRAINING-YEARS.** OpenPowerlifting is the only one of the three that is actually open/downloadable.
- **Height + training-experience together** exists in small lab studies (Falch 2023 N=36; Reynolds 2006 N=70) and one Kaggle "gym members" set (N=973) — but the lab studies have **no open raw data** and the Kaggle set has **no 1RM** (it's cardio/session metrics).
- **Population-scale strength + height + age + sex** exists and is fully open (NHANES, ~13.9k adults; UK Biobank, ~500k) — but the strength measure is **GRIP STRENGTH, a PROXY, not 1RM**, and neither carries training-years.

**What gets you PARTWAY (ranked):**
1. **OpenPowerlifting** (open, parseable, ~3M+ entries) — empirically nails the **bodyweight × sex × age → 1RM** surface, which is the load-bearing part of the model. Use it to fit/validate those three coefficients. It cannot speak to height or training-years (both absent).
2. **NHANES grip strength** (open, public domain, ~13.9k) — lets you measure, on a representative population, how much **height adds over bodyweight/age/sex** *for a strength proxy*. Best available evidence on the height question, with the caveat that grip ≠ 1RM.
3. **Falch 2023 (PMC9944492)** — not a dataset, but the single most decisive *published result*: within-sex, **height does NOT predict 1RM** (males r=−0.16 bench / 0.09 squat; females r=0.28 / −0.05, all n.s.). The strong pooled r (0.75/0.66) is purely a sex proxy.

**Bottom line for the model:** Open data can **empirically tighten the bodyweight/sex/age terms** (via OpenPowerlifting) and can **empirically justify *down-weighting or dropping* height as a within-sex predictor** (Falch + NHANES + Reynolds + the Fitbod paper's own note all converge on "anthropometry adds little"). **No open dataset can empirically calibrate a training-YEARS coefficient against 1RM** — that field simply isn't recorded alongside 1RM anywhere public. Training-years must stay theory/heuristic-driven, or be learned from the app's OWN longitudinal user logs over time.

---

## BUCKET 1 — Large epidemiological strength data (population surveys)

> ⚠️ Across this entire bucket the strength measure is **HANDGRIP DYNAMOMETRY**, a *proxy* for whole-body/1RM strength. Grip correlates with total strength but is NOT a barbell 1RM. None of these surveys record resistance-training history in a way that yields "training-years," and none measure barbell lifts.

### 1A. NHANES — Muscle Strength / Grip Test (USA)
- **What it is:** US national health survey; added isometric **handgrip** via Takei digital dynamometer in the 2011–2012 cycle, continued 2013–2014.
- **Files / format:** SAS transport `.XPT` files, freely downloadable from the CDC NHANES data portal (the per-cycle pages now redirect to archive.cdc.gov; files still live). Grip file = `MGX_G` (2011–12) / `MGX_H` (2013–14). Anthropometrics in the **Body Measures** file `BMX_G`/`BMX_H`; age/sex in **Demographics** `DEMO_G`/`DEMO_H`. All joined on the `SEQN` respondent ID.
- **Fields (after SEQN join):** combined grip strength in **kg** (sum of best reading from each hand; per-hand per-trial values also present), **standing height (cm)**, **body mass (kg)**, **BMI**, **age**, **sex**, plus body-composition (DXA % fat, lean mass) in separate files. → **has height ✔, bodyweight ✔, age ✔, sex ✔.**
- **N:** ~13,676–13,918 participants aged 6–80 across 2011–2014 (≈ the adult subset is most of this).
- **License:** **US Government public domain — no restrictions, no application, no fee.** This is the most permissively licensed option in the entire hunt.
- **Published strength↔anthropometry correlations:** grip stratified/normed by age, sex, height; "Predictors of Hand Grip Strength" (NHANES 2013–14) and the BRI/CI/WHtR↔grip studies confirm height and body size are significant grip predictors at population scale.
- **TRAINING-YEARS:** ❌ absent (NHANES has a physical-activity questionnaire, but nothing that yields resistance-training tenure).
- **Multi-factor-model fit:** Has 4 of 5 inputs (height/bw/age/sex) but the **outcome is a grip proxy, not 1RM**, and **no training-years**. Excellent for studying *how much height adds over bw/age/sex* for a strength proxy; cannot calibrate a 1RM model directly.

### 1B. UK Biobank — Handgrip strength (UK)
- **What it is:** 502,713-person UK cohort; right + left isometric **handgrip** via Jamar J00105 hydraulic dynamometer (Field category 100019).
- **Fields:** right/left grip (kg), plus the full Biobank phenotype set incl. **standing height, weight, age, sex**, body composition, etc. → has height ✔, bw ✔, age ✔, sex ✔.
- **N:** ~500k (largest single grip dataset in the world).
- **Format/access:** **NOT openly downloadable.** Requires a formal **UK Biobank application**, institutional affiliation, an approved research project, and **access fees**. Data is delivered to approved researchers only. This is a months-long governance process, not a parseable open file — effectively out of reach for a startup model-tuning task.
- **License:** restricted/managed access (application + fee + approved use).
- **Published:** the canonical "New Normative Values for Handgrip Strength: Results From the UK Biobank" (Spruit/Dodds line of work) normed grip by **sex, age, and HEIGHT** — i.e. height IS a significant grip covariate at n=500k. Useful as *published evidence*, but you get the paper's tables, not the data.
- **TRAINING-YEARS:** ❌ absent.
- **Multi-factor-model fit:** Same shape as NHANES (grip proxy, has height/age/sex/bw, no training-years) but **not parseable** due to access gating. Use the *published normative equations* as a reference, not the raw data.

### 1C. Other national fitness surveys (brief)
- **NHANES NNYFS (National Youth Fitness Survey, 2012):** grip test (`Y_MGX`) but youth-only; same proxy/limitations.
- **"Grip Strength across the Life Course" (12 British studies, PLOS One):** pooled normative grip by age/sex/height — published norms, not an open record-level file.
- All share the same three disqualifiers for our purpose: **grip proxy (not 1RM), no training-years, and (except NHANES) not openly downloadable.**

---

## BUCKET 2 — Open lifting / gym datasets

### 2A. OpenPowerlifting — ⭐ the best *open + parseable* lifting dataset
- **Source/URL:** bulk CSV at https://openpowerlifting.gitlab.io/opl-csv/bulk-csv.html ; data dictionary at https://openpowerlifting.gitlab.io/opl-csv/bulk-csv-docs.html ; Kaggle mirror `open-powerlifting/powerlifting-database`.
- **Fields (verified against the official data-readme):** Name, **Sex (M/F/Mx)**, Event, Equipment, **Age** (+ AgeClass, BirthYearClass), Division, **BodyweightKg**, WeightClassKg, per-attempt Squat/Bench/Deadlift 1/2/3/4 Kg, **Best3SquatKg / Best3BenchKg / Best3DeadliftKg** (= competition 1RM per lift), **TotalKg**, Place, Dots/Wilks/Glossbrenner/Goodlift coefficients, Tested, Country/State, Federation, Date, MeetName, etc.
- **1RM?** ✔ — `Best3{Squat,Bench,Deadlift}Kg` is a genuine, judged 1-rep max (the strongest possible "close proxy," arguably the gold standard for these three lifts).
- **HEIGHT?** ❌ **ABSENT.** There is no height/stature column anywhere in the schema. (Confirmed field-by-field from the official docs.)
- **TRAINING-YEARS?** ❌ **ABSENT.** No training-tenure / experience field. `Age` is present but says nothing about how long they've trained. (Federation/Division/Place are competitive context, not training history.)
- **N:** Very large — the Kaggle snapshot lists **367,004 lifters / rows**; the live full database is **~3 million+ entries** across all meets and growing. (One row = one lifter at one meet.)
- **Format/size/license:** single flat **CSV**, hundreds of MB, trivially parseable (pandas/DuckDB). **Open data, CC0-style / freely redistributable** (OpenPowerlifting publishes the bulk export expressly for reuse; the project is open-source on GitLab).
- **Multi-factor-model fit:** **Has 1RM ✔, bodyweight ✔, age ✔, sex ✔ — at huge N — but NO height and NO training-years.** This is THE dataset to **empirically fit/validate the bodyweight × sex × age → 1RM coefficients**. Caveats: it's a *competitive, equipment-stratified, often drug-tested-flagged* population (selection bias toward strong, lean, trained lifters — not the general app user), and you should filter to `Equipment=Raw`, `Event=SBD`, `Tested`, sensible age, and dedupe to best-per-lifter. It can say **nothing** about height or training-years.

### 2B. Fitbod training-log dataset (Marzagão 2026, SportRxiv 768 / arXiv 2603.17495) — large but ⚠️ PROPRIETARY
- **What it is:** the largest *training-log* (non-competition) strength dataset described in the literature; underpins a new weight-dependent 1RM formula.
- **Scale:** **303,494 near-failure sets**, **14,966 users**, **388 exercises**, 16 muscle groups (5% deterministic sample of Fitbod's base; full base ≈ 750M sets / 1.3M users).
- **Fields recorded:** per set → exercise, **weight lifted**, **reps**, AMRAP/warmup flags, timestamp. Per user → **sex** (M 79.9% / F 20.1%) and **age** (from DOB; mean 35.0, range 18–82). → has sex ✔, age ✔ (but neither is even used in the formula).
- **HEIGHT?** ❌ absent. **BODYWEIGHT?** ❌ absent. **TRAINING-YEARS?** ❌ absent (the paper rhetorically says the data "captures a broad range of training experience" but experience is never measured/recorded).
- **1RM?** Indirect — it *estimates* 1RM from near-failure sets; there's no tested 1RM and no height/tenure to regress against.
- **DATA AVAILABILITY:** ❌ **NOT released.** No data-availability statement, no repo/DOI/GitHub/OSF, no supplementary file. The data is **proprietary Fitbod internal** and **cannot be obtained or parsed** by a third party. (The *paper* is CC BY 4.0; the *data and code* are not shared.)
- **Most useful takeaway for us:** the paper explicitly notes (citing **Reynolds et al. 2006**) that **"the inclusion of anthropometric variables did not improve predictions."** Their best model uses **weight + reps only** — sex/age don't even make the equation. This is independent corroboration that anthropometrics (incl. height) add little to set-level 1RM estimation.

### 2C. StrengthLevel.com — 153M lifts, but closed + bodyweight-only
- **What it is:** the strength-standards engine many apps benchmark against (https://strengthlevel.com/strength-standards).
- **Scale:** **153,460,370 lifts** self-entered by users (bench ~48.4M, squat ~24.9M, deadlift ~22.9M).
- **Fields used in their standards:** 1RM × **bodyweight** × **sex** (× age for the age-adjusted tables). → has 1RM ✔, bw ✔, sex ✔, age ✔(partial).
- **HEIGHT?** ❌ not used. **TRAINING-YEARS?** ❌ not used.
- **Open?** ❌ **No raw data release.** Only the *derived* standard tables are visible on the website; the underlying lift records are not downloadable and there's no license to reuse them. Self-reported → quality caveats.
- **Fit:** confirms the *shape* of bodyweight×sex(×age)→1RM at enormous N, but adds nothing on height/training-years and isn't parseable.

### 2D. Smaller Kaggle / repo "gym" datasets — mostly the WRONG fields
- **"Gym Members Exercise Dataset"** (Kaggle `valakhorasani/...`): **N=973**. Has **Weight(kg), Height(m), Age, Gender, Experience_Level (1–3 beginner→expert)** — i.e. height ✔ AND a coarse experience proxy ✔ — **BUT NO 1RM / no barbell lifts.** Outcome columns are heart rate, calories, session duration, workout type. → cannot fit a 1RM model. (Closest single file to "height + experience together," but missing the dependent variable entirely.)
- **"Fitness Goals & Workout Habits," "Exercise & Fitness Metrics," "Body Fitness Exercises & Body Measurement," "Comprehensive Gym Exercises":** exercise libraries / synthetic or survey habit data — **no per-person 1RM tied to height + training-years.**
- **"721 Weight Training Workouts," "Weight Lifting Exercises," "Gym Workout IMU Dataset" (164 sets):** single-user logs or sensor/rep-counting data; tiny N, no demographics, no 1RM-vs-anthropometry linkage.
- **Kaggle OpenPowerlifting mirrors** (`open-powerlifting/...`, `dansbecker/...`, `docgenki/...`): same data as 2A → same verdict (no height, no training-years).

---

## BUCKET 3 — Anything tying 1RM (or close proxy) to HEIGHT **and** TRAINING HISTORY in the same records

These are the only sources that put 1RM, height, AND training-experience in the *same* records. All are **small-N lab studies with NO open raw data** (means/SDs in tables only; "available on request" boilerplate).

### 3A. Falch, Haugen, Larsen, van den Tillaar 2023 — PMC9944492 ⭐ most decisive published result
- **N=36** (19 M / 17 F), resistance-trained. Age M 24.3±3.5 / F 22.1±3.0; **Height M 182±7.3 / F 166.1±3.7 cm**; body mass M 87.1±13.3 / F 65.5±5.6 kg; **TRAINING-YEARS M 4.2±2.5 / F 4.7±2.3.** Measured: **1RM bench & squat**, plus height, 4 limb-segment lengths, lean mass, fat%, grip/stance width.
- **Has all the fields conceptually (1RM ✔ height ✔ training-years ✔)** — but N=36 and **raw data NOT published** ("made available by the authors without undue reservation" = email-only; no repo/DOI/supplement).
- **KEY FINDINGS (directly relevant to whether height belongs in the model):**
  - Pooled (n=36): **height vs 1RM r=0.75 bench, 0.66 squat (p≤0.01)** — looks strong…
  - …but **WITHIN sex it collapses to non-significance:** males height vs 1RM r=**−0.16** bench / **0.09** squat; females r=**0.28** / **−0.05** (none significant).
  - Authors' own conclusion: the pooled correlation is an **artifact of pooling two sexes that differ in stature** — height is acting as a **proxy for sex/body size**, not an independent strength driver. Within a sex, **lean mass** (and, in males, fat%) drives 1RM, not height.
  - ➜ **Empirical support for treating height as weak/redundant once sex is in the model.** If the app already conditions on sex and bodyweight, adding height likely buys little.

### 3B. Reynolds, Gordon, Robergs 2006 — JSCR 20(3):584–592 (PubMed 16937972)
- **N=70** (34 M / 36 F), age 18–69. Measured **1RM chest press & leg press**, multi-RM, and built regression equations from **multi-RM + anthropometry + gender + age + resistance-training volume.**
- **Has 1RM ✔, age ✔, sex ✔, training-volume ✔, anthropometry ✔** in the same records — but **N=70 and NO open raw data** (equations only, in a paywalled JSCR paper; a UNM course PDF mirrors it).
- **Finding:** prediction was dominated by the **multi-RM load**; the *added value of anthropometric variables was minor* (this is the very result the Fitbod paper cites to justify a weight+reps-only model). Confirms anthropometry (incl. height) is a low-information add-on for 1RM prediction.

### 3C. Assorted small RT studies (Norway training-frequency N=21; sex-comparison N=36; volume N=34; etc.)
- Each reports age + **height** + bodyweight + **training-years** + **1RM bench/squat** for its cohort — but **N=20–40 each, embedded in paper tables, no open record-level files.** Individually useless for fitting; *in aggregate* they could be hand-transcribed into a small meta-dataset (see "how to use," below) but that's dozens of rows, not a model-grade sample.

---

## SIDE-BY-SIDE — does each have what the multi-factor model needs?

| Dataset | 1RM? | Height? | Training-yrs? | Bodywt? | Age? | Sex? | N | Open & parseable? |
|---|---|---|---|---|---|---|---|---|
| **OpenPowerlifting** | ✔ (judged) | ❌ | ❌ | ✔ | ✔ | ✔ | ~3M+ (367k snapshot) | ✔✔ CSV, free |
| **NHANES grip** | proxy (grip) | ✔ | ❌ | ✔ | ✔ | ✔ | ~13.9k adults | ✔✔ XPT, public domain |
| **UK Biobank grip** | proxy (grip) | ✔ | ❌ | ✔ | ✔ | ✔ | ~500k | ❌ application + fee |
| **Fitbod log (Marzagão)** | est. (sets) | ❌ | ❌ | ❌ | ✔ | ✔ | 303k sets / 15k users | ❌ proprietary |
| **StrengthLevel** | ✔ (self-rep) | ❌ | ❌ | ✔ | partial | ✔ | 153M lifts | ❌ no raw release |
| **Kaggle Gym Members** | ❌ | ✔ | ✔ (1–3 coarse) | ✔ | ✔ | ✔ | 973 | ✔ CSV — but no 1RM |
| **Falch 2023 (PMC9944492)** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | 36 | ❌ data on request |
| **Reynolds 2006** | ✔ | ✔ | ✔ (volume) | ✔ | ✔ | ✔ | 70 | ❌ paywalled, no raw |

**No single row is all-green-and-open.** OpenPowerlifting and NHANES are the only "✔✔ open" rows, and both lack training-years (and OPL also lacks height).

---

## HOW TO ACTUALLY USE THIS (recommendation)

1. **Calibrate bodyweight × sex × age → 1RM on OpenPowerlifting.** Filter to Raw / SBD / Tested, dedupe best-per-lifter, fit allometric (e.g. Wilks/Dots-style) bodyweight scaling + an age curve. This empirically grounds 3 of the 5 model inputs at N in the millions. (Mind the selection bias toward strong/lean competitors — calibrate *shape*, then sanity-check absolute levels against StrengthLevel's broader self-reported tables.)
2. **Decide height's fate from NHANES + Falch + Reynolds, not from new data you can't get.** The convergent evidence (Falch within-sex r≈0; Reynolds "anthropometry minor"; Fitbod weight+reps-only; NHANES height-adds-modestly-to-a-*grip*-proxy) says **height is largely redundant once sex and bodyweight are in the model.** If you keep it, keep its weight small and validate that it improves nothing on held-out OpenPowerlifting-style data. If you want one extra check, you *can* download NHANES (`MGX_*`+`BMX_*`+`DEMO_*`, join on SEQN) and quantify the marginal R² of height over {bw, age, sex} for grip — a few hours of work, fully open — but treat it as proxy evidence.
3. **Do NOT expect to empirically fit a training-YEARS coefficient from public data — it isn't recorded next to 1RM anywhere downloadable.** Options: (a) keep training-years as a theory-driven heuristic; (b) hand-build a tiny meta-dataset from the small RT studies (Falch, Reynolds, the N=20–40 trials) — but that's ~dozens of rows and underpowered; or (c) **the real fix: learn the training-tenure → 1RM trajectory from Peak Fettle's OWN longitudinal user logs**, which already pair lift history with profile data the app collects (the one place height + training-time + actual lifts can coexist at scale and under your control).

---

## SOURCES
- OpenPowerlifting bulk CSV + data dictionary: https://openpowerlifting.gitlab.io/opl-csv/bulk-csv.html , https://openpowerlifting.gitlab.io/opl-csv/bulk-csv-docs.html ; Kaggle mirror: https://www.kaggle.com/datasets/open-powerlifting/powerlifting-database
- NHANES grip (MGX_G/MGX_H) + body measures (BMX) + demo (DEMO), portal: https://wwwn.cdc.gov/nchs/nhanes/search/datapage.aspx ; muscle-strength procedures manual: https://wwwn.cdc.gov/nchs/data/nhanes/public/2013/manuals/Muscle_Strength_2013.pdf ; predictors paper: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11061696/
- UK Biobank grip (cat 100019): https://biobank.ndph.ox.ac.uk/ukb/label.cgi?id=100019 ; normative values: https://pubmed.ncbi.nlm.nih.gov/23958225/
- Fitbod 1RM paper (proprietary data): https://sportrxiv.org/index.php/server/preprint/view/768 (DOI 10.51224/SportRxiv.768) ; arXiv 2603.17495
- StrengthLevel standards: https://strengthlevel.com/strength-standards
- Kaggle Gym Members Exercise Dataset (height + experience, no 1RM): https://www.kaggle.com/datasets/valakhorasani/gym-members-exercise-dataset
- Falch et al. 2023, anthropometry vs bench/squat 1RM (within-sex height n.s.): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9944492/ (DOI 10.3390/jfmk8010019)
- Reynolds et al. 2006, 1RM from multi-RM + anthropometry, N=70: https://pubmed.ncbi.nlm.nih.gov/16937972/
