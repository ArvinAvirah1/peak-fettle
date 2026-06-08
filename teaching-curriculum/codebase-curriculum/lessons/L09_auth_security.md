# Lesson L09 — Authentication & security: JWT, bcrypt, and token rotation

> **Track:** 2 — Node/Express/REST/auth/LLM/cron/deploy · **Status:** ⭐ Reference lesson (fully worked)
> **Interactive app:** [`L09_auth_security.html`](L09_auth_security.html)
> **Estimated time:** ~50 min · **Prerequisite rungs:** L07–L08 (middleware, REST endpoints)

## 0. Source of truth (read fresh before teaching — code drifts)
- `peak-fettle-agents/server/routes/auth.js` — signup, login, token refresh, logout (issueTokens, token rotation).
- `peak-fettle-agents/server/middleware/requireAuth.js` — JWT verification, token type guards (T-01: reject refresh tokens as access tokens).
- `peak-fettle-agents/server/lib/supabaseAdmin.js` — admin API for user deletion (Supabase client).
- `peak-fettle-agents/server/package.json` — dependencies: `bcrypt`, `jsonwebtoken`, `crypto` (Node built-in).

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L1)** Define authentication, authorization, and the difference between symmetric and asymmetric cryptography.
- **(L2)** Explain how bcrypt hashing and salt work, and why you never store plain passwords.
- **(L3)** Compute a bcrypt hash and verify a password, understanding the work factor.
- **(L4)** Analyze JWT structure (header.payload.signature), explain how signing prevents tampering, and critique the claim "JWTs are encrypted."
- **(L5)** Evaluate the trade-off of storing tokens in localStorage (XSS-vulnerable) vs. httpOnly cookies (CSRF-vulnerable), and make a recommendation for Peak Fettle given its stack.

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion
- "Cryptography exposure: none / heard of it / familiar with hashing / done encryption work?"
- "Token/session experience: stored in cookies? localStorage? Session DB?"
- "Today: focus on the concepts + Peak Fettle code, or also explore attack scenarios?"
> Calibrate: backend is new. Start with "what is a password hash?" and "why does the server sign tokens?" Avoid crypto jargon; use analogies ("salt is like a fingerprint in the mix"; "signature is like a wax seal").

## 3. Spacing carry-over (M14)
Opening carry-over from L08: "How does the API prove that a user's request is *their* request, and not from someone else?"
(Next lesson L10: "How do you scale auth across multiple servers, and what breaks if tokens aren't stateless?")

## 4. The difficulty ladder for THIS lesson (M2)
1. Authentication vs. authorization; hashing vs. encryption (conceptually).
2. Password hashing with bcrypt: salt, work factor, the hash output.
3. JWT structure and what "signing" means (not encryption).
4. Token rotation and revocation (the T-02 pattern in Peak Fettle).
5. Storage location (localStorage vs. httpOnly cookies) and attack vectors.
6. The full auth flow: signup → password hash → login → token issue → middleware verification → token refresh → logout.

## 5. Concept sequence

### Concept 1: Authentication vs. authorization, hashing vs. encryption
- **(M7) Concrete hook:** "You know who someone is (authentication). But can they *do* something (authorization)? Two separate gates. And when you store a password, do you scramble it so no one can read it (encryption), or hash it so *no one* — not even you — can recover it?"
- **The idea:**
  - **Authentication:** "are you who you claim to be?" The login form verifies the password.
  - **Authorization:** "are you *allowed* to do this?" The ownership check verifies that the workout belongs to the user.
  - **Hashing:** one-way function (`hash(password) → 'a3f9d2c1'`). You can verify a password by hashing it again and comparing, but you can't reverse the hash to get the password. If the hash is leaked, the attacker *cannot* recover passwords (they'd need to brute-force: try every password, hash it, compare).
  - **Encryption:** two-way function (`encrypt(password, key) → 'x9y2z5'` and `decrypt('x9y2z5', key) → password`). If the key leaks, the attacker can decrypt all passwords *immediately*. Never encrypt passwords.
- **(M4) Generate first:** "Peak Fettle stores password hashes in the database. If an attacker steals the database, can they log in as users? Why or why not?"
- **Real code** (`server/routes/auth.js`, signup):
  ```javascript
  router.post('/signup', async (req, res, next) => {
      try {
          const { email, password, displayName } = SignupSchema.parse(req.body);
          const passwordHash = await bcrypt.hash(password, 12);  // Hash the password
          const { rows } = await pool.query(
              `INSERT INTO users (email, password_hash, display_name)
               VALUES ($1, $2, $3)
               RETURNING ...`,
              [email, passwordHash, displayName || null]  // Store the hash, not the password
          );
          const user = rows[0];
          const tokens = await issueTokens(user);
          res.status(201).json({ user, ...tokens });
      } catch (err) { next(err); }
  });
  ```
  The password is hashed with `bcrypt.hash(password, 12)` before storing. The plain password is *never* stored, never logged, never transmitted except over HTTPS during signup/login.
- **(M6) Elaboration:** the second argument to `bcrypt.hash()` is the "work factor" (12). Higher = slower to compute (defensive against brute-force). The trade-off: signup/login takes ~100ms per user (acceptable); an attacker trying 1 billion password combinations would take years.

### Concept 2: Bcrypt and salt — the hashing mechanism
- **(M7) Concrete:** "You hash 'password123' twice. Do you get the same hash both times, or different hashes? If they're different, how does login verification work?"
- **The idea:** bcrypt includes a **salt** (random data) in the hash output. The same password hashed twice produces *different* hashes because the salt is different each time. This prevents **rainbow table attacks** (pre-computed tables of "password → hash" used to reverse hashes).
  - Login verification works by: hash the submitted password with the salt extracted from the stored hash, then compare.
  - Example: if the database has `hash = '$2b$12$R9h/cIPz0gi.URNNUGEP2OPST9/PgBkqquzi.Ss7KIUgO2t0jKMm2'`, and the user submits `password123`, bcrypt extracts the salt (`$2b$12$R9h/cIPz0gi.URNNUGEP2`), re-hashes `password123` with that salt, and checks if the result matches the stored hash.
- **Real code** (`server/routes/auth.js`, login):
  ```javascript
  router.post('/login', async (req, res, next) => {
      try {
          const { email, password } = LoginSchema.parse(req.body);
          const { rows } = await pool.query(
              `SELECT id, email, display_name, password_hash, ...
               FROM users WHERE email = $1 AND deleted_at IS NULL`,
              [email]
          );
          const user = rows[0];
          if (!user) return res.status(401).json({ error: 'invalid_credentials' });

          const ok = await bcrypt.compare(password, user.password_hash);  // Verify
          if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

          const tokens = await issueTokens(user);
          delete user.password_hash;  // Never send hash to client
          res.json({ user, ...tokens });
      } catch (err) { next(err); }
  });
  ```
  `bcrypt.compare(password, user.password_hash)` returns true if the password matches, false otherwise. Both wrong email and wrong password return 401 with the same message (prevents enumeration).
- **(M3) Retrieval check:** "If two users have the same password, do their password hashes look the same?"
  > Answer: No. Each hash includes a unique salt, so even identical passwords produce different hashes.

### Concept 3: JWT structure — header.payload.signature
- **(M7) Concrete hook:** "A token arrives in the request header. How does the server know the client didn't *forge* it — didn't just make up a token claiming to be user ID 'alice'?"
- **The idea:** a JWT is three Base64-encoded parts separated by dots: `header.payload.signature`.
  - **header:** `{ "alg": "HS256", "typ": "JWT" }` — algorithm and type.
  - **payload:** `{ "sub": "alice", "email": "alice@example.com", "iat": 1234567890 }` — the claims (data).
  - **signature:** HMAC-SHA256 of `header.payload` using a secret key that *only the server knows*. If the client modifies the payload, the signature becomes invalid.

  Example: if the server's secret is `"my-secret"`, the signature is `HMAC-SHA256(header.payload, "my-secret")`. If the client changes the payload to claim `sub: "bob"`, the signature no longer matches (they don't know the secret to recompute it).
- **(M4) Generate first:** "A malicious client intercepts a token, modifies the `sub` claim to a different user, and sends it back. Does the server accept it?"
- **Real code** (`server/routes/auth.js`, token issue):
  ```javascript
  async function issueTokens(user) {
      const accessToken = jwt.sign(
          { sub: user.id, email: user.email },  // Payload
          process.env.JWT_SECRET,  // Secret key
          { expiresIn: '15m' }  // Expires in 15 minutes
      );
      const refreshToken = jwt.sign(
          { sub: user.id, type: 'refresh' },
          process.env.JWT_SECRET,
          { expiresIn: '30d' }
      );
      // ... persist hash in refresh_tokens table
      return { accessToken, refreshToken };
  }
  ```
  `jwt.sign()` computes the signature using `JWT_SECRET`. The client receives the full token and sends it back in every request. The server verifies the signature using the same secret.
- **Real code** (`server/middleware/requireAuth.js`, verification):
  ```javascript
  function requireAuth(req, res, next) {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'missing_token' });

      try {
          const payload = jwt.verify(token, process.env.JWT_SECRET);  // Verify signature
          if (payload.type === 'refresh') {
              return res.status(401).json({ error: 'refresh_token_not_accepted' });
          }
          req.user = { id: payload.sub, email: payload.email };
          next();
      } catch (_err) {
          return res.status(401).json({ error: 'invalid_token' });
      }
  }
  ```
  `jwt.verify()` throws an error if:
  - The signature is invalid (tampered token).
  - The token is expired (`expiresIn` has passed).
  - The secret doesn't match (token from a different server).
- **(M6) Elaboration — the critical misconception:** "JWTs are encrypted" is *wrong*. The payload is Base64-encoded (not encrypted), so anyone can decode it and read the claims. The *signature* prevents tampering, but it doesn't hide the payload. **Never put secrets in the JWT payload.** (Example: don't put the user's password or an API key in the JWT.)

### Concept 4: Token types and the T-01 guard
- **(M4) Generate first:** "You have two types of tokens: access (short-lived, 15 min) and refresh (long-lived, 30 days). Can the client use a refresh token to call a protected route like `/workouts`? Should you allow it?"
- **The idea:** Peak Fettle issues two tokens:
  - **Access token:** used for every API call (e.g., `GET /sets`). Short-lived (15 min) to limit exposure if stolen.
  - **Refresh token:** used only to *refresh* the access token (e.g., `POST /auth/refresh`). Longer-lived (30 days) because it's used less frequently and stored more safely.

  If a client presents a *refresh* token as an *access* token, it's either a bug or an attack. Peak Fettle rejects it with 401. This is the **T-01** guard: distinguish token types at the middleware layer.
- **Real code** (`server/routes/auth.js`, token issue):
  ```javascript
  const accessToken = jwt.sign(
      { sub: user.id, email: user.email },  // No 'type' field — this is an access token
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },  // 'type: refresh' — this is a refresh token
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
  );
  ```
- **Real code** (`server/middleware/requireAuth.js`, T-01 guard):
  ```javascript
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.type === 'refresh') {
      return res.status(401).json({ error: 'refresh_token_not_accepted' });
  }
  ```
  If the client tries to use a refresh token (which has `type: 'refresh'`) as an access token, the middleware rejects it.

### Concept 5: Token rotation and revocation — the T-02 pattern
- **(M4) Generate first:** "A user logs out. Should the old access token still work if the client sends it? How do you *prove* it's been revoked?"
- **The idea:** JWTs are *stateless* — the server doesn't store them. But logout requires *revoking* the token, so it can't be reused. Peak Fettle solves this with **token rotation**:
  1. When the client calls `/auth/refresh`, the server issues a *new* pair (access + refresh).
  2. The server *deletes* the old refresh token hash from the database.
  3. If the client tries to reuse an old refresh token (e.g., a stolen one), the server looks it up in the revocation list, doesn't find it, and rejects the request.

  This makes refresh tokens single-use (token rotation hardening).
- **Real code** (`server/routes/auth.js`, token issue with revocation):
  ```javascript
  async function issueTokens(user) {
      const accessToken = jwt.sign(
          { sub: user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '15m' }
      );
      const refreshToken = jwt.sign(
          { sub: user.id, type: 'refresh' },
          process.env.JWT_SECRET,
          { expiresIn: '30d' }
      );

      // Persist hash so logout can revoke it.
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await pool.query(
          `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (token_hash) DO NOTHING`,
          [user.id, hashToken(refreshToken), expiresAt]
      );

      return { accessToken, refreshToken };
  }
  ```
- **Real code** (`server/routes/auth.js`, token refresh with rotation):
  ```javascript
  router.post('/refresh', async (req, res, next) => {
      try {
          const { refreshToken } = req.body || {};
          if (!refreshToken) return res.status(400).json({ error: 'missing_refresh_token' });

          const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
          if (payload.type !== 'refresh') {
              return res.status(401).json({ error: 'invalid_token' });
          }

          // T-02: verify the token hash is in the active-tokens list.
          const hash = hashToken(refreshToken);
          const { rows: tokenRows } = await pool.query(
              `DELETE FROM refresh_tokens
               WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()
               RETURNING user_id`,
              [hash, payload.sub]
          );
          if (tokenRows.length === 0) {
              return res.status(401).json({ error: 'invalid_token' });
          }

          // Issue a new rotated pair.
          const { rows: userRows } = await pool.query(
              `SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL`,
              [payload.sub]
          );
          if (!userRows[0]) return res.status(401).json({ error: 'invalid_token' });

          const tokens = await issueTokens(userRows[0]);
          res.json(tokens);
      } catch (_err) {
          return res.status(401).json({ error: 'invalid_token' });
      }
  });
  ```
  On refresh, the old token hash is deleted (line `DELETE FROM refresh_tokens ...`). The new pair is issued. If the client tries to use the old refresh token again, the DELETE finds nothing, and the request fails with 401.
- **(M6) Elaboration:** why hash the refresh token before storing? So if the DB is leaked, an attacker doesn't immediately have valid refresh tokens. They'd need to brute-force the hash (hard, just like password hashes).

### Concept 6: Logout — revoking tokens
- **(M4) Generate first:** "A user clicks 'log out'. You have a short-lived access token (15 min) and a long-lived refresh token (30 days). The access token will expire on its own. But the refresh token could be used to issue a new access token tomorrow. How do you revoke it?"
- **The idea:** on logout, the server deletes the refresh token hash from the database. If the client later tries to call `/auth/refresh` with that token, the query finds nothing and returns 401. The access token can't be revoked instantly (it's stateless), but it expires in 15 min anyway, and after logout the client should discard both tokens.
- **Real code** (`server/routes/auth.js`, logout):
  ```javascript
  router.post('/logout', async (req, res, next) => {
      try {
          const { refreshToken } = req.body || {};
          if (!refreshToken) {
              return res.status(204).end();  // No token, already logged out
          }

          let hash;
          try {
              hash = hashToken(refreshToken);
          } catch (_) {
              return res.status(204).end();  // Malformed token, treat as already logged out
          }

          await pool.query(
              `DELETE FROM refresh_tokens WHERE token_hash = $1`,
              [hash]
          );

          res.status(204).end();
      } catch (err) { next(err); }
  });
  ```
  The logout endpoint doesn't even verify the JWT signature (line `// We don't need to verify the JWT signature here`). It just hashes the token and deletes it. If the hash isn't in the DB, the DELETE is a no-op, and the response is still 204 (idempotent).

### Concept 7: Token storage — localStorage vs. httpOnly cookies
- **(M4) Generate first:** "Your web client gets an access token. Store it in localStorage (JavaScript can access it), or in an httpOnly cookie (JavaScript cannot)? What's the trade-off?"
- **The idea:** two storage mechanisms, two threat models:
  - **localStorage:** JavaScript can read/write it. Vulnerable to XSS (cross-site scripting) — if the attacker injects malicious JS, they steal the token and impersonate the user. Defended against CSRF (cross-site request forgery) because the token isn't auto-sent in cookie headers.
  - **httpOnly cookie:** JavaScript *cannot* read it. The browser auto-includes it in every request. Defended against XSS (script can't steal what it can't read). Vulnerable to CSRF (the attacker's website can form a request that the browser auto-includes the cookie in, if the CSRF token isn't checked).

  Every choice has a risk:
  - XSS: inject malicious JS into the app to steal data / impersonate the user.
  - CSRF: trick the user's browser into making an unwanted request (e.g., form submission from attacker.com to peakfettle.com/delete-account).

  **Peak Fettle's choice:** not yet finalized in code, but the lesson explores both. Best practice for a SPA (single-page app) with a separate backend: httpOnly cookie for reading (auto-sent), CSRF token for mutations (written to a non-httpOnly cookie, included in POST body).
- **(M6) Elaboration:** neither choice is "perfect." The goal is defense-in-depth:
  1. **Prevent XSS:** Content Security Policy (helmet does this), input validation, escape user data.
  2. **Prevent CSRF:** CSRF token, SameSite cookie flag.
  3. **Minimize exposure:** short-lived access tokens, token rotation.
  Peak Fettle should probably use httpOnly cookies + CSRF tokens + SameSite=Strict. The quiz explores this trade-off.

### Concept 8: The full auth flow — signup → login → token refresh → logout
- **(M4) Generate first:** "A new user signs up, logs in, makes API calls for a week, then logs out. Trace the tokens and database operations."
- **The idea:** the complete flow:
  1. **Signup:** POST `/auth/signup` with email + password → password hashed with bcrypt → user created → access + refresh tokens issued → refresh token hash persisted.
  2. **Login:** POST `/auth/login` with email + password → password verified with bcrypt.compare() → access + refresh tokens issued → new refresh token hash persisted.
  3. **API calls:** client sends access token in `Authorization: Bearer <token>` header → middleware verifies signature and expiry → grants access to protected routes.
  4. **After 15 min:** access token expires. Client calls POST `/auth/refresh` with refresh token → old token hash deleted from DB → new access + refresh tokens issued.
  5. **Logout:** POST `/auth/logout` with refresh token → token hash deleted from DB → client discards both tokens.
  6. **Reuse attempt:** attacker tries to use the old refresh token → query finds no hash in DB → 401 Unauthorized.
- **Real code**: already shown in pieces above. The full flow is in `auth.js`.

## 6. Teach-back (M10)
"Explain to a security auditor, in ~6 sentences: what bcrypt does, how JWTs prevent token forgery (but don't encrypt), why tokens need different types (access vs. refresh), and how logout revokes a long-lived refresh token."

## 7. Cumulative review (M13) — rapid-fire
1. Why does bcrypt produce a different hash for the same password each time?
2. What is the role of the `signature` in a JWT, and what does it prevent?
3. If a client presents a refresh token to `/workouts`, what should the server return?
4. After a user logs out, can they use an old refresh token to get a new access token?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | What is the primary difference between hashing and encryption? | Correctly identifies: hashing is one-way (can't recover password), encryption is two-way (can be decrypted with key). | Hashing is one-way; you can verify a password by hashing it again and comparing, but you cannot recover the original password from the hash. Encryption is two-way; the original can be recovered if you have the key. | 8 |
| q2 | L2 | free | Explain what a salt is in bcrypt, and why it prevents rainbow table attacks. | References salt as random data mixed into the hash; explains rainbow tables as pre-computed password→hash mappings that become useless if the salt is unknown. | A salt is random data mixed into the password before hashing. Even if two users have the same password, their salts are different, so their hashes are different. Rainbow tables (pre-computed password→hash dictionaries) are useless because the attacker doesn't know the salts. | 12 |
| q3 | L3 | free | A user submits password "secret123" at login. Trace bcrypt.compare(): what is compared, and what gets returned? | Correctly traces: password hashed with stored salt → compared to stored hash → boolean result. | bcrypt.compare(password, stored_hash) extracts the salt from stored_hash, re-hashes "secret123" with that salt, then compares the result byte-for-byte with stored_hash. Returns true if they match, false otherwise. | 15 |
| q4 | L4 | free | Describe the three parts of a JWT (header.payload.signature) and explain why modifying the payload invalidates the signature. | Correctly names all three parts; explains signature = HMAC(header.payload, secret), so changing payload changes the HMAC. | Header: { "alg": "HS256", "typ": "JWT" }. Payload: { "sub": "alice", ... }. Signature: HMAC-SHA256(header.payload, secret_key). If the client modifies the payload, the signature no longer matches because they don't know the secret to recompute the HMAC. | 18 |
| q5 | L5 | free | A teammate proposes storing JWTs in localStorage for convenience. Evaluate the security trade-off: what attack does localStorage expose you to that httpOnly cookies avoid, and what attack does localStorage defend against that cookies don't? | localStorage exposes to XSS (script can steal token). Defends against CSRF (token not auto-sent in headers). httpOnly avoids XSS but exposes to CSRF. | localStorage: vulnerable to XSS (malicious script steals the token from localStorage), defended against CSRF (attacker's page can't read the token to include in a forged request). httpOnly cookies: defended against XSS (script can't read it), vulnerable to CSRF (browser auto-includes cookie in any cross-origin request). Best: httpOnly + CSRF token + SameSite. | 21 |
| q6 | L5 | free | Peak Fettle uses token rotation: on `/auth/refresh`, the old refresh token is deleted and a new pair is issued. What attack does token rotation defend against, and what's the residual risk? | Identifies: token rotation defends against refresh token reuse / replay attacks (if a token is stolen, it's single-use). Residual risk: the attacker can still use it once to get a new pair before the user notices. | Token rotation defends against stolen refresh token replay: each refresh invalidates the old token, so an attacker can't use a stolen token multiple times. Residual risk: the attacker can still refresh once before the legitimate user refreshes, getting a valid access token. Mitigation: short access token lifetime (15 min) and user monitoring (alert if refreshes happen from unusual locations). | 22 |

## 9. Custom interactive widget
**Token lifecycle visualizer** — timeline showing:
- Signup → passwords hashed → tokens issued.
- API calls with access token (verified each request).
- Token expiry at 15 min mark.
- Refresh call → old token deleted, new pair issued.
- Logout → refresh token hash deleted.
- Attempted reuse → 401 Unauthorized.

Users can drag a timeline slider to advance time, see expiry, and visualize the "stolen token, then refresh" scenario.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: assess crypto understanding (often the hardest part for new engineers); whether JWT "not encrypted" misconception was cleared; which storage choice (localStorage vs. httpOnly) made sense.
- Offer to schedule L10 (Scaling & deployment) as the next rung; note that scaling auth changes the problem (no longer single server, JWT statelessness becomes a feature).
- Queue carry-over question: "If Peak Fettle runs on 10 servers, and a user's refresh token is revoked on server A, but server B still has the token in a cache, what goes wrong?"
