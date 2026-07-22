# SRV-FIX-AUTH-REFRESH — `/auth/refresh` catch no longer wipes sessions on transient errors

**File:** `peak-fettle-agents/server/routes/auth.js`
**Branch:** `fix/full-review-2026-06-19`
**Date:** 2026-06-19
**Invariant:** #5 — transient/unexpected failures MUST NOT clear the user's session.

## The bug

The `POST /auth/refresh` handler's outer `catch` collapsed **every** exception into
`401 invalid_token`:

```js
} catch (_err) {
    return res.status(401).json({ error: 'invalid_token' });
}
```

The mobile client treats a `401` from `/auth/refresh` as a **definitive** auth failure
and wipes the stored refresh token (→ forced re-login). So a transient failure inside the
handler — DB outage, connection-pool timeout, any unexpected throw from `pool.query` /
`issueTokens` — was reported as `401` and **logged the user out**, violating Invariant 5.
This was also the only handler in the file that did NOT follow the file's
`} catch (err) { next(err); }` convention.

## The fix (surgical)

Distinguish error classes in the catch:

- **Genuine bad-token errors** — `jsonwebtoken` throws `JsonWebTokenError` /
  `TokenExpiredError` / `NotBeforeError` (the latter two subclass `JsonWebTokenError`)
  from `jwt.verify()` for a malformed / tampered / expired refresh token → **keep `401`
  `invalid_token`**.
- **Everything else** (DB / pool / unexpected) → **`next(err)`**, matching every other
  handler in this file. The app-level `errorHandler` middleware
  (`server/middleware/errorHandler.js`) maps unknown errors to **HTTP 500
  `internal_error`**, which the client treats as transient → **keeps the token**.

```js
} catch (err) {
    if (err instanceof jwt.JsonWebTokenError ||
        err instanceof jwt.TokenExpiredError ||
        err instanceof jwt.NotBeforeError) {
        return res.status(401).json({ error: 'invalid_token' });
    }
    return next(err);
}
```

The imports use `const jwt = require('jsonwebtoken')`, which exposes those error classes,
so the `instanceof` checks are correct for this file.

## What did NOT change

All explicit `return res.status(401)` paths for genuine failures stay exactly as-is:
- token type !== 'refresh'
- token hash not found / revoked / replayed / expired (failed `DELETE ... RETURNING`, no replay)
- unknown / soft-deleted user

No other handler (`/signup`, `/login`, `/logout`, OAuth) was touched. The `next` param was
already in the handler signature.

## Verification

- `node --check peak-fettle-agents/server/routes/auth.js` → **exit 0**
- `wc -l`: 388 → 402 (+14 lines: added comments + the type-discrimination branch; not truncated)
- `diff` confirms only the `/auth/refresh` catch block differs.

**Not committed** (per task scope) — apply + verify + report only.
