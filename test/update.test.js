import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, isInstallableFromGitHub, newestSemverTag, parseVersion, selectLatestUpdateTag } from "../src/update.js";

test("parseVersion accepts v-prefixed semver tags", () => {
  assert.deepEqual(parseVersion("v0.2.4"), [0, 2, 4]);
  assert.deepEqual(parseVersion("0.2.4"), [0, 2, 4]);
  assert.equal(parseVersion("latest"), null);
});

test("compareVersions orders semver tags", () => {
  assert.equal(compareVersions("v0.2.4", "v0.2.3"), 1);
  assert.equal(compareVersions("v0.2.3", "v0.2.4"), -1);
  assert.equal(compareVersions("v0.2.4", "0.2.4"), 0);
});

test("isInstallableFromGitHub allows same-version reinstalls", () => {
  assert.equal(isInstallableFromGitHub("v0.4.0", "0.4.0"), true);
  assert.equal(isInstallableFromGitHub("v0.4.1", "0.4.0"), true);
  assert.equal(isInstallableFromGitHub("v0.4.0", "0.4.1"), false);
});

test("newestSemverTag ignores non-semver tags", () => {
  assert.equal(
    newestSemverTag([{ name: "latest" }, { name: "v0.2.3" }, { name: "v0.2.10" }]),
    "v0.2.10",
  );
});

test("selectLatestUpdateTag prefers newer tags over stale latest release", () => {
  assert.deepEqual(
    selectLatestUpdateTag({
      latestReleaseTag: "v0.1.4",
      tags: [{ name: "v0.2.4" }, { name: "v0.2.3" }],
    }),
    { tag: "v0.2.4", source: "tag" },
  );
});

test("selectLatestUpdateTag uses release when it is newest", () => {
  assert.deepEqual(
    selectLatestUpdateTag({
      latestReleaseTag: "v0.3.0",
      tags: [{ name: "v0.2.4" }],
    }),
    { tag: "v0.3.0", source: "release" },
  );
});
