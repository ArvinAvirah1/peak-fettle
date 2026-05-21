# TICKET-015 — Percentile Computation Architecture Clarification & Validation

**Owner:** dev-backend, dev-database  
**Date opened:** 2026-05-04  
**Phase:** C (backend API hardening)  
**Priority:** P1 (architectural correctness)  
**Depends on:** [TICKET-016](#ticket-016-future-roadmap-cohort-based-percentiles)  
**Source:** `Arvin` — architecture review session

---

## Goal

Ensure that **all current percentile calculations use the `compute_percentile.sql` model to derive relative strength**, and that this design is correctly implemented, documented, and validated. This is critical because:

1. **Sample size constraint:** With current user base (~5–20 users), cohort-based percentiles are statistically meaningless
2. **The solution:** Use the `compute_percentile.sql` model, which normalizes strength relative to a statistical model (not a cohort comparison)
3. **Future feature:** Cohort-based percentiles will be added *only* if/when the user base grows to 500+ users per weight class (see TICKET-016)

---

## Current Implementation Status

✅ **CORRECT** — The current code already implements this correctly:

- `peak-fettle-agents/server/routes/percentile.js` (lines 6–7): "CTO guardrail #2: percentile rankings are read from the batch-computed table; no live math happens here. compute_percentile() is called only by the cron."
- `peak-fettle-agents/server/cron/percentile.js`: Calls `compute_percentile_batch(1)` (a PostgreSQL function defined in `compute_percentile.sql`)
- `compute_percentile.sql` (lines 1–64): Defines `lift_vectors` table with parameters for (lift × sex) combinations; models strength via log-normal distribution

**What this means:** Percentile = user's lift relative to the statistical model, NOT relative to other users.

---

## Acceptance Criteria

### 1. Code Audit (Verify)

- [ ] Confirm that `percentile.js` line 33–39 reads **only** from `user_percentile_rankings` (pre-computed values)
- [ ] Confirm that `cron/percentile.js` calls `compute_percentile_batch(1)` — no direct cohort queries
- [ ] Confirm that `compute_percentile.sql` contains the log-normal model (mu, sigma, age curve, training curve)
- [ ] Grep the entire codebase for any live percentile math (e.g., `SELECT PERCENT_RANK()`, manual aggregations). Result should be: **zero matches**
- [ ] Grep for any code comparing a user to a cohort (e.g., "compare to athletes in your weight class"). Result should be: **zero matches** (safe to add in v2 roadmap)

### 2. Documentation (Add)

- [ ] Update `compute_percentile.sql` top-of-file comment (lines 1–14) to include:
  ```
  PERCENTILE STRATEGY (v1 — current implementation):
  - Computes each user's lift → percentile relative to the STRENGTH MODEL (log-normal)
  - Does NOT compare to other users (cohort comparison)
  - Why: Current sample size (~5–20 users) is too small for cohort percentiles
  - When: If user base reaches 500+ per weight class, add cohort percentiles as TICKET-016
  ```

- [ ] Update `peak-fettle-agents/server/routes/percentile.js` top-of-file comment to mirror the above

- [ ] Add a subsection to `dev-lead.md` under "Architecture decisions":
  ```
  ## Percentile Model (v1)
  - Strength is normalized relative to a log-normal statistical model, not cohort percentiles
  - This is optimal for small user bases (< 500 users per cohort)
  - The `compute_percentile.sql` file is canonical; no other percentile implementations exist
  - Cohort percentiles are planned for v2 (TICKET-016) if user base grows
  ```

- [ ] Update the API response in `percentile.js` to clarify "relative strength" vs "cohort rank":
  ```javascript
  cohort_note: 'Your strength is shown as a percentile relative to the strength model. ' +
               'Rankings are updated weekly. ' +
               'These are most meaningful with 500+ logged lifts in your exercise × weight class.'
  ```
  (Current text says "cohort" which is misleading given current sample size.)

### 3. Validation (Test)

- [ ] Add a test that calls `GET /percentile` and confirms the response schema:
  ```
  {
    rankings: [ { lift_id, percentile, computed_at, model_version }, ... ],
    cohort_note: "Your strength is shown as a percentile relative to the strength model..."
  }
  ```

- [ ] Add a test that verifies `percentile` is between 0 and 100 (sanity check)

- [ ] Add a test that verifies `model_version` is always 1 (no polymorphism yet)

### 4. Future-Proofing (Code)

- [ ] Add a comment in `percentile.js` routes:
  ```javascript
  // PERCENTILE MODEL (v1)
  // Reads from user_percentile_rankings, which is populated by the weekly cron.
  // This table stores strength RELATIVE TO THE STRENGTH MODEL (log-normal distribution).
  //
  // FUTURE (v2): Cohort-based percentiles will be added as a separate table
  // (cohort_percentile_rankings) once user base reaches 500+ per weight class.
  // See TICKET-016.
  ```

- [ ] Add a database migration comment (if not already present):
  ```sql
  -- This table stores precomputed percentiles for the STRENGTH MODEL (v1).
  -- It is populated weekly by the cron job (cron/percentile.js).
  -- Each row: (user_id, lift_id, percentile, computed_at, model_version=1)
  ```

---

## Known Issues / Traps to Avoid

❌ **Do not:**
- Add any "cohort percentile" logic to the API routes (even as a feature flag)
- Create a query that compares a user to other users' PRs (this is cohort logic)
- Change the `cohort_note` to say "compared to other athletes" without migrating to TICKET-016

✅ **Do:**
- Keep `compute_percentile.sql` as the single source of truth for the model
- Document the distinction: "strength model" (v1) vs "cohort comparison" (future v2)
- Reject any PR that tries to add real-time percentile math to the API route

---

## Testing Plan

### Manual

1. Call `GET /percentile` for a test user with several lifts logged.
2. Confirm response includes `percentile` between 0–100, `computed_at` is a recent timestamp.
3. Confirm the response includes the updated `cohort_note` text (mentions "strength model", not "cohort").
4. Check that response time is < 50ms (it's a simple `SELECT`, so should be instant).

### Automated (Jest)

```javascript
describe('GET /percentile', () => {
  test('returns precomputed percentiles, not live math', async () => {
    const res = await agent.get('/percentile');
    expect(res.status).toBe(200);
    expect(res.body.rankings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        lift_id: expect.any(String),
        percentile: expect.any(Number),
        model_version: 1,
        computed_at: expect.any(String)
      })
    ]));
    expect(res.body.cohort_note).toContain('strength model');
    expect(res.body.cohort_note).not.toContain('compared to other athletes');
  });

  test('percentile is always 0–100', async () => {
    const res = await agent.get('/percentile');
    res.body.rankings.forEach(r => {
      expect(r.percentile).toBeGreaterThanOrEqual(0);
      expect(r.percentile).toBeLessThanOrEqual(100);
    });
  });
});
```

---

## Output (per dev-context format)

After merge, dev-backend appends to `dev-lead.md` "Recently completed":

> `2026-05-04` — TICKET-015 percentile architecture clarification. Confirmed that all percentile calculations use the strength model (compute_percentile.sql), not cohort comparisons. Updated documentation in server routes, database comments, and API response text. Added Jest tests to validate schema and model_version consistency. Architecture is ready for TICKET-016 (cohort percentiles, conditional on user base growth).

**Files touched:**
- `compute_percentile.sql` — top-of-file comment updated
- `peak-fettle-agents/server/routes/percentile.js` — comment + cohort_note text updated, tests added
- `dev-lead.md` — new subsection "Percentile Model (v1)"
- `peak-fettle-agents/server/__tests__/percentile.test.js` — new test suite (if not present)

---

## Related

- **TICKET-016** — Future roadmap: cohort-based percentiles (depends on user base growth to 500+ per cohort)
- **compute_percentile.sql** — The canonical strength model (log-normal distribution)
- **migrations/20260502_percentile_engine.sql** — When the model was first shipped
