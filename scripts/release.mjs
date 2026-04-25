#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
process.chdir(rootDir);

const semver = /^(\d+)\.(\d+)\.(\d+)$/;
const target = process.argv[2] ?? "patch";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

function ensureCommand(command, help) {
  try {
    run(command, ["--version"], { capture: true });
  } catch {
    console.error(`Missing dependency: ${command}`);
    console.error(help);
    process.exit(1);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(rootDir, file), "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(path.resolve(rootDir, file), `${JSON.stringify(data, null, 2)}\n`);
}

function resolveReleaseVersion(current, requested) {
  const match = current.match(semver);
  if (!match) {
    throw new Error(`Invalid current version: ${current}`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (requested === "patch") {
    patch += 1;
  } else if (requested === "minor") {
    minor += 1;
    patch = 0;
  } else if (requested === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (semver.test(requested)) {
    const next = requested.match(semver);
    major = Number(next[1]);
    minor = Number(next[2]);
    patch = Number(next[3]);
  } else {
    throw new Error("Release target must be patch, minor, major, or x.y.z");
  }

  return `${major}.${minor}.${patch}`;
}

function updateVersions(version) {
  const packageJson = readJson("package.json");
  packageJson.version = version;
  writeJson("package.json", packageJson);

  const tauriConfig = readJson("src-tauri/tauri.conf.json");
  tauriConfig.version = version;
  writeJson("src-tauri/tauri.conf.json", tauriConfig);

  const cargoPath = path.resolve(rootDir, "src-tauri/Cargo.toml");
  const cargo = fs.readFileSync(cargoPath, "utf8");
  const updatedCargo = cargo.replace(
    /^version\s*=\s*"[0-9]+\.[0-9]+\.[0-9]+"$/m,
    `version = "${version}"`,
  );
  if (cargo === updatedCargo) {
    throw new Error("Failed to update version in src-tauri/Cargo.toml");
  }
  fs.writeFileSync(cargoPath, updatedCargo);

  const indexPath = path.resolve(rootDir, "index.html");
  const indexHtml = fs.readFileSync(indexPath, "utf8");
  const updatedIndex = indexHtml.replace(
    /(<span id="app-version-badge"[^>]*>)v[0-9]+\.[0-9]+\.[0-9]+(<\/span>)/,
    `$1v${version}$2`,
  );
  if (indexHtml === updatedIndex) {
    throw new Error("Failed to update version badge in index.html");
  }
  fs.writeFileSync(indexPath, updatedIndex);
}

try {
  ensureCommand("git", "Install git: https://git-scm.com/");
  ensureCommand("node", "Install Node.js: https://nodejs.org/");
  ensureCommand("cargo", "Install Rust toolchain: https://rustup.rs/");
  ensureCommand("gh", "Install GitHub CLI: https://cli.github.com/");

  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { capture: true }).trim();
  if (branch === "HEAD") {
    throw new Error("Detached HEAD is not supported for release.");
  }

  const currentVersion = readJson("package.json").version;
  const nextVersion = resolveReleaseVersion(currentVersion, target);
  if (nextVersion === currentVersion) {
    throw new Error(`Version unchanged (${currentVersion}); nothing to release.`);
  }

  const tag = `v${nextVersion}`;
  try {
    run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { capture: true });
    throw new Error(`Tag already exists locally: ${tag}`);
  } catch (error) {
    if (error.message.startsWith("Tag already exists")) {
      throw error;
    }
  }

  try {
    run("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`], {
      capture: true,
    });
    throw new Error(`Tag already exists on origin: ${tag}`);
  } catch (error) {
    if (error.message.startsWith("Tag already exists")) {
      throw error;
    }
  }

  console.log(`Releasing version ${nextVersion} from ${currentVersion} on branch ${branch}`);

  updateVersions(nextVersion);
  run("cargo", ["generate-lockfile", "--manifest-path", "src-tauri/Cargo.toml"]);
  run("git", ["add", "-A"]);
  run("git", ["commit", "-m", `chore(release): v${nextVersion}`]);
  run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);
  run("git", ["push", "origin", branch]);
  run("git", ["push", "origin", tag]);
  run("gh", [
    "release",
    "create",
    tag,
    "--verify-tag",
    "--latest",
    "--title",
    `Lumina ${tag}`,
    "--notes",
    `Release ${tag}`,
  ]);

  console.log(`Release version ${tag} committed, tagged, pushed, and published on GitHub.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
