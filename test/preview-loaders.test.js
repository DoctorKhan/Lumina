import assert from "node:assert/strict";
import test from "node:test";
import { mayNeedKatex } from "../src/previewMathHeuristic.js";
import { marked } from "../src/previewLoaders.js";
import {
    extractMathForMarkdown,
    normalizeEscapedLatexDelimiters,
    restoreMathFromMarkdownHtml
} from "../src/previewMath.js";

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

test("math is protected from Markdown escaping before KaTeX auto-render", () => {
    const source = String.raw`New reserves and token output:

$$
\begin{aligned}
r'_{\text{ELTA}} &= r_{\text{ELTA}} + e, \\
r'_{\text{APP}} &= \frac{k}{r'_{\text{ELTA}}}, \\
\Delta_{\text{APP}} &= r_{\text{APP}} - r'_{\text{APP}}.
\end{aligned}
$$`;

    const protectedValue = extractMathForMarkdown(source);
    const html = restoreMathFromMarkdownHtml(
        marked.parse(protectedValue.markdown),
        protectedValue.math
    );

    assert.match(html, /\\begin\{aligned\}/);
    assert.match(html, /r'_\{\\text\{ELTA\}\} &amp;=/);
    assert.match(html, /\\\\\n/);
});

test("escaped display delimiters with cases survive Markdown parsing", () => {
    const source = String.raw`\[
\text{treasury} =
\begin{cases}
A & \text{if app paused or } \text{kind} = \text{LAUNCH_FEE}, \\
A \cdot \dfrac{p}{10{,}000} & \text{otherwise},
\end{cases}
\]`;

    const normalized = normalizeEscapedLatexDelimiters(source);
    const protectedValue = extractMathForMarkdown(normalized);
    const html = restoreMathFromMarkdownHtml(
        marked.parse(protectedValue.markdown),
        protectedValue.math
    );

    assert.match(html, /\$\$/);
    assert.match(html, /\\begin\{cases\}/);
    assert.match(html, /\\dfrac\{p\}\{10\{,\}000\}/);
    assert.match(html, /\\\\\n/);
});

test("math placeholders do not collide after the tenth equation", () => {
    const source = Array.from({ length: 12 }, (_, index) => `$x_${index}$`).join(" ");
    const protectedValue = extractMathForMarkdown(source);
    const html = restoreMathFromMarkdownHtml(
        marked.parse(protectedValue.markdown),
        protectedValue.math
    );

    assert.equal(protectedValue.math.length, 12);
    assert.doesNotMatch(html, /LUMINAMATHPLACEHOLDER/);
    assert.match(html, /\$x_1\$/);
    assert.match(html, /\$x_10\$/);
    assert.match(html, /\$x_11\$/);
});
