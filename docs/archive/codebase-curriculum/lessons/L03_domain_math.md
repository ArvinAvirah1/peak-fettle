# Lesson L03 — Domain math: strength curves, Epley, and percentile ranking

> **Track:** 0 — Foundations · **Status on roadmap:** core rung
> **Interactive app:** [`L03_domain_math.html`](L03_domain_math.html)
> **Estimated time:** ~50 min (one sitting) · **Prerequisite rungs:** L01, L02
>
> Prior knowledge assumed: comfort with logs and exponents. Bloom range L2–L5.

---

## 0. Source of Truth

The following files are the canonical reference for the domain math in this lesson:

| File | Role |
|------|------|
| `strength_curve_model.md` | Complete mathematical specification (v2) of the percentile model |
| `compute_percentile.sql` | Implementation of the model in PostgreSQL; functions resolve inheritance, apply factors |
| `src/StrengthCurve.h` / `.cpp` | C++ port of the SQL; embedded lift vectors table |
| `src/exercise.cpp` | Epley 1RM formula implementation |
| `src/WorkoutTracker.cpp` | Strength score gamification; percentile aggregation |

All math equations are stated in strength_curve_model.md §3–§5. The SQL and C++ code implement them identically.

---

## 1. Learning Outcomes

By the end of this lesson, you will be able to:

**Bloom L2 (Understand):**
- [ ] Explain the Epley formula and its limitations (accuracy range, why true 1RM ≠ computed 1RM)
- [ ] Describe the four factors in the strength model (bodyweight, age, training years, lift type)
- [ ] Define log-normal distribution and explain why it fits strength data

**Bloom L3 (Apply):**
- [ ] Calculate a user's 1RM-equivalent from a 3×100kg set using Epley
- [ ] Compute age and training experience factors from a user profile
- [ ] Use a lift vector (μ, σ) to compute a raw z-score for a lift

**Bloom L4 (Analyze):**
- [ ] Compare v1 and v2 of the model; identify what broke in v1 and how v2 fixed it
- [ ] Trace a percentile calculation end-to-end for a specific user and lift
- [ ] Critique the calibration anchors (strength standards table) and discuss missing populations
- [ ] Analyze the age curve piecewise function (youth, peak, decline) against real data

**Bloom L5 (Evaluate):**
- [ ] Redesign the model to support weight classes (IPF/USPA style) instead of continuous bodyweight
- [ ] Critique the 0–1000 gamified strength score and propose an alternative scoring scheme
- [ ] Assess whether the log-normal model remains valid for untrained vs. elite populations
- [ ] Defend the decision to use inheritance (front squat as child of back squat) versus direct-fit all lifts

---

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion; don't pre-answer here

> Agent: pose these as live calibration questions before teaching, each with an "I'm not sure" option. Use the answers to set depth (these probes are diagnostics, not a written test).

**Q3.1:** Estimate a user's 1-rep-max for bench press given: 85 kg for 5 reps. Use the Epley formula.

*Confidence: ___/5*

**Q3.2:** In the strength model, what is the role of the training factor `T(years)`, and why does it asymptote to 1.0?

*Confidence: ___/5*

**Q3.3:** What is the relationship between percentile ranking and standard-normal z-score in the model?

*Confidence: ___/5*

---

## 3. Spacing Carry-Over (M14)

**From L01 & L02, you learned:**
- Sets have weight, reps, and effort (RIR); Exercises aggregate Sets
- Q_PROPERTY and singletons are the C++ mechanisms for data flow
- The 1RM (one-rep-max) is the maximal weight you can lift for exactly one rep

**In this lesson, we build on that foundation:**
- L02 showed *how* Epley is computed (the C++ code); L03 explains *why* (the formula and its limits)
- L01 covered "log sets"; L03 shows how logged sets feed into the percentile model
- L01 mentioned "percentile ranking" abstractly; L03 gives the full mathematical model

**Key connections:**
- `Exercise::estimatedOneRepMax()` calls Epley; that value feeds into `StrengthCurve::percentile()`
- `UserProfile` (age, sex, bodyweight, training years) is the input to four factors in the model
- The lift vector (μ, σ, α, ...) is the coefficient set that makes the model work for each lift

---

## 4. Difficulty Ladder (M2: Graduated Complexity)

**Rung 1:** Understanding the Epley formula and calculating 1RM-equivalents  
**Rung 2:** Computing individual factors (bodyweight allometric scaling, age curve, training curve)  
**Rung 3:** Combining factors into a full expected-lift calculation  
**Rung 4:** Applying the log-normal model (z-score → percentile) and understanding calibration  
**Rung 5:** Evaluating the model design and proposing improvements or alternatives  

---

## 5. Concept Sequence

### Concept 1: The Epley Formula — From Reps to 1RM

**Generate-first question (M4):**
If you can lift 100 kg for exactly 3 reps, what is your estimated 1-rep-max?

**Concrete hook (M7):**
The Epley formula is one of the most famous approximations in strength training. When you log a set as "100 kg × 3 reps," we don't know your true 1RM (you haven't tested it), but we can estimate it.

**Epley formula:**
```
1RM ≈ weight × (1 + reps / 30)
```

For 100 kg × 3 reps:
```
1RM ≈ 100 × (1 + 3/30) = 100 × 1.1 = 110 kg
```

**Real code (src/exercise.cpp, lines 31–50):**
```cpp
double Exercise::estimatedOneRepMax() const {
    // Epley: 1RM = w * (1 + reps/30). Only meaningful for reps >= 2;
    // beyond ~12 reps the formula loses accuracy, but we still surface a value.
    //
    // N-03/X-04 (2026-05-03): when reps == 1 the user already performed a
    // true 1-rep-max attempt — return weightKg directly so a 200 kg single
    // shows as exactly 200 kg, not 206.7 kg (3.3% Epley inflation).
    double best = 0.0;
    for (const Set *s : m_sets) {
        if (s->reps() <= 0) continue;
        const double e1rm = (s->reps() == 1)
            ? s->weightKg()                                      // true 1RM — no multiplier
            : s->weightKg() * (1.0 + s->reps() / 30.0);        // Epley for 2+ reps
        if (e1rm > best) best = e1rm;
    }
    return best;
}
```

Notice: The code special-cases reps == 1. If the user actually tested a true 1RM (e.g., "200 kg × 1 rep"), we return 200 kg, not 200 × 1.033 = 206.7 kg.

**Elaboration (M6):**
The Epley formula is empirical—it was derived by fitting strength data, not derived from first principles. It works reasonably well for reps in the 2–12 range. Beyond 12 reps (e.g., "50 kg × 25 reps"), the formula becomes less accurate because fatigue and metabolic factors (not just pure strength) start to dominate.

Other formulas exist:
- **Brzycki:** `1RM = weight / (1.0278 − 0.0278 × reps)` (similar accuracy)
- **Lander:** Uses a different quadratic; slightly more accurate for high reps
- **Mayhew:** Another variant

Peak Fettle uses Epley because it's simple, famous, and gives sensible results in the training range (2–12 reps). Users expect it.

**Retrieval check (M3):**
If you can bench 80 kg for 6 reps, what's your estimated 1RM?
- (A) 80 kg
- (B) 86 kg (80 × 1.2)
- (C) 96 kg (80 × 1.2)
- (D) 100 kg

*Answer:* (C). `80 × (1 + 6/30) = 80 × 1.2 = 96 kg`.

What if you logged "80 kg × 1 rep"?

*Answer:* The code returns exactly 80 kg (true 1RM, no multiplication).

**Worked Example 1:**
A user logs three sets of back squats:
- Set 1: 100 kg × 8 reps → E1RM = 100 × (1 + 8/30) = 100 × 1.267 = 126.7 kg
- Set 2: 120 kg × 4 reps → E1RM = 120 × (1 + 4/30) = 120 × 1.133 = 136 kg
- Set 3: 130 kg × 2 reps → E1RM = 130 × (1 + 2/30) = 130 × 1.067 = 138.7 kg

The Exercise's estimated 1RM is the max: **138.7 kg**.

**Practice & checkpoint (M9 → M12):**
Derive the Epley formula from first principles: assume strength (1RM) is constant, and that rep count is determined by metabolic fatigue over reps. Why does the formula have the form `1 + reps/30`? (Hint: 30 is chosen empirically.)

---

### Concept 2: The Log-Normal Distribution and Why It Models Strength

**Generate-first question (M4):**
Why is a normal distribution (bell curve) a poor model for strength data, and what distribution is better?

**Concrete hook (M7):**
Strength has a hard lower bound (zero weight) and a soft upper bound (genetic ceiling). If you plot the distribution of 1RMs across a population, you get a right-skewed curve—many people are weaker, fewer are very strong. This is *not* a normal distribution.

The log-normal distribution models this naturally. If you take the *log* of strengths and plot them, you get a normal distribution.

**The model:**
In Peak Fettle, we assume the log of a lift weight follows a normal distribution:
```
ln(L) ~ Normal(μ, σ²)
```

where:
- `L` is the lift weight in kg
- `μ` is the log of the 50th-percentile (median) lift
- `σ` is the standard deviation of the log

**Why log-normal?**
Consider: at 75 kg bodyweight, the intermediate male bench press is ~75 kg (1× bodyweight). The range is roughly:
- Beginner: 0.5 × BW = 37.5 kg
- Intermediate: 1.0 × BW = 75 kg
- Advanced: 1.25 × BW = 93.75 kg
- Elite: 1.5 × BW = 112.5 kg

The *ratios* are consistent (each level is ~0.6× the next), but the absolute differences grow. This is multiplicative scaling—the hallmark of log-normal data.

Mathematically:
```
ln(37.5) ≈ 3.62
ln(75)   ≈ 4.32  (difference: 0.70)
ln(93.75) ≈ 4.54 (difference: 0.22)
ln(112.5) ≈ 4.72 (difference: 0.18)
```

Wait, that's backwards—the log differences *decrease* at higher strength levels. This is because the absolute differences grow, but they're smaller as a *percentage* of the median.

**Real code (StrengthCurve.cpp, lines 212–284):**
```cpp
Result percentile(const QString &liftId,
                  const QString &sex,
                  double bodyweightKg,
                  int    ageYears,
                  int    yearsTraining,
                  double liftKg)
{
    // ... input validation ...
    
    // Expected median lift L₅₀ (in kg) — computed from model
    const double l50 = std::exp(mu) * bwFactor * ageFactor * trainFactor;
    
    // Z-score in log space
    double z = (std::log(liftKg) - std::log(l50)) / sigma;
    z = std::clamp(z, -4.0, 4.0);  // clamp extreme outliers
    
    // Percentile via standard normal CDF
    const double pct = 100.0 * phi(z);
    
    out.percentile = std::clamp(pct, 0.003, 99.997);
    out.expectedKg = l50;
    out.hasModel = true;
    return out;
}
```

The calculation:
1. Compute expected median lift `L₅₀` (the 50th-percentile lift for your profile)
2. Compute z-score: `z = (ln(your_lift) - ln(L₅₀)) / σ`
3. Look up percentile via the standard normal CDF: `Φ(z)`

**Elaboration (M6):**
The standard normal CDF Φ(z) converts a z-score to a percentile:
- z = 0 → Φ(0) = 0.5 → 50th percentile
- z = 1 → Φ(1) ≈ 0.84 → 84th percentile
- z = 2 → Φ(2) ≈ 0.98 → 98th percentile
- z = -1 → Φ(-1) ≈ 0.16 → 16th percentile

This is why the model uses log-normal: once you transform to log-space, the familiar Gaussian math applies.

**Retrieval check (M3):**
If `σ = 0.2` (the within-experience standard deviation for bench press), and your lift is exactly at the median (`L = L₅₀`), what is your percentile?

*Answer:* z = (ln(L₅₀) - ln(L₅₀)) / 0.2 = 0 / 0.2 = 0. Φ(0) = 0.5 = 50th percentile. Correct.

**Worked Example 2:**
A 75 kg male, age 25, with 2 years of training history logs a 100 kg bench press.

From the lift vector (bench_press, M): μ ≈ 4.32, σ ≈ 0.25

Expected median (all factors = 1.0 for this reference profile): L₅₀ = exp(4.32) ≈ 75 kg

Z-score: z = (ln(100) - ln(75)) / 0.25 = (4.605 - 4.317) / 0.25 = 0.288 / 0.25 = 1.15

Percentile: Φ(1.15) ≈ 0.875 = 87.5th percentile

So a 100 kg bench at this profile is very good (87th percentile among trained males of the same age, BW, and experience).

**Practice & checkpoint (M9 → M12):**
Plot the probability density function (PDF) of the log-normal distribution (as a sketch). Label the mean (μ), the expected value E[L], and the mode. Which is largest, and why?

---

### Concept 3: The Four Factors — Bodyweight, Age, Training, Lift Type

**Generate-first question (M4):**
Why does a stronger bodyweight advantage exist for some lifts (squat) but not others (overhead press)? How does the model account for this?

**Concrete hook (M7):**
Intuitively, a heavier person has more muscle mass and can lift more weight. But the advantage isn't 1:1. A 100 kg lifter can't lift 2× what an 50 kg lifter can; the ratio is smaller. This is *allometric scaling*—the relationship between body size and performance.

The model uses four multiplicative factors:

```
L₅₀ = exp(μ) × B(BW) × A(age) × T(years)
```

**Factor 1: Bodyweight Allometric Scaling**
```
B(BW) = (BW / BW₀)^α
```

- `BW` is your bodyweight (kg)
- `BW₀` is a reference bodyweight (75 kg for males, 65 kg for females)
- `α` is the allometric exponent (≈ 0.667 for most lifts)

Example: A male at 100 kg (reference is 75 kg):
```
B(100) = (100 / 75)^0.667 = (1.333)^0.667 ≈ 1.209
```

So a 100 kg lifter gets a ~20.9% boost vs. the 75 kg reference.

Why 0.667? This is the "2/3 law" from biology—strength scales with cross-sectional area (proportional to mass^(2/3)).

From strength_curve_model.md:
```
| Lift | M Beg | M Nov | M Int | M Adv | M Eli |
|------|-------|-------|-------|-------|-------|
| Squat | 0.75 | 1.25 | 1.50 | 2.00 | 2.50 |
| Bench | 0.50 | 0.75 | 1.00 | 1.25 | 1.50 |
| Deadlift | 1.00 | 1.50 | 1.75 | 2.25 | 2.75 |
| OHP | 0.40 | 0.55 | 0.65 | 0.85 | 1.05 |
```

These are bodyweight multiples. Notice:
- Squat and deadlift are much higher (more dependent on bodyweight)
- OHP is lower (less dependent)
- Bench is in between

The allometric exponent `α` is the *same* (0.667) for all lifts, but the `μ` (the intercept) differs. This is baked into the lift vectors.

**Factor 2: Age (Piecewise Linear)**
```
         ⎧ 1 − γ_y · (A_pl − age)        if age < 23 (youth)
A(age) = ⎨ 1                            if 23 ≤ age ≤ 35 (peak)
         ⎩ max(0.40, 1 − γ_d · (age − 35))  if age > 35 (decline)
```

- `γ_y = 0.012` (youth deficit per year)
- `γ_d = 0.010` (decline per year post-peak)
- Peak window is 23–35 (factor = 1.0)

Example: A 20-year-old (3 years before peak):
```
A(20) = 1 − 0.012 × (23 − 20) = 1 − 0.036 = 0.964
```
They're at ~96.4% of their peak strength.

A 50-year-old (15 years post-peak):
```
A(50) = max(0.40, 1 − 0.010 × (50 − 35)) = max(0.40, 1 − 0.15) = max(0.40, 0.85) = 0.85
```
They retain 85% of their peak.

**Factor 3: Training Experience (Exponential Kinetics)**
```
T(years) = f₀ + (1 − f₀) · (1 − exp(−years / τ))
```

- `f₀` is the training floor (fraction at t=0, never trained)
- `τ ≈ 3.0` years (time constant)
- As years → ∞, T → 1.0

> **Source-accuracy note (verify against code):** the worked examples below use the *spec's* per-lift floor `f₀` (e.g. ≈0.327 for male bench, from `strength_curve_model.md` / `compute_percentile.sql`'s `training_floor`). The shipped **C++ port** (`src/StrengthCurve.cpp`) instead uses a single global constant `kTrainingFloor = 0.55` for every lift — a simplification. So hand-computed example percentiles will track the SQL output, but the C++ app's numbers will differ slightly. When teaching, point this divergence out; it's a real spec-vs-implementation gap worth an L4 discussion.

Example: Bench press, f₀ ≈ 0.327:
```
T(0)   = 0.327                                              = 0.327 (beginner)
T(2)   = 0.327 + (1 − 0.327) × (1 − exp(−2/3)) ≈ 0.655    = intermediate
T(4)   = 0.327 + 0.673 × (1 − exp(−4/3)) ≈ 0.823          = advanced
T(∞)   = 0.327 + 0.673 × 1 = 1.0                          = asymptote
```

The floor `f₀` is per-lift, derived so that `T(0) × exp(μ)` matches the beginner standard.

**Factor 4: Lift Type (μ, σ from lift vector)**

Different lifts have different difficulty. Back squat intermediate: 1.5 × BW. OHP intermediate: 0.65 × BW. The lift vector encodes this as `μ` (the log of the asymptote lift at reference profile).

**Real code (StrengthCurve.cpp, lines 250–269):**
```cpp
// Factor 1: bodyweight allometric
const double bwFactor = std::pow(bw / bwRef, alpha);

// Factor 2: piecewise age curve
double ageFactor;
if (age < kAgeYouthBoundary) {
    ageFactor = 1.0 - kGammaYouth * (kAgeYouthBoundary - age);
} else if (age <= kAgePeakUpper) {
    ageFactor = 1.0;
} else {
    ageFactor = std::max(kAgeFloor,
                         1.0 - kGammaDecline * (age - kAgePeakUpper));
}

// Factor 3: training-experience kinetics
const double trainFactor = kTrainingFloor
    + (1.0 - kTrainingFloor) * (1.0 - std::exp(-yrs / kTrainingTau));

// Combined expected log lift L₅₀
const double l50 = std::exp(mu) * bwFactor * ageFactor * trainFactor;
```

**Elaboration (M6):**
The model is multiplicative, not additive. This means:
- A 10% increase in bodyweight → ~6.7% increase in lift (because α = 0.667)
- Youth deficit of 1 year → 1.2% loss (γ_y = 0.012)
- Effects compound: being young AND small AND untrained → significantly weaker

This is realistic. A 15-year-old who's just started training will be much weaker than a 35-year-old in their 5th year.

**Retrieval check (M3):**
A 30-year-old male, 85 kg bodyweight, 3 years training history. What are the four factors for bench press?

Assume: BW₀ = 75, α = 0.667, age peak = 23–35 (so factor = 1.0), f₀ ≈ 0.327, τ = 3.0, exp(μ) ≈ 75 kg (intermediate reference).

- B(85) = (85/75)^0.667 ≈ 1.096 (+9.6%)
- A(30) = 1.0 (within peak window)
- T(3) = 0.327 + 0.673 × (1 − exp(−1)) ≈ 0.327 + 0.673 × 0.632 ≈ 0.752
- L₅₀ = 75 × 1.096 × 1.0 × 0.752 ≈ 62 kg

So for this profile, the expected median bench is ~62 kg.

**Worked Example 3: Full Calculation**

User: Female, 70 kg, age 28, 5 years training, logs 55 kg bench press.

From lift vector (bench_press, F): μ ≈ 3.82, σ ≈ 0.275, α = 0.667, BW₀ = 65, f₀ ≈ 0.267, τ = 3.0

Step 1: Bodyweight factor
```
B(70) = (70 / 65)^0.667 = (1.077)^0.667 ≈ 1.051
```

Step 2: Age factor
```
A(28) = 1.0 (28 is within 23–35 peak window)
```

Step 3: Training factor
```
T(5) = 0.267 + (1 − 0.267) × (1 − exp(−5 / 3))
     = 0.267 + 0.733 × (1 − exp(−1.667))
     = 0.267 + 0.733 × (1 − 0.189)
     = 0.267 + 0.733 × 0.811
     ≈ 0.267 + 0.595 ≈ 0.862
```

Step 4: Expected median
```
L₅₀ = exp(3.82) × 1.051 × 1.0 × 0.862
    ≈ 45.9 × 1.051 × 0.862
    ≈ 41.5 kg
```

Step 5: Z-score
```
z = (ln(55) − ln(41.5)) / 0.275
  = (4.007 − 3.726) / 0.275
  = 0.281 / 0.275
  ≈ 1.02
```

Step 6: Percentile
```
Φ(1.02) ≈ 0.846 → 84.6th percentile
```

**Conclusion:** This user's 55 kg bench is excellent for her profile—84.6th percentile among females of the same age, weight, and training experience.

**Practice & checkpoint (M9 → M12):**
A user complains: "I'm the same age as my training buddy, same bodyweight, same years training—but he can deadlift 250 kg and I can only do 220 kg. Why does the percentile model say we should be the same?" 

What are three reasons they might differ, and which can the model account for?

---

### Concept 4: Lift Inheritance and Composability

**Generate-first question (M4):**
Front squat is weaker than back squat. Should front squat be modeled independently, or as a scaled version of back squat?

**Concrete hook (M7):**
There are ~40 exercises in the Peak Fettle lift table. Fitting a unique model (μ, σ, α) for every single exercise would require huge datasets. Instead, the model uses *inheritance*: many exercises are modeled as scaled versions of a parent lift.

For example:
```
back_squat (M):     μ = 4.7228, σ = 0.3107   [direct fit]
front_squat (M):    ratio = 0.85, inherits from back_squat
```

The front squat inherits σ, α, and other parameters from back squat. But its μ is adjusted:
```
μ_front = μ_back + ln(0.85) = 4.7228 + ln(0.85) = 4.7228 − 0.1625 ≈ 4.56
```

So the front squat is expected to be 85% as heavy as the back squat (for the same user).

**Real code (StrengthCurve.cpp, lines 134–153):**
```cpp
bool resolveRow(const LiftRow *row, double &mu, double &sigma,
                double &alpha, double &bwRef) {
    if (!row) return false;
    if (!row->parentId) {
        // Direct fit: return stored values directly
        mu    = row->mu;
        sigma = row->sigma;
        alpha = row->alpha;
        bwRef = row->bwRef;
        return true;
    }
    const LiftRow *parent = findRow(QLatin1String(row->parentId), row->sex);
    if (!parent || parent->parentId) return false;
    
    // Child mu = parent mu + log(ratio); sigma/alpha/bwRef inherited.
    mu    = parent->mu + std::log(row->ratio);
    sigma = parent->sigma;
    alpha = parent->alpha;
    bwRef = parent->bwRef;
    return true;
}
```

**Lift inheritance table:**
```
back_squat (direct):      μ = 4.7228, σ = 0.3107, ratio = —
front_squat (inherited):  ratio = 0.85, μ_eff = 4.7228 + ln(0.85) ≈ 4.56
low_bar_squat (inherited):ratio = 1.05, μ_eff = 4.7228 + ln(1.05) ≈ 4.75
leg_press (inherited):    ratio = 2.50, μ_eff = 4.7228 + ln(2.50) ≈ 5.56

bench_press (direct):     μ = 4.3175, σ = 0.2466, ratio = —
incline_bench (inherited):ratio = 0.78, μ_eff = 4.3175 + ln(0.78) ≈ 4.11
dumbbell_bench (inherited):ratio = 0.42, μ_eff = 4.3175 + ln(0.42) ≈ 3.20
```

**Elaboration (M6):**
Inheritance is a way to encode domain knowledge:
- Front squat is mechanically different (more quad-dominant, less glute/lower-back) → expected to be weaker
- Leg press is easier (machine provides stability) → expected to be stronger
- Dumbbell press is harder (stabilization required) → expected to be much weaker

By using ratios, we avoid fitting 40 separate models and instead leverage the 5 main lifts (back squat, bench, deadlift, OHP, barbell row) as reference points.

**Retrieval check (M3):**
If a user logs 100 kg back squat (intermediate male, 75 kg BW, age 25, 2yr training), what should we expect them to log on front squat?

*Answer:* Front squat ratio is 0.85, so we'd expect roughly 0.85 × 100 = 85 kg. Actually, it's more nuanced because the model works in log-space, but the intuition is right.

More precisely:
- Back squat E1RM: 100 kg
- Back squat μ: 4.7228
- Expected median (B=1.0, A=1.0, T=0.655): exp(4.7228) × 1.0 × 1.0 × 0.655 ≈ 75 kg
- If they logged 100 kg, they're above median
- Front squat μ_eff: 4.56, expected median: exp(4.56) × 0.655 ≈ 63.7 kg
- Scale factor: μ difference is 4.56 − 4.7228 ≈ −0.16, which is ln(0.85)
- Ratio in linear space: exp(−0.16) ≈ 0.85

So the expected front squat is 85% of the back squat, all else equal.

**Practice & checkpoint (M9 → M12):**
Critique the inheritance model: Under what circumstances would a direct fit for front squat (instead of inheritance) be justified? What data would you need?

---

### Concept 5: Calibration, v1 Bugs, and v2 Fixes

**Generate-first question (M4):**
What does "calibration" mean in the context of the strength model, and how do you know if a model is well-calibrated?

**Concrete hook (M7):**
The model has many parameters (μ, σ, α, f₀, τ, age curve coefficients). How do we choose their values? We calibrate against *ground truth*: empirical strength standards.

From strength_curve_model.md:
```
| Lift | M Beg | M Nov | M Int | M Adv | M Eli |
|------|-------|-------|-------|-------|-------|
| Squat | 0.75 | 1.25 | 1.50 | 2.00 | 2.50 |
| Bench | 0.50 | 0.75 | 1.00 | 1.25 | 1.50 |
| Deadlift | 1.00 | 1.50 | 1.75 | 2.25 | 2.75 |
| OHP | 0.40 | 0.55 | 0.65 | 0.85 | 1.05 |
```

These are bodyweight multiples, sourced from Strength Level (n > 2M self-reported entries), Nuckols, ExRx, and Lyle McDonald. They represent consensus about what constitutes "intermediate" (2 years training), "advanced" (4+ years), etc.

**V1 Bug:**
In v1, the model had a critical error. μ was set to `ln(intermediate_standard × BW₀)`, making the intermediate standard the *long-run ceiling*. But the training factor `T(years)` asymptotes to 1.0 at infinite years, so:

```
L₅₀(fully trained) = exp(μ) × 1.0 = intermediate_standard × BW₀
```

This predicts that a lifter with infinite training is only at the intermediate level—which is clearly wrong. Advanced and elite standards are empirically higher.

Prediction for a 4-year male trainee (25yo, 75 kg):
- T(4) ≈ 0.82
- L₅₀ = 75 × 0.82 = 61.5 kg

But the intermediate standard is 75 kg. The model predicted only 82% of intermediate—a massive underestimate.

**V2 Fix:**
In v2, μ is now set to `ln(asymptote × BW₀)`, where the asymptote is much higher than intermediate. Specifically:

```
f₀ = fraction at t=0 (beginner)
T(2yr) = fraction at t=2yr (intermediate)

μ is solved so that:
  T(∞) × exp(μ) = very_high_ceiling (genetic potential)
```

Then f₀ is derived from two calibration anchors:
```
T(0) × exp(μ) = beginner_standard × BW₀
T(2yr) × exp(μ) = intermediate_standard × BW₀
```

Solving these two equations gives f₀.

Example (bench, M):
```
Beginner:     0.50 × 75 = 37.5 kg
Intermediate: 1.00 × 75 = 75 kg

T(0) = f₀
T(2yr) = f₀ + (1 − f₀) × (1 − exp(−2/3)) ≈ f₀ + 0.673 × 0.487 ≈ f₀ + 0.327

Equations:
  f₀ × exp(μ) = 37.5
  (f₀ + 0.327) × exp(μ) = 75

Dividing:
  (f₀ + 0.327) / f₀ = 2
  f₀ + 0.327 = 2f₀
  f₀ = 0.327

exp(μ) = 37.5 / 0.327 ≈ 114.7 kg

So μ = ln(114.7) ≈ 4.74
```

Now, at 4 years:
```
T(4) = 0.327 + 0.673 × (1 − exp(−4/3)) ≈ 0.327 + 0.673 × 0.735 ≈ 0.823
L₅₀ = 114.7 × 0.823 ≈ 94.4 kg
```

The intermediate standard is 75 kg; the advanced standard is 1.25 × 75 = 93.75 kg. The model predicts 94.4 kg for 4 years—spot on!

**Real code (compute_percentile.sql, lines 220–286):**
```sql
CREATE OR REPLACE FUNCTION compute_percentile(
    p_lift_id        TEXT,
    p_sex            CHAR(1),
    p_bodyweight_kg  DOUBLE PRECISION,
    p_age            INTEGER,
    p_training_yrs   DOUBLE PRECISION,
    p_lift_kg        DOUBLE PRECISION,
    p_model_version  INTEGER DEFAULT 2
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    v RECORD;
    bw_clamped     DOUBLE PRECISION;
    age_clamped    INTEGER;
    yrs_clamped    DOUBLE PRECISION;
    age_factor     DOUBLE PRECISION;
    train_factor   DOUBLE PRECISION;
    bw_factor      DOUBLE PRECISION;
    log_expected   DOUBLE PRECISION;
    z              DOUBLE PRECISION;
BEGIN
    -- Input validation
    IF p_lift_kg IS NULL OR p_lift_kg <= 0 THEN RETURN NULL; END IF;
    IF p_bodyweight_kg IS NULL OR p_bodyweight_kg <= 0 THEN RETURN NULL; END IF;
    IF p_age IS NULL OR p_age < 10 THEN RETURN NULL; END IF;
    IF p_sex NOT IN ('M','F') THEN RETURN NULL; END IF;

    -- Clamp inputs
    bw_clamped  := GREATEST(40, LEAST(p_bodyweight_kg, CASE p_sex WHEN 'M' THEN 210 ELSE 150 END));
    age_clamped := GREATEST(14, LEAST(p_age, 90));
    yrs_clamped := GREATEST(0, LEAST(COALESCE(p_training_yrs, 0), 30));

    -- Resolve parameter vector
    SELECT * INTO v FROM resolve_lift_vector(p_lift_id, p_sex, p_model_version);

    -- Factor 1: Bodyweight
    bw_factor := power(bw_clamped / v.bw_ref_kg, v.alpha);

    -- Factor 2: Age
    IF age_clamped < v.age_peak_lo THEN
        age_factor := GREATEST(0.40, 1.0 - v.youth_decay_per_year * (v.age_peak_lo - age_clamped));
    ELSIF age_clamped <= v.age_peak_hi THEN
        age_factor := 1.0;
    ELSE
        age_factor := GREATEST(0.40, 1.0 - v.age_decay_per_year * (age_clamped - v.age_peak_hi));
    END IF;

    -- Factor 3: Training
    train_factor := v.training_floor +
                   (1.0 - v.training_floor) *
                   (1.0 - exp(-yrs_clamped / v.training_tau_years));

    -- Combined expected log lift
    log_expected := v.mu + ln(bw_factor) + ln(age_factor) + ln(train_factor);

    -- Z-score
    z := GREATEST(-4.0, LEAST(4.0, (ln(p_lift_kg) - log_expected) / v.sigma));

    RETURN 100.0 * norm_cdf(z);
END;
$$;
```

**Elaboration (M6):**
Calibration is an iterative process:
1. Gather ground-truth data (strength standards from competition databases, user surveys)
2. Fit the model to match those standards
3. Test predictions on new data
4. If predictions are biased, refine the model

Peak Fettle's v2 model was calibrated by solving for μ and f₀ such that intermediate and advanced trainees map correctly. The resulting model passes validation on Strength Level (n > 2M) and Bielik 2024 (n > 800k competition entries).

**Retrieval check (M3):**
In v1, why did the model predict that a lifter with 10 years of training was only at the intermediate level?

*Answer:* Because μ was set to the intermediate standard. The training factor asymptotes to 1.0, so the expected median is always the intermediate standard, regardless of how long you've trained.

**Practice & checkpoint (M9 → M12):**
If a user complains "Your model says I should be able to bench 95 kg, but I can only do 85 kg"—what are three reasons the model prediction might be wrong (besides the model being fundamentally broken)?

---

### Concept 6: The 0–1000 Gamified Strength Score

**Generate-first question (M4):**
Why would a user care about a 0–1000 "strength score" instead of just looking at their raw 1RM?

**Concrete hook (M7):**
Raw 1RM numbers are hard to interpret. Is 100 kg bench good? It depends on bodyweight, age, experience. A 0–1000 normalized score lets users see themselves on a universal scale and track progress linearly.

Peak Fettle uses a **saturating exponential** ramp, tuned so that 100 kg E1RM lands at ~600:
```
strength_score = 1000 × (1 − exp(−k × e1rm_kg)),   k = 0.00916
strength_score = 0                                  [if e1rm ≤ 0]
```

At 100 kg the score is:
```
1000 × (1 − exp(−0.00916 × 100)) = 1000 × (1 − 0.400) ≈ 600
```

At 120 kg:
```
1000 × (1 − exp(−0.00916 × 120)) = 1000 × (1 − 0.333) ≈ 667
```

The 20 kg jump (100 → 120) yields only a ~67-point increase (600 → 667), and each further 20 kg buys less — the curve *saturates*. That is the design intent: early progress feels fast, and the top of the scale (1000) is an asymptote nobody quite reaches, so there is always headroom.

**Real code (`src/WorkoutTracker.cpp`, `computeStrengthScore`):**
```cpp
double WorkoutTracker::computeStrengthScore(double e1rmKg) {
    // Goal: an encouraging, gently-curved 0–1000 ramp.
    // Math: 1000 * (1 - exp(-k * e1rm)), with k tuned so 100 kg ~= 600.
    //       Solve 1 - exp(-k * 100) = 0.6  =>  k = -ln(0.4)/100 ~= 0.00916.
    if (e1rmKg <= 0.0) return 0.0;
    constexpr double k = 0.00916;
    const double score = 1000.0 * (1.0 - std::exp(-k * e1rmKg));
    if (score < 0.0)    return 0.0;
    if (score > 1000.0) return 1000.0;
    return score;
}
```

**Elaboration (M6):**
The 0–1000 scale is arbitrary; the *shape* is the design choice. Alternatives:
- **Linear** in E1RM — equal kg always adds equal points (no saturation; no asymptote).
- **Percentile-based** — use the cohort percentile as the score (couples the score to the whole model, not just your own lift).
- **Saturating exponential** (what Peak Fettle uses) — fast early gains, diminishing returns, a 1000 ceiling nobody reaches.

Peak Fettle chose the saturating exponential because:
1. **Psychology:** Beginners see large early jumps, which is when motivation matters most.
2. **Headroom:** The asymptote means the bar is never "maxed," so there is always a next point to chase.
3. **Self-contained:** It depends only on your own E1RM, so it updates instantly without recomputing cohort percentiles.

Note it depends only on E1RM, *not* on bodyweight/age/sex — so it is a personal-progress meter, not a peer comparison. The percentile model (Concepts 2–5) is the peer-comparison metric.

**Retrieval check (M3):**
Using `score = 1000 × (1 − exp(−0.00916 × e1rm))`, roughly what score does a 50 kg E1RM give?
- (A) 0
- (B) ~250
- (C) ~370
- (D) ~600

*Answer:* (C). `1000 × (1 − exp(−0.458)) = 1000 × (1 − 0.633) ≈ 367`.

**Worked Example 4: Score Progression**
A user's bench press progress (scores from the real exponential formula):
- Month 1: E1RM = 60 kg → 1000 × (1 − exp(−0.550)) ≈ **423**
- Month 3: E1RM = 75 kg → ≈ **497**  (+74)
- Month 6: E1RM = 90 kg → ≈ **562**  (+65)
- Month 9: E1RM = 105 kg → ≈ **618** (+56)

Equal 15 kg jumps in E1RM yield *shrinking* point gains (+74, +65, +56) — the saturation is visible in the numbers. Contrast this with the linear alternative, where every 15 kg would add the same amount.

**Practice & checkpoint (M9 → M12):**
Propose an alternative gamified score that gives more credit to higher numbers (e.g., 120 kg bench should be rewarded more than 60 kg bench). Sketch a formula and justify it.

---

## 6. Teach-Back Exercise (M10: Summarization)

Write a 5-sentence summary of this lesson in your own words, without looking at the text. Cover:
1. Why Epley formula converts reps/weight to 1RM-equivalent, and when it breaks down
2. The log-normal model and why it fits strength data better than a normal distribution
3. The four multiplicative factors (bodyweight, age, training, lift type)
4. Why the v1 model was broken and what v2 fixed
5. How the percentile ranking connects to z-scores and the standard normal CDF

Estimated time: 15 minutes. This forces you to synthesize the entire quantitative framework.

---

## 7. Cumulative Review (M13: Rapid-Fire Questions)

Answer in 2–3 sentences each. These questions mix concepts from L01, L02, and L03.

**Q1:** A user logs "200 kg deadlift × 1 rep" and "190 kg × 3 reps" on the same day. What is the Exercise's estimated 1RM? Explain why the code returns this value.

**Q2:** Why is the allometric exponent (α) the same (~0.667) for all lifts, but the median lift differs (bench vs. squat)? Which parameter controls the difference?

**Q3:** If you wanted to add a new experience level between "intermediate" (2 years) and "advanced" (4 years)—say, "high intermediate" (3 years)—how would you calibrate the model?

**Q4:** The age curve is piecewise linear. Would a smooth exponential curve (e.g., strength declines as e^(-age)) be better? What are the tradeoffs?

**Q5:** Why does the model use inheritance (front squat = 0.85 × back squat) instead of directly fitting every exercise? When would direct-fit be necessary?

---

## 8. Graded Quiz (M3/L2–L5 Assessment)

**Instructions:** Answer all six questions. Each has a point value and a rubric.

### Quiz Question 1 (L2: Understand) — 5 points

**Prompt:** Explain the Epley formula and its domain of validity. When does it break down, and what alternative approaches exist?

**Rubric:**
- (5 pts) Correct formula (`1RM = w × (1 + reps/30)`), valid range (2–12 reps, empirical), mentions limitations (high reps, fatigue dominates), notes alternatives (Brzycki, etc.)
- (3 pts) Formula correct, valid range mentioned, but misses limitations or alternatives
- (1 pt) Formula stated but context missing
- (0 pts) No answer or incorrect formula

**Model Answer:**
The Epley formula is `1RM ≈ w × (1 + reps/30)`, where w is the weight lifted for the given reps. It's accurate for reps in the 2–12 range, derived empirically by fitting strength data. It breaks down at very high reps (>12) because metabolic fatigue and anaerobic factors dominate, not pure strength. For a true 1RM test (reps = 1), the formula gives spurious inflation; Peak Fettle uses the actual weight when reps == 1. Alternatives include Brzycki (`1RM = w / (1.0278 − 0.0278 × reps)`) and Lander's formula; all are roughly equivalent in the 2–10 rep range.

---

### Quiz Question 2 (L2: Understand) — 5 points

**Prompt:** What is a log-normal distribution, and why does Peak Fettle use it to model strength data instead of a normal distribution?

**Rubric:**
- (5 pts) Defines log-normal (log of data is normal), explains why (strength has hard lower bound, multiplicative scaling), mentions right-skew and allometric properties
- (3 pts) Defines log-normal but weak explanation of why it fits
- (1 pt) Mentions log-normal but no clear definition
- (0 pts) No answer or incorrect definition

**Model Answer:**
A log-normal distribution is one where the *logarithm* of the variable follows a normal distribution. Strength data is log-normal because: (1) strength has a hard lower bound (zero weight) and soft upper bound (genetic ceiling), creating right-skew; (2) strength scales multiplicatively with bodyweight and training (e.g., a 100 kg lifter is ~1.2× a 75 kg lifter), not additively; (3) ratios are constant across experience levels (beginner to intermediate ratios are similar for all lifts). The log-normal model allows us to use familiar Gaussian math (z-score, CDF) after a log transformation.

---

### Quiz Question 3 (L3: Apply) — 6 points

**Prompt:** Calculate the strength percentile for the following user:
- Female, 70 kg bodyweight, age 26, 4 years training
- Logged 60 kg back squat (1RM equivalent)
- Lift vector: μ ≈ 4.17, σ ≈ 0.29, α = 0.667, BW₀ = 65, f₀ ≈ 0.327, τ = 3.0
- Age curve: peak window 23–35 (factor = 1.0)

Show all four factors and the final percentile.

**Rubric:**
- (6 pts) Correct computation of all four factors, correct z-score, correct percentile (within ±1%)
- (4 pts) All four factors computed but one or two off; final percentile approximate
- (2 pts) Factors computed but with significant errors
- (0 pts) Incomplete or severely wrong

**Model Answer:**
```
Step 1: Bodyweight factor
B(70) = (70/65)^0.667 = 1.077^0.667 ≈ 1.051

Step 2: Age factor
A(26) = 1.0  (26 is in peak window 23–35)

Step 3: Training factor
T(4) = 0.327 + (1 − 0.327) × (1 − exp(−4/3))
     = 0.327 + 0.673 × (1 − exp(−1.333))
     = 0.327 + 0.673 × (1 − 0.264)
     = 0.327 + 0.673 × 0.736
     ≈ 0.327 + 0.495 ≈ 0.822

Step 4: Expected median
L₅₀ = exp(4.17) × 1.051 × 1.0 × 0.822
    ≈ 64.5 × 1.051 × 0.822
    ≈ 55.8 kg

Step 5: Z-score
z = (ln(60) − ln(55.8)) / 0.29
  = (4.094 − 4.022) / 0.29
  = 0.072 / 0.29
  ≈ 0.248

Step 6: Percentile
Φ(0.248) ≈ 0.598 → 59.8th percentile
```

---

### Quiz Question 4 (L4: Analyze) — 7 points

**Prompt:** Compare v1 and v2 of the strength model. What was the critical bug in v1? How did v2 fix it? Provide the key equation that changed.

**Rubric:**
- (7 pts) Identifies the bug (μ set to intermediate standard, asymptote is intermediate not higher), explains the consequence (trained lifters appear weak), shows the v1 vs. v2 equation for μ or f₀ derivation
- (5 pts) Identifies the bug and consequence but weak on the fix equation
- (3 pts) Identifies the bug but doesn't fully explain the fix
- (1 pt) Vague answer
- (0 pts) No answer

**Model Answer:**
**V1 bug:** μ was set to `ln(intermediate_standard × BW₀)`, making the asymptotic lift (as training years → ∞) equal to the intermediate standard. Since T(years) → 1.0, the predicted L₅₀ for a highly trained lifter was only the intermediate level, not the advanced/elite levels observed in practice.

Example: Male bench, 4 years training, 75 kg. V1 predicted L₅₀ = 75 kg × T(4) ≈ 75 × 0.82 = 61.5 kg, while the actual intermediate standard is 75 kg—a massive underestimate.

**V2 fix:** In v2, μ is set to `ln(asymptote × BW₀)`, where the asymptote is much higher (e.g., ~114.7 kg for male bench). The training floor f₀ is then solved from two calibration constraints:
```
T(0) × exp(μ) = beginner_standard
T(2yr) × exp(μ) = intermediate_standard
```

This ensures that at t=0, users match the beginner standard; at t=2 years, they match intermediate; and as t → ∞, they approach a high asymptote consistent with elite standards.

**Key equation change:**
V1: `μ = ln(intermediate_std × BW₀)` — asymptote is intermediate
V2: `μ = ln(asymptote × BW₀)` — asymptote is much higher; f₀ is solved separately

---

### Quiz Question 5 (L5: Evaluate) — 8 points

**Prompt:** The model uses a piecewise-linear age curve (youth deficit, peak window, decline) instead of a smooth curve (e.g., exponential decay). Evaluate this choice: What are the pros and cons? Would you recommend a different approach, and why?

**Rubric:**
- (8 pts) Notes pros (simple, interpretable peak window, easy to fit) and cons (arbitrary at boundaries, discontinuous derivative), proposes smooth alternative with reasoning
- (6 pts) Notes tradeoffs but doesn't propose alternative or reasoning is weak
- (4 pts) Notes one side well but misses the other
- (2 pts) Superficial answer
- (0 pts) No answer

**Model Answer:**
**Pros of piecewise-linear:**
- Interpretable: peak window (23–35) is intuitive and data-backed
- Simple: three parameters (γ_y, γ_d, age_peak) vs. more complex curve
- Empirically validated: matches USAPL/Foster age-adjustment tables well

**Cons:**
- Arbitrary at boundaries: sharp corners at age 23 and 35 (derivative discontinuity)
- Discontinuous acceleration: rate of decline suddenly changes at age 35
- Data may not have sharp corners (real aging is smooth)

**Smooth alternative:** Exponential decay: `A(age) = exp(−λ × (age − 35)²)` (Gaussian centered at peak). Pros: smooth, no boundaries. Cons: harder to interpret, peak age is implicit not explicit, fewer parameters to control (goodness of fit may suffer).

**My recommendation:** The piecewise-linear is correct for Peak Fettle because:
1. USAPL data supports sharp peak window
2. Simplicity aids explanation to users
3. The boundary discontinuities are negligible for practical use (age doesn't change by 0.1 years)
4. Empirical validation is strong

A smooth curve might be slightly more elegant but provides minimal benefit here.

---

### Quiz Question 6 (L5: Evaluate) — 8 points

**Prompt:** Redesign the strength model to support weight classes (IPF-style: 59 kg, 66 kg, 74 kg, 83 kg, 93 kg, 120 kg+ for males). How would the model change? What data would you need? Discuss tradeoffs vs. the continuous bodyweight approach.

**Rubric:**
- (8 pts) Proposes discrete weight-class factors, discusses data needs (N per class), identifies tradeoffs (loss of precision, easier interpretation, better matches competition structure)
- (6 pts) Proposes weight-class model but weak on data needs or tradeoffs
- (4 pts) Sketches a weight-class approach but incomplete
- (2 pts) Vague or incomplete
- (0 pts) No answer

**Model Answer:**
**Weight-class redesign:**
Instead of continuous B(BW) = (BW / 75)^0.667, use a lookup table:

```
Weight Class (M): 59kg, 66kg, 74kg, 83kg, 93kg, 120kg+
BW Factor:       0.75, 0.85, 1.00, 1.10, 1.25, 1.50
```

The user's bodyweight maps to a class; the factor is constant within the class. Equivalently:
```
B(BW) = lookup_table[weight_class(BW)]
```

**Data needs:**
- Strength standards *per weight class* from competitions (IPF, USPA)
- Large sample size per class (N ≥ 500 per class for stability)
- Age/training stratification within each class (hard to collect)

**Tradeoffs:**
- *Pros:* Matches competition structure; easier for users ("I'm in the 74 kg class"); may be more accurate if strength doesn't scale continuously
- *Cons:* Loss of precision (two lifters at 73 kg and 75 kg get different factors, despite being similar); requires weight-class-specific data (harder to fit); users near boundaries feel edge effects; less granular for lighter/heavier users

**Hybrid approach:** Use discrete factors for the main classes (59–120 kg), but smooth interpolation between them. Best of both worlds.

**My assessment:** The continuous model is better for Peak Fettle (not a competition-focused app). But a weight-class model would make sense for an app targeting competitive lifters (IPF federations).

---

## 9. Interactive Widget: Percentile Calculator and Visualization

**Widget Description (HTML not included; concept only):**

This widget is a live, interactive percentile calculator. Features:

- **User profile inputs:** Sliders for age, bodyweight, years training; radio buttons for sex
- **Exercise selector:** Dropdown list of all ~40 lifts
- **Lift weight input:** Text field for the 1RM-equivalent (kg)
- **Real-time calculation:** As you adjust inputs, the percentile updates live
- **Factor breakdown:** Displays B(BW), A(age), T(years) and their product
- **Visualization:** 
  - Percentile bar (0–100, color-coded: red <10th, yellow 25–75th, green >90th)
  - Bell curve overlay showing user's z-score position
  - Comparison to nearby standards (beginner, intermediate, advanced, elite)
- **Shareable results:** QR code to share "I'm 65th percentile in bench press"
- **Historical tracking:** Save multiple lifts to see progress over time

---

## 10. End-of-Session Updates (Agent Instructions)

**After the learner completes all sections above, the agent should:**

1. **Grade the quiz:** Use the rubrics above to assign points (0–39 total). Threshold for "competent": ≥29 points (74%).

2. **Update the LEARNER_PROFILE:**
   ```
   LEARNER_PROFILE — Arvin
   ───────────────────────────────────────────
   L03 Completion: [date]
   Quiz Score: [X]/39
   Weak Areas: [list any L4/L5 questions with <50% of points]
   Next Lesson: L04 (Strength Curve Implementation)
   
   Notes from this session:
   - Mastered L2 (Epley, log-normal): ___/10
   - Good on L3 (factor calculation): ___/6
   - Needed help on L4 (v1/v2 comparison): quiz Q4 = ___/7
   - Strong evaluation skills: quiz Q5/Q6 = ___/16
   - Recommend revisiting v1 bug and calibration process before L04
   ```

3. **Schedule spacing reviews (M14):**
   - If score ≥29: Schedule L03 review in 3 days (worked examples, v1 vs. v2)
   - If score <29: Schedule L03 review in 1 day (re-read Concept 4 and 5), then test again in 3 days
   - Final L03 review scheduled 2 weeks after initial completion (before L04)

4. **Offer to schedule L04 (M5/M14 spacing):**
   - L04 (relational modeling) moves from the math to how it's stored. Suggest scheduling it a few days out so the spacing effect kicks in.
   - Queue the two carry-over retrieval questions L04 should open with (see L04 §3).

---

## Summary of Domain Math

This lesson covered the quantitative framework underlying Peak Fettle's percentile ranking:

1. **Epley formula:** Converts reps/weight into 1RM-equivalent; valid for 2–12 reps
2. **Log-normal distribution:** Right-skewed strength data; log transform yields Gaussian
3. **Four factors:** Bodyweight (allometric α=0.667), age (piecewise linear, 23–35 peak), training experience (exponential kinetics, f₀ varies per lift), lift type (μ, σ from vector)
4. **Lift inheritance:** Accessories modeled as scaled versions of parent lifts (front squat = 0.85 × back squat)
5. **Calibration and v2 fix:** V1 bug (asymptote was intermediate standard); v2 fixes by deriving μ and f₀ from two calibration anchors
6. **Gamified scoring:** 0–1000 saturating-exponential score, `1000 × (1 − exp(−0.00916 × e1rm))` (≈600 at 100 kg), for fast early wins and a ceiling that's never maxed

All math is grounded in production code. The next lesson (L04) covers how these equations are implemented in C++ and SQL.

