#!/usr/bin/env bash
set -Eeuo pipefail

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

ensure_just() {
  if command -v just >/dev/null 2>&1; then
    return
  fi

  echo "'just' was not found on PATH." >&2
  echo "Install docs: https://github.com/casey/just" >&2

  if [[ ! -t 0 ]]; then
    echo "Run this script from an interactive shell to install it automatically." >&2
    exit 127
  fi

  read -r -p "Install 'just' now? [y/N] " install_just
  case "$install_just" in
    [yY] | [yY][eE][sS]) ;;
    *)
      echo "Install skipped. See https://github.com/casey/just for installation options." >&2
      exit 127
      ;;
  esac

  curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh |
    bash -s -- --to "${JUST_INSTALL_DIR:-/usr/local/bin}"

  if ! command -v just >/dev/null 2>&1; then
    echo "'just' was installed, but it is still not available on PATH." >&2
    exit 127
  fi
}

ensure_just
cd "$ROOT_DIR"

if [[ "$#" -eq 0 ]]; then
  exec just --list
fi

case "$1" in
  help | -h | --help)
    exec just --list
    ;;
  just)
    shift
    if [[ "$#" -eq 0 ]]; then
      exec just --list
    fi
    ;;
esac

exec just "$@"
