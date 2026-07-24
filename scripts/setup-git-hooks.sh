#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

chmod +x .githooks/pre-push
git config core.hooksPath .githooks

echo "Git hooks installed (.githooks/pre-push runs version-check before push)."
