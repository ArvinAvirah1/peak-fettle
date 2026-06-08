# BuildPartner.ai

**What it does:** Brings curated expert frameworks (Hormozi, Naval, Nikita Bier, Gary Vee, Donald Miller, etc.) into your terminal so advice feels specific and confident instead of generic. Also includes an `improve-system` skill that audits your Claude Code setup, captures what you learn, and sets up recursive feedback loops so your system gets sharper over time.

**Maintainer:** Austin Marchese (The Incubator) — the creator of the second video.

## Pricing

10 free uses, then **$7.99/mo** for unlimited. Requires a (free) account.

## Install

Two options:

**A) One-line installer (from a terminal):**

```bash
curl buildpartner.ai/install.sh | sh
```

This adds the marketplace, installs the plugin, and configures the MCP server.

**B) Dashboard prompt:** sign up at https://www.buildpartner.ai/, copy the personalized install prompt from your dashboard, and paste it into Claude Code (it installs the plugin and connects your account).

> Heads-up: piping a remote `curl … | sh` script runs code on your machine. If you prefer, use option B and review what it does first.

## Use

```
/bp:expert-advice   What should I focus on building first?
/bp:improve-system   # reviews your setup, captures wins, audits for rot (run Mon & Fri)
```

**Source:** https://www.buildpartner.ai/
