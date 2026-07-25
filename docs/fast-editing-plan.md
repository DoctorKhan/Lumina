# Lumina Fast Editing Plan

## Goal
Make Lumina feel as responsive and fluid as a purpose-built text editor (Zed-like) while preserving the current Tauri + Vite hot-reload workflow.

## Constraints
- Keep hot reload working (`pnpm dev` + Tauri dev).
- Do not rip out the existing preview/terminal/AI panes.
- Make the smallest viable surface-area change first.

## Short-term wins (fastest path to "easy and fast editing")

### 1. Replace the raw `<textarea>` with CodeMirror 6
- Add `@codemirror/*` packages: `view`, `state`, `lang-javascript` for now, plus `language` and `@lezer/highlight`.
- Mount a CM6 editor view into `#editor-input-wrap` while keeping the existing CSS layout.
- Feature target:
  - native markdown syntax highlighting via Lezer
  - vim keymap
  - smooth per-character rendering without full-document reparse
  - native search/replace with the existing find-replace bar

### 2. Make preview updates incremental and low-jank
- Reuse the existing preview module names; just make sure edits debounce at the source.
- Keep the highlight layer behavior for bulk edits.

### 3. Reduce layout/IO stalls while typing
- Split “typing path” from “preview recompute path”.
- Preview rendering must be async and cancellable.

## Mid-term (native smoothness via GPUI)
- The `gpui` dep is already added but unused.
- Next concrete step: add a hidden `gpui` window or overlay panel driven from Tauri, not a full rewrite.
- Goal: native scroll smoothness + GPU text shaping for the editor surface.

## Execution order
1. Doc + plan (this file).
2. Add CM6 core packages and create a thin `src/editorCm6.js`.
3. Mount it and prove hot reload still works.
4. Add markdown/vim + wire find-replace.
