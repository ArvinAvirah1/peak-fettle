# Dev context — Peak Fettle

Operational guidance for agents working in this repo. Read before debugging builds or touching files. (Added 2026-05-21 after a multi-file corruption incident.)

## 🧭 Which tickets should THIS agent do? — model routing (founder decision, 2026-05-25 LATE-4)

Active backlog: **TICKET-051…062** in `DEV_ROADMAP_2026-05-25-LATE.md` (v25). Pick your lane by the model you are running:

- **Opus** → do **only TICKET-052 and TICKET-053** (the percentile-math + tier-ladder work), then the **final integration + verification pass** over everything merged.
- **Sonnet** → do **everything else** (TICKET-051, 054, 055, 056, 057, 058, 059, 060, 061, 062). Default workhorse lane.
- **Haiku** → **not used** in this plan; if run anyway, mechanical chores only (Outfit token rollout, notification copy, `session_type` SELECT) — never the math/architecture/debugging tickets.

Run order + per-ticket detail + the mandatory parse-sweep "definition of done" are in the **"⚙️ MODEL ROUTING FOR AGENT RUNS"** section of `DEV_ROADMAP_2026-05-25-LATE.md`. The HEAD-blob parse-sweep + `node --check` is required for every ticket on every model.

## ⚠️ This repo lives in OneDrive — it corrupts the working tree and git

The project sits in `…\OneDrive\Documents\Claude\Projects\Peak Fettle`. OneDrive's live sync clobbers files mid-write, including `.git` internals. A single incident (2026-05-21) produced **all** of these at once:

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
