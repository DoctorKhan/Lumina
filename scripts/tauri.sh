#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

detect_parallel_jobs() {
  if [[ -n "${CARGO_BUILD_JOBS:-}" ]]; then
    echo "$CARGO_BUILD_JOBS"
    return
  fi

  if command -v sysctl >/dev/null 2>&1; then
    local cores
    cores="$(sysctl -n hw.logicalcpu 2>/dev/null || true)"
    if [[ -n "$cores" && "$cores" =~ ^[0-9]+$ && "$cores" -gt 0 ]]; then
      echo "$cores"
      return
    fi
  fi

  if command -v nproc >/dev/null 2>&1; then
    local cores
    cores="$(nproc 2>/dev/null || true)"
    if [[ -n "$cores" && "$cores" =~ ^[0-9]+$ && "$cores" -gt 0 ]]; then
      echo "$cores"
      return
    fi
  fi

  echo "4"
}

ensure_command pnpm "Install pnpm: https://pnpm.io/installation"
ensure_command cargo "Install Rust toolchain: https://rustup.rs/"

./scripts/ensure-tauri-icons.sh

jobs="$(detect_parallel_jobs)"
echo "Using CARGO_BUILD_JOBS=${jobs}"
CARGO_BUILD_JOBS="$jobs" pnpm tauri "$@"
