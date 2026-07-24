import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("latest_lumina_repo_tag picks the newest semver tag", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  assert.match(rust, /fn pick_newest_semver_tag/);
  assert.match(rust, /git ls-remote/);
  assert.match(rust, /tag", "--sort=-v:refname"/);
});
