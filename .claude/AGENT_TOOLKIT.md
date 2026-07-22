# Agent Toolkit — when to use which skill/plugin (Peak Fettle)

**Read this with `CLAUDE.md`.** `CLAUDE.md` tells you how to survive this repo (corruption, git locks, parse-sweeps, model routing). This file tells you **which tool to reach for at each moment** of a dev run. Per-tool install + usage detail lives in `.claude/toolkit/` (one file per tool); install everything with `.claude/install-toolkit.sh`.

The golden rule still wins: **no tool replaces the mandatory parse-sweep + `node --check` definition of done.** Superpowers/GSD/Codex/ultra-review make you *faster and safer*; they do **not** exempt you from the HEAD-blob parse sweep over `mobile/app`, `mobile/src`, and `peak-fettle-agents/server` (see `CLAUDE.md` -> "reviewed manually is not verification", L-014, CORRUPT-001).

---

## The Peak Fettle dev loop -> tool per stage

| Stage | Use | Why here |
|-------|-----|----------|
| **0. Resume context** | `claude-mem` (auto), `context-mode` | A new session shouldn't re-learn the OneDrive/push/percentile history. claude-mem re-injects it; context-mode keeps the session alive for 2-3 hr audit runs. |
| **1. Plan the ticket** | `superpowers` (`/brainstorm`, `/write-plan`), `compound-engineering` | Plan-first is non-negotiable here -- every past P0 (PUSH-001/002, CORRUPT-001) came from sprinting to code. ~80% plan/review, 20% execute. |
| **2. Multi-ticket / autonomous run** | `GSD` | When running a whole lane (e.g. Sonnet doing 051,054,055,056,057,058), GSD spawns a fresh sub-agent per ticket so context rot doesn't silently drop a requirement mid-backlog (scope-reduction detection ~= the v22 "declared clean while broken" failure). |
| **3. Write code** | `morph` (Fast Apply / WarpGrep), `caveman` (optional) | morph speeds mechanical edits/searches across the large RN tree; caveman trims agent chatter to save tokens on long runs. Neither changes review duties. |
| **4. Self-review** | `/review` (always), project skill `peak-fettle-verify` | `/review` after every ticket. Then run the parse-sweep skill -- this is the step that actually catches OneDrive truncation. |
| **5. Hard gate before merge** | `/ultra-review`, `/codex:review` | Required for **math/correctness, migrations, auth, and the push pipeline** (TICKET-052/053 percentile math, any `migrations/*.sql`, `routes/auth.js`, `cron/push-dispatcher.js`). Codex gives a cross-model second opinion. |
| **6. Stuck debugging** | `/codex:rescue` | Use when a fix isn't converging (e.g. the Rankings crash, TICKET-051) -- hand it to a second model rather than thrashing. |
| **7. Commit** | project skill `peak-fettle-commit` | Encodes the temp-index + `commit-tree` + write-ref plumbing from `CLAUDE.md` that bypasses the unremovable `.git/index.lock`. |
| **8. Cost check** | `codeburn` | Run `npx codeburn` after big runs to see token spend by ticket and trim waste before the next pass. |

---

## Tool-by-tool: when it fires on THIS project

### Methodology / process
- **superpowers** -- default for any ticket that touches logic, math, schema, or the push path. Skip the ceremony only for one-line copy/token chores (the Haiku lane in `CLAUDE.md`).
- **compound-engineering** -- use its Plan->Work->Review->Compound loop and **write learnings back into `dev_learnings.md`** every pass. That file is our compounding memory; keep the L-### series growing.
- **GSD** -- turn on for full-lane / overnight autonomous runs. Off for a single small ticket (overhead not worth it).

### Verification (most important on this repo)
- **`/review`** -- every ticket, every model. Free.
- **`/ultra-review`** -- gate for TICKET-052, TICKET-053, anything in `migrations/`, `routes/auth.js`, `routes/plans.js` billing/tier checks, and `cron/push-dispatcher.js`. Needs Claude Code >= 2.1.86 and a signed-in Claude account. Budget 10-20 min; runs in the background.
- **`/codex:review` / `/codex:adversarial-review`** -- second-model pass on the percentile math and tier-ladder cutoffs (independent check of our DOTS/Wilks/sex-only models).
- **`peak-fettle-verify`** (`.claude/skills/peak-fettle-verify`) -- the @babel/parser sweep + `node --check`. **This is the definition of done.** Never declare a backlog clean without it.
- **`security-guidance` + `/security-review`** -- run before any launch/build, and on the companion app (sensitive mental-health data).

### Speed / cost
- **morph** -- Fast Apply + WarpGrep across `mobile/` and `peak-fettle-agents/`; Flash Compact for long sessions. Needs `MORPH_API_KEY` (paid).
- **context-mode** -- keep raw command/parse-sweep output out of context (a full-repo babel sweep dumps a lot). Big win on the audit tickets (TICKET-064+).
- **claude-mem** -- persistent project memory across sessions; a new run starts already knowing the corruption/push/percentile history.
- **caveman** -- optional token trim on verbose runs.
- **codeburn** -- `npx codeburn`, press `O`, paste suggestions back in. Keeps the audit run affordable.

### Authoring / design / research
- **skill-creator** -- formalize our SOPs into skills (done: verify + commit; next candidates: "EAS pre-build check", "migration safety check"). Drop an SOP in and let it package the skill.
- **frontend-design** -- set-logging visual polish (TICKET-057), tier-ladder UI (TICKET-053), the new companion app UI, and `marketing-site/`. Pairs with the already-available `theme-factory`.
- **exa + firecrawl** -- research stack for `docs/archive/workout_research/` (strength-curve / percentile literature) and competitor analysis. Exa finds the best sources semantically; firecrawl extracts clean content. Both need API keys.
- **higgsfield** -- generate marketing/app-store imagery, logo variant explorations (see `logos/`, `Peak Fettle logos.html`), companion-app illustration. Connect via Settings -> Connectors (no API key).
- **legal** -- draft/refresh privacy policy, ToS, and -- critically -- the **mental-health disclaimers + crisis-resource copy** for the companion app. Not legal advice; a human reviews before publishing.
- **buildpartner.ai** -- optional `/bp:expert-advice` for product/marketing/launch calls.

---

## Model-lane reminders (defer to `CLAUDE.md` if these ever conflict)
- **Opus** -- math/architecture/correctness + final integration & verification pass. Always pairs with `/ultra-review`.
- **Sonnet** -- default workhorse lane for everything else. superpowers + `/review` + `peak-fettle-verify` every ticket.
- **Haiku** -- mechanical, fully-specified chores **only**. Never the math/architecture/debugging tickets. caveman+morph fine; never skip the parse-sweep.

## Hard "do not" list
- Do **not** skip `peak-fettle-verify` because a framework "reviewed" the code (L-014).
- Do **not** trust `git show HEAD:<path>` blindly -- verify the blob parses (CORRUPT-001).
- Do **not** reintroduce mock/stub fallbacks to "make it work" (L-003, L-010, L-016, L-021, L-022, L-024).
- Do **not** auto-null a push token on a blanket send failure (L-013 / PUSH-001).
- Do **not** ship a `RETURNING`/`SELECT` that references an unapplied migration column (L-017, L-024).
- When **product intent is unclear, stop and ask the founder** -- do not guess vision (see TICKET-071).
