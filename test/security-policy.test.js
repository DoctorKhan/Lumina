import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { escapeAttr, escapeHtml, isAllowedInitialFileParam } from "../src/htmlEscape.js";

test("htmlEscape neutralizes attribute breakout payloads", () => {
  const payload = '"><img src=x onerror=alert(1)>';
  assert.equal(escapeAttr(payload), "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  assert.doesNotMatch(escapeHtml(payload), />/);
});

test("initial file param rejects remote and javascript URLs", () => {
  assert.equal(isAllowedInitialFileParam("https://evil.example/x.md"), false);
  assert.equal(isAllowedInitialFileParam("//evil.example/x.md"), false);
  assert.equal(isAllowedInitialFileParam("javascript:alert(1)"), false);
  assert.equal(isAllowedInitialFileParam("/tmp/doc.md"), true);
  assert.equal(isAllowedInitialFileParam("./notes.md"), true);
});

test("Rust security policy module is wired into IPC commands", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const security = fs.readFileSync("src-tauri/src/security.rs", "utf8");

  assert.match(rust, /mod security;/);
  assert.match(rust, /validate_write_path/);
  assert.match(rust, /validate_read_path/);
  assert.match(rust, /validate_claude_permission_mode/);
  assert.match(rust, /audit_ipc/);
  assert.match(security, /validate_claude_permission_mode/);
  assert.match(security, /is_sensitive_path/);
  assert.match(security, /audit_ipc/);
});

test("preview HTML is sanitized before innerHTML assignment", () => {
  const main = fs.readFileSync("src/main.js", "utf8");
  const loaders = fs.readFileSync("src/previewLoaders.js", "utf8");

  assert.match(main, /sanitizePreviewHtml/);
  assert.match(main, /from '\.\/previewSanitize\.js'/);
  assert.match(loaders, /securityLevel: 'strict'/);
  assert.doesNotMatch(main, /el\.innerHTML = marked\.parse/);
});

test("git commit message generation uses headless Claude print mode", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(rust, /fn git_generate_commit_message/);
  assert.match(rust, /fn claude_print_text/);
  assert.match(rust, /\.arg\("--tools"\)/);
  assert.match(rust, /\.arg\("--output-format"\)/);
  assert.match(rust, /fn normalize_commit_message/);
  assert.match(main, /git_generate_commit_message/);
  assert.match(main, /scheduleAutoCommitMessage/);
});

test("Tauri CSP is enabled for the webview", () => {
  const conf = fs.readFileSync("src-tauri/tauri.conf.json", "utf8");
  assert.doesNotMatch(conf, /"csp": null/);
  assert.match(conf, /default-src 'self'/);
});
