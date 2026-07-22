# SRV-FIX-CSVIMPORT — CSV import P0 fixes (SRV-DATA-01, SRV-DATA-02)

**File:** `peak-fettle-agents/server/routes/csvImport.js`
**Branch:** `fix/full-review-2026-06-19`
**Date:** 2026-06-20
**Verification:** `node --check peak-fettle-agents/server/routes/csvImport.js` → exit 0; 259 lines (not truncated).

---

## Context — the row shape & where the date comes from

The import handler (`POST /import/csv`) parses Garmin/Strava CSV rows into a flat
object via `parseGarminRow` / `parseStravaRow`. The only date field on each parsed
row is **`logged_at`** — an ISO-8601 timestamp string built from the CSV's activity
date (`row['Date']` for Garmin, `row['Activity Date']` for Strava):

```js
logged_at: row['Activity Date'] ? new Date(row['Activity Date']).toISOString() : null
```

Rows with no `logged_at` are dropped in Phase 1 (`skipped: 'missing date'`), so every
row that reaches Phase 2/3 is guaranteed to have a usable activity date. The calendar
day is extracted as `p.logged_at.split('T')[0]` → `"YYYY-MM-DD"`.

### day_key semantics (confirmed against the rest of the server)

`db/schema.sql`: `workouts.day_key DATE NOT NULL` — "canonical grouping key", with
`UNIQUE (user_id, day_key)`; "a workout = one calendar day (per dev-lead rule)".

Other insert paths derive `day_key` from the **activity calendar date**, never the
server clock:
- `routes/workouts.js` POST: binds the client-supplied `dayKey` directly into
  `INSERT INTO workouts (user_id, day_key, ...)`.
- `routes/workouts.js` rest-day: `new Date().toISOString().split('T')[0]` → the
  same `YYYY-MM-DD` form.

So the correct `day_key` for an imported activity is `p.logged_at.split('T')[0]`,
mirroring the existing convention exactly.

---

## SRV-DATA-01 — bulk INSERT omitted NOT NULL `day_key` (feature 100% broken: PG 23502)

The Phase-3 bulk INSERT never supplied `day_key`, so **every** import hit a
`not_null_violation (23502)` and the whole transaction rolled back — CSV import
was completely non-functional.

### Before
```js
const PER_ROW_COLS = 6; // activity_type, duration_seconds, distance_m, avg_pace, source, logged_at
const bindValues  = [userId];
const placeholders = toInsert.map((p, i) => {
    const base = 2 + i * PER_ROW_COLS;
    bindValues.push(
        p.activity_type,
        p.duration_seconds,
        p.distance_m,
        p.avg_pace_sec_per_km,
        p.source,
        p.logged_at,
    );
    return `($1, 'cardio_import', $${base}, $${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}::timestamptz)`;
});
...
`INSERT INTO workouts
   (user_id, session_type, activity_type, duration_seconds,
    distance_m, avg_pace_sec_per_km, source, created_at)
 VALUES ${placeholders.join(', ')}`
```

### After
```js
const PER_ROW_COLS = 7; // activity_type, duration_seconds, distance_m, avg_pace, source, logged_at, day_key
const bindValues  = [userId];
const placeholders = toInsert.map((p, i) => {
    const base = 2 + i * PER_ROW_COLS;
    bindValues.push(
        p.activity_type,
        p.duration_seconds,
        p.distance_m,
        p.avg_pace_sec_per_km,
        p.source,
        p.logged_at,
        p.logged_at.split('T')[0], // day_key (activity calendar day)
    );
    return `($1, 'cardio_import', $${base}, $${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}::timestamptz, $${base+6}::date)`;
});
...
`INSERT INTO workouts
   (user_id, session_type, activity_type, duration_seconds,
    distance_m, avg_pace_sec_per_km, source, created_at, day_key)
 VALUES ${placeholders.join(', ')}`
```

`day_key` is bound as `p.logged_at.split('T')[0]` cast `::date` — the activity's
calendar day, identical to the value the Phase-2 dedup keys on, and consistent with
`routes/workouts.js`. `created_at` continues to receive the full `logged_at`
timestamp (so insert-time provenance is preserved separately from the grouping day).

---

## SRV-DATA-02 — Phase-2 dedup keyed on `created_at` (server clock) instead of `day_key` (activity date)

Deduplication compared the **server insert time** (`created_at::date`) to incoming
activity dates. That is semantically wrong: a real duplicate of a workout imported
on a different day would slip through, and two genuinely distinct activities inserted
on the same server day could be false-flagged. Duplicates must be defined by the
**activity calendar day** (`day_key`), matching the candidate dates derived from
each row's `logged_at`.

### Before
```sql
SELECT
  created_at::date::text  AS day,
  duration_seconds
FROM workouts
WHERE user_id      = $1
  AND session_type = 'cardio_import'
  AND created_at::date = ANY($2::date[])
```

### After
```sql
-- SRV-DATA-02: dedup on the activity day_key (the calendar day the
-- workout happened), not created_at (server insert time).
SELECT
  day_key::text  AS day,
  duration_seconds
FROM workouts
WHERE user_id      = $1
  AND session_type = 'cardio_import'
  AND day_key = ANY($2::date[])
```

The dedup key string (`"<day>|<duration_seconds|NULL>"`) is unchanged; only the
source column flips from `created_at::date` to `day_key`. The `candidateDates` array
(built from `p.logged_at.split('T')[0]`) now compares like-for-like against stored
`day_key`s.

---

## Verification

- `node --check peak-fettle-agents/server/routes/csvImport.js` → **exit 0**.
- `wc -l` → **259** lines (not truncated).
- `grep` confirms no stray `created_at::date` remnant remains; `PER_ROW_COLS = 7`;
  `day_key` present in dedup SELECT (projection + `ANY()` filter) and in the INSERT
  column list / per-row placeholder / bound value.

## Concerns / notes

- **Scope honored:** only `csvImport.js` was the target of this fix. (Many other
  files show as modified in the working tree — those belong to other parallel fix
  tasks in this session and were not touched here.)
- The pre-existing CSV-003 ambiguity (Strava `Average Speed` unit m/s vs km/h) is
  **out of scope** and left as-is — the parser already clamps implausible paces to
  null. Not a regression from this change.
- No commit performed (per task instructions).
