@echo off
echo ============================================
echo  Rebuilding Qwen Ollama agents
echo  Adds tool-calling template + fixes ctx
echo ============================================
echo.

cd /d "%~dp0"

echo [1/3] Rebuilding qwen-planner (27B, ctx 8192)...
ollama create qwen-planner -f qwen-planner.mf
if %ERRORLEVEL% neq 0 (
    echo ERROR: qwen-planner failed. Is Ollama running?
    pause
    exit /b 1
)
echo Done.
echo.

echo [2/3] Rebuilding qwen-coder (35B MoE, ctx 16384)...
ollama create qwen-coder -f qwen-coder.mf
if %ERRORLEVEL% neq 0 (
    echo ERROR: qwen-coder failed.
    pause
    exit /b 1
)
echo Done.
echo.

echo [3/3] Rebuilding qwen-reviewer (35B MoE, ctx 16384)...
ollama create qwen-reviewer -f qwen-reviewer.mf
if %ERRORLEVEL% neq 0 (
    echo ERROR: qwen-reviewer failed.
    pause
    exit /b 1
)
echo Done.
echo.

echo ============================================
echo  All 3 models rebuilt successfully.
echo  Verify with: ollama list
echo ============================================
pause
