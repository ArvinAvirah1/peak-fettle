# Compound Engineering (Every / Kieran Klaassen & Dan Shipper)

**What it does:** Implements a systematic build loop where each unit of work makes the next one easier: **Plan → Work → Review → Compound → Repeat** (≈80% planning + review, 20% execution). Sub-agents research your codebase, best practices, and framework versions in parallel before any code is written; review agents check security, architecture, and quality; learnings get captured into docs Claude reads next time.

**Maintainer:** Every (EveryInc). The exact workflow they use to run multiple products with tiny teams.

## Install

In the Claude Code prompt:

```
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering@EveryInc-compound-engineering-plugin
```

Or use `/plugin` → **Discover** → Compound Engineering.

## Use

After install, browse the namespaced commands by typing `/` and looking for the compound-engineering plan / work / review steps. The core idea: get the plan right first (planning is the highest-leverage step).

**Source:** https://github.com/EveryInc/compound-engineering-plugin
