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

test("interpolated percent rises between terminal updates when ETA is known", () => {
    const anchor = createInstallProgressAnchorState();
    const s = createInstallProgressState();
    processInstallProgressLine(s, "[6/9] Building macOS app bundle");
    processInstallProgressLine(
        s,
        "[----------------------]   0%  |  about 2m 0s left  |  4s elapsed"
    );
    refreshInstallProgressAnchor(anchor, s);
    const p0 = getInterpolatedInstallPercent(anchor, s, anchor.anchorMs);
    const pHalf = getInterpolatedInstallPercent(anchor, s, anchor.anchorMs + 60_000);
    assert.equal(p0, 56);
    assert.ok(pHalf > p0);
    assert.ok(pHalf <= 67);
});

test("countdown ticks down from anchor ETA", () => {
    const anchor = createInstallProgressAnchorState();
    const s = createInstallProgressState();
    processInstallProgressLine(s, "[###-------------------]  12%  |  about 90s left  |");
    refreshInstallProgressAnchor(anchor, s);
    assert.equal(getCountdownSecondsRemaining(anchor, anchor.anchorMs), 90);
    assert.equal(getCountdownSecondsRemaining(anchor, anchor.anchorMs + 30_000), 60);
    assert.equal(getCountdownSecondsRemaining(anchor, anchor.anchorMs + 89_000), 1);
    assert.equal(getCountdownSecondsRemaining(anchor, anchor.anchorMs + 95_000), 0);
});
