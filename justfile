# Lumina local task shortcuts (`just` https://github.com/casey/just)
# Install: brew install just   (or cargo install just)

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
	@just --list

_ensure-pnpm:
	@command -v pnpm >/dev/null 2>&1 || { echo "Missing dependency: pnpm"; echo "Install pnpm: https://pnpm.io/installation"; exit 1; }

# Install JS dependencies.
setup: _ensure-pnpm
	pnpm install

# Run Vite dev server only.
vite-dev: _ensure-pnpm
	pnpm dev

# Build frontend assets.
build: _ensure-pnpm
	pnpm build

# Run regression tests.
test: _ensure-pnpm
	pnpm test

# Run Tauri in development mode.
dev:
	bash scripts/tauri.sh dev

# Same as `just dev`, kept for clarity with Tauri command names.
tauri-dev:
	bash scripts/tauri.sh dev

# Build distributable Tauri app.
tauri-build:
	bash scripts/tauri.sh build

# Build macOS .app bundle only.
tauri-build-app:
	bash scripts/tauri.sh build --bundles app

# Build and install /Applications/Lumina.app from this checkout.
install-app:
	bash scripts/install-app.sh

# Bump versions, commit, tag, and push current branch.
release target='patch':
	node scripts/release.mjs {{target}}
