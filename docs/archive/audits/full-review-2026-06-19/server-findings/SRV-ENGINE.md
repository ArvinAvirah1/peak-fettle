# SRV-ENGINE findings
## Summary
Files reviewed: 11 (trainingEngine/index.js, exerciseFill.js, loading.js, reasoning.js,
scaleDown.js, sequence.js, templates.js; cron/percentile.js, cohort-graduation.js,
group-streaks.js, push-dispatcher.js). Counts — P0:2 P1:2 P2:3 P3:1.
The trainingEngine is deterministic and numerically sound; the uncommitted working-tree
diffs are whitespace-only (CRLF→LF, `git diff -w` shows 0 lines). The two P0s are a
`new Date()` inside the plan-gen hot path that breaks determinism when `ctx.today` is
omitted, and a token-clearing bug in push-dispatcher that nulls `fcm_token` on
`InvalidRegistration` — an Expo-format error, not a stale-device error, so it
silently wipes valid tokens when the wrong token format is sent. No FCM transport
regression (correctly uses Expo Push API). No destructive ops without guards. No
hardcoded secrets.

---

### [P0] SRV-ENGINE-01 — `new Date()` in plan-gen hot path breaks determinism when caller omits `ctx.today`

- **File:** `peak-fettle-agents/server/lib/trainingEngine/index.js:43,81`
- **Problem:** `isoWeek()` calls `new Date()` when its argument is falsy, and
  `generatePlan()` defaults `today` to `new Date()` when `ctx.today` is not
  supplied. Both paths inject wall-clock time into the seed derivation path.
  The ISO-week string fed to `buildSeed(userId, weekISO)` (exerciseFill.js:89)
  determines which exercises are selected for the week. If a caller generates two
  plans in the same second without passing `ctx.today`, they get identical seeds —
  fine. But if the first call happens at 23:59:59 Sunday and the second at 00:00:00
  Monday (a week boundary), they get different exercise selections for the same
  user, breaking the stated "stable within week" guarantee. The CLAUDE.md
  Workflow static check also explicitly rejects `new Date()` in prompt/plan-gen
  paths.
- **Evidence:**
  ```js
  // index.js:43
  function isoWeek(date) {
    const d = date ? new Date(date) : new Date();   // ← wall-clock when no date
    ...
  }
  // index.js:81
  const today = ctx.today || new Date();            // ← wall-clock when ctx.today absent
  ```
- **Invariant/Rubric:** Determinism requirement (CLAUDE.md §7: "no `Date.now()`/`Math.random()`/`new Date()` in the plan-gen path"); P0 Correctness.
- **Suggested direction:** Require callers to always supply `ctx.today`; throw if it
  is missing rather than silently defaulting to `new Date()`. Alternatively, enforce
  the contract in the route that calls `generatePlan` — inject `today` there — and
  add a guard at the top of `generatePlan`: `if (!ctx.today) throw new Error('ctx.today required')`.
- **Confidence:** HIGH

---

### [P0] SRV-ENGINE-02 — push-dispatcher clears `fcm_token` on `InvalidRegistration`, which is an Expo-format rejection, not a genuine stale device

- **File:** `peak-fettle-agents/server/cron/push-dispatcher.js:60-66, 153-173`
- **Problem:** `isStaleTokenError()` returns `true` for `InvalidRegistration`. The
  Expo Push API returns `InvalidRegistration` when it rejects a token it cannot
  parse — e.g., if a raw FCM token is accidentally stored in `users.fcm_token`
  instead of an `ExponentPushToken[…]`, or if the token string is malformed/empty.
  `markFailed()` calls `isStaleTokenError()` and, if true, NULLs
  `users.fcm_token` immediately (no MAX_RETRIES, no retry). This means a single
  send attempt with a malformed-but-not-stale token permanently silences that user's
  push delivery — the same silent-erasure failure mode documented as PUSH-001.
  `DeviceNotRegistered` (the canonical Expo "device uninstalled" code) is the only
  safe signal for permanent token erasure. `InvalidRegistration` from Expo means the
  token format is wrong, which is a bug to investigate, not a signal to erase.
- **Evidence:**
  ```js
  // push-dispatcher.js:60-66
  function isStaleTokenError(errMsg) {
      return (
          errMsg.includes('DeviceNotRegistered') ||
          errMsg.includes('NotRegistered') ||
          errMsg.includes('InvalidRegistration')  // ← should NOT clear token
      );
  }
  // push-dispatcher.js:166-173
  if (stale) {
      await client.query(
          `UPDATE users SET fcm_token = NULL WHERE id = $1`,
          [notif.user_id]
      );
  ```
- **Invariant/Rubric:** PUSH-001/002 history (CLAUDE.md §PUSH-001: "Auto-clearing tokens on send failure is dangerous when the transport itself is wrong"); P0 Correctness / data integrity.
- **Suggested direction:** Remove `InvalidRegistration` from `isStaleTokenError`. Only `DeviceNotRegistered` (and arguably `NotRegistered` per Expo's docs) should clear the token. `InvalidRegistration` from Expo Push API means the token format is unrecognized — log it as a warning + mark `failed_permanently` without erasing the token so a human can investigate.
- **Confidence:** HIGH

---

### [P1] SRV-ENGINE-03 — `push-dispatcher.run()` never calls `pool.end()`, so the process hangs when scheduled as a standalone cron

- **File:** `peak-fettle-agents/server/cron/push-dispatcher.js:188-299`
- **Problem:** `percentile.js`, `cohort-graduation.js`, and `group-streaks.js` all
  call `pool.end()` (in `finally` or in the `.then()` chain at CLI entry) so the
  Node process exits cleanly. `push-dispatcher.js` does not: `run()` releases
  `client` in `finally` but never drains `pool`. When invoked directly
  (`node cron/push-dispatcher.js`) the process stays alive indefinitely waiting on
  open pg pool connections. The cron scheduler will accumulate zombie processes over
  time, eventually exhausting DB connection limits.
- **Evidence:**
  ```js
  // push-dispatcher.js:280-298
  } finally {
      client.release();   // releases one client, but pool stays open
  }
  // ...
  if (require.main === module) {
      run()
          .then((stats) => { console.log(...); process.exit(0); })  // exit(0) saves it
          .catch((err) => { console.error(...); process.exit(1); });
  }
  ```
- **Invariant/Rubric:** The `process.exit(0)` in the CLI block does force-kill the
  process, which is why this works today — but it skips any remaining async cleanup
  and is the wrong pattern. If `run()` is ever called from within another process
  (e.g., a shared cron runner that imports `{ run }`), the pool will hang. P1 —
  wrong behaviour in non-CLI invocation path.
- **Suggested direction:** Add `await pool.end()` inside the `finally` block of
  `run()` (or in a wrapping try/finally in the CLI entry), matching the pattern
  used by the other three cron files. Remove `process.exit(0)` and let natural
  process exit occur after pool drains.
- **Confidence:** HIGH

---

### [P1] SRV-ENGINE-04 — `percentile.js` has a duplicate `require.main` guard; the bottom guard can invoke `run()` even though the top guard exits

- **File:** `peak-fettle-agents/server/cron/percentile.js:36-39, 193-195`
- **Problem:** The file has two `if (require.main === module)` blocks. The first
  (line 36) is the DISABLED guard added by Agent O — it exits early with a message.
  The second (line 193) is the original CLI entry point that calls `run()`. When the
  file is executed directly, the top guard fires `process.exit(0)` before the bottom
  is reached, so it appears safe today. However if a future change removes the top
  guard (or someone calls `require('./percentile').run()` via another entry), the
  bottom guard does nothing in non-module context. The structural duplication is
  confusing: two `require.main` blocks in one file with contradictory intent — one
  says "DISABLED / exit", the other says "run the job".
- **Evidence:**
  ```js
  // line 36-39 (DISABLED guard)
  if (require.main === module) {
      console.log('[percentile-cron] DISABLED ...');
      process.exit(0);
  }
  // line 193-195 (original CLI entry, now dead but structurally present)
  if (require.main === module) {
      run();
  }
  ```
- **Invariant/Rubric:** P1 — misleading dead code; a future refactor could
  accidentally re-enable a deprecated job that writes to `user_percentile_rankings`
  (a deprecated table per CLAUDE.md §4).
- **Suggested direction:** Delete the bottom `if (require.main === module) { run(); }` block entirely. The top DISABLED guard is the only entry point that should exist while the job is deprecated. Add a comment near `module.exports` noting that `run()` is exported for tests only and must not be scheduled.
- **Confidence:** HIGH

---

### [P2] SRV-ENGINE-05 — `reasoning.js:144` comment says "Fewer than 3 sessions" but the threshold is `histCount < 6`

- **File:** `peak-fettle-agents/server/lib/trainingEngine/reasoning.js:144-146`
- **Problem:** The condition `histCount < 6` is checked against the raw count of
  history rows (individual sets, not sessions). A single session can produce many
  history rows (one per set per exercise), so `histCount < 6` is not equivalent to
  "fewer than 3 sessions." The string returned to the user says "Fewer than 3
  sessions logged" — this will trigger on a user who has logged 1 full session with
  6+ sets logged, giving them incorrect feedback that they haven't started yet.
  Conversely, a user who has logged 5 sets across 5 sessions still sees the new-user
  text because `histCount = 5 < 6`.
- **Evidence:**
  ```js
  // reasoning.js:144-146
  if (histCount < 6) {
    return `Fewer than 3 sessions logged — this plan adapts as you log more...`;
  }
  ```
- **Invariant/Rubric:** P2 — incorrect user-facing copy and wrong threshold;
  degraded UX for a common case.
- **Suggested direction:** Either count distinct `day_key` values from history rows
  to get a real session count and compare against 3, or lower the threshold to a
  defensible set-count (e.g., `< 3` if each history row represents a set). Update
  the string to match whichever metric is chosen.
- **Confidence:** HIGH

---

### [P2] SRV-ENGINE-06 — `loading.js` warmup ladder is only generated for `weekNum === 1`, but is spread into all 3 weeks of output (shows `undefined` in weeks 2 and 3)

- **File:** `peak-fettle-agents/server/lib/trainingEngine/loading.js:148-149, 163-165, 173-177`
- **Problem:** `warmup` is declared `let warmup = undefined` and only assigned for
  `weekNum === 1`. The slot returned for weeks 2 and 3 includes `warmup: undefined`
  in the spread. While `undefined` is the JS default, the key is explicitly present
  in the returned object, which means it serializes as `"warmup": null` in
  `JSON.stringify` — the client will receive `warmup: null` on weeks 2 and 3 of
  every slot, even on the non-warming-up weeks. If the client checks
  `slot.warmup != null` to decide whether to render a warm-up ladder, this is
  correct; but if it checks `'warmup' in slot` or `slot.warmup !== undefined`, it
  will show an empty ladder on weeks 2–3.
- **Evidence:**
  ```js
  // loading.js:148-165
  let warmup = undefined;
  if (e1rm != null && e1rm > 0) {
    ...
    if (slot.priority === 1 && slot.is_compound && weekNum === 1) {
      warmup = warmupLadder(weight_kg);
    }
  }
  return { ...slot, weight_kg, warmup, coaching_note };  // warmup always in object
  ```
- **Invariant/Rubric:** P2 — subtle serialization/contract issue; client may render
  unexpected UI in weeks 2–3.
- **Suggested direction:** Only include `warmup` in the returned slot object when it
  has a real value: use a conditional spread `...(warmup ? { warmup } : {})` instead
  of always spreading `warmup`.
- **Confidence:** MED

---

### [P2] SRV-ENGINE-07 — `cohort-graduation.js` comment references deprecated `FCM_SERVER_KEY` env var that no longer applies

- **File:** `peak-fettle-agents/server/cron/cohort-graduation.js:31-33`
- **Problem:** The file header says "FCM_SERVER_KEY — for push notification delivery.
  If FCM_SERVER_KEY is not set, notifications are queued…". After PUSH-001, the
  transport was switched entirely to the Expo Push API; `FCM_SERVER_KEY` is never
  read anywhere in this file. The comment implies to operators that setting
  `FCM_SERVER_KEY` changes behaviour (it does not). It also implies there is a direct
  FCM send path in this cron (there is not — it only writes to `notification_queue`).
- **Evidence:**
  ```js
  // cohort-graduation.js:31-33
  //   FCM_SERVER_KEY — for push notification delivery.
  //   If FCM_SERVER_KEY is not set, notifications are queued in the
  //   `notification_queue` table for a separate delivery service to pick up.
  ```
- **Invariant/Rubric:** P2 — misleading operator documentation; could cause ops to
  misconfigure environment or expect push behaviour that won't occur.
- **Suggested direction:** Remove the `FCM_SERVER_KEY` env var comment entirely.
  Replace with: "Graduation notifications are queued in `notification_queue`; the
  `push-dispatcher` cron delivers them via the Expo Push API."
- **Confidence:** HIGH

---

### [P3] SRV-ENGINE-08 — `exerciseFill.js` equipment compatibility uses OR semantics ("any one piece suffices") which may select exercises the user cannot actually perform

- **File:** `peak-fettle-agents/server/lib/trainingEngine/exerciseFill.js:53-59`
- **Problem:** `equipmentCompatible` passes if the exercise requires ANY piece of
  equipment the user has. An exercise tagged `['barbell', 'rack']` passes for a user
  who owns only `['barbell']` — but the exercise genuinely needs a rack. This is an
  intentional design choice (the comment says "OR semantics"), but it's undocumented
  at the system level and may surprise coaches or users. It is not a correctness bug
  per se (bodyweight fallback handles extreme gaps), but it's worth flagging as a
  product risk.
- **Evidence:**
  ```js
  return exerciseEquipment.some(eq => userProfile.includes(eq));
  // "any one piece suffices" — but rack squat needs both barbell AND rack
  ```
- **Invariant/Rubric:** P3 — maintainability / product risk; not a correctness bug
  given the fallback path, but worth documenting.
- **Suggested direction:** Add a comment explaining the OR-semantics decision and
  why it was chosen over AND. If stricter matching is ever desired, switch to `.every()`
  with a note about the trade-off (AND semantics would over-filter on exercises where
  only one item is truly required).
- **Confidence:** MED

---

## Uncommitted working-tree state of trainingEngine/*

All 7 `trainingEngine/*.js` files show as modified in `git status` but
`git diff -w HEAD -- .` (whitespace-ignored) produces 0 lines of diff. The entire
"change" is a line-ending conversion (CRLF → LF). There is no mid-refactor
incomplete code. The files are semantically identical to HEAD. No findings triggered
by the working-tree state.
