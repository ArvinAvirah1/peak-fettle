# Agent Deployment & Token Efficiency — Curriculum Outline

> **Status: OUTLINE ONLY.** This file is the scaffold for a full curriculum on deploying agents and subagents and on being maximally token-efficient *without* sacrificing output quality. It lists the difficulty ladder, the source links each rung is built from, and the formatting the finished curriculum will follow. Lessons themselves are built on demand (see Part 5), exactly like the sibling `codebase-curriculum`.
>
> **Sibling curriculum:** `../00_TEACHING_METHODOLOGY.md` and `../01_ROADMAP.md`. This curriculum reuses that pedagogy, app engine, and grading flow verbatim — only the subject matter changes.

---

## Part 0 — What this curriculum is

A **practitioner curriculum** that teaches how to:

1. **Deploy agents** — decide when an agent (vs a workflow or a single prompt) is the right tool, then build and ship one.
2. **Deploy subagents** — split work across specialized subagents with isolated context windows, and orchestrate them.
3. **Be token-efficient with no quality dropoff** — treat context as a finite, curated resource so that cost falls while output quality holds, including when work is delegated to **Sonnet 4.6 subagents**.

It is **module-based** (called *rungs*, matching the sibling curriculum). Each rung becomes one lesson: a markdown file plus an interactive HTML app, generated on demand from the shared templates.

**Primary-source discipline:** every rung is anchored to Anthropic's own docs and engineering writing. Community material is quarantined in an optional, clearly-flagged list (Part 7) and is never the sole basis for a lesson. This is what guarantees no quality dropoff when a lesson's instruction file is handed to a Sonnet 4.6 subagent — the subagent is always working from canonical sources, not second-hand summaries.

---

## Part 1 — Formatting (how the finished curriculum will be laid out)

The full build mirrors the sibling `codebase-curriculum` one-for-one:

| File | Role |
|------|------|
| `00_OUTLINE.md` (this file) | Scaffold + source library. Read first. |
| `00_METHODOLOGY.md` | Operating manual: pedagogy, app structure, grading. Copy of `../00_TEACHING_METHODOLOGY.md` with agent-domain examples. |
| `01_ROADMAP.md` | The rung ladder as a clean table (promoted from Part 3 below). |
| `LESSON_TEMPLATE.md` | Fill-in-the-blanks lesson skeleton. Copy `../LESSON_TEMPLATE.md`. |
| `lesson_app_template.html` | Reusable interactive app engine (nav, retrieval gates, "Grade with Claude"). Copy `../lesson_app_template.html` unchanged — never edit the engine. |
| `lessons/Axx_*.md` + `.html` | One per rung, built on demand. |

**Lesson anatomy** (identical to the sibling curriculum, restated so a subagent needs no other file):

- **Front matter** — rung ID, title, prerequisites, learning objectives.
- **Vocabulary** — key terms defined up front (pretraining, M13).
- **Sections** — small chunks (segmenting, M12), each ending in a **retrieval gate** (M1) before advancing.
- **Worked examples** — real config/code walked line by line (M7), using genuine SDK / Claude Code / API snippets.
- **Quiz** — Bloom-tagged items (L1–L5), AI-graded with specific feedback (M9).
- **Self-assessment** — metacognition prompts (M10).

**Bloom tags** (the difficulty axis, same as sibling): L1 Remember · L2 Understand · L3 Apply · L4 Analyze · L5 Evaluate/Create.

---

## Part 2 — Pedagogy (pointer, not a copy)

Do **not** re-derive the teaching method. Read `../00_TEACHING_METHODOLOGY.md` (methods M1–M14, Bloom L1–L5, the AI-graded-quiz rubric, the per-lesson build protocol) and apply it directly. The only adaptation: all concrete examples (M5) come from agent/SDK/API material rather than the Peak Fettle stack.

---

## Part 3 — The rung ladder (5 tracks, 22 rungs)

### Track G0 — Foundations: agents, loops, and context

| Rung | Lesson | What you'll learn | Prereqs | Primary sources |
|------|--------|-------------------|---------|-----------------|
| **A01** | Agents vs workflows vs prompts | When an agent is warranted vs a fixed workflow vs a single call; the cost of agency | none | S1, S24 |
| **A02** | The agent loop | Gather context → act → verify → repeat; autonomy and stopping conditions | A01 | S1, S6 |
| **A03** | Anatomy of context | The four context inputs: system prompt, tools, examples, message history/retrieved data | A01 | S2 |

### Track G1 — Context engineering (the token-efficiency core)

| Rung | Lesson | What you'll learn | Prereqs | Primary sources |
|------|--------|-------------------|---------|-----------------|
| **A04** | Context as a finite resource | "Context rot," attention budget, system prompts at the "right altitude" | A03 | S2 |
| **A05** | Just-in-time retrieval | Loading context on demand vs pre-loading everything; identifiers over dumps | A04 | S2, S16 |
| **A06** | Designing tools for efficiency | Token-frugal tool definitions, response shaping, consolidating tools | A03 | S4 |
| **A07** | Token-efficient tool use & code execution | Built-in token-efficient tool use (Claude 4+); doing work in code to cut tool-call tokens | A06 | S5, S13, S27 |
| **A08** | Prompt caching | Cache breakpoints, what to cache (system/tools/examples), cost & latency wins | A04 | S12, S28 |
| **A09** | Long-horizon context | Compaction, structured note-taking / memory, context editing | A04 | S2, S15, S26 |

### Track G2 — Subagents & orchestration

| Rung | Lesson | What you'll learn | Prereqs | Primary sources |
|------|--------|-------------------|---------|-----------------|
| **A10** | Subagents: what & when | Context isolation, specialized expertise, when subagents help vs hurt | A02, A04 | S9, S3 |
| **A11** | Configuring a subagent | The Claude Code subagent file (name, description, tools, model); SDK equivalent | A10 | S9, S10 |
| **A12** | Orchestrator–worker pattern | Lead agent delegates to parallel workers; the multi-agent research system | A11 | S3 |
| **A13** | Workflow patterns | Prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer | A01 | S1, S24 |
| **A14** | Token economics of multi-agent | The ~15× token multiplier; when multi-agent pays off and when it doesn't | A12 | S3, S2 |

### Track G3 — Deployment & building

| Rung | Lesson | What you'll learn | Prereqs | Primary sources |
|------|--------|-------------------|---------|-----------------|
| **A15** | Claude Agent SDK overview | SDK architecture, the harness, building a deployable agent | A02 | S10, S6, S11 |
| **A16** | Agent Skills | Progressive disclosure as a token-efficiency mechanism; authoring skills | A05 | S7, S18, S25 |
| **A17** | Claude Code best practices | Agentic-coding workflow, CLAUDE.md, permissions, tips & tricks | A15 | S8, S22 |
| **A18** | Tool use & MCP integration | Implementing tool use end to end; wiring MCP servers | A06 | S14, S19 |
| **A19** | Cost tracking & observability | Measuring token spend per run/agent; cost-tracking hooks | A14 | S21 |

### Track G4 — Subagent handoff & quality assurance

| Rung | Lesson | What you'll learn | Prereqs | Primary sources |
|------|--------|-------------------|---------|-----------------|
| **A20** | Zero-dropoff handoff to Sonnet 4.6 | Writing self-contained subagent instruction files (see Part 6 contract) | A11, A05 | S3, S2, S20 |
| **A21** | Evaluation & guardrails | Eval-driven development, LLM-as-judge, tracing failure modes | A19 | S3, S23 |
| **A22** | Capstone | Design a token-efficient multi-agent system end to end and justify every choice | all | S1–S26 |

---

## Part 4 — Source library (the "trusted links")

All primary. `Sxx` codes are referenced by the rung table above. Verified reachable 2026-05-31; re-check before each lesson build since docs move.

### Anthropic engineering blog (deep, opinionated, primary)

- **S1 — Building Effective AI Agents** — https://www.anthropic.com/research/building-effective-agents
  Foundational taxonomy: workflows vs agents; the five workflow patterns; when (not) to add agency.
- **S2 — Effective context engineering for AI agents** — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  The token-efficiency backbone: context as finite resource, right-altitude prompts, just-in-time retrieval, compaction, note-taking, sub-agent context isolation.
- **S3 — How we built our multi-agent research system** — https://www.anthropic.com/engineering/multi-agent-research-system
  Orchestrator–worker in production; the ~15× token multiplier; delegation prompts; eval lessons. Core of Tracks G2 & G4.
- **S4 — Writing effective tools for agents (with MCP)** — https://www.anthropic.com/engineering/writing-tools-for-agents
  Token-frugal tool design, response shaping, evaluating tools with agents.
- **S5 — Code execution with MCP: building more efficient agents** — https://www.anthropic.com/engineering/code-execution-with-mcp
  Cutting tool-call token overhead by executing code instead of chaining calls.
- **S6 — Building agents with the Claude Agent SDK** — https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk
  The gather-context → act → verify loop and how the SDK implements it.
- **S7 — Equipping agents for the real world with Agent Skills** — https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
  Skills as progressive disclosure — load instructions only when needed.
- **S8 — Claude Code: best practices for agentic coding** — https://www.anthropic.com/engineering/claude-code-best-practices
  Workflow, CLAUDE.md, permissions, multi-agent tips from the field.

### Claude docs (canonical reference, primary)

> Doc URLs verified 2026-05-31. Claude Code docs now live under **`code.claude.com`** and API/SDK docs under **`platform.claude.com`**; older `docs.claude.com/...` links generally redirect but may break — prefer the canonical hosts below.

- **S9 — Subagents (Claude Code)** — https://code.claude.com/docs/en/sub-agents
  Subagent file format (Markdown + YAML frontmatter: name, description, tools, model), context isolation, chaining. SDK equivalent: **Subagents in the SDK** — https://platform.claude.com/docs/en/agent-sdk/subagents
- **S10 — Claude Agent SDK overview** — https://platform.claude.com/docs/en/agent-sdk/overview (mirror: https://code.claude.com/docs/en/agent-sdk/overview)
- **S11 — Agent SDK reference (Python / TypeScript)** — https://platform.claude.com/docs/en/agent-sdk/python · https://platform.claude.com/docs/en/agent-sdk/typescript
- **S12 — Prompt caching** — https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- **S13 — Token-efficient tool use** — https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/token-efficient-tool-use
  Note: beta header `token-efficient-tools-2025-02-19` is Claude 3.7 only; **Claude 4+ has token-efficient tool use built in** — do not send the header. (See also S5 and the advanced-tool-use post in this list.)
- **S14 — Implement tool use** — https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use (best-practices-for-tool-definitions section)
- **S15 — Context editing** — https://platform.claude.com/docs/en/build-with-claude/context-editing
- **S16 — Context windows + long-context tips** — https://platform.claude.com/docs/en/build-with-claude/context-windows · https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/long-context-tips
- **S17 — Extended thinking** — https://platform.claude.com/docs/en/build-with-claude/extended-thinking
- **S18 — Agent Skills overview** — https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- **S19 — Model Context Protocol (MCP)** — https://modelcontextprotocol.io/docs/getting-started/intro (Anthropic tool-use overview: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- **S20 — Prompt engineering overview** — https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview
- **S21 — Pricing & cost (for token economics)** — https://platform.claude.com/docs/en/about-claude/pricing · cost is tracked via the SDK's usage fields (S10/S11). *(The standalone `agent-sdk/cost-tracking` page 404s as of 2026-05-31 — use pricing + SDK usage objects instead; re-check before building A19.)*
- **S22 — Claude Code best practices / tips** — https://www.anthropic.com/engineering/claude-code-best-practices · https://code.claude.com/docs/en/overview

### Anthropic engineering — advanced tool use (primary)

- **S27 — Introducing advanced tool use** — https://www.anthropic.com/engineering/advanced-tool-use
  Programmatic / token-efficient tool calling; pairs with S5 and S13 for rung A07.

### Anthropic code & news (primary)

- **S23 — claude-cookbooks (repo; formerly anthropic-cookbook)** — https://github.com/anthropics/claude-cookbooks
- **S24 — Cookbook: agent patterns** — https://github.com/anthropics/claude-cookbooks/tree/main/patterns/agents (orchestrator-workers notebook: `/patterns/agents/orchestrator_workers.ipynb`)
- **S25 — Introducing Agent Skills (news)** — https://www.anthropic.com/news/skills
- **S26 — Context management: memory + context editing (news)** — https://www.anthropic.com/news/context-management
- **S28 — Token-saving updates on the Claude API (news)** — https://www.anthropic.com/news/token-saving-updates

---

## Part 5 — Per-lesson build protocol

When the learner says "teach A07":

1. Read `00_METHODOLOGY.md` (or `../00_TEACHING_METHODOLOGY.md` until the local copy exists).
2. Read the teacher skill profile (learner profile + methods M1–M14).
3. **Fetch the rung's primary sources** from Part 4 — read them fresh, do not rely on memory.
4. Generate the lesson markdown from `LESSON_TEMPLATE.md`.
5. Generate the interactive app from `lesson_app_template.html`.
6. Teach, then grade with the AI-graded quiz flow.
7. Update the learner profile in the teacher skill.

---

## Part 6 — Subagent handoff contract (the "no quality dropoff" guarantee)

This is the curriculum's load-bearing requirement: an instruction file handed to a **Sonnet 4.6 subagent** must produce work indistinguishable in quality from the lead agent. A subagent starts cold — it has none of this conversation's context — so the instruction file must be **fully self-contained**. Every subagent prompt this curriculum generates includes, in order:

1. **Objective** — one sentence, the single outcome to produce.
2. **Context slice** — only the facts the subagent needs, inlined. No "see above," no unstated assumptions. (Apply S2's just-in-time principle: give exactly enough, not the whole history.)
3. **Source links** — the exact `Sxx` URLs to read, so the subagent works from canon (the dropoff guard).
4. **Constraints** — scope boundaries, what *not* to touch, token/length budget.
5. **Output contract** — exact format, structure, and acceptance criteria the result is checked against.
6. **Verification step** — how the subagent self-checks before returning (fact-check against sources, test, or re-read the contract).

Rung **A20** teaches this contract; every other rung that spawns a subagent uses it. The template lives in `LESSON_TEMPLATE.md` once the curriculum is built.

---

## Part 7 — Secondary / community (optional, vet before use)

Not authoritative. Use only to supplement a primary source, never as a lesson's basis. Confirm claims against Part 4 before including anything.

- 12-Factor Agents (humanlayer) — https://github.com/humanlayer/12-factor-agents — design-principles framing.
- Philipp Schmid, "Context Engineering" — https://www.philschmid.de/context-engineering — practitioner summary.

---

*Outline built 2026-05-31. Reuses the sibling `codebase-curriculum` pedagogy, app engine, and grading flow. 22 rungs across 5 tracks, every rung anchored to Anthropic primary sources (S1–S28, all link-checked 2026-05-31). Next step: copy the methodology + templates locally, then build lessons on demand.*
