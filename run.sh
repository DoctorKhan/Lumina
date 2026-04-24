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

run_tauri() {
  local jobs
  jobs="$(detect_parallel_jobs)"
  echo "Using CARGO_BUILD_JOBS=${jobs}"
  CARGO_BUILD_JOBS="$jobs" pnpm tauri "$@"
}

install_macos_app() {
  local app_name="Lumina.app"
  local bundle_path="$ROOT_DIR/src-tauri/target/release/bundle/macos/$app_name"

  if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "install:app is currently only supported on macOS."
    exit 1
  fi

  ensure_command ditto "ditto is required on macOS."
  "$0" tauri:build:app

  if [[ ! -d "$bundle_path" ]]; then
    echo "Missing app bundle: $bundle_path"
    exit 1
  fi

  rm -rf "/Applications/$app_name"
  ditto "$bundle_path" "/Applications/$app_name"
  echo "Installed /Applications/$app_name"
}

resolve_release_version() {
  local current="$1"
  local target="${2:-patch}"

  node -e '
const current = process.argv[1];
const target = process.argv[2];
const semver = /^(\d+)\.(\d+)\.(\d+)$/;
const m = current.match(semver);
if (!m) {
  console.error(`Invalid current version: ${current}`);
  process.exit(1);
}
let major = Number(m[1]);
let minor = Number(m[2]);
let patch = Number(m[3]);

if (target === "patch") patch += 1;
else if (target === "minor") { minor += 1; patch = 0; }
else if (target === "major") { major += 1; minor = 0; patch = 0; }
else if (semver.test(target)) {
  const n = target.match(semver);
  major = Number(n[1]);
  minor = Number(n[2]);
  patch = Number(n[3]);
} else {
  console.error("Release target must be patch, minor, major, or x.y.z");
  process.exit(1);
}

console.log(`${major}.${minor}.${patch}`);
' "$current" "$target"
}

run_release() {
  ensure_command git "Install git: https://git-scm.com/"
  ensure_command node "Install Node.js: https://nodejs.org/"

  local target="${1:-patch}"
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$branch" == "HEAD" ]]; then
    echo "Detached HEAD is not supported for release."
    exit 1
  fi

  local current_version
  current_version="$(node -e "const p=require('./package.json'); console.log(p.version)")"
  local next_version
  next_version="$(resolve_release_version "$current_version" "$target")"

  if [[ "$next_version" == "$current_version" ]]; then
    echo "Version unchanged ($current_version); nothing to release."
    exit 1
  fi

  echo "Releasing version $next_version from $current_version on branch $branch"

  RELEASE_VERSION="$next_version" node -e '
const fs = require("fs");
const path = require("path");
const version = process.env.RELEASE_VERSION;
const updateJsonVersion = (file) => {
  const p = path.resolve(file);
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  data.version = version;
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
};
updateJsonVersion("package.json");
updateJsonVersion("src-tauri/tauri.conf.json");

const cargoPath = path.resolve("src-tauri/Cargo.toml");
const cargo = fs.readFileSync(cargoPath, "utf8");
const updated = cargo.replace(/^version\s*=\s*"[0-9]+\.[0-9]+\.[0-9]+"$/m, `version = "${version}"`);
if (cargo === updated) {
  console.error("Failed to update version in src-tauri/Cargo.toml");
  process.exit(1);
}
fs.writeFileSync(cargoPath, updated);

const indexPath = path.resolve("index.html");
const indexHtml = fs.readFileSync(indexPath, "utf8");
const indexUpdated = indexHtml.replace(
  /(<span id="app-version-badge"[^>]*>)v[0-9]+\.[0-9]+\.[0-9]+(<\/span>)/,
  `$1v${version}$2`
);
if (indexHtml === indexUpdated) {
  console.error("Failed to update version badge in index.html");
  process.exit(1);
}
fs.writeFileSync(indexPath, indexUpdated);
'

  git add -A
  git commit -m "chore(release): v${next_version}"
  git push origin "$branch"

  echo "Release version v${next_version} committed and pushed."
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
  tauri:build:app Build macOS .app bundle only
  install:app   Build and install /Applications/Lumina.app from this checkout
  release [patch|minor|major|x.y.z]
               Bump versions, commit, and push current branch
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
    run_tauri dev
    ;;
  tauri:build)
    ensure_command pnpm "Install pnpm: https://pnpm.io/installation"
    ensure_command cargo "Install Rust toolchain: https://rustup.rs/"
    ./scripts/ensure-tauri-icons.sh
    run_tauri build
    ;;
  tauri:build:app)
    ensure_command pnpm "Install pnpm: https://pnpm.io/installation"
    ensure_command cargo "Install Rust toolchain: https://rustup.rs/"
    ./scripts/ensure-tauri-icons.sh
    run_tauri build --bundles app
    ;;
  install:app)
    install_macos_app
    ;;
  release)
    run_release "${2:-patch}"
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
