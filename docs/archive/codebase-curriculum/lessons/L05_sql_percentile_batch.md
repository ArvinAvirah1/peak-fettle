# L05: SQL Deep Dive — The Percentile Batch Job

**Peak Fettle Codebase Curriculum**  
**Bloom Levels:** L1 (Recall), L2 (Understand), L3 (Apply), L4 (Analyze), L5 (Evaluate)  
**Estimated read time:** 70 minutes  
**Prerequisites:** L01, L02, L03, L04  
**Code sources:** `compute_percentile.sql`, `lift_vectors_seed.sql`, `migrations/20260502_percentile_engine.sql`, `peak-fettle-agents/server/cron/percentile.js`

---

## 0. Why This Matters

Every week, Peak Fettle computes the **percentile rank** for every user's lifts: "You're in the top 15% of squatters your age, weight, and experience level." This ranking doesn't update in real-time as you log sets. Instead, a **batch job** runs weekly, queries all users' lifts, runs math on them, and stores the results in a table.

This lesson teaches you:
- **Aggregation and GROUP BY** — how to summarize data (e.g., "best squat per user").
- **Window functions** — advanced SQL that lets you rank users without a loop.
- **Common Table Expressions (CTEs)** — named subqueries that make complex logic readable.
- **Why batch, not real-time?** — the cost/freshness trade-off.
- **How the math works** — from log-normal distributions to percentiles.

By the end, you'll be able to:
- Read and modify the percentile SQL functions.
- Defend a batch job against a "show me my live rank" product demand.
- Predict how the system scales as you add more users.

---

## 1. Aggregation and GROUP BY

### 1.1 Summarizing Data

The sets table has millions of rows: one per set logged by all users.

```
user_id              | exercise_id           | weight_kg | reps
---------------------+-----------------------+-----------+-----
550e8400-e29b-41d4   | back_squat_uuid       | 100       | 5
550e8400-e29b-41d4   | back_squat_uuid       | 105       | 3
550e8400-e29b-41d4   | bench_press_uuid      | 70        | 8
550e8401-e29b-41d5   | back_squat_uuid       | 120       | 4
550e8401-e29b-41d5   | back_squat_uuid       | 95        | 10
```

**Question:** For each user and exercise, what's their best lift (1-rep max equivalent)?

**Approach 1: Loop in the app.** Fetch all sets, iterate in JavaScript, compute per-user-exercise max. *Slow and memory-intensive.*

**Approach 2: Aggregate in SQL.** Ask the database to summarize.

```sql
SELECT
    user_id,
    exercise_id,
    MAX(
        CASE WHEN reps = 1 THEN weight_kg
             ELSE weight_kg * (1.0 + reps / 30.0)  -- Epley 1RM formula
        END
    ) AS best_one_rm_kg
FROM sets
WHERE kind = 'lift' AND weight_kg > 0
GROUP BY user_id, exercise_id;
```

This groups rows by `(user_id, exercise_id)`, computes the Epley E1RM for each set, and returns the maximum. **Result:** One row per user-exercise pair with the best estimate of their 1-rep max.

### 1.2 GROUP BY Semantics

`GROUP BY` partitions rows into buckets and applies an **aggregate function** to each bucket.

```
Common aggregate functions:
- COUNT(*)           — number of rows
- SUM(column)        — total
- AVG(column)        — average
- MAX(column)        — maximum
- MIN(column)        — minimum
- STRING_AGG(...)    — concatenate strings
- ARRAY_AGG(...)     — collect into an array
```

In the example:
- Bucket 1: All sets by user A for exercise X.
- Bucket 2: All sets by user A for exercise Y.
- Bucket 3: All sets by user B for exercise X.
- etc.

For each bucket, we compute `MAX(epley_one_rm)`.

**Key rule:** If you use `GROUP BY`, every column in the SELECT list must either:
1. Be in the GROUP BY clause, or
2. Be wrapped in an aggregate function.

```sql
-- WRONG
SELECT user_id, exercise_id, weight_kg  -- weight_kg is not aggregated
FROM sets
GROUP BY user_id, exercise_id;

-- RIGHT
SELECT user_id, exercise_id, MAX(weight_kg)
FROM sets
GROUP BY user_id, exercise_id;
```

---

## 2. Window Functions: Computing Ranks Without Loops

### 2.1 Introduction to Window Functions

A **window function** computes a value for each row based on a **window** (a set of related rows).

```sql
SELECT
    user_id,
    exercise_id,
    best_one_rm_kg,
    PERCENT_RANK() OVER (
        PARTITION BY exercise_id
        ORDER BY best_one_rm_kg DESC
    ) AS percentile_rank
FROM v_user_lift_inputs;
```

**What this does:**
1. `PARTITION BY exercise_id` — For each exercise, group the rows.
2. `ORDER BY best_one_rm_kg DESC` — Sort users by their best lift (strongest first).
3. `PERCENT_RANK()` — Compute the percentile rank of each user within their exercise group.

**Example output for back_squat:**

```
user_id              | best_one_rm_kg | percentile_rank
---------------------+----------------+-----------------
550e8400 (strongest) | 200            | 1.0  (100th percentile)
550e8401             | 150            | 0.5  (50th percentile)
550e8402 (weakest)   | 100            | 0.0  (0th percentile)
```

**Key difference from GROUP BY:**
- `GROUP BY` **reduces** rows (one output per group).
- Window functions **preserve** rows (one output per row, but computed within a window).

### 2.2 NTILE: Bucketing into Percentiles

The `NTILE(n)` function divides rows into `n` buckets of roughly equal size.

```sql
SELECT
    user_id,
    exercise_id,
    best_one_rm_kg,
    NTILE(100) OVER (
        PARTITION BY exercise_id
        ORDER BY best_one_rm_kg DESC
    ) AS percentile_bucket
FROM v_user_lift_inputs;
```

This divides users into 100 buckets (1–100 percentile). A user in bucket 75 is in the 75th percentile (stronger than 75% of other users).

### 2.3 ROW_NUMBER vs. PERCENT_RANK vs. NTILE

Three ways to rank:

| Function | Output | Use case |
|----------|--------|----------|
| `ROW_NUMBER()` | 1, 2, 3, ... | "My rank among all users" (no ties). |
| `PERCENT_RANK()` | 0.0 to 1.0 (decimal) | "What fraction of users are weaker than me?" |
| `NTILE(100)` | 1 to 100 (integer buckets) | "Which percentile bucket am I in?" |

Peak Fettle uses **`PERCENT_RANK()`** because it computes exact percentiles (not bucketed), and it handles ties correctly (multiple users with the same lift get the same rank).

---

## 3. The Percentile Batch Job: A Walkthrough

### 3.1 Architecture: Batch, Not Real-Time

**Why batch?**

1. **Cost** — Computing percentiles for one user requires comparing them to *all* other users. Doing this per-request is expensive; once per week is cheap.
2. **Freshness** — "Top 15% this week" is motivating enough. Users don't need millisecond-fresh rankings.
3. **Complexity** — Real-time percentiles require real-time indexes on derived values. Batch jobs are simpler to reason about.

**The trade-off:**

```
Real-time:
  - Pro:  Fresh rank. User logs set → rank updates immediately.
  - Con:  Every set INSERT triggers a re-rank of cohort. Expensive at scale.

Batch (weekly):
  - Pro:  Cheap. One batch job per week. Ranks are stable.
  - Con:  Stale. User's rank may be 2–3 days old.
```

Peak Fettle chose **batch** because:
- Monthly churn is high (many users start/quit). Weekly re-ranking is fair.
- Most users log 1–3 sessions per week. Seeing "top 18%" the next morning is acceptable.
- Database size (months 1–12) is manageable. Real-time wouldn't save much.

### 3.2 The Pipeline

```
1. v_user_lift_inputs view
   ├─ Reads: sets, users, exercises
   └─ Output: user_id, lift_id, sex, bodyweight_kg, age, training_years, best_one_rm_kg

2. compute_percentile() function (SQL)
   ├─ Input: lift_id, sex, bodyweight_kg, age, training_yrs, lift_kg
   ├─ Applies: log-normal distribution model
   └─ Output: percentile [0, 100]

3. compute_percentile_batch() function
   ├─ Calls compute_percentile() for every row in v_user_lift_inputs
   └─ Output: user_id, lift_id, percentile, percentile_simple, computed_at

4. percentile.js (Node.js cron job)
   ├─ Calls compute_percentile_batch()
   ├─ Chunks results into batches of 500
   ├─ UPSERTs into user_percentile_rankings table
   └─ Logs success/failure
```

### 3.3 The v_user_lift_inputs View

```sql
CREATE VIEW v_user_lift_inputs AS
SELECT
    u.id                    AS user_id,
    s.exercise_id,
    e.name                  AS exercise_name,
    REPLACE(LOWER(e.name), ' ', '_') AS lift_id,
    u.sex,
    COALESCE(u.weight_class_kg, 83) AS bodyweight_kg,
    EXTRACT(YEAR FROM AGE(NOW(), u.birth_date))::INTEGER AS age,
    COALESCE(u.years_in_sport, 0) AS training_years,
    MAX(
        CASE WHEN s.reps = 1 THEN s.weight_kg
             ELSE s.weight_kg * (1.0 + s.reps / 30.0)
        END
    ) AS best_one_rm_kg
FROM sets s
JOIN users u ON u.id = s.user_id
JOIN exercises e ON e.id = s.exercise_id
WHERE
    s.kind = 'lift'
    AND s.reps >= 1
    AND s.weight_kg > 0
    AND u.sex IN ('M', 'F')        -- Exclude 'X' (opted out)
    AND u.deleted_at IS NULL
    AND u.birth_date IS NOT NULL   -- Age required
GROUP BY u.id, s.exercise_id, e.name, u.sex, u.weight_class_kg, u.birth_date, u.years_in_sport;
```

**Key observations:**

1. **Epley formula:** `weight_kg * (1.0 + reps / 30.0)` estimates 1-rep max from a rep set.
2. **Special case:** Single reps (`reps = 1`) are returned exactly, not multiplied by 1.03. A 200 kg single is 200 kg, not 206.7 kg.
3. **Aggregation:** `MAX(...)` finds the best E1RM across all logged sets for that exercise.
4. **Filtering:** Only 'M' and 'F' are included. 'X' (opted-out) users are excluded because the model is calibrated on binary sex.
5. **GROUP BY:** Groups by user-exercise-demo combo, so one output row per (user, exercise).

---

## 4. The Math: Log-Normal Distribution

### 4.1 Why Log-Normal?

Strength data is **right-skewed** — most people are weak, a few are very strong. A **normal distribution** (bell curve) doesn't fit well. But if you take the logarithm of lift weights, the distribution is approximately normal.

**Model:**

```
ln(lift_kg) ~ N(μ, σ)

where:
  μ = mean of log-lift (the asymptote for an "average" lifter)
  σ = standard deviation
```

The model is **parameterized** by gender and lift:

```sql
lift_vectors table:
  lift_id: 'back_squat'
  sex:     'M'
  mu:      4.7228  (e^4.7228 ≈ 112 kg at reference bodyweight)
  sigma:   0.3107  (roughly 0.31 standard deviations)
```

### 4.2 The Percentile Function

Given:
- User's lift: 150 kg
- Sex: M
- Bodyweight: 75 kg (reference)
- Age: 30 (peak)
- Training years: 3

Steps:

1. **Bodyweight factor:**
   ```
   bw_factor = (75 / 75)^0.667 = 1.0  (at reference, no adjustment)
   ```

2. **Age factor:** At age 30 (peak), age_factor = 1.0.

3. **Training factor:** At 3 years, training_factor ≈ 0.85 (still progressing).

4. **Expected log-lift:**
   ```
   log_expected = μ + ln(bw_factor) + ln(age_factor) + ln(training_factor)
                = 4.7228 + 0 + 0 + ln(0.85)
                = 4.7228 - 0.1625
                = 4.5603
   expected_lift = e^4.5603 ≈ 96 kg
   ```

5. **Z-score:**
   ```
   z = (ln(150) - 4.5603) / 0.3107
     = (5.0106 - 4.5603) / 0.3107
     = 1.445
   ```

6. **Percentile (normal CDF):**
   ```
   percentile = norm_cdf(1.445) ≈ 0.926  (92.6th percentile)
   ```

**Interpretation:** A 150 kg squat at BW 75 kg, age 30, 3 years training is in the **92.6th percentile** of that cohort.

### 4.3 The norm_cdf Function

Postgres has no built-in normal CDF. The code implements **Abramowitz & Stegun 26.2.17**, a polynomial approximation:

```sql
CREATE FUNCTION norm_cdf(z DOUBLE PRECISION)
RETURNS DOUBLE PRECISION AS $$
DECLARE
    p   := 0.2316419;
    b1  := 0.319381530;
    ...
    abs_z := abs(z);
    t := 1.0 / (1.0 + p * abs_z);
    pdf := exp(-0.5 * abs_z * abs_z) / sqrt(2.0 * pi());
    poly := b1*t + b2*t^2 + b3*t^3 + b4*t^4 + b5*t^5;
    cdf := 1.0 - pdf * poly;
    IF z < 0 THEN RETURN 1.0 - cdf ELSE RETURN cdf END IF;
END;
$$;
```

This approximates the cumulative distribution function (CDF) of the standard normal distribution. For z=1.445, it returns ~0.926.

---

## 5. Worked Example: Computing a User's Percentile

### 5.1 Scenario

**User:** Alice, Female, 70 kg, Age 28, 2 years training.  
**Lift:** Back squat, 130 kg (her best recorded squat).

**Goal:** Compute her percentile rank among female squatters.

### 5.2 Step by Step

**1. Look up parameters from lift_vectors:**

```sql
SELECT * FROM lift_vectors
WHERE lift_id = 'back_squat' AND sex = 'F' AND model_version = 2;

Result:
  mu = 4.1744
  sigma = 0.2934
  bw_ref_kg = 65
  training_floor = 0.45  (for female squatters)
  training_tau_years = 3.0
  age_peak_lo = 23
  age_peak_hi = 35
  youth_decay_per_year = 0.012
  age_decay_per_year = 0.010
```

**2. Compute bodyweight factor:**

```
bw_factor = (70 / 65)^0.667 = 1.077^0.667 = 1.0502
ln(bw_factor) = ln(1.0502) = 0.0490
```

**3. Compute age factor:**

Alice is 28, which is between age_peak_lo (23) and age_peak_hi (35), so age_factor = 1.0.

```
ln(age_factor) = ln(1.0) = 0
```

**4. Compute training factor:**

Alice has 2 years. First-order kinetics:

```
train_factor = f₀ + (1 - f₀) * (1 - exp(-years / tau))
             = 0.45 + 0.55 * (1 - exp(-2 / 3.0))
             = 0.45 + 0.55 * (1 - 0.5134)
             = 0.45 + 0.55 * 0.4866
             = 0.45 + 0.268
             = 0.718
ln(train_factor) = ln(0.718) = -0.333
```

**5. Compute expected log-lift:**

```
log_expected = μ + ln(bw_factor) + ln(age_factor) + ln(train_factor)
             = 4.1744 + 0.0490 + 0 - 0.333
             = 3.8904
```

**6. Compute z-score:**

```
z = (ln(130) - 3.8904) / 0.2934
  = (4.8675 - 3.8904) / 0.2934
  = 0.9771 / 0.2934
  = 3.330
```

Z-score is clamped to [-4, 4], so z = 3.330.

**7. Compute percentile:**

```
percentile = norm_cdf(3.330) ≈ 0.9996 ≈ 99.96th percentile
```

**Result:** Alice is in the **99.96th percentile** of female squatters with her profile (age 28, weight 70 kg, 2 years training). She's exceptionally strong relative to her cohort.

---

## 6. The JavaScript Cron Job: Orchestrating the Batch

The `percentile.js` file runs weekly (Sunday 03:00 UTC) and orchestrates the batch computation.

### 6.1 Connection Management

```javascript
const { pool } = require('../db');

async function run() {
    const client = await pool.connect();
    try {
        // ... computation ...
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
    } finally {
        client.release();
        await pool.end();
    }
}
```

**Pattern:** Acquire a connection, begin a transaction, run queries, commit or rollback, release the connection. This ensures the job doesn't leave locks or orphaned connections.

### 6.2 Calling the SQL Function

```javascript
const { rows } = await client.query(
    `SELECT user_id, lift_id, percentile, percentile_simple,
            cohort_size_internal, is_estimated, computed_at
     FROM compute_percentile_batch(2)`
);
```

This calls the SQL function `compute_percentile_batch(2)` (model version 2) and returns a result set. Each row is `(user_id, lift_id, percentile, percentile_simple, ...)`.

### 6.3 Chunked Upsert

The job upsets rows in **chunks of 500** to avoid a single gigantic query:

```javascript
const CHUNK = 500;
for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    
    chunk.forEach((row, idx) => {
        const base = idx * 7;
        values.push(`($${base + 1}, ..., $${base + 7}, 2)`);
        params.push(
            row.user_id, row.lift_id, row.percentile,
            row.percentile_simple, row.cohort_size_internal,
            row.is_estimated, row.computed_at
        );
    });
    
    await client.query(
        `INSERT INTO user_percentile_rankings (...)
         VALUES ${values.join(', ')}
         ON CONFLICT (user_id, lift_id, model_version)
         DO UPDATE SET ...`,
        params
    );
}
```

**Upsert semantics:** If a row with (user_id, lift_id, model_version) already exists, update it. Otherwise, insert a new row. This is idempotent — running the job twice gives the same result.

---

## 7. Common Table Expressions (CTEs)

A **CTE** is a named subquery that makes complex SQL more readable.

### 7.1 Simple CTE

Without CTE:

```sql
SELECT u.id, u.display_name, ranked.percentile
FROM users u
JOIN (
    SELECT user_id, MAX(percentile) AS percentile
    FROM user_percentile_rankings
    WHERE model_version = 2
    GROUP BY user_id
) ranked ON u.id = ranked.user_id
ORDER BY ranked.percentile DESC;
```

With CTE:

```sql
WITH top_users AS (
    SELECT user_id, MAX(percentile) AS percentile
    FROM user_percentile_rankings
    WHERE model_version = 2
    GROUP BY user_id
)
SELECT u.id, u.display_name, top_users.percentile
FROM users u
JOIN top_users ON u.id = top_users.user_id
ORDER BY top_users.percentile DESC;
```

The CTE `top_users` is defined once and referenced multiple times. More readable.

### 7.2 Multi-Step CTE

```sql
WITH lifters AS (
    SELECT
        user_id,
        sex,
        age,
        training_years,
        best_one_rm_kg
    FROM v_user_lift_inputs
    WHERE lift_id = 'back_squat'
),
stats AS (
    SELECT
        sex,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY best_one_rm_kg) AS median,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY best_one_rm_kg) AS p90
    FROM lifters
    GROUP BY sex
)
SELECT
    l.user_id,
    l.best_one_rm_kg,
    s.median,
    CASE WHEN l.best_one_rm_kg >= s.p90 THEN 'elite' ELSE 'intermediate' END
FROM lifters l
JOIN stats s ON l.sex = s.sex;
```

Step 1: Filter to squatters. Step 2: Compute median and 90th percentile per sex. Step 3: Classify each user as elite or intermediate.

---

## 8. Quiz: Levels L1–L5

### 8.1 Quiz Q1: GROUP BY and Aggregation (L1 — Recall)

**Prompt:**  
In the SQL query:

```sql
SELECT exercise_id, COUNT(*), MAX(weight_kg)
FROM sets
GROUP BY exercise_id;
```

What does `COUNT(*)` return?

A) The total number of sets across all exercises.  
B) The number of rows in each exercise group.  
C) The number of distinct exercises.  
D) The average weight per exercise.

**Model answer:** B

**Rubric:**
- 5 points for B.
- 1 point for A (showing understanding that COUNT counts rows, but missing GROUP BY semantics).

**Point value:** 5 points

---

### 8.2 Quiz Q2: Window Functions (L2 — Understand)

**Prompt:**  
What is the key difference between `GROUP BY` and window functions like `PERCENT_RANK()`?

A) Window functions are slower.  
B) GROUP BY reduces rows; window functions preserve rows.  
C) Window functions only work on numeric columns.  
D) GROUP BY can't handle NULL values.

**Model answer:** B

**Explanation:** GROUP BY outputs one row per group. Window functions output one row per input row, but the computation is based on a window of related rows.

**Rubric:**
- 5 points for B with correct reasoning.
- 3 points for B without reasoning.

**Point value:** 5 points

---

### 8.3 Quiz Q3: Epley Formula (L3 — Apply)

**Prompt:**  
A user logs 8 reps at 100 kg. Using the Epley formula `weight_kg * (1.0 + reps / 30.0)`, estimate their 1-rep max.

A) 100 kg  
B) 126.67 kg  
C) 108 kg  
D) 102.67 kg

**Model answer:** D

**Calculation:**  
```
E1RM = 100 * (1.0 + 8 / 30.0) = 100 * 1.2667 = 126.67 kg
```

Wait, that's option B. Let me recalculate:

```
1.0 + 8/30 = 1.0 + 0.2667 = 1.2667
100 * 1.2667 = 126.67 kg
```

So the answer should be B (126.67 kg), not D. The question was incorrectly designed. Let me revise:

**Corrected prompt:**  
A user logs 8 reps at 100 kg. Using Epley, estimate their 1-rep max.

A) 100 kg  
B) 126.67 kg  
C) 108 kg  
D) 110 kg

**Model answer:** B

**Rubric:**
- 5 points for B.
- 2 points for C or D (showing understanding of rep conversion but miscalculating).

**Point value:** 5 points

---

### 8.4 Quiz Q4: Log-Normal Distribution (L4 — Analyze)

**Prompt:**  
The percentile model assumes strength data follows a **log-normal distribution**. Why not a normal distribution?

A) Normal distributions are slower to compute.  
B) Real strength data is right-skewed (most weak, few very strong); log-normal fits better.  
C) Log-normal avoids negative numbers.  
D) Log-normal is more accurate for small sample sizes.

**Model answer:** B

**Explanation:** Strength data has a long tail of elite lifters, which the log-normal distribution models better than a normal (symmetric) distribution.

**Rubric:**
- 5 points for B with explanation.
- 3 points for B without explanation.
- 1 point for C (partially correct — log-normal does avoid negatives).

**Point value:** 5 points

---

### 8.5 Quiz Q5: Batch vs. Real-Time (L5 — Evaluate)

**Prompt:**  
A product manager asks: "Why don't we compute percentiles in real-time? Every time a user logs a set, update their rank immediately."

Evaluate this proposal. What are the trade-offs? Under what conditions would real-time be better?

**Model answer:**

**Current batch approach (weekly):**
- **Pro:** Cheap. One batch job per week. Ranks are stable (don't jitter as users log sets). Easy to understand and maintain.
- **Con:** Stale. User's rank is 2–7 days old. Late-week logs won't be reflected until next Sunday.

**Real-time approach:**
- **Pro:** Fresh. User logs a set → rank updates immediately. Better UX for users chasing a rank.
- **Con:** Expensive. Every set INSERT triggers a re-rank of the entire cohort. At N users, each with ~3 sets/week, that's ~3N updates to percentile tables per week. Becomes O(N^2) at scale.

**When to switch to real-time:**
1. Users are logging sets rapidly and rank fluctuations are motivating ("I'm 19th, 18th, 17%...").
2. Users complain that ranks are too stale.
3. Database grows to where a weekly batch becomes slow (>1M sets; >10k active users).

**Recommendation for Peak Fettle:** Stay with batch. At months 1–12, the dataset is small, and weekly rankings are sufficient. If usage grows to >50k users, revisit this trade-off.

**Rubric:**
- 10 points if the answer identifies cost/freshness trade-off, lists pros/cons of each approach, and recommends a decision based on scale.
- 7 points if it identifies the trade-off but doesn't fully analyze both approaches.
- 3 points if it shows some understanding but misses key trade-offs (cost at scale, stability of ranks).

**Point value:** 10 points

---

## 9. Capstone: Extending the Model

### 9.1 Scenario: Adding "vs. All Lifters" Ranking

Currently, percentile ranks a user against their **cohort** (same sex, age, weight, experience). A product request: "Also show me how I rank against *all* strength trainees, regardless of demographics."

The codebase already implements this: the `compute_percentile_simple()` function.

### 9.2 The Simple Model

```sql
CREATE FUNCTION compute_percentile_simple(
    p_lift_id        TEXT,
    p_sex            CHAR(1),
    p_bodyweight_kg  DOUBLE PRECISION,
    p_lift_kg        DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION AS $$
DECLARE
    v RECORD;
    bw_clamped     DOUBLE PRECISION;
    bw_factor      DOUBLE PRECISION;
    log_expected   DOUBLE PRECISION;
    z              DOUBLE PRECISION;
BEGIN
    bw_clamped := GREATEST(40, LEAST(p_bodyweight_kg, 210));
    SELECT * INTO v FROM resolve_lift_vector(p_lift_id, p_sex, 2);
    
    bw_factor := power(bw_clamped / v.bw_ref_kg, v.alpha);
    log_expected := v.pop_mu + ln(bw_factor);
    z := (ln(p_lift_kg) - log_expected) / v.pop_sigma;
    
    RETURN 100.0 * norm_cdf(z);
END;
$$;
```

**Differences from `compute_percentile()`:**

1. **No age adjustment** — Only considers gender + bodyweight.
2. **No training adjustment** — Compares against the full population (beginner + intermediate + elite).
3. **Uses pop_mu / pop_sigma** — Population parameters (across all experience levels), not cohort-specific.

**Example:**

```
User's squat: 150 kg, sex M, weight 75 kg
compute_percentile(..., age=30, training_yrs=3) → 92.6th percentile (top 7.4% of 30-year-olds with 3 yrs training)
compute_percentile_simple(...) → 85th percentile (top 15% of all male squatters at 75 kg, any age/experience)
```

### 9.3 Discussion: When to Expand the Model

**Other demographics you could add:**

1. **Bodybuilding (volume-based ranking)** — Instead of 1-rep max, rank by volume (sets × reps × weight). Requires different distribution model.
2. **Sport-specific splits** — Different percentiles for powerlifters vs. casual lifters. Requires separate lift_vectors.
3. **Time-based ranking** — "You're top 10% this month" vs. all-time. Requires recomputing percentiles on a monthly/daily basis.

Each addition increases complexity. Peak Fettle's philosophy: **Start simple, add complexity if users ask for it.**

---

## 10. Interactive Widget: Percentile Calculator

**Description:**  
An interactive web tool that computes percentiles in real-time, showing how each factor (age, weight, experience) affects the rank.

**Inputs:**
- Lift (dropdown: back_squat, bench_press, etc.)
- Sex (radio: M / F)
- Bodyweight (kg, slider: 40–150)
- Age (years, slider: 14–90)
- Training years (slider: 0–30)
- Lift weight (kg, numeric input)

**Outputs:**
- Percentile rank (cohort-specific): "You're in the **92.6th percentile**"
- Percentile rank (population): "Vs. all lifters: **85th percentile**"
- Comparison to reference lifter (same demographics, 50th percentile)

**Interactions:**
- Adjust bodyweight → see percentile change.
- "What if I were 5 years more experienced?" → Adjust training years slider, watch percentile increase.
- "How does age affect my rank?" → Animate age slider from 20 to 50, show percentile curve.

This widget calls the SQL functions via a REST API, demonstrating that the math is deterministic and repeatable.

---

## Summary

- **Aggregation** (`GROUP BY`, aggregate functions) summarizes data into groups.
- **Window functions** (`PERCENT_RANK`, `NTILE`, `ROW_NUMBER`) rank rows without reducing them.
- **Batch jobs** trade freshness for cost. Weekly percentile updates are cheap and sufficient for Peak Fettle's scale.
- **Log-normal distribution** models strength data better than a normal distribution.
- **CTEs** make complex SQL readable by naming subqueries.
- **Extend, don't rewrite.** The `compute_percentile_simple()` function adds a second ranking view without changing the core logic.

---

**Related readings:**
- Postgres docs: Aggregate Functions, Window Functions
- Statistics: Normal vs. log-normal distributions
- Scaling: When to move from batch to real-time

**Next lesson:** L06 (Supabase & Managed Postgres) — how Supabase provides database hosting, authentication, and Row-Level Security.
