# SRV-DATA findings

## Summary

Files reviewed: 5 (`sets.js`, `workouts.js`, `backup.js`, `csvImport.js`, `db.js`).
Counts — P0: 2 · P1: 1 · P2: 2 · P3: 1.
The data/sets/backup routes are well-structured and parameterized throughout; the single critical gap is that `csvImport.js` omits the `NOT NULL` `day_key` column from its INSERT, making every CSV import fail at the DB layer with a constraint error.

---

### [P0] SRV-DATA-01 — csvImport bulk INSERT omits NOT NULL `day_key`, crashing every import

- **File:** `peak-fettle-agents/server/routes/csvImport.js:236-240`
- **Problem:** The Phase 3 bulk INSERT lists `(user_id, session_type, activity_type, duration_seconds, distance_m, avg_pace_sec_per_km, source, created_at)` but omits `day_key`, which is declared `DATE NOT NULL` with no default in the `workouts` schema. Every call to `POST /import/csv` that reaches Phase 3 will receive Postgres error `23502` ("null value in column day_key of relation workouts violates not-null constraint"), which is rethrown as a 500 after the ROLLBACK. The CSV import feature is completely non-functional for any user.
- **Evidence:**
```js
await client.query(
    `INSERT INTO workouts
       (user_id, session_type, activity_type, duration_seconds,
        distance_m, avg_pace_sec_per_km, source, created_at)
     VALUES ${placeholders.join(', ')}`,
    bindValues
);
```
- **Invariant/Rubric:** P0 — correctness / data integrity; schema constraint violation causes 500 on every import attempt.
- **Suggested direction:** Add `day_key` to the column list and derive it from the parsed activity date (`p.logged_at.split('T')[0]`); add it to each per-row bind. Also align Phase 2 dedup (which queries `created_at::date`) to use `day_key` instead, since `created_at` is the DB row insertion timestamp (now vs. `logged_at`), making the dedup check semantically wrong even after the NOT NULL fix.
- **Confidence:** HIGH

---

### [P0] SRV-DATA-02 — csvImport Phase 2 dedup uses `created_at` (server time) instead of `day_key` (activity date), causing both false duplicates and missed dupes after the NOT NULL fix

- **File:** `peak-fettle-agents/server/routes/csvImport.js:181-189`
- **Problem:** The dedup SELECT filters `AND created_at::date = ANY($2::date[])` where `$2` is the list of activity dates from the CSV (e.g., `2026-05-15`). However, `created_at` is the timestamp the DB row was inserted (server wall-clock time), not the user's activity date. If a user imports on a different calendar day than the activity occurred, `created_at::date` won't match the CSV's `logged_at` date, and the dedup will miss all prior duplicates. Conversely, if a user imports two different activities (different dates) on the same calendar day, they will be misidentified as duplicates. Once SRV-DATA-01 is fixed and `day_key` is populated, the dedup query should filter on `day_key = ANY($2::date[])`.
- **Evidence:**
```js
const { rows: existing } = await pool.query(
    `SELECT
       created_at::date::text  AS day,
       duration_seconds
     FROM workouts
     WHERE user_id      = $1
       AND session_type = 'cardio_import'
       AND created_at::date = ANY($2::date[])`,   // ← wrong column
    [userId, candidateDates]
);
```
- **Invariant/Rubric:** P0 — data integrity; dedup logic silently fails, producing both phantom duplicates and missed duplicates.
- **Suggested direction:** Replace `created_at::date` with `day_key` in both the SELECT list (`day_key::text AS day`) and the WHERE clause (`AND day_key = ANY($2::date[])`). Update the bindValues to include `day_key` per row (same value used to fix SRV-DATA-01).
- **Confidence:** HIGH

---

### [P1] SRV-DATA-03 — `GET /sets/personal-best/:exerciseId` passes unvalidated path param to Postgres UUID cast, returning 500 instead of 400

- **File:** `peak-fettle-agents/server/routes/sets.js:220-296`
- **Problem:** The `exerciseId` path parameter is passed directly to `pool.query(..., [req.user.id, exerciseId])` where the `exercise_id` column is type `UUID`. If a client passes a non-UUID string (e.g. `"../admin"`, `"abc"`), Postgres throws `22P02` ("invalid input syntax for type uuid"), which propagates as an unhandled 500. The sibling `GET /sets?exercise_id=` path correctly validates with a UUID regex and returns an empty result; this endpoint lacks the same guard. (There is no SQL injection risk — the value is parameterized — but the 500 is wrong behavior on bad input.)
- **Evidence:**
```js
router.get('/personal-best/:exerciseId', async (req, res, next) => {
    try {
        const { exerciseId } = req.params;  // no UUID validation
        const atbResult = await pool.query(
            `... WHERE w.user_id = $1 AND s.exercise_id = $2 ...`,
            [req.user.id, exerciseId]   // 22P02 if non-UUID
        );
```
- **Invariant/Rubric:** P1 — unhandled exception on a valid client path; wrong HTTP status.
- **Suggested direction:** Add the same UUID regex guard used in `GET /sets?exercise_id=` before the query; return `{ all_time_best: null, last_session: null }` (or a 400) on invalid format. Alternatively, catch `22P02` in the `catch` block and return 400.
- **Confidence:** HIGH

---

### [P2] SRV-DATA-04 — `mileage-weekly` and `pace-trend` analytics silently return no data for cardio_import rows because they filter on `day_key` (which is NULL for all CSV-imported rows)

- **File:** `peak-fettle-agents/server/routes/workouts.js:303-315, 347-360`
- **Problem:** Both analytics endpoints filter `WHERE session_type = 'cardio_import' AND day_key::date >= ...`. Once SRV-DATA-01 is fixed to populate `day_key`, these queries will work. Before that fix, any rows that somehow reach the DB will have `day_key = NULL` and be excluded by the date filter, so the endpoints silently return empty results rather than an error. This is a cascading consequence of SRV-DATA-01; flagged separately because the analytics must also be tested when the import fix lands.
- **Evidence:**
```sql
WHERE user_id      = $1
  AND session_type = 'cardio_import'
  AND day_key::date >= (CURRENT_DATE - INTERVAL '8 weeks')
```
- **Invariant/Rubric:** P2 — silent data gap; analytics charts always empty for CSV-imported cardio sessions.
- **Suggested direction:** Fix SRV-DATA-01 first (populate `day_key`). No change needed here once `day_key` is correctly set on import.
- **Confidence:** HIGH

---

### [P2] SRV-DATA-05 — `backup.js` rate-limit counter resets on server restart (in-process Map), allowing unlimited PUT bursts after a deploy

- **File:** `peak-fettle-agents/server/routes/backup.js:39-55`
- **Problem:** `putCounters` is a module-level `Map` keyed by userId. Any Railway deploy (or crash/restart) resets all counters to zero, allowing a client to issue many more than 12 PUT/day calls by timing uploads around restarts. For a 5 MB blob this is a modest storage-abuse vector. The spec acknowledges this ("A more durable implementation (Redis) can replace this later") but it is a gap worth tracking.
- **Evidence:**
```js
const putCounters = new Map(); // resets on every process restart
function checkPutRateLimit(userId) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    // ...
}
```
- **Invariant/Rubric:** P2 — rate-limit bypass under normal deploy cadence; storage abuse possible.
- **Suggested direction:** Use a lightweight Postgres counter (`UPDATE users SET backup_upload_count = ... WHERE updated_at::date = today`) or Redis if available; fallback to the in-process Map for now but add a comment that Railway zero-downtime deploys spawn a new process, resetting the window.
- **Confidence:** HIGH

---

### [P3] SRV-DATA-06 — `normalizeSet` will silently double-set `weight_kg` if schema drift leaves both `weight_raw` and `weight_kg` on prod `sets` table

- **File:** `peak-fettle-agents/server/routes/sets.js:33-37`
- **Problem:** `normalizeSet` destructures `weight_raw` from the row and spreads `...rest`, then explicitly appends `weight_kg: decodeWeight(weight_raw)`. If the production `sets` table still has a legacy `weight_kg` column (i.e., the `20260505_sets_weight_raw.sql` migration's `DROP COLUMN weight_kg` step has not yet run), `SELECT s.*` will return both columns. The spread `...rest` will include the old `weight_kg` value, but since the explicit `weight_kg:` key comes after in the object literal, it overwrites with the correctly-decoded value — so the final output is numerically correct. The issue is invisible today but will produce unexpected results if any code inspects intermediate objects or if the property order is relied upon.
- **Evidence:**
```js
function normalizeSet(row) {
    if (!row) return row;
    const { weight_raw, ...rest } = row;          // rest may include legacy weight_kg
    return { ...rest, weight_kg: decodeWeight(weight_raw) };  // explicit key wins (correct)
}
```
- **Invariant/Rubric:** P3 — schema-drift tolerance; benign today but masked by property-override behavior.
- **Suggested direction:** Explicitly destructure `weight_kg` out of `rest` alongside `weight_raw` to make the intent clear: `const { weight_raw, weight_kg: _ignored, ...rest } = row;`. No functional change needed on the canonical schema.
- **Confidence:** MED (depends on whether DROP COLUMN has run on prod)
