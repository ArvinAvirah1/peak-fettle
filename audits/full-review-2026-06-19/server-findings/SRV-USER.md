# SRV-USER findings

## Summary
Files reviewed: 4 (`routes/user.js`, `routes/healthMetrics.js`, `routes/constraints.js`, `routes/insights.js`). Counts — P0:2 P1:2 P2:2 P3:1. All four files use fully parameterised SQL with no IDOR: every personal-data query is scoped to `req.user.id` set by JWT middleware. The two P0s are (1) `POST /user/upgrade` and `POST /user/downgrade` being callable by any authenticated user to self-promote to Pro at will, and (2) the `DELETE /user/account` transaction crashing on the deprecated `user_percentile_rankings` table (which may be absent on prod) and rolling back the deletion silently.

---

### [P0] SRV-USER-01 — Unauthenticated tier self-promotion via POST /user/upgrade

- **File:** `peak-fettle-agents/server/routes/user.js:1059,1063`
- **Problem:** `POST /user/upgrade` and `POST /user/downgrade` are mounted behind `requireAuth` only. Any valid JWT holder — including a free-tier user — can `POST /user/upgrade` and flip their own `users.tier` to `'paid'`, gaining full Pro access for free. There is no `requirePaid` guard, no payment-verified check, and no admin-only check. The route is explicitly documented as "idempotent" (repeated calls are harmless), which obscures the security impact. The comment at line 1003 says "upgrade() deliberately does NOT touch comp_pro" — suggesting the author considered access-control concerns but focused on data integrity, not authentication.
- **Evidence:**
  ```js
  // peak-fettle-agents/server/routes/user.js:1059-1063
  // POST /user/upgrade — set tier='paid'. Idempotent. Does NOT touch comp_pro.
  router.post('/upgrade', (req, res, next) => setTier(req, res, next, 'paid'));

  // POST /user/downgrade — set tier='free'. Idempotent.
  router.post('/downgrade', (req, res, next) => setTier(req, res, next, 'free'));
  ```
  And the mount in `server/index.js:133`:
  ```js
  app.use('/user', requireAuth, userRoutes);  // only requireAuth — no payment check
  ```
- **Invariant/Rubric:** P0 Security — missing auth check on sensitive operation; mass assignment of protected column (`tier`/`is_paid`).
- **Suggested direction:** These routes should not exist as general-purpose HTTP endpoints unless the caller is a verified payment webhook (Stripe/RevenueCat) or an admin script. If a payment-webhook pattern is intended, add a `requireWebhookSecret` middleware that checks a shared HMAC secret from `process.env.PAYMENT_WEBHOOK_SECRET` before allowing tier mutation. If these are internal-only (dev/admin), move them behind an `adminOnly` middleware that validates a separate long-lived admin token, not the user's own JWT.
- **Confidence:** HIGH

---

### [P0] SRV-USER-02 — Account deletion crashes on deprecated `user_percentile_rankings` table

- **File:** `peak-fettle-agents/server/routes/user.js:268`
- **Problem:** `DELETE /user/account` runs a `BEGIN` transaction that includes `DELETE FROM user_percentile_rankings WHERE user_id = $1`. Per CLAUDE.md and the AUDITOR_BRIEF, `user_percentile_rankings` is DEPRECATED and may be absent on the prod DB. If the table is missing, Postgres throws `42P01` (undefined_table), the `catch (innerErr)` block runs `ROLLBACK`, and **none of the user's data is deleted** — yet the outer `try/catch` re-throws, triggering `next(err)` which returns a 500. The user sees a 500 but their account is not deleted. This is a GDPR/data-rights regression: the user cannot delete their account.
- **Evidence:**
  ```js
  // peak-fettle-agents/server/routes/user.js:261-276
  await client.query('BEGIN');
  // ...
  await client.query(`DELETE FROM user_percentile_rankings WHERE user_id = $1`, [uid]);
  // ...
  await client.query('COMMIT');
  } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;   // ← 42P01 surfaces here, killing the whole deletion
  }
  ```
- **Invariant/Rubric:** P0 Correctness — schema-drift tolerance (Invariant #4); GDPR data-rights regression; the AUDITOR_BRIEF explicitly flags `user_percentile_rankings` as deprecated.
- **Suggested direction:** Wrap the `user_percentile_rankings` DELETE in its own try/catch that silently swallows `42P01` only (e.g. `if (e.code !== '42P01') throw e`), or prefix it with a `to_regclass` guard: `DELETE FROM user_percentile_rankings WHERE user_id = $1` → `DO $$ BEGIN IF to_regclass('public.user_percentile_rankings') IS NOT NULL THEN DELETE FROM user_percentile_rankings WHERE user_id = $1; END IF; END $$`. Either approach keeps the transaction atomic for tables that exist.
- **Confidence:** HIGH

---

### [P1] SRV-USER-03 — `experience_level` free-text field has no minimum-length guard (empty string accepted)

- **File:** `peak-fettle-agents/server/routes/user.js:498-506`
- **Problem:** The `experience_level` validation only checks `typeof === 'string'` and `length > 50`. An empty string (`""`) passes validation and is written to the DB. This is a data-quality issue; downstream code (training engine, plan generation) that reads `experience_level` as a non-empty string may silently fail or produce degenerate output. All other string fields in this handler (`display_name`, `primary_focus`) have explicit `length >= 1` minimum guards.
- **Evidence:**
  ```js
  // peak-fettle-agents/server/routes/user.js:498-506
  if (experience_level !== undefined) {
      if (typeof experience_level !== 'string' || experience_level.length > 50) {
          return res.status(400).json({ ... });
      }
      params.push(experience_level);  // "" is accepted
      setClauses.push(`experience_level = $${params.length}`);
  }
  ```
- **Invariant/Rubric:** P1 — input validation gap; inconsistent with every other validated string field.
- **Suggested direction:** Add `|| experience_level.length === 0` to the rejection condition, or use `.trim()` and check `trimmed.length < 1` matching the `display_name` pattern. If `null` is a valid "clear" value, handle it explicitly as for `goal_weight_kg`.
- **Confidence:** HIGH

---

### [P1] SRV-USER-04 — `GET /health-metrics` `?days` param: `NaN` silently falls back to 30 (acceptable), but negative integers produce a nonsensical negative INTERVAL

- **File:** `peak-fettle-agents/server/routes/healthMetrics.js:43`
- **Problem:** The `days` query parameter is parsed as `Math.min(parseInt(...) || 30, 365)`. `parseInt('abc')` → `NaN` → `NaN || 30` → `30` (fine). But `parseInt('-5')` → `-5`; `Math.min(-5, 365)` → `-5`, and `-5 || 30` is `-5` (non-zero). The query then executes `AND date >= CURRENT_DATE - ('-5 days')::INTERVAL`, which Postgres evaluates as `date >= CURRENT_DATE + 5 days` (future date), returning an empty result set instead of a 400 error. Not a data-corruption issue but a silent wrong-result bug visible to the client.
- **Evidence:**
  ```js
  // peak-fettle-agents/server/routes/healthMetrics.js:43
  const days = Math.min(parseInt(req.query.days ?? '30', 10) || 30, 365);
  ```
  When `req.query.days = '-5'`: `parseInt('-5') = -5`, `-5 || 30 = -5`, `Math.min(-5, 365) = -5`.
- **Invariant/Rubric:** P1 — input validation; silent wrong-result for valid-looking negative input.
- **Suggested direction:** After parsing, clamp to `[1, 365]`: `const days = Math.max(1, Math.min(parseInt(req.query.days ?? '30', 10) || 30, 365))`. Or reject non-positive values with a 400.
- **Confidence:** HIGH

---

### [P2] SRV-USER-05 — `GET /user/data-export` reads from deprecated `user_percentile_rankings` table indirectly via DELETE (already flagged), but the `streaks` query has no schema-drift guard

- **File:** `peak-fettle-agents/server/routes/user.js:184-191`
- **Problem:** The `GET /user/data-export` `Promise.all` includes a query to `streaks` for `current_streak_days`, `longest_streak_days`, `last_session_date`. If the `streaks` table is absent on a drifted prod DB (42P01), the entire `Promise.all` rejects and the export endpoint returns a 500 rather than degrading. All seven sub-queries in the `Promise.all` share the same `catch (err) { next(err); }` — a single table absence kills the whole export. Similarly for `GET /user/export` (line 802). Neither export endpoint has any 42P01/42703 degradation handling.
- **Evidence:**
  ```js
  // peak-fettle-agents/server/routes/user.js:184-191
  pool.query(
      `SELECT current_streak_days, longest_streak_days, last_session_date
       FROM streaks WHERE user_id = $1`,
      [uid]
  ),
  // No try/catch per-query; one failure kills the Promise.all
  ```
- **Invariant/Rubric:** P2 — schema-drift tolerance (Invariant #4); no degrade on 42P01/42703 in export paths.
- **Suggested direction:** Wrap each `pool.query` in the `Promise.all` with a helper that catches `42P01`/`42703` and returns `{ rows: [] }` instead, so the export degrades gracefully when an optional table is absent.
- **Confidence:** HIGH

---

### [P2] SRV-USER-06 — `POST /insights/deload/ack` has no idempotency guard: calling it twice on the same day is harmless, but `last_deload_at` is overwritten on every call with no acknowledgement throttle

- **File:** `peak-fettle-agents/server/routes/insights.js:525-545`
- **Problem:** The deload ACK endpoint updates `users.last_deload_at = CURRENT_DATE` unconditionally. This is functionally correct (idempotent on the same day) but has no rate limit. A bug or replay in the mobile client could spam the endpoint, generating unnecessary DB writes. More importantly, there is no check that a deload was actually *recommended* before acknowledging — a client can set `last_deload_at` to today even when the `/deload` endpoint returns `{ recommended: false }`. This means a user could "skip" the 42-day window early by sending a spurious ACK. Low severity in isolation but it undermines the deload detection logic.
- **Evidence:**
  ```js
  // peak-fettle-agents/server/routes/insights.js:529-534
  const { rows } = await pool.query(
      `UPDATE users
       SET last_deload_at = CURRENT_DATE
       WHERE id = $1
       RETURNING last_deload_at`,
      [uid]
  );
  ```
- **Invariant/Rubric:** P2 — missing business-logic guard; no rate limit on a write endpoint.
- **Suggested direction:** Optionally add a rate limiter (e.g. 2 requests/day) or a server-side check that verifies `/deload` was `recommended: true` within the last 24h (via a fresh deload evaluation or a cached flag) before allowing the ACK to update `last_deload_at`.
- **Confidence:** MED

---

### [P3] SRV-USER-07 — `GET /user/data-export` (v1.0) and `GET /user/export` (v2.0) both exist and serve overlapping data under different paths with the same rate limiter

- **File:** `peak-fettle-agents/server/routes/user.js:114,802`
- **Problem:** Two full data export endpoints exist: `GET /data-export` (v1.0, line 114, GDPR path) and `GET /export` (v2.0, line 802, Training Engine spec). They share `exportLimiter` (5/hour) but count independently per-route (each has its own rate limiter instance), so a client can effectively get 10 exports/hour by alternating paths. The v1 path exports `weight_raw / 8.0` and computes e1RM inline; the v2 path also uses `weight_raw / 8.0` without COALESCE against the newer `weight_kg REAL` column — so if `weight_kg` exists on prod but `weight_raw` is NULL, both exports would silently return NULL weights.
- **Invariant/Rubric:** P3 — dead/duplicate code; the weight export does not use `COALESCE(weight_kg, weight_raw/8.0)` as the invariant #2 mandates.
- **Suggested direction:** Unify the two exports into a single v2 endpoint and redirect v1. For the weight column, apply `COALESCE(s.weight_kg, s.weight_raw / 8.0)` in all set-export queries so future rows with `weight_kg` populated (and `weight_raw` NULL) are correctly exported. (Weight schema invariant: read via COALESCE, write exact kg.)
- **Confidence:** HIGH (weight COALESCE issue); MED (rate limiter double-counting).
