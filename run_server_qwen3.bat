@echo off
title llama.cpp >>> Qwen3-30B-A3B (Vulkan)
REM --------------------------------------------------------
REM  16GB VRAM config for Qwen3-30B-A3B-Q4_K_M (18.6 GB)
REM  -ngl 41  = 41 layers on GPU, ~7 layers spill to RAM
REM  -c 8192  = 8K context (saves VRAM vs 16K for larger model)
REM  --no-mmap = better for MoE models
REM  -p "..." = system prompt enabling thinking mode
REM --------------------------------------------------------
set BIN=C:\llama\bin
set MODEL=C:\llama\models\Qwen3-30B-A3B-Q4_K_M.gguf

"%BIN%\llama-server.exe" ^
  -m "%MODEL%" ^
  -ngl 41 ^
  -c 8192 ^
  --host 127.0.0.1 ^
  --port 8080 ^
  -np 1 ^
  --temp 0.6 ^
  --repeat-penalty 1.1 ^
  --no-mmap
