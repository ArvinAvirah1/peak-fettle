# Peak Fettle — Ultrareview 2026-08-02

> **Post-review status addendum (what already landed, same day):**
> - **PF-R1 (Home self-notify loop) + PF-R2 (on-device rankings source): FIXED, committed `73b0479`, pushed.** Includes the streak-badge table watch (PF-R11's core) and the empty-state copy rework.
> - **PF-R3 + PF-R4 (verifier follow-ups: local-first-gated silent watch; UNDISCLOSED-sex 50/50 mixture): FIXED, committed `f9c3c7b`, pushed.**
> - **PF-R5 (webhook fail-open): FIXED in the working tree** (revenuecat.js now 503s when `REVENUECAT_WEBHOOK_AUTH` is unset, dev escape hatch `REVENUECAT_WEBHOOK_ALLOW_UNVERIFIED=true`, env vars documented in `.env.example`). Left UNCOMMITTED with the rest of the RevenueCat batch so it ships together — safe because the route isn't mounted until server/index.js is committed.
> - **DB idempotency P1: FIXED in `f9c3c7b`** — schema.sql is now fully re-runnable (IF NOT EXISTS everywhere, DROP-guarded triggers/policies); stale `db/APPLY_2026-06-10_pending.sql` archived.
> - **Memory directory: all 14 audit findings applied** (2 files deleted, 3 condensed, 7 updated, index rebuilt with sections).
> - **Marketing site: `/compare` shipped live** (commit `ee3d0c3`) — honest table vs Hevy/Strong/Boostcamp/Fitbod/Caliber + a different-category band for Fitness+/Whoop, backed by sourced `src/lib/competitors.ts`.
> - **Full DoD gate after all fixes: parse-sweep 267/0 · invariant sweep clean · migrations 28/28 · server node --check clean · tsc 63 = baseline 63.**
> - **Ship path for the mobile fixes: OTA-eligible (JS-only) — BUT the working tree carries the uncommitted RevenueCat batch, and `eas update` bundles the LOCAL tree.** Do NOT `eas update` until you either (a) finish the RevenueCat landing (npm install → commit → EAS rebuild, which carries these fixes anyway), or (b) temporarily stash the RevenueCat files.
> - Remaining open tickets below (PF-R6…): not yet fixed — prioritized in the report.

---

## 1. Executive summary

**Both founder-reported P0s are root-caused with high confidence, and fixes for both are already sitting APPLIED but UNCOMMITTED in the working tree** (a concurrent fixer landed them mid-review; adversarial verifiers reviewed the diffs and confirmed they are correct). What remains is: fix two small defects the fixer introduced (PF-R3, PF-R4), run the full verification gate, commit carefully, push, and ship OTA.

**What is broken:**
- **Home staleness (P0):** a self-notify write loop in the local DB layer permanently starved the history watcher's debounce; the focus/finish fallbacks were structurally dead. Fix applied in tree (PF-R1). Two residual P1s (dead workout-finish callback PF-R9, one-shot streak PF-R11) are needed for full correctness.
- **Rank/percentile (P0):** the Rankings screen had literally no on-device data source — the server pipeline was dropped 2026-06-12 and the promised local pipeline was never built; all on-device model UI was gated behind a permanently empty server list. Fix (localRankings.ts synthesis) applied in tree (PF-R2).
- **The uncommitted RevenueCat billing batch contains a P1 security hole:** the webhook fails OPEN when its secret env var is unset (the current expected state per launch memory) — one unauthenticated POST grants any account Pro. This MUST be fixed before any push to main (push = Railway prod deploy), because a sweeping commit could carry the untracked billing files (PF-R5).
- **Two silent data-destruction chains:** Pro rest-day upsert can convert a real logged workout and cascade-delete its sets (PF-R6); sign-out→sign-in auto-backs-up an EMPTY database over a free user's only cloud copy (PF-R7), and the backup encryption key is never cleared on logout (PF-R8 — must land WITH/AFTER PF-R7 or it makes things worse).
- **Several shipped-but-dead features:** Progress charts are no-op stubs (PF-R13), the workout share card is unreachable, "last performed" and the watch mirror match a column that never contains routine names, group weekly-signal counts app-opens as workouts.

**What is solid:** the weight/units fixed-point invariant (v18) is cleanly implemented end to end (only three cosmetic P3s); the local-first invariant holds everywhere audited (CI sweep clean, 99 files); the DB schema/migration story is healthy (28/28 local migration tests pass, all server migrations folded, drift guards pervasive, live prod probes healthy); auth cold-start invariant #5 is preserved including through the new billing diff; server auth.js and groups.js admin paths are well hardened.

**Process warnings for the immediate fix session:** (1) run the full DoD gate (@babel parse-sweep, `node --check`, `npm run invariants`, migrations test, tsc delta) before committing the fixer batch; (2) per the repo memory, inspect the staged column before committing — this index has carried stale agent-session deletions that caused a prod outage; (3) commit ordering matters: PF-R5 must land in the same or an earlier push as any commit that includes the billing server files; PF-R7 before/with PF-R8.

---

## 2. ROOT CAUSE: the two founder-reported P0s

### P0-A — Home screen not reflecting logged data

**Confirmed root cause (verified against HEAD 6451b65, every link checked):** a four-part chain, free tier only:
1. `useWorkout.ts:180` subscribes `useTableChange(['sets','workouts'], load, 400ms)`; `load()` calls `ensureLocalWorkoutForDay`, which unconditionally ran an UPDATE (`adoptLegacyRows`, `localWorkouts.ts:59-64`) and an `INSERT…WHERE NOT EXISTS` (`localWorkouts.ts:82-88`), both notifying `tables:['workouts']`.
2. `localDb.execute` (`localDb.ts:233-239`) notified listeners UNCONDITIONALLY — even for 0-change writes.
3. `notify()` fans out to the emitting hook's own watcher (no self-exclusion) → a permanent ~2 Hz write/reload loop starting at app open.
4. `useTableChange` was a pure trailing debounce with no max-wait, so `useWorkoutHistory`'s 900 ms watcher (`useWorkoutHistory.ts:346-349`) was reset every ~450 ms and **could literally never fire** — Recent Activity, sessions, streak-from-history, and routine folders froze at the mount snapshot, plus continuous SQLite writes and ~2 Hz Home re-render churn.

The fallbacks could not save it: logging happens in the always-mounted `WorkoutLoggerHost` overlay ON the Home tab (no focus transition, so the focus refetch never fires), and the host's `onFinish` is only invoked from the share card's `onClose` — which verification found is UNREACHABLE (`handleFinishWorkout` is dead code; the real finish path never calls it — see PF-R9).

**THE fix (already applied, uncommitted — verified correct; do NOT re-implement):**
1. `localDb.ts` — `execute()` notifies only when `runAsync` `result.changes > 0` (breaks the loop at the source; safe repo-wide).
2. `localWorkouts.ts` — read-first fast paths in `adoptLegacyRows`/`ensureLocalWorkoutForDay`, keeping the atomic `INSERT…WHERE NOT EXISTS` for the true-create path (race safety preserved).
3. `useTableChange.ts` — non-resetting `maxWait = 2×debounceMs` backstop so sustained write cadence can never starve a consumer.

**Ship:** run the DoD gate → commit → `git push` → `cd mobile && eas update --channel production` (JS-only, no rebuild). Add the small regression test the verifier suggested (0-change execute does not notify; useTableChange fires within 2×debounceMs under sustained notifications). Note: full founder-visible correctness also needs PF-R9 (Pro/finish refresh) and PF-R11 (streak badge).

### P0-B — Rank/percentile not computing

**Confirmed root cause:** the Rankings screen's ONLY data source is `usePercentile()` → server response (`rankings.tsx:814`). Free/local-first users deliberately short-circuit to `null` (`usePercentile.ts:43-49` — no network, by invariant), and the Pro path reads `user_percentile_rankings`, which is dead: the percentile batch cron is disabled (`server/index.js:157-164`), the table was dropped by the founder-gated `20260612_drop_percentile_rankings.sql` (or frozen pre-2026-06-12 if not applied), and the route degrades 42P01 to an empty 200. So `rankings === []` for every free/new user, and the screen renders the "log 3 to unlock" empty state forever. Critically, ALL the on-device strengthModelV3 UI (TierLadderCard, BodyweightPromptCard, hero card, `localPercentiles` overlay) sits INSIDE the `rankings.length > 0` branch, and `localPercentiles` takes a *server ranking row* as input — the on-device model was wired as an overlay, never a source. When the tables were dropped ("percentiles compute on-device"), the local pipeline was never built. A compounding confirmed P1: the sex gate compared `'M'/'F'` while profiles can only contain `'MALE'/'FEMALE'/'UNDISCLOSED'` (DB CHECK-enforced), so even with rows, every on-device percentile returned null.

**THE fix (largely applied by the fixer, uncommitted — verified sound by the auditor with two residual defects):** new `mobile/src/data/localRankings.ts` synthesizes `PercentileRanking`-shaped rows from local SQLite sets — best e1RM per competition lift via `COALESCE(weight_kg, weight_raw/8.0)` + Epley (`oneRm.ts`), lift mapping via the server's exact `REPLACE(LOWER(name),' ','_')` normalization, user-scoped, guarded by `kind='lift', reps>=1, weight>0`. `usePercentile` returns these rows for local-first users and as the fallback when the Pro server list is empty (server-first for legacy Pro). Refinements that are part of this ticket: persist confirmed 1RMs into the existing local `user_confirmed_1rm` table (today the typed kg is DISCARDED for free users — `rankings.tsx:795-812`); feed Home's `bestPercentile` (`index.tsx:515`) from the same local computation instead of the dead `getPercentile()`; distinguish "no competition lifts logged" from "add bodyweight + sex" in the empty state and retire the "Pending weekly update" copy (there is no weekly update); rewrite the false doc comment at `usePercentile.ts:30-35`. **Before committing this batch, PF-R3 and PF-R4 must be fixed** (defects in/omissions from the applied fixer code). Ship: JS-only → `eas update`, no rebuild.

---

## 3. TICKETS

Ship-path key: **OTA** = JS-only `eas update` · **EAS** = full rebuild required · **SERVER** = git push to main (Railway deploy) · **MIGRATION** = hand-run SQL. Findings without an adversarial verdict are marked **[unverified]**. No finding was dropped as `isReal===false`; the one refuted headline (annual-plan webhook claim) survives as its verified copy-defect residue (PF-R22).

### The P0 batch (commit together after the DoD gate)

**PF-R1 — P0 — Home self-notify loop / debounce starvation — `mobile/src/db/localDb.ts:229` (+ `localWorkouts.ts`, `useTableChange.ts`)**
As detailed in Root Cause P0-A: unconditional notify on 0-change writes + unconditional writes in `ensureLocalWorkoutForDay` + trailing-only debounce = permanent starvation of the Home history watcher, ~2 Hz write/render churn all session, mid-session staleness for every free user.
The three-pronged fix is already applied and verified in the working tree. Do not re-implement. Finish the ship path: full DoD gate, commit, push, `eas update --channel production`. Add the two regression assertions (no-notify on 0-change; maxWait fires under sustained cadence). **OTA.**

**PF-R2 — P0 — Rankings has no on-device data source — `mobile/app/(tabs)/rankings.tsx:814`, `mobile/src/hooks/usePercentile.ts:43`, new `mobile/src/data/localRankings.ts`**
As detailed in Root Cause P0-B. Absorbs (same root defect, dedup): Home `bestPercentile` dead dependency (`index.tsx:515`), false doc comment (`usePercentile.ts:30`), free-tier confirmed-1RM discard + permanent "pending next run" pill (`rankings.tsx:795`, persist to local `user_confirmed_1rm`), empty-state/pending copy rework.
Fixer implementation verified sound (user-scoped query, sanctioned COALESCE read, conservative lift classifier). Finish PF-R3/PF-R4, then ship in the same batch as PF-R1. **OTA.**

**PF-R3 — P2 (blocks the PF-R2 commit) — fixer's new usePercentile table watch lacks `enabled: localFirst` — `mobile/src/hooks/usePercentile.ts:81`**
The new `useTableChange(['sets'], fetchRankings, {debounceMs:900})` has no `enabled` gate, so once a Pro user visits Rankings (tabs stay mounted), every set-write burst fires a `GET /percentile` REST call — violating the app-wide "Pro watches off by design" pattern — and `fetchRankings` sets `isLoading(true)` on each fire, re-skeletoning the mounted screen for both tiers ~1 s after every logged set.
Pass `{ enabled: localFirst, debounceMs: 900 }`, and add a `fetchRankings({silent:true})` variant for watch-triggered reloads that skips the loading state so fresh rows replace old ones without a skeleton flash. **OTA (with PF-R2).**

**PF-R4 — P2 (residual of a confirmed P1, blocks PF-R2 completeness) — UNDISCLOSED-sex users still null out — `mobile/app/(tabs)/rankings.tsx:341` (+ `strengthModelV3.ts`)**
The applied sex-normalization fix maps MALE/FEMALE correctly but keeps `if (!modelSex) return nulls` — so 'UNDISCLOSED', a first-class onboarding option, still falls through to the dead server percentile and renders the permanent "Pending weekly update" pill, the exact symptom this work was meant to kill, now scoped to one cohort.
Per the verified revised fix: export a shared `normalizeSex` from `strengthModelV3.ts`; only early-return when sex is null/undefined; otherwise call `computeRankedPercentile`/`computePercentile` with `(normSex ?? sex)` so UNDISCLOSED flows into the model's built-in D5 50/50 M/F mixture — exactly how TierLadderCard on the same screen already handles it. **OTA (with PF-R2).**

### Confirmed P1s — server/security (must precede or accompany the billing push)

**PF-R5 — P1 — RevenueCat webhook fails open when secret unset: unauthenticated tier mutation — `peak-fettle-agents/server/routes/revenuecat.js:160` + `server/index.js:193`** *(found independently by 3 agents; verified twice)*
When `REVENUECAT_WEBHOOK_AUTH` is unset the route warns and PROCESSES the event anyway, on a public unthrottled mount. Any user (who knows their own users.id, which the client ships) can `POST {"event":{"type":"INITIAL_PURCHASE","app_user_id":"<uuid>"}}` for free Pro; group members can see peer UUIDs (groups.js:196) and forge EXPIRATION downgrades. The env var is absent from `.env.example` and per launch memory is NOT yet set — the bootstrap window is the dangerous window. Currently uncommitted, so P1 not P0 — it becomes P0 on push.
Adopt the server-dim verified fix (both verifiers rejected the NODE_ENV-gated variants — NODE_ENV is unreliably set in this deployment; index.js:53 treats unset as development): **fail closed unconditionally** — empty secret → `503 {error:'webhook_not_configured'}` with a loud error log (503 is retried by RevenueCat, so events queued during misconfiguration re-deliver once ops sets the secret); optional dev escape hatch only via an explicit `REVENUECAT_WEBHOOK_ALLOW_UNVERIFIED === 'true'`. Also: add `REVENUECAT_WEBHOOK_AUTH`/`REVENUECAT_SECRET_KEY` to `.env.example`; add a generous rate limiter (~600/min — RC delivers from few egress IPs sharing one bucket); optionally dedupe on `event.id` and log tier flips at error level. Operational order: set the env var on Railway BEFORE enabling the webhook in the RC dashboard. **SERVER.**

**PF-R6 — P1 — Rest-day flow converts a real logged workout and cascade-deletes its sets (Pro) — `peak-fettle-agents/server/routes/workouts.js:262`** *(verified; TOCTOU critique of the original fix incorporated)*
`POST /workouts/rest-day` pre-checks only for an existing rest_day row, then `ON CONFLICT (user_id, day_key) DO UPDATE SET session_type='rest_day'` — silently rewriting a real workout row. `DELETE /rest-day/today` then deletes that row, and `sets.workout_id` is ON DELETE CASCADE: log workout → tap "rest day" → tap "undo" = silent permanent loss of the day's sets. Verified reachable from Home for Pro users; free users are safe (local branch differs).
Verified atomic fix: delete the racy pre-check; make the insert the guard — `INSERT … ON CONFLICT (user_id, day_key) DO NOTHING RETURNING …`; on zero rows, SELECT the existing row's session_type and return 409 (`rest day already logged` vs `workout_already_logged_today`). DELETE is then safe unchanged. Optional hardening: map the new 409 to a specific client alert; have `POST /workouts`' DO UPDATE also re-SET `session_type='workout'` to self-heal historical conversions; audit prod for rest_day rows that have sets. **SERVER.**

### Confirmed P1s — data loss (strict ordering: PF-R7 before/with PF-R8)

**PF-R7 — P1 — Sign-out→sign-in silently overwrites a free user's ONLY cloud backup with an empty DB — `mobile/src/data/backup/backupManager.ts:373` + `peak-fettle-agents/server/routes/backup.js:199`** *(auditor finding; every chain link read directly)*
Logout wipes the local DB AND `last_backup_at`; on next sign-in the 20 s launch auto-backup trigger fires (null last-backup → proceed), `backupNow` has no empty-export or existing-blob guard, and the server PUT upserts unconditionally with no version retention — destroying the user's last copy of all training data on a routine sign-out/sign-in. Nothing prompts restore first, so the ~20 s race is unwinnable.
Client (primary): before an automatic upload, count rows in workouts/sets/routines; if empty AND `GET /user/backup-blob/status` says a blob exists, skip and warn (manual "Back up now" may proceed after explicit confirm); ideally prompt "Restore your backup?" on fresh sign-in with empty local DB + existing blob. Server (cheap backstop): in the PUT, copy the existing object to `backup.prev.json` before overwrite; optionally add a plaintext `row_count` envelope field and reject `row_count:0` over a non-trivial blob. **OTA (client) + SERVER (backstop). MUST land before or with PF-R8.**

**PF-R8 — P1 — Backup encryption key/KeyWrap never cleared on logout: next account encrypts under the prior user's key — `mobile/src/data/localReset.ts:146` (`keyStore.ts:114/160`)** *(verified end-to-end; consequence worse than filed — B's first auto-backup silently encrypts under A's key with no recovery code ever shown to B)*
`clearDataKey()`/`clearKeyWrap()` have ZERO call sites. After A signs out and B signs in, `ensureKeyAndCode` finds A's material on the happy path; B's cloud backups become unrestorable-by-B while A's code can unwrap them. iOS keychain persists across reinstall, widening the window.
Verified fix: in `clearAllLocalPersonalData()`, add two individually try/catch-guarded awaits of `clearDataKey()` and `clearKeyWrap()` (covers sign-out, definitive-401, and account deletion); update the module header. Sequencing: land WITH/AFTER PF-R7, otherwise clearing the key makes the post-re-login empty auto-backup mint a FRESH key and orphan the old recovery code too. Mirror the audit in `lifeos/src/data/backup`. **OTA.**

### Confirmed P1s — app correctness

**PF-R9 — P1 — Workout-finish callback is dead code; Home never refetches on finish OR minimize — `mobile/src/components/WorkoutLoggerHost.tsx:2057` (dead fn at :1759, minimize at :1846)** *(verified; worse than filed)*
`onFinish` fires only from the share card's `onClose`, but the share card is only set by `handleFinishWorkout` — which is NEVER called; the live finish path (`confirmAndFinish` → `terminateSession`) never fires `onFinish`. So Home's `handleLoggerFinish` and workout-day's `onFinish={load}` never run even on explicit Finish; the TICKET-131 share card is also unreachable (separate feature regression). Minimize only flips visibility, and since the logger is a Modal hosted BY Home, no focus event ever fires — Pro Home (watches off by design) stays stale after finish AND minimize until a tab-switch or restart.
Verified fix: (A) rewire the real terminating flow — either restore the share card in `confirmAndFinish`'s confirm (folding teardown into `ShareCardSheet.onClose` so `onFinish` fires there) or minimally call `onFinish?.()` at the end of `terminateSession`; **founder decision required** on resurrecting vs deleting the share card (product vision — never guess); delete or wire the dead `handleFinishWorkout` either way. (B) Add an `onMinimize?` prop invoked in `handleMinimize`, wired on Home to the existing throttled refetch. (C) Free tier needs nothing beyond PF-R1's maxWait backstop. **OTA.**

**PF-R10 — P1 — Group weekly-signal counts app-opens as workouts (workouts_done AND streak_weeks inflated) — `mobile/src/hooks/usePowerSyncLog.ts:516` (+ :531)** *(verified, extended by the verifier)*
`workouts_done = SELECT COUNT(*) FROM workouts WHERE day_key >= monday` — but `ensureLocalWorkoutForDay` mints an empty row on every app open, rest_day rows count, historic duplicate rows double-count, and there's no user_id scope. Real scenario: 2 app-open days + 1 logged set → `hit_goal=true` in every group. The `streak_weeks` aggregate two lines down has the identical defect (any-row-in-week counts).
Verified fix: `SELECT COUNT(DISTINCT w.day_key) … WHERE day_key >= ? AND (user_id = ? OR user_id IS NULL OR user_id = '') AND (session_type='rest_day' OR EXISTS (SELECT 1 FROM sets s WHERE s.workout_id = w.id))`; apply the same has-sets-or-rest-day + user-scope filter to the streak_weeks input query. **Founder decision:** whether a logged rest day should count toward the group workouts goal (streaks deliberately count rest days; an accountability goal arguably should not). Pure local reads riding the one sanctioned POST — invariant-safe. **OTA.**

**PF-R11 — P1 — Free-tier streak badge loads once per mount and never refreshes — `mobile/src/hooks/useStreak.ts:214`** *(verified; scope wider than filed — also the share-card streak and the Profile badge)*
`useLocalStreak` has no table watch, no refetch export; Home's focus/refresh/finish handlers don't touch it. A free user logging their first workout of the week keeps seeing the cold-start value ("0 — start a streak") until full app restart, on Home, the finish share card, AND the Profile tab. (`historyStreak` is not a substitute — it's capped at a 30-day window.)
Verified fix inside the hook so all three call sites heal: add `useTableChange(['workouts'], () => void loadLocal(), { enabled: localFirst, debounceMs: 900 })`; skip `setLocalLoading(true)` on watch-triggered reloads (no badge flicker); optionally expose `refetch` and wire it into Home's `handleLoggerFinish`. Depends on PF-R1 (already applied). **OTA.**

**PF-R12 — P1 — Nav-param handler never re-arms: second "Start" on the same routine/plan/exercise silently does nothing — `mobile/app/(tabs)/index.tsx:719`** *(verified)*
`handledParamRef` is set when a param is consumed and never reset; Home is never unmounted, so the second consecutive same-key navigation (Routines "Start" on the same routine, Plans "Start this workout" — a constant key, so ANY second use per session — library "log this exercise", bundled-program day) switches tabs but never opens the logger.
Verified fix: at the top of the params effect, when NO param is active (checking `''` and `'1'` explicitly — setParams yields `''`), reset `handledParamRef.current = null` and return; keep the per-branch writes (setParams is async, the ref still suppresses double-fire). Comment the ref so a future branch that forgets to clear params fails loudly in review. **OTA.**

**PF-R13 — P1 — Progress charts are no-op stubs: headed blank sections — `mobile/app/progress.tsx:41`** *(verified with corrections: 2 blank sections for everyone, up to 4 for Pro-with-cardio; stubs date to commit 965a6be which deleted the victory-native import)*
`VictoryChart` renders an empty View and the rest return null; "Sessions per week" and "Weekly volume" render headers over ~200 pt of blank space for all users; mileage/pace additionally blank for Pro-with-cardio. All data plumbing computes and silently discards.
Verified fix: delete the stubs and add one small in-house react-native-svg bar-chart component (copy the `LiftProgressChart`/`BodyweightChart` pattern) reused for the three bar sections, plus a Polyline for pace (inverted y; keep formatPace labels). Data is already fetched and tier-branched — no data-layer changes. If deferring: hide ONLY sections 2 and 3 (do not remove `fetchProgressData` — consistency and PRs depend on it; cardio already self-gates). **OTA.**

**PF-R14 — P1 — Workout History is a stale one-shot mount load — `mobile/app/workout-history.tsx:258`** *(verified; exact class fixed on Home in d7ea3ff, this screen was missed)*
Mount-only fetch; the screen stays mounted while the user edits/deletes sets in workout-day or adds a backdated workout from its own header CTA, then pops back to stale counts/volumes/heatmap.
Verified fix: mirror Home's throttled `useFocusEffect` refetch (2 s throttle; fires on initial focus so the mount load is preserved) AND add `useTableChange(['workouts','sets'], () => fetchPage(0), { enabled: localFirst })` for live free-tier updates; `fetchingRef` already serializes. Same-class follow-ups inside this ticket: `progress.tsx:507` (P2 [unverified] — same `useFocusEffect` treatment) and `groups.tsx:255` (P3, weekly-cadence data — fix opportunistically). **OTA.**

### P2 — billing/RevenueCat client (these ride the billing EAS rebuild — react-native-purchases is a native dep; `npm install` locally before building per the fingerprint gotcha)

**PF-R15 — P2 [unverified] — No client entitlement↔tier reconciliation in either direction — `mobile/src/context/AuthContext.tsx:398/712`, `mobile/app/_layout.tsx:206`**
Two composed findings: (a) after EXPIRATION flips the server to free, no client path ever updates the cached user — a lapsed subscriber keeps `is_paid=true` and gets 403s instead of a graceful downgrade; (b) conversely, `completeProPurchase`'s optimistic Pro flip silently REVERTS on next cold start if the server never converged (webhook/secret unset — the current state): a charged customer becomes free with their migrated server data unread.
Fix: on cold start after the silent token refresh, background-refetch the profile (or reuse `POST /purchases/sync`) and merge tier/is_paid via `updateUser`, running the existing downgrade-to-free handling on paid→free; and in the boot effect, after `syncPurchasesIdentity`, if `hasProEntitlement(info) && !user.is_paid`, fire-and-forget `syncPurchases()` + updateUser (self-heal). List `REVENUECAT_WEBHOOK_AUTH`/`REVENUECAT_SECRET_KEY` as launch-gate env vars in the founder checklist. **EAS (rides billing build).**

**PF-R16 — P2 [unverified, found by 3 agents] — TRANSFER events unhandled: one subscription yields two Pro accounts forever — `peak-fettle-agents/server/routes/revenuecat.js:207`**
Restore on a second account emits TRANSFER (not EXPIRATION for the old id); the old account stays paid indefinitely, the new one only heals via /purchases/sync.
Fix: handle `event.type==='TRANSFER'` — for each UUID in `transferred_to`, `setUserTier(id,'paid')`; for each in `transferred_from`, `setUserTier(id,'free',{guardComp:true})`; reuse UUID_RE and the fast-200 semantics. **SERVER.**

**PF-R17 — P2 [unverified, found by 2 agents] — Restore/purchase treat ANY active entitlement as Pro — `mobile/app/paywall.tsx:143` (+ :122)**
`handleRestore` gates on `entitlements.active` being non-empty rather than `hasProEntitlement(info)`; `handlePurchase` finalizes on any non-null customerInfo. The moment a second entitlement exists in RC (promo, cosmetic), a non-Pro restore runs full Pro finalization — a tier-corruption path.
Fix: use the already-exported `hasProEntitlement(info)` in both paths; alert purchaseFailed when the purchase's returned info lacks the Pro entitlement. **EAS (rides billing build).**

**PF-R18 — P2 [unverified] — Entitled-but-unfinalized user gets a broken Subscribe button and no resume path — `mobile/app/paywall.tsx:229`**
If `finalize()` fails offline and the user quits, next visit shows plan cards; re-purchase throws a store error, and the only recovery is guessing to tap Restore.
Fix: when `usePercentile`— correction — when `usePurchases().isPro` is true and `!user?.is_paid`, render a dedicated "Finish setting up Pro" state whose CTA calls `finalize()` directly. **EAS (rides billing build).**

**PF-R19 — P2 [unverified] — Failed/raced RC logIn never retried in-session: purchase lands on an anonymous RC id, tier never flips — `mobile/src/services/purchases.ts:156`**
On logIn failure there is no "next auth-state change" for an already-signed-in user; a purchase then arrives as `$RCAnonymousID` (webhook ignores it), /purchases/sync looks up an empty subscriber, and the eventual TRANSFER is also ignored (see PF-R16). Charged customer, server stays free.
Fix: expose async `ensureIdentity(userId)` and await it in the paywall purchase path before `purchasePackage` (block CTA / surface error on failure); PF-R16 covers late convergence. **EAS (rides billing build).**

**PF-R20 — P2 [unverified] — Webhook 200-ACKs transient DB errors, permanently dropping entitlement events — `peak-fettle-agents/server/routes/revenuecat.js:211`**
A pool/connection blip during INITIAL_PURCHASE is ACKed and never redelivered; convergence then waits a month for RENEWAL.
Fix: return 500 for connection-level/transient pg errors (ECONNREFUSED, 57P01, 08xxx, pool timeout) so RC retries; keep 200-ACK only for deterministic data errors (22P02, malformed payload). **SERVER.**

**PF-R21 — P2 [unverified] — No `event.environment` check: SANDBOX purchases mutate production tier — `peak-fettle-agents/server/routes/revenuecat.js:186`**
TestFlight/App Review sandbox events flip real `users.tier`, and fast-expiring sandbox subs then flip testers back to free — tier flapping.
Fix: read `event.environment`; ignore SANDBOX in production or gate behind an explicit `ALLOW_SANDBOX_ENTITLEMENTS` flag for the TestFlight period; log environment on every processed event. **SERVER.**

**PF-R22 — P2 (verified; original P1 headline refuted) — Paywall copy misdescribes the auto-renewing annual sub — `mobile/src/i18n/locales/en/screens2.json:566/592` (+ comments in `revenuecat.ts:34`, `usePurchases.ts:53`)**
pf_pro_yearly lives in an ASC subscription group, so it IS auto-renewable and the webhook handles it fine — but `annualTerms` ("One payment upfront for 1 year.") and `legalBlurb` claim a non-renewing one-off: an App Review 3.1.2 disclosure-rejection risk and a year-2 surprise-renewal trust issue. Do NOT add NON_RENEWING_PURCHASE to PAID_EVENT_TYPES (would latently grant Pro for future consumables).
Fix: reword both strings to state auto-renewal until cancelled (>=24 h before period end); fix the two stale code comments; founder may confirm the ASC product type before shipping. **OTA (JS-only).**

**PF-R23 — P2 [unverified] — RevenueCat SDK phones home at every cold start for FREE users; module docs contradict the code — `mobile/app/_layout.tsx:206`, `mobile/src/services/purchases.ts:17`**
The boot effect runs configure + `logIn(user.id)` for all tiers — a per-launch third-party call carrying the user UUID on the free path, contradicting the module's own "paywall-surface only" invariant doc (CI sweep is technically satisfied; startup is not blocked).
Fix: move identity binding to the paywall surface (usePurchases initial-load effect + completeProPurchase), keep `syncPurchasesIdentity(null)` on sign-out, delete the boot effect (ensureConfigured self-heals lazily) — or, if the founder wants boot-time entitlement freshness (note PF-R15's self-heal argues for it for PAID users), gate the effect on `user?.is_paid` and amend the doc headers either way (folds the related P3 doc-comment finding). Reconcile with PF-R15 in one design decision. **EAS (rides billing build).**

### P2 — server

**PF-R24 — P2 [unverified] — POST /exercises lets any authed user pollute the GLOBAL exercise library — `peak-fettle-agents/server/routes/exercises.js:183`**
Inserts straight into the shared `exercises` table (served publicly by GET /exercises and shipped to every PowerSync user via the global_library bucket) with no per-user scoping, no content vetting, no delete/report path; dedupe is case-sensitive so near-duplicates land too.
Fix (preferred): per-user custom exercises — drift-guarded `created_by UUID NULL` migration, stamp on POST, filter GET/search/sync-rules to `created_by IS NULL OR created_by = <user>`. Minimum hardening: case-insensitive unique (expression index on LOWER(name)), per-user daily creation cap, attribution side table. **SERVER + MIGRATION.**

**PF-R25 — P2 [unverified] — POST /workouts and cardio endpoints have no 42703/42P01 drift guard — `peak-fettle-agents/server/routes/workouts.js:56` (+ :304, :348)**
The workout-create INSERT references routine_id/routine_name unguarded — on a drifted DB the single most critical Pro write path 500s (the exact failure mode in the workout-routine-link memory); /mileage-weekly and /pace-trend likewise, violating CLAUDE.md invariant #4. workouts.js is the outlier — sets/groups/user/revenuecat all implement the tiered fallback.
Fix: wrap the primary INSERT with a legacy-column retry on 42703/42P01 (mirror routes/sets.js POST); have the cardio endpoints degrade to their empty shapes instead of `next(err)`. **SERVER.**

**PF-R26 — P2 [unverified] — invariant-sweep.js does not scan src/hooks, src/context (nor src/data, src/services) — `peak-fettle-agents/server/scripts/invariant-sweep.js:83`**
The CI gate protects screens/components but not the layer where the #1 recurring bug class actually lives — a new hook/context value-importing api/* on mount ships silently. (All current api-importing hooks were manually verified to branch correctly.)
Fix: add `mobile/src/hooks`, `mobile/src/context` (auditor: also `src/data`, `src/services`) to LOCAL_FIRST_SCAN_DIRS, and add the audited hooks/contexts to LOCAL_FIRST_AUDITED with per-entry comments per the sweep's protocol. **SERVER (repo tooling, git push).**

### P2 — mobile app

**PF-R27 — P2 [unverified] — Local history/streak reads not user-scoped: shared-device account bleed — `mobile/src/hooks/useWorkoutHistory.ts:168` (+ `useStreak.ts:193`)**
The free-path workouts SELECTs have no user_id predicate; after sign-out/sign-in as a different account, Recent Activity, PR chips, sessions-this-month, and the streak include the previous account's rows. (The usePowerSyncLog instances are fixed by PF-R10's scoped queries.)
Fix: add `AND (user_id = ? OR user_id IS NULL OR user_id = '')` (the adoptLegacyRows convention) to `useWorkoutHistory.load` and `useLocalStreak.loadLocal`, passing `user.id`. **OTA.**

**PF-R28 — P2 [unverified] — Local rest-day INSERT creates a second workouts row and OR IGNORE masks failures — `mobile/app/(tabs)/index.tsx:590`**
`ensureLocalWorkoutForDay` already made today's row, so the rest-day INSERT adds a sibling; undo deletes only the rest_day row; row-counting consumers double-count the day (partially masked by PF-R10's DISTINCT fix), and OR IGNORE reads failure as success.
Fix: add `setLocalSessionType(dayKey, userId, 'rest_day'|null)` to localWorkouts.ts that UPDATEs the canonical day row (ensure-first), and route handleLogRestDay/handleUndoRestDay through it instead of raw SQL in the screen. Client counterpart of PF-R6. **OTA.**

**PF-R29 — P2 [unverified] — restoreFromCloud: a stale/foreign keychain key hard-fails restore; the typed recovery code is never attempted — `mobile/src/data/backup/backupManager.ts:300`**
The keychain path takes strict precedence; a decrypt mismatch (guaranteed producible pre-PF-R8) throws out of the whole restore even while the user holds a valid code — the documented "universal fallback" is unreachable.
Fix: wrap the keychain attempt in its own try/catch; on decrypt failure with `opts.recoveryCode` present, fall through to the recovery-code branch (decrypt + unwrap + re-save key/wrap); only surface "enter your recovery code" when none was supplied. Pair with PF-R7/PF-R8 in the backup batch. **OTA.**

**PF-R30 — P2 [unverified] — Bodyweight history keeps the OLDEST 104 weeks; new entries vanish after 2 years — `mobile/src/data/bodyweight.ts:53`**
`ORDER BY week_key ASC LIMIT 104` returns the first rows; past 104 entries every NEW week is beyond the limit — the Trends chart freezes at the 2-year-old window while latest/current-week reads still work, looking like corruption.
Fix: `ORDER BY week_key DESC LIMIT ?` then `.reverse()` (or subquery with outer ASC). **OTA.**

**PF-R31 — P2 [unverified] — Rest-timer notification/Live Activity promises race start/cancel — `mobile/src/hooks/useRestTimer.ts:237`**
Cancel before the schedule promise resolves leaves the OS notification live (phantom "rest complete" mid-set); rapid restart stores the OLD id so the new notification becomes uncancelable; the Live Activity has a parallel double-start leak.
Fix: monotonically increasing generation counter bumped in start()/cancel(); in each `.then`, if the captured generation is stale, immediately cancel/end the just-created resource instead of storing it. **OTA.**

**PF-R32 — P2 (verified, downgraded from P1) — "Last performed" is permanently dead: matches routine names against session_type — `mobile/src/data/routines.ts:257`**
Exhaustive write-site audit proves session_type only ever holds NULL/'rest_day'/server-enum; routine names live in `routine_name`. The routine-card subtitle silently never renders for free users; the doc comment at :230 is false.
Verified fix: `SELECT routine_name, MAX(created_at) AS last_at FROM workouts WHERE routine_name IS NOT NULL AND TRIM(routine_name) <> '' GROUP BY routine_name` with an honest row type (mirror routineHistory.ts); prefer `MAX(day_key)` so backdated sessions don't report "today" (verify relativeFromIso handles it); rewrite the stale comment. No index needed. **OTA.**

**PF-R33 — P2 (verified, downgraded from P1) — Watch mirror doubly broken: dead session_type match + UTC day key — `mobile/src/hooks/useWatchMirror.ts:105` (+ :159)**
Same dead match as PF-R32 (mirror ALWAYS shows 0 logged sets), plus `toISOString().slice(0,10)` (UTC) vs local-date day_key writers — west of UTC queries tomorrow from late afternoon; east of UTC mornings would FALSE-match yesterday's session post-fix.
Verified fix: match on `routine_name` with a READ-ONLY fallback row query (do NOT call ensureLocalWorkoutForDay — the mirror path must not mint rows); replace the UTC key with `toDateKey(now)` from dateHelpers; fix the stale header comment. **OTA.**

**PF-R34 — P2 (verified, downgraded from P1) — BodyweightPromptCard gated behind rankings.length > 0 — `mobile/app/(tabs)/rankings.tsx:916`**
The model's required bodyweight input is never collectable on the Rankings screen for local-first users (it IS collectable on Trends, so not a hard deadlock — hence P2).
Verified fix (part of/after PF-R2): hoist the card out of the ternary and render it once above the error/loading/empty branches — it self-hides when loading or when this ISO week has an entry; keep TierLadder/hero inside the populated branch. **OTA (with PF-R2).**

**PF-R35 — P2 (verified, downgraded from P1) — "Today's lifts" modal renders raw exercise UUIDs — `mobile/app/(tabs)/index.tsx:809`**
`name: s.exercise_id` — the modal shows "2b8d9443-… 3 sets" (and a blank row for ''-id bundled sessions).
Verified fix: extend the existing exerciseNames import with `getExerciseNameMap`/`displayExerciseName`, load the map in an effect keyed on todaySets, and map `displayExerciseName(s.exercise_id, exNameMap)` in the memo (dep array updated). Local SQLite only. **OTA.**

**PF-R36 — P2 [unverified] — Hero and Overall cards read only the (dead) server percentile field — `mobile/app/(tabs)/rankings.tsx:544` (+ :602)**
After PF-R2 these summary cards would still render nothing (or numbers inconsistent with the per-lift cards) because they ignore the on-device values the RankingCards merge in.
Fix: compute `localPercentiles` once per ranking at screen level and pass merged `localLens1 ?? percentile` into both cards. Ship with the PF-R2 batch. **OTA.**

**PF-R37 — P2 [unverified] — History/Progress render kg regardless of lbs preference — `mobile/app/workout-history.tsx:444`, `mobile/app/progress.tsx:438`**
Volume rows use a "{{volume}} kg" i18n string and PRCard uses a kgSuffix key, while routine-history correctly uses `formatWeight` — inconsistent with each other and the units invariant.
Fix: render via `formatWeight(kgValue, unitPref, …)` from units.ts and drop the kg-hardcoded i18n suffixes (update a11y labels the same way). **OTA.**

**PF-R38 — P2 [unverified] — workout-day local path doesn't normalize ISO-timestamp date params — `mobile/app/workout-day.tsx:314`**
The server path defends with `date.slice(0,10)`; the local path binds the raw param, so legacy links show "No workout logged" for free users despite existing data, and the backdate CTA is suppressed too.
Fix: first line of `fetchLocalDayData`: `const dayKey = date.slice(0,10)` and bind it. **OTA.**

**PF-R39 — P2 [unverified] — routine-history swallows fetch failures into "No sessions logged" — `mobile/app/routine-history.tsx:65`**
try/finally with no catch: a Pro network failure renders the empty state — telling a user their history is empty when the fetch failed; FlatList also keys by dayKey (duplicate-key warnings possible).
Fix: catch into an error state with a Retry view (match workout-history's pattern); key rows by `${dayKey}-${index}` or a session id. **OTA.**

**PF-R40 — P2 [unverified] — Plan generate/regenerate failures are silent — `mobile/app/(tabs)/plans.tsx:1082`**
The catch only alerts on 'paid_tier_required'; any other failure ends with the spinner stopping and zero feedback; `generateError` is destructured but never rendered.
Fix: add an else branch with haptics.error() + Alert (reusing existing keys), or render `generateError` in a banner like localGenError — no failure path may end without a user-visible signal. **OTA.**

**PF-R41 — P2 [unverified] — LocalPlanModal double/triple top inset; three pageSheet modals, three different treatments — `mobile/app/(tabs)/plans.tsx:677`**
SafeAreaView edges=['top'] AND explicit insets.top padding inside an iOS pageSheet (already offset) stacks ~120 pt of dead space, per the recorded Fabric raw-inset behavior; PlanDetailModal and rankings ConfirmSheet differ again.
Fix: standardize — `SafeAreaView edges={['bottom']}` only; header paddingTop `Platform.OS==='ios' ? 12 : Math.max(insets.top,12)`; apply to all three; verify once on a Dynamic Island device. **OTA (device verify).**

**PF-R42 — P2 [unverified] — csv-import/templates/glossary wrap header-screens in raw SafeAreaView (known ~60 pt dead-band class) — `mobile/app/csv-import.tsx:429` (+ `templates.tsx:440`, `glossary.tsx:182`)**
All three have headerShown:true yet apply a top-inset SafeAreaView — the exact recorded new-arch regression pattern; exercise-library was already fixed to edges=['bottom'] with a warning comment.
Fix: replace with the shared ScreenLayout `edges={['bottom']}` matching exercise-library; device-verify. **OTA (device verify).**

**PF-R43 — P2 [unverified] — LifeOS card CTA opens a placeholder App Store URL in production — `mobile/app/(tabs)/profile.tsx:126`**
`idPLACEHOLDER` lands nearly all users on an App Store error page; nothing gates the CTA until the founder replaces it.
Fix: render the button only when `lifeosInstalled` is true or the URL no longer contains 'PLACEHOLDER'; keep the streak line either way. **OTA.**

### P3 — all [unverified] unless noted

**PF-R44 — P3 — Midnight rollover splits logger vs Today card — `mobile/src/hooks/usePowerSyncLog.ts:215`.** todayKey is memoized for the always-mounted host's lifetime, so post-midnight sets write to yesterday's workout while the Today card reads today's. Fix: derive todayKey per initWorkout run and re-init on AppState 'active' when `getTodayKey() !== workout?.day_key`. **OTA.**

**PF-R45 — P3 — Confirmed-1RM Set bleeds between accounts — `mobile/app/(tabs)/rankings.tsx:768`.** The AsyncStorage load only sets state when raw is truthy; a user switch keeps the prior user's Set. Fix: always `setConfirmedThisSession(new Set())` first, then load. (Pairs with PF-R2's local confirm persistence.) **OTA.**

**PF-R46 — P3 — Pull-to-refresh spinner sticks on rejection — `mobile/app/(tabs)/index.tsx:673`.** No try/finally around `Promise.all` of three refetches. Fix: `try { await Promise.allSettled([...]) } finally { setRefreshing(false) }`. **OTA.**

**PF-R47 — P3 — Hardcoded English dates/weekdays/locales — `mobile/app/(tabs)/index.tsx:136` (+ `routines.tsx:81`, `health.tsx:61/154/234/343`).** Fix: locale-aware `toLocaleDateString(i18n.language, …)` everywhere; drop 'en-GB'/'en-US' literals. **OTA.**

**PF-R48 — P3 — Profile toggles seeded from `user` only at first render — `mobile/app/(tabs)/profile.tsx:941`.** unitPref/1RM-confirm/notification toggles never resync when the user object refreshes. Fix: sync effect keyed on the four user fields (optimistic handlers already write through updateUser, so it converges). **OTA.**

**PF-R49 — P3 (found by 2 agents) — Hardcoded 'OK' in the paywall success alert — `mobile/app/paywall.tsx:97`.** Fix: `t('common:ok')` (add key if absent). **EAS (rides billing build).**

**PF-R50 — P3 — Insights Pro upsell routes to the Plans tab, not /paywall — `mobile/app/insights.tsx:269`.** Highest-intent conversion moment dead-ends. Fix: `router.push('/paywall')`; copy is a founder call. **OTA.**

**PF-R51 — P3 — csv-import silently aborts on unreadable file — `mobile/app/csv-import.tsx:375`.** Fix: set uploadError to a "could not read file" i18n string before the early return. **OTA.**

**PF-R52 — P3 — workout-day memos omit `t` from deps — `mobile/app/workout-day.tsx:683`.** Stale-language strings after a runtime language switch (same in workout-history fetchPage). Fix: add `t` to the dep arrays. **OTA.**

**PF-R53 — P3 — Dormant PowerSync connector drops weight_centi/weight_unit (+note/flags) — `mobile/src/db/connector.ts:139`.** Dead today (stubbed client; syncEngine is the live upload path) but a silent exact-entry loss if ever reconnected. Fix: add the guarded passthrough — or delete the dead upload path with a pointer to syncEngine. **OTA.**

**PF-R54 — P3 — PATCH /sets/:id RETURNING omits weight_centi/weight_unit — `peak-fettle-agents/server/routes/sets.js:291`.** Inconsistent with POST/GET; a future caller merging the response wholesale would regress display to lossy kg. Fix: add the two columns with a 42703 tiered retry mirroring POST. **SERVER.**

**PF-R55 — P3 — Tautological ternary in voice-intent weight conversion — `mobile/src/lib/intents/intentHandlers.ts:164`.** Both branches are `rawWeight`; behavior correct, reads as an abandoned edit on an invariant-critical line. Fix: `displayToKg(rawWeight, deps.unitPref)`. **OTA.**

**PF-R56 — P3 — useGroups/useGroupDetail load() has no cancellation guard — `mobile/src/hooks/useGroups.ts:112` (+ :253).** setState after unmount; deadline rejection leaves a sticky error a late success never corrects. Fix: per-effect `cancelled` flag checked before each setState (the usePurchases pattern). **OTA.**

**PF-R57 — P3 — Unbounded SELECT over every set for an exercise — `mobile/src/data/localProgress.ts:30`.** Multi-year main-thread marshal per chart open; siblings bound theirs. Fix: 2-year floor or newest ~1500 via DESC subquery, per the localContext convention. **OTA.**

**PF-R58 — P3 — maybeAutoBackup has no single-flight — `mobile/src/data/backup/backupManager.ts:369`.** First-run launch timer + background event can run two encrypt+PUT pipelines; the first-ever backup could even mint two data keys. Fix: module-level in-flight promise coalescing in backupNow (the ensureExerciseCatalogCached pattern). Land with the PF-R7 backup batch. **OTA.**

**PF-R59 — P3 — purchasesAvailable() true when only the JS package resolves — `mobile/src/services/purchases.ts:113`.** Dev/Expo Go gets the generic error path instead of the purpose-built unavailable state. Fix: verify the native side at configure time and demote `_mod` to null on native-module failure. **EAS (rides billing build).**

**PF-R60 — P3 — Drift-retry in setUserTier drops the comp_pro guard for ANY 42703/42P01 — `peak-fettle-agents/server/routes/revenuecat.js:89`.** An unrelated missing column (e.g. updated_at) strips a comped user's tier on EXPIRATION. Fix: inspect the error for 'comp_pro' before dropping the guard; otherwise retry with the guard retained and only the offending column removed. **SERVER.**

**PF-R61 — P3 — GET /sets?exercise_id pagination dead: nextCursor always null — `peak-fettle-agents/server/routes/sets.js:345`.** History silently truncates at the default 50. Fix: mirror the all-sets branch's limit+1 sentinel protocol. **SERVER.**

**PF-R62 — P3 — POST /workouts reads tier via supabaseAdmin/PostgREST and double-runs the session count — `peak-fettle-agents/server/routes/workouts.js:79`.** Needless second network dependency + duplicated COUNT on the hot path. Fix: `pool.query('SELECT tier …')` and hoist one shared countRealSessions() result. Fold into the PF-R25 change. **SERVER.**

---

## 4. DB health and memory-structure verdicts

**DB health: HEALTHY, with stated blind spots.** From the db-audit dimension's evidence: all 11 live server migrations are folded into `db/schema.sql` (line-verified, including 20260721 weight_centi at schema lines 7027-7049; the two unfolded files are intentionally founder-gated destructive ops); no missing folds found; zero banned `CREATE TEMP TABLE … ON COMMIT DROP` patterns repo-wide; drift guards (`to_regclass`, 42P01/42703 degrade) are pervasive across routes plus a global error handler; the local schema chain v1→v18 has no holes (base-DDL vs guarded-migration diff clean) and `migrations.test.js` passes 28/28 including fresh-install-to-v18 and all upgrade paths; live unauthenticated probes are healthy (`/health` 200 with tierToggle, `/exercises` 200 with 223 rows proving 20260607 is applied on prod, `/percentile` 401s correctly). Caveats: the db-audit findings array was TRUNCATED in this compiler's input (the auditors reference a schema-idempotency issue downgraded P1→P2 and deprecated `percentile_vectors` still shipped in sync-rules' global_library — recover that finder's full output before closing the dimension); the live Supabase schema was not directly inspected (no credentials), so whether the 20260721 server migration is actually applied is unknown — code degrades correctly either way. Auditor 2 partially closed the sync-rules gap: the `tier='paid'` bucket gate is correctly shaped (free users get zero personal buckets — the local-first invariant holds on the sync wire), with the noted wrinkles that user_groups exposes member user_ids and global_library still ships `select * from exercises` (feeds PF-R24) and percentile_vectors.

**Memory structure: APPEARS SOUND, AUDIT INCOMPLETE.** The memory-audit finder's output never reached this compiler (and per auditor 2 it was truncated mid-third-verdict even upstream). What the auditors could verify: the three visible memory-audit findings were spot-checked and sound; MEMORY.md's index matches reality; the 2026-08-01 launch-state memory is consistent with git status (untracked RevenueCat files, react-native-purchases ^10.6.0 in package.json). Action: re-collect or re-run the memory-audit before applying any memory edits — otherwise its verified-stale items (referenced but not delivered: dead pre-rewrite hashes in `local-first-lag-and-dup-fixes.md`, `094a-half-shipped-refactor-diagnosis.md`, the routines-perf memory) will be silently dropped. Do not edit memory files based on this report alone.

---

## 5. Coverage notes — what was NOT reviewed

- **Missing/truncated inputs to this compilation:** the db-audit dimension's findings array (truncated mid-scope-statement — scope evidence used above, findings unrecoverable here); the memory-audit dimension's entire output; any website-research output (hence `WEBSITE_DATA_JSON: null`). Recover these before closing the review.
- **lifeos/ app: entirely unaudited** by every dimension. Known follow-up: its `src/data/backup/keyStore.ts` has the same dead clear exports as mobile (mirror PF-R7/PF-R8 there).
- **Runtime/on-device behavior:** the whole review is static analysis. Nothing was reproduced on a device; the safe-area fixes (PF-R41/42) and the P0 fixes need one on-device pass.
- **Prod state:** no authenticated endpoint was probed; live Supabase schema not inspected; RevenueCat dashboard config, Railway env vars, and the actual ASC product configuration are unverifiable from the repo (PF-R5/PF-R22 carry the operational checklists).
- **Partially covered code:** WorkoutLoggerHost's full ~2100-line body beyond the finish/minimize/log paths; syncEngine flush internals; `mobile/src/data/schedule.ts`/`profile.ts`; TierLadderCard internals and shareCardPercentile; the 22 pre-existing local-first allowlisted files (spot-checked, not re-audited); ~16 screens skim-only (groups, plan-survey, training-survey, health-metrics, measurements, one-rm, data-export, exercise-library, cosmetics, diagnostics, glossary, progress-photos, recovery-code, splash/intro, auth pair) — auditor spot-samples found no missed P0/P1 there; server files not line-read by the server dim were largely closed by auditor 2 (auth.js solid, groups.js admin paths solid, csvImport tier-gated), with the two real gaps promoted to tickets (PF-R7 server half, PF-R24).
- **Verification state:** auditors parse-checked the 15 new/changed working-tree files (clean) and ran node --check on revenuecat.js, but the FULL DoD gate (parse-sweep of mobile/app + mobile/src + server, `node --check` all server .js, `npm run invariants`, `node mobile/src/db/__tests__/migrations.test.js`, tsc --noEmit delta vs ~85 baseline) has NOT been run against the final fixer batch — it must be, per CLAUDE.md #6, before any commit.
- **Process items for future runs (from the auditors):** promote "separate bug spotted" asides inside adversarial verdicts to first-class tracked findings automatically (the PF-R7 data-loss chain almost slipped through as a verdict footnote); any review of a working tree that adds files under peak-fettle-agents/server must include a server-routes dimension; extend the invariant sweep per PF-R26.