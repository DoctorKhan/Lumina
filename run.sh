#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
while [[ -L "$SCRIPT_PATH" ]]; do
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
  LINK_TARGET="$(readlink "$SCRIPT_PATH")"
  if [[ "$LINK_TARGET" = /* ]]; then
    SCRIPT_PATH="$LINK_TARGET"
  else
    SCRIPT_PATH="$SCRIPT_DIR/$LINK_TARGET"
  fi
done
ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
cd "$ROOT_DIR"

ensure_command() {
  local cmd="$1"
  local help="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing dependency: $cmd"
    echo "$help"
    exit 1
  fi
}

usage() {
  cat <<'EOF'
Usage: ./run.sh <command>

Commands:
  setup         Install JS dependencies with pnpm
  dev           Run Vite dev server
  build         Build frontend assets
  tauri:dev     Run Tauri in development mode
  tauri:build   Build distributable Tauri app
EOF
}

cmd="${1:-tauri:dev}"

case "$cmd" in
  setup)
    ensure_command pnpm "Install pnpm: https://pnpm.io/installation"
    pnpm install
    ;;
  dev)
    ensure_command pnpm "Install pnpm: https://pnpm.io/installation"
    pnpm dev
    ;;
  build)
    ensure_command pnpm "Install pnpm: https://pnpm.io/installation"
    pnpm build
    ;;
  tauri:dev)
    ensure_command pnpm "Install pnpm: https://pnpm.io/installation"
    ensure_command cargo "Install Rust toolchain: https://rustup.rs/"
    ./scripts/ensure-tauri-icons.sh
    pnpm tauri:dev
    ;;
  tauri:build)
    ensure_command pnpm "Install pnpm: https://pnpm.io/installation"
    ensure_command cargo "Install Rust toolchain: https://rustup.rs/"
    ./scripts/ensure-tauri-icons.sh
    pnpm tauri:build
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $cmd"
    usage
    exit 1
    ;;
esac
