# Lesson L08 — REST API design: resources, verbs, and contracts

> **Track:** 2 — Node/Express/REST/auth/LLM/cron/deploy · **Status:** ⭐ Reference lesson (fully worked)
> **Interactive app:** [`L08_rest_api.html`](L08_rest_api.html)
> **Estimated time:** ~45 min · **Prerequisite rungs:** L07 (middleware, Express routing)

## 0. Source of truth (read fresh before teaching — code drifts)
- `peak-fettle-agents/server/routes/` — all endpoint implementations:
  - `sets.js` — POST (log a set), GET (paginated history), DELETE (remove a set).
  - `workouts.js` — workout CRUD + notes.
  - `exercises.js` — global exercise library (search, browse).
  - `user.js` — GDPR data export, account deletion.
  - `percentile.js`, `templates.js`, `groups.js`, `healthMetrics.js`, `csvImport.js` — various domain-specific endpoints.
- `peak-fettle-agents/server/middleware/requireAuth.js` — JWT verification before protected routes.
- `peak-fettle-agents/server/routes/auth.js` — signup, login, token refresh, logout (the token-generation contract).

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L1)** Identify HTTP verbs (GET, POST, PATCH, DELETE) and name the intent of each.
- **(L2)** Explain the REST principle: "resources as nouns, HTTP verbs as actions" and why Peak Fettle uses `/sets`, not `/logSet`.
- **(L3)** Trace a request through request validation (Zod schema) → DB query → response normalization, and name where each layer can fail.
- **(L4)** Design an API endpoint's status codes and error shape, balancing developer experience with security (e.g., returning 401 vs. 404 for a missing auth token).
- **(L5)** Critique a public API surface for privacy/GDPR compliance and propose missing endpoints to prove deletions actually happened.

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion
- "HTTP methods experience: familiar with GET/POST only, or also PATCH/DELETE?"
- "API design: have you designed endpoints yourself, or mostly consumed them?"
- "Today: focus on the Peak Fettle endpoint patterns, or also dive into the Zod validation + error-handling layers?"
> Calibrate: Arvin's backend is new, so start with "what is a resource" and walk through a real POST → GET → DELETE cycle on `/sets`. The Zod validation and error handler link back to L07.

## 3. Spacing carry-over (M14)
Opening carry-over from L07: "What does middleware order protect against, and where does rate-limiting fit in your API design?"
(Next lesson L09: "Why are access tokens different from refresh tokens, and how do you prove the token actually came from your server?")

## 4. The difficulty ladder for THIS lesson (M2)
1. HTTP verbs and what they mean — GET (safe, idempotent), POST (create), PATCH (update), DELETE (remove).
2. Resources as the unit — `/users/{id}`, `/sets`, `/workouts/{id}/sets` — REST nouns, not verbs.
3. The request → validation → DB → response flow, and where errors live.
4. Idempotency and pagination — designing for reliability and scale.
5. Status codes as a contract: 200, 201, 204, 400, 401, 403, 404, 409, 500.
6. Privacy/GDPR: designing endpoints so data can be exported and deleted, and proving it happened.

## 5. Concept sequence

### Concept 1: HTTP verbs — the action layer
- **(M7) Concrete hook:** "You have an exercise. How do you... create one? Read it back? Change its name? Delete it? Four operations, four different HTTP requests."
- **The idea:** HTTP defines verbs (methods) that correspond to CRUD operations:
  - **GET** — read only, safe (doesn't change state), idempotent (same result every time).
  - **POST** — create, not idempotent (posting twice creates two records).
  - **PATCH** — update part of a record, idempotent (patching the same data twice = same result).
  - **DELETE** — remove, idempotent (deleting an already-deleted record = 404 = same outcome).

  These aren't magical; they're conventions that browsers, caches, and proxies understand. A browser won't auto-retry a failed POST (you'd duplicate), but it *will* auto-retry a GET. A cache will store GET responses but not POST.
- **(M4) Generate first:** "Peak Fettle allows users to undo a set log. Should that be PATCH (update a deleted flag) or DELETE (remove the row)? Why?"
- **Real code** (`server/routes/sets.js`, DELETE endpoint):
  ```javascript
  router.delete('/:id', async (req, res, next) => {
      try {
          const { rowCount } = await pool.query(
              `DELETE FROM sets WHERE id = $1 AND user_id = $2`,
              [req.params.id, req.user.id]
          );
          if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
          res.status(204).end();  // 204 No Content — deletion succeeded, no body
      } catch (err) { next(err); }
  });
  ```
  DELETE returns 204 (No Content) on success — no JSON body, just headers. This signals: "the resource is gone; there's nothing to return." If called twice, the second call gets 404 (the record is already gone), but the *intent* (delete) is idempotent — the user's state is the same.
- **(M6) Elaboration:** why 204 instead of 200? 200 implies "here's data"; 204 says "operation succeeded, no data." Clients that don't handle 204 treat it as a network error, so standards matter. Peak Fettle uses 204 correctly.

### Concept 2: Resources and nouns — the REST principle
- **(M4) Generate first:** "Your app has two operations: 'log a set' and 'undo a set log'. Would you create endpoints `/logSet` and `/undoSet`, or `/sets` with POST and DELETE? Why?"
- **The idea:** REST (Representational State Transfer) says: design your API around *resources* (nouns), not *actions* (verbs). The verbs come from HTTP.
  - **Anti-pattern:** `/logSet`, `/undoSet`, `/getHistory`, `/updateNotes` — verbs in the URL.
  - **REST pattern:** `/sets` (POST to create, GET to list, DELETE to remove), `/workouts/{id}` (GET to read, PATCH to update).

  Why? Consistency. Every resource follows the same verb pattern. A client library can auto-generate CRUD for any resource. And HTTP middleware (caching, routing, security policies) understand verbs; they don't understand custom action names.
- **Real code** (`server/routes/sets.js` and `server/routes/workouts.js`):
  ```javascript
  // Sets resource
  router.post('/', async (req, res, next) => { ... });  // POST /sets — create
  router.get('/', async (req, res, next) => { ... });   // GET /sets — list (paginated)
  router.delete('/:id', async (req, res, next) => { ... });  // DELETE /sets/:id — remove

  // Workouts resource
  router.post('/', async (req, res, next) => { ... });  // POST /workouts — create
  router.get('/:id', async (req, res, next) => { ... });  // GET /workouts/:id — read one
  router.patch('/:id', async (req, res, next) => { ... });  // PATCH /workouts/:id — update
  ```
  Every resource in the Peak Fettle API follows this pattern. New engineers can guess the endpoint: "to log a set, POST to `/sets`."
- **(M3) Retrieval check:** "Why would an `/exercises/search` endpoint with a query parameter `?q=bench` be more RESTful than a `/searchExercises` POST endpoint?"
  > Answer: `/exercises/search?q=bench` is a GET on a resource (exercises); the search is a filter, not a custom action. `/searchExercises` invents a new action verb, breaking the "resources + HTTP verbs" contract.

### Concept 3: Request validation — the Zod layer
- **(M7) Concrete:** "A user POSTs `{ kind: 'lift', reps: 0, weightKg: 999 }` to `/sets`. The code should reject this because reps >= 1 is required. Where does that validation live?"
- **The idea:** the request body arrives as JSON. Before touching the database, *validate* the shape and values. Zod is a TypeScript schema validation library. It's used on *every* Peak Fettle POST/PATCH:
  - Shape validation (is `reps` a number, is `email` a string?).
  - Range validation (reps >= 1, weightKg >= 0 and <= 4095.875 kg).
  - Discriminated unions (if `kind === 'lift'`, require `reps` and `weightKg`; if `kind === 'cardio'`, require `durationSec`).

  Invalid requests return 400 Bad Request immediately — no DB hit, no side effects.
- **Real code** (`server/routes/sets.js`, lines 43–70):
  ```javascript
  const LiftSetSchema = z.object({
      kind: z.literal('lift'),  // Literal type — must be exactly 'lift'
      workoutId: z.string().uuid(),  // Must be a valid UUID
      exerciseId: z.string().uuid(),
      setIndex: z.number().int().min(0),
      reps: z.number().int().min(1),  // TICKET-AA-03: reps >= 1 enforced here
      weightKg: z.number().min(0).max(4095.875),  // Max = max SMALLINT / 8
      rir: z.number().int().min(-1).max(10).optional(),
  });

  const CardioSetSchema = z.object({
      kind: z.literal('cardio'),
      workoutId: z.string().uuid(),
      exerciseId: z.string().uuid(),
      setIndex: z.number().int().min(0),
      durationSec: z.number().int().min(0),
      distanceM: z.number().min(0).optional(),
      avgPaceSecPerKm: z.number().min(0).optional(),
  });

  const SetSchema = z.discriminatedUnion('kind', [LiftSetSchema, CardioSetSchema]);

  router.post('/', async (req, res, next) => {
      try {
          const body = SetSchema.parse(req.body);  // Throws ZodError if invalid
          // ... safe to use body now
      } catch (err) { next(err); }
  });
  ```
  The error handler (L07) catches the ZodError and returns 400 with details.
- **(M6) Elaboration:** why the `min(1)` on reps? The code comment says "A set with zero reps is not a set — it has no E1RM, no PR contribution, and would inflate volume counts." This is a *domain* constraint (business logic), not just a form validation. The schema codifies it.

### Concept 4: Ownership and authorization — the T-03 pattern
- **(M4) Generate first:** "A user POSTs to `/sets` with `workoutId: <alice's-workout>`. The server should check: does this workout belong to the *calling* user, or can they log a set in anyone's workout?"
- **The idea:** just because a client sends a valid UUID doesn't mean they own it. Before any write (INSERT/UPDATE/DELETE), verify ownership against `req.user.id`. This is the *authorization* layer (authentication = "are you who you say you are?", authorization = "are you allowed to do this?").
- **Real code** (`server/routes/sets.js`, lines 73–87):
  ```javascript
  router.post('/', async (req, res, next) => {
      try {
          const body = SetSchema.parse(req.body);

          // T-03: confirm the workout belongs to the calling user.
          const { rows: ownerCheck } = await pool.query(
              `SELECT id FROM workouts WHERE id = $1 AND user_id = $2`,
              [body.workoutId, req.user.id]
          );
          if (ownerCheck.length === 0) {
              return res.status(403).json({ error: 'workout_not_found_or_forbidden' });
          }
          // ... safe to insert
      } catch (err) { next(err); }
  });
  ```
  The comment "T-03 (2026-05-02): verify workout ownership before inserting" references a ticket. The CTO guardrail: "any route that accepts a foreign-key reference must verify ownership against `req.user.id` before writing." This is enforced on every route.
- **(M3) Retrieval check:** "Why return 403 Forbidden instead of 404 Not Found if the workout doesn't exist?"
  > Answer: 403 says "that resource exists, you just can't see/edit it." 404 says "that resource doesn't exist or you can't see it." Some APIs return 404 to avoid leaking ownership (e.g., "this is Alice's private notebook" — return 404 so an attacker can't scan for IDs). Peak Fettle returns 403, trusting that IDs are hard to guess (UUIDs, not sequential integers).

### Concept 5: Status codes as a contract
- **(M7) Concrete:** "A POST creates a set. The response is 201 Created + JSON. A DELETE removes a set. The response is 204 No Content (no body). Why the difference?"
- **The idea:** status codes are a *contract* between server and client. The code tells the client what happened:
  - **2xx (success):**
    - 200 OK — request succeeded, body has data (GET, PATCH responses).
    - 201 Created — resource created, body has the created resource (POST response).
    - 204 No Content — request succeeded, no body (DELETE response).
  - **4xx (client error):**
    - 400 Bad Request — validation failed (Zod error).
    - 401 Unauthorized — missing/invalid auth token.
    - 403 Forbidden — auth valid, but not allowed (wrong ownership, insufficient permissions).
    - 404 Not Found — resource doesn't exist.
    - 409 Conflict — constraint violation (e.g., email already registered).
  - **5xx (server error):**
    - 500 Internal Server Error — unhandled exception.

  Picking the right status code matters. A client might auto-retry on 5xx but not 4xx. A browser cache stores 200 but not 201. A load balancer might interpret 503 differently than 500.
- **Real code** (`server/routes/auth.js`, login):
  ```javascript
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  const tokens = await issueTokens(user);
  res.json({ user, ...tokens });  // Implicit 200
  ```
  Both wrong email and wrong password return 401 with the *same* message. This prevents email enumeration: an attacker can't tell if the email exists by timing or error messages.

### Concept 6: Pagination — the cursor pattern
- **(M4) Generate first:** "A user has logged 10,000 sets over two years. They open their history. Do you send all 10,000 at once, or paginate?"
- **The idea:** pagination *splits* large result sets into pages. Peak Fettle uses **cursor-based pagination** (not offset-limit) because it's stable under concurrent deletes and more cache-friendly.
  - **Offset-limit:** "give me rows 100–150" — breaks if a row is deleted between page fetches.
  - **Cursor:** "give me rows after timestamp X" — stable; if rows are deleted, the cursor doesn't move.
- **Real code** (`server/routes/sets.js`, GET endpoint, lines 114–161):
  ```javascript
  router.get('/', async (req, res, next) => {
      try {
          const { workoutId, cursor } = req.query;
          const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);  // Max 200

          if (workoutId) {
              // Direct lookup — no pagination
              const { rows } = await pool.query(
                  `SELECT s.* FROM sets s
                   JOIN workouts w ON w.id = s.workout_id
                   WHERE s.workout_id = $1 AND w.user_id = $2
                   ORDER BY s.set_index ASC`,
                  [workoutId, req.user.id]
              );
              return res.json({ sets: rows.map(normalizeSet), nextCursor: null });
          }

          // Cursor-based scan across all sets for the user
          const params = [req.user.id, limit + 1];  // Fetch one extra to detect next page
          const cursorClause = cursor
              ? `AND s.logged_at < $${params.push(cursor) && params.length}`
              : '';

          const { rows } = await pool.query(
              `SELECT s.* FROM sets s
               WHERE s.user_id = $1 ${cursorClause}
               ORDER BY s.logged_at DESC
               LIMIT $2`,
              params
          );

          const hasMore = rows.length > limit;
          const page = hasMore ? rows.slice(0, limit) : rows;
          const nextCursor = hasMore ? page[page.length - 1].logged_at : null;

          res.json({ sets: page.map(normalizeSet), nextCursor });
      } catch (err) { next(err); }
  });
  ```
  The client receives `{ sets: [...], nextCursor: "2026-05-10T15:30:00Z" }`. To fetch the next page, they POST `?cursor=2026-05-10T15:30:00Z&limit=50`. The server returns rows logged before that timestamp.
- **(M6) Elaboration:** why fetch `limit + 1`? To detect whether there's a next page without an extra query. If `rows.length > limit`, there are more. If `rows.length <= limit`, it's the last page.

### Concept 7: Data normalization — encoding and decoding
- **(M7) Concrete hook:** "The DB stores weight as SMALLINT (kg × 8) to save space. The API returns `weight_kg` as a float. How does that encoding happen, and where?"
- **The idea:** internal storage and API contracts can differ. Peak Fettle encodes `weight_kg` (float) as `weight_raw` (SMALLINT, kg × 8) for the database, then decodes on read so the client sees the float.
- **Real code** (`server/routes/sets.js`, lines 18–37):
  ```javascript
  function encodeWeight(kg) {
      return Math.round(kg * 8);  // 80.5 kg → 644 (SMALLINT)
  }

  function decodeWeight(raw) {
      return raw != null ? raw / 8 : null;  // 644 → 80.5 kg
  }

  function normalizeSet(row) {
      if (!row) return row;
      const { weight_raw, ...rest } = row;
      return { ...rest, weight_kg: decodeWeight(weight_raw) };
  }

  router.post('/', async (req, res, next) => {
      try {
          const body = SetSchema.parse(req.body);  // Client sends weight_kg
          // Encode weight_kg → weight_raw (kg × 8) for SMALLINT storage
          body.kind === 'lift' ? encodeWeight(body.weightKg) : null,
          // ...
          res.status(201).json(normalizeSet(rows[0]));  // Return weight_kg to client
      } catch (err) { next(err); }
  });
  ```
  The comment notes the trade-off: weight × 8 gives 1/8 kg precision (0.125 kg = 125 grams), which is "good enough" for fitness logging, and saves ~2 bytes per set. The encoding is transparent to the client.

### Concept 8: GDPR compliance — designing for deletion and export
- **(M4) Generate first:** "A user requests their data and then requests account deletion. What endpoints does the API expose, and how do you prove the deletion actually happened?"
- **The idea:** GDPR requires two things: *data export* (the user can see everything the service stores about them) and *deletion* (the user can request permanent removal). Peak Fettle implements both:
  - **GET /user/data-export** — returns JSON with all user data (profile, workouts, sets, plans, constraints, health metrics, streaks).
  - **DELETE /user/account** — requires the user to confirm with `{ confirm: 'DELETE MY ACCOUNT' }`, then deletes all user-owned rows and the Supabase auth record.

  Both are rate-limited to prevent abuse.
- **Real code** (`server/routes/user.js`, lines 51–160 and 170–186):
  ```javascript
  router.get('/data-export', exportLimiter, async (req, res, next) => {
      try {
          const uid = req.user.id;
          const [profileResult, workoutsResult, setsResult, ...] = await Promise.all([
              pool.query(`SELECT ... FROM users WHERE id = $1`, [uid]),
              pool.query(`SELECT ... FROM workouts WHERE user_id = $1 ORDER BY day_key DESC`, [uid]),
              // ... more queries
          ]);
          const exportPayload = { exported_at: new Date().toISOString(), ... };
          res.setHeader('Content-Disposition',
              `attachment; filename="peak-fettle-export-${new Date().toISOString().slice(0, 10)}.json"`
          );
          res.json(exportPayload);
      } catch (err) { next(err); }
  });

  router.delete('/account', deleteLimiter, async (req, res, next) => {
      try {
          const { confirm } = req.body ?? {};
          if (confirm !== 'DELETE MY ACCOUNT') {
              return res.status(400).json({ error: 'confirmation_required' });
          }
          const uid = req.user.id;
          const client = await pool.connect();  // Use same connection for transaction
          try {
              await client.query('BEGIN');
              await client.query(`DELETE FROM sets WHERE workout_id IN (...)`, [uid]);
              await client.query(`DELETE FROM workouts WHERE user_id = $1`, [uid]);
              // ... delete all user-owned rows
              await client.query('COMMIT');
          } finally { client.release(); }
          res.status(204).end();
      } catch (err) { next(err); }
  });
  ```
  The export is rate-limited to 5 per hour (I/O heavy). The deletion is rate-limited to 3 per 15 min (irreversible). Both use `await Promise.all()` (export) or transactions (deletion) for consistency.
- **(M6) Elaboration:** why require the user to confirm with a specific string? "Friction guard against accidental clicks." And why use a single transaction for deletion? "Atomicity: if the process crashes halfway, either all rows are deleted or none are. No orphaned data."

## 6. Teach-back (M10)
"Explain to a product manager, in ~5 sentences: what REST is, why Peak Fettle uses `/sets` + POST/GET/DELETE instead of custom action endpoints, and how the API prevents users from reading/editing someone else's data."

## 7. Cumulative review (M13) — rapid-fire
1. What's the difference between a 404 and a 403, and when would you return each?
2. Why does the Zod schema enforce `reps >= 1`, and what domain constraint does that reflect?
3. A client receives `{ sets: [...], nextCursor: "2026-05-10T15:30:00Z" }`. How do they fetch the next page?
4. What is the purpose of the ownership check (`T-03`), and what attack does it prevent?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | Which HTTP verb would you use to delete a set? | Correctly identifies DELETE | DELETE | 8 |
| q2 | L2 | free | Explain why Peak Fettle uses `/sets` (noun) instead of `/logSet` (verb) as the endpoint. | References REST principle: resources as nouns, HTTP verbs for actions. | REST designs APIs around resources (nouns) and HTTP verbs (actions). Naming the endpoint `/sets` makes the pattern clear: POST to create, GET to list, DELETE to remove. Using `/logSet` invents a custom action, breaking the convention. | 12 |
| q3 | L3 | free | A POST to `/sets` with invalid JSON arrives. Trace it: Zod parsing → validation error → response. What status code does the client receive, and what is the response body? | Correctly identifies: Zod throws ZodError → error handler catches → 400 + JSON details | Zod.parse() throws ZodError. The error handler catches it and returns 400 Bad Request with `{ error: 'validation_failed', details: [issues...] }` | 15 |
| q4 | L4 | free | Design the API for GDPR compliance. You need endpoints for data export and account deletion. What status codes do you return, and what friction do you add to deletion? | Designs: GET /user/data-export → 200 + JSON. DELETE /user/account → 204. Adds friction: requires { confirm: 'DELETE MY ACCOUNT' } string. | GET /user/data-export returns 200 with full user data as JSON. DELETE /user/account requires { confirm: 'DELETE MY ACCOUNT' } in the body — a friction guard. Returns 204 on success. Both are rate-limited (5 exports/hr, 3 deletions/15min). | 18 |
| q5 | L5 | free | Critique the Peak Fettle API for a privacy regulator: What endpoints or features are missing that would *prove* to a user that their deletion actually happened? Propose improvements. | Strong answer: notes that data-export doesn't list deleted rows (can't confirm what was deleted); suggests: (1) deletion confirmation email, (2) "view deletion status" endpoint showing deletion timestamp/rows affected, (3) audit log export. | The API lacks visibility into *what was deleted*. After deletion, the user has no proof of what rows were removed. Improvements: (1) DELETE /user/account returns `{ deleted_at, rows_deleted: { sets: 500, workouts: 50, ... } }` (2) Send a confirmation email with deletion summary (3) Offer a 30-day "undo" window before final purge. | 21 |
| q6 | L5 | free | A teammate proposes adding weight-unit conversion to the API: store all weights in kg, but let clients request conversion to lb on response. Design this with minimal changes. Justify encoding/decoding location. | Places encoding/decoding in a normalization function (like normalizeSet); justifies: encoding/decoding is storage-agnostic, clients don't need to know about it, and it centralizes the logic. | Add a `unit_pref` field to the users table (kg or lb). In the normalizeSet() function, check user.unit_pref and convert after decoding. If unit_pref = 'lb', multiply weight_kg * 2.20462 before returning. This keeps encoding/decoding centralized and doesn't change the request/response validation layers. | 22 |

## 9. Custom interactive widget
**API endpoint explorer** — interactive Swagger/OpenAPI-style explorer that lets Arvin browse Peak Fettle's actual endpoints: click a verb (POST, GET, DELETE), see the Zod schema, example request/response, and status codes. Includes a "run request" mode that simulates different validation failures and ownership checks.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: assess REST understanding; whether the noun vs. verb pattern and "ownership before write" principles sank in; any confusion on cursor pagination.
- Offer to schedule L09 (Auth & security) as the next rung; queue carry-over question: "How does the API prove the token came from Peak Fettle, and not from an attacker?"
