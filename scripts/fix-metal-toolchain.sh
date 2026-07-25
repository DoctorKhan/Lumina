#!/usr/bin/env bash
set -euo pipefail

echo "→ Switching Xcode developer path..."
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer

echo "→ Verifying developer path..."
xcode-select -p

echo "→ Downloading Metal toolchain..."
xcodebuild -downloadComponent MetalToolchain

echo "→ Verifying Metal toolchain..."
xcodebuild -downloadComponent MetalToolchain || true

echo "→ Done."
