import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    countNewlines,
    editorHistoryDebounceMsForSize,
    editorHistoryLimitForSize,
    isLargeDocument,
    previewInputDebounceMsForSize,
    selectPreviewTokenWindow,
    LARGE_DOCUMENT_CHAR_THRESHOLD
} from '../src/largeDocument.js';

describe('largeDocument', () => {
    test('isLargeDocument uses the char threshold', () => {
        assert.equal(isLargeDocument(LARGE_DOCUMENT_CHAR_THRESHOLD - 1), false);
        assert.equal(isLargeDocument(LARGE_DOCUMENT_CHAR_THRESHOLD), true);
    });

    test('preview debounce scales up for large documents', () => {
        assert.equal(previewInputDebounceMsForSize(1000), 500);
        assert.ok(previewInputDebounceMsForSize(LARGE_DOCUMENT_CHAR_THRESHOLD * 2) > 500);
    });

    test('undo history limit shrinks for large documents', () => {
        assert.equal(editorHistoryLimitForSize(1000), 200);
        assert.equal(editorHistoryLimitForSize(LARGE_DOCUMENT_CHAR_THRESHOLD), 30);
    });

    test('typing debounce scales up for large documents', () => {
        assert.equal(editorHistoryDebounceMsForSize(1000), 250);
        assert.ok(editorHistoryDebounceMsForSize(LARGE_DOCUMENT_CHAR_THRESHOLD * 2) >= 900);
    });

    test('selectPreviewTokenWindow keeps a slice around the cursor line', () => {
        const tokens = [
            { type: 'heading', raw: '# One\n\n' },
            { type: 'paragraph', raw: 'Alpha\n\n' },
            { type: 'heading', raw: '# Two\n\n' },
            { type: 'paragraph', raw: 'Beta\n\n' },
            { type: 'heading', raw: '# Three\n\n' },
            { type: 'paragraph', raw: 'Gamma\n' }
        ];
        const window = selectPreviewTokenWindow(tokens, countNewlines('# One\n\nAlpha\n\n# Two\n\n'), 1);
        assert.ok(window.start <= 2);
        assert.ok(window.end >= 2);
        assert.match(window.markdown, /Two/);
        assert.ok(window.linesBefore > 0);
        assert.ok(window.linesAfter > 0);
    });
});
