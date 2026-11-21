# Lumina Roadmap

Agents: read this before starting work. When a task touches an item here, follow
its rules; when you finish a step, tick it and add a one-line note with the date.

## 1. Move the frontend to TypeScript, incrementally (active)

**Why.** Most of Lumina is untyped JavaScript, and `src/main.js` alone is ~7,500
lines. That is where agent-made edits break things silently. Type errors give an
agent precise, fast feedback before anything runs, the same advantage Rust's
compiler already gives the backend. Rust is not the bottleneck (incremental
compile ~6s); the frontend is where most iteration happens.

**Non-goals.** No big-bang rewrite. No language switch (Go, Elixir, etc.). No
moving UI logic into Rust; keep Rust for work that needs speed or OS access
(file watching, PTY, very large document parsing).

**Steps**
- [ ] Add `typescript` as a dev dependency, a `tsconfig.json` (`allowJs`,
      `noEmit`, `strict` for `.ts` files, `checkJs: false` so existing JS is not
      flagged), a `pnpm typecheck` script, and a `just typecheck` recipe.
      Vite already compiles `.ts` with no extra config.
- [ ] Run `typecheck` in `just test` and in CI so type errors block like test failures.
- [x] `node --test` can import `.ts` modules directly (Node 22.22 strips types
      natively; verified 2026-11-04). Use erasable-only TS syntax (no `enum`,
      no `namespace`, no parameter properties) so this keeps working.
- [ ] Convert the small pure modules first (`previewMath`, `previewLinks`,
      `previewIncremental`, `htmlEscape`, `documentDiff`, `installProgressParse`, …).
- [ ] Split `main.js` into typed modules by feature (preview pipeline, file I/O,
      terminal, Claude chat, update/install), one feature per change, tests green
      after each.
- [ ] Type the Tauri `invoke` boundary: one typed wrapper per Rust command, so
      frontend/backend contract drift is a type error.
- [ ] Once most code is `.ts`, turn on `checkJs` for what remains, then retire it.

**Rules while this is in progress**
- New frontend modules are written in TypeScript (`.ts`).
- When you substantially change a JS module, convert it to `.ts` in the same change
  if it is small; otherwise leave it and note it here.
- Don't add new features to `main.js`; put them in a new typed module and import it.
- Don't use `any` to silence errors; use `unknown` and narrow, or a precise type.

## 2. Known issues

- [ ] Preview can't show images next to the document (`![](diagram.png)`): relative
      `src` resolves against the app origin, and the CSP `img-src` only allows
      `'self' data: blob:`. Needs Tauri's asset protocol (`convertFileSrc`) scoped
      to the open document's folder, plus the CSP updated to allow `asset:`.

## Done

- 2026-11-20: Native document tabs. Each document is its own window grouped into
  macOS tabs (`src-tauri/src/document_windows.rs`); terminals, assistants, and
  file watchers are per window (`WindowSession`), and events are sent with
  `emit_to` to one window (`listenToWindow` in `src/documentWindow.ts`). Header
  slimmed to one toolbar plus a bottom status bar. First new TS modules:
  `documentWindow.ts`, `documentTitle.ts` (not typechecked until step 1 lands).

- 2026-11-04: Mermaid node labels rendered blank (top-level `htmlLabels: false` fix
  in `src/previewLoaders.js`).
- 2026-11-04: Build/release simplified: `just install` (~20s incremental), pnpm
  build approvals in `pnpm-workspace.yaml`, release no longer regenerates the whole
  `Cargo.lock` or stages unrelated files.
