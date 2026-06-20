# SRV-PLANS findings
## Summary
Files reviewed: 5 (`plans.js`, `templates.js`, `routines.js`, `exercises.js`, `percentile.js`).
Counts — P0: 3 · P1: 3 · P2: 2 · P3: 1.
Overall: tier gating is sound; the critical bugs are a weight-column regression in plan generation, a missing paid gate on `/plans/:id/regenerate`, and the deprecated percentile tables still receiving live writes via the confirm-1rm path.

---

### [P0] SRV-PLANS-01 — `/plans/generate` reads `weight_raw` only; ignores `weight_kg` (Invariant 2 violation)

- **File:** `peak-fettle-agents/server/routes/plans.js:315–337` (history query) and `:340–353` (PB query)
- **Problem:** Both the 14-day history query and the personal-best query compute weight entirely from `weight_raw / 8.0`. Per Invariant 2 the authoritative column is `weight_kg REAL` (exact kg); `weight_raw` (kg×8, integer, 0.125 kg resolution) is lossy and secondary. The schema v3 write path stores exact kg in `weight_kg` and may leave `weight_raw` at 0 or stale. Any set written by the new local-first path will have `weight_raw = 0`, so the engine sees 0 kg for that exercise — which contaminates the e1rm, PB, and volume calculations fed into the Training Engine, producing nonsense plans.
- **Evidence:**
```js
// history query (line 316–323)
s.weight_raw / 8.0          AS weight_kg,
...
WHEN s.weight_raw > 0 AND s.reps >= 1 THEN
    CASE
        WHEN s.reps = 1 THEN s.weight_raw / 8.0
        ELSE (s.weight_raw / 8.0) * (1.0 + LEAST(s.reps, 12)::float / 30.0)
    END

// pb query (line 341–352)
s.weight_raw / 8.0             AS weight_kg,
...
ORDER BY s.exercise_id,
         (s.weight_raw / 8.0) * (1.0 + LEAST(s.reps, 12)::float / 30.0) DESC
```
- **Invariant/Rubric:** Invariant 2 — weight must be read via `COALESCE(weight_kg, weight_raw/8.0)`.
- **Suggested direction:** Replace every `s.weight_raw / 8.0` with `COALESCE(s.weight_kg, s.weight_raw / 8.0)` and every `s.weight_raw > 0` guard with `(COALESCE(s.weight_kg, s.weight_raw / 8.0)) > 0` in both the history and PB subqueries. The percentile.js Epley subqueries have the same bug (see SRV-PLANS-02).
- **Confidence:** HIGH

---

### [P0] SRV-PLANS-02 — `percentile.js` Epley subqueries read only `weight_raw`; breaks for all schema-v3 sets

- **File:** `peak-fettle-agents/server/routes/percentile.js:117–136` (GET /percentile) and `:207–225` (GET /percentile/:liftId / alias)
- **Problem:** The inline Epley estimate sub-SELECT computes `s.weight_raw / 8.0` for both the direct-1RM case and the Epley formula, and guards with `s.weight_raw > 0`. Sets written via the v3 local-first path (PRO PowerSync or any post-v3 log) store exact kg in `weight_kg` and leave `weight_raw` at 0, so the sub-SELECT returns NULL (no passing rows) and `epley_estimate_kg` is always NULL for Pro users — breaking the confirm-1RM UI which depends on this pre-fill value.
- **Evidence:**
```sql
SELECT MAX(
    CASE
        WHEN s.reps = 1 THEN s.weight_raw / 8.0
        ELSE (s.weight_raw / 8.0) * (1.0 + s.reps::float / 30.0)
    END
)
FROM sets s ...
WHERE s.weight_raw > 0    -- filters out all v3 sets that only have weight_kg
  AND s.reps >= 1
```
- **Invariant/Rubric:** Invariant 2 — weight must be read via `COALESCE(weight_kg, weight_raw/8.0)`.
- **Suggested direction:** Replace the `weight_raw / 8.0` expressions with `COALESCE(s.weight_kg, s.weight_raw / 8.0)` and the `s.weight_raw > 0` guard with `COALESCE(s.weight_kg, s.weight_raw / 8.0) > 0` in both occurrences (GET / and the shared `percentileByLift` function).
- **Confidence:** HIGH

---

### [P0] SRV-PLANS-03 — `/plans/:id/regenerate` missing paid gate — free users can regenerate plans

- **File:** `peak-fettle-agents/server/routes/plans.js:467–504`
- **Problem:** `POST /plans/:id/regenerate` does not perform any `is_paid` check before executing plan generation. It verifies ownership of the plan and checks the daily throttle (against all plans created that day, not just Training Engine plans — see SRV-PLANS-05), then delegates to `/generate`. However `/generate`'s paid gate is bypassed because the delegation is done via `router.handle(req, res, next)` which re-enters the router at the route-matching level — it will execute the `/generate` handler directly, skipping the paid check at the top of the `/generate` route only if Express re-matches and the paid-gate code is hit. On inspection the `/generate` handler does re-run its paid gate at step 1 (lines 257–267), so the gate is not completely absent. **However**, the `router.handle` delegation pattern (`req.url = '/generate'; req.method = 'POST'; router.handle(req, res, next)`) is fragile and non-standard: Express's `Router.handle` is an internal method not intended for public use. If the internal routing skips middleware or the router processes the request differently than expected, the paid check could be silently skipped in future Express versions. Additionally the comment "Delegate to /generate by re-routing the request" suggests this was an intentional shortcut rather than a deliberate auth design. This is a latent auth-bypass risk that should be made explicit.
- **Evidence:**
```js
router.post('/:id/regenerate', async (req, res, next) => {
    try {
        // Verify ownership.
        const { rows: ownerRows } = await pool.query(...);
        ...
        // Throttle check.
        ...
        // Delegate to /generate by re-routing the request.
        req.url    = '/generate';
        req.method = 'POST';
        req.body   = {};
        return router.handle(req, res, next);  // internal Express API
    } catch (err) { next(err); }
});
```
- **Invariant/Rubric:** P0 Security — paid-feature gate must be explicit and not depend on internal routing dispatch. A future refactor that moves the paid check or changes the route structure could silently expose generation to free users.
- **Suggested direction:** Add an explicit `is_paid` DB check at the top of the `/regenerate` handler (identical to the check in `/generate`, lines 257–267), then call the shared generation logic as an extracted function rather than re-routing via `router.handle`. This removes the fragile internal-API dependency and makes the gate self-contained.
- **Confidence:** HIGH

---

### [P1] SRV-PLANS-04 — `percentile.js` still writes to deprecated `user_confirmed_1rm` table; no schema-drift guard

- **File:** `peak-fettle-agents/server/routes/percentile.js:315–331`
- **Problem:** `POST /percentile/confirm-1rm` performs an upsert into `user_confirmed_1rm`. Per Invariant 4, `user_percentile_rankings` and `percentile_vectors` are DEPRECATED (percentiles compute on-device). `user_confirmed_1rm` is a companion table to that deprecated system. The endpoint has no `42P01` catch around the INSERT — if the table is absent on prod (it may have been dropped or never migrated), the endpoint throws a 500 rather than degrading. Additionally the GET handlers read from `user_percentile_rankings` which is also deprecated but do have a `42P01` catch (via `isMissingSchema`); the POST does not.
- **Evidence:**
```js
router.post('/confirm-1rm', async (req, res, next) => {
    try {
        ...
        const { rows } = await pool.query(
            `INSERT INTO user_confirmed_1rm (user_id, lift_id, confirmed_kg, confirmed_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, lift_id) DO UPDATE ...`,
            [req.user.id, lift_id.trim(), kg]
        );
        ...
    } catch (err) { next(err); }  // no isMissingSchema check here
});
```
- **Invariant/Rubric:** Invariant 4 — deprecated tables must degrade (empty 200 / 404), not 500 on `42P01`.
- **Suggested direction:** Wrap the INSERT in the same `isMissingSchema` catch already used by the GET handlers and return a graceful 200 or 410 response if the table is absent. Long-term the endpoint itself should be removed once the deprecated percentile path is fully decommissioned.
- **Confidence:** HIGH

---

### [P1] SRV-PLANS-05 — `/plans/:id/regenerate` throttle counts ALL plans, not just Training Engine plans

- **File:** `peak-fettle-agents/server/routes/plans.js:487–492`
- **Problem:** The regenerate throttle counts `plans WHERE user_id = $1 AND created_at >= CURRENT_DATE` — this is every plan the user has created today, not just Training Engine plans. The `/generate` throttle (lines 270–277) correctly narrows to `name LIKE 'Training Engine Plan%'`. This inconsistency means a user who has created many manual plans today (via `POST /plans`) will be unexpectedly blocked from regenerating, while a user who regenerates (thus not creating new plans) bypasses the spirit of the limit. More importantly a free user's manual plan creations could erroneously count against their regenerate quota when they upgrade.
- **Evidence:**
```js
// /regenerate throttle (line 487–492) — too broad:
`SELECT COUNT(*) AS cnt FROM plans
 WHERE user_id = $1 AND created_at >= CURRENT_DATE`

// /generate throttle (line 270–276) — correctly scoped:
`SELECT COUNT(*) AS cnt FROM plans
 WHERE user_id = $1
   AND name LIKE 'Training Engine Plan%'
   AND created_at >= CURRENT_DATE`
```
- **Invariant/Rubric:** P1 — wrong behavior in normal flows; a user with saved plans will be incorrectly throttled.
- **Suggested direction:** Add `AND name LIKE 'Training Engine Plan%'` to the regenerate throttle query to match the generate throttle.
- **Confidence:** HIGH

---

### [P1] SRV-PLANS-06 — `exercises.js` `/search` endpoint has no auth; any unauthenticated client can enumerate the exercise library

- **File:** `peak-fettle-agents/server/index.js:92–97` + `peak-fettle-agents/server/routes/exercises.js:24–119`
- **Problem:** The mount in `index.js` only applies `requireAuth` to `POST` requests; `GET` requests (including `/search` and `/:id/aliases`) pass through without authentication. The comment in `index.js` explicitly notes "GET is public". This is intentional for the browse endpoint but may not be intentional for `/search` which can be used to enumerate the full exercise library rapidly. More critically `GET /exercises/:id/aliases` (line 157–167 in exercises.js) exposes all aliases for a given exercise UUID with no auth — this is low-sensitivity data but it exposes internal UUIDs and exercise metadata. This is an intentional design decision (global read-only library) but worth flagging as a conscious call.
- **Evidence:**
```js
// index.js:92–97
app.use('/exercises', (req, res, next) => {
    if (req.method === 'POST') {
        return requireAuth(req, res, next);
    }
    next();  // all GETs including /search and /:id/aliases are unauthenticated
}, exercisesRoutes);
```
- **Invariant/Rubric:** P1 — security design: unauthenticated enumeration of exercise data. Technically intentional per design but warrants explicit confirmation.
- **Suggested direction:** If the exercise library is intentionally public, document this at the mount with a comment explaining the threat model. If search should be auth-required (to prevent scraping), add `requireAuth` to the `GET /search` route by checking `req.path === '/search'` at the mount level.
- **Confidence:** MED (intentional design, not a bug, but worth confirming)

---

### [P2] SRV-PLANS-07 — `exercises.js` `GET /` has no LIMIT; full library scan on every browse

- **File:** `peak-fettle-agents/server/routes/exercises.js:126–150`
- **Problem:** The browse endpoint (`GET /exercises`) fetches `SELECT … FROM exercises ${where} ORDER BY category, name` with no LIMIT. As the exercise library grows this becomes an unbounded table scan. The current library is small but this is a P2 perf risk: a request with no `kind` filter returns the entire exercises table with no ceiling.
- **Evidence:**
```js
const { rows } = await pool.query(
    `SELECT id, name, category, muscle_groups, is_compound
     FROM exercises ${where}
     ORDER BY category, name`,
    params
);
```
- **Invariant/Rubric:** P2 — missing LIMIT on unbounded query.
- **Suggested direction:** Add `LIMIT 1000` (or a configurable ceiling) to the browse query, or accept a `?limit` query parameter capped at a reasonable maximum.
- **Confidence:** HIGH

---

### [P2] SRV-PLANS-08 — `percentile.js` GET handlers read from deprecated `user_percentile_rankings`; no deprecation warning to client

- **File:** `peak-fettle-agents/server/routes/percentile.js:99–177` (GET /) and `:192–266` (GET /:liftId)
- **Problem:** The `index.js` comment (lines 109–116) notes the /percentile endpoint is "kept until Pro clients are verified to be using on-device values exclusively." The GET handlers still read live data from `user_percentile_rankings` which is deprecated. The cron that populates that table has been disabled (per the comment). This means rankings will grow stale without any client-visible indication. New Pro users whose weekly cron run hasn't been backfilled will see a perpetually empty rankings list without understanding why. There is no `X-Deprecated` header, no `deprecated_at` field in the response, and no client-readable signal that these values are stale.
- **Evidence:** Response shape at line 151–157:
```js
res.json({
    rankings: rows,
    cohort_note: COHORT_NOTE,
    dots_note: DOTS_NOTE,
    wilks_note: WILKS_NOTE,
    // No staleness / deprecation indicator
});
```
- **Invariant/Rubric:** P2 — error handling / UX: stale data with no client signal.
- **Suggested direction:** Add a `deprecated: true` or `computed_by: 'on_device'` field to the response so the mobile client can conditionally hide the server-percentile UI once on-device computation is confirmed working. Alternatively add a `computed_at_max` field so the client can detect staleness.
- **Confidence:** HIGH

---

### [P3] SRV-PLANS-09 — `plans.js` inline paid check duplicates `requirePaid` middleware pattern

- **File:** `peak-fettle-agents/server/routes/plans.js:257–267`
- **Problem:** The `POST /plans/generate` handler performs an ad-hoc paid check (`SELECT (tier = 'paid') AS is_paid FROM users WHERE id = $1`) rather than using the `requirePaid` middleware. The `requirePaid.js` comment explicitly says "every Pro endpoint should use this middleware instead of an ad-hoc inline check, so the gate can never drift between features." The inline check is functionally correct but diverges from the single-source-of-truth pattern.
- **Evidence:**
```js
const { rows: userRows } = await pool.query(
    `SELECT (tier = 'paid') AS is_paid FROM users WHERE id = $1`,
    [req.user.id]
);
if (!userRows[0]?.is_paid) {
    return res.status(403).json({ ... });
}
```
- **Invariant/Rubric:** P3 — maintainability; the `requirePaid.js` comment explicitly flags this as the canonical pattern.
- **Suggested direction:** Replace the inline check with `requirePaid` route middleware (or a named middleware chain before the handler). Note: fixing SRV-PLANS-03 (`/regenerate`) would naturally apply `requirePaid` there too.
- **Confidence:** HIGH
