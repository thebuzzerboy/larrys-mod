#!/data/data/com.termux/files/usr/bin/bash
# Launch the opt-in local StarCoder2 server on Android via Termux.
set -eu
MODEL="$HOME/models/sandbox-protocol/starcoder2-7b-q4_k_m.gguf"
if [ ! -f "$MODEL" ]; then
  echo "Model missing. Run download-starcoder2-android-termux.sh first."
  exit 1
fi
if ! command -v llama-server >/dev/null 2>&1; then
  printf "llama-server isn't installed. Install Termux package llama-cpp now? [y/N] "
  read answer
  case "$answer" in y|Y|yes|YES) pkg install llama-cpp ;; *) echo "Cancelled."; exit 1 ;; esac
fi
command -v llama-server >/dev/null 2>&1 || { echo "llama-server still unavailable; check the Termux package install."; exit 1; }
echo "Starting local StarCoder2 API at http://127.0.0.1:8080/v1"
echo "CPU-first mode, 2048 context. Keep Termux in foreground; Ctrl+C stops server."
exec llama-server --model "$MODEL" --host 127.0.0.1 --port 8080 --ctx-size 2048 --threads 4 --n-gpu-layers 0 --cors-origins '*'
