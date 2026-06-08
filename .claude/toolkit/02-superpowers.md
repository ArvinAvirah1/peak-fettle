# Superpowers (obra / Jesse Vincent)

**What it does:** Forces Claude to work like a senior engineer — plan first, work in an isolated environment, write tests before code, brainstorm, and self-review in two passes (spec match + code quality). Reduces rushed, sloppy "looks-fine-but-breaks" output.

**Maintainer:** Community (obra). One of the most popular community frameworks.

## Install

In the Claude Code prompt, add the marketplace, then install:

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

## Use

The plugin adds commands and a skills-search tool, plus context injection at session start:

```
/brainstorm
/write-plan
/execute-plan
```

## Notes

- Works across multiple agents (Claude Code, Codex, Gemini CLI, Cursor, etc.).
- These methodology frameworks spend extra tokens up front (planning/testing) to save debugging cycles later — best for anything going to production.

**Source:** https://github.com/obra/superpowers · https://github.com/obra/superpowers-marketplace
