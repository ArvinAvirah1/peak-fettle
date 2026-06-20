# FIX-AUTH — API-01 (P0) + SCORE-01 (P1)

Branch: `fix/full-review-2026-06-19`. Lane: auth cold-start / Invariant 5.
Source rationale: `audits/full-review-2026-06-19/synthesis/SYNTH-2.md` §(c) API-01, SCORE-01.

## Files changed
- `mobile/src/api/client.ts`
- `mobile/src/context/AuthContext.tsx`

## What each edit does

### client.ts
1. **Added + exported `isDefinitiveAuthFailure(err: unknown): boolean`** (new shared classifier, ~lines 62–93).
   Definitive ⇔ HTTP 401 from the refresh call, OR any other 4xx whose response-body
   `error` field matches `/invalid|revoked|expired/i`. Everything else — network error
   (`err.response === undefined`), timeout, 5xx, 2xx/3xx — returns `false` (transient).
2. **API-01 (P0) fix — 401 response-interceptor catch (~lines 177–194):** the refresh-failure
   `catch` no longer calls `_authHandlers.onLogout()` unconditionally. It now calls
   `isDefinitiveAuthFailure(err)` and logs out **only** on a definitive failure. On a
   transient failure it logs a warning, leaves the session + SecureStore refresh token
   intact, and rejects the **original** request so the caller can retry. The documented
   behaviour ("genuine 401 → refresh once → logout only if refresh also definitively
   fails") is preserved; the `if (!refreshToken) onLogout()` terminal case at the top of
   the interceptor is unchanged (no token to refresh is genuinely terminal).

### AuthContext.tsx
3. **SCORE-01 (P1) fix — bootstrap classifier (~lines 391–418):** replaced the inline
   classifier block (which used the too-broad `status >= 200 && status < 500` lower bound)
   with a single call to the shared `isDefinitiveAuthFailure(err)`. The effective lower
   bound is now `>= 400` (client errors only), so a 2xx/3xx response with an
   "expired/invalid/revoked" body can no longer trigger a token clear. The `refresh_timeout`
   error has no `err.response`, so it is still correctly classified as transient (token kept).
   The existing `status === 401` definitive case is retained (now via the shared helper).
   Removed the now-unused `import axios from 'axios'` (no other axios reference remained in
   the file — verified by grep).
4. **Shared predicate at both sites:** `AuthContext.tsx` imports `isDefinitiveAuthFailure`
   from `../api/client` alongside `setAuthHandlers`, so the interceptor and the cold-start
   bootstrap use the identical predicate and cannot drift.

## Verification
- Both edited regions parse cleanly under the project's own `@babel/parser`
  (`typescript` + `jsx` plugins) — confirmed against reconstructions of the exact
  written source.
- Surgical edits only; no other files touched.

## Assumptions / notes
- Kept the 401 interceptor's pre-existing "no refresh token → onLogout" branch as-is
  (it is a genuine terminal state, not a transient failure).
- The Linux build-mount served a STALE/separately-corrupted snapshot of both files during
  this run (truncated `client.ts`, NUL-padded `AuthContext.tsx`). The authoritative files
  on the Windows working tree (`C:\Users\aavir\dev\Peak Fettle`) are intact and contain the
  correct edits — verified via direct reads. Flagging so the final verification gate runs
  its parse-sweep / tsc against the real working tree (per CLAUDE.md Invariant 6 +
  "check the working tree rather than assume"), not the mount snapshot.
