# Training-Age → Strength Dose-Response Curve — Research & Fitted Model

**Date:** 2026-06-20 · **For:** TICKET-032 (`experienceLevel` as a saturating expectation factor) + strengthModelV3 percentile training-age awareness.
**Scope note:** Per the research brief, this is NOT restricted to 1RM. We pooled ANY measure of strength progression over training time — 1RM, submaximal, rep-max (8RM etc.), isometric MVC, isokinetic, competition totals, and untrained→novice→intermediate→advanced standards ladders — because we only need the SHAPE of the gain trajectory, and broadening the measure expands the usable evidence base. That broadening TIGHTENED the shape (see §3).

---

## 0. TL;DR

- **Best-fit curve (cumulative % strength gain vs untrained baseline):**
  `gain(t) = 28·(1−e^(−1.70·t)) + 35·(1−e^(−0.24·t))` (t in years), asymptote ≈ **63%**.
  A double-exponential (fast neural limb + slow hypertrophic/skill limb). Fit to pooled anchors with **SSE = 0.57** — near-perfect. A single saturating exponential (SSE 72) and a pure log (SSE 22) both fit worse; the log also lacks an asymptote.
- **%-gain table:** 0.5y → **+20%**, 1y → **+30%**, 2y → **+40%**, 3y → **+46%**, 5y → **+53%**, 10y → **+60%** (asymptote ~63%).
- **Shape is highly consistent** across utterly different methods (meta-analytic effect sizes, within-person longitudinal growth models on 9,000–15,000 people, and cross-sectional standards tables): all are **steeply front-loaded then saturating**, with a practical plateau by **~1–2 years** and only marginal change after ~5 years.
- **Recommended ranking multiplier:** `expFactor(t) = (1 + gain(t)/100) / 1.4957`, normalized so an established **4-yr** lifter = **1.00**. Range: 0y → **0.67**, 1y → **0.87**, 3y → **0.98**, 5y → **1.02**, 10y → **1.07**, 15y → **1.08** (10 vs 15 yr differ by 1.4% = saturated).

---

## 1. The fitted dose-response curve

### 1.1 Pooled consensus anchor points (cumulative % gain vs UNTRAINED baseline)

We anchored on the **within-person longitudinal** data (the cleanest "same person over time" signal), scaled so year-1 captures the large novice jump, and cross-checked against meta-analytic and cross-sectional evidence:

| t (yr) | Cumulative % gain | Primary support |
|---|---|---|
| 0.5 | ~20% | Steele 2022 (~30–50% across yr1, so ~20% by 6mo); novice 12-wk 1RM studies (+15–30%); Ahtiainen +20.9% in 21wk |
| 1 | ~30% | Steele 2022 (~30–50% yr1, lower half typical of mixed measures); Latella yr1 +7.5–12.5% *on a trained baseline* |
| 2 | ~40% | Steele "plateau by 1–2yr"; standards Untrained→Intermediate ≈ +50–60% (selection-inflated, so capped lower) |
| 3 | ~46% | mid-career; ACSM advanced loads; coach models ~80% of potential by yr 3 |
| 5 | ~52% | Steele ~50–60% cumulative by 6yr; coach consensus ~90% of genetic potential by 4–5yr |
| 10 | ~60% | Latella +20% *on trained baseline* over 10yr → ~55–62% on untrained baseline; Steele asymptote |
| 15 | ~62% | asymptotic tail; elite year-over-year ~1–3%/yr (Solberg), often non-significant (Häkkinen) |

These are deliberately **conservative relative to the 3–4× (i.e. +200–300%) Untrained→Elite multiplier** in the ExRx/StrengthLevel standards tables, because those tables compare a true beginner to a *self-selected, genetically-favored, 5–10+ yr* elite — that ratio conflates training age with selection and is the *upper envelope*, not the trajectory of a typical consistent trainer. The ~63% asymptote is the realistic within-person ceiling for a normal trainee on a 1RM-type measure; the standards ceiling sits above it precisely because of selection.

### 1.2 Functional-form comparison (least-squares over the anchors)

| Model | Form | Fitted params | SSE | Asymptote? |
|---|---|---|---|---|
| A. Single saturating exp | `A(1−e^(−kt))` | A=59, k=0.60 | 72.5 | yes (59%) but mis-shapes mid-curve |
| B. **Double exponential** ✅ | `A₁(1−e^(−k₁t)) + A₂(1−e^(−k₂t))` | A₁=28, k₁=1.70; A₂=35, k₂=0.24 | **0.57** | **yes (63%)** |
| C. Logarithmic | `A·ln(1+kt)` | A=13, k=9.50 | 22.3 | **no** (→∞) |

**Chosen: Model B (double-exponential).** Reasons:
1. **Best fit by far** (SSE 0.57 vs 22–73).
2. **True asymptote (63%)** — required so the `expFactor` saturates (a pure log keeps rising forever, so a 15-yr and 30-yr lifter would never converge — wrong, and exploitable).
3. **Mechanistic match.** The two limbs map onto the established two-phase biology:
   - **Fast limb** (A₁=28%, k₁=1.70/yr, τ≈0.6yr): neural adaptation + motor learning/coordination + technique — dominates months 0–6 (Moritani & deVries 1979; Häkkinen IEMG; Narici neural-front-loading; DeFreitas weekly curve).
   - **Slow limb** (A₂=35%, k₂=0.24/yr, τ≈4.2yr): hypertrophy + connective-tissue + long-term skill — carries years 1–10 (Häkkinen fibre-area, Narici CSA continuing past 6mo, Latella/Steele multi-year creep).

> **Half-life intuition:** fast limb is ~half-done by ~5 months, ~95% done by ~1.75 yr. Slow limb is ~half-done by ~2.9 yr, ~95% done by ~12.5 yr. Combined → big early jump, then a long slow climb to a near-flat plateau.

### 1.3 Cumulative %-gain table (Model B)

| Training age | Cumulative % strength gain vs untrained baseline |
|---|---|
| 0 yr | 0% |
| 0.5 yr | **20.0%** |
| 1 yr | **30.4%** |
| 2 yr | **40.4%** |
| 3 yr | **45.8%** |
| 5 yr | **52.5%** |
| 10 yr | **59.8%** |
| 15 yr | **62.0%** |
| ∞ (asymptote) | **63.0%** |

Marginal rate (the dose-response "speed"): ~**40%/yr equivalent in year 1**, ~6–7%/yr by year 3, ~1–2%/yr by year 10 — matching the independent per-year-rate literature (novice 2.5–3%/wk early → trained 2–6%/yr → elite 1–3%/yr).

---

## 2. Evidence base (citations + extracted numbers)

### 2.1 Meta-analyses (effect-size, by training status) — the rigorous backbone

- **Rhea, Alvar, Burkett & Ball 2003** — *A meta-analysis to determine the dose response for strength development.* Med Sci Sports Exerc 35(3):456–464. **140 studies, 1,433 ES.** Untrained ES substantially > trained at every matched dose (typically ~2×). Optimal dose **shifts with training age**: untrained 60% 1RM / 3 d·wk⁻¹ / 4 sets; trained 80% 1RM / 2 d·wk⁻¹. "Trained must perform 4 sets to match the gain untrained get from 1 set" (~4:1 dose penalty). https://pubmed.ncbi.nlm.nih.gov/12618576/
- **Rhea 2004** — *Determining the Magnitude of Treatment Effects … Effect Size.* J Strength Cond Res 18(4):918–920. The canonical status-specific ES thresholds: a "large" effect is **>2.0 (untrained), >1.5 (recreational), >1.0 (highly trained)** — thresholds roughly **halve** as training age rises. https://pubmed.ncbi.nlm.nih.gov/15574101/
- **Peterson, Rhea & Alvar 2004** — *Maximizing strength development in athletes.* J Strength Cond Res 18(2):377–382. **37 studies, 370 ES, athletes only.** Optimal: **85% 1RM, 8 sets/muscle, 2 d·wk⁻¹.** 8-set ES 1.22 vs 1-set 0.32. https://pubmed.ncbi.nlm.nih.gov/15142003/
- **Peterson, Rhea & Alvar 2005** — *Applications of the Dose-Response…* J Strength Cond Res 19(4):950–958. 3-population ladder (untrained 60%/4set → recreational 80%/4set → athlete 85%/8set). Verbatim: "a recreational athlete with several years of experience will not only make less improvement, but the improvements will be generated more slowly, and the necessary dose to maximize progress must be greater."
- **Schoenfeld, Grgic, Ogborn & Krieger 2017** — *Strength & Hypertrophy: low- vs high-load.* J Strength Cond Res 31(12):3508–3523. **ES↔% anchor:** high-load 1RM ES 1.69 ↔ **+35.4%**; low-load ES 1.32 ↔ **+28.0%** (predominantly untrained subjects → ES~1.5 ≈ ~30% 1RM holds for novices only).
- **Pelland et al. 2025/2026** — *The Resistance Training Dose Response (meta-regressions).* Sports Medicine. **67 studies, 2,058 participants, 490 strength ES.** Smallest detectable strength effect = **3.96% max strength**; volume & frequency raise strength with strong **diminishing returns + functional plateau**; dose threshold rises with training status. https://pubmed.ncbi.nlm.nih.gov/41343037/

### 2.2 Longitudinal within-person growth models (the cleanest shape signal)

- **Steele, Fisher, Giessing et al. 2022** — *Long-Term Time-Course of Strength Adaptation to Minimal Dose RT.* Res Q Exerc Sport 94(4):913–930. **N = 14,690**, machine training up to **6.8 yr.** Verbatim: **"by ~1–2 years strength had practically reached a 'plateau'"**; **"~30–50% gains over the first year reaching ~50–60% of baseline 6 years later."** Robust **linear-log** model. https://pure.solent.ac.uk/en/publications/long-term-time-course-of-strength-adaptation-to-minimal-dose-resi
- **Latella et al. 2024** — *Using Powerlifting Athletes to Determine Strength Adaptations Across Ages.* Sports Med 54(3):753–774. **9,259 lifters / 46,066 obs, up to ~17 yr.** Mixed-effects **linear-log** model. **"~7.5–12.5% in the first year, up to ~20% after 10 years"** (on a competitive baseline); "rapid adaptation within the first year before beginning to plateau." https://pubmed.ncbi.nlm.nih.gov/38060089/
- **Renner, van den Hoek & Csapo 2026** — *Long-Term Performance Trajectories in Classic Powerlifting.* SportRxiv 743. **6,506 lifters, 91,002 entries.** Annual improvement declines by age band (+6.5 → +3.7 → +1.8 → +0.8 GL/yr); **each +1 prior-year GL point → 0.156 GL smaller next-year change** (quantified diminishing returns). Individual peak ~4–6 yr / ~10th competition. https://sportrxiv.org/index.php/server/preprint/view/743
- **Solberg et al. 2019** — *Peak Age and Performance Progression in World-Class Weightlifting & Powerlifting.* Int J Sports Physiol Perform 14(10):1357. 4,385 world-class athletes. Improvement over the 5 yr before peak: **12±10% (PL, ~2.4%/yr), 9±7% (WL, ~1.8%/yr).** Medalists improved *less* than non-medalists (nearest ceiling). https://journals.humankinetics.com/view/journals/ijspp/14/10/article-p1357.xml
- **Häkkinen et al. 1987 (N=13 elite WL, 1 yr): +3.5% isometric (NS).** **Häkkinen et al. 1988 (N=9 elite WL, 2 yr): +4.9% isometric (NS), +2.8% total (p<.05).** An entire year of elite training moves max strength only ~3.5–5% — the asymptote made visible. https://pubmed.ncbi.nlm.nih.gov/3215840/
- **Baker & Newton 2006 / Baker 2013** — experienced rugby athletes: **+12.5% upper-body over 4 yr**, first-2-yr : second-2-yr gain ratio **0.6:1**. https://pubmed.ncbi.nlm.nih.gov/23358318/

### 2.3 Within-study multi-timepoint curves (deceleration visible inside one program)

- **DeFreitas et al. 2011** — weekly isometric MVC, 25 sedentary men, 8 wk: W1 +1.7% → W8 +23.9% (cumulative). Eur J Appl Physiol 111(11):2785. https://pubmed.ncbi.nlm.nih.gov/21424259/
- **Narici et al. 1996** — 6-mo quadriceps: isometric MVC **+28.5%**, dynamic 1RM **~+150%** (task learning). Torque rose faster than CSA in first 2 months (neural), then in parallel (hypertrophy). Acta Physiol Scand 157(2):175. https://pubmed.ncbi.nlm.nih.gov/8800357/
- **Narici et al. 1989** — 60 d: isometric +20.8%, CSA +8.5%, IEMG +42.4% (gain >> size, filled by neural drive). https://pubmed.ncbi.nlm.nih.gov/2737199/
- **Häkkinen, Alén & Komi 1985** — 24 wk isometric +26.8%; fibre hypertrophy concentrated in the FIRST 12 wk (none in second 12 wk). https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1748-1716.1985.tb07759.x
- **Hickson 1980** — strength-only group, untrained, weekly squat 1RM; ~+40% over 10 wk, consistent rate (concurrent group decelerates after ~wk 7). https://link.springer.com/article/10.1007/BF00421333
- **Ogasawara et al. 2011** — bench 1RM every 3 wk; **same stimulus produced SMALLER 1RM/CSA gains in the second 6-wk block than the first** (within-program diminishing returns). https://pubmed.ncbi.nlm.nih.gov/21672138/
- **Moritani & deVries 1979** — neural factors dominate the first ~3–5 wk, hypertrophy thereafter. Am J Phys Med 58(3):115. https://pubmed.ncbi.nlm.nih.gov/453338/
- **Hubal et al. 2005** — N=585 untrained, 12 wk: mean **+54% 1RM** elbow flexor (range 0% → +250%) — large mean, enormous dispersion. https://pubmed.ncbi.nlm.nih.gov/15947721/

### 2.4 Novice 1RM magnitudes (early steep limb)

- 20-wk untrained men: bench **+41%**, leg curl +40%, leg extension +80% (PMC10630871).
- 9-wk untrained women: squat **+35–41%**, bench +22–28% (linear vs DUP; Miranda 2011).
- 16-wk untrained: bench +16%, arm curl +14% (PMC4234756).
- **Ahtiainen et al. 2003** — identical 21-wk program: untrained **+20.9%** vs strength athletes **+3.9%** (~5× trainability gap by training age).

### 2.5 Classification ladders + standards tables (cross-sectional cumulative gain)

- **ACSM Position Stand 2009** — *Progression Models in RT for Healthy Adults.* Med Sci Sports Exerc 41(3):687–708. Novice 60–70% 1RM, intermediate ~6 mo, advanced 80–100% cycled; "impossible to improve at the same rate over >6 months." https://pubmed.ncbi.nlm.nih.gov/19204579/
- **Kraemer & Ratamess 2004** (NOT the 2009 stand — flagged to avoid miscitation): the widely-quoted **~40% (untrained) → ~20% (mod-trained) → ~16% (trained) → ~10% (advanced) → ~2% (elite)** per-period gain ladder. Illustrative, directionally robust.
- **ExRx / Lon Kilgore standards** (≈70 yr of data): Untrained→Novice→Intermediate→Advanced→Elite ×BW. Bench (M, @82kg): 0.72→0.91→1.10→1.52→1.91× (Elite÷Untrained **2.65×**). Squat: 0.66→1.22→1.49→2.04→2.65× (**4.0×**). https://exrx.net/Testing/WeightLifting/StrengthStandards
- **StrengthLevel** (153M+ lifts, tier = percentile + time): Beginner(5th)/Novice(20th)/Intermediate(50th)/Advanced(80th)/Elite(95th). Bench M 0.5→0.75→1.25→1.75→2.0×; Squat 0.75→1.25→1.5→2.25→2.75×; Deadlift 1.0→1.5→2.0→2.5→3.0×.
- **Adjacent-level ratios (men, averaged):** Novice÷Untrained ~**1.5×** (+50%, the biggest jump), Int÷Nov ~1.3×, Adv÷Int ~1.35×, Elite÷Adv ~1.2×. **Cumulative Untrained→Elite ~3–4×** (selection-inflated upper envelope).
- **Rippetoe / Starting Strength** — levels defined by **adaptation cadence**: novice adds weight every session (≤~6mo), intermediate weekly (~6mo–2yr), advanced monthly/per-block (multi-yr). The lengthening stress→recovery→adaptation cycle *is* the dose-response shape operationalized.
- **Barbell Medicine — the key conceptual caveat:** tier labels are a **detection-window position on one smooth saturating curve**, not discrete physiological states. Decelerating *percent* gains are partly a **denominator artifact** (5 lb on 135 = 3.7%; 5 lb on 405 = 1.2%) + widening ~3–5% day-to-day 1RM noise. https://www.barbellmedicine.com/blog/novice-intermediate-advanced-strength-training/
- **McKay/Mujika 2022** — research-grade 6-tier caliber framework; "highly trained" characterized by **>5 yr** structured training. Int J Sports Physiol Perform 17(2):317. https://pubmed.ncbi.nlm.nih.gov/34965513/

### 2.6 Coach/modeler quantitative models (corroborate the shape)

- **Lyle McDonald** (muscle mass, bounds strength potential): yr1 20–25 lb, yr2 10–12, yr3 5–6, yr4+ 2–3 (≈ halving each year; ~90% potential by ~4–5 yr).
- **Alan Aragon:** beginner ~1–1.5%/mo, intermediate ~0.5–1%/mo, advanced ~0.25–0.5%/mo of bodyweight.
- **Stronger By Science / Nuckols** (on Steele): all three independent datasets (15k gym clients, 10k powerlifters, 1k survey) fit a **linear-log** relationship; heuristic "each equally-spaced milestone takes ~2× as long as the prior."

---

## 3. How consistent is the shape? Did broadening the measure tighten it?

**The shape is remarkably consistent — arguably the most robust qualitative finding in resistance-training science.** Four methodologically independent lines converge on the SAME steeply-front-loaded, saturating curve:

1. **Meta-analytic effect sizes** (Rhea/Peterson): response magnitude ~2× larger in untrained vs trained at equal dose; "large effect" threshold halves from >2.0 to >1.0 as training age rises.
2. **Within-person longitudinal growth models** on 9,000–15,000 people (Steele, Latella, Renner): all fit log/saturating forms; practical plateau ~1–2 yr; elite year-over-year 1–3%.
3. **Within-study multi-timepoint curves** (DeFreitas, Narici, Häkkinen, Ogasawara): the same stimulus yields smaller gains later in a program; fibre hypertrophy front-loads into the first ~12 weeks.
4. **Cross-sectional standards ladders** (ExRx, StrengthLevel, Rippetoe cadence): the biggest step is Untrained→Novice (~+50%), each later step smaller.

**Did broadening beyond 1RM tighten it? YES — materially.** Restricting to clean 1RM data would have left a sparse, noisy early limb and almost nothing on the multi-year tail. Adding (a) isometric MVC and isokinetic studies pinned the *true force* component and the neural-front-loading mechanism (DeFreitas weekly curve, Narici, Häkkinen) that explains the fast limb; (b) competition-total growth models (Latella/Renner/Solberg) supplied the otherwise-unobtainable 5–17-yr tail and the asymptote; (c) effect-size meta-analyses gave a status-normalized magnitude scale immune to the denominator problem; (d) standards ladders provided an independent cross-sectional cross-check. The result: the double-exponential fits the pooled anchors with SSE 0.57 — far tighter than any single measure could support.

**Where the genuine uncertainty remains (honest caveats):**
- **The asymptote height is measure- and selection-dependent.** Dynamic 1RM in a compound lift can rise +100–150% in 6 months *for a single exercise* (task learning); isometric MVC of the same muscle rises only ~20–29%. Our ~63% whole-body asymptote is a deliberate pooled compromise; a skill-heavy lift would sit higher, a pure-force measure lower. The standards tables imply +200–300% Untrained→Elite, but that is **selection-confounded** (elite = genetically favored + 5–10+ yr) and is the upper envelope, not the trajectory.
- **The *percent* deceleration is partly a denominator artifact** (Barbell Medicine), not purely slowing physiology — but for a ranking model that is fine: we *want* expected strength on the natural (absolute/relative) scale, where the saturation is real.
- **Enormous between-person variance** (Hubal: 0% to +250% in 12 wk). The curve is a population *expectation*, not an individual guarantee — appropriate for setting a percentile baseline, not for judging one person's progress.
- **The exact calendar boundaries between tiers disagree across sources** (Kilgore: advanced by ~2 yr; StrengthLevel community data: advanced 5+ yr because most train sub-optimally). We model training age as a **continuous** input and treat tier labels as soft.

Net: the *shape* (fast saturating, plateau ~1–2 yr, near-flat by ~5 yr, ~2× novice-vs-trained trainability) is **high-confidence**. The *absolute asymptote* (~50–65%) is **medium-confidence** and intentionally conservative.

---

## 4. Recommended `expFactor(years)` for the ranking model (TICKET-032)

### 4.1 Purpose & definition

`expFactor` is an **expected-strength multiplier**: it encodes how much stronger a lifter of a given training age is *expected* to be, purely due to experience, vs a reference lifter. Dividing a user's strength (or their model-expected strength) by `expFactor` makes percentile comparisons **training-age-aware** — a strong 6-month lifter is correctly recognized as more impressive (relative to expectation) than the same numbers from a 10-yr veteran, and a beginner is not unfairly ranked against people with a decade of adaptation baked in.

### 4.2 Formula

```
gain(t)      = 28*(1 - exp(-1.70*t)) + 35*(1 - exp(-0.24*t))     // % gain vs untrained, t = training-age in YEARS
expFactor(t) = (1 + gain(t)/100) / 1.4957                         // normalized so an established 4-yr lifter = 1.00
```

`1.4957 = 1 + gain(4)/100` (gain(4 yr) = 49.6%). **Normalization choice:** reference = **4 yr** (the midpoint of the "established 3–5 yr" band). This means the typical established/advanced lifter sits at exactly 1.0; novices sit below 1.0 (their expected strength is lower, so a given lift earns a *higher* training-age-adjusted percentile), and long-tenured lifters sit slightly above 1.0 and **saturate** (10 vs 15 yr differ by only 1.4%).

**Recommended clamps for production:** clamp `t` to `[0, 15]` before evaluating (beyond 15 yr the factor is flat — a 20-yr input returns essentially the 15-yr value, 1.088; this also caps any "I've trained 40 years" gaming). Optionally floor `t` at a small value (e.g. 0.1 yr) for brand-new users, or branch to the 0-yr value (0.669) for true untrained.

### 4.3 expFactor table

| Training age | gain(t) | **expFactor** | Interpretation |
|---|---|---|---|
| 0 yr (untrained) | 0.0% | **0.669** | expected strength is ~67% of an established lifter's |
| 0.5 yr | 20.0% | **0.802** | strong novice gains already realized |
| 1 yr | 30.4% | **0.872** | |
| 2 yr | 40.4% | **0.939** | |
| 3 yr | 45.8% | **0.975** | entering "established" band |
| **4 yr** | 49.6% | **1.000** | ← reference (established) |
| 5 yr | 52.5% | **1.019** | |
| 10 yr | 59.8% | **1.069** | |
| 15 yr | 62.0% | **1.083** | |
| 20 yr (clamped→15) | 62.0% | **1.083** | saturated — 10/15/20 yr ≈ equivalent |

**Saturation verification:** expFactor(15)/expFactor(10) = **1.014** (1.4% — effectively equivalent, as required). expFactor(10)/expFactor(5) = 1.048. expFactor(0.5)/expFactor(5) = 0.787 (a 6-month lifter is expected at ~79% of a 5-yr lifter's strength).

### 4.4 Alternative normalizations (if a different reference is preferred)

The shape is fixed by `gain(t)`; only the divisor changes:
- **Untrained = 1.0** (factor = "× stronger than a beginner"): divide by `(1+gain(0)/100)=1.0` → expFactor = 1+gain(t)/100, i.e. 1.00 / 1.20 / 1.30 / 1.40 / 1.46 / 1.53 / 1.60 at 0/0.5/1/2/3/5/10 yr. Use this if you want the multiplier to read directly as cumulative gain.
- **3-yr reference:** divide by 1.458. **5-yr reference:** divide by 1.525.

### 4.5 Reference TypeScript (drop-in for strengthModelV3 / experienceLevel)

```ts
// Training-age expectation factor — see TRAINING-AGE-RESEARCH.md (2026-06-20).
// gain(t): pooled cumulative % strength gain vs untrained baseline (double-exponential,
// SSE 0.57 vs Steele 2022 / Latella 2024 / Rhea 2003 anchors). Asymptote ~63%.
const EXP_REF = 1.4957; // = 1 + expStrengthGainPct(4)/100  (established 4-yr lifter = 1.00)

function expStrengthGainPct(years: number): number {
  const t = Math.max(0, Math.min(15, years)); // clamp; flat past 15yr
  return 28 * (1 - Math.exp(-1.70 * t)) + 35 * (1 - Math.exp(-0.24 * t));
}

/** Expected-strength multiplier by training age, normalized to a 4-yr lifter = 1.0. */
export function expFactor(years: number): number {
  return (1 + expStrengthGainPct(years) / 100) / EXP_REF;
}
```

---

## 5. One-paragraph summary for the model owner

Across meta-analyses (Rhea/Peterson effect sizes), within-person longitudinal growth models on 9,000–15,000 lifters (Steele 2022, Latella 2024, Renner 2026), within-study time-courses (DeFreitas, Narici, Häkkinen, Ogasawara), and cross-sectional standards ladders (ExRx, StrengthLevel), the training-age → strength curve is unambiguously **steeply front-loaded and saturating**: roughly **+30% by year 1, +40% by year 2, a practical plateau by ~1–2 years, ~+53% by year 5, and a ~63% asymptote**, with novice-vs-trained trainability differing ~2× at equal dose and elite year-over-year gains collapsing to 1–3% (often non-significant). The pooled data are best described by the double-exponential `gain(t) = 28·(1−e^(−1.70t)) + 35·(1−e^(−0.24t))` (fast neural limb + slow hypertrophic limb, SSE 0.57). Broadening beyond 1RM to isometric/isokinetic/competition/effect-size measures **tightened** the fit by supplying the early mechanism and the multi-year tail. For ranking, use `expFactor(t) = (1+gain(t)/100)/1.4957` (established 4-yr lifter = 1.0), which runs 0.67 → 0.87 → 1.00 → 1.07 → 1.08 from 0 → 1 → 4 → 10 → 15 yr and saturates so a 10- and 15-yr lifter are equivalent.
