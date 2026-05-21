# Peak Fettle — Workflow Efficiency Rules
**11 rules for maximizing output quality and minimizing token waste across all Claude sessions.**

---

## Rule 1 — Don't Follow Up, Edit

**The rule:** When Claude makes an error or produces something off-target, use the **Edit** button on Claude's original message rather than sending a new corrective message.

**Why it matters:** Every follow-up message appends to conversation history. A correction that adds 2 messages instead of fixing 1 doubles the context load for every subsequent turn in that conversation. Over a 20-message session, this compounds dramatically.

**How to apply for Peak Fettle:**
- If Claude misunderstands a dev task (e.g., uses the wrong database table), edit the original prompt to clarify — don't send "actually, use the `percentile_vectors` table."
- If an exec output format is wrong, edit the original task description before regenerating.

---

## Rule 2 — Start Fresh Chats Every 15–20 Messages

**The rule:** Proactively start a new chat every 15–20 messages. Carry forward only a compact summary of the previous conversation.

**Why it matters:** Every message in a conversation is re-sent to the model on each turn. A 20-message conversation is 20× more expensive per response than a 1-message conversation. Performance also degrades at long context — the model attends less precisely to early messages.

**How to apply for Peak Fettle:**
- When starting a new chat, open with: *"Continuing Peak Fettle dev work. Previous session: [2–3 sentence summary]. Task: [batched prompt]."*
- For the dev team: summarize which files were modified and what the current blocker is.
- For exec sessions: summarize the decision made and what the next question is.
- Agent context slices mean you don't need to re-explain the product every session — the slice handles it.

**Suggested summary template:**
```
Previous session: [what was accomplished]. Open items: [any blockers]. 
Today's task: [fully batched prompt — see Rule 3].
Context: load [specific slice file].
```

---

## Rule 3 — Batch Your Prompts

**The rule:** Combine all related sub-tasks into a single message rather than sending them one at a time.

**Why it matters:** Each message loads the entire conversation history. Sending 5 small prompts is ~5× more expensive than sending 1 batched prompt covering all 5 tasks.

**How to apply for Peak Fettle:**
- Bad: "Build the login screen." → (waits) → "Now add form validation." → (waits) → "Now wire it to the auth endpoint."
- Good: "Build the login screen with: (1) email + password fields, (2) client-side form validation, (3) wired to the `/auth/login` Express endpoint using JWT. Output format per dev-lead spec."
- For executive sessions: batch strategic questions together. "Evaluate: (1) should we build wearable integration now or at Month 6, (2) is the current Haiku cost model still valid at 10,000 users, (3) what's the 90-day success metric for the referral loop launch?"

---

## Rule 4 — Track Your Token Usage

**The rule:** Monitor actual token consumption using local dashboard tools. Know where your usage is concentrated.

**Why it matters:** Without measurement, you can't optimize. Most users discover that 80% of their token spend comes from 20% of their sessions — usually the longest conversations or the ones that re-load large files.

**How to apply for Peak Fettle:**
- Track which agent sessions consume the most tokens (dev lead tasks that load full codebase context are typically highest).
- Flag sessions where `marketing_subteam_skill.md` (277 lines) or full cost documents are loaded unnecessarily — the context slices were built to prevent this.
- If using the Claude API for the Peak Fettle agent orchestrator: log token counts per agent call in a JSON file; review weekly to identify high-cost patterns.

**Quick wins to check:**
- Are beta tester agents loading dev context? → Switch to `beta-context.md`
- Are dev agents loading the full marketing doc? → Remove it
- Are exec agents re-reading all cost documents every session? → Use the summary in `exec-context.md` first; only load full docs when actually doing budget work

---

## Rule 5 — Use Projects for Recurring Files

**The rule:** Upload documents that appear in multiple sessions to Claude's Projects feature so they are cached and not retokenized on every use.

**Why it matters:** A file re-pasted into every conversation is billed in full on every turn. A file cached in Projects is billed once (or at a much lower cache-read rate).

**How to apply for Peak Fettle:**
- Upload to Projects: `INSTRUCTIONS.md`, `marketing_subteam_skill.md`, cost analysis docs, exec_playbook_steelmanning.md
- The context slices in this folder are designed to be the cached reference layer — upload them to Projects and reference them by name in every new session.
- Do NOT re-paste the content of any context slice into a prompt. Reference the Project file.

**Files that should be in Projects (priority order):**
1. `workflow-optimization/context-slices/dev-context.md`
2. `workflow-optimization/context-slices/exec-context.md`
3. `workflow-optimization/context-slices/marketing-context.md`
4. `workflow-optimization/context-slices/beta-context.md`
5. `INSTRUCTIONS.md`

---

## Rule 6 — Save Role and Communication Style in Memory

**The rule:** Store your role, preferences, and communication style in Claude's memory or system prompt settings so they are applied automatically — not repeated in every prompt.

**Why it matters:** Instructions like "I'm a solo founder, explain things simply, don't use jargon" consume tokens in every message if typed manually. Saved memory applies them for free.

**What is already saved in memory for this project:**
- Peak Fettle product overview (what the app is, tech stack decisions)
- Cost analysis reference (where to find budget documents)
- Marketing skill file location

**What to add or verify:**
- Arvin's preferred output format per agent type
- Communication style: direct, no excessive preamble, flag decisions that need input
- Reminder: always batch prompts (Rule 3) and load correct context slice (Rule 5)

---

## Rule 7 — Disable Unnecessary Features

**The rule:** Turn off web search, connectors, and advanced reasoning when they are not needed for the specific task.

**Why it matters:** Active features like web search, extended thinking, and connected tools all consume additional tokens and compute, even when they contribute nothing to the output.

**How to apply for Peak Fettle:**
- Dev tasks (writing code, reviewing schema): disable web search unless researching a library.
- Beta test sessions (simulating user reactions): disable everything except the model itself.
- Exec strategy sessions: disable web search unless doing competitive research.
- Only enable web search when: checking current Anthropic API pricing (LLM costs change ~2x/year), competitive feature research, or looking up current App Store metrics.

---

## Rule 8 — Use Smaller Models for Simple Tasks

**The rule:** Use Haiku for brainstorming, grammar checks, formatting, and simple lookups. Reserve Sonnet for multi-step reasoning. Reserve Opus for the most complex architectural or strategic work.

**Why it matters:** Haiku is ~20–30× cheaper per token than Opus and handles most tasks with equivalent quality.

**Peak Fettle model assignment guide:**

| Task | Model |
|---|---|
| Beta tester reactions (simulated user feedback) | Haiku |
| Grammar/formatting check on docs | Haiku |
| Generating first-draft copy or content ideas | Haiku |
| Routine dev tasks (a single well-specified function) | Haiku |
| Feature implementation across multiple files | Sonnet |
| Architectural decisions (CTO review) | Sonnet |
| Complex business strategy (CEO decisions with trade-offs) | Sonnet |
| Deep architectural redesign or novel problem-solving | Opus |
| Steelmanning a major strategic pivot | Opus |

Note: Peak Fettle's AI plan generation already uses Haiku by design. This is the right call — apply the same discipline to how you use Claude in your workflow.

---

## Rule 9 — Spread Work Across the Day

**The rule:** Be aware of the rolling 5-hour usage window. Distribute heavy sessions across the day rather than exhausting the limit in one burst.

**Why it matters:** Hitting the session limit mid-task forces a workflow interruption. Planning around the window prevents this.

**How to apply for Peak Fettle:**
- Don't schedule a full dev sprint (lead + frontend + backend + database agents) in a single 2-hour block.
- Sequence: dev lead task in the morning → frontend/backend in the afternoon → database agent review in the evening.
- Save exec strategy sessions (typically longer, more iterative) for a separate time block from dev work.
- Batch prompts (Rule 3) and use context slices (Rule 5) to reduce per-message token cost, extending how much work you can fit in a window.

---

## Rule 10 — Work During Off-Peak Hours When Possible

**The rule:** The system consumes your usage limit faster during US weekday business hours (roughly 9am–5pm ET/PT). Shift resource-intensive tasks to evenings or weekends when the system is less loaded.

**Why it matters:** During peak hours, the same task may consume more of your rate limit than it would off-peak due to how rolling limits interact with system load.

**How to apply for Peak Fettle:**
- Schedule long code generation sessions (building full features, running multi-agent dev workflows) for evenings or weekend mornings.
- Use peak hours for quick exec decisions, short reviews, and message-batching prep.
- The orchestrator (`orchestrator.js`) can be queued to run at off-peak times for non-urgent tasks.

---

## Rule 11 — Enable Overage / Pay-As-You-Go as a Safety Net

**The rule:** Enable the overage feature so that hitting your plan limit doesn't cut off access — it switches to pay-as-you-go billing rather than blocking you.

**Why it matters:** Running out of usage mid-task (especially mid-agentic task) is disruptive and hard to recover from. Overage ensures continuity and the marginal cost is low for occasional overflow.

**How to apply for Peak Fettle:**
- Enable overage in Claude settings before any major multi-agent session (full dev sprint, exec review + marketing planning in same day).
- Monitor actual overage usage monthly — if it's consistently high, it signals a workflow problem (probably a Rule 3 or Rule 5 violation) rather than a budget problem.
- For Peak Fettle as a product: Claude Haiku at ~2.5¢/plan means the LLM cost is already controlled. The overage safety net is about your workflow as a founder, not the product's cost model.

---

## Quick Reference Card

| # | Rule | Peak Fettle Action |
|---|---|---|
| 1 | Edit, don't follow up | Use Edit button on wrong outputs |
| 2 | Fresh chat every 15–20 messages | Open with 2-sentence summary + batched task |
| 3 | Batch prompts | Combine all sub-tasks before sending |
| 4 | Track token usage | Log API token counts per agent per session |
| 5 | Use Projects for recurring files | Upload context slices to Projects |
| 6 | Save role + style in memory | Memory already has product + cost + marketing refs |
| 7 | Disable unused features | Web search off for dev/beta sessions |
| 8 | Right model for the task | Haiku for beta/simple dev; Sonnet for complex; Opus sparingly |
| 9 | Spread work across the day | Split dev sprint across AM/PM/evening blocks |
| 10 | Work off-peak | Heavy sessions → evenings / weekends |
| 11 | Enable overage | Turn on before any multi-agent sprint |
