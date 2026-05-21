# Percentile System — Executive Design Decisions

**Session:** CEO × CTO Working Session
**Date:** 2026-05-10
**Topic:** Competitive Percentile Calculation — Design Options, Steel-Manned Arguments, and Final Calls

The INSTRUCTIONS.md establishes that percentiles account for age, gender (with unisex opt-out), and years in sport. Five unresolved design decisions sit beneath that description. This document works through each one.

---

## Decision 1: Cohort Segmentation Variables

*What dimensions carve the population into the cohort a user is ranked against?*

The spec names three: age, gender, years in sport. The question is whether these three are sufficient, or whether body weight and discipline sub-type need to be added.

### Option A — Three Variables Only (Age + Gender + Years in Sport)

**Steel man:** Simple cohorts are large cohorts. The statistical validity of a percentile depends on having enough people in the bucket. If you segment by five variables, a 34-year-old woman with 4 years of powerlifting experience at 72kg has maybe 12 people in her cohort — that's not a percentile, it's a leaderboard. Three variables keeps cohorts meaningful in size, especially in the early user base. It also keeps the UX explanation clean: users understand "people your age, your gender, your experience level." Body weight as a variable invites body image sensitivity and opens the door to gaming (cut weight to move into a lighter class). The three-variable design is defensible, comprehensible, and survivable at low scale.

### Option B — Five Variables (Add Body Weight + Discipline Sub-Type)

**Steel man:** Comparing a 60kg lifter to a 110kg lifter on raw performance is scientifically meaningless — the entire purpose of Wilks and DOTS is to normalize for body weight. If you're already using a weight-normalized score, you don't need body weight as a cohort variable; it's already baked into the formula. But discipline sub-type matters enormously: a runner's percentile shouldn't fold in cyclists. A powerlifter's percentile shouldn't pool with general gym-goers doing curls. The data will be cleaner and the rankings more credible with discipline sub-typing, even at the cost of smaller cohort sizes. Users will trust a ranking more if they know it's comparing like to like.

### Option C — Dynamic Cohort (ML-determined similarity)

**Steel man:** The three-variable model is a heuristic. A machine learning model trained on user data would find the actual clusters of comparable athletes — which might cut by consistency patterns, session frequency, and performance trajectory rather than just demographics. This is how Spotify makes playlists that feel impossibly personal. It future-proofs the system against rigid demographic categories. The tradeoff is that users can't understand why they're in their cohort, which hurts trust. But many users don't need to understand the algorithm — they just need to feel the result is fair.

---

### **CEO Decision on Cohort Segmentation:**

Launch with **Option A (three variables)** plus discipline sub-type from Option B. Body weight is excluded from cohort definition because Wilks/DOTS already accounts for it in the score; including it in the cohort on top of that would double-count it. Discipline sub-type is non-negotiable — a runner and a powerlifter should never share a percentile.

**Final cohort dimensions at launch:** Age bracket · Gender scale · Years in sport · Primary discipline.

Option C (ML cohorts) is added to the post-launch research backlog for evaluation once we have 50,000+ users.

---

## Decision 2: Strength Scoring Formula

*When ranking lifters, which formula normalizes their performance for comparison across body sizes?*

The spec offers three: Wilks, DOTS, and the proprietary Peak Fettle score. These are not mutually exclusive display options — the question is which one drives the percentile ranking itself.

### Option A — Wilks

**Steel man:** Wilks is the lingua franca of powerlifting. Every serious lifter knows their Wilks score. Using it for ranking signals that Peak Fettle has done its homework and respects the existing culture. Marcus (competitive lifter) will trust a Wilks-based ranking immediately. It is a well-understood, published formula — there is nothing to defend or explain. The community has used it for decades.

### Option B — DOTS

**Steel man:** DOTS was developed specifically to address the known weaknesses in Wilks — it is more accurate across the full spectrum of body weights, particularly for lighter and heavier athletes where Wilks over- or under-rewards. The International Powerlifting Federation has moved toward DOTS. Using DOTS is a forward-looking signal that Peak Fettle tracks the science rather than tradition. For a new product competing against old tools, being technically superior is a product differentiator, not a risk.

### Option C — Proprietary Peak Fettle Score

**Steel man:** Wilks and DOTS are single-session performance metrics. They measure "how strong are you today relative to your body weight?" Peak Fettle's thesis is that consistency is the most critical factor in fitness progress. A score that factors in volume, progressive overload, and consistency over time is measuring something Wilks and DOTS cannot — sustainable improvement. This is the most defensible moat. No competitor has this. A beginner who shows up three times a week and adds weight consistently will rank better on this metric than a stronger but inconsistent lifter, which is exactly the behavior we want to reward. It also makes the percentile system meaningful to non-competitive gym-goers who would never care about Wilks at all.

---

### **CTO Decision on Strength Scoring Formula:**

**DOTS for the underlying ranking formula (Option B).** The technical argument for DOTS over Wilks is sound, and it's where the federation is moving. Using Wilks would be defending a legacy choice. We do not define the percentile ranking on the proprietary score because that makes the ranking non-auditable and creates a trust problem with sophisticated users.

**However:** Users can select their display format independently — Wilks, DOTS, or Peak Fettle Score — as a settings preference. The percentile rank itself is always DOTS-based. The Peak Fettle Score is surfaced prominently in the personal dashboard as the consistency/progress metric, not as the competition metric. These serve different psychological functions and should not be conflated.

---

## Decision 3: Experience Stratification Method

*How do we define and assign "years in sport" to create experience-level cohorts?*

### Option A — Self-Reported, Fixed Buckets

**Steel man:** The simplest possible system. During onboarding, ask: "How long have you been training seriously?" and offer four brackets: Less than 1 year · 1–3 years · 3–7 years · 7+ years. Users self-select. No inference, no algorithm, no privacy concern. The UX is a single question. The bands are wide enough to accommodate honest uncertainty ("I've been on-and-off for 2 years" fits cleanly into 1–3). It also respects the user's self-perception, which matters for motivation.

**Weakness:** Gameable. Users who want to rank higher will understate experience.

### Option B — Inferred from Logged Performance Data

**Steel man:** After a user logs several sessions, the system can estimate their experience level from performance curves, exercise selection, and volume patterns. A beginner making linear progress on compound lifts looks statistically different from a 5-year lifter in a plateau. Inferring experience from data prevents gaming and produces a more accurate cohort assignment without burdening the user with a survey. Over time, the inferred level can update — if a self-reported "beginner" logs 3 years of consistent data, they graduate to the next cohort automatically.

**Weakness:** Requires weeks of data before cohort assignment is meaningful. New users get a placeholder cohort.

### Option C — Hybrid (Self-Report at Onboarding, Infer After Sufficient Data)

**Steel man:** Self-reporting gets the user into a reasonable cohort immediately, satisfying the Day 1 experience. After 90 days of logged data, the system silently validates or adjusts the cohort assignment using inferred patterns. If the inferred cohort differs, the user is notified with a friendly explanation: "Based on your logged progress, we've moved you into the intermediate cohort. Your percentile reflects people with 1–3 years of experience — you're ranking against stronger competition." This framing is motivating, not penalizing. The hybrid model gives immediate UX value and long-term data integrity.

---

### **CEO Decision on Experience Stratification:**

**Option C — Hybrid.** Self-report at onboarding, infer after 90 days. The cohort promotion message ("you've leveled up") is a retention event and should be treated as such — push notification, in-app celebration, the works. The CTO must flag if 90-day recalculation is computationally expensive at scale; if so, run it as a background batch job weekly rather than continuously.

---

## Decision 4: Population Data Bootstrapping

*How do we display meaningful percentiles when the user base is small at launch?*

This is the cold start problem. If we have 500 users at launch, many cohorts will have fewer than 20 people. A percentile from 20 data points is statistically meaningless and potentially demotivating (if you're the only one in your cohort, you're either 1st or last).

### Option A — Use External Reference Data

**Steel man:** Published powerlifting federation results (IPF, USPA, Open Powerlifting database) give us hundreds of thousands of real performance data points across age, gender, and weight class. For running, official race results (marathons, half-marathons, Parkrun) are publicly available and similarly voluminous. We import this data as the initial population and normalize it into our scoring system. Users are immediately ranked against a realistic distribution. The data is real, the percentiles are valid on Day 1, and the system doesn't break during the low-user period.

**Weakness:** External data skews toward competitive/self-selected athletes. Race finishers and federation lifters are not representative of the casual gym population. A casual user could rank at the 12th percentile against a population of serious competitors and disengage.

### Option B — Withold Percentiles Until Sufficient Internal Data

**Steel man:** Don't show a number you can't stand behind. If a percentile is computed from 15 people, display "building your cohort — check back in a few weeks." This is honest and avoids a bad first impression. Users who care about percentiles will wait; users who don't care won't notice. This protects the credibility of the metric long-term.

**Weakness:** Percentiles are a flagship feature and a retention hook. Withholding them during the critical early period when users are deciding whether to keep the app is a significant product risk.

### Option C — Confidence-Scaled Display

**Steel man:** Show the percentile but attach a confidence indicator: a small ring around the percentile display that fills as cohort size grows. At 20 users it's a thin arc; at 200 users it's a full circle. This is honest without withholding the number. Users understand that early rankings are estimates; they feel included in the journey of the platform growing. Add a tooltip: "Your cohort has 23 members. Rankings become more precise as more athletes join." This turns the cold start problem into a community-building narrative.

---

### **CEO Decision on Bootstrapping:**

**Option C — Confidence-Scaled Display, with a hybrid data strategy.**

For strength metrics: import the Open Powerlifting database as a reference population, but clearly label external data points in the cohort. Display: "Your cohort: 8 Peak Fettle users + 1,240 federation athletes." The cohort confidence ring fills only on internal user data. The external data prevents the early user from seeing a nonsense percentile; the transparency prevents mistrust.

For cardio: import publicly available race result datasets per discipline. Same treatment.

The CTO owns the data normalization pipeline to map external data into our scoring system. This is a pre-launch deliverable.

---

## Decision 5: Sex Input and Undisclosed Handling

*Sex is the primary physiological variable driving performance differences across strength and cardio disciplines. This decision covers how we collect it, and how we compute percentiles for users who decline to disclose.*

**Framing correction from prior draft:** This field collects biological sex, not gender identity. Sex is what drives the hormonal and morphological differences that make separate cohort rankings statistically meaningful. The question asked of the user should reflect this directly.

### Option A — Binary Sex Input, Undisclosed Routes to Pooled Unisex

**Steel man:** Ask for sex (Male / Female / Prefer not to say). Users who decline are placed into a combined pool of all users at their age and experience markers. This is the path of least resistance — no novel math required. The unisex pool is a real cohort; the user gets a real percentile.

**Weakness:** The unisex pool is self-selecting: it over-represents users who declined to disclose, which may skew toward a non-representative distribution. Worse, it conflates two physiologically distinct populations into one number, which is statistically noisy and produces a percentile that doesn't correspond meaningfully to either male or female norms. The user gets a number; it's just not a very honest one.

### Option B — Binary Sex Input, Undisclosed Uses Interpolated Midpoint

**Steel man:** Ask for sex (Male / Female / I'd rather not say). For users who decline: rather than pooling them with other undisclosed users, compute their percentile against an expected performance baseline that is the arithmetic midpoint between the male and female expected values at their specific markers — age bracket, experience level, discipline, and body weight where available. 

This is more mathematically principled than a blended pool. At any given set of individual markers, the male and female DOTS distributions have known means and standard deviations. The undisclosed user is evaluated against a synthetic distribution whose mean is `(μ_male + μ_female) / 2` and whose standard deviation is pooled from both. The percentile is real, the math is sound, and no assumption is made about the user's biology. The user is compared to a fair, stable reference — not a self-selected opt-out cohort that fluctuates with whoever happened to decline that week.

**Additional benefit:** This approach is stable. The male and female reference distributions are built from large external datasets (Open Powerlifting, race results). The undisclosed midpoint distribution is therefore computed from a robust population, not from a handful of in-app users who checked "prefer not to say."

### Option C — Binary Sex Input, Undisclosed Gets No Percentile

**Steel man:** If sex is the most important variable in the computation, declining to provide it means the computation genuinely cannot be performed with integrity. Show a message: "Percentiles require a sex selection for accuracy — you can update this at any time in settings." This is fully honest and avoids producing a number that lacks a rigorous basis. Users who care about rankings will provide the input.

**Weakness:** Locks out a user segment on a flagship feature. Creates friction and a negative first impression for users with legitimate reasons to decline. Not viable.

---

### **CEO + CTO Joint Decision on Sex Input:**

**Option B — Binary sex input with interpolated midpoint for undisclosed users.**

The onboarding question reads: *"What is your biological sex?"* with options: **Male · Female · I'd rather not say.**

A brief inline explanation is shown beneath the question: *"We use this to compare you fairly against athletes with similar physiology. It affects your percentile ranking only."*

**Computation for "I'd rather not say" users:**

At each set of individual markers (age bracket, experience level, discipline):
- Pull the male reference distribution: mean `μ_M`, standard deviation `σ_M`
- Pull the female reference distribution: mean `μ_F`, standard deviation `σ_F`
- Compute synthetic midpoint mean: `μ_mid = (μ_M + μ_F) / 2`
- Compute pooled standard deviation: `σ_mid = sqrt((σ_M² + σ_F²) / 2)`
- Score the user's performance against `N(μ_mid, σ_mid)` to derive their percentile

The user sees their percentile with no label indicating the midpoint method was used. If they later disclose sex in settings, their percentile recalculates immediately against the appropriate single-sex distribution. The transition is seamless.

**Data model note (CTO):** Sex is stored as an enum: `MALE | FEMALE | UNDISCLOSED`. It is a ranking computation input, not a demographic profile attribute. It must not appear in any user-facing profile, be exposed via any API response beyond the ranking engine, or be logged in analytics events. Legal must confirm this satisfies applicable data minimization requirements before launch.

---

## Summary of Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Cohort segmentation | Age + Gender + Years in Sport + Discipline. Body weight excluded (baked into DOTS). |
| 2 | Strength scoring formula | DOTS for ranking; Wilks/DOTS/Peak Fettle Score as user-selectable display. |
| 3 | Experience stratification | Hybrid: self-report at onboarding, infer and promote after 90 days of data. |
| 4 | Population bootstrapping | Confidence-scaled display + external data (Open Powerlifting, race results) as reference population, labeled. |
| 5 | Sex input + undisclosed handling | Ask for biological sex (Male / Female / I'd rather not say). Undisclosed users ranked against an interpolated midpoint distribution: `μ_mid = (μ_M + μ_F) / 2`, pooled σ. Sex stored as ranking input only — not a demographic profile field. |

---

## Open Items for Engineering

- **CTO to scope:** External data normalization pipeline (Open Powerlifting import + race result datasets) — must ship before launch.
- **CTO to scope:** 90-day background batch job for cohort recalculation — estimate compute cost at 100k users.
- **CTO to scope:** Confidence ring UI component — needs a data model for "internal cohort size" vs "reference cohort size" per user.
- **CEO to decide:** Whether cohort promotion (experience level graduation) is a push notification event — assume yes, confirm with growth team.
- **Legal review:** Sex data collection and storage policy — ranking computation input only, not a demographic profile field. Confirm data minimization compliance pre-launch.
- **CTO to implement:** Midpoint distribution computation for UNDISCLOSED users — `μ_mid = (μ_M + μ_F) / 2`, pooled σ — sourced from external reference distributions, not from the live undisclosed user pool. Must recalculate to single-sex distribution immediately upon user updating their sex selection in settings.
