# Start the optional local StarCoder2 server for Sandbox Protocol.
# The model and llama.cpp runtime are separate opt-in downloads/installations.
$ErrorActionPreference = "Stop"
$Base = Join-Path $env:LOCALAPPDATA "SandboxProtocol\AI"
$Model = Join-Path $Base "models\starcoder2-7b-q4_k_m.gguf"
$Server = Join-Path $Base "runtime\llama-server.exe"
if (!(Test-Path $Model)) { Write-Error "Model not found. Run scripts/ai/download-starcoder2-windows.ps1 after installing the game."; exit 1 }
if (!(Test-Path $Server)) { Write-Error "llama-server.exe not found at $Server. Install a compatible llama.cpp server binary into the runtime folder."; exit 1 }
Write-Host "Starting local StarCoder2 API at http://127.0.0.1:8080/v1"
Write-Host "CPU-only mode, 3 threads, 2048 context to reduce memory pressure."
Write-Host "Keep this terminal open while using Local Mods. Ctrl+C stops the server."
& $Server --model $Model --host 127.0.0.1 --port 8080 --ctx-size 2048 --threads 3 --n-gpu-layers 0 --cors-origins '*'
