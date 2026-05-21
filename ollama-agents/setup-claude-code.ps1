# setup-claude-code.ps1
# Run this in PowerShell before launching Claude Code to route execution
# to your local Qwen agents via Ollama.
#
# USAGE: . .\setup-claude-code.ps1   (dot-source to persist in current shell)
#        then: claude

# Step 1: Point Claude Code at Ollama's Anthropic-compatible endpoint
$env:ANTHROPIC_BASE_URL = "http://localhost:11434"

# Step 2: Ollama doesn't validate API keys -- any non-empty string works
$env:ANTHROPIC_API_KEY = "ollama"

# Step 3: Map Claude's three internal model tiers to your local agents.
#   Haiku  -> fast, lightweight tasks (file summaries, short edits)  -> planner
#   Sonnet -> standard coding work (main workhorse)                  -> coder
#   Opus   -> complex reasoning (architecture, hard bugs)            -> coder
#   NOTE: Claude Code will use whichever tier fits the task.
#         Reviewer is NOT auto-routed -- trigger it manually (see below).
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL  = "qwen-planner"
$env:ANTHROPIC_DEFAULT_SONNET_MODEL = "qwen-coder"
$env:ANTHROPIC_DEFAULT_OPUS_MODEL   = "qwen-coder"

Write-Host "Claude Code -> Ollama routing configured" -ForegroundColor Green
Write-Host "  HAIKU  -> qwen-planner  (light tasks)"
Write-Host "  SONNET -> qwen-coder    (standard work)"
Write-Host "  OPUS   -> qwen-coder    (complex reasoning)"
Write-Host ""
Write-Host "Then launch: claude"
Write-Host ""
Write-Host "To trigger reviewer manually inside Claude Code:"
Write-Host "  /model qwen-reviewer  (then ask it to review the last diff)"
