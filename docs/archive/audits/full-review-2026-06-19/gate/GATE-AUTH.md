# GATE-AUTH — adversarial hard-gate of commit ea25e49

**Target:** `mobile/src/api/client.ts` + `mobile/src/context/AuthContext.tsx`
**Invariant 5:** clear the session/refresh token ONLY on a definitive 401, never on a transient failure.

## VERDICT: PASS

The fix correctly upholds Invariant 5 in BOTH directions — transient failures keep the
token, and genuine auth rejections still log the user out. No P0/P1 issues found.

---

## What was verified (with evidence)

### 1. Transient failures never clear the token (the "stay logged in" direction)
- `isDefinitiveAuthFailure` (client.ts:82-124) returns `false` whenever there is no HTTP
  `response` (network error / DNS / offline) or `response.status` is not a number
  (client.ts:88-90). The `refresh_timeout` `Error` thrown by the bootstrap race
  (AuthContext.tsx:377) has no `.response` -> classified transient -> token kept.
- 5xx -> falls through both `=== 401` and the `400-499` block -> returns `false`
  (client.ts:122-123). Server-down keeps the session.
- A 403 (Cloudflare/WAF/proxy) only clears if its body matches
  `/invalid|revoked|expired/i`; a typical "Forbidden"/"Access denied" body does not ->
  token kept (client.ts:99-119).
- A bare 4xx with `response.data == null` -> `bodyText` stays `''` -> regex false ->
  token kept (client.ts:100-119).

### 2. Genuine logouts still happen (the dangerous "security regression" direction — CLEAN)
- Server `POST /auth/refresh` returns HTTP 401 `{error:'invalid_token'}` for EVERY
  logout-worthy case: bad JWT type (auth.js:239), already-used/revoked/expired token
  (auth.js:264), unknown/deleted user (auth.js:271), and any verify exception
  (auth.js:280). The predicate's first branch (`status === 401 -> true`, client.ts:93-95)
  catches all of them regardless of body. A revoked refresh token IS still cleared ->
  no regression. Verified against `peak-fettle-agents/server/routes/auth.js:231-282`.

### 3. Both call sites use the SAME predicate
- Interceptor: client.ts:214 `if (isDefinitiveAuthFailure(err)) _authHandlers.onLogout();`
- Bootstrap: AuthContext.tsx:411 `const definitiveAuthFailure = isDefinitiveAuthFailure(err);`
  imported from the shared module (AuthContext.tsx:76). The old duplicated inline logic
  and the now-unused `import axios` were removed; `grep axios` in AuthContext = 0 hits,
  so no dangling `axios.isAxiosError` reference.

### 4. Single-flight `_refreshPromise` cannot wedge
- Assigned with `.finally(() => { _refreshPromise = null; })` (client.ts:194-196), which
  runs on BOTH resolve and reject. The new `isDefinitiveAuthFailure` branch sits inside
  the `catch` (client.ts:207-217) and never touches `_refreshPromise`. After a transient
  failure the promise is reset to null -> subsequent requests can retry. No deadlock.

### 5. Token-clear is reached only through gated paths
- `REFRESH_TOKEN_KEY` is deleted ONLY via `clearRefreshToken()` (AuthContext.tsx:240),
  reached ONLY through `_clearAuthState()` (AuthContext.tsx:274). `_clearAuthState` is
  called from: (a) `onLogout` (AuthContext.tsx:322) — itself gated by `bootstrappingRef`
  AND now only invoked by the interceptor behind `isDefinitiveAuthFailure`; (b) bootstrap
  catch behind `definitiveAuthFailure` (AuthContext.tsx:417-418); (c) user-initiated
  `logout()` (AuthContext.tsx:573). No ungated clear path exists.
- During cold-start, a racing Pro 401 -> interceptor -> transient `_doRefresh` failure now
  doesn't even call `onLogout`; a definitive one calls `onLogout` but it is suppressed by
  `bootstrappingRef.current` (AuthContext.tsx:318), deferring to the bootstrap's own
  classification of the same failure. No double-clear, no missed clear.

### 6. Predicate edge cases (object vs string body, no-response)
- `err` with no `.response`: status not a number -> `false`. CORRECT.
- string body: matched directly (client.ts:102-103).
- object body: prefers `.error`, then `.message`, else `JSON.stringify` (client.ts:104-117).
- A 401 NOT from `/auth/refresh` (any other endpoint hitting the interceptor) still
  triggers the single refresh attempt first; only if the REFRESH itself returns a
  definitive failure does logout fire — correct, since a stale access token alone must
  not log the user out.

---

## Out-of-scope observation (NOT a defect in ea25e49)
- Server `/auth/refresh` `catch (_err)` collapses ANY unexpected exception (e.g. a DB
  outage in `pool.query`) into `401 {error:'invalid_token'}` (auth.js:279-280). A
  transient DB failure during refresh would therefore present to the client as a
  definitive 401 and clear the token. The CLIENT predicate faithfully honors what the
  server reports; tightening this belongs to the server commit (b335094), not here.
  Flagging for the server gate, not blocking this one.

**Bottom line: ea25e49 is a correct, complete implementation of Invariant 5. PASS.**
