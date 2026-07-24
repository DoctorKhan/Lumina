# Lumina local task shortcuts (`just` https://github.com/casey/just)
# Install: brew install just   (or cargo install just)

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

[group('Help')]
default:
	@just --list --unsorted

_ensure-pnpm:
	@command -v pnpm >/dev/null 2>&1 || { echo "Missing dependency: pnpm"; echo "Install pnpm: https://pnpm.io/installation"; exit 1; }

# Install JS dependencies and optional git hooks.
[group('Bootstrap')]
setup: _ensure-pnpm
	pnpm install
	@bash scripts/setup-git-hooks.sh

# Run Vite dev server only.
[group('Dev')]
vite-dev: _ensure-pnpm
	pnpm dev

# Build frontend assets.
[group('Build')]
build: _ensure-pnpm
	pnpm build

# Run regression tests and verify all version sources match.
[group('Quality')]
test: _ensure-pnpm
	pnpm test
	just version-check

# Fail if package.json, Cargo.toml, tauri.conf.json, and index.html disagree.
[group('Release')]
version-check:
	node scripts/release.mjs check

# Bump versions, commit, tag, and push current branch.
[group('Release')]
release target='patch':
	node scripts/release.mjs {{target}}

# Run Tauri in development mode.
[group('Dev')]
dev:
	@cd "{{justfile_directory()}}" && bash scripts/tauri.sh dev

# Same as `just dev`, kept for clarity with Tauri command names.
[group('Dev')]
tauri-dev:
	@cd "{{justfile_directory()}}" && bash scripts/tauri.sh dev

# Build distributable Tauri app.
[group('Build')]
tauri-build:
	@cd "{{justfile_directory()}}" && bash scripts/tauri.sh build

# Build macOS .app bundle only.
[group('Build')]
tauri-build-app:
	@cd "{{justfile_directory()}}" && bash scripts/tauri.sh build --bundles app

# Build and install /Applications/Lumina.app from this checkout.
[group('Build')]
install-app:
	@cd "{{justfile_directory()}}" && bash scripts/install-app.sh

# Print the exact prompt context sent to Claude.
[group('AI Helpers')]
claude-commit-prompt:
	@cd "{{justfile_directory()}}" && bash scripts/claude-commit-push.sh show-prompt

# Ask Claude to draft and save a commit message.
[group('AI Helpers')]
claude-commit-message:
	@cd "{{justfile_directory()}}" && bash scripts/claude-commit-push.sh generate-message

# Commit and push using saved message file.
[group('AI Helpers')]
claude-commit-apply:
	@cd "{{justfile_directory()}}" && bash scripts/claude-commit-push.sh apply

# Use Claude to draft a commit message, then commit and push.
[group('AI Helpers')]
claude-commit-push:
	@cd "{{justfile_directory()}}" && bash scripts/claude-commit-push.sh run
