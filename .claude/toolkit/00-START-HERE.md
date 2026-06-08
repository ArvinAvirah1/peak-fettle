# Claude Code Toolkit — Install Guide

Every plugin and skill from the two videos, one file each, with verified install commands. Run the commands at the **Claude Code prompt** (the ones starting with `/`) or in a **terminal** (the ones starting with `claude`, `npx`, `curl`, or `env`).

## How plugin installs work (read once)

Most plugins follow the same two-step pattern:

```
/plugin marketplace add <owner>/<repo>     # register the source (once)
/plugin install <plugin>@<marketplace>      # install it
```

- The **official Anthropic marketplace** (`claude-plugins-official`) is built in — for those you skip the `marketplace add` step.
- You can also just run `/plugin` to open the manager and browse the **Discover** tab.
- **MCP servers** (Firecrawl, Exa, Higgsfield, Morph's MCP) are added differently — via `claude mcp add …` in a terminal, or **Settings → Connectors** in Claude Desktop/Cowork.
- Some plugins need a **restart** or `/reload-plugins` to take effect.
- Install globally (user scope) for things you always want on (skill-creator, frontend-design); install per-project for the rest.

## ⚠️ Before you install anything

Anthropic does not control or vet third-party plugins/MCP servers — they can run code, register hooks, and change over time. Only install ones you trust, and prefer maintained sources. Be extra careful with anything that pipes a remote script into your shell (e.g. `curl … | sh`).

---

## The files

**From Video 1 — the 6 "boring but effective" skills + bonus**

| # | Tool | What it's for | Cost |
|---|------|---------------|------|
| 01 | Skill Creator (Anthropic) | Builds every other skill | Free |
| 02 | Superpowers | Plan → test → review methodology | Free |
| 03 | GSD | Clean context via sub-agents | Free |
| 04 | /review & /ultra-review | Built-in code review | /review free; /ultra-review ~$5–20/run |
| 05 | Context Mode | Sandbox output + session continuity | Free |
| 06 | Claude Mem | Memory across sessions | Free |
| 07 | Front-End Design (Anthropic) | Less "AI-looking" UIs (bonus) | Free |

**From Video 2 — the 9 plugins**

| # | Tool | What it's for | Cost |
|---|------|---------------|------|
| 08 | Caveman | Terse output, ~65–75% fewer tokens | Free |
| 09 | Firecrawl | Extract clean page content | Paid API key |
| 10 | Exa | Semantic search for best sources | API key (hosted tier works) |
| 11 | Compound Engineering | Plan/Work/Review/Compound loop | Free |
| 12 | Higgsfield | Generate images & video | Account (no API key) |
| 13 | Security Guidance (Anthropic) | Pre-launch security audit | Free |
| 14 | Legal Plugin (Anthropic) | Contract/NDA/compliance workflows | Free |
| 15 | OpenAI Codex | Multi-model — call Codex from Claude | ChatGPT acct or API key |
| 16 | BuildPartner.ai | Expert frameworks in your terminal | 10 free, then $7.99/mo |
| 17 | Morph | Faster file edits / search / compaction | Paid API key |
| 18 | CodeBurn | See & cut your token spend | Free |

---

## Quick-install cheat sheet (copy/paste)

### Free, no key — install these first
```
# Anthropic official (marketplace is built in)
/plugin install skill-creator@claude-plugins-official
/plugin install frontend-design@claude-plugins-official
/plugin install security-guidance@claude-plugins-official

# Superpowers
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace

# GSD
/plugin marketplace add jnuyens/gsd-plugin
/plugin install gsd@gsd-plugin
/reload-plugins

# Context Mode  (restart Claude Code after)
/plugin marketplace add mksglu/claude-context-mode
/plugin install context-mode@claude-context-mode

# Claude Mem  (restart Claude Code after)
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem

# Caveman  (restart Claude Code after)
/plugin marketplace add JuliusBrussee/caveman
/plugin install caveman@caveman

# Compound Engineering
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering@EveryInc-compound-engineering-plugin
```

### Built in — nothing to install
```
/review
/ultra-review        # needs Claude Code v2.1.86+, signed-in Claude account
```

### MCP servers / connectors (need a key or account)
```bash
# Exa (hosted)
claude mcp add --transport http exa https://mcp.exa.ai/mcp

# Higgsfield (no key — sign in)
claude mcp add --transport http higgsfield https://mcp.higgsfield.ai/mcp

# Firecrawl (paid key)
claude mcp add firecrawl -e FIRECRAWL_API_KEY=fc-YOUR_KEY -- npx -y firecrawl-mcp

# Morph MCP (paid key)
claude mcp add morph -e MORPH_API_KEY=YOUR_KEY -- npx -y @morphllm/morphmcp
```

### Other
```
# OpenAI Codex
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```
```bash
# Morph plugin (Compact) — then run /morph-compact:install in Claude Code
/plugin marketplace add morphllm/morph-claude-code-plugin
/plugin install morph-compact@morph-claude-code-plugin

# BuildPartner.ai
curl buildpartner.ai/install.sh | sh

# CodeBurn (just run it)
npx codeburn
```

---

## A note on the "how to sell this" advice in the videos

Both creators make the same point: don't sell "an AI workflow," sell the **outcome** — save the business 10 hours/week, cut admin mistakes, get more leads. Start with **one** tool, learn it, build a demo, and show a business owner the value. These guides cover the tooling; the selling is on you.

---

*Verified against each project's official GitHub / docs on 2026-05-29. Marketplace/plugin names and pricing can change — confirm with `/plugin` → Discover or the source link in each file if a command doesn't resolve.*
