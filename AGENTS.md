# Lumina: agent instructions

Lumina is a Tauri 2 desktop Markdown editor: Rust backend in `src-tauri/`,
Vite + vanilla JS frontend in `src/`, tests in `test/` (`node --test`).

## Read first

- **`docs/ROADMAP.md`**: current direction and the rules that come with it.
  The frontend is moving to TypeScript incrementally: write new frontend modules
  in `.ts`, don't add features to `src/main.js`, and never silence errors with `any`.
  Tick roadmap steps when you complete them.

## Commands (use `just`; `./run.sh <recipe>` works too)

| Command | What it does |
|---|---|
| `just dev` | Run the app with hot reload |
| `just test` | JS tests + version-source check (~3s) |
| `just install` | Rebuild this checkout and install `/Applications/Lumina.app` (~20s incremental) |
| `just release [patch\|minor\|major]` | Test, bump versions, commit, tag, push, publish. Requires a clean tree. |

- Use **pnpm**, never npm or npx (`pnpm exec <bin>` instead of `npx`).
- If pnpm reports `ERR_PNPM_IGNORED_BUILDS`, approve the package under
  `allowBuilds` in `pnpm-workspace.yaml`; don't bypass it with flags.
- Run `just test` before finishing any change.

## Things that are easy to break

- `install.sh` output is parsed by the in-app update card
  (`src/installProgressParse.js`); keep its progress lines and the
  `LUMINA_INSTALL_COMPLETE` / `LUMINA_INSTALL_FAILED` markers in sync.
  `install.sh` calls `./run.sh setup` and `./run.sh tauri-build-app`, so keep those recipe names.
- Version lives in four places (`package.json`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml`, the badge in `index.html`); only change it via `just release`.
- Don't run `cargo generate-lockfile` or `cargo update` without `--workspace`: it
  upgrades every Rust dependency and forces a full ~3 min recompile.
- Preview HTML goes through DOMPurify (`src/previewSanitize.js`), which strips
  `<foreignObject>`. Keep Mermaid on SVG text labels (`htmlLabels: false`, top level).
