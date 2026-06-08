# L04: Relational Modeling & the Postgres Schema

**Peak Fettle Codebase Curriculum**  
**Bloom Levels:** L1 (Recall), L2 (Understand), L3 (Apply), L4 (Analyze), L5 (Evaluate)  
**Estimated read time:** 60 minutes  
**Prerequisites:** L01, L02, L03  
**Code sources:** `migrations/20260430_initial_schema.sql`, `migrations/` directory

---

## 0. Why This Matters

When you log a workout set, Peak Fettle doesn't store a giant JSON blob. Instead, your data lives in **normalized database tables** connected by **primary keys** and **foreign keys**. This lesson teaches you *why* that design matters, *how* tables relate to each other, and *where the indexes are* and why they exist. You'll read the `initial_schema.sql` file, trace a data journey from a mobile tap to a Postgres row, and learn to ask: "Should I store this derived column, or compute it on the fly?"

By the end, you'll be able to:
- Draw a schema diagram and explain each relationship.
- Read a migration file and spot normalization violations.
- Defend storage decisions (e.g., caching `dayKey` vs. computing it from `logged_at`).
- Predict which queries will be fast (because they can use an index) vs. slow.

---

## 1. Core Concepts: Tables, Rows, Columns

### 1.1 The Relational Model (vs. Objects)

In C++, the mobile app sees a **Set** as an object with properties:

```cpp
struct Set {
    UUID id;
    UUID workoutId;
    UUID exerciseId;
    enum Kind { Lift, Cardio } kind;
    
    // Lift fields
    int reps;
    double weightKg;
    
    // Cardio fields
    int durationSec;
    double distanceM;
};
```

In Postgres, that becomes a **table**: `sets` with **rows** (one per set logged) and **columns** (the fields).

```sql
CREATE TABLE sets (
    id                  UUID PRIMARY KEY,
    workout_id          UUID NOT NULL,
    exercise_id         UUID NOT NULL,
    kind                TEXT NOT NULL,
    reps                SMALLINT,
    weight_kg           NUMERIC(6,2),
    duration_sec        INTEGER,
    distance_m          NUMERIC(8,2)
);
```

**Key difference:** The enum `Kind { Lift, Cardio }` becomes a TEXT column with a CHECK constraint. The database doesn't have a native "discriminated union" type, so we use a string and verify it at the SQL layer.

### 1.2 Primary Keys: The Identity

Every row in a table has a **primary key** — a column (or set of columns) that *uniquely identifies* that row. In Peak Fettle, it's almost always UUID:

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

This means:
- No two sets share the same `id`.
- When you retrieve a set, you ask the DB for `WHERE id = ?`.
- The primary key is automatically indexed (fast lookup).

### 1.3 Foreign Keys: Relationships

A **foreign key** says "this column references the primary key of another table."

```sql
CREATE TABLE sets (
    id            UUID PRIMARY KEY,
    workout_id    UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id   UUID NOT NULL REFERENCES exercises(id)
);
```

This creates a **one-to-many** relationship:
- One user → many workouts.
- One workout → many sets.
- One exercise → many sets (across all users).

The `ON DELETE CASCADE` rule means: "If a workout is deleted, automatically delete all sets in that workout." Without this, you'd have **orphaned rows** (sets pointing to a workout that no longer exists).

### 1.4 Constraints: Business Rules

Constraints enforce **invariants** — facts that must always be true.

```sql
kind TEXT NOT NULL CHECK (kind IN ('lift','cardio'))
```

This says: "You cannot INSERT a set with `kind = 'swimming'`; only 'lift' or 'cardio' are allowed." The database refuses bad data at the source, not in the app.

Other common constraints in Peak Fettle:

```sql
-- A workout must belong to a user
user_id UUID NOT NULL

-- The UNIQUE constraint prevents duplicate (user, day) pairs
-- (one workout per user per day)
UNIQUE (user_id, day_key)

-- Check: either lift fields are populated OR cardio fields are
CHECK (
    (kind = 'lift'   AND reps IS NOT NULL AND weight_kg IS NOT NULL)
    OR
    (kind = 'cardio' AND duration_sec IS NOT NULL)
)
```

---

## 2. Peak Fettle Schema: A Walkthrough

### 2.1 Users Table

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    TEXT,
    
    -- Cohort demographics (used by percentile engine)
    sex             TEXT CHECK (sex IN ('M', 'F', 'X')),
    birth_date      DATE,
    weight_class_kg NUMERIC(5,2),
    years_in_sport  SMALLINT,
    experience_level TEXT,
    
    tier            TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','paid')),
    unit_pref       TEXT NOT NULL DEFAULT 'kg' CHECK (unit_pref IN ('kg','lbs')),
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
```

**Key observations:**

1. **Email is unique** — no two users can share an email address.
2. **Cohort demographics** (`sex`, `birth_date`, `weight_class_kg`, `years_in_sport`) are stored here because the percentile engine reads them to compute rankings.
3. **Soft delete** — `deleted_at` is NOT NULL only if the user is deleted. Queries filter with `WHERE deleted_at IS NULL` so soft-deleted data isn't visible but isn't lost.
4. **Audit columns** — `created_at` and `updated_at` track when records were created and last modified.

### 2.2 Exercises Table (Global Library)

```sql
CREATE TABLE exercises (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL CHECK (length(name) <= 100),
    category        TEXT NOT NULL CHECK (category IN ('lift','cardio','sport','mobility')),
    muscle_groups   TEXT[],
    is_compound     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exercises_name_trgm ON exercises USING gin (name gin_trgm_ops);
```

**Key observations:**

1. **Global library** — one `back_squat` exercise shared by all users. Users don't each create their own exercise.
2. **Trigram GIN index** — enables fuzzy search (TICKET-007). The `gin_trgm_ops` operator breaks the exercise name into 3-character substrings so a search for "squat" matches "back_squat" even if the user typed "sqat".
3. **Array column** — `muscle_groups TEXT[]` stores a PostgreSQL array, e.g., `['quads', 'glutes']`.

### 2.3 Workouts Table

```sql
CREATE TABLE workouts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_key         DATE NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (user_id, day_key)
);

CREATE INDEX idx_workouts_user_day ON workouts(user_id, day_key DESC);
```

**Design choice:** A "workout" is one calendar day per user. If you log sets on Monday, they all belong to the same workout. The `day_key` is a DATE (e.g., `'2026-05-21'`), not a timestamp, so the UI renders "Monday" not "Monday 14:30:15 UTC".

**The index** `(user_id, day_key DESC)` is **composite**: it speeds up queries like:

```sql
SELECT * FROM workouts WHERE user_id = ? ORDER BY day_key DESC LIMIT 10;
```

This is how the app loads "my last 10 workout days" without a table scan.

### 2.4 Sets Table (The Core Log)

```sql
CREATE TABLE sets (
    id                  UUID PRIMARY KEY,
    workout_id          UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id         UUID NOT NULL REFERENCES exercises(id),
    kind                TEXT NOT NULL CHECK (kind IN ('lift','cardio')),
    set_index           SMALLINT NOT NULL,
    
    -- LIFT fields
    reps                SMALLINT,
    weight_kg           NUMERIC(6,2),
    rir                 SMALLINT,
    
    -- CARDIO fields
    duration_sec        INTEGER,
    distance_m          NUMERIC(8,2),
    avg_pace_sec_per_km NUMERIC(6,2),
    
    logged_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CHECK (
        (kind = 'lift'   AND reps IS NOT NULL AND weight_kg IS NOT NULL)
        OR
        (kind = 'cardio' AND duration_sec IS NOT NULL)
    )
);

CREATE INDEX idx_sets_user_logged  ON sets(user_id, logged_at DESC);
CREATE INDEX idx_sets_workout      ON sets(workout_id, set_index);
CREATE INDEX idx_sets_exercise     ON sets(exercise_id);
```

**Design pattern:** "One table, two types of rows." Rather than separate `lift_sets` and `cardio_sets` tables, we use a discriminator column (`kind`) and a CHECK constraint to enforce that lift rows have lift data and cardio rows have cardio data.

**Indexes explained:**

- `idx_sets_user_logged` — "Get all sets for user X, most recent first." This powers the strength chart (showing your last 50 squat attempts).
- `idx_sets_workout` — "Get all sets in workout Y, in order." This powers rendering the workout log.
- `idx_sets_exercise` — "Get all sets for exercise Z." Used by the percentile engine.

---

## 3. Primary Keys, Foreign Keys, and Normalization

### 3.1 One-to-Many Relationships

Peak Fettle's core relationships form a **hierarchy**:

```
users (1) ──→ (many) workouts
             ├─ (many) sets
             ├─ (many) streaks
             └─ (many) plans

exercises (1) ──→ (many) sets
                  (across all users)
```

When you delete a user, the `ON DELETE CASCADE` rule ensures:
1. All their workouts are deleted.
2. All their sets are deleted (because they're attached to workouts).
3. All their streaks, plans, etc. are deleted.

**Without CASCADE:** Deleting a user would fail if any sets still reference them, forcing you to manually delete rows in the right order. CASCADE makes deletion atomic and safe.

### 3.2 Normalization: The Three Rules

**First Normal Form (1NF):** Atomic values only.

```sql
-- WRONG: array of exercises in one column
CREATE TABLE workout_logs (
    exercises TEXT[]  -- ['back_squat', 'bench_press']
);

-- RIGHT: one exercise per row
CREATE TABLE sets (
    exercise_id UUID REFERENCES exercises(id)
);
```

Peak Fettle follows 1NF strictly: every column is a scalar value (UUID, TEXT, INTEGER, etc.), except `muscle_groups TEXT[]` in exercises (which is a rare exception for denormalization performance).

**Second Normal Form (2NF):** No partial dependencies (doesn't apply to single-key tables).

**Third Normal Form (3NF):** No transitive dependencies.

```sql
-- WRONG: storing exercise name in sets
CREATE TABLE sets (
    exercise_id UUID,
    exercise_name TEXT  -- ← depends on exercises.name, not the primary key
);

-- RIGHT: store only the reference; join to get the name
CREATE TABLE sets (
    exercise_id UUID REFERENCES exercises(id)
);
SELECT s.*, e.name FROM sets s JOIN exercises e ON s.exercise_id = e.id;
```

**When to denormalize:** Peak Fettle **caches** a few values in `sets` for performance:

```sql
CREATE TABLE sets (
    user_id UUID,  -- ← could be derived from workout_id → user_id
    ...
);
```

Why? Because **every set query needs the user_id** (for Row-Level Security; see L06). Storing it avoids a join to workouts. This is a deliberate, documented denormalization.

### 3.3 Indexes: B-Trees and Why They Matter

An **index** is a data structure that speeds up lookups. The most common is a **B-tree**.

```sql
CREATE INDEX idx_sets_user_logged ON sets(user_id, logged_at DESC);
```

Without this index, querying "all sets for user X, sorted by date" requires a **full table scan** — reading every row in the sets table. With the index, the database jumps directly to user X's rows (logarithmic time).

**Composite indexes** work on multiple columns. `(user_id, logged_at DESC)` is useful because it's sorted first by user, then by date, so it can answer:
- "Get all sets for user X" — uses the user part.
- "Get all sets for user X, newest first" — uses both parts.

**When to index:**
- Foreign keys (always).
- Columns in WHERE clauses.
- Columns used in ORDER BY.
- Columns in composite keys (e.g., `percentile_vectors` lookup: exercise + sex + age + weight).

**The cost of indexing:**
- Every INSERT, UPDATE, DELETE is slightly slower (the index must be updated too).
- Storage overhead (the index is stored on disk).

Peak Fettle is conservative with indexes: it has ~12 across all tables, because the data volume is small (months 1–12) and the queries are simple.

---

## 4. Naming Conventions & Caching Decisions

### 4.1 Why `dayKey`, Not `workoutDate`?

In the C++ mobile app, when you log a set, the code caches the date:

```cpp
std::string dayKey = formatDate(std::chrono::now());  // "2026-05-21"
```

This is stored in the database:

```sql
CREATE TABLE workouts (
    day_key DATE NOT NULL,
    ...
);
```

**Question:** Should `day_key` be a column, or should the UI compute it from `logged_at` each time?

**The codebase chose:** Store it as `dayKey` in the database and cache it in the app.

**Why:**
1. **Rendering speed** — The app doesn't re-format dates on every render. `dayKey` is already a string.
2. **Correctness** — Defining "this set belongs to Monday" as "the same `dayKey`" is simpler than "same calendar day in the user's timezone."
3. **Grouping** — Queries that group by day are instant: `WHERE day_key = ?`.

**The trade-off:** You're storing a derived value (date derived from `logged_at`). If you had millions of rows, you might compute it on the fly to save space. But for this app, storage is cheap; clarity is expensive.

### 4.2 Naming Rules

Peak Fettle follows these conventions:

- **snake_case** for columns: `weight_kg`, `logged_at`, `user_id`.
- **UPPERCASE for keywords:** `CREATE`, `SELECT`, `WHERE`.
- **Timestamps with timezone:** `TIMESTAMPTZ`, stored in UTC. `created_at TIMESTAMPTZ DEFAULT NOW()`.
- **Weights in kg only:** The schema stores weights in kilograms; the UI converts to lbs at render time (per CTO rule).
- **UUIDs for IDs:** UUID (128-bit), not auto-increment integers. Better for distributed systems.

---

## 5. Worked Example: Tracing a Data Journey

**Scenario:** A user logs a squat set on May 21, 2026 at 14:30 UTC.

**Step 1: Mobile app captures the data.**

```cpp
Set liftSet;
liftSet.id = generateUUID();  // "550e8400-e29b-41d4-a716-446655440001"
liftSet.exerciseId = "back_squat_uuid";
liftSet.reps = 5;
liftSet.weightKg = 100.0;
liftSet.loggedAt = std::chrono::now();  // 2026-05-21T14:30:00Z
```

**Step 2: Insert into the database.**

The app sends this JSON to the backend:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "workoutId": "workout_uuid",
  "exerciseId": "back_squat_uuid",
  "kind": "lift",
  "reps": 5,
  "weightKg": 100.0,
  "loggedAt": "2026-05-21T14:30:00Z"
}
```

The backend inserts:

```sql
INSERT INTO sets
  (id, workout_id, user_id, exercise_id, kind, set_index, reps, weight_kg, logged_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'workout_uuid', 'user_uuid', 'back_squat_uuid', 'lift', 3, 5, 100.0, '2026-05-21T14:30:00Z');
```

The database checks:
- Does `workout_uuid` exist in workouts? ✓
- Does `user_uuid` exist in users? ✓
- Does `back_squat_uuid` exist in exercises? ✓
- Is `kind = 'lift'`? ✓
- Are `reps` and `weight_kg` non-NULL? ✓
- All constraints pass, row is inserted.

**Step 3: Query it back.**

The app requests "all sets from my May 21 workout, in order":

```sql
SELECT s.id, s.kind, s.reps, s.weight_kg, s.duration_sec, e.name
FROM sets s
JOIN exercises e ON s.exercise_id = e.id
WHERE s.workout_id = 'workout_uuid'
ORDER BY s.set_index;
```

The database:
1. Uses the index `idx_sets_workout` to find all rows with `workout_id = 'workout_uuid'`.
2. Joins to exercises (very fast, small table).
3. Returns the rows sorted by `set_index`.

**Step 4: Percentile update (weekly batch).**

The cron job (see L05) runs weekly:

```sql
SELECT u.best_one_rm_kg, ...
FROM v_user_lift_inputs u
WHERE u.lift_id = 'back_squat' AND u.user_id = 'user_uuid';
```

This view reads from sets and computes the best Epley E1RM for the user's squat. The result is used to compute a percentile and stored in `user_percentile_rankings`.

---

## 6. Indexing Deep Dive

### 6.1 B-Tree Index Structure

A B-tree is a balanced tree. For `idx_sets_user_logged`:

```
                  [user_id ranges]
                  /      |       \
            [u1 sets] [u2 sets] [u3 sets]
            /  |  \    ...
         [older] [newer]
```

When you query `WHERE user_id = 'u2' ORDER BY logged_at DESC`, the database:
1. Traverses the tree to find all 'u2' nodes (logarithmic time).
2. Reads them in reverse order (already sorted by logged_at).

**Without the index:** Full table scan, O(N). **With the index:** O(log N + M) where M is the number of matching rows.

### 6.2 Trigram Index (pg_trgm)

The exercises table has:

```sql
CREATE INDEX idx_exercises_name_trgm ON exercises USING gin (name gin_trgm_ops);
```

This breaks names into 3-character substrings (trigrams):

```
"back_squat"  →  " ba", "bac", "ack", "ck_", "k_s", ...
```

When you search for "sqat" (typo), it matches "squat" by finding overlapping trigrams. This enables fuzzy search without a full table scan.

### 6.3 Composite Index Behavior

The index `idx_sets_user_logged (user_id, logged_at DESC)` is sorted first by user_id, then by logged_at within each user. This is fast for:

```sql
WHERE user_id = '123'              -- uses both columns
WHERE user_id = '123' AND logged_at > NOW() - INTERVAL '7 days'  -- uses both
```

But **not** for:

```sql
WHERE logged_at > NOW() - INTERVAL '7 days'  -- must scan all users' timestamps
```

Because the index is sorted by user_id first, skipping that condition requires reading the entire index.

---

## 7. Row-Level Security and Indexes

Peak Fettle uses **Row-Level Security (RLS)** — a database feature that filters rows based on the authenticated user. This is covered in L06, but it affects schema design:

```sql
CREATE POLICY "sets_self_only" ON sets
    FOR ALL USING (auth.uid() = user_id);
```

This says: "A user can only see sets where `user_id` matches their auth token."

**Why store `user_id` in sets?** Because the RLS policy needs it. Without it, you'd have to join to workouts, then to users, every time you query. Storing it denormalized speeds up RLS filtering.

---

## 8. Quiz: Levels L1–L5

### 8.1 Quiz Q1: Primary Key Definition (L1 — Recall)

**Prompt:**  
In the schema, what does it mean that `sets.id` is a PRIMARY KEY?

A) The column is indexed for faster lookups.  
B) Every set has a unique ID, and no two sets can share the same ID.  
C) The column can never be NULL.  
D) The column is used to join to other tables.

**Model answer:** B (with A as a bonus correct observation).

**Rubric:**
- 2 points if the answer mentions uniqueness.
- 1 point if the answer mentions indexing.
- 0 points if the answer is C or D without understanding uniqueness.

**Point value:** 5 points

---

### 8.2 Quiz Q2: Foreign Keys and Cascades (L2 — Understand)

**Prompt:**  
The sets table has `workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE`. What happens when a workout is deleted?

A) The foreign key constraint prevents deletion of the workout.  
B) The sets are automatically deleted along with the workout.  
C) The sets are orphaned (workout_id points to a non-existent row).  
D) An error is raised, and you must manually delete sets first.

**Model answer:** B

**Rubric:**
- 5 points for B.
- 2 points for D (showing understanding that something must happen, but missing CASCADE semantics).
- 0 points for A or C.

**Point value:** 5 points

---

### 8.3 Quiz Q3: Denormalization and Caching (L3 — Apply)

**Prompt:**  
The sets table stores `user_id`, even though it can be derived via `workout_id → workouts.user_id`. Why is this stored directly in sets?

Hint: Think about performance and RLS.

**Model answer:**

1. **RLS filtering** — Every query on sets must filter by `auth.uid() = user_id`. Having it in the table avoids a join to workouts.
2. **Index on user_id** — The index `idx_sets_user_logged` uses `user_id` to quickly find a user's sets.
3. **Denormalization trade-off** — It's a deliberate denormalization (redundancy) chosen because the sets table is queried frequently and user_id is always needed.

**Rubric:**
- 5 points if the answer mentions at least two of: RLS performance, index performance, deliberate denormalization.
- 3 points if it mentions only one.
- 1 point if it guesses "it's easier" without reasoning.

**Point value:** 8 points

---

### 8.4 Quiz Q4: Index Design (L4 — Analyze)

**Prompt:**  
The index `idx_sets_user_logged (user_id, logged_at DESC)` is composite. Given the following queries, which will benefit most from this index?

A) `SELECT * FROM sets WHERE logged_at > NOW() - INTERVAL '30 days';`  
B) `SELECT * FROM sets WHERE user_id = '123' ORDER BY logged_at DESC LIMIT 10;`  
C) `SELECT COUNT(*) FROM sets WHERE kind = 'lift';`  
D) `SELECT * FROM sets WHERE exercise_id = '456';`

**Model answer:** B

**Explanation:** Query B uses both columns of the index (user_id in the filter, logged_at for sorting). Queries A and C don't use user_id, so they can't benefit from the leading column. Query D doesn't use the index columns at all.

**Rubric:**
- 5 points for B with correct reasoning.
- 3 points for B without reasoning.
- 1 point for any other answer (showing some understanding of indexes).

**Point value:** 5 points

---

### 8.5 Quiz Q5: Schema Evolution (L5 — Evaluate)

**Prompt:**  
You're adding a new feature: "show me my max squat for each weight class I've trained at." The weight classes are [52, 59, 66, 74, 83, 93, 105, 120] kg. 

Should you:

A) Add a `weight_class SMALLINT` column to sets and populate it when logging.  
B) Compute the weight class on the fly from the `weight_kg` column in each query.  
C) Create a separate materialized view that groups sets by weight class and caches max lifts.  

Argue for and against each approach.

**Model answer:**

**Option A (Denormalize):**
- **Pro:** Queries are simple; no computation needed.
- **Con:** Storage overhead; weight_class is redundant (can be computed); must update it if the weight_class definition changes.

**Option B (Compute on the fly):**
- **Pro:** Minimal storage; no redundancy; definition change is automatic.
- **Con:** Every query repeats the same computation; slower if users request this frequently.

**Option C (Materialized view):**
- **Pro:** Fast reads; separates storage from computation; the view can be refreshed weekly or on-demand.
- **Con:** Complexity; eventual consistency (the view lags behind the raw data); storage for the view.

**Recommendation:** For Peak Fettle's scale (months 1–12), Option B is simplest. If the feature becomes heavily used, Option C (refresh the view weekly, like the percentile job) is ideal.

**Rubric:**
- 8 points if the answer evaluates all three options and considers trade-offs (correctness, performance, maintainability, storage).
- 5 points if it chooses one option and defends it reasonably but doesn't compare to others.
- 2 points if it shows some understanding but misses key trade-offs.

**Point value:** 10 points

---

## 9. Capstone: Case Study

### 9.1 The C++ Discriminator and SQL CHECK

**Background:**  
In C++, the Set struct uses a **discriminated union** (or tagged union):

```cpp
enum class Kind { Lift, Cardio };
struct Set {
    Kind kind;
    // Lift fields (only valid if kind == Lift)
    std::optional<int> reps;
    std::optional<double> weightKg;
    
    // Cardio fields (only valid if kind == Cardio)
    std::optional<int> durationSec;
};
```

In Postgres, there's no native discriminated union. So the schema uses a string + CHECK constraint:

```sql
kind TEXT CHECK (kind IN ('lift', 'cardio')),
reps SMALLINT,
weight_kg NUMERIC(6,2),
duration_sec INTEGER,

CHECK (
    (kind = 'lift'   AND reps IS NOT NULL AND weight_kg IS NOT NULL)
    OR
    (kind = 'cardio' AND duration_sec IS NOT NULL)
)
```

**Question:** How does the Postgres schema mimic the C++ enum and discriminator?

**Answer:**

1. **Enum → TEXT + CHECK:** The enum `Kind` becomes a TEXT column with a CHECK constraint that mimics an enum.
2. **Discriminator field:** The `kind` column is the "tag" that tells you which fields are valid.
3. **Semantic CHECK:** The second CHECK constraint enforces that either lift *or* cardio fields are populated (mimicking the discriminator's guarantee that you can only access the fields matching your tag).

**Discussion point:** Should you add an additional column, like `kind_discriminator`, to make this explicit? No — that's redundant. The `kind` column is the discriminator.

### 9.2 Performance Analysis: Index vs. Derived Column

**Scenario:** The app frequently shows "my sets from the last 7 days." Currently it queries:

```sql
SELECT s.* FROM sets s
WHERE s.user_id = ? AND s.logged_at > NOW() - INTERVAL '7 days'
ORDER BY s.logged_at DESC;
```

**Proposal:** Add a `created_week TEXT` column (e.g., 'week_2026_20') and index it to speed up "sets from this week" queries.

**Analysis:**

**Pro:**
- Week-based filtering becomes a simple `WHERE created_week = 'week_2026_20'` — no date arithmetic.
- Queries can't compute the wrong week (e.g., if timezone handling is wrong).

**Con:**
- New column is derived; it's redundant (can be computed from `logged_at`).
- Must update it whenever logged_at is updated (or write a trigger).
- Storage overhead (every row has another column).
- Migration burden (backfill all existing rows).

**The index `idx_sets_user_logged`** already covers this query. Adding the derived column is **premature optimization**.

**When you'd add it:** If profiling showed this query was slow (unlikely at current scale), or if week-based logic appeared in many queries.

---

## 10. Interactive Widget: Schema Visualizer

**Description:**  
An interactive tool that renders the Peak Fettle schema as a node graph. Nodes are tables; edges are foreign keys. The tool allows:

- **Hover over a table** to see its columns and indexes.
- **Click a relationship** to highlight the join path and show example query patterns.
- **Filter by relationship type** (one-to-many, self-referential, etc.).
- **Show/hide indexes** to visualize which columns are indexed.
- **Simulate a cascade delete** — click a user node to highlight all rows that would be deleted by `ON DELETE CASCADE`.

**Interactions:**

1. Click "Show indexes" to toggle index visibility on columns.
2. Click a foreign key edge to see three example queries that use that relationship.
3. Click a table to see its CHECK constraints and triggers.

This widget would be generated from the `initial_schema.sql` file, parsed into a JSON structure, and rendered as an SVG or canvas diagram.

---

## Summary

- **Tables represent types; rows are instances.** A Set in C++ is a row in the sets table.
- **Primary keys ensure uniqueness.** Foreign keys create relationships and enforce referential integrity.
- **Normalization reduces redundancy; denormalization trades space for speed.** Peak Fettle stores `user_id` in sets (denormalization) for RLS and index performance.
- **Indexes are essential for performance.** Composite indexes like `(user_id, logged_at DESC)` speed up common queries.
- **Constraints enforce business rules.** CHECK constraints prevent invalid states at the database layer.
- **Migrations are versioned schema history.** Read them in order to understand the data model's evolution.

---

**Related readings:**  
- Postgres docs: Indexes, Foreign Keys, CHECK Constraints  
- SQL performance: Query planning and EXPLAIN  

**Next lesson:** L05 (SQL Percentile Batch) — how to compute rankings efficiently using SQL aggregates and window functions.
