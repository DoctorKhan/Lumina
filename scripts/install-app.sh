#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Lumina.app"
BUNDLE_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/$APP_NAME"

if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "install-app is currently only supported on macOS."
  exit 1
fi

if ! command -v ditto >/dev/null 2>&1; then
  echo "Missing dependency: ditto"
  echo "ditto is required on macOS."
  exit 1
fi

cd "$ROOT_DIR"
just tauri-build-app

if [[ ! -d "$BUNDLE_PATH" ]]; then
  echo "Missing app bundle: $BUNDLE_PATH"
  exit 1
fi

rm -rf "/Applications/$APP_NAME"
ditto "$BUNDLE_PATH" "/Applications/$APP_NAME"
echo "Installed /Applications/$APP_NAME"
