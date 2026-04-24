#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/DoctorKhan/Lumina.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.lumina}"
GIT_REF="${GIT_REF:-origin/main}"
APP_NAME="Lumina.app"
APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.doctorkhan.lumina}"

is_interactive_shell() {
  [[ -t 0 && -t 1 ]]
}

confirm() {
  local prompt="$1"
  local default="${2:-N}"
  local reply=""

  if ! is_interactive_shell; then
    return 1
  fi

  if [[ "$default" == "Y" ]]; then
    printf "%s [Y/n]: " "$prompt"
  else
    printf "%s [y/N]: " "$prompt"
  fi

  read -r reply || return 1
  if [[ -z "$reply" ]]; then
    [[ "$default" == "Y" ]]
    return
  fi

  [[ "$reply" =~ ^[Yy]([Ee][Ss])?$ ]]
}

install_cli_launcher() {
  local launcher_target="/Applications/${APP_NAME}"
  local bin_dir="$HOME/.local/bin"
  local launcher_path=""
  mkdir -p "$bin_dir"

  launcher_path="${bin_dir}/lumina"
  if [[ -L "$launcher_path" || -f "$launcher_path" ]]; then
    rm -f "$launcher_path"
  elif [[ -e "$launcher_path" ]]; then
    echo "Cannot install CLI launcher: $launcher_path exists and is not a file or symlink."
    return 1
  fi

  cat >"$launcher_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-}" == "update" || "\${1:-}" == "--update" ]]; then
  curl -fsSL https://raw.githubusercontent.com/DoctorKhan/Lumina/main/install.sh | bash
  exit 0
fi

open -a "$launcher_target" "\$@"
EOF
  chmod +x "$launcher_path"

  echo "Installed CLI launcher: $launcher_path"

  if [[ ":$PATH:" == *":$bin_dir:"* ]]; then
    return
  fi

  local linked_dir=""
  local old_ifs="$IFS"
  local seen_dirs=":"
  IFS=':'
  for path_dir in $PATH; do
    [[ -z "$path_dir" ]] && continue
    if [[ "$seen_dirs" == *":$path_dir:"* ]]; then
      continue
    fi
    seen_dirs="${seen_dirs}${path_dir}:"

    if [[ "$path_dir/lumina" == "$launcher_path" ]]; then
      continue
    fi

    if [[ -d "$path_dir" && -w "$path_dir" ]]; then
      if ln -sf "$launcher_path" "$path_dir/lumina" 2>/dev/null; then
        linked_dir="$path_dir"
        echo "Linked launcher at: $path_dir/lumina"
        break
      fi
    fi
  done
  IFS="$old_ifs"

  if [[ -z "$linked_dir" ]]; then
    for fallback_dir in /usr/local/bin /opt/homebrew/bin; do
      if [[ -d "$fallback_dir" && -w "$fallback_dir" ]]; then
        ln -sf "$launcher_path" "$fallback_dir/lumina" || true
        echo "Linked launcher at: $fallback_dir/lumina"
        linked_dir="$fallback_dir"
        break
      fi
    done
  fi

  if [[ -n "$linked_dir" ]]; then
    return
  fi

  if [[ ":$PATH:" != *":$bin_dir:"* ]]; then
    echo "Add $bin_dir to your PATH to use 'lumina' from terminal."
  else
    echo "No writable PATH directory found for symlink; using $launcher_path directly."
  fi
}

associate_markdown_files() {
  if ! command -v duti >/dev/null 2>&1; then
    if command -v brew >/dev/null 2>&1 && confirm "Install duti to set file associations now?" "N"; then
      brew install duti
    else
      echo "Optional: install duti later to set .md defaults automatically:"
      echo "  brew install duti"
      return
    fi
  fi

  if ! command -v duti >/dev/null 2>&1; then
    echo "duti is not available; skipping file association setup."
    return
  fi

  if ! confirm "Associate .md/.markdown/.txt with Lumina?" "Y"; then
    echo "Skipped file association setup."
    return
  fi

  duti -s "$APP_BUNDLE_ID" .md all
  duti -s "$APP_BUNDLE_ID" .markdown all
  duti -s "$APP_BUNDLE_ID" .txt all
  echo "Associated .md/.markdown/.txt with $APP_NAME"
}

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
  # This install directory is managed by the installer, so we can safely
  # discard local/untracked build artifacts before updating.
  git -C "$INSTALL_DIR" reset --hard "$GIT_REF"
  git -C "$INSTALL_DIR" clean -fd
else
  echo "Cloning repository to $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
if [[ ! -d ".git" ]]; then
  echo "Install directory is not a git checkout: $INSTALL_DIR"
  exit 1
fi

echo "Installing Lumina from $GIT_REF"
git fetch --all --tags
git reset --hard "$GIT_REF"
git clean -fd
./run.sh setup
./scripts/ensure-tauri-icons.sh

if [[ "$OSTYPE" == "darwin"* ]]; then
  ./run.sh tauri:build:app
else
  ./run.sh tauri:build
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
  BUNDLE_PATH="$INSTALL_DIR/src-tauri/target/release/bundle/macos/$APP_NAME"
  if [[ -d "$BUNDLE_PATH" ]]; then
    rm -rf "/Applications/$APP_NAME"
    ditto "$BUNDLE_PATH" "/Applications/$APP_NAME"
    echo "Installed /Applications/$APP_NAME"
    install_cli_launcher
    associate_markdown_files
    exit 0
  fi
fi

echo "Build complete."
echo "Install artifact is in: $INSTALL_DIR/src-tauri/target/release/bundle"
