import assert from "node:assert/strict";
import test from "node:test";
import {
    createInstallProgressState,
    formatInstallProgressSubtitle,
    formatInstallProgressTitle,
    processInstallProgressLine,
    stripAnsi
} from "../src/installProgressParse.js";

test("parses combined legacy [n/m] line with elapsed, ETA, percent (user terminal example)", () => {
    const s = createInstallProgressState();
    const line = "[6/9] Building macOS app bundle (elapsed 4s, ETA 7m 17s, 0%)";
    const { changed, done } = processInstallProgressLine(s, line);
    assert.equal(changed, true);
    assert.equal(done, false);
    assert.equal(s.currentStep, 6);
    assert.equal(s.totalSteps, 9);
    assert.equal(s.label, "Building macOS app bundle");
    assert.equal(s.timeRemaining, "7m 17s");
    assert.equal(s.percent, 0);
    assert.match(formatInstallProgressTitle(s), /Building macOS app bundle/);
    assert.match(formatInstallProgressTitle(s), /0%/);
    assert.match(formatInstallProgressTitle(s), /7m 17s/);
});

test("parses new bar+ETA line and step line in sequence", () => {
    const s = createInstallProgressState();
    const bar = "[###-------------------]  12%  |  about 4m 12s left  |  1m 0s elapsed";
    assert.equal(processInstallProgressLine(s, bar).changed, true);
    assert.equal(s.percent, 12);
    assert.equal(s.timeRemaining, "4m 12s");
    const r = processInstallProgressLine(s, "[2/8] Cloning repository to /Users/test/.lumina");
    assert.equal(r.changed, true);
    assert.equal(s.currentStep, 2);
    assert.equal(s.label, "Cloning repository to /Users/test/.lumina");
    assert(s.percent === 12);
    assert(s.timeRemaining === "4m 12s");
});

test("subtitle omits percent when shown separately in UI", () => {
    const s = createInstallProgressState();
    processInstallProgressLine(s, "[6/9] Building macOS app bundle (elapsed 4s, ETA 7m 17s, 0%)");
    const sub = formatInstallProgressSubtitle(s);
    assert.doesNotMatch(sub, /0%/);
    assert.match(sub, /Building/);
    assert.equal(formatInstallProgressTitle(s).includes("0%"), true);
    assert.equal(formatInstallProgressTitle(s).includes("7m 17s"), true);
});

test("strips 24-bit SGR then parses (TTY-colored install line)", () => {
    // Like install.sh: dim "[", SGR on each #/—, SGR "]", bold "12%"; parser never sees escape codes
    const raw = [
        "  ",
        "\u001B[2m[",
        "\u001B[0m",
        "\u001B[32m#",
        "\u001B[0m##------",
        "\u001B[2m]",
        "\u001B[0m",
        "  12%  |  about 4m 12s left  |  1m 0s elapsed"
    ].join("");
    const s = createInstallProgressState();
    const r = processInstallProgressLine(s, raw);
    assert.equal(r.changed, true);
    assert.equal(s.percent, 12);
    assert.equal(s.timeRemaining, "4m 12s");
    assert.doesNotMatch(stripAnsi(raw), /\u001B/);
    assert.match(
        stripAnsi(raw).trim(),
        /\[#+\-+]\s*12%/
    );
});

test("RE_BAR matches Unicode block bar from terminal", () => {
    const s = createInstallProgressState();
    const line = "[█░░░░░░]  5%  |  about 1m left  |  4s elapsed";
    const r = processInstallProgressLine(s, line);
    assert.equal(r.changed, true);
    assert.equal(s.percent, 5);
    assert.equal(s.timeRemaining, "1m");
});

test("LUMINA_INSTALL_COMPLETE marker is done (install.sh fallthrough / non-100% last bar)", () => {
    const s = createInstallProgressState();
    const r = processInstallProgressLine(s, "LUMINA_INSTALL_COMPLETE");
    assert.equal(r.done, true);
    assert.equal(r.changed, true);
});

test("bar at 100% is done", () => {
    const s = createInstallProgressState();
    const r = processInstallProgressLine(
        s,
        "[####################]  100%  |  about 0s left  |  10m 0s elapsed"
    );
    assert.equal(r.done, true);
    assert.equal(s.percent, 100);
});

test("stripAnsi removes OSC (bell), ST-terminated OSC, and SGR", () => {
    assert.equal(
        stripAnsi("a\u001B]0;title\u0007b"),
        "ab"
    );
    // Full OSC: ESC ] P … ST  (ST = ESC \)
    assert.equal(
        stripAnsi("a\u001B]52;clipboarddata\u001B\\b"),
        "ab"
    );
    const sgr = "hi \u001B[1m\u001B[32mthere\u001B[0m!";
    assert.equal(stripAnsi(sgr), "hi there!");
    assert.doesNotMatch(stripAnsi("x\u001B[2my\u001B[0mz"), /\u001B/);
});

test("ignores non-install lines (shell noise)", () => {
    const s = createInstallProgressState();
    for (const line of [
        "bash scripts/tauri.sh build --bundles app",
        "   Compiling lumina v0.2.10",
        "    Finished `release` profile"
    ]) {
        assert.deepEqual(processInstallProgressLine(s, line), { changed: false, done: false });
    }
    assert.equal(s.percent, null);
    assert.equal(s.label, null);
});

test("empty or whitespace-only line is no-op", () => {
    const s = createInstallProgressState();
    processInstallProgressLine(s, "[#---]  5%  |  about 1m left  |  1s elapsed");
    assert.equal(processInstallProgressLine(s, "").changed, false);
    assert.equal(processInstallProgressLine(s, "   ").changed, false);
    assert.equal(processInstallProgressLine(s, "\u001B[0m  \u001B[0m").changed, false);
    assert.equal(s.percent, 5);
});

test("bar line without ETA still records percent", () => {
    const s = createInstallProgressState();
    const r = processInstallProgressLine(s, "[#---] 7%");
    assert.equal(r.changed, true);
    assert.equal(s.percent, 7);
    assert.equal(s.timeRemaining, null);
});

test("re-processing identical bar is unchanged (changed false)", () => {
    const s = createInstallProgressState();
    const line = "[##------]  3%  |  about 9m left  |  10s elapsed";
    assert.equal(processInstallProgressLine(s, line).changed, true);
    assert.equal(processInstallProgressLine(s, line).changed, false);
});

test("start_step line: two spaces after ] and SGR around [n/m] (install.sh TTY)", () => {
    const s = createInstallProgressState();
    const raw = [
        "  ",
        "\u001B[1m",
        "\u001B[38;2;129;140;248m[",
        "6",
        "\u001B[0m",
        "\u001B[1m",
        "\u001B[38;2;129;140;248m/9]  ",
        "\u001B[0m",
        "  Building macOS app bundle"
    ].join("");
    const r = processInstallProgressLine(s, raw);
    assert.equal(r.changed, true);
    assert.equal(s.currentStep, 6);
    assert.equal(s.totalSteps, 9);
    assert.equal(s.label, "Building macOS app bundle");
    assert.doesNotMatch(s.label, /^\s/);
});

test("plain install.sh step two spaces before label", () => {
    const s = createInstallProgressState();
    const r = processInstallProgressLine(s, "[3/8]  Fetching refs");
    assert.equal(r.changed, true);
    assert.equal(s.label, "Fetching refs");
    assert.equal(r.done, false);
});

test("combined legacy line at 100% returns done with percent 100", () => {
    const s = createInstallProgressState();
    const r = processInstallProgressLine(
        s,
        "[1/1] x (elapsed 0s, ETA 0s, 100%)"
    );
    assert.equal(r.done, true);
    assert.equal(s.percent, 100);
});

test("bar percent is clamped to 0..100 if malformed", () => {
    const s = createInstallProgressState();
    processInstallProgressLine(s, "[x]  200%  |  about 0s left  |  0s elapsed");
    assert.equal(s.percent, 100);
});

test("formatInstallProgressTitle and Subtitle use defaults on empty state", () => {
    const s = createInstallProgressState();
    assert.equal(formatInstallProgressTitle(s), "Installing…");
    assert.equal(formatInstallProgressSubtitle(s), "Preparing…");
});

test("formatInstall progress strings join label, step, percent, and time in title", () => {
    const s = createInstallProgressState();
    s.label = "A";
    s.currentStep = 2;
    s.totalSteps = 4;
    s.percent = 40;
    s.timeRemaining = "1m";
    const t = formatInstallProgressTitle(s);
    const u = formatInstallProgressSubtitle(s);
    assert.match(t, /A/);
    assert.match(t, /Step 2 of 4/);
    assert.match(t, /40%/);
    assert.match(t, /1m/);
    assert.doesNotMatch(u, /40%/);
    assert.match(u, /1m/);
});
