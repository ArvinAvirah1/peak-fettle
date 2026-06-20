# SRV-AUTH findings
## Summary
Files reviewed: 7 (`routes/auth.js`, `middleware/requireAuth.js`, `middleware/requirePaid.js`, `middleware/errorHandler.js`, `lib/oauthVerify.js`, `lib/supabaseAdmin.js`, `cron/cleanup-orphaned-auth.js`).
Counts — P0: 2  P1: 3  P2: 2  P3: 1.
Overall: auth architecture is substantially sound (algorithm pinning in `requireAuth`, DB-side tier enforcement, token revocation, service-role key isolation), but the `/refresh` route's blanket `catch → 401` masks DB failures (silent token consumption without session grant), and the `/auth/oauth` route does not enforce `emailVerified` before creating/logging in an account.

---

### [P0] SRV-AUTH-01 — `/refresh` catch-all swallows DB errors: token consumed but no session granted

- **File:** `peak-fettle-agents/server/routes/auth.js:279–281`
- **Problem:** The outer `try/catch` on `POST /refresh` catches *every* thrown value — including Postgres connection errors, `issueTokens` DB failures, and any other runtime exception — and returns `401 invalid_token`. If the `DELETE FROM refresh_tokens` succeeds (consuming the token atomically) but a subsequent DB error is thrown (e.g., `issueTokens` fails on the `INSERT INTO refresh_tokens`), the caller receives `401` with its old refresh token now permanently deleted. The user is silently logged out with no actionable error, and there is no way for them or the server to distinguish "bad token" from "DB transient error." On the mobile client (Invariant 5), this `401` WILL trigger `onLogout` / token clear, forcing the user to re-authenticate — exactly the cold-start forced-relogin bug.
- **Evidence:**
```js
// auth.js:279
    } catch (_err) {
        return res.status(401).json({ error: 'invalid_token' });
    }
```
- **Invariant/Rubric:** Invariant 5 (auth cold-start — token must only be cleared on a *definitive* 401, not on transient DB failure); P0 security/correctness (token consumed, no session issued → silent forced logout).
- **Suggested direction:** Split the catch into two phases. Before the `DELETE` (i.e., during `jwt.verify`), a thrown `JsonWebTokenError`/`TokenExpiredError` is genuinely `invalid_token → 401`. After the DELETE succeeds, any DB error should be `next(err)` → 500, so the client knows it was a transient failure and can retry without the user being logged out. Re-using a named `JsonWebTokenError` type guard (`err instanceof jwt.JsonWebTokenError`) is the minimal fix.
- **Confidence:** HIGH

---

### [P0] SRV-AUTH-02 — `POST /auth/oauth` does not enforce `emailVerified` — unverified emails can hijack existing accounts

- **File:** `peak-fettle-agents/server/routes/auth.js:347–384` / `lib/oauthVerify.js:111–116`
- **Problem:** `verifyOAuthIdToken` returns a `claims.emailVerified` boolean (correctly derived from the provider payload), but `POST /auth/oauth` never checks it before doing a find-or-create on `email`. Google in particular allows accounts where `email_verified` is `false` — a user who controls `attacker@example.com` at the DNS level could potentially obtain a Google token with `email_verified: false` for a victim's email (if Google issued one), then find-or-create the victim's Peak Fettle account. More immediately: Apple's "Hide My Email" relay tokens have the email field but `email_verified` may not be `true` in the JWT (depends on flow). The guard exists in the helper but is silently ignored at the call site.
- **Evidence:**
```js
// oauthVerify.js:111-116 — emailVerified computed but never returned to the route
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: payload.name,
  };

// auth.js:347-348 — check only that email is non-empty; emailVerified ignored
        const email = (claims.email || '').toLowerCase();
        if (!email) return res.status(400).json({ error: 'provider_no_email' });
```
- **Invariant/Rubric:** P0 security — auth bypass; an unverified provider email can create/log in as any user record that shares that email address.
- **Suggested direction:** Add `if (!claims.emailVerified) return res.status(401).json({ error: 'provider_email_not_verified' });` immediately after the `if (!email)` check. This is low-risk since the feature is still 501 until `GOOGLE_OAUTH_AUDIENCE`/`APPLE_OAUTH_AUDIENCE` are set, but must be in place before credentials are added.
- **Confidence:** HIGH

---

### [P1] SRV-AUTH-03 — `/refresh` does not pin `algorithms: ['HS256']` on `jwt.verify`

- **File:** `peak-fettle-agents/server/routes/auth.js:237`
- **Problem:** `requireAuth` (correctly) passes `{ algorithms: ['HS256'] }` to `jwt.verify`. The `/refresh` route calls `jwt.verify(refreshToken, process.env.JWT_SECRET)` without an algorithm allowlist, leaving the algorithm selection to the token header. With `jsonwebtoken` < 9.0 this opened the `alg:none` / RS→HS confusion attack; `jsonwebtoken` 9.x ignores `alg:none` by default, but the explicit allowlist is the documented safe practice and is inconsistent with the rest of the codebase.
- **Evidence:**
```js
// requireAuth.js:20 — correct, explicit pin
const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

// auth.js:237 — missing pin on the refresh path
const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
```
- **Invariant/Rubric:** P1 — defensive-security inconsistency; `jsonwebtoken` 9.x defaults mitigate the worst case but the asymmetry is a maintenance hazard (if the lib version ever regresses or is downgraded).
- **Suggested direction:** Add `{ algorithms: ['HS256'] }` as the third argument to the `jwt.verify` call on auth.js:237, matching the pattern already used in `requireAuth`.
- **Confidence:** HIGH

---

### [P1] SRV-AUTH-04 — `errorHandler` leaks Zod validation field paths to the client

- **File:** `peak-fettle-agents/server/middleware/errorHandler.js:6`
- **Problem:** On a `ZodError`, the handler returns `{ error: 'validation_failed', details: err.issues }`. `err.issues` is the full Zod issue array, which includes the exact `path` (field name), `code`, `message`, `received` value, and `expected` schema for each failure. On auth routes this discloses the exact field structure of the login/signup/oauth body schema — not a critical leak in isolation, but it does confirm field names and validation rules that aid targeted enumeration (e.g., minimum password length is exposed as `"minimum": 8`). The industry-standard response for auth validation is a generic "invalid request" without per-field detail.
- **Evidence:**
```js
// errorHandler.js:5-6
    if (err && err.name === 'ZodError') {
        return res.status(400).json({ error: 'validation_failed', details: err.issues });
```
- **Invariant/Rubric:** P1 — information disclosure on auth routes; mildly aids brute-force targeting.
- **Suggested direction:** On auth routes, return only `{ error: 'validation_failed' }` (strip `details`). One approach: add a route-level flag (`res.locals.suppressValidationDetails = true`) set by `authRoutes`, and check it in the error handler before adding `details`. Alternatively, strip `details` unconditionally — it's not consumed by the mobile client UI.
- **Confidence:** MED (P1 for auth context; would be P3 on a non-auth route)

---

### [P1] SRV-AUTH-05 — `cleanup-orphaned-auth` cron iterates `orphaned_auth_records` but has no guard against deleting still-active Supabase auth users

- **File:** `peak-fettle-agents/server/cron/cleanup-orphaned-auth.js:65–79`
- **Problem:** The cron calls `supabaseAdmin.auth.admin.deleteUser(auth_uid)` for every row in `orphaned_auth_records WHERE resolved_at IS NULL`. The invariant it depends on is that `orphaned_auth_records` rows are inserted *only* by the account-deletion flow (after the DB rows are already gone). If an orphan row is incorrectly inserted (bug in the deletion path, manual data entry, a test fixture left behind, a replay of the account-deletion endpoint, or a future migration error), the cron will permanently delete a *live* Supabase auth record. There is no cross-check against the `users` table to verify that the user is actually deleted before calling `deleteUser`.
- **Evidence:**
```js
// cleanup-orphaned-auth.js:65-79
        for (const orphan of orphans) {
            const { auth_uid } = orphan;
            // Attempt to delete the Supabase auth record.
            const { error } = await supabaseAdmin.auth.admin.deleteUser(auth_uid);
            if (!error) {
                await client.query(
                    `UPDATE orphaned_auth_records SET resolved_at = NOW() WHERE id = $1`,
                    [orphan.id]
                );
```
- **Invariant/Rubric:** P1 — risk of live-user auth record deletion; violates the "cron can't delete live users" requirement from the scope.
- **Suggested direction:** Before calling `deleteUser`, verify the user is absent from the `users` table: `SELECT 1 FROM users WHERE id = $1` (using `orphan.auth_uid` mapped to the users UUID). If the row still exists, log a warning, skip deletion, and leave `resolved_at` NULL for manual review. This turns an incorrect orphan row into a detectable non-fatal error rather than a permanent data loss.
- **Confidence:** MED (the insertion guard in the deletion route is correct today, but belt-and-suspenders cross-check is the right posture for a destructive cron)

---

### [P2] SRV-AUTH-06 — `errorHandler` does not degrade on `42P01`/`42703` schema-drift errors

- **File:** `peak-fettle-agents/server/middleware/errorHandler.js:4–15`
- **Problem:** The CLAUDE.md invariant (Invariant 4) states that server routes must catch Postgres `42P01` (undefined table) and `42703` (undefined column) and degrade to an empty 200 rather than surfacing a 500. The centralized error handler handles `23505` (unique violation) but not `42P01` or `42703`. Auth routes themselves (signup, login, oauth) use a stable `users` table unlikely to drift, but `issueTokens` writes to `refresh_tokens` — if that table is missing in prod (it's a newer migration), every login/signup/refresh will 500 rather than degrade. Additionally, none of the individual route catch blocks handle `42P01`/`42703` directly before passing to `next(err)`.
- **Evidence:**
```js
// errorHandler.js:8-14 — handles 23505 but not 42P01/42703
    if (err && err.code === '23505') {
        return res.status(409).json({ error: 'conflict' });
    }
    console.error('[unhandled]', err);
    return res.status(500).json({ error: 'internal_error' });
```
- **Invariant/Rubric:** Invariant 4 / P2 — schema-drift tolerance missing in error handler; 500 instead of graceful degrade.
- **Suggested direction:** Add a handler block before the final 500 fallthrough: `if (err && (err.code === '42P01' || err.code === '42703')) { console.error('[schema-drift]', err.message); return res.status(500).json({ error: 'schema_drift' }); }`. For auth-specific paths where degrade is unsafe (you can't issue a token if `refresh_tokens` is missing), the 500 is correct — but labeling it distinctly from a generic error aids diagnosis.
- **Confidence:** HIGH

---

### [P2] SRV-AUTH-07 — `POST /auth/signup` and `POST /auth/oauth` share the same 20/15-min rate limit as `/auth/login`, but signup is much higher-cost (bcrypt 12 rounds)

- **File:** `peak-fettle-agents/server/index.js:64–70, 76` (rate limiter applied to the whole `/auth` prefix)
- **Problem:** The `authLimiter` (20 req / 15 min) is applied to the entire `/auth` prefix, covering signup, login, refresh, logout, and oauth equally. Signup and oauth account creation run `bcrypt.hash(…, 12)` — approximately 300–400 ms each — and insert a new DB row. Twenty signup requests from one IP in 15 minutes is generous for abuse (account farming, resource exhaustion, DB row spam) and expensive CPU-wise. The rate limit is also per-IP (express-rate-limit default), so it provides no per-email enumeration defense on `/auth/login` independently — a distributed attack across many IPs bypasses it entirely.
- **Evidence:**
```js
// index.js:64-70
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    …
});
// index.js:76
app.use('/auth', authLimiter, authRoutes);
```
- **Invariant/Rubric:** P2 — brute-force/resource-exhaustion; the existing limiter is better than nothing but signup deserves a tighter cap (e.g., 5/15-min) and login ideally adds per-email tracking.
- **Suggested direction:** Apply a second, stricter limiter (e.g., 5 req / 15 min) specifically to `POST /auth/signup` and `POST /auth/oauth` before mounting `authRoutes`. Login can stay at 20. Per-email account lockout is a larger feature (needs a DB table or Redis); mark as future work.
- **Confidence:** HIGH

---

### [P3] SRV-AUTH-08 — `POST /auth/oauth` account-linking via email is a known unsafe pattern (commented, but already shipping)

- **File:** `peak-fettle-agents/server/routes/auth.js:350–353`
- **Problem:** The code comment acknowledges that linking by email (rather than provider `sub`) is the wrong long-term approach and a dedicated `oauth_identities` table is needed. The `oauth_identities` table is already created in the migration (20260614) but is never used by the route — all matching is still done by `email`. This is noted as TICKET-099 scoped-out, but the table existing while the route doesn't use it creates confusion, and the email-matching pattern will become a latent account-takeover risk once the feature is live (a user who changes their Google email could be silently merged into another account).
- **Evidence:**
```js
// auth.js:350-353
        // Find-or-create by verified email. NOTE: a dedicated oauth_identities
        // table mapping provider `sub` -> account is the proper long-term store
        // (and the account-linking follow-up that TICKET-099 scopes OUT). That
        // needs its own migration + review before it ships.
```
- **Invariant/Rubric:** P3 — maintainability / acknowledged technical debt; no immediate exploit while oauth is 501.
- **Suggested direction:** Track TICKET-099 account-linking migration as a prerequisite before enabling OAuth credentials. Until then, add an assertion or startup warning that `GOOGLE_OAUTH_AUDIENCE`/`APPLE_OAUTH_AUDIENCE` are absent, documenting that the account-linking upgrade must land first.
- **Confidence:** HIGH
