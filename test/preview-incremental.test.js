import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import {
    countElementTokens,
    diffTokenRange,
    tokensAreDomMappable
} from '../src/previewIncremental.js';

// Mirror the splice main.js performs: start from one child per element token,
// remove `oldRemove` children at `domSkip`, insert the freshly rendered ones.
// Returns the resulting child list so tests can compare it against a full
// rebuild's child list.
function applyIncrementalSplice(oldSource, newSource) {
    const oldTokens = marked.lexer(oldSource);
    const newTokens = marked.lexer(newSource);
    assert.ok(tokensAreDomMappable(oldTokens), 'old tokens should be DOM-mappable');
    assert.ok(tokensAreDomMappable(newTokens), 'new tokens should be DOM-mappable');

    const { prefix, suffix } = diffTokenRange(oldTokens, newTokens);
    const domSkip = countElementTokens(newTokens, 0, prefix);
    const oldRemove = countElementTokens(oldTokens, prefix, oldTokens.length - suffix);
    const changed = newTokens.slice(prefix, newTokens.length - suffix);
    const newAdd = countElementTokens(changed, 0, changed.length);

    // raw of every changed token, concatenated, must be an exact slice of the
    // new source — otherwise the re-rendered HTML would not match.
    const sliceRaw = changed.map((token) => token.raw).join('');
    assert.ok(newSource.includes(sliceRaw), 'changed slice must be exact source substring');

    // Identify children by the element token's raw so we can verify the splice
    // reproduces exactly what a full rebuild would yield.
    const fullRebuild = newTokens.filter((token) => token.type !== 'space').map((token) => token.raw);
    const oldChildren = oldTokens.filter((token) => token.type !== 'space').map((token) => token.raw);
    const inserted = changed.filter((token) => token.type !== 'space').map((token) => token.raw);

    const spliced = oldChildren.slice();
    spliced.splice(domSkip, oldRemove, ...inserted);

    return { spliced, fullRebuild, prefix, suffix, domSkip, oldRemove, newAdd };
}

const DOC = [
    '# Title',
    '',
    'First paragraph of the document.',
    '',
    '## Section',
    '',
    'Second paragraph here with some words.',
    '',
    'Third paragraph trailing the section.',
    '',
    '---',
    '',
    'Closing paragraph.',
    ''
].join('\n');

test('editing one paragraph patches exactly that block', () => {
    const edited = DOC.replace('Second paragraph here', 'Second paragraph here EDITED');
    const r = applyIncrementalSplice(DOC, edited);
    assert.deepEqual(r.spliced, r.fullRebuild);
    assert.equal(r.oldRemove, 1);
    assert.equal(r.newAdd, 1);
});

test('splitting a paragraph in two reconciles child count', () => {
    const edited = DOC.replace(
        'Second paragraph here with some words.',
        'Second paragraph here.\n\nWith some words.'
    );
    const r = applyIncrementalSplice(DOC, edited);
    assert.deepEqual(r.spliced, r.fullRebuild);
    assert.equal(r.oldRemove, 1);
    assert.equal(r.newAdd, 2);
});

test('deleting a block removes exactly one child', () => {
    const edited = DOC.replace('Third paragraph trailing the section.\n\n', '');
    const r = applyIncrementalSplice(DOC, edited);
    assert.deepEqual(r.spliced, r.fullRebuild);
    assert.equal(r.oldRemove, 1);
    assert.equal(r.newAdd, 0);
});

test('inserting a new heading inserts without removing', () => {
    const edited = DOC.replace('## Section', '## Inserted\n\nNew intro.\n\n## Section');
    const r = applyIncrementalSplice(DOC, edited);
    assert.deepEqual(r.spliced, r.fullRebuild);
    assert.equal(r.oldRemove, 0);
    assert.equal(r.newAdd, 2);
});

test('appending a block at the very end is localized', () => {
    const edited = `${DOC}\nA brand new trailing paragraph.\n`;
    const r = applyIncrementalSplice(DOC, edited);
    assert.deepEqual(r.spliced, r.fullRebuild);
    // The whole unchanged head is preserved; only the tail is touched. (The
    // prior final paragraph's trailing-newline token shifts, so it joins the
    // changed region — at most one removal, at least one insertion.)
    assert.ok(r.domSkip >= r.fullRebuild.length - 3);
    assert.ok(r.newAdd >= 1);
    assert.ok(r.oldRemove <= 1);
});

test('editing the first block keeps the rest untouched', () => {
    const edited = DOC.replace('# Title', '# Title Renamed');
    const r = applyIncrementalSplice(DOC, edited);
    assert.deepEqual(r.spliced, r.fullRebuild);
    assert.equal(r.domSkip, 0);
    assert.equal(r.oldRemove, 1);
    assert.equal(r.newAdd, 1);
});

test('html blocks are not DOM-mappable (forces full rebuild)', () => {
    const tokens = marked.lexer('<div>raw</div>\n\nText.');
    assert.equal(tokensAreDomMappable(tokens), false);
});

test('countElementTokens skips space tokens', () => {
    const tokens = marked.lexer('A\n\nB\n\nC');
    assert.equal(countElementTokens(tokens, 0, tokens.length), 3);
    assert.ok(tokens.some((token) => token.type === 'space'));
});
