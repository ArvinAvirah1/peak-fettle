# OpenAI Codex Plugin for Claude Code

**What it does:** Lets you call OpenAI's Codex model from inside Claude Code — the "multi-model" play. Use a second model for a different opinion, a second implementation pass, or to rescue a stuck session. Also a hedge: today's model pricing is heavily VC-subsidized, so keeping model-independence as a muscle is worth it.

**Maintainer:** OpenAI (official `codex-plugin-cc`).

## Requirements

- Node.js 18.18+
- A ChatGPT subscription (Free tier works) **or** an OpenAI API key.

## Install

In the Claude Code prompt, run in order:

```
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

`/codex:setup` checks whether Codex is ready.

## Use

```
/codex:rescue              # hand a stuck problem to Codex
/codex:review              # Codex review of uncommitted changes / branch diff
/codex:adversarial-review   # aggressive "devil's advocate" review
```

There's also a `codex-rescue` agent Claude can invoke proactively when it hits a wall.

**Source:** https://github.com/openai/codex-plugin-cc
