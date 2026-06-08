# L06: Supabase — Managed Postgres, Auth, RLS, and Vendor Lock-In

**Peak Fettle Codebase Curriculum**  
**Bloom Levels:** L1 (Recall), L2 (Understand), L3 (Apply), L4 (Analyze), L5 (Evaluate)  
**Estimated read time:** 75 minutes  
**Prerequisites:** L01, L02, L03, L04, L05  
**Code sources:** `peak-fettle-agents/server/db.js`, `.env.example`, `migrations/20260503_rls_policies.sql`, `database_decision_memo.md`

---

## 0. Why This Matters

Peak Fettle could have stored data in Firebase, MongoDB, or managed their own Postgres server on AWS. Instead, they chose **Supabase** — a Backend-as-a-Service (BaaS) that provides managed Postgres + Auth + Row-Level Security. This lesson teaches you:

- **What Supabase gives you** — automatic backups, SSL, authentication, RLS.
- **The anon key vs. service-role key** — and why some operations need the latter.
- **Row-Level Security (RLS)** — how the database enforces access control without app logic.
- **Connection pooling** — why Peak Fettle uses 2 connections (not 20) to a nano instance.
- **Vendor lock-in** — how "Postgres exit optionality" is real but harder than it sounds.

By the end, you'll be able to:
- Understand how Supabase auth integrates with the database.
- Read and write RLS policies to enforce access control.
- Migrate data *away* from Supabase (and understand what's hard about it).
- Reason about whether Supabase is the right choice for a new feature.

---

## 1. What is Supabase?

### 1.1 The Supabase Stack

Supabase is a managed Postgres database + authentication layer + real-time API, similar to Firebase but built on open-source components:

```
┌─────────────────────────────────────────┐
│        Your App (mobile / web)          │
└────────────────┬────────────────────────┘
                 │ HTTPS
                 ▼
┌─────────────────────────────────────────┐
│      Supabase API Gateway                │
│  (JWT validation, RLS enforcement)      │
└────────────────┬────────────────────────┘
                 │ TCP/SSL
                 ▼
┌─────────────────────────────────────────┐
│      Postgres Database (hosted)          │
│  (tables, functions, RLS policies)      │
└─────────────────────────────────────────┘
```

### 1.2 Key Components

**1. Managed Postgres**
- Hosted on Supabase's infrastructure (currently AWS or other clouds).
- Automatic backups, SSL encryption, monitoring.
- You don't manage servers; you write SQL.

**2. Authentication**
- Supabase Auth provides user signup, login, and JWT tokens.
- Peak Fettle uses this to authenticate users without building an auth service.

**3. Row-Level Security (RLS)**
- SQL policies that filter rows based on the authenticated user.
- A user can only see/modify their own data.

**4. Real-Time Subscriptions (optional)**
- Listen for changes to specific rows/tables.
- Peak Fettle doesn't use this yet (polling is sufficient).

### 1.3 Pricing Model

Supabase has tiered pricing:

- **Free tier:** 500 MB storage, 1 project, limited realtime.
- **Pro:** $25/month + overage, includes custom domains, more storage.

Peak Fettle likely uses the **Pro tier** or custom plan. The "nano instance" mentioned in the code means a small Postgres cluster (512 MB RAM).

---

## 2. Keys and Authentication

### 2.1 The Anon Key and Service-Role Key

Supabase provides two API keys:

| Key | Purpose | Security | Used for |
|-----|---------|----------|----------|
| **Anon Key** | Public, included in client-side code | Low — assumes RLS enforces access | User-initiated actions (login, fetch own data) |
| **Service Role Key** | Secret, stored server-side only | High — full database access | Server-side scripts (cron jobs, admin operations) |

In the mobile app:

```cpp
// Client uses anon key (visible in APK)
Supabase::Client client("https://...", "eyJ...");  // Anon key
auto session = client.auth().signUp("user@example.com", "password");
auto myWorkouts = client.from("workouts").select().execute();  // Filtered by RLS
```

In the backend cron job:

```javascript
// Server uses service-role key (secret)
const adminClient = require('@supabase/supabase-js')
    .createClient(supabaseUrl, serviceRoleKey);

// Can access any user's data (RLS is bypassed)
const allPercentiles = await adminClient
    .from('user_percentile_rankings')
    .select();
```

### 2.2 JWT Tokens

When a user logs in, Supabase issues a **JWT (JSON Web Token)** containing their user ID:

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440001",  // user ID
  "email": "alice@example.com",
  "iat": 1716266400,
  "exp": 1716352800
}
```

The app stores this token and includes it in HTTP requests:

```
GET /api/workouts
Authorization: Bearer eyJhbGc...
```

The API gateway verifies the JWT signature and extracts the user ID, making it available to RLS policies as `auth.uid()`.

---

## 3. Row-Level Security (RLS): Access Control in the Database

### 3.1 The Problem RLS Solves

Without RLS:

```javascript
// Backend endpoint
app.get('/api/workouts/:userId', async (req, res) => {
    // Check: does the authenticated user match the URL parameter?
    if (req.user.id !== req.params.userId) {
        return res.status(403).send('Forbidden');
    }
    const workouts = await db.query(
        'SELECT * FROM workouts WHERE user_id = $1',
        [req.params.userId]
    );
    res.json(workouts);
});
```

Every endpoint must manually check access. It's easy to forget, causing data leaks.

**With RLS:**

```sql
CREATE POLICY "workouts_self_only" ON workouts
    FOR ALL USING (auth.uid() = user_id);
```

The database itself enforces: "A user can only see/modify workouts where `user_id` matches their JWT." No app-side check needed.

### 3.2 RLS Policies in Peak Fettle

The migrations define policies for each table:

```sql
-- File: migrations/20260503_rls_policies.sql

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_self_only" ON users
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "workouts_self_only" ON workouts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "sets_self_only" ON sets
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "plans_self_or_template" ON plans
    FOR SELECT USING (auth.uid() = user_id OR is_template = TRUE);

CREATE POLICY "plans_write_self" ON plans
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plans_update_self" ON plans
    FOR UPDATE USING (auth.uid() = user_id);
```

**Key policies:**

1. **users_self_only** — Can only read/update your own user row.
2. **workouts_self_only** — Can only access your own workouts.
3. **sets_self_only** — Can only access your own sets.
4. **plans_self_or_template** — Can read templates (shared), but only modify your own plans.

### 3.3 Global Read-Only Tables

Some tables are global and read-only:

```sql
-- exercises table: global library, no RLS
-- (no RLS needed; writes happen via service-role key only)

CREATE TABLE exercises (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    ...
);

-- percentile_vectors: lookup table, no RLS
CREATE TABLE percentile_vectors (
    id UUID PRIMARY KEY,
    exercise_id UUID NOT NULL,
    distribution JSONB,
    ...
);
-- No policy: all users can read
```

These tables have no RLS policies because all users should be able to read them, and writes only happen via cron jobs (service-role key).

### 3.4 How RLS Evaluation Works

When a user runs a query:

```sql
SELECT * FROM sets WHERE exercise_id = 'back_squat_uuid';
```

Postgres internally rewrites it to:

```sql
SELECT * FROM sets
WHERE exercise_id = 'back_squat_uuid'
  AND auth.uid() = user_id;  -- RLS policy applied
```

If the user tries to access another user's sets:

```sql
SELECT * FROM sets WHERE user_id = '550e8401-e29b-41d5';
```

Postgres rewrites it to:

```sql
SELECT * FROM sets
WHERE user_id = '550e8401-e29b-41d5'
  AND auth.uid() = user_id;  -- This is FALSE
```

Result: Empty set. The user can't see those rows.

---

## 4. Connection Pooling

### 4.1 The Connection Pool

Peak Fettle's backend uses a **connection pool** to the Postgres database:

```javascript
// File: peak-fettle-agents/server/db.js

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,                      // Max 2 connections
    idleTimeoutMillis: 10_000,  // Drop idle connections after 10 seconds
    connectionTimeoutMillis: 10_000
});
```

**Why this configuration?**

- **max: 2** — Supabase's nano instance (512 MB RAM) can't handle many concurrent connections. 2 is enough for:
  - 1 active request processing a query.
  - 1 spare for burst traffic.
- **idleTimeoutMillis: 10_000** — Don't hold connections open. Release them promptly so other apps can use resources.
- **connectionTimeoutMillis: 10_000** — If all 2 connections are busy and a 3rd request comes in, fail fast (don't queue forever).

### 4.2 How the Pool Works

Request 1:
```
App request → Get connection from pool → Run query → Release connection
```

Request 2 (arrives while Request 1 is running):
```
App request → Get second connection from pool → Run query → Release
```

Request 3 (arrives when pool is full):
```
App request → All connections busy → Wait 10 seconds for one to free up
              → If no connection frees, reject request (connectionTimeoutMillis exceeded)
```

**Why not max: 20?**
- Supabase charges for peak connections (not average).
- Postgres on a nano instance can't handle 20 concurrent connections.
- Each connection uses memory; 20 connections * 5 MB/connection = 100 MB (more than the instance has).

### 4.3 Scaling the Pool

As Peak Fettle grows:

```
Current: max: 2, nano instance (512 MB)
  ↓
Move to: max: 5–10, micro instance (1 GB)
  ↓
Move to: max: 20+, small instance (2 GB+)
```

This is straightforward — just update `db.js` and upgrade the Supabase tier. No app logic changes.

---

## 5. The Supabase URL and Environment Variables

### 5.1 Connection String

Peak Fettle stores the database URL as:

```
SUPABASE_DB_URL=postgresql://postgres.550e8400:[password]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

Breaking it down:

```
postgresql://              ← Protocol
  postgres.550e8400        ← User (role)
  :password                ← Postgres password
  @aws-0-us-west-1.pooler.supabase.com  ← Host (Supabase-managed)
  :6543                    ← Port (Supabase's connection pooler)
  /postgres                ← Database name
```

**Supabase connection pooler** — Instead of connecting directly to the Postgres server, you connect to Supabase's **PgBouncer** pooler. It manages connections more efficiently.

### 5.2 Environment Variables

The .env file contains:

```
SUPABASE_DB_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
```

These are never committed to git. Instead:

1. Store them in `.env.local` (local development).
2. In production, set them via environment variables (e.g., GitHub Secrets, Heroku Config).

---

## 6. Worked Example: Tracing an Account Deletion

**Scenario:** A user deletes their account. What happens?

### 6.1 Step 1: User Initiates Deletion

The mobile app calls:

```cpp
supabaseAuth.deleteUser();  // Supabase Auth API
```

Supabase Auth:
1. Marks the user in the auth system as deleted.
2. Calls a backend webhook (if configured) to notify Peak Fettle.

### 6.2 Step 2: Backend Cascades the Delete

Peak Fettle's backend receives a webhook:

```javascript
// Endpoint: DELETE /api/auth/user/:userId (with service-role key)

app.delete('/api/auth/user/:userId', async (req, res) => {
    const { userId } = req.params;
    
    const adminClient = createClientWithServiceRoleKey();
    
    // Delete the user row (cascades to workouts, sets, plans, etc.)
    await adminClient
        .from('users')
        .delete()
        .eq('id', userId);
    
    res.json({ deleted: true });
});
```

Using the service-role key (not RLS-filtered), delete the user row.

### 6.3 Step 3: Cascade Deletes

The database has `ON DELETE CASCADE` on foreign keys:

```sql
CREATE TABLE workouts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ...
);
```

When the user row is deleted, Postgres automatically deletes:
1. All workouts for that user.
2. All sets in those workouts.
3. All plans owned by that user.
4. All streaks for that user.

**Result:** Complete account deletion, no orphaned data.

### 6.4 Step 4: Verify RLS Still Works

If the user was malicious and somehow got access to an old JWT token:

```sql
-- Old request with expired JWT
SELECT * FROM sets WHERE user_id = '550e8400-e29b-41d4';
```

Postgres rewrites it (RLS policy):

```sql
SELECT * FROM sets
WHERE user_id = '550e8400-e29b-41d4'
  AND auth.uid() = '550e8400-e29b-41d4'  -- TRUE, but table is empty
  AND ... (other policies)
```

The policy **allows** the query (it's their user ID), but there are no rows left, so the result is empty. RLS is still enforced.

---

## 7. Vendor Lock-In: The "Postgres Exit Optionality" Claim

### 7.1 The Claim

Peak Fettle's decision memo argues:

> Supabase was chosen partly for "Postgres exit optionality" — the ability to migrate to self-hosted Postgres or another provider without being locked in to Supabase-specific APIs.

### 7.2 The Reality: What's Portable?

**Easy to migrate (portable):**
- **SQL schema** — All migrations are pure Postgres. Copy them to any Postgres instance.
- **Data** — Use `pg_dump` to export data, `psql` to import to another instance.
- **Backend code** — The `pg` Node.js library works against any Postgres server.

**Hard to migrate (vendor lock-in):**

1. **Authentication** — Supabase Auth generates JWTs. To migrate, you'd need to:
   - Rebuild auth (OAuth, signup, password reset, etc.) — weeks of work.
   - Or, run your own Supabase instance (still vendor lock-in, just self-hosted).

2. **RLS policies + auth.uid()** — RLS policies reference `auth.uid()`, which is Postgres' auth context. When migrating:
   - If moving to another Postgres instance with Supabase, auth continues to work.
   - If moving to a non-Postgres database (e.g., MongoDB), RLS doesn't exist; you must re-implement access control in the app.

3. **Real-time subscriptions** — Supabase's real-time is based on Postgres LISTEN/NOTIFY. Portable to any Postgres, but the client-side library (`supabase-js`) is Supabase-specific. Would need a different real-time library.

### 7.3 Migration Scenarios

**Scenario A: Self-host Postgres, keep Supabase Auth**

1. Export all migrations from Supabase.
2. Run them against a self-hosted Postgres instance.
3. Keep using Supabase Auth (or migrate to Auth0/Okta).
4. RLS policies work unchanged (they're pure Postgres).

**Effort:** 2–4 weeks. Mostly re-configuring infrastructure.

**Scenario B: Migrate to MongoDB**

1. Manually convert schema (no automated migration).
2. Rewrite all queries (SQL → MongoDB queries).
3. Remove RLS (reimplement in app as authorization middleware).
4. Move from Postgres-specific functions (norm_cdf, window functions) to app logic.

**Effort:** 2–3 months. Major rewrite.

**Scenario C: Migrate to Firebase**

1. Export data from Postgres.
2. Restructure for Firestore's document model.
3. Remove RLS (use Firestore security rules instead).

**Effort:** Similar to Scenario B.

### 7.4 The Lock-In You're Actually In

**The real lock-in:**

1. **Auth system** — Supabase Auth is tightly integrated. Switching costs significant effort.
2. **RLS patterns** — The codebase is designed around RLS. If you move databases, you must rewrite access control.
3. **Dependency on Postgres SQL dialects** — The percentile functions use Postgres-specific syntax (recursive CTEs, window functions). Moving to MySQL would require rewriting.

**What's NOT locked in:**

- Data format (standard SQL relations).
- Backend language (Node.js is language-agnostic).
- Application logic (no Supabase SDK deep in business logic).

### 7.5 Realistic Assessment

The claim that "Postgres exit optionality" is real but **narrower than it sounds**:

- **Easy to exit:** Migrate within Postgres ecosystem (self-hosted Postgres, RDS, etc.). Cost: 2–4 weeks.
- **Hard to exit:** Migrate to a different database entirely. Cost: 2–3 months + significant rewrites.

**Bottom line:** Supabase is a good choice *if* you're comfortable with Postgres long-term. If you might need a different database (e.g., document-oriented for a pivot to a different product), you're somewhat locked in.

---

## 8. Quiz: Levels L1–L5

### 8.1 Quiz Q1: Anon vs. Service-Role Key (L1 — Recall)

**Prompt:**  
Which key should be used in client-side code (e.g., the mobile app)?

A) Service-role key (for security).  
B) Anon key (relies on RLS to filter access).  
C) Both (anon for reads, service-role for writes).  
D) Neither (use your own authentication).

**Model answer:** B

**Explanation:** The anon key is included in the app (it's visible in the APK). RLS prevents unauthorized access.

**Rubric:**
- 5 points for B.
- 1 point for A (showing understanding that security matters, but confusing which key is for what).

**Point value:** 5 points

---

### 8.2 Quiz Q2: RLS Policy Evaluation (L2 — Understand)

**Prompt:**  
A user logs in with JWT token `{ sub: 'user-123', email: 'alice@example.com' }`. They run:

```sql
SELECT * FROM sets WHERE kind = 'lift';
```

With the policy `CREATE POLICY "sets_self_only" ON sets FOR ALL USING (auth.uid() = user_id)`, what does Postgres return?

A) All lift sets from all users.  
B) Only lift sets where `user_id = 'user-123'`.  
C) An error (RLS forbids this query).  
D) Nothing (policy is not evaluated for SELECT).

**Model answer:** B

**Explanation:** Postgres rewrites the query to add the RLS condition: `WHERE kind = 'lift' AND auth.uid() = user_id` (i.e., `auth.uid() = 'user-123'`).

**Rubric:**
- 5 points for B with explanation.
- 3 points for B without explanation.

**Point value:** 5 points

---

### 8.3 Quiz Q3: Connection Pooling Configuration (L3 — Apply)

**Prompt:**  
Peak Fettle uses `max: 2` connections for a nano instance. Why not `max: 20`?

A) It's a best practice.  
B) Nano instance doesn't have memory for 20 connections; also, Supabase charges per peak connection.  
C) 20 is too many for any database.  
D) To prevent the pool from growing too large.

**Model answer:** B

**Rubric:**
- 5 points for B with explanation.
- 3 points for B without explanation.
- 2 points for D (partially correct; pool size does impact growth, but misses resource constraints).

**Point value:** 5 points

---

### 8.4 Quiz Q4: RLS and Service-Role Key (L4 — Analyze)

**Prompt:**  
Why can the cron job (percentile.js) access *any* user's data while regular users can't?

A) The cron job uses the service-role key, which bypasses RLS.  
B) The cron job has special permissions (sudo).  
C) RLS doesn't apply to computed values.  
D) Cron jobs run as 'postgres' role, which has super-user access.

**Model answer:** A

**Explanation:** Supabase's service-role key has full database access (bypasses RLS). Anon key respects RLS.

**Rubric:**
- 5 points for A with explanation.
- 3 points for A without explanation.
- 1 point for D (partially correct; service-role does have elevated access, but not exactly "postgres" role).

**Point value:** 5 points

---

### 8.5 Quiz Q5: Vendor Lock-In Evaluation (L5 — Evaluate)

**Prompt:**  
A startup chooses Supabase. Later, they want to migrate to Firebase for a pivot. Analyze the vendor lock-in:

1. **What's easy to migrate?** (Data, schema, business logic)
2. **What's hard to migrate?** (Auth, RLS, Postgres-specific SQL)
3. **How much effort is required?** (2 weeks? 2 months?)
4. **Is "Postgres exit optionality" real?**

**Model answer:**

1. **Easy to migrate:**
   - **Schema** — Export migrations, run against Firebase Firestore (with manual conversion).
   - **Data** — Dump from Postgres, import to Firestore (with restructuring).
   - **Business logic** — Node.js code is database-agnostic (mostly).

2. **Hard to migrate:**
   - **Auth** — Supabase Auth would need to be replaced with Firebase Auth. Passwords, tokens, signup flows all change.
   - **RLS** — Postgres RLS has no direct Firestore equivalent. Must reimplement as app-side authorization middleware.
   - **SQL functions** — `compute_percentile()` uses Postgres-specific syntax. Would need to rewrite in Node.js or Firestore Cloud Functions.

3. **Effort:**
   - **Optimistic:** 2 months (if the pivot is to a similar product).
   - **Realistic:** 3–4 months (extensive testing, edge case handling).
   - **Pessimistic:** 6 months (auth migration alone takes 4–6 weeks).

4. **Is "Postgres exit optionality" real?**
   - **Within Postgres ecosystem:** Yes. Migrate to self-hosted or RDS in 2–4 weeks.
   - **To a different database:** Somewhat overstated. You can exit, but it's a 3–6 month project.
   - **Pragmatic view:** Supabase (Postgres) is a good choice *if* you're building a standard relational app. If you need flexibility to pivot to a different data model, you're somewhat locked in.

**Rubric:**
- 10 points if the answer addresses all 4 questions, acknowledging that "exit optionality" is real within Postgres but overstated for other databases.
- 7 points if it answers 3 of 4 questions correctly.
- 4 points if it shows understanding but misses nuances (e.g., says migration is "easy" without quantifying effort).

**Point value:** 10 points

---

## 9. Capstone: Account Deletion and Data Retention

### 9.1 Scenario: GDPR Compliance

Peak Fettle is used by European users and must comply with GDPR Article 17 ("right to be forgotten"). When a user requests account deletion:

1. All personal data must be deleted.
2. Deletion must happen within 30 days.
3. Backups must not expose old data.

### 9.2 Current Implementation

```sql
-- Soft delete: set deleted_at
UPDATE users SET deleted_at = NOW() WHERE id = 'user-123';

-- RLS filters out soft-deleted rows:
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_not_deleted ON users
    FOR ALL USING (deleted_at IS NULL);
```

**Problem:** Soft deletes don't truly erase data. If Supabase has backups, old data persists.

### 9.3 Hard Delete Requirement

To fully comply with GDPR:

```sql
-- Hard delete: actually remove the row
BEGIN;
DELETE FROM sets WHERE user_id = 'user-123';          -- deletes via CASCADE
DELETE FROM plans WHERE user_id = 'user-123';
DELETE FROM streaks WHERE user_id = 'user-123';
DELETE FROM users WHERE id = 'user-123';              -- hard delete
COMMIT;
```

**With CASCADE, this is atomic** — all related rows are deleted in one transaction.

**Backup challenge:** Supabase takes daily backups. If the user is deleted today, old backups still contain their data. GDPR technically requires overwriting backups (though in practice, retention policies usually cover this).

### 9.4 Discussion: Soft vs. Hard Deletion

**Soft delete (current):**
- **Pro:** Reversible (accidental deletes can be undone). Maintains audit trail. Soft deletes don't require migrations.
- **Con:** Not truly compliant with GDPR. Data accumulates over time.

**Hard delete:**
- **Pro:** Truly erases data. GDPR compliant.
- **Con:** Irreversible. Audit trail is lost. Requires careful migration planning.

**Peak Fettle's solution:** Probably a **hybrid**:
- Soft-delete in the app (for UX reversibility).
- Hard-delete after 30 days (GDPR grace period; Supabase deletes from backups after 30 days).
- Or, add a `soft_deleted_at` vs. `hard_deleted_at` flag.

---

## 10. Interactive Widget: RLS Policy Simulator

**Description:**  
An interactive tool that simulates how RLS policies are evaluated.

**Inputs:**
- **JWT token:** Paste a JWT or set a user ID manually (e.g., `user-123`).
- **SQL query:** Write a query (e.g., `SELECT * FROM sets WHERE exercise_id = '...'`).
- **RLS policies:** Display the active policies (from `rls_policies.sql`).

**Simulation:**
1. User types a query.
2. Tool shows the **rewritten query** with RLS conditions applied.
3. Display whether the query would succeed or return empty (based on the JWT user ID).
4. Allow toggling between "anon key" (RLS applied) and "service-role key" (RLS bypassed).

**Example:**

```
User ID: user-123
Query:   SELECT * FROM sets WHERE exercise_id = 'back_squat'

RLS Policy: CREATE POLICY "sets_self_only" ON sets
    FOR ALL USING (auth.uid() = user_id)

Rewritten:  SELECT * FROM sets
            WHERE exercise_id = 'back_squat'
              AND auth.uid() = user_id
              AND auth.uid() = 'user-123'

Result:     Returns only sets where user_id = 'user-123' and exercise_id = 'back_squat'
```

This tool helps visualize RLS enforcement in real-time, demystifying how access control works at the database layer.

---

## Summary

- **Supabase = Managed Postgres + Auth + RLS** — No need to manage servers.
- **Anon key** (client-side) respects RLS. **Service-role key** (server-side) bypasses it.
- **RLS policies** enforce access control at the database layer, preventing bugs and data leaks.
- **Connection pooling** is essential on managed instances. Peak Fettle uses 2 connections to a nano instance.
- **"Postgres exit optionality" is real within Postgres, but migrating to a different database is hard.** Expect 3–6 months if you need to switch.
- **Vendor lock-in is primarily in Auth and RLS.** The SQL schema is portable; the auth and access control patterns are not.

---

**Related readings:**
- Supabase docs: Authentication, Row-Level Security
- Postgres docs: Row Security Policies
- GDPR and data deletion best practices

**Next lesson:** L07 (API Design & GraphQL/REST Patterns) — how Peak Fettle exposes the database to the mobile app.
