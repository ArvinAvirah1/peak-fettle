@echo off
echo Starting Local LLM Setup (llama.cpp Vulkan + Qwen2.5-Coder-14B)...
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0setup_local_llm.ps1"
pause
