# Lesson L07 — Node.js & Express fundamentals

> **Track:** 2 — Node/Express/REST/auth/LLM/cron/deploy · **Status:** ⭐ Reference lesson (fully worked)
> **Interactive app:** [`L07_node_express.html`](L07_node_express.html)
> **Estimated time:** ~40 min · **Prerequisite rungs:** L01–L06 (codebase context)

## 0. Source of truth (read fresh before teaching — code drifts)
- `peak-fettle-agents/server/index.js` — the Express app, middleware stack, route registration, port binding.
- `peak-fettle-agents/server/db.js` — Postgres connection pool setup for Supabase.
- `peak-fettle-agents/server/middleware/errorHandler.js` — centralized error handling (ZodError → 400, pg errors → mapped status codes).
- `peak-fettle-agents/server/middleware/requireAuth.js` — JWT validation middleware, token type guards.
- `peak-fettle-agents/server/package.json` — dependencies: express, helmet, cors, express-rate-limit, pg, zod, bcrypt, jsonwebtoken.

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L1)** Name the role of each piece of middleware in the Express app (helmet, CORS, rate-limiter, error handler).
- **(L2)** Explain why middleware order matters in Express and the consequence of placing error handler at the end instead of the beginning.
- **(L3)** Trace a request through the middleware pipeline, including what each middleware adds/modifies on `req` and `res`.
- **(L4)** Analyze the security trade-off of placing the auth middleware early vs. late in the stack, and design the ideal ordering given a set of routes.
- **(L5)** Evaluate the effect on performance and security of moving rate-limit to a global limiter vs. route-specific limiters, and justify a choice for Peak Fettle's two-tier model.

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion
- "Node.js experience: none / heard of it / can read basic JS / can write Node services?"
- "Have you worked with HTTP middleware or Express-like frameworks before?"
- "Today: focus on the middleware pipeline architecture, or also deep-dive auth/error handling?"
> Calibrate: profile says backend is new — go concept-first, show working code in pieces, not a dump. Show *why* middleware order matters through a concrete failure scenario.

## 3. Spacing carry-over (M14)
First lesson in Track 2, so nothing to carry. (Next lesson: "what does the discriminated union on `kind` in a request do, and how does Zod validate it?")

## 4. The difficulty ladder for THIS lesson (M2)
1. What is Node.js and why Express sits on top — the event loop, async I/O, a web server *is* a router.
2. Middleware: what it is, how it chains, why the stack order matters.
3. The helmet / CORS / rate-limit trio — security headers, cross-origin policy, brute-force defence.
4. The error handler — why it goes last, how it maps errors to HTTP responses.
5. Request flow: incoming → middleware → route handler → response.
6. A middleware-ordering failure mode: auth before rate-limit leaks whether an email exists.

## 5. Concept sequence

### Concept 1: Node.js and the event loop — async, non-blocking I/O
- **(M7) Concrete hook:** "Your Python app does `db.query()` and blocks. Node does the same — but the thread doesn't wait; instead it *registers a callback* and moves on to the next request. When the DB responds, the callback fires and the response goes back."
- **The idea:** Node.js is *single-threaded* but *non-blocking*. Each request doesn't own a thread; instead, all requests share *one* thread + a callback queue. This lets a $5/month server handle 10,000 concurrent connections (vs. a thread-per-request model, which dies at ~300). The tradeoff: you must never block the thread (no synchronous file I/O, no `while(true)` CPU loops).
- **(M4) Generate first:** "Peak Fettle logs 500 sets to Postgres a day. Would you use `db.query()` (async) or `fs.readFileSync()` (blocking)? Why?"
- **Real code** (`server/index.js`):
  ```javascript
  app.listen(port, () => {
      console.log(`[peak-fettle-api] listening on :${port}`);
  });
  ```
  This line registers a callback with Node's event loop: "when the OS sends me a TCP packet on port 4000, invoke this." The program doesn't hang waiting — it yields the thread to handle other requests.
- **(M6) Elaboration:** the Postgres driver (`pg` package) internally queues your `.query()` calls and uses async I/O. The pool holds 2 connections (line 15 of `db.js`); each can handle one query at a time, but they're *active* in the background while Node serves other requests.

### Concept 2: What Express middleware *is* — a function that wraps the request
- **(M4) Generate first:** "You want to log every request, add a header to every response, and check auth before certain routes. How would you avoid copying that code into every route handler?"
- **The idea:** middleware is a function `(req, res, next) => { ... }` that Express invokes for *every* request in a *defined order*. Each middleware can:
  - Read or modify `req` (attach data, check headers).
  - Read or modify `res` (set headers, status codes).
  - Call `next()` to pass control to the next middleware.
  - Respond directly (call `res.json()`, `res.send()`) and *stop* the chain.
  - Call `next(err)` to jump to the error handler.
- **Real code** (`server/index.js`):
  ```javascript
  app.use(helmet());  // Add security headers; calls next()
  app.use(express.json());  // Parse JSON body; calls next()
  app.use(cors({ origin: allowedOrigin }));  // Check CORS; calls next() or res.status(403)
  app.use('/auth', authLimiter, authRoutes);  // Rate-limit, then route
  ```
  Each `app.use()` *registers* middleware. Express walks the list in order for every request.
- **(M3) Retrieval check:** "If helmet is on line 46 and CORS is on line 48, does a request from an unauthorized origin get the helmet headers before being rejected by CORS?"

### Concept 3: The helmet / CORS / rate-limit trio
- **(M7) Concrete:** "CORS: a browser on `example.com` tries to fetch from Peak Fettle's API at `api.peakfettle.com`. Without CORS, the browser blocks it. With CORS, the server says 'yes, example.com is allowed' and the browser lets it through."
- **The idea:**
  - **helmet**: adds HTTP response headers that tell the browser "don't allow inline JavaScript" (`Content-Security-Policy`), "prevent MIME type sniffing" (`X-Content-Type-Options`), etc. These stop certain classes of injection attacks. Helmet doesn't *block* requests; it makes responses harder to exploit.
  - **CORS** (`cors` package): checks the `Origin` header of the request against a whitelist. If the origin isn't whitelisted, it rejects the request with a 403. (Note: CORS is a *browser enforcement*; curl doesn't enforce it. CORS protects web apps, not API clients.)
  - **rate-limit** (`express-rate-limit`): tracks IPs (or custom keys) and rejects requests that exceed a threshold. Stops brute-force password guesses, DOS attacks.
- **Real code** (`server/index.js`, lines 38–61):
  ```javascript
  const allowedOrigin = process.env.WEB_ORIGIN || (isDev ? 'http://localhost:3000' : null);
  if (!allowedOrigin) {
      console.error('[peak-fettle-api] FATAL: WEB_ORIGIN env var must be set in production.');
      process.exit(1);  // Fail loud if not configured
  }
  app.use(cors({ origin: allowedOrigin }));

  const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,  // 15 minutes
      max: 20,  // 20 attempts per window
      message: { error: 'too_many_requests' },
  });
  ```
  Production safety: if `WEB_ORIGIN` is missing, the app crashes at startup. The auth limiter allows 20 login attempts per 15 min per IP — enough for legitimate users, but stops automated scanning.
- **(M6) Elaboration:** Why whitelist `WEB_ORIGIN` explicitly? If you allow all origins (`*`), a malicious web page can steal the user's session cookies / tokens. CORS whitelisting *and* token storage choice (httpOnly cookies vs. localStorage) both matter.

### Concept 4: The middleware pipeline order — why it matters
- **(M9) Faded — the stakes:** middleware order is **not** a detail; it's an architecture decision. Wrong order = subtle security leaks.
- **Example failure mode:** if you place the rate-limiter *after* auth, then:
  1. Attacker sends `POST /auth/login?email=alice@example.com` with a bad password.
  2. `requireAuth` middleware runs *first* — but `/auth/login` is public, so `requireAuth` isn't applied. No problem yet.
  3. The request reaches the auth handler, which checks the password, fails, returns 401.
  4. Attacker sends the *same* request 1,000 times. Since rate-limit hasn't run yet, all 1,000 hit the handler.
  5. Attacker learns "alice@example.com exists" by seeing a 401 (email found, bad password) vs. 404 (email not found). This is *email enumeration*.

  **The correct order:** apply rate-limit *before* any route logic:
  ```javascript
  app.use('/auth', authLimiter, authRoutes);  // Line 67: limiter first
  app.use('/workouts', requireAuth, workoutsRoutes);  // auth after limiter, but only on /workouts
  ```
- **(M4) Generate first:** "You have helmet, CORS, auth, rate-limit, error handler, and two route groups (/public and /protected). Order them to maximize security without letting the error handler catch security errors."
- **Real code** (`server/index.js`, lines 46–102):
  ```javascript
  // Security policies (always first — protect all traffic)
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));  // Parse JSON
  app.use(cors({ origin: allowedOrigin }));   // Check origin

  // Health check (not rate-limited — used by uptime monitors)
  app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  // Public routes — auth is rate-limited
  app.use('/auth', authLimiter, authRoutes);  // Rate-limit on auth paths

  // Protected routes — auth required
  app.use('/workouts', requireAuth, workoutsRoutes);

  // Error handler — LAST (catches all thrown errors)
  app.use(errorHandler);
  ```
  The order: helmet → CORS → health → rate-limit → auth → routes → error handler. Each layer builds on the ones before.

### Concept 5: The error handler — mapping exceptions to HTTP responses
- **(M4) Generate first:** "Your route handler calls `await db.query()` and the DB is down. The promise rejects with an error. What do you return to the client, and how does the error get there?"
- **The idea:** instead of wrapping every route in `try/catch`, you throw errors and let the error handler catch them at the end of the middleware stack. Express has a special convention: if middleware calls `next(err)`, Express jumps directly to the error handler (skipping other routes).
- **Real code** (`server/middleware/errorHandler.js`):
  ```javascript
  function errorHandler(err, _req, res, _next) {
      if (err && err.name === 'ZodError') {
          return res.status(400).json({ error: 'validation_failed', details: err.issues });
      }
      if (err && err.code === '23505') { // pg unique violation
          return res.status(409).json({ error: 'conflict' });
      }
      console.error('[unhandled]', err);
      return res.status(500).json({ error: 'internal_error' });
  }
  ```
  This maps three error types to HTTP responses:
  - Zod validation errors → 400 Bad Request.
  - Postgres unique constraint violation (code 23505) → 409 Conflict (e.g., email already registered).
  - Everything else → 500 Internal Server Error (and log for Sentry).
- **(M6) Elaboration:** why map errors at all? Consistency. Every 400 has the same shape (`{ error: 'validation_failed' }`), so the client can parse it the same way everywhere. A raw exception string from the DB would be unpredictable and leak implementation details.
- **(M3) Retrieval check:** "A route calls `res.json({ user })` and then `throw new Error('oops')`. Does the error handler catch it, and what gets sent to the client?"
  > Answer: No. Once `res.json()` is called, the response headers are sent, and throwing an error after that is too late. The error is logged, but the client gets the successful response. This is a common Node bug. Best practice: never call `res.json()` and then throw.

### Concept 6: Request flow through the stack — tracing a real request
- **(M4) Generate first:** "A user at `web.peakfettle.com` logs in. Trace the request from the browser to the response, naming each middleware and any guard checks."
- **The idea:** a POST to `/auth/login` enters the app and walks *every* middleware in order:
  1. **helmet** — adds security headers (e.g., `Content-Security-Policy`), calls `next()`.
  2. **express.json()** — parses the JSON body, populates `req.body`, calls `next()`.
  3. **cors()** — checks `Origin: web.peakfettle.com` against the whitelist. If allowed, calls `next()`. If denied, returns 403.
  4. **GET /health** — not a match, skips.
  5. **authLimiter** on `/auth` — checks the IP. If under 20 requests per 15 min, calls `next()`. If over, returns 429 Too Many Requests.
  6. **authRoutes** (the login handler) — calls `pool.query()` to look up the user, compares password with bcrypt, issues tokens.
  7. **The response** is sent: 200 + `{ user, accessToken, refreshToken }`.

  If an error is thrown (e.g., the email doesn't exist, return 401 early), the handler calls `return res.status(401).json(...)` and the middleware chain stops there. No error handler invoked, just a normal HTTP response.
- **Real code** (`server/routes/auth.js`, login handler excerpt):
  ```javascript
  router.post('/login', async (req, res, next) => {
      try {
          const { email, password } = LoginSchema.parse(req.body);
          const { rows } = await pool.query(
              `SELECT ... FROM users WHERE email = $1`,
              [email]
          );
          const user = rows[0];
          if (!user) return res.status(401).json({ error: 'invalid_credentials' });
          // ... check password, issue tokens
      } catch (err) { next(err); }
  });
  ```
  The `try/catch` calls `next(err)`, which jumps to the error handler. If the Zod schema fails to parse, it throws a ZodError, which the error handler catches and returns 400.

### Concept 7: Database connection pooling — why you can't block
- **(M7) Concrete:** "You have a pool of 2 Postgres connections (line 15, `db.js`). If two requests call `pool.query()` at the same time, what happens to a third request?"
- **The idea:** the pool holds a *fixed* set of connections. Once all connections are in use, the next `.query()` *waits in a queue*. If 100 requests arrive at once, they queue up, and the pool serves them in order. If the pool is starved (all connections hung or slow), latency explodes.
- **Real code** (`server/db.js`):
  ```javascript
  const pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      max: 2,  // Only 2 connections; Supabase nano instance is tiny
      idleTimeoutMillis: 10_000,  // Release idle connections quickly
      connectionTimeoutMillis: 10_000,  // Fail if can't get a connection
  });
  ```
  `max: 2` is intentional — Peak Fettle runs on a Supabase nano (512 MB RAM). A bigger pool would use too much memory. The comment says: "2 connections is enough for low-traffic / early-stage: one active query + one spare for a burst."
- **(M6) Elaboration:** as compute scales, this will need to change. The code *already* documents when to raise it: "Raise to 5–10 once compute is upgraded to micro or above." This is a capacity-planning anchor.

## 6. Teach-back (M10)
"Explain to a new backend engineer, in ~6 sentences: what Node.js and Express are, why middleware order matters, and how an error in a route handler gets to the client as a JSON response."

## 7. Cumulative review (M13) — rapid-fire
1. What does helmet do, and why does it not block requests?
2. If CORS rejects a request, at what stage does the browser know?
3. Why is the error handler placed *last* in the middleware stack?
4. If the DB pool has 2 connections and 5 requests arrive simultaneously, how many queue?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | What does the `cors` middleware do? | Correctly identifies CORS role | "Checks the Origin header and allows/rejects cross-origin requests based on the whitelist." | 8 |
| q2 | L2 | free | Explain why the error handler must come *after* all routes, not before. | Surfaces: error handler only catches errors that are *thrown* and reach it; if it came first, routes wouldn't run. | Error handler needs to catch exceptions from route handlers. If it came first, all subsequent routes/middleware wouldn't execute. | 12 |
| q3 | L3 | free | A request POST /auth/login arrives at the Express app. Trace it through helmet, express.json, CORS, rate-limit, and the auth handler. Name what each does. | Walks through each middleware in order; notes when the request could be rejected (CORS, rate-limit); names the final response. | Helmet adds headers (next). JSON parser parses body (next). CORS checks Origin, allows (next). RateLimit checks IP, allows (next). AuthRoutes validates login, issues token (response). | 15 |
| q4 | L4 | free | You want to protect a route with auth, but rate-limiting should apply globally to all routes. Where do you place the auth middleware and the rate-limiter in the middleware stack, and why? | Positions rate-limit early (global security); auth is route-specific (later); justifies each choice. | Rate-limiter goes in the global stack (app.use()) before specific routes so it applies to everything. Auth goes on the /protected routes only (app.use('/protected', requireAuth, ...)). | 18 |
| q5 | L5 | free | The Pool has max=2 connections and 10 requests arrive in a burst. How many queue, and what is the risk if they stay queued for >10 seconds? | Names: 8 queue (10 requests, 2 in use). Risk: connectionTimeoutMillis=10000, so after 10s any queued request fails with a timeout error. | 8 requests queue. After 10 seconds (connectionTimeoutMillis), queued requests fail with a connection timeout, returning 500 to the client. | 21 |
| q6 | L5 | free | Critique this middleware order: helmet → auth → CORS → routes → error handler. What attack does this expose Peak Fettle to? | Identifies the vulnerability: CORS comes *after* auth, so the auth check runs before origin validation; a malicious origin could probe /workouts (protected) and measure response timing to infer whether emails exist. Proposes swapping CORS and auth. | CORS should come before auth. Otherwise, an attacker can time /workouts requests to enumerate registered users — the server responds faster to users (cache hit) than non-users. Moving CORS first ensures origin validation happens globally. | 22 |

## 9. Custom interactive widget
**Middleware order visualizer** — drag-and-drop cards for helmet, CORS, rate-limit, auth, error handler, routes. Shows the request flow in real time and highlights which requests would be rejected at each stage. Includes a "show failure" mode that demonstrates the L5 q6 enumeration attack.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: assess Node.js familiarity; whether middleware-chaining mental model stuck; any confusion on blocking vs. non-blocking.
- Offer to schedule L08 (REST API design) as the next rung; queue carry-over questions on "why does rate-limit go before auth" and "what does middleware order protect against?"
