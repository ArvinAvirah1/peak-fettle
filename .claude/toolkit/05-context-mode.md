# Context Mode

**What it does:** Two jobs. (1) Keeps garbage out of your context window — routes commands/URL fetches through a sandbox, captures raw output, and returns only the part Claude needs (their benchmark: a 56 KB Playwright snapshot → 299 bytes; ~315 KB of raw output over a session → ~5 KB). (2) Tracks every meaningful event (file edits, tasks, decisions, errors) in a local SQLite database, then rebuilds and re-injects a session snapshot after compaction so Claude picks up exactly where it left off. Sessions that fell apart at ~30 min can run ~3 hours.

**Maintainer:** Community (mksglu). Requires Claude Code v1.0.33+.

## Install

In the Claude Code prompt:

```
/plugin marketplace add mksglu/claude-context-mode
/plugin install context-mode@claude-context-mode
```

Then **restart Claude Code**. The plugin auto-installs the MCP server, hooks, and routing instructions.

## Use / check your savings

```
/context-mode:ctx-stats
```

Shows per-tool context savings for the current session (tokens consumed, savings ratio). Other meta-commands: `/ctx-doctor`, `/ctx-upgrade`, `/ctx-purge`, `/ctx-insight`.

**Source:** https://github.com/mksglu/context-mode · https://context-mode.com/
