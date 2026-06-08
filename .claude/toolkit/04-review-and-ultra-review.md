# /review and /ultra-review (built into Claude Code)

**Nothing to install.** These are native Claude Code commands. Just type them in the prompt.

## /review

Runs a structured code review on what you just built — bugs, edge cases, design issues. Runs locally, fast, costs only your normal usage tokens. Use it for fast feedback on everything.

```
/review
```

## /ultra-review

Uploads your branch to a cloud sandbox and spins up a fleet of reviewer agents in parallel (logic, security, performance, edge cases). Every reported bug must be independently reproduced and verified first, so you get confirmed bugs, not style nitpicks or false positives. Use it before merging anything important (big refactors, payments, auth, database migrations).

```
/ultra-review
```

## Requirements

- Claude Code **v2.1.86 or later**.
- Must be **signed in with a Claude account** — an API key alone won't work for `/ultra-review`.
- `/ultra-review` can take ~10–20 minutes but runs in the background, so you can keep working.

## Cost

- `/review` — free beyond normal token usage.
- `/ultra-review` — **not free.** Pro and Max plans get 3 free runs to try; after that roughly **$5–$20 per run** depending on size (pricing may change).

## Related (optional)

`/security-review` is also built in for a focused security pass.

**Source:** https://code.claude.com/docs (Claude Code official docs)
