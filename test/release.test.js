import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { releaseCommandPlan, resolveReleaseVersion } from "../scripts/release.mjs";

test("resolveReleaseVersion bumps patch, minor, major, and exact versions", () => {
  assert.equal(resolveReleaseVersion("0.2.4", "patch"), "0.2.5");
  assert.equal(resolveReleaseVersion("0.2.4", "minor"), "0.3.0");
  assert.equal(resolveReleaseVersion("0.2.4", "major"), "1.0.0");
  assert.equal(resolveReleaseVersion("0.2.4", "2.1.0"), "2.1.0");
});

test("releaseCommandPlan regenerates Cargo.lock before staging", () => {
  const plan = releaseCommandPlan({ branch: "main", tag: "v0.2.5", nextVersion: "0.2.5" });
  assert.deepEqual(plan[0], ["cargo", ["generate-lockfile", "--manifest-path", "src-tauri/Cargo.toml"]]);
  assert.deepEqual(plan[1], ["git", ["add", "-A"]]);
});

test("releaseCommandPlan publishes a GitHub Release marked latest", () => {
  const plan = releaseCommandPlan({ branch: "main", tag: "v0.2.5", nextVersion: "0.2.5" });
  const githubReleaseCommand = plan.at(-1);
  assert.equal(githubReleaseCommand[0], "gh");
  assert.deepEqual(githubReleaseCommand[1].slice(0, 3), ["release", "create", "v0.2.5"]);
  assert.ok(githubReleaseCommand[1].includes("--verify-tag"));
  assert.ok(githubReleaseCommand[1].includes("--latest"));
});

test("Cargo.lock lumina package version matches Cargo.toml", () => {
  const cargoToml = fs.readFileSync("src-tauri/Cargo.toml", "utf8");
  const cargoLock = fs.readFileSync("src-tauri/Cargo.lock", "utf8");
  const manifestVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const lockVersion = cargoLock.match(/\[\[package\]\]\nname = "lumina"\nversion = "([^"]+)"/)?.[1];

  assert.equal(lockVersion, manifestVersion);
});
