import assert from 'node:assert/strict';
import test from 'node:test';
import {
    lineNumberFromPreviewFragment,
    resolvePreviewDocumentLink
} from '../src/previewLinks.js';

const manifest =
    '/Users/khan/Projects/The-Orphaned-Species/drafts/manifests/20260904_book_i_embodied_pilot_index.md';

test('resolves relative Markdown links from the open document directory', () => {
    assert.deepEqual(
        resolvePreviewDocumentLink(
            '../../50_The_Orphaned_Species/manuscripts/I_The_Breach.md#L3467',
            manifest
        ),
        {
            path: '/Users/khan/Projects/The-Orphaned-Species/50_The_Orphaned_Species/manuscripts/I_The_Breach.md',
            fragment: 'L3467'
        }
    );
});

test('decodes local document link paths and ignores unsupported or remote links', () => {
    assert.deepEqual(
        resolvePreviewDocumentLink('../notes/My%20Draft.markdown?view=raw#L8', manifest),
        {
            path: '/Users/khan/Projects/The-Orphaned-Species/drafts/notes/My Draft.markdown',
            fragment: 'L8'
        }
    );
    assert.equal(resolvePreviewDocumentLink('../assets/cover.png', manifest), null);
    assert.equal(resolvePreviewDocumentLink('https://example.com/notes.md', manifest), null);
});

test('parses GitHub-style line fragments', () => {
    assert.equal(lineNumberFromPreviewFragment('L3467'), 3467);
    assert.equal(lineNumberFromPreviewFragment('L3467-L3470'), 3467);
    assert.equal(lineNumberFromPreviewFragment('heading'), null);
});
