# Peak Fettle — Context Map
**Master reference: which agent loads which files. If it's not on this list, don't load it.**

---

## The Rule

Every agent loads exactly one context slice plus their own agent definition. They load additional source documents only when performing a task that explicitly requires the detail in that document. Default: load less, not more.

---

## Agent → Context Slice Assignments

### Dev Team

| Agent | Always Load | Load Only When Needed |
|---|---|---|
| `dev-lead` | `context-slices/dev-context.md` | `agents/dev-skill.md` (Qt work), specific source files being modified |
| `dev-frontend` | `context-slices/dev-context.md` | `agents/dev-skill.md` (Qt work), specific component files being modified |
| `dev-backend` | `context-slices/dev-context.md` | Specific route/service files being modified |
| `dev-database` | `context-slices/dev-context.md` | Migration files, schema files being modified |

**Never load for dev team:** `marketing_subteam_skill.md`, cost analysis docs, beta persona files, exec strategy docs.

**What was trimmed from dev agent files (2026-05-05):**
- `dev-lead.md`: removed duplicated tech stack (→ dev-context.md), removed output format (→ dev-context.md), removed Qt Graphs/QML gotchas section (→ dev-skill.md), removed all "Recently completed" ticket history (→ dev-context.md Phase Status table). ~185 lines removed.
- `dev-frontend.md`: condensed tech stack to one-liner (→ dev-context.md), condensed output format to one-liner (→ dev-context.md). ~8 lines removed.
- `dev-backend.md`: condensed output format to one-liner (→ dev-context.md). ~5 lines removed.
- `dev-database.md`: condensed output format to one-liner (→ dev-context.md). ~5 lines removed.

---

### Beta Test Team

| Agent | Always Load | Load Only When Needed |
|---|---|---|
| `beta-casual-gymgoer` | `context-slices/beta-context.md` | The specific feature description being tested |
| `beta-competitive-lifter` | `context-slices/beta-context.md` | The specific feature description being tested |
| `beta-runner` | `context-slices/beta-context.md` | The specific feature description being tested |
| `beta-beginner` | `context-slices/beta-context.md` | The specific feature description being tested |

**Never load for beta team:** Tech stack files, marketing docs, cost documents, dev implementation files.

---

### Exec Team

| Agent | Always Load | Load Only When Needed |
|---|---|---|
| `exec-ceo` | `context-slices/exec-context.md` | `marketing_subteam_skill.md` (strategy decisions), `year_one_costs_report.md` (budget decisions) |
| `exec-cto` | `context-slices/exec-context.md` | Specific dev files under architectural review |
| `exec-product-manager` | `context-slices/exec-context.md` | Beta test output being synthesized, `context-slices/dev-context.md` (phase status) |

**Never load for exec team by default:** Full `INSTRUCTIONS.md` (summary is in exec-context), full cost analysis trilogy (summary is in exec-context), all dev implementation files.

**What was trimmed from exec agent files (2026-05-05):**
- `exec-ceo.md`: removed output format (→ exec-context.md). ~5 lines removed.
- `exec-cto.md`: removed output format (→ exec-context.md). ~6 lines removed.
- `exec-product-manager.md`: replaced stale "Current Priorities" list (Phases A-C already built) with pointer to dev-context.md; removed output format (→ exec-context.md). ~12 lines removed.

---

### Marketing Team

| Agent | Always Load | Load Only When Needed |
|---|---|---|
| Marketing agent (any) | `context-slices/marketing-context.md` | `marketing_subteam_skill.md` (full strategy work), `year_one_costs_report.md` (CAC/budget modeling) |

**Never load for marketing:** Dev implementation files, database schema, beta persona files, `exec_playbook_steelmanning.md` (unless explicitly doing methodology work).

---

### Workflow Optimization Team

| Agent | Always Load | Load Only When Needed |
|---|---|---|
| `workflow-optimizer` | `CONTEXT_MAP.md`, `WORKFLOW_RULES.md` | The specific agent file being audited |
| `context-auditor` | `CONTEXT_MAP.md` | The specific file being audited (one file at a time) |

---

## Source Document Inventory

| Document | Size | Canonical Use | Who Needs It Directly |
|---|---|---|---|
| `INSTRUCTIONS.md` | Long | Full product spec | Summarized in all 4 context slices — rarely needed directly |
| `marketing_subteam_skill.md` | ~280 lines | Full marketing strategy | CEO (strategy sessions), marketing agent. Summarized in exec-context + marketing-context. |
| `cost_analysis_reference.md` | Medium | Vendor pricing, token costs | CEO/PM (budget work only). Summarized in exec-context. |
| `year_one_costs_report.md` | Medium | Year 1 budget tiers | CEO/PM (budget work only). Key numbers in exec-context. |
| `exec_playbook_steelmanning.md` | Medium | Decision-making methodology | CEO, PM — only when producing new strategy documents. |
| `context-slices/dev-context.md` | Short | Dev team context | dev-lead, dev-frontend, dev-backend, dev-database |
| `context-slices/beta-context.md` | Short | Beta tester context | All 4 beta agents |
| `context-slices/exec-context.md` | Medium | Exec team context | exec-ceo, exec-cto, exec-pm |
| `context-slices/marketing-context.md` | Short | Marketing team context | Any marketing-focused session |

---

## Decision Tree: "What context do I load?"

```
What team is doing this task?
├── Dev work → dev-context.md + specific files being modified
├── Beta testing → beta-context.md + feature description
├── Executive decision → exec-context.md
│   ├── Budget/cost work? → also load cost docs
│   └── Marketing strategy? → also load marketing_subteam_skill.md
├── Marketing work → marketing-context.md
│   └── Full strategy session? → also load marketing_subteam_skill.md
└── Workflow audit → CONTEXT_MAP.md + WORKFLOW_RULES.md + target file
```

---

## What Gets Loaded in Cowork / Claude Desktop Sessions

When working in Cowork (not the API orchestrator), apply the same principle:
- Reference the context slice for the team you're working with at the start of the chat.
- Do not paste the full content of any source document unless the task explicitly requires detail not in the slice.
- When in doubt: start with the slice, fetch the source doc only if you hit a question the slice can't answer.
