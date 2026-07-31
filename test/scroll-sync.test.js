import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    initialScrollSync,
    previewLineForTop,
    previewTopForLine,
    scrollSyncReduce,
    shouldIgnorePreviewScroll
} from '../src/scrollSync.js';

describe('scrollSync', () => {
    const map = [
        { line: 0, top: 0 },
        { line: 10, top: 100 },
        { line: 20, top: 300 }
    ];

    test('previewTopForLine interpolates between brackets', () => {
        assert.equal(previewTopForLine([], 5), null);
        assert.equal(previewTopForLine(map, -1), 0);
        assert.equal(previewTopForLine(map, 0), 0);
        assert.equal(previewTopForLine(map, 5), 50);
        assert.equal(previewTopForLine(map, 10), 100);
        assert.equal(previewTopForLine(map, 15), 200);
        assert.equal(previewTopForLine(map, 25), 300);
    });

    test('previewLineForTop is the inverse interpolation', () => {
        assert.equal(previewLineForTop([], 50), null);
        assert.equal(previewLineForTop(map, 0), 0);
        assert.equal(previewLineForTop(map, 50), 5);
        assert.equal(previewLineForTop(map, 100), 10);
        assert.equal(previewLineForTop(map, 200), 15);
        assert.equal(previewLineForTop(map, 400), 20);
    });

    test('scrollSyncReduce tracks ownership and release', () => {
        let state = initialScrollSync();
        state = scrollSyncReduce(state, { type: 'EditorScrolled' });
        assert.equal(state.owner, 'editor');
        assert.equal(shouldIgnorePreviewScroll(state), true);

        // Preview scroll while editor owns must not steal ownership.
        state = scrollSyncReduce(state, { type: 'PreviewScrolled' });
        assert.equal(state.owner, 'editor');

        state = scrollSyncReduce(state, { type: 'ReleaseOwner' });
        assert.equal(state.owner, null);

        state = scrollSyncReduce(state, { type: 'PreviewScrolled' });
        assert.equal(state.owner, 'preview');
        assert.equal(shouldIgnorePreviewScroll(state), false);
    });

    test('SyncFromEditorApplied marks editor ownership', () => {
        let state = initialScrollSync();
        state = scrollSyncReduce(state, { type: 'SyncFromEditorApplied' });
        assert.equal(state.owner, 'editor');
        assert.equal(shouldIgnorePreviewScroll(state), true);
    });
});
