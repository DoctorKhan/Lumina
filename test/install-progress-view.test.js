import assert from "node:assert/strict";
import test from "node:test";
import {
    createInstallProgressState,
    processInstallProgressLine
} from "../src/installProgressParse.js";
import {
    createInstallProgressViewModel,
    displayPercentFromInstallProgress
} from "../src/installProgressView.js";

test("display percent uses raw bar from install.sh when a bar line is present (no step override)", () => {
    const s = createInstallProgressState();
    processInstallProgressLine(s, "[----------------------]   0%  |  about 7m 17s left  |  4s elapsed");
    processInstallProgressLine(s, "[6/9]  Building macOS app bundle");

    assert.equal(s.percent, 0);
    assert.equal(displayPercentFromInstallProgress(s), 0);
});

test("display percent keeps raw bar percent when it is ahead of step floor", () => {
    const s = createInstallProgressState();
    processInstallProgressLine(s, "[#################-----]  80%  |  about 17s left  |  1m 12s elapsed");
    processInstallProgressLine(s, "[7/9]  Copying app to /Applications");

    assert.equal(displayPercentFromInstallProgress(s), 80);
});

test("view model is render-ready and clamps completion", () => {
    const s = createInstallProgressState();
    processInstallProgressLine(s, "[####################]  100%  |  about 0s left  |  10m 0s elapsed");

    assert.deepEqual(
        createInstallProgressViewModel(s),
        {
            percent: 100,
            percentText: "100%",
            width: 100,
            subtitle: "~0s left",
            title: "100% · ~0s left"
        }
    );
});
