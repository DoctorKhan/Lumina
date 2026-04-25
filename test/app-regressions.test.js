import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Help menu exposes the bundled example guide", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(rust, /MENU_OPEN_EXAMPLE_GUIDE/);
  assert.match(rust, /Open Example Guide/);
  assert.match(main, /case 'lumina_open_example_guide':/);
  assert.match(main, /loadExampleGuide\(\)/);
});

test("Contribute on GitHub uses the native external URL command", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(rust, /fn open_external_url/);
  assert.match(rust, /https:\/\/github\.com\/DoctorKhan\/Lumina/);
  assert.match(main, /invoke\('open_external_url'/);
  assert.doesNotMatch(main, /window\.open\('https:\/\/github\.com\/DoctorKhan\/Lumina'/);
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

  assert.match(html, /id="install-update-badge"/);
  assert.match(main, /checkForUpdate\(\{ background = false \} = \{\}\)/);
  assert.match(main, /checkForUpdate\(\{ background: true \}\)/);
  assert.match(main, /requestIdleCallback/);
  assert.doesNotMatch(main, /setTimeout\(\(\) => \{\s*checkForUpdate\(\{ background: true \}\)/);
  assert.match(main, /installUpdateBadge\.addEventListener\('click', installDetectedUpdate\)/);
  assert.match(main, /showInstallUpdateBadge\(latestTag\)/);
});

test("macOS folder permission prompts explain Claude and file access", () => {
  const plist = fs.readFileSync("src-tauri/Info.plist", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  for (const key of [
    "NSDesktopFolderUsageDescription",
    "NSDocumentsFolderUsageDescription",
    "NSDownloadsFolderUsageDescription",
    "NSNetworkVolumesUsageDescription",
    "NSRemovableVolumesUsageDescription",
  ]) {
    assert.match(plist, new RegExp(`<key>${key}</key>`));
  }

  assert.match(plist, /Claude pane edits the current file's folder/);
  assert.match(main, /If macOS asks for folder access, it is for this Claude editing session\./);
});

test("macOS bundle plist does not request legacy Carbon launch mode", () => {
  const plist = fs.readFileSync("src-tauri/Info.plist", "utf8");

  assert.match(plist, /<key>LSRequiresCarbon<\/key>\s*<false\/>/);
  assert.doesNotMatch(plist, /<key>LSRequiresCarbon<\/key>\s*<true\/>/);
});

test("editor metadata bar truncates long filenames without wrapping", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");

  assert.match(html, /class="editor-meta-bar[^"]*gap-4[^"]*"/);
  assert.match(html, /id="filename-display" class="[^"]*min-w-0[^"]*flex-1[^"]*truncate[^"]*"/);
  assert.match(html, /id="char-count" class="[^"]*shrink-0[^"]*whitespace-nowrap[^"]*"/);
  assert.match(css, /#filename-display\s*\{[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
  assert.match(css, /#char-count\s*\{[\s\S]*white-space:\s*nowrap;/);
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
