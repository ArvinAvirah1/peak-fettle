# CodeBurn (token spend dashboard)

**What it does:** Shows exactly where your tokens go and how to cut costs. It reads the session transcripts Claude Code stores locally (`~/.claude/projects/`), classifies every interaction, and applies Anthropic's per-token rates to show what a pay-as-you-go bill *would* have been — so you can see, e.g., why a $200/mo Max plan is "using" far more in token value. Then it suggests concrete ways to save.

**Maintainer:** getagentseal. Runs as a **local TUI** — no account, no login, no telemetry leaving your machine.

## Install / run

One line from a terminal (no install step needed):

```bash
npx codeburn
```

## Use

1. Run `npx codeburn`, then press **O** to see a list of token-saving suggestions.
2. Copy the whole list and paste it into Claude Code.
3. Claude turns the suggestions into fixes — apply them to start saving tokens (and stop hitting limits mid-day).

**Source:** https://github.com/getagentseal/codeburn · https://codeburn.app/
