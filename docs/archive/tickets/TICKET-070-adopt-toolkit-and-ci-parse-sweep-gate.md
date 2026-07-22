# TICKET-070 — Adopt the Dev Toolkit + CI Parse-Sweep Gate
**Owner:** Sonnet + dev-backend (CI)
**Date opened:** 2026-05-29
**Phase:** R — Revision & Hardening
**Source:** Founder directive 2026-05-29 ("code the context of the dev agents to most effectively use these skills"); `.claude/AGENT_TOOLKIT.md`; `dev_learnings.md` L-014, CORRUPT-001.

---

## Goal
Operationalize the new toolkit so the workflow *enforces* it instead of relying on memory. Two parts: (a) confirm the agent-context wiring is in place and correct, and (b) make the `peak-fettle-verify` parse-sweep a **CI gate** so a truncated/broken commit can never again be declared "clean" by prose.

## Acceptance criteria
1. `.claude/AGENT_TOOLKIT.md`, `.claude/install-toolkit.sh`, `.claude/toolkit/*`, and the `peak-fettle-verify` + `peak-fettle-commit` skills exist and are referenced from `CLAUDE.md`. (Already added 2026-05-29 — this ticket verifies + maintains them.)
2. A CI workflow `.github/workflows/parse-sweep.yml` runs the `peak-fettle-verify` @babel sweep + `node --check` on every PR and **fails the build** on any parse failure or null byte (mechanizes L-014 / CORRUPT-001).
3. CI also runs `/security-review`-equivalent static checks before a release-tagged build.
4. The founder has the install steps: `.claude/install-toolkit.sh` prints the `/plugin` lines and wires the MCP servers (Exa/Higgsfield/Firecrawl/Morph) when keys are present.
5. `dev_learnings.md` gains an L-### entry capturing "toolkit adopted; verify is now a CI gate."

## Implementation plan
- Author the GH Actions workflow mirroring the existing `ci.yml` style (Node 20, `npm ci` in `peak-fettle-agents`).
- Keep the sweep self-contained (the reference script lives in the verify skill).
- `/review` the workflow; dry-run via `workflow_dispatch`.

## Test plan
1. Open a PR with a deliberately truncated file → CI fails on the parse sweep.
2. Clean PR → CI passes.
3. `bash .claude/install-toolkit.sh` prints the plugin block and adds MCP servers without error when keys are set.

## Notes
- CI runs on `origin/main`/PRs; it does **not** replace on-device verification for push (TICKET-065) or EAS-build checks.
