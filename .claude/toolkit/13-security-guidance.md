# Security Guidance (Anthropic, official)

**What it does:** Run your app through a security audit yourself before launch — find holes and plug them. Great for anyone shipping an app.

**Maintainer:** Anthropic — official directory (`claude-plugins-official`).

## Install

```
/plugin install security-guidance@claude-plugins-official
```

Or `/plugin` → **Discover** → Security Guidance.

## Use

After install, ask Claude to run a security review of your project, or use the built-in `/security-review` command for a focused pass on pending changes.

## Why the official ones

The maintainer matters: because these are Anthropic-built, expect them to be maintained and improved over time. The full internal directory also includes `code-review`, `pr-review-toolkit`, `feature-dev`, `plugin-dev`, `mcp-server-dev`, language LSP plugins, and more — browse them with `/plugin` → Discover.

**Source:** https://github.com/anthropics/claude-plugins-official (plugin: `security-guidance`)
