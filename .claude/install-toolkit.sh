#!/usr/bin/env bash
# Peak Fettle — install the dev toolkit.
# The "/plugin ..." lines must be run INSIDE Claude Code's prompt (not this shell).
# This script handles only the terminal-side MCP servers + node tools.
# Per-tool detail: .claude/toolkit/  •  routing: .claude/AGENT_TOOLKIT.md
set -euo pipefail

echo "== Peak Fettle toolkit =="
echo
echo "STEP 1 — run these INSIDE Claude Code (copy/paste at the prompt):"
cat <<'PLUGINS'
  # Anthropic official (marketplace built in)
  /plugin install skill-creator@claude-plugins-official
  /plugin install frontend-design@claude-plugins-official
  /plugin install security-guidance@claude-plugins-official
  # Methodology
  /plugin marketplace add obra/superpowers-marketplace
  /plugin install superpowers@superpowers-marketplace
  /plugin marketplace add jnuyens/gsd-plugin
  /plugin install gsd@gsd-plugin
  /reload-plugins
  /plugin marketplace add EveryInc/compound-engineering-plugin
  /plugin install compound-engineering@EveryInc-compound-engineering-plugin
  # Context + memory  (restart Claude Code after each)
  /plugin marketplace add mksglu/claude-context-mode
  /plugin install context-mode@claude-context-mode
  /plugin marketplace add thedotmack/claude-mem
  /plugin install claude-mem
  # Token trim (optional)
  /plugin marketplace add JuliusBrussee/caveman
  /plugin install caveman@caveman
  # Cross-model review
  /plugin marketplace add openai/codex-plugin-cc
  /plugin install codex@openai-codex
  /reload-plugins
  /codex:setup
  # Morph Flash Compact plugin (then run /morph-compact:install)
  /plugin marketplace add morphllm/morph-claude-code-plugin
  /plugin install morph-compact@morph-claude-code-plugin
PLUGINS
echo
echo "STEP 2 — MCP servers / connectors (this shell). Export keys first where noted."
echo
run() { echo "+ $*"; "$@"; }

# Exa (semantic search) — hosted; key optional for basic use
if command -v claude >/dev/null 2>&1; then
  run claude mcp add --transport http exa https://mcp.exa.ai/mcp || true
  # Higgsfield (media gen) — sign in via browser, no key
  run claude mcp add --transport http higgsfield https://mcp.higgsfield.ai/mcp || true
  # Firecrawl (clean web extract) — needs FIRECRAWL_API_KEY
  if [ "${FIRECRAWL_API_KEY:-}" != "" ]; then
    run claude mcp add firecrawl -e FIRECRAWL_API_KEY="$FIRECRAWL_API_KEY" -- npx -y firecrawl-mcp || true
  else
    echo "  (skip firecrawl: set FIRECRAWL_API_KEY to enable)"
  fi
  # Morph MCP (Fast Apply + WarpGrep) — needs MORPH_API_KEY
  if [ "${MORPH_API_KEY:-}" != "" ]; then
    run claude mcp add morph -e MORPH_API_KEY="$MORPH_API_KEY" -- npx -y @morphllm/morphmcp || true
  else
    echo "  (skip morph MCP: set MORPH_API_KEY to enable)"
  fi
else
  echo "  'claude' CLI not found on PATH — install Claude Code, then re-run."
fi

echo
echo "STEP 3 — token dashboard (no install): run 'npx codeburn' anytime."
echo "Done. /review and /ultra-review are built in (Claude Code >= 2.1.86, signed-in account)."
