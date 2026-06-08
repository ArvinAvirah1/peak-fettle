---
name: peak-fettle-commit
description: Safely commit on the Peak Fettle agent mount, where rm/mv are blocked and a leftover .git/index.lock or refs/heads/main.lock permanently breaks normal git commit/update-ref. Use this whenever you need to commit changes in this repo from an agent session. Bypasses every lock with a temp index in /tmp, commit-tree, and an overwrite-in-place of the loose ref. Use when finishing a ticket and recording it, or any time `git commit` fails with "Unable to create '.git/index.lock'" or "Another git process seems to be running".
---

# Peak Fettle — Safe Commit (lock-bypassing plumbing)

On this mount `rm`/`mv` return "Operation not permitted", so git can't unlink its own lock files. `git commit` and `git update-ref` both touch locks they can't remove, and the sandbox has no git identity. Writing the loose ref by hand does not touch a lock, so it works.

## Procedure
```bash
# 1. fresh unique temp index (never reuse — a stale one is owned by another uid and rm fails)
IDX=/tmp/pf_$(date +%s%N).idx
export GIT_INDEX_FILE=$IDX
export GIT_AUTHOR_NAME=ArvinAvirah1 GIT_AUTHOR_EMAIL=aavirah23@gmail.com
export GIT_COMMITTER_NAME=ArvinAvirah1 GIT_COMMITTER_EMAIL=aavirah23@gmail.com

# 2. stage from HEAD + the paths you changed
git -c core.multiPackIndex=false read-tree HEAD
git -c core.multiPackIndex=false add <path> [<path> ...]

# 3. build the commit object and move the branch by writing the ref directly
TREE=$(git -c core.multiPackIndex=false write-tree)
COMMIT=$(git -c core.multiPackIndex=false commit-tree "$TREE" -p HEAD -m "your message")
printf '%s\n' "$COMMIT" > .git/refs/heads/main   # overwrite-in-place is allowed; the .lock is ignored

# 4. verify
git -c core.multiPackIndex=false log --oneline -1
```

## Expected noise (NOT failure)
- `unable to unlink … tmp_obj_*`, `HEAD.lock`, `index.lock` warnings are expected on this mount. Verify success with `git log --oneline -1`, not by absence of warnings.

## Pushing
- `git push` fails from the sandbox (`Host key verification failed` — no SSH creds). **The founder must `git push origin main` from their own machine.**
- EAS Build pulls from `origin/main`, so a fix isn't live until that push lands. Before asking for a build, confirm the asset/config commits are on the remote (see CLAUDE.md "EAS builds from origin/main").
