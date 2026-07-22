# SRV-FIX-GROUPS-TOCTOU — SRV-SOCIAL-02 (P0 admin-reassignment race)

**File:** `peak-fettle-agents/server/routes/groups.js`
  (handlers `DELETE /groups/:id/members/:userId` (kick) and `POST /groups/:id/leave`; new helper `reassignAdminLocked`)
**Severity:** P0 — TOCTOU race in admin hand-off when an admin leaves / is kicked
**Branch:** `fix/full-review-2026-06-19`
**Status of edit:** present in the working tree (uncommitted). Not committed per task instruction.

## Vulnerability
When the group admin leaves or is removed, admin must transfer to the
longest-tenured remaining active member. The kick path performed this as
**three separate `pool.query()` calls with NO surrounding transaction**:

1. `SELECT id FROM groups WHERE id=$1 AND admin_user_id=$2`  (admin check)
2. `UPDATE group_memberships SET status='kicked' … WHERE status='active'`  (auto-commits)
3. `UPDATE groups SET admin_user_id = (SELECT … status='active' ORDER BY joined_at LIMIT 1) …`  (auto-commits)

Because each statement auto-commits, the membership change in (2) is durable
**before** the reassignment in (3) runs, and nothing locks the candidate member
rows. Under concurrency this allows:

- **Stranded admin:** the kick/leave commits, but a crash or error before the
  separate reassignment statement leaves `admin_user_id` pointing at a member
  who has already departed (status no longer `active`).
- **Racing the `status='active'` filter:** two concurrent departures (e.g. the
  admin leaving while the next-in-line also leaves) interleave such that the
  member chosen as the new admin has their own `left`/`kicked` update commit
  between the SELECT that picks them and the UPDATE that promotes them — so
  admin is handed to someone who is simultaneously leaving.

The `/leave` path was already inside a `BEGIN…COMMIT`, but its promotion used an
unlocked correlated-subquery `UPDATE` (re-reading `status='active'` without
`FOR UPDATE`), so the chosen successor was still not pinned against a concurrent
leave.

## Fix
Make the select-next-admin-and-promote sequence **atomic and row-locked**, via a
shared helper that must run inside an already-open transaction on a dedicated
client:

```js
async function reassignAdminLocked(client, groupId, departingUserId) {
    // 1. Lock the GROUP row — serialises concurrent admin hand-offs for this group.
    const { rows: gRows } = await client.query(
        `SELECT admin_user_id FROM groups WHERE id = $1 FOR UPDATE`, [groupId]);
    if (gRows.length === 0) return;
    if (gRows[0].admin_user_id !== departingUserId) return; // not the admin → no-op

    // 2. Pick AND LOCK the longest-tenured remaining active member.
    const { rows: nextRows } = await client.query(
        `SELECT user_id FROM group_memberships
          WHERE group_id = $1 AND status = 'active'
          ORDER BY joined_at ASC LIMIT 1
          FOR UPDATE`, [groupId]);
    if (nextRows.length === 0) return; // no successor

    // 3. Promote the locked candidate.
    await client.query(
        `UPDATE groups SET admin_user_id = $1, updated_at = NOW() WHERE id = $2`,
        [nextRows[0].user_id, groupId]);
}
```

- The **group-row `FOR UPDATE`** serialises every concurrent leave/kick that
  needs to reassign admin for the same group: the second one blocks until the
  first commits, eliminating interleaving.
- The **candidate-row `FOR UPDATE`** pins the chosen successor as `active` for
  the rest of the transaction. A concurrent leave/kick of that same member
  blocks on the locked row until we commit, so it cannot slip past the
  `status='active'` filter between the SELECT and the UPDATE.
- Because steps 2–3 run in the **same transaction** as the membership change
  that triggered the hand-off, there is no window in which the departure is
  durable but the reassignment is not. Any error rolls the whole thing back.

### Kick handler — before (3 separate auto-committed pool.query calls)
```js
groupsRouter.delete('/:id/members/:userId', async (req, res, next) => {
    try {
        const { id: groupId, userId: targetId } = req.params;

        const { rows: adminRows } = await pool.query(           // (1) auto-commit
            `SELECT id FROM groups WHERE id = $1 AND admin_user_id = $2`, …);
        if (adminRows.length === 0) return res.status(403)…;
        if (targetId === req.user.id) return res.status(400)…;
        …
        const { rows } = await pool.query(                      // (2) auto-commit
            `UPDATE group_memberships SET status='kicked' … WHERE status='active' …`, …);
        if (rows.length === 0) return res.status(404)…;

        await pool.query(                                       // (3) auto-commit, no lock
            `UPDATE groups g SET admin_user_id = (SELECT … status='active'
                 ORDER BY m.joined_at ASC LIMIT 1) … WHERE g.admin_user_id = $2 …`, …);

        res.json({ kicked: true, … });
    } catch (err) { next(err); }
});
```

### Kick handler — after (single BEGIN…COMMIT + locked reassign)
```js
groupsRouter.delete('/:id/members/:userId', async (req, res, next) => {
    const { id: groupId, userId: targetId } = req.params;
    if (targetId === req.user.id) return res.status(400)…;      // cheap pre-check

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: adminRows } = await client.query(`SELECT id FROM groups …`, …);
        if (adminRows.length === 0) { await client.query('ROLLBACK'); return res.status(403)…; }
        …
        const { rows } = await client.query(`UPDATE group_memberships SET status='kicked' …`, …);
        if (rows.length === 0) { await client.query('ROLLBACK'); return res.status(404)…; }

        await reassignAdminLocked(client, groupId, targetId);   // locked, same tx
        await client.query('COMMIT');
        res.json({ kicked: true, … });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        return next(err);
    } finally { client.release(); }
});
```

### Leave handler — before (in-tx but unlocked correlated-subquery UPDATE)
```js
        await client.query(
            `UPDATE groups g SET admin_user_id = (
                 SELECT m.user_id FROM group_memberships m
                  WHERE m.group_id = g.id AND m.status = 'active'
                  ORDER BY m.joined_at ASC LIMIT 1) …
              WHERE g.id = $1 AND g.admin_user_id = $2 AND EXISTS (…)`,
            [req.params.id, req.user.id]);
```

### Leave handler — after (locked helper, same tx)
```js
        await reassignAdminLocked(client, req.params.id, req.user.id);
```

## Pattern match
Matches the file's existing pg conventions: `const client = await pool.connect()`
→ `client.query('BEGIN')` … `client.query('COMMIT')` with `ROLLBACK` on every
early-return/error and `client.release()` in `finally` (same shape as
`executeJoin` and the original `/leave`). `FOR UPDATE` row-locking mirrors the
`SELECT 1 FROM groups WHERE id=$1 FOR UPDATE` guard already used in
`executeJoin` (SOCIAL-07).

## Scope / non-changes
- Only `groups.js` edited. No other file touched.
- All pre-existing branch work in this file (SOCIAL-03 param UUID validation,
  SOCIAL-04 transfer-admin ordering, SOCIAL-05 history access, SOCIAL-07 join
  lock) is preserved unchanged — verified by diffing the new file against the
  pre-edit working tree (only the three intended hunks differ).
- The `cannot_kick_yourself_use_leave` guard was hoisted above the DB work as a
  pure pre-check (no behavioural change; avoids opening a tx just to reject).

## Verification
- `node --check peak-fettle-agents/server/routes/groups.js` → exit 0.
- Line count 913 (was 880 at HEAD; +33 = helper + restructure), not truncated.
- `grep handleAdminLeave` → only the explanatory removal comment; no live calls.
- `reassignAdminLocked` defined before both call sites; two `FOR UPDATE` locks
  (group row + successor membership row) confirmed present.
