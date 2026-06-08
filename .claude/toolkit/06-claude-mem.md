# Claude Mem (thedotmack)

**What it does:** Carries knowledge across all your future sessions. Hooks into Claude's session lifecycle, auto-captures what happened (file edits, decisions, bug fixes, commands), compresses it into semantic summaries, and stores it in a local SQLite database with vector search. Relevant parts are re-injected when you open a new session. Also auto-generates and updates folder-level CLAUDE.md files. Three-layer retrieval (compact index → timeline → full detail) reports ~10x token savings vs. dumping everything at session start. Includes a local web viewer to see what it remembers.

**Maintainer:** Community (thedotmack).

## Install

In the Claude Code prompt:

```
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

Then **restart Claude Code**.

(Alternative one-liner from a terminal: `npx claude-mem install`.)

## ⚠️ Warning from the repo

Do **not** rely on `npm install -g claude-mem`. That installs the SDK/library only — it does **not** register the hooks, so nothing actually works. Use the two `/plugin` commands above (or `npx claude-mem install`).

**Source:** https://github.com/thedotmack/claude-mem
