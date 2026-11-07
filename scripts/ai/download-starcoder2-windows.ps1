# StarCoder2 opt-in model downloader for Sandbox Protocol (Windows)
# Model weights are NOT bundled with the game. Run this only after installing the game.
$ErrorActionPreference = "Stop"
$ModelUrl = "https://huggingface.co/bartowski/StarCoder2-7B-GGUF/resolve/main/StarCoder2-7B-Q4_K_M.gguf"
$ModelDir = Join-Path $env:LOCALAPPDATA "SandboxProtocol\AI\models"
$ModelPath = Join-Path $ModelDir "starcoder2-7b-q4_k_m.gguf"
$ApproxGB = 4.5
Write-Host "Sandbox Protocol - optional StarCoder2 model download"
Write-Host "Model: StarCoder2 7B GGUF Q4_K_M (roughly 4.5 GB)"
Write-Host "Destination: $ModelPath"
Write-Host "This downloads model weights only; a compatible llama.cpp inference runtime is also required."
$answer = Read-Host "Download now? Type YES to confirm"
if ($answer -cne "YES") { Write-Host "Cancelled."; exit 0 }
New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null
if (Test-Path $ModelPath) { Write-Host "Model already exists at destination."; exit 0 }
try {
  Invoke-WebRequest -Uri $ModelUrl -OutFile $ModelPath
  if ((Get-Item $ModelPath).Length -lt 1000000000) { throw "Downloaded file is unexpectedly small; removing incomplete file." }
  Write-Host "Download complete. Model saved at: $ModelPath"
  Write-Host "For integrity, compare SHA-256 with the publisher's checksum if one is provided."
} catch {
  if (Test-Path $ModelPath) { Remove-Item $ModelPath -Force }
  Write-Error $_
  exit 1
}
