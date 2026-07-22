# SRV-USER-02 (P0) — GDPR account-delete is drift-tolerant

**File:** `peak-fettle-agents/server/routes/user.js`
**Route:** `DELETE /user/account`
**Branch:** `fix/full-review-2026-06-19`
**Date:** 2026-06-20

## Symptom (P0)

The account-deletion transaction ran a raw, unguarded
`DELETE FROM user_percentile_rankings WHERE user_id = $1` inside the
`BEGIN … COMMIT` block. `user_percentile_rankings` is a **deprecated** table
(percentiles compute on-device via `strengthModelV3.ts`); on the drifted
Railway/Supabase prod DB the table is **absent**. Postgres aborts the **entire
transaction** on any statement error, so that one missing relation (`42P01`)
rolled back the whole deletion and the endpoint returned **500** — meaning
**GDPR/CCPA account deletion was permanently broken in prod**.

This is the exact failure mode CLAUDE.md's schema-drift rule warns about:
> "Migrations / DB ops must be drift-tolerant … guard with
> `to_regclass(...) IS NOT NULL` and skip absent tables … routes should catch
> `42P01`/`42703` and degrade rather than 500."

## Fix

Wrap every **satellite** DELETE in a per-statement `SAVEPOINT`. A new
`delGuarded(client, sp, sql, params)` helper issues `SAVEPOINT`, runs the
DELETE, and on `42P01` (undefined table) / `42703` (undefined column) does
`ROLLBACK TO SAVEPOINT` — undoing only that single statement and leaving the
surrounding transaction alive so the deletion completes. Any other error is
re-thrown (still aborts the transaction, as it should).

The core `DELETE FROM users` is **deliberately left un-guarded**: the account
must actually be removed, so a missing `users` table is a real fatal condition
and should 500, not be silently skipped. The set of **live** tables deleted is
unchanged, so the user's real data is still fully erased.

`percentile_vectors` (the other deprecated table) is **not referenced** in the
delete path, so no change was needed there.

## Before (committed HEAD — broken)

```js
await client.query('BEGIN');
await client.query(`DELETE FROM sets       WHERE workout_id IN (SELECT id FROM workouts WHERE user_id = $1)`, [uid]);
await client.query(`DELETE FROM workouts             WHERE user_id = $1`, [uid]);
await client.query(`DELETE FROM plans                WHERE user_id = $1`, [uid]);
await client.query(`DELETE FROM user_constraints     WHERE user_id = $1`, [uid]);
await client.query(`DELETE FROM daily_health_metrics WHERE user_id = $1`, [uid]);
await client.query(`DELETE FROM user_percentile_rankings WHERE user_id = $1`, [uid]);   // <-- 42P01 on prod aborts the whole tx -> 500
await client.query(`DELETE FROM refresh_tokens        WHERE user_id = $1`, [uid]);
await client.query(`DELETE FROM streaks               WHERE user_id = $1`, [uid]);
await client.query(`DELETE FROM users                 WHERE id      = $1`, [uid]);
await client.query('COMMIT');
```

## After (working tree — fixed)

```js
// helper (module scope)
async function delGuarded(client, sp, sql, params) {
    await client.query(`SAVEPOINT ${sp}`);
    try {
        await client.query(sql, params);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
    } catch (e) {
        if (e && (e.code === '42P01' || e.code === '42703')) {
            await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
            console.warn('[account-delete] skipped absent relation (%s) at %s', e.code, sp);
        } else {
            throw e;
        }
    }
}

// inside the transaction
await client.query('BEGIN');
await delGuarded(client, 'sp_sets',        `DELETE FROM sets       WHERE workout_id IN (SELECT id FROM workouts WHERE user_id = $1)`, [uid]);
await delGuarded(client, 'sp_workouts',    `DELETE FROM workouts             WHERE user_id = $1`, [uid]);
await delGuarded(client, 'sp_plans',       `DELETE FROM plans                WHERE user_id = $1`, [uid]);
await delGuarded(client, 'sp_constraints', `DELETE FROM user_constraints     WHERE user_id = $1`, [uid]);
await delGuarded(client, 'sp_health',      `DELETE FROM daily_health_metrics WHERE user_id = $1`, [uid]);
await delGuarded(client, 'sp_percentile',  `DELETE FROM user_percentile_rankings WHERE user_id = $1`, [uid]);  // now skipped if absent
await delGuarded(client, 'sp_refresh',     `DELETE FROM refresh_tokens        WHERE user_id = $1`, [uid]);
await delGuarded(client, 'sp_streaks',     `DELETE FROM streaks               WHERE user_id = $1`, [uid]);
// The core users row MUST delete for the account to be gone — not guarded.
await client.query(`DELETE FROM users                 WHERE id      = $1`, [uid]);
await client.query('COMMIT');
```

## Why SAVEPOINT (not bare try/catch)

Inside an open transaction, a failed statement puts the session in the
`25P02` "current transaction is aborted, commands ignored until end of
transaction block" state — every subsequent query errors until ROLLBACK. A
plain `try { } catch { }` around the DELETE would NOT recover; only
`ROLLBACK TO SAVEPOINT` clears the aborted state and lets the rest of the
deletion run. `to_regclass(...)`-in-a-DO-block would also work, but the
SAVEPOINT approach additionally hardens the *other* satellite tables against
future drift at zero extra cost.

## Verification

- `node --check peak-fettle-agents/server/routes/user.js` → exit **0**
- `wc -l peak-fettle-agents/server/routes/user.js` → **1135** lines (not truncated)
- Live-table deletes unchanged → user's real data still fully removed.
- Not committed (per task instruction).
