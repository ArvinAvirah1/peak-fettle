@echo off
title Downloading Qwen3-30B-A3B Q4_K_M (resumable)
echo ================================================
echo  Qwen3-30B-A3B-Q4_K_M.gguf -- resuming download
echo  Target: C:\llama\models\
echo ================================================
echo.

REM Kill any stalled curl process first
echo Killing any stalled curl processes...
taskkill /f /im curl.exe 2>nul
timeout /t 2 /nobreak >nul

echo Resuming download (will pick up from where it stopped)...
echo.

curl -L -C - --progress-bar ^
  -o "C:\llama\models\Qwen3-30B-A3B-Q4_K_M.gguf" ^
  "https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF/resolve/main/Qwen3-30B-A3B-Q4_K_M.gguf"

echo.
for %%A in ("C:\llama\models\Qwen3-30B-A3B-Q4_K_M.gguf") do (
    echo File size: %%~zA bytes
)
echo Expected:  ~19,974,823,936 bytes (18.6 GB)
pause
