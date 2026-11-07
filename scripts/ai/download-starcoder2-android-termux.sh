#!/data/data/com.termux/files/usr/bin/bash
# Optional StarCoder2 model downloader for Android (Termux).
# Model weights are not bundled in the game. Requires Termux and curl.
set -eu
MODEL_URL="https://huggingface.co/bartowski/StarCoder2-7B-GGUF/resolve/main/StarCoder2-7B-Q4_K_M.gguf"
MODEL_DIR="$HOME/models/sandbox-protocol"
MODEL_PATH="$MODEL_DIR/starcoder2-7b-q4_k_m.gguf"
echo "Sandbox Protocol optional StarCoder2 download"
echo "StarCoder2 7B GGUF Q4_K_M is approximately 4.5 GB."
echo "This model-only download does not install an inference runtime."
printf 'Download now? Type YES to confirm: '
read answer
[ "$answer" = "YES" ] || { echo "Cancelled."; exit 0; }
mkdir -p "$MODEL_DIR"
[ ! -f "$MODEL_PATH" ] || { echo "Already downloaded: $MODEL_PATH"; exit 0; }
command -v curl >/dev/null 2>&1 || { echo "curl is required (in Termux: pkg install curl)"; exit 1; }
tmp="$MODEL_PATH.part"
trap 'rm -f "$tmp"' EXIT
curl -fL --retry 3 --progress-bar "$MODEL_URL" -o "$tmp"
size=$(wc -c < "$tmp")
[ "$size" -gt 1000000000 ] || { echo "Downloaded file is unexpectedly small."; exit 1; }
mv "$tmp" "$MODEL_PATH"
trap - EXIT
echo "Download complete: $MODEL_PATH"
echo "Compare SHA-256 with publisher checksum when available: sha256sum \"$MODEL_PATH\""
