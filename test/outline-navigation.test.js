import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fs from 'node:fs';

/**
 * Regression guard for outline → preview navigation on large (windowed) docs.
 * The production bug: scrollEditorToOffset set previewWindowScrollAnchorLine,
 * then the editor scroll listener cleared it before updatePreview() restored
 * scroll — preview stayed on the first rendered slice.
 */
describe('outline navigation regressions', () => {
    test('outline jump locks the preview scroll anchor through editor scroll', () => {
        const main = fs.readFileSync('src/main.js', 'utf8');
        assert.match(main, /let previewScrollAnchorLocked = false/);
        assert.match(main, /previewScrollAnchorLocked = true/);
        assert.match(
            main,
            /void updatePreview\(\)\.finally\(\(\) => \{\s*previewScrollAnchorLocked = false/
        );
        assert.match(main, /if \(!previewScrollAnchorLocked\)/);
    });

    test('windowed outline jump skips stale preview sync before re-window', () => {
        const main = fs.readFileSync('src/main.js', 'utf8');
        assert.match(
            main,
            /scrollEditorMatchIntoView\(offset, offset, \{ syncPreview: !largeDocument \}\)/
        );
    });
});
