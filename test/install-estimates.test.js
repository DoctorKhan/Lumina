import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runInstallFunction(script, env = {}) {
  return execFileSync("bash", ["-c", script], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      LUMINA_INSTALL_LIB_ONLY: "1"
    }
  }).trim();
}

test("install estimates use bundled seed before local timings exist", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-estimates-"));
  const estimate = runInstallFunction(
    "source ./install.sh; estimate_step_duration tauri_build",
    {
      LUMINA_INSTALL_STATE_DIR: stateDir,
      LUMINA_INSTALL_GLOBAL_MODEL_FILE: "scripts/install-estimates-global.tsv"
    }
  );

  assert.equal(estimate, "720");
});

test("local install timings dominate the bundled seed after one run", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-estimates-"));
  fs.writeFileSync(path.join(stateDir, "install-estimates.tsv"), "tauri_build\t1\t68\n");

  const estimate = Number(runInstallFunction(
    "source ./install.sh; estimate_step_duration tauri_build",
    {
      LUMINA_INSTALL_STATE_DIR: stateDir,
      LUMINA_INSTALL_GLOBAL_MODEL_FILE: "scripts/install-estimates-global.tsv"
    }
  ));

  assert.equal(estimate, 140);
});

test("completed install steps update both event log and local model", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-estimates-"));
  runInstallFunction(
    "source ./install.sh; record_step_duration js_deps 'Installed JavaScript dependencies' 4",
    {
      LUMINA_INSTALL_STATE_DIR: stateDir,
      GIT_REF: "origin/test"
    }
  );

  const model = fs.readFileSync(path.join(stateDir, "install-estimates.tsv"), "utf8");
  const log = fs.readFileSync(path.join(stateDir, "install-events.jsonl"), "utf8");

  assert.match(model, /^js_deps\t1\t4$/m);
  assert.match(log, /"step_key":"js_deps"/);
  assert.match(log, /"duration_seconds":4/);
});
