# DEV PROMPT — Revision Phase Kickoff (2026-05-29)

**Run model:** Opus (coordinator). **Spawn:** Sonnet sub-agents for the per-module sweeps. **Haiku:** not used.

---

## Paste this at the start of a FRESH Claude Code session (Opus)

You are the coordinator for the Peak Fettle **Revision phase (v26)**. Work the plan in `DEV_ROADMAP_2026-05-29.md`.

**Step 0 — read first:** `CLAUDE.md`, `.claude/AGENT_TOOLKIT.md`, `DEV_ROADMAP_2026-05-29.md`, `dev_learnings.md`, `OPEN_QUESTIONS_FOR_FOUNDER.md`.

**Step 1 — confirm the context-reducing toolchain is ON and report status before doing anything else:**
- **context-mode** installed and sandboxing tool output — run `/context-mode:ctx-stats` and paste the baseline.
- **claude-mem** active (cross-session memory).
- **morph** Flash Compact configured (`/morph-compact:install` done, `MORPH_API_KEY` set) + WarpGrep available for searches.
- **GSD** available — you WILL fan out module sweeps as sub-agents.
- **caveman** on (terse output) to cut tokens.
If any are missing, run `.claude/install-toolkit.sh` and the `/plugin` lines it prints, then continue.

**Step 2 — execute TICKET-064 (full-codebase audit) FIRST.** It gates 065–070.
- Plan with **superpowers** (`/write-plan`).
- Fan the per-module parse-sweeps out as **GSD sub-agents, one module each, on Sonnet**, so every module gets a clean context window. Each sub-agent returns ONLY a distilled findings block (path, role, active/legacy/dead, L-### tag, severity) — **never raw file dumps**.
- Stream results to `audits/AUDIT_2026-05-29_findings.md` as you go. **That file is the source of truth — not your context window.**

**Hard rules (every step):**
- The **`peak-fettle-verify`** parse-sweep + `node --check` is the definition of done. A prose "looks clean" is NOT acceptable (L-014, CORRUPT-001).
- **Do not edit source in 064** — log findings only.
- When product **intent is unclear, STOP** and add a numbered question to `OPEN_QUESTIONS_FOR_FOUNDER.md` with options + a recommendation. Never guess (TICKET-071).
- Commit via the **`peak-fettle-commit`** skill, then tell me to `git push origin main` (CI/EAS won't see it otherwise).

**Step 3 — when 064 is done:** give me the findings register + the prioritized remediation plan, and **wait for my go-ahead** before starting TICKET-065.

---

## Sub-agent prompt template (Sonnet, one per module via GSD)
> Audit ONLY `<module path>` against `dev_learnings.md`. Run the `peak-fettle-verify` sweep on it. Return a compact findings block: per file → role, active/legacy/dead, L-### tag, severity (P0–P3), one-line note. No raw file contents. If product intent is ambiguous, flag it for `OPEN_QUESTIONS_FOR_FOUNDER.md` instead of guessing.

---

## Model + context-budget guidance
- **Opus** = coordinator + judgment work (module classification, the TICKET-001–063 re-examination table, remediation plan, and the final integration/verification pass). Pair merges with `/ultra-review`.
- **Sonnet** = the fan-out module sweeps and the P2 tickets (067, 069, 070). Default workhorse.
- **Haiku** = not in this plan.

**Context levels:**
- Keep the **Opus coordinator lean — aim < 50% of the window in use.** Don't read whole files into it; delegate to sub-agents and ingest only their distilled findings. The audit file on disk + claude-mem are your memory, not the context window.
- Each **Sonnet sub-agent gets a fresh, near-empty window** (one module). context-mode shrinks the parse-sweep's raw output (tens of KB → hundreds of bytes), so a sub-agent rarely needs to compact.
- **Compaction trigger:** if any session passes ~**60%**, run `/compact morph` (or let morph's pre-compact hook fire) and spawn fresh for the next module. **Never push the Opus coordinator past ~70%** on judgment-critical work — start a new session and let claude-mem + the findings file restore state.
- Check spend between batches with `npx codeburn`.
