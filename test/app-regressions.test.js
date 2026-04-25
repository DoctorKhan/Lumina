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
