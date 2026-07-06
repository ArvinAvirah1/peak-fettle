# Dev context — Peak Fettle

Operational guidance for agents working in this repo. Read before debugging builds or touching files. (Added 2026-05-21 after a multi-file corruption incident.)

## ⚡ Architecture + dev-efficiency learnings (added 2026-06-14 after the 094-A local-first + overhaul run)

These are the highest-leverage things to know before touching this app. Most of the bugs in the 2026-06-12..14 run were one of the first three.

**1. Local-first is the central invariant — free users make NO personal REST calls.** Tier branch point: `mobile/src/data/backup/tierPolicy.ts` (`isLocalFirst(user)` / `syncsToServer(user)`). FREE (`!is_paid`) = on-device SQLite only (`mobile/src/db/localDb.ts`); PRO = server + PowerSync. There is a tier-branched data layer — use it, never raw `api/*` from a screen/component: `mobile/src/data/{routines,profile,schedule}.ts`, and the `useWorkout*`/`useStreak`/`useInsights`/`useHealthMetrics` hooks. The #1 recurring bug was a screen/hook/component calling `getRoutine`/`getPercentile`/`getConstraints`/etc. directly on mount → for free users that's a failing/slow round-trip (infinite spinners, 500s, slow startup). **Review step:** `grep` new screens for raw `from '../api/` imports of personal-data endpoints; each needs an `isLocalFirst` branch. (Group weekly-signal is the ONE network call allowed on the free path.)

**2. Weight is stored as EXACT kg, not the legacy kg×8.** Local `sets` table (schema **v3**, `mobile/src/db/localSchema.ts` + `migrations.ts`) has `weight_kg REAL` = exact kilograms; the old `weight_raw INTEGER` (kg×8, 0.125 resolution) is lossy and secondary. **Read** via `COALESCE(weight_kg, weight_raw/8.0)`; **write** the exact kg. Convert display↔storage ONLY via `mobile/src/constants/units.ts` (`displayToKg` to store, `kgToInputValue` to prefill an edit field, `parseWeightInput`, `formatWeight`). Both the LOG and the EDIT paths must convert — a missed conversion stored lbs as kg (185 lb → 185 kg). Server `sets.weight_kg` is `NUMERIC`; `weight_raw` (kg×8) is only for the legacy percentile path.

**3. Safe-area does NOT propagate inside a React Native `<Modal>`.** `SafeAreaView` / `useSafeAreaInsets()` around or inside a `<Modal>` does not reliably push content below the Dynamic Island on iPhone — a "fixed" header still sat under the island on-device, twice. **Fix:** apply `paddingTop: Math.max(insets.top, 12)` (from `useSafeAreaInsets()`) directly to the modal's header row. `GestureHandlerRootView` must wrap the app root (`mobile/app/_layout.tsx`) or RNGH gesture components crash.

**4. Prod schema has drifted from `db/schema.sql`; make all DB ops drift-tolerant.** Railway/Supabase prod was built incrementally and is missing/extra-having columns vs the canonical `db/schema.sql`. Migrations that ALTER/DELETE must guard with `to_regclass('public.x') IS NOT NULL` and skip absent tables; **never use `CREATE TEMP TABLE … ON COMMIT DROP`** in a hand-run migration (the SQL editor autocommits between statements and the temp table vanishes → `42P01`) — inline the subquery instead. Server routes should catch `42P01`/`42703` and degrade (e.g. empty 200) rather than 500. `user_percentile_rankings`/`percentile_vectors` are DEPRECATED (percentiles compute on-device via `strengthModelV3.ts`). `db/schema.sql` is the canonical, idempotent source of truth — keep migrations folded back into it (re-running it is the safe "remake"); a missing fold (`group_weekly_signals`) would have lost a feature on rebuild.

**5. Auth cold-start must not block on the network or clear the token on transient failure.** `AuthContext` renders the cached user immediately and refreshes the token in the background (with an ~8s timeout). It clears the stored refresh token ONLY on a definitive `401` — never on a network error / timeout / 5xx, or a flaky server forces re-login on every launch (and stalls startup).

**6. The verification gate is non-negotiable and self-reports are not trusted.** The real DoD: `@babel/parser` parse-sweep of all `.ts/.tsx` under `mobile/app`+`mobile/src` (153 files → 0 failures), `node --check` every server `.js`, `node mobile/src/db/__tests__/migrations.test.js`, and a `tsc --noEmit` delta (baseline ~85 errors, dominated by expo-router typed-route strings + a chart `Value` type — count must not increase; RN ships via Babel so these don't block the build but new ones flag real mistakes). Run this YOURSELF after any multi-agent run — agents that "hit the session limit" often wrote their files before dying, so check the working tree rather than assume nothing changed.

**7. Multi-agent workflow efficiency.** Disjoint file ownership (no two agents edit the same file) avoids conflicts with no worktree isolation needed. The session/agent-spawn quota gets exhausted by big fan-outs — `sonnet` is plenty for these targeted fixes and far less limit-prone; the `Workflow` static check rejects literal `Date.now()`/`Math.random()`/`new Date()` even inside prompt strings (reword them). Resume re-runs only the failed agents (cached prefix returns instantly).

**8. Nothing reaches the device without push + EAS rebuild.** EAS builds from `origin/main`, and Railway deploys on push to `main`. Many "still broken" reports were just the phone running an old build. Order: fix → commit → `git push origin main` (= server deploy) → `eas build` → install → test. A local commit alone changes nothing the user can see.

## 🚀 OTA-first ship path: default to `eas update`, rebuild only for native changes (added 2026-07-06)

Both apps (`mobile/`, `lifeos/`) now ship `expo-updates` (~29.0.18) with `runtimeVersion: { "policy": "fingerprint" }`, `updates.url` set to their EAS project, and eas.json channels `preview`/`production` mapped to the same-named build profiles.

**MANDATORY for every agent: after landing ANY change, classify it and tell the founder explicitly which ship path applies.** Build minutes are the scarce resource — never tell the founder to `eas build` when `eas update` suffices.

- **JS/TS/JS-asset-only change** (screens, hooks, data layer, styles, JS-required images, copy): ship OTA — `cd mobile && eas update --channel production -m "<msg>"` (or `--channel preview` for preview-profile installs; same from `lifeos/`). `eas update` bundles the LOCAL working tree, so no git push is needed for the update itself — but still push for backup + Railway deploy. Installed apps download on the next launch and apply on the launch after that (tell testers: restart twice).
- **Native change → full `eas build` still required:** any added/removed npm dep containing native code, anything in `app.json`/`eas.json`/config plugins/entitlements/Info.plist, icons/splash, fonts embedded via the expo-font plugin, widgets/watch/App Intents/apple-targets, expo SDK upgrades. The fingerprint runtimeVersion is the fail-safe: if the native fingerprint changed, old builds silently ignore the update (no crash) — but nothing ships until a rebuild + push.
- **Mixed change:** rebuild (the JS rides along in the build).
- **Server-only change:** git push (Railway auto-deploys) — no build, no update.
- **One-time bootstrap:** the FIRST build of each app after 2026-07-06 must be a full EAS build — OTA only reaches builds that already contain the expo-updates client. Until that build is installed, `eas update` does nothing visible.

**Fingerprint gotcha (hit 2026-07-06):** the fingerprint is computed from the FOUNDER'S LOCAL project (including `node_modules`) at `eas build`/`eas update` time. After any dependency change lands in package.json/lockfile, the founder must `npm install` locally (mobile/ has .npmrc legacy-peer-deps; lifeos needs `--legacy-peer-deps`) BEFORE building or publishing, or the build fails with "Runtime version calculated on local machine not equal to runtime version calculated during build."

`eas update:list --branch production` shows what's live. Update publishes are near-instant and free vs ~20+ min of build queue — prefer them aggressively.

## 🧭 Which tickets should THIS agent do? — model routing (founder decision, 2026-05-25 LATE-4)

Active backlog: **TICKET-128…146** in `DEV_ROADMAP_2026-07-03-FEATURE-GAPS.md` — see its 🚦 STATUS block (as of 2026-07-04 only 140 [parked on founder go/no-go] and 146 [must run solo, last] remain). The TICKET-051…062 plan below is COMPLETE — historical reference only. Pick your lane by the model you are running:

- **Opus** → do **only TICKET-052 and TICKET-053** (the percentile-math + tier-ladder work), then the **final integration + verification pass** over everything merged.
- **Sonnet** → do **everything else** (TICKET-051, 054, 055, 056, 057, 058, 059, 060, 061, 062). Default workhorse lane.
- **Haiku** → **not used** in this plan; if run anyway, mechanical chores only (Outfit token rollout, notification copy, `session_type` SELECT) — never the math/architecture/debugging tickets.

Run order + per-ticket detail + the mandatory parse-sweep "definition of done" are in the **"⚙️ MODEL ROUTING FOR AGENT RUNS"** section of `DEV_ROADMAP_2026-05-25-LATE.md`. The HEAD-blob parse-sweep + `node --check` is required for every ticket on every model.

## ✅ RESOLVED 2026-06-14: repo moved out of OneDrive — most "mount" workarounds below are now OBSOLETE

**The repo now lives at `C:\Users\aavir\dev\Peak Fettle` (a normal, non-synced path).** A full multi-day session (2026-06-12..14) ran entirely there with **no** corruption and **none** of the old mount limitations: the `Write`/`Edit` tools work on files of any size (no ~33 KB truncation), `rm`/`mv`/`git mv` work, and plain `git add`/`git commit` works (no temp-index / loose-ref lock-bypass needed). **Default to the normal tools.** The OneDrive/agent-mount sections below (heredoc-only writes, `rm`-blocked, `.git/index.lock` bypass, the temp-`$GIT_INDEX_FILE` commit dance) are **historical** — keep them only as a reference if a session ever runs against the old `…\OneDrive\…` path again. The parse-sweep DoD, EAS-push rule, and the PUSH-001/002 lessons below all STILL apply.

### Historical: this repo used to live in OneDrive — it corrupted the working tree and git

The project previously sat in `…\OneDrive\Documents\Claude\Projects\Peak Fettle`. OneDrive's live sync clobbered files mid-write, including `.git` internals. A single incident (2026-05-21) produced **all** of these at once:

- Source files **truncated mid-token** (cut off inside a string, object, or comment).
- **Duplicated `StyleSheet.create` blocks** with a stray premature `});` and orphaned/mangled property fragments (hit `rankings.tsx`, `groups.tsx`).
- `// E-003: was N` annotation comments dropped **mid-line**, commenting out the real code after them (hit `ThemeSelector.tsx`).
- Corrupt git **index** (`bad index file sha1 signature`) and **multi-pack-index** (`improper chunk offset`).

The git **object store survived** — committed blobs were intact and recoverable. Only the working tree + git metadata were damaged.

**Real fix:** move this repo to a non-synced path (e.g. `C:\Users\aavir\dev\Peak Fettle`) and use GitHub for backup. This *will* recur otherwise.

## When a build fails with a syntax or ENOENT error, suspect corruption — check broadly

- Don't trust the single file the error names. **Parse-sweep all of `mobile/app` and `mobile/src`** with `@babel/parser` (`jsx` + `typescript` plugins) — Metro stops at the first broken file and hides the rest. (Incident: the reported error was 1 file; 10 were actually broken.)
- Recover a truncated file from the intact commit: `git show HEAD:<path> > <path>`. **Verify the HEAD blob parses first** — some files were corrupted in the commit too and need a manual fix instead.
- For duplicated-block corruption, the first complete object is usually correct; truncate the file at its legitimate closing `});` to drop the duplicate.

## Git repair (no history loss)

- Corrupt index: `GIT_INDEX_FILE=/tmp/newidx git read-tree HEAD` then `cat /tmp/newidx > .git/index`.
- Corrupt multi-pack-index: `git config core.multiPackIndex false` then `git multi-pack-index write`.

## Filesystem constraints on the agent mount

- **`rm` and `mv` fail** with "Operation not permitted." You cannot delete or rename files on the mount — only **overwrite contents in place** (`cat tmp > target`). This also breaks `git checkout`/`git mv` (they rename internally), so use `git show HEAD:<path> > <path>` to restore files.
- The **Write tool silently truncates files larger than ~33 KB.** Write/repair large files via bash (heredoc or `cat`) on the mount, then verify the byte/line count.
- Always back up files (e.g. to `/tmp`) before overwriting.

## EAS builds from `origin/main`, not your working tree

EAS Build pulls the **git remote**, so committing locally is not enough — changes (including `assets/icon.png` and other referenced assets) must be **pushed** before a build sees them. Symptom of an unpushed change: `withIosDangerousBaseMod: ENOENT … './assets/icon.png'` during prebuild even though the file exists locally. Before triggering a build: confirm `git status -sb` is not "ahead of origin/main", and that the asset/config commits are on the remote.

## Committing on this mount: `.git/index.lock` can't be removed

`rm` is blocked on the mount, so a leftover `.git/index.lock` (git fails to unlink its own lock here) permanently breaks `git add`/`git commit` against the default index — you'll see `fatal: Unable to create '.git/index.lock': File exists`. Work around it with a **temp index** in `/tmp` (its lock lives in `/tmp`, which is writable):

```
export GIT_INDEX_FILE=/tmp/pf.idx && rm -f /tmp/pf.idx
git -c core.multiPackIndex=false read-tree HEAD
git -c core.multiPackIndex=false add <path>
git -c core.multiPackIndex=false commit -m "..."
```

`unable to unlink … tmp_obj_*` / `HEAD.lock` warnings during the commit are expected on the mount and do **not** mean failure — verify with `git log --oneline -1`. (Used for commit `1879c5b`, 2026-05-22.)

**Update (2026-05-24): the `git commit` step above can still fail; use plumbing instead.** Two extra gotchas hit during commit `263556d`:
- `rm -f /tmp/pf.idx` can itself fail with `Operation not permitted` after a sandbox restart (the old temp index is owned by a different uid). Don't `&&`-chain on it — just use a **fresh unique** index name: `IDX=/tmp/pf_$(date +%s%N).idx`.
- A leftover `.git/index.lock` **and** `.git/refs/heads/main.lock` make `git commit` *and* `git update-ref` fail with `Another git process seems to be running` — and neither lock can be `rm`'d on this mount. `git commit` also needs an identity, which isn't configured in the sandbox.

Reliable sequence that bypasses every lock (`git commit` and `update-ref` both touch lock files git can't unlink here; writing the loose ref by hand does not):

```
IDX=/tmp/pf_$(date +%s%N).idx
export GIT_INDEX_FILE=$IDX
export GIT_AUTHOR_NAME=ArvinAvirah1 GIT_AUTHOR_EMAIL=aavirah23@gmail.com
export GIT_COMMITTER_NAME=ArvinAvirah1 GIT_COMMITTER_EMAIL=aavirah23@gmail.com
git -c core.multiPackIndex=false read-tree HEAD
git -c core.multiPackIndex=false add <path>
TREE=$(git -c core.multiPackIndex=false write-tree)
COMMIT=$(git -c core.multiPackIndex=false commit-tree $TREE -p HEAD -m "msg")
printf '%s\n' "$COMMIT" > .git/refs/heads/main   # overwrite-in-place is allowed; the .lock is ignored
git -c core.multiPackIndex=false log --oneline -1   # verify
```

**Pushing is not possible from the sandbox** — `git push` fails `Host key verification failed` (no SSH creds). The founder must `git push origin main` from their own machine, and **EAS won't see the fix until that push lands** (see the EAS section above).

## Errors found in prior iterations — and the rule that prevents them

- **PUSH-002 (P0, introduced by commit `40bce69`, fixed `263556d` 2026-05-24):** the `40bce69` "NEW-003/004 dispatcher rewrite" was **committed truncated** — OneDrive cut `push-dispatcher.js` mid-comment at line 224 (`// … now one per chun`), dropping the *entire* dispatch loop, the summary log, `module.exports`, and the CLI block. The file threw `SyntaxError: Unexpected token (225:75)` on `require`, so the cron crashed on load and **every push silently failed** — the same end symptom as PUSH-001 but a different cause. Roadmap v22 mis-recorded this file as "full rewrite, reviewed manually" and declared "no code defects remain"; in reality the corruption was sitting in HEAD. The helper functions (`sendExpoChunk`, `markSent`, `markFailed`) survived intact above the cut, so the fix reconstructed only the missing `run()` loop on top of them.
  - **Best practice — a "reviewed manually" claim in a roadmap is not verification.** Before trusting any roadmap that says the backlog is clean, **re-run the `@babel/parser` sweep over `mobile/app`, `mobile/src`, AND `peak-fettle-agents/server`** and `node --check` every server `.js`. The sweep is cheap and catches truncation that a prose review misses. (This pass found the break in <1 min after the roadmap had declared the code clean.)
  - **Truncation can land *in a commit*, not just the working tree.** Don't assume `git show HEAD:<path>` gives a good file — verify the HEAD blob parses. Here the last *good* copy was two commits back (`1879c5b`); the intervening "rewrite" commit was already corrupt. Walk `git log --format=%h -- <path>` and parse each blob to find the newest one that compiles.
  - **Same silent-failure signature, recurring root cause.** Push delivery has now broken twice (PUSH-001 transport mismatch, PUSH-002 truncation). Until on-device push is verified post-EAS-build, treat the dispatcher as unproven and parse-check it every pass.

- **PUSH-001 (P0, introduced by TICKET-024, fixed 2026-05-22):** the mobile app registered with `Notifications.getExpoPushTokenAsync()` (an *Expo* token, `ExponentPushToken[...]`) but the cron `push-dispatcher.js` sent it to **FCM's Legacy HTTP API** (`fcm.googleapis.com/fcm/send`). FCM rejects an Expo token as `InvalidRegistration`; the dispatcher then nulled `users.fcm_token`, so every push silently failed and the token was wiped after the first attempt. Fixed by switching the dispatcher to the **Expo Push API** (`https://exp.host/--/api/v2/push/send`), which accepts the Expo token directly.
  - **Best practice — token format and send transport must agree.** `getExpoPushTokenAsync()` ⇒ Expo Push API; `getDevicePushTokenAsync()` ⇒ raw FCM/APNs. Never send one to the other's endpoint. Whenever client token acquisition and the server send path are written by different changes, explicitly check they use the *same* transport.
  - The DB column is still named `fcm_token` for migration compatibility but now stores an **Expo** token — don't let the column name imply the transport.
  - **Auto-clearing tokens on send failure is dangerous when the transport itself is wrong:** a config/transport bug masquerades as "stale tokens" and silently destroys every user's registration. Before nulling a token on error, be confident the error is genuinely `DeviceNotRegistered`/`NotRegistered`, not a blanket rejection of the token *format*.

## 🧰 Skills & tools available — use them at the right moment (added 2026-05-29)

This repo now ships a dev toolkit. **Before starting a run, read `.claude/AGENT_TOOLKIT.md`** — it maps each skill/plugin to the exact stage of our dev loop (plan → build → verify → gate → commit) and to the Opus/Sonnet/Haiku lanes. Per-tool install/usage detail is in `.claude/toolkit/` (one file each); install everything via `.claude/install-toolkit.sh` (plus the in-Claude-Code `/plugin` lines it prints).

Quick pointers:
- **Plan first** with `superpowers` / `compound-engineering`; run full lanes with `GSD`. Sprinting to code is how every past P0 happened.
- **Verify** with `/review` + the project skill **`peak-fettle-verify`** (the @babel parse-sweep — this is the real definition of done, not a prose "reviewed manually"). Gate math/migrations/auth/push with **`/ultra-review`** and a **`/codex:review`** second opinion.
- **Commit** with the project skill **`peak-fettle-commit`** (the lock-bypassing plumbing already documented above, packaged as a skill).
- **Context/memory** for long audit runs: `context-mode` + `claude-mem`. **Cost**: `codeburn`, `morph`, `caveman`.
- **Design/research/media/legal**: `frontend-design`, `exa`+`firecrawl`, `higgsfield`, `security-guidance`, `legal`.

**Unclear product intent? Stop and ask the founder — never guess vision (TICKET-071).**
