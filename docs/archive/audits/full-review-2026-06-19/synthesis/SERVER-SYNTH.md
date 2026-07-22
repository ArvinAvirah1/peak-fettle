# SERVER synthesis — full review 2026-06-19

Synthesizer: Opus (SERVER lane). Inputs: 6 raw Sonnet findings files (SRV-AUTH, SRV-DATA, SRV-USER, SRV-SOCIAL, SRV-PLANS, SRV-ENGINE). Every P0 and P1 below was re-verified by opening the cited `peak-fettle-agents/server/` source at the named line and tracing the logic against the canonical `db/schema.sql` and the live migrations. Drops/downgrades are explicit in section (d).

---

## (a) Lane summary

Raw counts across the 6 files: **P0: 13 · P1: 14 · P2: 13 · P3: 6**.

After verification + dedup: **P0: 11 · P1: 13 · P2: 13 · P3: 6**. **2 items dropped/downgraded** (SRV-PLANS-03 downgraded P0→P1; SRV-PLANS-06 downgraded P1→P2 — both explained in (d)).

Headline: the server is well-parameterized (no SQL injection found anywhere; every personal-data query is scoped to `req.user.id`). The real damage clusters into **five systemic patterns**, all confirmed:

1. **`SYSTEMIC:weight-raw-server` (5 hits)** — the canonical `sets` table stores the authoritative lift weight in `weight_kg NUMERIC(6,2)` (NOT NULL for lifts, per the schema CHECK at `db/schema.sql:164`); `weight_raw SMALLINT` (kg×8) is a *secondary* column added only by the `20260614_ensure_schema_complete.sql` migration and may be 0/NULL for any v3 local-first write. **plans.js, percentile.js, sets.js, and both user.js exports read `weight_raw/8.0` exclusively** → the server computes 0 kg (or NULL) for every modern set, poisoning e1RM/PB/volume fed to the Training Engine and the confirm-1RM pre-fill. This is the server side of mobile Invariant 2 and the single highest-impact cluster.
2. **`SYSTEMIC:tier-gate` (4 hits)** — `cosmetics.js` has NO `requirePaid` (free users buy + equip paid items); `POST /user/upgrade` lets any JWT holder self-promote to `paid`; `/plans/:id/regenerate` has no inline gate (saved by a fragile `router.handle` delegation); `/plans/generate` uses an ad-hoc inline check instead of the `requirePaid` middleware.
3. **`SYSTEMIC:idor-uuid` (3 hits)** — raw `req.params.id`/`:exerciseId`/`:userId` flow into Postgres `UUID` casts with no `z.string().uuid()` guard → `22P02` 500 (not 400) on any malformed id. groups.js (8 handlers), sets.js personal-best.
4. **`SYSTEMIC:schema-drift` (4 hits)** — deprecated `user_percentile_rankings` / `user_confirmed_1rm` and optional `streaks` reached without `42P01` guards → 500 instead of degrade. The worst is in the account-deletion transaction (GDPR regression).
5. **`SYSTEMIC:push-token` (1 hit)** — `push-dispatcher.js` clears `fcm_token` on `InvalidRegistration`, an Expo *format* rejection, not a stale device. Exactly the PUSH-001/002 silent-erasure mode.

The `lib/trainingEngine/*` findings (SRV-ENGINE-01 confirmed real in committed code) are **deferred — founder WIP** per instructions: those 7 files have uncommitted working-tree edits. I verified the diff is whitespace-only (CRLF→LF), so the `new Date()` bug is genuinely present in HEAD, but no fix-group may touch those files.

---

## (b) Verified, severity-ranked table

| id | sev | file:line | systemic tag | problem (verified) |
|----|-----|-----------|--------------|--------------------|
| SRV-USER-01 | **P0** | routes/user.js:1059,1063 | tier-gate | `POST /user/upgrade` / `/downgrade` behind `requireAuth` only (index.js:133). Any free user flips own `tier='paid'`. No payment/admin gate. **Confirmed.** |
| SRV-USER-02 | **P0** | routes/user.js:268 | schema-drift | `DELETE /user/account` tx includes `DELETE FROM user_percentile_rankings`; table is deprecated/absent on prod → `42P01` → ROLLBACK → user never deleted, 500 returned. GDPR regression. **Confirmed** (table is the deprecated one per migration #2). |
| SOCIAL-01 | **P0** | routes/cosmetics.js (whole file); mount index.js:124 | tier-gate | No `requirePaid` anywhere; `POST /:id/purchase` + `PUT /equipped/:slot` only check credit balance + ownership (cosmetics.js:188-197). Free users buy/equip paid items. Server side of the mobile cosmetic-unlock bypass. **Confirmed.** |
| SOCIAL-02 | **P0** | routes/groups.js:207-227 | — | `handleAdminLeave` = 3 non-transactional `pool.query` calls, run AFTER the membership-change COMMIT. Concurrent leaves/kicks can leave `admin_user_id` pointing at a `left`/`kicked` member or the departing user. **Confirmed** (no tx boundary). |
| SRV-DATA-01 | **P0** | routes/csvImport.js:236-240 | — | Bulk INSERT omits `day_key`, which is `DATE NOT NULL` on `workouts` (schema:128) → `23502` on every import → ROLLBACK → 500. CSV import 100% non-functional. **Confirmed.** |
| SRV-DATA-02 | **P0** | routes/csvImport.js:181-189 | — | Phase-2 dedup filters `created_at::date` (server insert time) instead of the activity date. Misses real dupes / flags false dupes. Once DATA-01 lands it must switch to `day_key`. **Confirmed.** |
| SRV-PLANS-01 | **P0** | routes/plans.js:316-323, 343-352 | weight-raw-server | History + PB subqueries compute weight purely from `s.weight_raw/8.0` and guard `s.weight_raw > 0`. v3 sets store exact `weight_kg`, leave `weight_raw` 0 → engine sees 0 kg → garbage plans. **Confirmed** (`weight_kg` is the canonical NOT NULL column). |
| SRV-PLANS-02 | **P0** | routes/percentile.js:117-136, 207-225 | weight-raw-server | Epley sub-SELECTs read `weight_raw/8.0`, guard `weight_raw > 0` → `epley_estimate_kg` always NULL for v3/Pro sets → confirm-1RM pre-fill broken. **Confirmed.** |
| SRV-ENGINE-01 | **P0 (defer — founder WIP)** | lib/trainingEngine/index.js:43,81 | — | `isoWeek()` and `generatePlan()` fall back to `new Date()` when `ctx.today` omitted → seed/exercise selection drifts across a week boundary; violates determinism rule §7. **Confirmed in HEAD** (working-tree diff is whitespace-only). **Do NOT include in a fix group.** |
| SRV-ENGINE-02 | **P0** | cron/push-dispatcher.js:60-66, 152-173 | push-token | `isStaleTokenError` returns true for `InvalidRegistration`; `markFailed` then NULLs `users.fcm_token` with no retry. `InvalidRegistration` from Expo = wrong token *format*, not a dead device → silently erases valid registrations (PUSH-001/002 mode). **Confirmed.** |
| SRV-AUTH-01 | **P0** | routes/auth.js:279-281 | — | `POST /refresh` outer `catch(_err) → 401`. The `DELETE…RETURNING` (line 247) consumes the token atomically *before* `issueTokens` (276); a DB error after the DELETE returns 401 with the refresh token already gone → mobile (Invariant 5) clears token → forced re-login. **Confirmed** (the catch is genuinely blanket; the replay grace-window does not cover a post-DELETE `issueTokens` throw). |
| SRV-AUTH-02 | **P0** | routes/auth.js:347-348; lib/oauthVerify.js:111-116 | — | `claims.emailVerified` computed but never checked; `/auth/oauth` find-or-creates on `email` alone. Unverified provider email → account takeover. Inert today (route 501 until OAuth audiences set) but must land before credentials. **Confirmed.** |
| SRV-PLANS-03 | P1 *(was P0)* | routes/plans.js:467-504 | tier-gate | `/regenerate` has no inline paid gate but delegates via `req.url='/generate'; router.handle(...)`, and `/generate` re-runs its paid gate (lines 257-267). So free users are **currently** blocked — the "free users can regenerate" claim is false. **Downgraded to P1**: the fragile internal-API dispatch is a latent gate-bypass + the throttle is wrong (SRV-PLANS-05). **Confirmed mechanism; severity reduced.** |
| SRV-AUTH-03 | P1 | routes/auth.js:237 | — | `jwt.verify(refreshToken, SECRET)` omits `{ algorithms: ['HS256'] }` that `requireAuth.js:20` correctly pins. jsonwebtoken 9.x mitigates alg:none, but the asymmetry is a real hazard. **Confirmed.** |
| SRV-AUTH-04 | P1 | middleware/errorHandler.js:6 | — | ZodError returns full `err.issues` (field paths, min lengths, received values) to client — discloses auth body schema. **Confirmed.** |
| SRV-AUTH-05 | P1 | cron/cleanup-orphaned-auth.js:65-89 | — | Cron `deleteUser(auth_uid)` for every unresolved orphan with NO cross-check that the row is actually gone from `users`. A bad orphan insert → permanent deletion of a live Supabase auth record. **Confirmed** (no `SELECT 1 FROM users` guard). |
| SRV-DATA-03 | P1 | routes/sets.js:220-222 | idor-uuid | `GET /sets/personal-best/:exerciseId` passes raw param to `exercise_id` UUID cast → `22P02` 500 on non-UUID. Sibling `GET /sets?exercise_id=` validates with a regex; this one doesn't. **Confirmed.** |
| SRV-USER-03 | P1 | routes/user.js:498-506 | — | `experience_level` accepts `""` (only checks `typeof string` + `length > 50`); every sibling string field enforces `length >= 1`. **Confirmed.** |
| SRV-USER-04 | P1 | routes/healthMetrics.js:43 | — | `days = Math.min(parseInt(...)||30, 365)` — `parseInt('-5')=-5`, passes through → `CURRENT_DATE - ('-5 days')::INTERVAL` = future date → silent empty result. No lower clamp. **Confirmed.** |
| SOCIAL-03 | P1 | routes/groups.js:373,418,477,498,551,599,624,668 | idor-uuid | `req.params.id` → parameterized `UUID` `$1` with no `z.string().uuid()` parse → `22P02` 500 on malformed id (not 400). `req.params.userId` in the kick route too. **Confirmed.** |
| SOCIAL-04 | P1 | routes/groups.js:449-465 | — | `transfer-admin` checks new-admin membership (line 450) BEFORE the admin-enforcing UPDATE (459) → a non-admin probes whether a userId is a member (`400 new_admin_not_an_active_member` vs `404`). Info disclosure; wrong authZ order. **Confirmed.** |
| SOCIAL-05 | P1 | routes/groups.js:627-633 | — | `GET /:id/history` membership check has no `status` filter → kicked members read all evaluation history indefinitely. **Confirmed** (product-intent flag — see (d)). |
| SRV-PLANS-04 | P1 | routes/percentile.js:315-323 | schema-drift | `POST /confirm-1rm` INSERTs into deprecated `user_confirmed_1rm` with a bare `catch(err){next(err)}` — no `isMissingSchema`/`42P01` guard, unlike the GET handlers. Table absent → 500. **Confirmed.** |
| SRV-PLANS-05 | P1 | routes/plans.js:487-492 | — | `/regenerate` throttle counts ALL `plans` created today, not just `name LIKE 'Training Engine Plan%'` (the `/generate` throttle at 270-276 is correctly scoped). Users with saved manual plans get wrongly blocked. **Confirmed.** |
| SRV-PLANS-06 | P2 *(was P1)* | index.js:92-97; routes/exercises.js | — | `GET /exercises/*` (incl. `/search`, `/:id/aliases`) is intentionally unauthenticated ("GET is public"). It's a conscious design call exposing only the global read-only library + UUIDs. **Downgraded to P2** (documentation/decision, not a defect) — see (d). |
| SRV-USER-05 | P2 | routes/user.js:184-191, 802 | schema-drift | `data-export`/`export` `Promise.all` includes a `streaks` query (+ others) with no per-query `42P01` guard; one absent table 500s the whole export. **Confirmed.** |
| SRV-USER-07 | P2 *(weight part)* | routes/user.js:114, 802 | weight-raw-server | Both export endpoints emit `weight_raw/8.0` with no `COALESCE(weight_kg, weight_raw/8.0)`; rows with only `weight_kg` export NULL weight. (Also: two export paths double the effective rate limit.) **Confirmed** — folded into the weight cluster + DATA file group. |
| SRV-DATA-04 | P2 | routes/workouts.js:303-315, 347-360 | — | `mileage-weekly`/`pace-trend` filter `day_key::date` — empty until DATA-01 populates `day_key`. Cascading; test after the import fix. **Confirmed (consequential).** |
| SRV-DATA-05 | P2 | routes/backup.js:39-55 | — | `putCounters` in-process `Map` resets on every Railway deploy → PUT/day cap bypassable. **Confirmed.** |
| SRV-USER-06 | P2 | routes/insights.js:525-545 | — | `/insights/deload/ack` overwrites `last_deload_at=CURRENT_DATE` with no check that a deload was actually recommended → client can skip the 42-day window early. **Confirmed.** |
| SOCIAL-06 | P2 | routes/cosmetics.js:302-344 | tier-gate | `GET /cosmetics` returns full catalog with no `tier_required`/`purchasable` signal → lock state is client-only. Low urgency while SOCIAL-01 open. **Confirmed.** |
| SOCIAL-07 | P2 | routes/groups.js:118-200 | — | `executeJoin` size-cap `SELECT COUNT(*)` has no `FOR UPDATE`; concurrent joins race past `size_cap`. **Confirmed.** |
| SRV-PLANS-07 | P2 | routes/exercises.js:126-150 | — | `GET /exercises` has no `LIMIT` → unbounded scan as library grows. **Confirmed.** |
| SRV-PLANS-08 | P2 | routes/percentile.js:99-177, 192-266 | schema-drift | GET handlers read deprecated `user_percentile_rankings` with no `deprecated`/staleness signal to the client. **Confirmed.** |
| SRV-AUTH-06 | P2 | middleware/errorHandler.js:4-15 | schema-drift | Handler maps `23505→409` but not `42P01`/`42703` → generic 500 instead of a labeled schema-drift response. **Confirmed.** |
| SRV-AUTH-07 | P2 | index.js:64-76 | — | One `authLimiter` (20/15min) covers signup+oauth (bcrypt-12, ~300-400ms each) the same as login. Signup deserves a tighter cap. **Confirmed.** |
| SRV-ENGINE-05 | P2 (defer — founder WIP) | lib/trainingEngine/reasoning.js:144-146 | — | Comment "Fewer than 3 sessions" but threshold is `histCount < 6` (sets, not sessions). Wrong copy/threshold. **Confirmed; defer (WIP file).** |
| SRV-ENGINE-06 | P2 (defer — founder WIP) | lib/trainingEngine/loading.js:148-177 | — | `warmup` key always spread → serializes `null` on weeks 2-3. **Confirmed; defer (WIP file).** |
| SRV-ENGINE-03 | P1 | cron/push-dispatcher.js:188-299 | — | `run()` never `pool.end()`; relies on `process.exit(0)` in CLI block. Hangs if imported by a shared runner. **Confirmed.** (push-dispatcher is NOT a WIP file — fixable.) |
| SRV-ENGINE-04 | P1 | cron/percentile.js:36-39, 193-195 | schema-drift | Two `require.main===module` blocks; the dead bottom one still calls `run()` (writes to deprecated table) if the top DISABLED guard is ever removed. **Confirmed.** (cron file — fixable.) |
| SRV-ENGINE-07 | P2 | cron/cohort-graduation.js:31-33 | — | Header references dead `FCM_SERVER_KEY` env var (transport is Expo now). Misleading ops doc. **Confirmed.** |
| SRV-DATA-06 | P3 | routes/sets.js:33-37 | weight-raw-server | `normalizeSet` benign double-set of `weight_kg` if legacy column survives; explicit key wins → numerically correct. **Confirmed P3.** |
| SRV-USER-07 (rate part) | P3 | routes/user.js:114,802 | — | Two export endpoints each carry their own 5/hr limiter → 10/hr effective. **Confirmed P3.** |
| SRV-AUTH-08 | P3 | routes/auth.js:350-353 | — | OAuth links by email not `oauth_identities.sub`; latent takeover once live. Acknowledged tech debt. **Confirmed P3.** |
| SRV-ENGINE-08 | P3 (defer — founder WIP) | lib/trainingEngine/exerciseFill.js:53-59 | — | Equipment OR-semantics may select exercises needing a 2nd item. Intentional; document. **Confirmed; defer (WIP file).** |
| SRV-USER-06 / SOCIAL-08 / SRV-PLANS-09 | P3 | insights.js / lifeos.js:21-34,76 / plans.js:257-267 | tier-gate | Defense-in-depth/maintainability nits (lifeos GET not atomically re-checked; plans.js inline check vs `requirePaid` middleware). **Confirmed P3.** |

---

## (c) Per-finding concrete fix (P0 + P1)

### P0

**SRV-USER-01 — remove self-promotion (routes/user.js + index.js)**
These must not be callable with the user's own JWT. Either (a) delete the HTTP routes entirely and mutate `tier` only from a payment webhook, or (b) gate them behind a new `requireWebhookSecret` middleware that HMAC-checks `process.env.PAYMENT_WEBHOOK_SECRET` against the request, mounted *before* `userRoutes` or inline on the two routes. Minimal interim fix: wrap both handlers so they `return res.status(403)` unless a verified server-to-server secret header is present. Do NOT leave them on plain `requireAuth`.

**SRV-USER-02 — guard the deprecated DELETE inside the deletion tx (routes/user.js:268)**
Replace the bare `DELETE FROM user_percentile_rankings WHERE user_id=$1` with a `to_regclass`-guarded form so an absent table can't abort the whole transaction:
```sql
DO $$ BEGIN
  IF to_regclass('public.user_percentile_rankings') IS NOT NULL THEN
    DELETE FROM user_percentile_rankings WHERE user_id = $1;
  END IF;
END $$;
```
(`DO` blocks don't accept `$1` bind params — pass `uid` by interpolating a quoted literal via `format()`, or simpler: keep the plain `DELETE` but wrap *that one statement* in JS `try { ... } catch (e) { if (e.code !== '42P01') throw e; }` running on the same `client`. The JS try/catch is the cleaner fix and keeps the tx atomic for tables that exist.) Apply the same pattern to any other deprecated table in the tx.

**SOCIAL-01 — add `requirePaid` to cosmetics purchase/equip (routes/cosmetics.js or index.js:124)**
`requirePaid` already exists at `middleware/requirePaid.js`. Either gate the whole router at the mount (`app.use('/cosmetics', requireAuth, requirePaid, cosmeticsRoutes)` — if browsing must stay free, don't do this) or, preferred, attach `requirePaid` as route-level middleware on `POST /:id/purchase` and `PUT /equipped/:slot` only, leaving `GET` open for browsing. `import { requirePaid } from '../middleware/requirePaid'`.

**SOCIAL-02 — make admin transfer atomic in the leave/kick tx (routes/groups.js:207-227 + call sites)**
Inline the transfer into the same transaction that updates membership status, before COMMIT, as a single conditional UPDATE:
```sql
UPDATE groups
   SET admin_user_id = (
     SELECT user_id FROM group_memberships
      WHERE group_id = $1 AND status = 'active'
      ORDER BY joined_at ASC LIMIT 1)
 WHERE id = $1 AND admin_user_id = $2;
```
Run it via the pooled `client` already opened in `POST /:id/leave` and `DELETE /:id/members/:userId` (mirror the `executeJoin` client pattern). Delete the standalone `handleAdminLeave` pool-query version.

**SRV-DATA-01 + SRV-DATA-02 — populate and dedup on `day_key` (routes/csvImport.js)**
Add `day_key` to the INSERT column list and bind it per row from the parsed activity date (`p.logged_at.split('T')[0]`); bump `PER_ROW_COLS` and the placeholder template accordingly. In the same change, fix the Phase-2 dedup: `SELECT day_key::text AS day ... WHERE ... AND day_key = ANY($2::date[])` (replace both `created_at::date` occurrences). These two findings are one edit in one file.

**SRV-PLANS-01 + SRV-PLANS-02 — COALESCE weight everywhere (routes/plans.js + routes/percentile.js)**
Mechanical: replace every `s.weight_raw / 8.0` with `COALESCE(s.weight_kg, s.weight_raw / 8.0)` and every `s.weight_raw > 0` guard with `COALESCE(s.weight_kg, s.weight_raw / 8.0) > 0`, in the plans.js history + PB subqueries and the percentile.js Epley sub-SELECTs (both the `GET /` and the shared `percentileByLift` paths). Same pattern is the fix for the SRV-USER-07 export weight and the sets.js personal-best query (see those groups).

**SRV-ENGINE-01 — DEFER (founder WIP).** Direction for the founder: require `ctx.today` in `generatePlan` (`if (!ctx.today) throw new Error('ctx.today required')`) and have the calling route inject it; never default to `new Date()`. **No fix-group; do not edit `lib/trainingEngine/*`.**

**SRV-ENGINE-02 — stop clearing token on format errors (cron/push-dispatcher.js:60-66)**
Remove `InvalidRegistration` from `isStaleTokenError`. Only `DeviceNotRegistered` (and `NotRegistered`) should NULL `fcm_token`. For `InvalidRegistration`, set `failed_permanently = true` (so it stops retrying) but leave the token intact and `console.warn` for human investigation. This is the PUSH-001/002 rule: clear only on a definitive device-gone signal, never on a transport/format rejection.

**SRV-AUTH-01 — split the refresh catch (routes/auth.js:279-281)**
Verify the JWT before the DELETE and let a `jwt.JsonWebTokenError`/`TokenExpiredError` map to 401; once the `DELETE…RETURNING` has run, route any subsequent error (incl. `issueTokens` DB failures) to `next(err)` → 500 so the mobile client (Invariant 5) does NOT clear the token on a transient failure. Concretely: keep the `jwt.verify` + type check inside a narrow try that returns 401; after the DELETE, replace the blanket `catch(_err)→401` with `catch(err){ return next(err); }`.

**SRV-AUTH-02 — enforce emailVerified (routes/auth.js:348)**
Immediately after `if (!email) return res.status(400)...`, add `if (!claims.emailVerified) return res.status(401).json({ error: 'provider_email_not_verified' });`. Low risk (route 501 until OAuth audiences set) but required before credentials land.

### P1

**SRV-PLANS-03 — self-contained gate on /regenerate (routes/plans.js)**
Extract the `/generate` body into a shared function and call it from `/regenerate`; add the same explicit `is_paid` check at the top of `/regenerate` rather than relying on `router.handle`. Removes the fragile internal-Express-API dependency. (Combined with SRV-PLANS-05's throttle fix in the same file.)

**SRV-AUTH-03 — pin algorithm (routes/auth.js:237)** Add `{ algorithms: ['HS256'] }` as the 3rd arg to `jwt.verify`, matching `requireAuth.js:20`.

**SRV-AUTH-04 — strip Zod details on auth (middleware/errorHandler.js:6)** Return only `{ error: 'validation_failed' }` (drop `details`) — either unconditionally (not consumed by the mobile UI) or behind a `res.locals.suppressValidationDetails` flag set by `authRoutes`.

**SRV-AUTH-05 — cross-check before destructive delete (cron/cleanup-orphaned-auth.js:65)** Before `deleteUser(auth_uid)`, run `SELECT 1 FROM users WHERE id = $1` (`auth_uid`); if the row still exists, `console.warn`, skip, leave `resolved_at` NULL for manual review.

**SRV-DATA-03 — UUID guard on personal-best (routes/sets.js:222)** Add the same UUID regex/`z.string().uuid()` guard used by `GET /sets?exercise_id=`; on invalid format return `{ all_time_best: null, last_session: null }` (or 400). Alternatively catch `22P02` → 400.

**SRV-USER-03 — reject empty experience_level (routes/user.js:499)** Add `|| experience_level.trim().length < 1` to the rejection (or handle `null` as an explicit "clear" like `goal_weight_kg`).

**SRV-USER-04 — clamp days (routes/healthMetrics.js:43)** `const days = Math.max(1, Math.min(parseInt(req.query.days ?? '30', 10) || 30, 365));` (or 400 on non-positive).

**SOCIAL-03 — UUID-parse all /:id handlers (routes/groups.js)** Add `const { id } = z.object({ id: z.string().uuid() }).parse(req.params)` at the top of every `/:id` handler; validate `req.params.userId` in the kick route. Mirrors the `cosmetics.js` pattern.

**SOCIAL-04 — reverse authZ order (routes/groups.js:449-465)** Run the admin-enforcing check first (`SELECT 1 FROM groups WHERE id=$1 AND admin_user_id=$2`, 403 on fail), THEN validate the new-admin target membership. Stops membership probing by non-admins.

**SOCIAL-05 — exclude kicked members from history (routes/groups.js:629)** Restrict the membership check to `status IN ('active','left')`. **Flag for founder**: confirm kicked-member exclusion is the intended product behavior (the spec comment says "current or past members").

**SRV-PLANS-04 — schema-drift guard on confirm-1rm (routes/percentile.js:315)** Wrap the INSERT in the same `isMissingSchema`/`42P01` catch the GET handlers use; return a graceful 200/410 if `user_confirmed_1rm` is absent.

**SRV-PLANS-05 — scope the regenerate throttle (routes/plans.js:488)** Add `AND name LIKE 'Training Engine Plan%'` to match the `/generate` throttle. (Same file as SRV-PLANS-03.)

**SRV-ENGINE-03 — drain pool in push-dispatcher (cron/push-dispatcher.js)** Add `await pool.end()` in `run()`'s `finally` (or wrap the CLI entry in try/finally); drop the `process.exit(0)` crutch. Matches the other three crons. (Same file as SRV-ENGINE-02.)

**SRV-ENGINE-04 — delete the dead require.main block (cron/percentile.js:193-195)** Remove the bottom `if (require.main === module) { run(); }`; keep only the top DISABLED guard. Add a comment that `run()` is exported for tests only and must not be scheduled (it writes to a deprecated table).

---

## (d) Dropped / downgraded

- **SRV-PLANS-03 — downgraded P0 → P1.** The finding's headline ("free users can regenerate plans") is **not true as written**: `/regenerate` delegates to `/generate` via `req.url='/generate'; router.handle(req,res,next)`, and `/generate` re-runs its paid gate at lines 257-267, which I confirmed on-disk. A free user hitting `/regenerate` is blocked by that delegated gate (403). The finding's own evidence concedes "the gate is not completely absent." What remains real is (1) the fragile dependence on Express's internal `Router.handle` (a future refactor could move/skip the gate) and (2) the over-broad throttle (SRV-PLANS-05). Those justify P1, not P0 — there is no current exploit. **Fix still scheduled** (self-contained gate).
- **SRV-PLANS-06 — downgraded P1 → P2.** `GET /exercises/*` being unauthenticated is an explicit, commented design decision (index.js:88-97: "GET is public") for a global read-only exercise library. No personal data is exposed — only catalog rows + exercise UUIDs. This is a documentation/threat-model confirmation item, not a defect. The finding itself rates confidence MED and says "intentional design, not a bug." Downgraded; action = add a threat-model comment at the mount, or add `requireAuth` to `/search` only if scraping is a concern (founder call).
- **No findings dropped outright.** Every other P0/P1 reproduced exactly against source. The `lib/trainingEngine/*` engine findings (SRV-ENGINE-01/05/06/08) are **not dropped** — they are verified-real but **deferred (founder WIP)** and excluded from all fix-groups per instructions; the working-tree diff on those 7 files is whitespace-only (CRLF→LF), so HEAD genuinely contains the bugs.

---

## (e) Disjoint fix-group → files plan (P0 + paired P1)

Each group owns a **disjoint set of files** — no two groups touch the same file, so implementers can run fully in parallel with zero collisions. `lib/trainingEngine/*` is **excluded from every group (founder WIP)**.

| group | owned file(s) | findings to fix |
|-------|---------------|-----------------|
| **G1 — user/tier + deletion + export** | `routes/user.js` (+ `index.js` *only if* webhook middleware is mounted there — see note) | SRV-USER-01 (P0 self-promotion), SRV-USER-02 (P0 deletion 42P01), SRV-USER-03 (P1 experience_level), SRV-USER-05 (P2 export drift), SRV-USER-07 (P2/P3 export weight COALESCE + double rate limit) |
| **G2 — cosmetics tier gate** | `routes/cosmetics.js` | SOCIAL-01 (P0 requirePaid on purchase/equip), SOCIAL-06 (P2 catalog tier signal) |
| **G3 — groups concurrency + authZ + IDOR** | `routes/groups.js` | SOCIAL-02 (P0 atomic admin transfer), SOCIAL-03 (P1 UUID guards), SOCIAL-04 (P1 authZ order), SOCIAL-05 (P1 history status filter), SOCIAL-07 (P2 FOR UPDATE join) |
| **G4 — CSV import** | `routes/csvImport.js` | SRV-DATA-01 (P0 day_key INSERT), SRV-DATA-02 (P0 day_key dedup) |
| **G5 — plans (weight + gate + throttle)** | `routes/plans.js` | SRV-PLANS-01 (P0 weight COALESCE), SRV-PLANS-03 (P1 self-contained gate), SRV-PLANS-05 (P1 throttle scope), SRV-PLANS-09 (P3 use requirePaid) |
| **G6 — percentile (weight + schema-drift)** | `routes/percentile.js` | SRV-PLANS-02 (P0 weight COALESCE), SRV-PLANS-04 (P1 confirm-1rm 42P01 guard), SRV-PLANS-08 (P2 deprecation signal) |
| **G7 — push-dispatcher** | `cron/push-dispatcher.js` | SRV-ENGINE-02 (P0 don't clear on InvalidRegistration), SRV-ENGINE-03 (P1 pool.end) |
| **G8 — auth routes** | `routes/auth.js` | SRV-AUTH-01 (P0 refresh catch split), SRV-AUTH-02 (P0 emailVerified), SRV-AUTH-03 (P1 algorithm pin), SRV-AUTH-08 (P3 oauth_identities note) |
| **G9 — error handler** | `middleware/errorHandler.js` | SRV-AUTH-04 (P1 strip Zod details), SRV-AUTH-06 (P2 42P01/42703 handling) |
| **G10 — orphan-auth cron** | `cron/cleanup-orphaned-auth.js` | SRV-AUTH-05 (P1 users cross-check before deleteUser) |
| **G11 — sets** | `routes/sets.js` | SRV-DATA-03 (P1 UUID guard on personal-best + weight COALESCE in that query), SRV-DATA-06 (P3 normalizeSet) |
| **G12 — healthMetrics** | `routes/healthMetrics.js` | SRV-USER-04 (P1 clamp days) |
| **G13 — workouts analytics** | `routes/workouts.js` | SRV-DATA-04 (P2 — verify-only after G4 lands; weight COALESCE if any lift query present) |
| **G14 — backup / insights / lifeos / percentile-cron / cohort-cron** (small P2/P3, optional) | `routes/backup.js`, `routes/insights.js`, `routes/lifeos.js`, `cron/percentile.js`, `cron/cohort-graduation.js` | SRV-DATA-05, SRV-USER-06, SOCIAL-08, SRV-ENGINE-04, SRV-ENGINE-07 — all disjoint files; can be one cleanup implementer |
| **DEFER — founder WIP** | `lib/trainingEngine/index.js`, `reasoning.js`, `loading.js`, `exerciseFill.js` (+ scaleDown/sequence/templates) | SRV-ENGINE-01 (P0), -05, -06, -08 — **do NOT edit; hand to founder** |

**Notes for the orchestrator:**
- `index.js` is touched only by G1 *and only if* the SRV-USER-01 fix mounts a webhook-secret middleware there (the mount line index.js:133). If SRV-USER-01 is fixed inline in the route handlers (preferred — no index.js change), G1 owns `routes/user.js` alone and `index.js` is untouched by any group. To keep groups strictly disjoint, **fix SRV-USER-01 inline in `routes/user.js`** and leave `index.js` out of all groups.
- The **weight COALESCE** change recurs across G1, G5, G6, G11, G13 — but each group edits only its own file, so the recurrence does not create a collision. Give every implementer the same one-line rule: `s.weight_raw / 8.0` → `COALESCE(s.weight_kg, s.weight_raw / 8.0)`; `s.weight_raw > 0` → `COALESCE(s.weight_kg, s.weight_raw / 8.0) > 0`.
- **DoD per group:** `node --check` the edited `.js` file(s); for any with a sibling test under `__tests__`, run it. Then the full server `node --check` sweep before commit.
