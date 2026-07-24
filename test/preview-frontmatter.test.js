import assert from "node:assert/strict";
import test from "node:test";
import { marked } from "../src/previewLoaders.js";
import {
    renderFrontmatterHtml,
    splitYamlFrontmatter
} from "../src/previewFrontmatter.js";

const PANDOC_SAMPLE = `---
title: "The Thermodynamic Arrow of the Nested Observer Window: Entropic Time and the Markov Blanket"
author:
  - "Rez Khan"
  - "AI Research Collaborator"
date: "July 2026"
---
## Abstract

The asymmetry of time in macroscopic systems is governed by the second law.
`;

test("splitYamlFrontmatter extracts Pandoc metadata and body", () => {
    const { metadata, body, frontmatterLineCount } = splitYamlFrontmatter(PANDOC_SAMPLE);

    assert.equal(
        metadata.title,
        "The Thermodynamic Arrow of the Nested Observer Window: Entropic Time and the Markov Blanket"
    );
    assert.deepEqual(metadata.author, ["Rez Khan", "AI Research Collaborator"]);
    assert.equal(metadata.date, "July 2026");
    assert.match(body, /^## Abstract/);
    assert.equal(frontmatterLineCount, 8);
});

test("splitYamlFrontmatter leaves non-frontmatter documents unchanged", () => {
    const source = "# Hello\n\n---\n\nNot frontmatter.";
    const { metadata, body, frontmatterLineCount } = splitYamlFrontmatter(source);

    assert.equal(metadata, null);
    assert.equal(body, source);
    assert.equal(frontmatterLineCount, 0);
});

test("splitYamlFrontmatter ignores invalid YAML at document start", () => {
    const source = `---
title: [unclosed
---
## Still broken
`;
    const { metadata, body } = splitYamlFrontmatter(source);

    assert.equal(metadata, null);
    assert.equal(body, source);
});

test("marked no longer mis-parses frontmatter after stripping", () => {
    const { body } = splitYamlFrontmatter(PANDOC_SAMPLE);
    const html = marked.parse(body);

    assert.doesNotMatch(html, /<hr>/);
    assert.match(html, /<h2>Abstract<\/h2>/);
    assert.doesNotMatch(html, /Thermodynamic Arrow/);
});

test("renderFrontmatterHtml renders title, author list, and date", () => {
    const { metadata } = splitYamlFrontmatter(PANDOC_SAMPLE);
    const html = renderFrontmatterHtml(metadata);

    assert.match(html, /<header class="document-frontmatter">/);
    assert.match(html, /Thermodynamic Arrow/);
    assert.match(html, /Rez Khan, AI Research Collaborator/);
    assert.match(html, /July 2026/);
    assert.doesNotMatch(html, /&quot;/);
});

test("renderFrontmatterHtml escapes HTML in metadata values", () => {
    const html = renderFrontmatterHtml({
        title: "<script>alert(1)</script>",
        author: "A & B",
        date: "2026"
    });

    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /A &amp; B/);
    assert.doesNotMatch(html, /<script>/);
});
