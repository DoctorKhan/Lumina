import assert from "node:assert/strict";
import test from "node:test";
import {
    createInstallProgressState,
    parseTimeRemainingToSeconds,
    processInstallProgressLine
} from "../src/installProgressParse.js";
import {
    createInstallProgressAnchorState,
    getCountdownSecondsRemaining,
    getInterpolatedInstallPercent,
    refreshInstallProgressAnchor
} from "../src/installProgressAnimate.js";

test("parseTimeRemainingToSeconds handles install.sh style fragments", () => {
    assert.equal(parseTimeRemainingToSeconds("7m 17s"), 7 * 60 + 17);
    assert.equal(parseTimeRemainingToSeconds("4m 12s"), 4 * 60 + 12);
    assert.equal(parseTimeRemainingToSeconds("0s"), 0);
    assert.equal(parseTimeRemainingToSeconds("1h 2m 3s"), 3600 + 120 + 3);
    assert.equal(parseTimeRemainingToSeconds(""), null);
    assert.equal(parseTimeRemainingToSeconds("nope"), null);
});

test("interpolated percent rises between terminal updates when ETA is known (no live bar: step-only path)", () => {
    const anchor = createInstallProgressAnchorState();
    const s = createInstallProgressState();
    // No bar line in state: UI still uses step-based percent + interpolation for smoothness.
    processInstallProgressLine(s, "[6/9]  Building macOS app bundle");
    refreshInstallProgressAnchor(anchor, s);
    const p0 = getInterpolatedInstallPercent(anchor, s, anchor.anchorMs);
    const pHalf = getInterpolatedInstallPercent(anchor, s, anchor.anchorMs + 15_000);
    assert.equal(p0, 56);
    assert.ok(pHalf > p0);
    assert.ok(pHalf < 90);
});

test("countdown ticks down from scaled segment ETA (not full install remaining)", () => {
    const anchor = createInstallProgressAnchorState();
    const s = createInstallProgressState();
    processInstallProgressLine(s, "[###-------------------]  12%  |  about 90s left  |");
    refreshInstallProgressAnchor(anchor, s);
    // 90s to ~100%; animating 12%→99% uses (87/88) of that ≈ 89s.
    assert.equal(anchor.etaSeconds, 89);
    assert.equal(getCountdownSecondsRemaining(anchor, anchor.anchorMs), 89);
    assert.equal(getCountdownSecondsRemaining(anchor, anchor.anchorMs + 30_000), 59);
    assert.equal(getCountdownSecondsRemaining(anchor, anchor.anchorMs + 88_000), 1);
    assert.equal(getCountdownSecondsRemaining(anchor, anchor.anchorMs + 95_000), 0);
});
