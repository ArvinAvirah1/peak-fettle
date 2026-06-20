# SRV-FIX-PUSH — push-dispatcher token-clearing (SRV-ENGINE-02, P0)

**File:** `peak-fettle-agents/server/cron/push-dispatcher.js`
**Branch:** `fix/full-review-2026-06-19`
**Finding:** SRV-ENGINE-02 (P0) — see `audits/full-review-2026-06-19/synthesis/SERVER-SYNTH.md`.
**Scope:** token-clearing logic ONLY. No other behavior changed.

## Problem (PUSH-001/002 silent-erasure pattern)
The dispatcher sends via the Expo Push API and stores an **Expo** token in the
`users.fcm_token` column. `isStaleTokenError()` returned `true` for
`DeviceNotRegistered`, `NotRegistered`, **and `InvalidRegistration`**, and
`markFailed()` then ran `UPDATE users SET fcm_token = NULL` whenever that helper
was true. `InvalidRegistration` from Expo means the token is the **wrong format /
malformed** for that transport — NOT that the device is gone. So a transport/
format rejection (and, more broadly, any path that produced such an error string)
would permanently wipe a valid registration after a single failed attempt — the
documented PUSH-001 silent-erasure bug.

## Fix
Split the single predicate into two and clear the token only on a **definitive
device-gone** signal:

- `isDeviceGone(errMsg)` — `DeviceNotRegistered` **||** `NotRegistered` ONLY.
  This is now the **sole** condition that NULLs `users.fcm_token` (the Expo
  equivalent of a permanent unregister: app uninstalled / registration revoked).
- `isPermanentFailure(errMsg)` — superset: `isDeviceGone(...)` **||**
  `InvalidRegistration`. Used **only** to set `failed_permanently` so a malformed
  token stops consuming retries. The token is **left intact** and a
  `console.warn` surfaces it for human investigation.

In `markFailed()`:
- `permanent = isPermanentFailure(errMsg) || newCount >= MAX_RETRIES` (retry-cap
  behavior preserved).
- `UPDATE users SET fcm_token = NULL ...` now lives inside `if (deviceGone)`.
- Transient errors (HTTP/network, 5xx, `MessageRateExceeded`, `MessageTooBig`,
  request-level errors) never reach the clear branch — they are recorded, retried
  next run, and only become `failed_permanently` once they cross `MAX_RETRIES`,
  **without** ever clearing the token.

Doc comment above `markFailed` updated; log message reworded
("cleared unregistered device token", and a `deviceGone:` field replaces the old
`stale:` field).

## What was NOT changed
- Send transport (Expo Push API), batching/chunking, retry cap (`MAX_RETRIES=5`),
  the SQL queries' shape, `run()` loop, `module.exports`, CLI block — untouched.
- SRV-ENGINE-03 (pool.end) is out of scope for this fix and was left as-is.

## Verification
- `node --check peak-fettle-agents/server/cron/push-dispatcher.js` → exit **0**.
- `wc -l` → **335** (was 300; growth is added comments + the split predicate).
- No dangling references to the removed `isStaleTokenError` (`grep` clean).
- `grep` confirms the `fcm_token = NULL` UPDATE is gated by `if (deviceGone)`,
  and `isDeviceGone` keys on `DeviceNotRegistered`/`NotRegistered` only.
