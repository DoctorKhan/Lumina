import assert from "node:assert/strict";
import test from "node:test";
import { mayNeedKatex } from "../src/previewLoaders.js";

test("mayNeedKatex is false for plain text and unpaired $", () => {
    assert.equal(mayNeedKatex(""), false);
    assert.equal(mayNeedKatex("   "), false);
    assert.equal(mayNeedKatex("It costs $5 and $3."), false);
    assert.equal(mayNeedKatex("no math here"), false);
});

test("mayNeedKatex is true for display and inline delimiters", () => {
    assert.equal(mayNeedKatex("$$x$$"), true);
    assert.equal(mayNeedKatex(String.raw`\(a\)`), true);
    assert.equal(mayNeedKatex(String.raw`\[a\]`), true);
    assert.equal(mayNeedKatex("$x$"), true);
    assert.equal(mayNeedKatex("$2+2$"), true);
    assert.equal(mayNeedKatex(String.raw`$\frac{1}{2}$`), true);
});
