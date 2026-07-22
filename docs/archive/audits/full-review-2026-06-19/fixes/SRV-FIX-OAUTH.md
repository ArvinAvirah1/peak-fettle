# SRV-FIX-OAUTH — SRV-AUTH-02 (P0 account-takeover via unverified OAuth email)

**File:** `peak-fettle-agents/server/routes/auth.js` (handler `POST /auth/oauth`, TICKET-099)
**Severity:** P0 — account takeover / account hijack by email match
**Branch:** `fix/full-review-2026-06-19`
**Status of edit:** present in the working tree (uncommitted). Not committed per task instruction.

## Vulnerability
`POST /auth/oauth` verifies the provider id_token's *signature/issuer/audience*
via `lib/oauthVerify.js`, then does a **find-or-create by the provider's email**:

```js
SELECT ... FROM users WHERE email = $1 AND deleted_at IS NULL
```

A valid, correctly-signed provider id_token can still carry an **unverified**
email (`email_verified` false). Google in particular will mint an id_token whose
`email` claim is present but `email_verified === false` when the account's email
has not been confirmed. Because the handler matched purely on the email string,
an attacker holding such a token could **log into / take over an existing
Peak Fettle account that owns that same email address** — the signature check
alone does not prove the bearer controls the mailbox.

## Fix
Require the provider's **verified-email** flag before any email match-or-create.
The guard is inserted immediately after the email is extracted/validated and
**before** the `SELECT ... WHERE email = $1` find-or-create block, so an
unverified email can neither match an existing row nor create a new one.

### Before (email-match logic, no verification gate)
```js
        const email = (claims.email || '').toLowerCase();
        if (!email) return res.status(400).json({ error: 'provider_no_email' });

        // Find-or-create by verified email. ...
        let { rows } = await pool.query(
            `SELECT ${USER_PROFILE_SELECT} FROM users WHERE email = $1 AND deleted_at IS NULL`,
            [email]
        );
```

### After (verified-email gate added before the match)
```js
        const email = (claims.email || '').toLowerCase();
        if (!email) return res.status(400).json({ error: 'provider_no_email' });

        // SRV-AUTH-02: never find-or-create on an UNVERIFIED provider email. An
        // attacker holding a token whose email is unverified could otherwise take
        // over an existing account that owns that same email address.
        if (!claims.emailVerified) {
            return res.status(401).json({ error: 'provider_email_not_verified' });
        }

        // Find-or-create by verified email. ...
        let { rows } = await pool.query(
            `SELECT ${USER_PROFILE_SELECT} FROM users WHERE email = $1 AND deleted_at IS NULL`,
            [email]
        );
```

The verified-email **happy path is unchanged**: when `claims.emailVerified` is
true the handler proceeds to the existing find-or-create + `issueTokens` flow
exactly as before. Unverified emails now get a clean `401 provider_email_not_verified`
and can never reach the email lookup.

## Is the verified flag actually available from the provider lib? — YES
`lib/oauthVerify.js` `verifyOAuthIdToken()` normalizes the decoded JWT and
exposes a proper boolean:

```js
emailVerified: payload.email_verified === true || payload.email_verified === 'true',
```

This handles both transports correctly:
- **Google** sends `email_verified` as a JSON boolean (`true`/`false`).
- **Apple** sends `email_verified` as the *string* `"true"`/`"false"` — covered
  by the `=== 'true'` branch.

So `claims.emailVerified` is genuinely populated for both supported providers;
the fix does not rely on a field the lib fails to provide. (If a provider ever
omitted the claim entirely, `emailVerified` would be `false` → the handler
fails safe and rejects, which is the desired conservative behavior.)

## Scope / non-touch
- Only `POST /auth/oauth` was modified.
- `POST /auth/refresh` was **not** touched (its SRV-AUTH-03 `algorithms: ['HS256']`
  hardening was already applied in a prior step and is intentionally left as-is).
- No other handlers changed.

## Verification
- `node --check peak-fettle-agents/server/routes/auth.js` -> exit 0
- `wc -l peak-fettle-agents/server/routes/auth.js` -> 409 lines (not truncated)
- `git diff` confirms the inserted 7-line guard sits before the `SELECT ... WHERE email = $1` query.
