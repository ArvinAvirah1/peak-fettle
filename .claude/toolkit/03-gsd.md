# GSD — Get Shit Done

**What it does:** Fights "context rot." Instead of letting one long session degrade, it spawns fresh sub-agents per task (each with a clean context window) and keeps the main session clean. Built-in quality gates: scope-reduction detection (catches silently dropped requirements) and security enforcement anchored to a threat model. Has an autonomous mode to hand it a spec and walk away.

**Maintainer:** Community. The framework originates from the GSD / get-shit-done project; this is a performance-optimized plugin packaging by `jnuyens`.

## Install

In the Claude Code prompt, run all three:

```
/plugin marketplace add jnuyens/gsd-plugin
/plugin install gsd@gsd-plugin
/reload-plugins
```

This installs the slash commands, agent definitions, hooks, and an MCP server for project state.

## Use

List the available commands after install:

```
/gsd:help
```

(Type `/gsd` then Tab to see all namespaced commands.)

## Notes

- Not a token-saver — the sub-agents cost tokens. What it saves is the hours of redoing work Claude broke after forgetting earlier requirements.
- You can enable auto-update for the marketplace in Claude Code settings.

**Source:** https://github.com/jnuyens/gsd-plugin
