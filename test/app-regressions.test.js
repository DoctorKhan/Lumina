import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Help menu exposes the bundled example guide as Lumina Help", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(rust, /MENU_OPEN_EXAMPLE_GUIDE/);
  assert.match(rust, /Lumina Help/);
  assert.match(main, /case 'lumina_open_example_guide':/);
  assert.match(main, /loadExampleGuide\(\)/);
});

test("Lumina on GitHub uses the native external URL command", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(rust, /Lumina on GitHub/);
  assert.match(rust, /fn open_external_url/);
  assert.match(rust, /https:\/\/github\.com\/DoctorKhan\/Lumina/);
  assert.match(main, /invoke\('open_external_url'/);
  assert.doesNotMatch(main, /window\.open\('https:\/\/github\.com\/DoctorKhan\/Lumina'/);
});

test("app menu sync and native save are wired for standard File menu", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(rust, /fn sync_app_menu/);
  assert.match(rust, /fn write_document/);
  assert.match(rust, /CheckMenuItemBuilder/);
  assert.match(rust, /MENU_NEW_FILE/);
  assert.match(main, /invoke\('sync_app_menu',\s*\{\s*params:\s*\{/);
  assert.match(main, /'lumina_new_file'/);
  assert.match(main, /'lumina_save'/);
  assert.match(main, /'lumina_save_as'/);
});

test("CLI and Open With pass file paths into the editor via pending open queue", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(rust, /RunEvent::Opened/);
  assert.match(rust, /fn drain_pending_open_paths/);
  assert.match(main, /invoke\('drain_pending_open_paths'/);
  assert.match(main, /listen\('lumina-pending-open-files'/);
});

test("startup update check is quiet and exposes an install badge", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");
  const capabilities = fs.readFileSync("src-tauri/capabilities/default.json", "utf8");

  assert.match(main, /from '@tauri-apps\/plugin-process'/);
  assert.match(main, /\brelaunch\b/);
  assert.match(capabilities, /"process:default"/);
  assert.match(html, /id="install-update-badge"/);
  assert.match(main, /checkForUpdate\(\{ background = false \} = \{\}\)/);
  assert.match(main, /checkForUpdate\(\{ background: true \}\)/);
  assert.match(main, /getVersion/);
  assert.match(main, /refreshAppVersionBadge/);
  assert.match(main, /void bootstrap\(\)/);
  assert.match(main, /requestIdleCallback/);
  assert.doesNotMatch(main, /setTimeout\(\(\) => \{\s*checkForUpdate\(\{ background: true \}\)/);
  assert.match(main, /installUpdateBadge\.addEventListener\('click', installDetectedUpdate\)/);
  assert.match(main, /showInstallUpdateBadge\(latestTag\)/);
  assert.match(html, /id="install-progress"/);
  assert.match(main, /feedInstallProgressFromTerminal/);
  assert.match(main, /trackInstallProgress: true/);
});

test("macOS folder permission prompts explain Claude and file access", () => {
  const plist = fs.readFileSync("src-tauri/Info.plist", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  // Only the standard user folders a Markdown editor actually reaches into.
  for (const key of [
    "NSDesktopFolderUsageDescription",
    "NSDocumentsFolderUsageDescription",
    "NSDownloadsFolderUsageDescription",
  ]) {
    assert.match(plist, new RegExp(`<key>${key}</key>`));
  }

  // Network/removable volumes are intentionally NOT declared: they prompted for
  // access most users never need. Re-add only if a real network/USB flow exists.
  for (const key of [
    "NSNetworkVolumesUsageDescription",
    "NSRemovableVolumesUsageDescription",
  ]) {
    assert.doesNotMatch(plist, new RegExp(`<key>${key}</key>`));
  }

  assert.match(plist, /Claude pane edits the current file's folder/);
  assert.match(main, /If macOS asks for folder access, it is for this Claude editing session\./);
});

test("macOS bundle plist does not request legacy Carbon launch mode", () => {
  const plist = fs.readFileSync("src-tauri/Info.plist", "utf8");

  assert.match(plist, /<key>LSRequiresCarbon<\/key>\s*<false\/>/);
  assert.doesNotMatch(plist, /<key>LSRequiresCarbon<\/key>\s*<true\/>/);
});

test("app top chrome and pane layout are locked in app CSS, not only Tailwind", () => {
  const css = fs.readFileSync("src/styles.css", "utf8");

  assert.match(css, /html\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /body > header/);
  assert.match(css, /body > header[^}]*flex:\s*0 0 auto/);
  assert.match(css, /body > header[^}]*min-height:\s*4rem/);
  assert.match(css, /max-height:\s*100dvh/);
  assert.match(css, /\.editor-container[^}]*overflow:\s*hidden/);
  assert.match(css, /\.workspace-panes[^}]*min-height:\s*0/);
});

test("editor metadata bar shows full paths with marquee, toast, and path navigator", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");

  assert.match(html, /filename-display-wrap/);
  assert.match(html, /id="filename-display-text"/);
  assert.match(html, /id="filename-copy-btn"/);
  assert.match(html, /id="filename-path-input"/);
  assert.match(html, /id="filename-path-toast"/);
  assert.match(css, /@keyframes filename-marquee/);
  assert.match(css, /\.filename-path-toast\s*\{[\s\S]*word-break:\s*break-all;/);
  assert.match(css, /\.filename-display-btn\s*\{[\s\S]*text-transform:\s*none;/);
  assert.match(main, /function openFilenamePathNavigator/);
  assert.match(main, /complete_file_path/);
  assert.match(main, /showFilenamePathToast/);
  assert.match(rust, /fn complete_file_path/);
});

test("terminal and Claude share a resizable right-side rail", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(html, /id="workspace-panes"/);
  assert.match(html, /id="side-pane-resizer"/);
  assert.match(html, /id="side-pane"[\s\S]*id="terminal-pane"[\s\S]*id="claude-pane"/);
  assert.match(css, /\.side-pane\s*\{[\s\S]*flex:\s*0 0 34%;[\s\S]*min-width:/);
  assert.match(css, /\.side-pane-split \.terminal-pane\s*\{[\s\S]*flex-basis:\s*50%;/);
  assert.match(css, /\.editor-collapsed #pane-resizer/);
  assert.match(main, /function syncSidePaneLayout\(\)/);
  assert.match(main, /sidePane\.classList\.toggle\('side-pane-split', visibleCount > 1\)/);
  assert.match(main, /sidePanePercent = Math\.min\(65, Math\.max\(24, rawPercent\)\)/);
  assert.match(main, /editorPane\.style\.flex = `1 1 \$\{editorPercent\}%`/);
  assert.match(main, /terminalLastFitCols/);
  assert.match(main, /terminal\.cols === terminalLastFitCols && terminal\.rows === terminalLastFitRows/);
  assert.match(main, /resizeTerminals\(\{ settle: false \}\)/);
  assert.match(main, /sidePaneResizer\?\.addEventListener/);
  assert.match(main, /\(workspacePanes \|\| editorContainer\)\.getBoundingClientRect\(\)/);
});

test("editor find and replace is wired with hotkeys and Edit menu items", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(html, /id="find-replace-bar"/);
  assert.match(html, /id="find-input"/);
  assert.match(html, /id="replace-input"/);
  assert.match(rust, /MENU_FIND/);
  assert.match(rust, /MENU_FIND_REPLACE/);
  assert.match(rust, /Find…/);
  assert.match(rust, /Find and Replace…/);
  assert.match(rust, /CmdOrCtrl\+F/);
  assert.match(rust, /CmdOrCtrl\+Alt\+F/);
  assert.match(main, /function openFindBar/);
  assert.match(main, /function replaceAllMatches/);
  assert.match(main, /case 'lumina_find':/);
  assert.match(main, /case 'lumina_find_replace':/);
  assert.match(main, /event\.key\.toLowerCase\(\) === 'f'/);
  assert.match(main, /event\.key\.toLowerCase\(\) === 'g'/);
  assert.match(main, /function shouldFocusEditorForFind/);
  assert.match(main, /function syncPreviewScrollToEditor/);
  assert.match(main, /focusEditor: false/);
});

test("develop-Lumina mode lets Claude edit the source checkout and rebuild from the UI", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(html, /id="claude-develop-lumina-btn"/);
  assert.match(html, /id="claude-rebuild-lumina-btn"/);

  assert.match(rust, /fn source_dir_info/);
  assert.match(rust, /fn find_lumina_source_dir/);
  assert.match(rust, /fn looks_like_lumina_source/);
  assert.match(rust, /"Documents\/Projects\/Lumina"/);
  assert.doesNotMatch(rust, /Local checkout install is only shown in development builds/);

  assert.match(main, /invoke\('source_dir_info'\)/);
  assert.match(main, /function toggleDevelopLuminaMode/);
  assert.match(main, /async function rebuildLumina/);
  assert.match(main, /developLuminaMode/);
  assert.match(main, /luminaSourceDir/);
  assert.match(main, /claudeDevelopLuminaBtn\.addEventListener\('click'/);
  assert.match(main, /claudeRebuildLuminaBtn\.addEventListener\('click'/);
});

test("example guide documents the app features that have regressed before", () => {
  const guide = fs.readFileSync("src/example.md", "utf8");

  for (const requiredSection of [
    "Mermaid Diagrams",
    "Lists And Outlines",
    "Task Lists",
    "Claude Pane",
    "Useful Menus",
  ]) {
    assert.match(guide, new RegExp(`## \\d+\\. ${requiredSection}`));
  }
});
