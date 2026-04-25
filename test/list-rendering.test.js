import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("preview CSS restores list markers after Tailwind reset", () => {
  const css = fs.readFileSync("src/styles.css", "utf8");

  assert.match(css, /\.prose ul \{ list-style: disc outside; \}/);
  assert.match(css, /\.prose ol \{ list-style: decimal outside; \}/);
  assert.match(css, /\.prose li \{\s*display: list-item;/);
});

test("outline styling only applies to nested ordered lists", () => {
  const css = fs.readFileSync("src/styles.css", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(css, /\.prose ol\.outline-list \{ list-style: upper-roman outside; \}/);
  assert.match(css, /\.prose ol\.outline-list ol \{ list-style: upper-alpha outside; \}/);
  assert.match(main, /function applySmartOutlineStyles\(\)/);
  assert.match(main, /if \(!list\.querySelector\('ol'\)\) continue;/);
});

test("editor keeps smart list keyboard helpers wired", () => {
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(main, /function handleListEnter\(event\)/);
  assert.match(main, /function handleListIndent\(event\)/);
  assert.match(main, /event\.key === 'Enter'/);
  assert.match(main, /event\.key !== 'Tab'/);
});
