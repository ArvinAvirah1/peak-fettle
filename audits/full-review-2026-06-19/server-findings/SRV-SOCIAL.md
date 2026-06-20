# SRV-SOCIAL findings
## Summary
Files reviewed: 3 (`groups.js` 831 LOC, `cosmetics.js` 481 LOC, `lifeos.js` 123 LOC).
Counts — P0:2 P1:3 P2:2 P3:1.
Overall health: cosmetics has NO tier gate (free users can buy and equip paid items), `handleAdminLeave` contains a non-atomic TOCTOU race on admin transfer, and most group routes accept unvalidated `:id` params that land raw in SQL.

---

### [P0] SOCIAL-01 — cosmetics.js: no tier/Pro gate — free users can purchase and equip any item

- **File:** `peak-fettle-agents/server/routes/cosmetics.js` lines 1–480 (entire file)
- **Problem:** Every route in `cosmetics.js` is mounted in `index.js` under `requireAuth` only (`app.use('/cosmetics', requireAuth, cosmeticsRoutes)`). There is no `requirePaid` middleware and no inline tier check anywhere in the file. A free user who holds a valid JWT can call `POST /cosmetics/:id/purchase` to debit group streak credits (which free users can earn) and receive `user_cosmetics` ownership rows, then call `PUT /cosmetics/equipped/:slot` to equip any item — the equip endpoint only checks `user_cosmetics` ownership, not tier. The mobile review reported a client-side cosmetic-unlock bypass; because the server performs no server-side tier check, that client bypass is fully exploitable — it is only blocked by the credit-balance requirement, which free users can satisfy by participating in groups.
- **Evidence:**
```js
// index.js:124
app.use('/cosmetics', requireAuth, cosmeticsRoutes);

// cosmetics.js:188-196 — equip ownership check (no tier check)
if (!item.is_default) {
    const { rows: ownedRows } = await pool.query(
        `SELECT 1 FROM user_cosmetics
         WHERE user_id = $1 AND item_id = $2`,
        [req.user.id, itemId]
    );
    if (ownedRows.length === 0) {
        return res.status(403).json({ error: 'item_not_owned' });
    }
}
```
- **Invariant/Rubric:** P0 Security — missing auth/tier check on a gated feature; the mobile review identified a client-side bypass (per AUDITOR_BRIEF context). Without a server gate the bypass is completely exploitable.
- **Suggested direction:** Add `requirePaid` middleware to the entire cosmetics router (or at minimum to `POST /:id/purchase` and `PUT /equipped/:slot`). The `requirePaid` middleware already exists at `server/middleware/requirePaid.js` and is the correct tool. If cosmetics should remain accessible to free users for browsing only, add `requirePaid` to the purchase and equip routes specifically.
- **Confidence:** HIGH

---

### [P0] SOCIAL-02 — groups.js: handleAdminLeave is non-atomic TOCTOU — concurrent leaves/kicks can produce a group with no admin

- **File:** `peak-fettle-agents/server/routes/groups.js` lines 207–227
- **Problem:** `handleAdminLeave` runs as three separate, non-transactional pool queries: (1) check whether the leaver is admin, (2) select the next longest-tenured member, (3) UPDATE the admin. This runs outside the transaction that already committed the `left`/`kicked` status update in `POST /:id/leave` and `DELETE /:id/members/:userId`. If two members leave concurrently (e.g. admin and another member leave at the same instant), both passes through step 1 could see the original admin; or the `nextAdmin` SELECT in step 2 could return the second concurrent leaver who has already been marked `status = 'left'` (the membership UPDATE committed before `handleAdminLeave` ran). Result: the group can end up with `admin_user_id` pointing to a `left` or `kicked` member, or remain pointing to the departing user if the UPDATE loses the race.
- **Evidence:**
```js
// lines 207-227
async function handleAdminLeave(groupId, leavingUserId) {
    const { rows: adminCheck } = await pool.query(   // query 1 — outside any tx
        `SELECT id FROM groups WHERE id = $1 AND admin_user_id = $2`,
        [groupId, leavingUserId]
    );
    if (adminCheck.length === 0) return;

    const { rows: nextAdmin } = await pool.query(    // query 2 — race window
        `SELECT user_id FROM group_memberships
         WHERE group_id = $1 AND status = 'active'
         ORDER BY joined_at ASC LIMIT 1`,
        [groupId]
    );
    // ...
    await pool.query(`UPDATE groups SET admin_user_id = $1 ...`); // query 3
}
```
- **Invariant/Rubric:** P0 — async race condition / data integrity; `handleAdminLeave` is called after `COMMIT` of the membership change and has no transaction boundary.
- **Suggested direction:** Inline the admin-transfer logic into the existing transaction in both `POST /:id/leave` and `DELETE /:id/members/:userId`, using a single `UPDATE groups SET admin_user_id = (SELECT user_id FROM group_memberships WHERE group_id=$1 AND status='active' ORDER BY joined_at ASC LIMIT 1) WHERE id=$1 AND admin_user_id=$2` that runs inside the same `client.query` block before `COMMIT`. A transaction is already opened in `executeJoin`; the leave/kick paths should likewise use a pooled client.
- **Confidence:** HIGH

---

### [P1] SOCIAL-03 — groups.js: most /:id routes use req.params.id without UUID validation

- **File:** `peak-fettle-agents/server/routes/groups.js` lines 373, 418, 477, 498, 551, 599, 624, 668 (all `/:id` handlers)
- **Problem:** `req.params.id` is passed directly as a parameterized SQL value (`$1` in `WHERE g.id = $1` etc.) without any schema validation. Postgres UUIDs will reject non-UUID values at the DB level (throwing a `22P02 invalid_input_syntax` error), which the `catch (err) { next(err); }` handler would propagate as an unhandled 500. Compare: `POST /invitations/accept` correctly runs `z.object({ token: z.string().uuid() }).parse(req.body)`, and `DELETE /:id/members/:userId` uses raw `req.params.userId` without validation. This is a P1 input-validation gap (not SQL injection, since queries are parameterized), but triggers a 500 instead of a 400 on any malformed ID, leaks internal error details, and is inconsistent with the rest of the codebase.
- **Evidence:**
```js
// groups.js line 385 — no uuid parse on req.params.id
const { rows: groupRows } = await pool.query(
    `SELECT ... FROM groups g JOIN group_memberships gm ...
     WHERE g.id = $1 AND gm.user_id = $2 ...`,
    [req.params.id, req.user.id]   // raw string, no z.string().uuid() parse
);
```
- **Invariant/Rubric:** P1 — input validation; 500 on malformed input leaks stack traces.
- **Suggested direction:** Add `const { id } = z.object({ id: z.string().uuid() }).parse(req.params)` at the top of every `/:id` handler, matching the pattern already used in `cosmetics.js`. Similarly validate `req.params.userId` in the kick route.
- **Confidence:** HIGH

---

### [P1] SOCIAL-04 — groups.js: transfer-admin does not check caller is admin before checking new-admin membership (authZ ordering)

- **File:** `peak-fettle-agents/server/routes/groups.js` lines 443–470
- **Problem:** `POST /:id/transfer-admin` first checks whether `newAdminUserId` is an active member, then runs the `UPDATE groups … WHERE admin_user_id = $3` to enforce that the caller is admin. A non-admin calling this endpoint receives `400 new_admin_not_an_active_member` when the target isn't in the group, or `404 group_not_found_or_not_admin` when they are. This leaks group membership information (whether `newAdminUserId` is a member) to non-members before the admin check fires. The correct order is: verify caller is admin first, then validate the new-admin target.
- **Evidence:**
```js
// lines 449-465 — membership check runs BEFORE admin enforcement
const { rows: memberRows } = await pool.query(
    `SELECT 1 FROM group_memberships
     WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
    [req.params.id, newAdminUserId]      // leaks membership info to non-admins
);
if (memberRows.length === 0) {
    return res.status(400).json({ error: 'new_admin_not_an_active_member' });
}
// ... admin check comes second
```
- **Invariant/Rubric:** P1 — auth check ordering; information disclosure to unauthenticated callers (non-admin users can probe whether a given userId is a member of a group they don't belong to).
- **Suggested direction:** Reverse the order: run the `WHERE id=$1 AND admin_user_id=$2` check first, return 403 if it fails, then validate the new-admin target membership.
- **Confidence:** HIGH

---

### [P1] SOCIAL-05 — groups.js: GET /:id/history allows ex-members to read all evaluation history including current member data

- **File:** `peak-fettle-agents/server/routes/groups.js` lines 624–646
- **Problem:** The membership check at line 628 accepts any historical membership row (`SELECT 1 FROM group_memberships WHERE group_id=$1 AND user_id=$2` — no `status` filter). A user who was kicked months ago can call `GET /groups/:id/history` and receive the full evaluation history including `eligible_members`, `members_hit_goal`, and `streak_weeks_after` for all evaluations since they left. Whether this is intentional is unclear from the spec comment ("current or past members"), but including kicked members seems likely unintentional and is an information-disclosure gap.
- **Evidence:**
```js
// lines 627-633
const { rows: memberCheck } = await pool.query(
    `SELECT 1 FROM group_memberships
     WHERE group_id = $1 AND user_id = $2`,  // no status filter — includes 'kicked'
    [req.params.id, req.user.id]
);
if (memberCheck.length === 0) {
    return res.status(403).json({ error: 'not_a_member' });
}
```
- **Invariant/Rubric:** P1 — authZ scope; group evaluation history is visible to kicked members indefinitely.
- **Suggested direction:** Restrict to `status IN ('active','left')` to exclude kicked members, or document the design intent explicitly if kicked-member history access is intentional.
- **Confidence:** MED (depends on product intent — flag for founder decision)

---

### [P2] SOCIAL-06 — cosmetics.js: GET /cosmetics returns all items to free users, including tier-gated non-default items they cannot buy

- **File:** `peak-fettle-agents/server/routes/cosmetics.js` lines 302–344
- **Problem:** `GET /cosmetics` returns the full catalog (including all rare and legendary paid-credits items) to any authenticated user, with no tier filter. Free users who cannot buy items still see the full shop catalog and `owned: false` for every paid item. This is a UX issue rather than a security breach (no data is exposed that a free user shouldn't eventually see), but it means the "locked" state the client is expected to show is entirely client-enforced with no server signal to differentiate "you're free tier, you can't buy this" from "you're Pro but just haven't bought it yet".
- **Evidence:**
```js
// cosmetics.js line 322-340 — no tier filter on catalog query
const { rows } = await pool.query(
    `SELECT ci.id, ci.name, ...
     FROM cosmetic_items ci
     LEFT JOIN user_cosmetics uc ON uc.item_id = ci.id AND uc.user_id = $1
     ...
     WHERE ci.is_active = TRUE
       AND ($2::text IS NULL OR ci.category = $2)
       AND ($3::text IS NULL OR ci.rarity   = $3)`,
    [req.user.id, categoryFilter, rarityFilter]
);
```
- **Invariant/Rubric:** P2 — missing tier signal in API response; client must infer free-tier lock state.
- **Suggested direction:** Add a `tier_required` or `purchasable` field to catalog rows (or join against `users.tier`) so the client can distinguish "not owned" from "not eligible to buy". Low urgency while SOCIAL-01 (no purchase gate) is open.
- **Confidence:** HIGH

---

### [P2] SOCIAL-07 — groups.js: executeJoin membership/size checks are done inside a transaction but without SELECT FOR UPDATE — concurrent joins can race past the size cap

- **File:** `peak-fettle-agents/server/routes/groups.js` lines 118–200 (`executeJoin`)
- **Problem:** `executeJoin` wraps its logic in a transaction, but the size-cap check (`SELECT COUNT(*) … WHERE status = 'active'`) uses a plain `SELECT`, not `SELECT … FOR UPDATE`. Under Postgres's default Read Committed isolation, two concurrent `executeJoin` calls for the same group can both read the same count (e.g., 11/12) before either INSERT lands, both pass the cap check, and both insert — producing 13 active members in a group capped at 12. Same race applies to `MAX_GROUPS_PER_USER` check. The UPSERT insert that follows is not guarded by a unique constraint on `(group_id, status='active', count ≤ cap)`.
- **Evidence:**
```js
// lines 139-146 — plain SELECT, no FOR UPDATE
const { rows: sizeRows } = await client.query(
    `SELECT COUNT(*) AS cnt
     FROM group_memberships
     WHERE group_id = $1 AND status = 'active'`,
    [group.id]
);
if (parseInt(sizeRows[0].cnt) >= group.size_cap) {
    await client.query('ROLLBACK');
    return res.status(409).json({ error: 'group_full' });
}
```
- **Invariant/Rubric:** P2 — race condition under concurrent load; the transaction provides no isolation for the read-then-write pattern without row locking.
- **Suggested direction:** Lock the group row before reading membership counts: `SELECT id, size_cap FROM groups WHERE id = $1 FOR UPDATE` at the start of the `executeJoin` transaction. This serializes concurrent joins for the same group. Alternatively enforce a DB-level trigger or CHECK constraint on active membership count.
- **Confidence:** HIGH

---

### [P3] SOCIAL-08 — lifeos.js: requirePaid middleware uses check-then-act pattern (acknowledged in code comment, mitigated by atomic INSERT)

- **File:** `peak-fettle-agents/server/routes/lifeos.js` lines 21–34, 51–68
- **Problem:** The `requirePaid` middleware (lines 21–34) performs a DB tier check, then calls `next()`. The `POST /activity-ping` handler then re-checks tier atomically inside an `INSERT … SELECT … WHERE EXISTS (tier='paid')`. The comment at line 50 acknowledges the TOCTOU window. This pattern is correct-by-defense-in-depth for the write path, but the `GET /whole-person-streak` endpoint (line 76) is not similarly guarded — it relies solely on the middleware check. A user whose tier reverts to 'free' between the middleware check and the streak query could read streak data they're no longer entitled to. This is very low severity (streak data is non-sensitive) but inconsistent with the defense-in-depth applied to the write path.
- **Evidence:**
```js
// lifeos.js lines 21-34 — check-then-act (middleware only)
const requirePaid = (req, res, next) => {
    pool.query(`SELECT tier FROM users WHERE id = $1 ...`, [req.user.id])
        .then(({ rows }) => {
            if (rows.length === 0 || rows[0].tier !== 'paid') {
                return res.status(403).json({ error: 'lifeos_access_required' });
            }
            next();
        })
        .catch(next);
};
// GET /whole-person-streak has no secondary atomic check (unlike activity-ping)
```
- **Invariant/Rubric:** P3 — minor inconsistency in defense-in-depth; the GET endpoint is not data-sensitive enough to block on.
- **Suggested direction:** No action required for the GET path given low data sensitivity. Document the asymmetry in a comment so future readers don't remove the atomic check from the ping path thinking it's redundant.
- **Confidence:** HIGH
