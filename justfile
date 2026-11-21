# Lumina tasks (`just` https://github.com/casey/just). Run `just` to list.
#
# Everyday:
#   just dev        run the app with hot reload
#   just install    rebuild this checkout and install /Applications/Lumina.app (~20s incremental)
#   just test       JS tests + version check
#   just release    test, bump patch version, tag, push, publish GitHub release

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

alias install-app := install
alias tauri-dev := dev

[private]
default:
	@just --list --unsorted

# Run the Tauri app in development mode (hot reload).
[group('Everyday')]
dev:
	@cd "{{justfile_directory()}}" && bash scripts/tauri.sh dev

# Rebuild this checkout (including uncommitted changes) and install it to /Applications.
[group('Everyday')]
install:
	@cd "{{justfile_directory()}}" && bash scripts/install-app.sh

# Run JS regression tests and verify all version sources match.
[group('Everyday')]
test: _ensure-pnpm
	pnpm test
	just version-check

# Test, bump version (patch|minor|major|x.y.z), commit, tag, push, publish.
[group('Everyday')]
release target='patch': test
	node scripts/release.mjs {{target}}

# Install JS dependencies and git hooks.
[group('More')]
setup: _ensure-pnpm
	pnpm install
	@bash scripts/setup-git-hooks.sh

# Run only the Vite frontend in a browser.
[group('More')]
vite-dev: _ensure-pnpm
	pnpm dev

# Build frontend assets only.
[group('More')]
build: _ensure-pnpm
	pnpm build

# Build the macOS .app bundle without installing it.
[group('More')]
tauri-build-app:
	@cd "{{justfile_directory()}}" && bash scripts/tauri.sh build --bundles app

# Build all distributable Tauri bundles (.app + .dmg).
[group('More')]
tauri-build:
	@cd "{{justfile_directory()}}" && bash scripts/tauri.sh build

# Fail if package.json, Cargo.toml, tauri.conf.json, and index.html disagree.
[group('More')]
version-check:
	node scripts/release.mjs check

# Ask Claude to draft a commit message, then commit and push.
[group('AI Helpers')]
claude-commit-push:
	@cd "{{justfile_directory()}}" && bash scripts/claude-commit-push.sh run

# Print the exact prompt context sent to Claude.
[group('AI Helpers')]
claude-commit-prompt:
	@cd "{{justfile_directory()}}" && bash scripts/claude-commit-push.sh show-prompt

# Ask Claude to draft and save a commit message.
[group('AI Helpers')]
claude-commit-message:
	@cd "{{justfile_directory()}}" && bash scripts/claude-commit-push.sh generate-message

# Commit and push using the saved message file.
[group('AI Helpers')]
claude-commit-apply:
	@cd "{{justfile_directory()}}" && bash scripts/claude-commit-push.sh apply

_ensure-pnpm:
	@command -v pnpm >/dev/null 2>&1 || { echo "Missing dependency: pnpm"; echo "Install pnpm: https://pnpm.io/installation"; exit 1; }
