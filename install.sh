#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/DoctorKhan/Lumina.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.lumina}"
APP_NAME="Lumina.app"

require_command() {
  local cmd="$1"
  local help="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing dependency: $cmd"
    echo "$help"
    exit 1
  fi
}

require_command git "Install git from https://git-scm.com/"
require_command pnpm "Install pnpm from https://pnpm.io/installation"
require_command cargo "Install Rust via https://rustup.rs/"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "Updating existing checkout in $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch --all --tags
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "Cloning repository to $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
./run.sh setup
./scripts/ensure-tauri-icons.sh

if [[ "$OSTYPE" == "darwin"* ]]; then
  pnpm tauri build --bundles app
else
  ./run.sh tauri:build
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
  BUNDLE_PATH="$INSTALL_DIR/src-tauri/target/release/bundle/macos/$APP_NAME"
  if [[ -d "$BUNDLE_PATH" ]]; then
    cp -R "$BUNDLE_PATH" /Applications/
    echo "Installed /Applications/$APP_NAME"
    exit 0
  fi
fi

echo "Build complete."
echo "Install artifact is in: $INSTALL_DIR/src-tauri/target/release/bundle"
