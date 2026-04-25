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

  JUST_BIN_DIR="${JUST_INSTALL_DIR:-$HOME/.local/bin}"
  mkdir -p "$JUST_BIN_DIR"

  # Piped invocations (e.g. curl install.sh | bash) have a non-tty stdin; still
  # need just for ./run.sh, so auto-install in that case.
  if [[ -t 0 ]]; then
    read -r -p "Install 'just' now? [y/N] " install_just
    case "$install_just" in
      [yY] | [yY][eE][sS]) ;;
      *)
        echo "Install skipped. See https://github.com/casey/just for installation options." >&2
        exit 127
        ;;
    esac
  else
    echo "Non-interactive shell: installing 'just' to $JUST_BIN_DIR" >&2
  fi

  curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh |
    bash -s -- --to "$JUST_BIN_DIR"

  if [[ ":$PATH:" != *":$JUST_BIN_DIR:"* ]]; then
    export PATH="$JUST_BIN_DIR:$PATH"
  fi

  if ! command -v just >/dev/null 2>&1; then
    echo "'just' was installed to $JUST_BIN_DIR, but it is still not available on PATH." >&2
    echo "Add it to PATH or rerun with JUST_INSTALL_DIR set to a directory already on PATH." >&2
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
