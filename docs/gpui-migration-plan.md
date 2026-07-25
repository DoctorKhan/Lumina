# GPUI Migration Plan — Lumina

Goal: move the editor, outline, and composer experiences onto a native GPUI-backed layer inside the existing Tauri app. Keep preview/render and terminal in the hosted webview; use Rust wins where latency is user-visible.

## Constraints
- macOS host, Tauri 2, editor currently lives in a webview via src/main.js/index.html.
- Must remain gradual: ship one surface first, measure, expand.
- Do not rewrite preview/render pipeline yet; it already uses debounced batched updates.

## Phase 0 — Dependency strategy (choose one)
Do not edit `src-tauri/Cargo.toml` until the user picks a dependency strategy.

Option A: Zed fork GPUI
- Add `gpui` and platform crates from Zed’s git checkout.
- Pros: matches Zed’s actual runtime behavior, likely best long-term parity.
- Cons: requires pinning a Zed revision; breaking API churn possible.

Option B: Standalone gpui crate
- Add `gpui`, `gpui-platform`, `wry`/runtime packages from crates.io.
- Pros: smaller surface, no Zed git dependency.
- Cons: later risk of runtime divergence from Zed and smaller community examples.

Recommended next step after choosng:

### Option A handoff: Zed fork/gerrit pool
- Fork or mirror Zed’s repo locally.
- Check out the intended GPUI version/commit.
- Add paths/git sources for local `gpui`, `gpui-platform`, etc., in Cargo.toml.
- Run `cargo check` before wiring into Lumina’s main.rs or a new window surface.

### Option B handoff: standalone dependency pool
- Validate compatible `gpui` + `platform` versions on crates.io.
- Pin runtime/macOS subsystem set explicitly in manifest.
- Run `cargo check` before wiring into Lumina’s main.rs or a new window surface.

## Phase 1 — Native composer (2-4 days)
Replace the agent/Claude textarea with a GPUI multiline textbox while keeping the webview as the parent shell.

1. Introduce `native_composer` layer behind the components that host the composer.
2. Replace the webview’s `agentInput` with a native editor view bridged by IPC.
3. Add deferred render using the native composition; mirror current debounced timing.
4. Add paste handling, send on Enter, and shift-enter newline behavior.
5. Objective: observable non-web typing latency vs current `requestAnimationFrame` path.

## Phase 2 — Native editor surface (1-2 weeks)
Stand up a read-only native overlay for the editor pane; keep preview inside the hosted webview.

1. Build a read-only native surface layer that mirrors the webview’s geometry.
2. Use debug performance logging to measure per-key presentation costs.
3. Compare against the existing `requestAnimationFrame`-batched update path.
4. Run real-document comparisons to identify remaining latency budgets.

## Phase 3 — Full document mount (1-2 weeks)
Mount the complete UI in GPUI; keep preview, images, and rich tile content within the hosted webview.

1. Implement full native mount of the editor.
2. Keep preview, images, and rich tile content inside the hosted webview.
3. Establish proof that all budgets are met before expanding scope.

## Phase 6 — Deprecation
Once native layers cover all modules, archive or remove `src/main.js`. Preserve installer and notification surface contracts.

## File paths to touch
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src-tauri/src/main.rs`
- `index.html`
- `src/main.js`
- Tauri window config / runtime wiring

## Risks
- Full webview replacement is large; prefer incremental overlay first.
- Preview UX parity requires careful scroll sync between webview and native.
- Tauri 2 + GPUI integration is still maturing; prefer conservative dependency versions.
