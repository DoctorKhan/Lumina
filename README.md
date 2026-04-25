# Lumina

Lumina is a desktop Markdown editor for writing technical notes that mix prose,
code, diagrams, and math. It pairs a Vite-powered editor and live preview with a
Tauri shell, so it can run like a native app while still keeping the frontend
simple and hackable.

The repo contains the full desktop app, installer, release tooling, and local
task shortcuts used to build and ship Lumina.

## What It Does

- Edits Markdown with a live rendered preview.
- Renders LaTeX with KaTeX, syntax-highlighted code blocks, and Mermaid diagrams.
- Opens `.md`, `.markdown`, and `.txt` files, remembers recent files, and can save
  edited Markdown back to disk.
- Provides native menus for file actions, undo/redo, preview HTML copy, view
  toggles, updates, and repository links.
- Includes optional side panes for an embedded terminal and a Claude workflow for
  sending context and pulling edited content back into Lumina.
- Builds into a Tauri desktop app with macOS file association support.

## Install

On macOS, the public installer clones or updates the managed checkout in
`~/.lumina`, installs dependencies, builds the app, copies `Lumina.app` to
`/Applications`, and installs a `lumina` launcher when possible.

```bash
curl -fsSL https://raw.githubusercontent.com/DoctorKhan/Lumina/main/install.sh | bash
```

The first run compiles the Tauri app locally, which often takes several minutes
(depending on your machine). Let it finish unless you see a real error.

`run.sh` installs a local `just` binary when needed, including for piped installs
where stdin is not a TTY, so the one-liner above does not require `just` to be
preinstalled.

The installer uses `pnpm` and Rust/Cargo, so install those first if they are not
already available:

```bash
corepack enable
rustup default stable
```

If `duti` is available, the installer can also associate `.md`, `.markdown`, and
`.txt` files with Lumina.

## Local Development

Use `run.sh` from the repo root. It delegates to the `justfile` and will offer to
install `just` if it is missing.

```bash
./run.sh setup
./run.sh dev
```

`./run.sh dev` starts the Tauri development app. If you only need the browser
frontend, run:

```bash
./run.sh vite-dev
```

## Common Commands

```bash
./run.sh              # list available tasks
./run.sh setup        # install JS dependencies with pnpm
./run.sh dev          # run Tauri in development mode
./run.sh vite-dev     # run only the Vite frontend
./run.sh build        # build frontend assets
./run.sh test         # run regression tests
./run.sh tauri-build  # build distributable Tauri bundles
./run.sh install-app  # build and install /Applications/Lumina.app
```

## Repo Layout

- `index.html` defines the main app frame and panes.
- `src/main.js` contains the editor, preview rendering, terminal, Claude, file,
  and update flows.
- `src/styles.css` contains the app styling.
- `src/example.md` is the bundled starter document and feature guide.
- `src-tauri/` contains the Rust/Tauri desktop shell, native menus, commands,
  PTY integration, and bundling configuration.
- `scripts/` contains install, Tauri wrapper, icon, and release helpers.
- `run.sh` and `justfile` are the preferred local command interface.

## Building And Releasing

Tauri builds require `pnpm`, Rust/Cargo, and the platform toolchain for the
target OS. The Tauri wrapper auto-detects CPU cores and sets `CARGO_BUILD_JOBS`
for faster builds. Override it when needed:

```bash
CARGO_BUILD_JOBS=12 ./run.sh tauri-build
```

For a local macOS app install from the current checkout:

```bash
./run.sh install-app
```

For version bumps and tagging, use:

```bash
./run.sh release patch
```
