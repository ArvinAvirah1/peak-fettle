# ============================================================
# Local LLM Setup — llama.cpp Vulkan + Qwen2.5-Coder-14B Q6_K
# RX 9070 XT (16GB VRAM) + 32GB RAM — best config for Claude Code
# Run this by right-clicking > "Run with PowerShell"
# ============================================================

$ErrorActionPreference = "Stop"

# ---- Config ------------------------------------------------
$LlamaDir   = "C:\llama"
$BinDir     = "$LlamaDir\bin"
$ModelsDir  = "$LlamaDir\models"
$LlamaZip   = "$LlamaDir\llama-vulkan.zip"
$LlamaURL   = "https://github.com/ggml-org/llama.cpp/releases/download/b9025/llama-b9025-bin-win-vulkan-x64.zip"
$ModelFile  = "$ModelsDir\Qwen2.5-Coder-14B-Instruct-Q6_K.gguf"
$ModelURL   = "https://huggingface.co/bartowski/Qwen2.5-Coder-14B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-14B-Instruct-Q6_K.gguf"
# ------------------------------------------------------------

function Write-Step($msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Write-OK($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Write-Info($msg) {
    Write-Host "  [..] $msg" -ForegroundColor Yellow
}

# ---- Create directories ------------------------------------
Write-Step "Creating directories"
@($LlamaDir, $BinDir, $ModelsDir) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ | Out-Null
        Write-OK "Created: $_"
    } else {
        Write-OK "Already exists: $_"
    }
}

# ---- Download llama.cpp Vulkan binary ----------------------
Write-Step "Downloading llama.cpp b9025 (Windows Vulkan x64)"
Write-Info "URL: $LlamaURL"
Write-Info "This is ~50MB, should be quick..."

$wc = New-Object System.Net.WebClient
$wc.Headers.Add("User-Agent", "Mozilla/5.0")
try {
    $wc.DownloadFile($LlamaURL, $LlamaZip)
    Write-OK "Downloaded to: $LlamaZip"
} catch {
    Write-Host "`n  [ERR] Download failed: $_" -ForegroundColor Red
    Write-Host "  Try downloading manually: $LlamaURL" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# ---- Extract -----------------------------------------------
Write-Step "Extracting llama.cpp..."
Expand-Archive -Path $LlamaZip -DestinationPath $BinDir -Force
Remove-Item $LlamaZip -Force
Write-OK "Extracted to: $BinDir"

# Flatten if extracted into a subfolder
$subDirs = Get-ChildItem -Path $BinDir -Directory
if ($subDirs.Count -eq 1) {
    $sub = $subDirs[0].FullName
    Get-ChildItem -Path $sub | Move-Item -Destination $BinDir -Force
    Remove-Item $sub -Force -Recurse
    Write-OK "Flattened directory structure"
}

# ---- Download model ----------------------------------------
Write-Step "Downloading Qwen2.5-Coder-14B-Instruct Q6_K (~11.3 GB)"
Write-Info "This will take a while depending on your connection."
Write-Info "Destination: $ModelFile"
Write-Host ""

# Use BITS for resumable download (better than WebClient for large files)
try {
    Import-Module BitsTransfer
    Start-BitsTransfer `
        -Source $ModelURL `
        -Destination $ModelFile `
        -DisplayName "Qwen2.5-Coder-14B Q6_K" `
        -Description "Downloading from HuggingFace..." `
        -Priority Foreground
    Write-OK "Model downloaded: $ModelFile"
} catch {
    Write-Host "  BITS transfer failed, falling back to WebClient (no progress bar)..." -ForegroundColor Yellow
    $wc2 = New-Object System.Net.WebClient
    $wc2.Headers.Add("User-Agent", "Mozilla/5.0")
    $wc2.DownloadFile($ModelURL, $ModelFile)
    Write-OK "Model downloaded: $ModelFile"
}

# ---- Write run.bat -----------------------------------------
Write-Step "Writing launch scripts"

$runBat = @"
@echo off
title llama.cpp — Qwen2.5-Coder-14B (Vulkan)
REM -------------------------------------------------------
REM  16GB VRAM config:
REM   -ngl 99    = all layers on GPU
REM   -c 16384   = 16K context (leaves ~4GB for KV cache)
REM   --temp 0.2 = low temp for coding
REM   -p "..."   = system prompt
REM -------------------------------------------------------
set BIN=C:\llama\bin
set MODEL=C:\llama\models\Qwen2.5-Coder-14B-Instruct-Q6_K.gguf

"%BIN%\llama-server.exe" ^
  -m "%MODEL%" ^
  -ngl 99 ^
  -c 16384 ^
  --host 127.0.0.1 ^
  --port 8080 ^
  -np 1 ^
  --temp 0.2 ^
  --repeat-penalty 1.1
"@

$runBat | Set-Content "$LlamaDir\run_server.bat" -Encoding ASCII
Write-OK "Created: $LlamaDir\run_server.bat"

# ---- Write claude_code_config snippet ----------------------
$claudeConfig = @"
# ============================================================
# Claude Code — Local LLM via llama.cpp (Vulkan, RX 9070 XT)
# ============================================================
# Add this to your Claude Code settings or use as reference.
#
# 1. Start the local server first by running:
#       C:\llama\run_server.bat
#
# 2. The server will be at: http://127.0.0.1:8080
#
# 3. In Claude Code, you can point sub-agents to this endpoint.
#    The API is OpenAI-compatible:
#
#    Base URL : http://127.0.0.1:8080/v1
#    API Key  : (any string, e.g. "local")
#    Model    : (any string, e.g. "qwen2.5-coder")
#
# ============================================================
# Performance notes for RX 9070 XT (16GB VRAM):
#
#  Q6_K  = 11.3GB VRAM — 4.7GB free for KV cache (RECOMMENDED)
#  Q8_0  = 15.7GB VRAM — only ~300MB free for KV cache
#
#  -ngl 99   = all 40 layers on GPU (fully offloaded)
#  -c 16384  = 16K context fits comfortably
#  -c 32768  = 32K context possible (tight on VRAM, test first)
# ============================================================
"@

$claudeConfig | Set-Content "$LlamaDir\claude_code_notes.txt" -Encoding UTF8
Write-OK "Created: $LlamaDir\claude_code_notes.txt"

# ---- Done --------------------------------------------------
Write-Host "`n============================================" -ForegroundColor Green
Write-Host " ALL DONE!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host " llama.cpp binary : $BinDir"
Write-Host " Model            : $ModelFile"
Write-Host " Launch server    : $LlamaDir\run_server.bat"
Write-Host " Notes            : $LlamaDir\claude_code_notes.txt"
Write-Host ""
Write-Host " To start: double-click run_server.bat" -ForegroundColor Cyan
Write-Host " Server will be at: http://127.0.0.1:8080" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to close"
