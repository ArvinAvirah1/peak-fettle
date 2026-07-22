# Lesson L11 — Background jobs: node-cron and scheduled work

> **Track:** 1 — Backend services · **Status:** ⭐ Reference lesson (fully worked)
> **Interactive app:** [`L11_cron_jobs.html`](L11_cron_jobs.html)
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01–L10 (API, database, transactions)

## 0. Source of truth (read fresh before teaching — code drifts)
- `cron/percentile.js` — weekly percentile ranking batch (Sunday 03:00 UTC, idempotent via model_version)
- `cron/group-streaks.js` — weekly group streak evaluation (Monday 00:05 UTC, idempotent via `(group_id, week_start)` PK)
- `cron/push-dispatcher.js` — FCM notification dispatcher (every 5 minutes, retry on error, handle stale tokens)
- `cron/cohort-graduation.js` and `cron/cleanup-orphaned-auth.js` — simpler patterns for comparison
- `migrations/20260517_notification_queue.sql` — the queue pattern (insert pending, dispatch polls, mark sent)
- `group_streak_credits_spec.md` § 5 — weekly evaluation algorithm, idempotency rules

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L1)** Define "idempotent" and identify which cron jobs here are safe to double-run.
- **(L2)** Explain why some work (percentile recompute) is async/scheduled instead of happening on request.
- **(L3)** Construct a cron expression (5-minute frequency, weekly on Monday, custom backfill parameter).
- **(L4)** Analyze failure modes: what breaks if the percentile job runs twice in one day, and how does the `model_version` column prevent double-crediting?
- **(L5)** Evaluate trade-offs: what would you cache in the notification queue to reduce FCM API calls, and when would you sacrifice "immediate" for "batch"?

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion
- "Have you scheduled work before (cron, Lambda, message queues)?"
- "Confidence with UTC times and ISO weeks?"
- "When you log a set, should your percentile update immediately, or is waiting until the next morning OK?"
> Calibrate: if cron is brand-new, spend extra time on "why not real-time?". If UTC/ISO week confusion exists, use a diagram. Third Q primes the capstone (failure modes).

## 3. Spacing carry-over (M14)
From L10 (LLM integration): "You call Claude Haiku synchronously (user waits). Why would you NOT do the same for percentile recompute?"
> Today: we'll see why batch makes sense and what idempotency costs.

## 4. The difficulty ladder for THIS lesson (M2)
1. Real-time vs. async work — when to pick each.
2. Cron expression syntax and scheduling libraries (node-cron).
3. Idempotency: what it means, why it matters, how to enforce it.
4. The percentile batch: reading a view, calling PL/pgSQL, bulk upsert, commit/rollback.
5. The group-streak batch: per-group transaction, member evaluation, credit ledger writes.
6. The notification queue pattern: insert pending → poll → dispatch → mark sent.
7. Failure modes: double-run, stale job (skips a week), partial failure (some groups fail, others succeed).

## 5. Concept sequence

### Concept 1: Real-time vs. async — why some work is batched
- **(M4) Generate first:** "A user logs a set for bench press. Should the app recalculate their percentile rank immediately and show it in the 'Set logged' response, or compute it later in batch?"
- **The idea:** Real-time recompute would require:
  1. Fetching the entire cohort (thousands of users in the same weight/age/experience band).
  2. Recomputing everyone's percentile (expensive statistical model).
  3. Returning all the results in the request.
  
  Latency: ~5–10 seconds. Cost: repeated millions of times.
  
  Batch recompute (once per week, Sunday 03:00 UTC) requires:
  1. One scheduled task.
  2. Return the user's new rank the next morning.
  
  Latency hit to user: acceptable (24 hours). Cost: **1 computation for the entire cohort**, not 1 per set.
  
  **(CTO guardrail from code comments):** "A single user logging a set should not trigger a full cohort re-rank." That's the principle.
- **Real code** (`cron/percentile.js`, lines 19–24):
  ```javascript
  // Why batch, not real-time?
  //   CTO guardrail #2: a single user logging a set should not trigger a full
  //   cohort re-rank. The weekly batch is cheap on expected data volumes for
  //   months 1–12. The user doesn't need a millisecond-fresh percentile — seeing
  //   "you're top 18% this week" the next morning is motivating enough.
  ```
- **(M6) Elaboration:** the "motivating enough" quote is key. Percentile is a *motivation lever*, not a *accuracy necessity*. If it's 24 hours stale, users still feel good. If the response time for "log set" jumps from 100ms to 5000ms, users hate it.
- **(M3) Retrieval check:** "What's the difference between 'you're the 18th percentile user' and 'you're the 18th percentile *right now*'? Is staleness a product bug or a feature?"
- **(M12) Checkpoint:** Does the batch-vs.-real-time tradeoff feel clear? Where else in Peak Fettle would you batch instead of real-time?

### Concept 2: Cron expressions and node-cron scheduling
- **(M7) Concrete:** "The percentile job runs Sunday 03:00 UTC. Group streaks run Monday 00:05 UTC. Push dispatcher runs every 5 minutes. How do you express that?"
- **The idea:** Cron expressions are **5 fields**: `minute hour day_of_month month day_of_week`.
  - `0 3 * * 0` → "at 03:00, every day of month, every month, Sunday" = Sunday 03:00 UTC.
  - `5 0 * * 1` → "at 00:05, every day, every month, Monday" = Monday 00:05 UTC.
  - `*/5 * * * *` → "every 5 minutes, all day, every day" = every 5 minutes.
- **Real code** (`cron/percentile.js`, lines 25–31):
  ```javascript
  // Schedule:
  //   Deploy this as a Sunday 03:00 UTC scheduled task (node-cron or your
  //   deployment scheduler). It can also be invoked manually for backfills:
  //     node cron/percentile.js
  ```
- **(M8) Diagram (in app):** a week calendar showing when each job runs relative to user actions (log set → sync to DB → Sunday batch → percentile updates Monday AM).
- **(M6) Elaboration:** manual invocation is crucial. `node cron/percentile.js` without arguments uses the current date; `node cron/group-streaks.js 2026-04-27` backfills a specific week. This pattern lets you re-run a failed week without double-crediting (because of idempotency — see next concept).
- **(M3) Retrieval check:** "What time is Sunday 03:00 UTC in your local timezone? (This trips people up.)"

### Concept 3: Idempotency — the shield against double-run disasters
- **(M4) Generate first:** "The percentile job is scheduled for Sunday 03:00 UTC. It crashes. The operator re-runs it Monday 08:00 UTC (5 hours later). What should happen?"
- **The idea:** A job is **idempotent** if running it twice produces the same result as running it once. The percentile batch achieves this via the `ON CONFLICT` clause:
  - **First run (Sunday 03:00):** Inserts 50,000 rows into `user_percentile_rankings` (user × lift pairs).
  - **Second run (Monday 08:00):** Tries to insert the same 50,000 rows. The primary key `(user_id, lift_id, model_version)` already exists, so `ON CONFLICT ... DO UPDATE` runs, replacing the old values with the new ones. Result: the rows are updated in place, not duplicated.
  
  **Non-idempotent disaster:** if you didn't have `ON CONFLICT`, the second run would fail with a constraint violation, and you'd have a half-computed state (some rows updated, some not). Or worse: if you used `DELETE then INSERT`, the second run would delete the first run's results before reinserting them, creating a race condition window where percentiles are missing.
- **Real code** (`cron/percentile.js`, lines 108–121):
  ```javascript
  await client.query(
      `INSERT INTO user_percentile_rankings
          (user_id, lift_id, percentile, percentile_simple,
           cohort_size_internal, is_estimated, computed_at, model_version)
       VALUES ${values.join(', ')}
       ON CONFLICT (user_id, lift_id, model_version)
       DO UPDATE SET
          percentile           = EXCLUDED.percentile,
          percentile_simple    = EXCLUDED.percentile_simple,
          cohort_size_internal = EXCLUDED.cohort_size_internal,
          is_estimated         = EXCLUDED.is_estimated,
          computed_at          = EXCLUDED.computed_at`,
      params
  );
  ```
- **(M6) Elaboration:** idempotency is **not free**. It requires an identifying key (here: `(user_id, lift_id, model_version)`). If the key is too broad, the update is wrong. If it's too narrow, collisions happen for different users. Designing the key is the first step of any idempotent batch.
- **(M9 faded):** "The group-streaks job uses `(group_id, week_start)` as the idempotency key. What happens if you run it twice for the same week? Are credit ledger entries duplicated?" → seed for Q5 capstone.
- **(M3) Retrieval check:** "Why does the percentile batch include `model_version` in the primary key, and not just `(user_id, lift_id)`?"

### Concept 4: The percentile batch — reading a view and bulk upserting
- **(M7) Concrete:** "Every Sunday morning, Peak Fettle re-ranks all users. How? Query a view of all lifts, call a stored function for each, collect 50K results, upsert them all in chunks."
- **The idea:** The percentile batch is a **simple pattern:**
  1. Call a SQL function (`compute_percentile_batch(model_version)`) that returns precomputed rows.
  2. Chunk the results (500 at a time) to avoid bloating the query.
  3. Upsert with conflict resolution to be idempotent.
  4. Commit or rollback the entire batch in one transaction.
  
  This is **data-parallel work** — no side effects, no coordination with other services, just "recompute and persist." Perfect for cron.
- **Real code** (`cron/percentile.js`, lines 60–125):
  ```javascript
  // The SQL function does the heavy lifting
  const { rows } = await client.query(
      `SELECT user_id, lift_id, percentile, percentile_simple,
              cohort_size_internal, is_estimated, computed_at
       FROM compute_percentile_batch(2)`
  );

  rowsComputed = rows.length;

  // Bulk upsert in 500-row chunks
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];

      chunk.forEach((row, idx) => {
          const base = idx * 7;
          values.push(`($${base + 1}, $${base + 2}, ..., $${base + 7}, 2)`);
          params.push(row.user_id, row.lift_id, ...);
      });

      await client.query(
          `INSERT INTO user_percentile_rankings ... VALUES ${values.join(', ')} ON CONFLICT ... DO UPDATE ...`,
          params
      );
  }

  await client.query('COMMIT');
  ```
- **(M3) Retrieval check:** "Why chunk into 500 rows instead of upsert all 50,000 at once?"
- **(M12) Checkpoint:** The pattern generalizes: "query → transform → chunk → bulk upsert." See it in any production batch job.

### Concept 5: The group-streaks batch — per-group transactions and credit ledger writes
- **(M7) Concrete:** "Every Monday, the system evaluates 100 active groups. For each: snapshot members, check who hit their goals, credit the winners. What makes this harder than percentile?"
- **The idea:** Unlike percentile (one global upsert), group streaks involves:
  1. **Per-group decision:** did >50% hit their goal? (binary outcome).
  2. **Per-group state update:** streak counter, audit row.
  3. **Per-member ledger writes:** one row per eligible member (could be 12 × 100 = 1,200 rows).
  4. **Isolation:** groups must not interfere (one group's failure shouldn't crash another's credit writes).
  
  Solution: **one transaction per group**. If a group fails, rollback and log; move to the next group.
- **Real code** (`cron/group-streaks.js`, lines 206–345):
  ```javascript
  for (const group of groups) {
      const client = await pool.connect();
      try {
          await client.query('BEGIN');

          // Step 1: Snapshot eligible members (hard-block: joined_at < week_start)
          const { rows: eligible } = await client.query(
              `SELECT gm.user_id, gm.joined_at
               FROM group_memberships gm
               WHERE gm.group_id = $1 AND gm.joined_at < $2 AND (...)`,
              [group.id, weekStartStr]
          );

          // Check dormancy (must have ≥2 eligible members)
          if (eligible.length < 2) {
              await client.query('ROLLBACK');
              groupsSkipped++;
              continue;
          }

          // Step 2: For each member, check if they hit their goal
          let membersHitGoal = 0;
          for (const member of eligible) {
              const hit = await didHitGoal(client, member.user_id, weekStartStr, weekEndStr);
              if (hit) membersHitGoal++;
          }

          const hitRate = membersHitGoal / eligible.length;
          const success = hitRate > 0.50;

          // Step 3: Update group streak + write evaluation audit
          if (success) {
              const newStreakWeeks = group.current_streak_weeks + 1;
              const mult = multiplier(newStreakWeeks);
              const creditsPerMemberBase = Math.floor(BASE_CREDITS * mult);

              // Write credit_ledger row for each eligible member
              for (const member of eligible) {
                  const weeksInGroup = weeksSinceJoin(member.joined_at, weekStart);
                  const isNewJoiner = weeksInGroup < NEW_JOINER_GRACE_WEEKS;
                  const memberCredits = isNewJoiner ? BASE_CREDITS : creditsPerMemberBase;

                  await client.query(
                      `INSERT INTO credit_ledger (user_id, amount, source, group_id, week_start)
                       VALUES ($1, $2, 'group_streak', $3, $4)`,
                      [member.user_id, memberCredits, group.id, weekStartStr]
                  );
              }
          }

          await client.query('COMMIT');
      } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[group-streaks-cron] ERROR on group ${group.id}:`, err.message);
      } finally {
          client.release();
      }
  }
  ```
- **(M6) Elaboration:** the per-group transaction pattern is crucial. It lets you handle failures gracefully: if one group's data is corrupt (invalid joined_at timestamp), that group's evaluation fails, but the other 99 groups succeed. Logging helps you find which group is broken so you can fix it.
- **(M9 faded):** "What if the group-streaks job runs twice for the same week? Are credits duplicated? How does the `(group_id, week_start)` PK prevent that?" → quiz q5.

### Concept 6: The notification queue pattern — async work that decouples from the LLM call
- **(M7) Concrete:** "When a user's plan is generated (L10), you want to send a push notification. But FCM might be slow or fail. How do you handle that without blocking the user?"
- **The idea:** The queue pattern decouples producers (things that generate work) from consumers (things that do the work):
  1. **Producer (POST /plans/generate):** Insert a row into `notification_queue` with `sent_at = NULL`. Return immediately to the user.
  2. **Consumer (cron/push-dispatcher.js):** Poll the queue every 5 minutes, find rows with `sent_at IS NULL`, send FCM, mark `sent_at = NOW()` on success, or log the error.
  3. **Retry:** If send fails, `sent_at` stays NULL, and the next poll will retry (up to some limit).
  
  This pattern isolates the user from FCM latency (which can spike to 5+ seconds) and handles failures gracefully.
- **Real code** (`routes/plans.js`, lines 524–534):
  ```javascript
  // After generating the plan, enqueue a notification
  try {
      await supabaseAdmin.from('notification_queue').insert({
          user_id: req.user.id,
          type: 'plan_ready',
          title: 'Your personalised plan is ready',
          body: 'Tap to view your new AI-generated workout program.',
          data: { plan_id: plan.id ?? null },
      });
  } catch (_e) {
      console.warn('[push] plan_ready enqueue failed:', _e?.message);
      // Enqueue failure is not fatal — the user still got their plan
  }
  ```
  
  And the dispatcher (`cron/push-dispatcher.js`, lines 84–174):
  ```javascript
  async function run() {
      const { rows: pending } = await client.query(`
          SELECT nq.id, nq.user_id, nq.title, nq.body, nq.data, u.fcm_token
          FROM notification_queue nq
          JOIN users u ON u.id = nq.user_id
          WHERE nq.sent_at IS NULL
            AND u.fcm_token IS NOT NULL
          ORDER BY nq.created_at ASC
          LIMIT 50
      `);

      for (const notif of pending) {
          try {
              await sendFcm(notif.fcm_token, notif.title, notif.body, notif.data ?? {});
              await client.query(
                  `UPDATE notification_queue SET sent_at = NOW(), error = NULL WHERE id = $1`,
                  [notif.id]
              );
          } catch (err) {
              await client.query(
                  `UPDATE notification_queue SET error = $1 WHERE id = $2`,
                  [err.message.slice(0, 500), notif.id]
              );
              // If stale token, clear it so future runs skip
              if (errMsg.includes('NotRegistered')) {
                  await client.query(`UPDATE users SET fcm_token = NULL WHERE id = $1`, [notif.user_id]);
              }
          }
      }
  }
  ```
- **(M6) Elaboration:** the dispatcher handles a **stale token** gracefully: if FCM says "NotRegistered," the token is cleared immediately so future runs don't waste time on that user. This is called **circuit breaking** — stopping repeated attempts to reach a known-bad endpoint.
- **(M3) Retrieval check:** "If the dispatcher crashes mid-run (after sending 25 of 50 notifications), what state is the database in? Is that safe?"

## 6. Teach-back (M10)
"Explain to a colleague: Why can't we just compute percentiles when a user logs a set? Why does the group-streaks batch use a transaction per group instead of one big transaction? What would break if the push dispatcher didn't clear stale tokens?"
> Expect: percentile answer focuses on latency cost. Streaks answer should surface the graceful-failure pattern. Push dispatcher answer should show thinking about edge cases (what happens to that one bad token if you don't clear it?).

## 7. Cumulative review (M13) — rapid-fire
1. Express "every Monday at 00:05 UTC" as a cron expression.
2. Why does `group_week_evaluations` use `(group_id, week_start)` as the PK instead of just auto-incrementing?
3. If the push dispatcher processes 50 notifications per run and runs every 5 minutes, how long before a notification queued at 09:00 is sent (worst case)?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | What does "idempotent" mean in the context of cron jobs? | Identifies that running the job multiple times produces the same result as running once | A job that can be safely run multiple times without causing duplicates or inconsistencies (e.g., via `ON CONFLICT`). | 8 |
| q2 | L2 | free | Explain why the percentile batch runs once per week (Sunday 03:00 UTC) instead of updating percentiles in real-time when a user logs a set. | Names the latency/cost tradeoff; mentions "seeing the rank the next morning is motivating enough" — the staleness is acceptable | Real-time would require re-ranking the entire cohort (thousands of users) on every set log — 5–10s latency. Batch once/week is cheap (1 compute for everyone) and the 24h staleness is acceptable because percentile is a motivation tool, not a critical metric. CTO guardrail: don't trigger full re-rank on single user action. | 12 |
| q3 | L3 | free | Express the following schedule as a cron expression: "Every Tuesday and Thursday at 14:30 UTC". Then write the manual invocation command for the group-streaks batch to backfill the week of Monday 2026-05-20. | Correct cron (30 14 * * 2,4); correct backfill command (with the Monday YYYY-MM-DD date). | Cron: `30 14 * * 2,4` (30 min past 14h, any date, any month, days 2 & 4). Backfill: `node cron/group-streaks.js 2026-05-20`. | 12 |
| q4 | L4 | free | The percentile batch runs Sunday 03:00 UTC and finishes at 03:45. It crashes at 03:20 and you re-run it at 04:00. Walk through what happens: (1) what SQL does the second run execute? (2) Why doesn't the second run cause duplicates? (3) What field acts as the idempotency lock? | Explains `ON CONFLICT` semantics; names the PK `(user_id, lift_id, model_version)`; shows that the second run INSERTs the same rows but the PK conflict triggers DO UPDATE (rewrite in place, not duplicate). | (1) The second run computes the same 50K rows and runs INSERT with `ON CONFLICT(user_id, lift_id, model_version) DO UPDATE SET ...`. (2) The primary key already exists from the first run, so the PK constraint fires and DO UPDATE replaces the old values. (3) The field is the composite key `(user_id, lift_id, model_version)`. If the second run computed *different* percentiles (e.g., due to a bug), the old values would be overwritten with the new ones — this is why you want the second run to be identical. | 18 |
| q5 | L5 | free | The group-streaks batch uses `(group_id, week_start)` as the idempotency key in `group_week_evaluations`. But credit_ledger rows have no such key — they're just appended. If the batch runs twice for the same week, are credits duplicated? How would you fix it? | Identifies that ledger rows are duplicated (no PK prevents it); proposes either (a) add a unique constraint `(user_id, group_id, week_start, source)` + `ON CONFLICT`, or (b) check if an evaluation row exists before writing ledger rows (semantic idempotency). | Yes, credits are duplicated: the second run writes another 100×12=1,200 rows to credit_ledger. Fix: (a) **Add unique constraint** `(user_id, group_id, week_start, source)` so ledger rows are idempotent too. Or (b) **Check group_week_evaluations first** — if a row exists for (group, week), skip ledger writes entirely (semantic idempotency). (a) is preferable because it defends against partial failures (if the evaluation row is written but ledger rows fail halfway). | 22 |
| q6 | L5 (opt) | free | Design a notification queue caching strategy to reduce FCM API calls by 70% while keeping push latency under 1 minute. (Clue: not all notifications are equally important.) | Proposes tiering (high priority: send immediately; low priority: batch and deduplicate). Shows cost-benefit. | Tier by type: (1) **Critical** (login alerts, payment): send immediately via dispatcher. (2) **Normal** (plan ready): batch into digest, send every 5 min. (3) **Low** (daily reminder): send via weekly batch. Dedup: if a user is queued for 2 "plan_ready" notifs in a 5-min window, send one digest instead. Latency: 1 min for normal (max of 5 min + send time). API calls: critical 100%, normal 20% (batched), low 4% (weekly) → ~60% reduction. Downside: adds complexity (tiering logic). Only do this if FCM becomes expensive. | 24 |

## 9. Custom interactive widget
**Cron scheduler simulator** — timeline UI showing:
- The current time (user can scrub forward).
- Visual bars for each job (percentile on Sun 03:00, group-streaks on Mon 00:05, dispatcher every 5 min).
- Simulate a crash (gray out a job), then re-run it, visualizing idempotency (no duplicates).
- Show transaction boundaries (per-group transactions for streaks, one big transaction for percentile).

Lets Arvin *see* when jobs overlap and what happens on failures.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 4: assessment of batch-job thinking; whether idempotency as a concept is understood (subtle); whether the per-group transaction pattern made sense; which failure modes Arvin naturally thought of (good sign if they asked "what if a group crashes?").
- If L5 Q5 is weak (caching strategy), note this for follow-up — shows opportunity for a cost-optimization session.
- Offer to schedule L12 (environment & deployment) — the missing piece: where are these cron jobs deployed, and how do secrets like the database URL get there?
