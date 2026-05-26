#!/usr/bin/env bash
set -euo pipefail

# Build and install /Applications/Lumina.app from this checkout.
# Delegates to install.sh in local-build mode so the build/install steps — and
# the progress contract the in-app "Rebuild & Install" card reads — live in one
# place instead of being duplicated here.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "install-app is currently only supported on macOS."
  exit 1
fi

exec env LUMINA_LOCAL_BUILD=1 bash "$ROOT_DIR/install.sh"
