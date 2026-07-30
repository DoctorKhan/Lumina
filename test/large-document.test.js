import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    countNewlines,
    countWords,
    editorHistoryDebounceMsForSize,
    editorHistoryLimitForSize,
    editorMetricsDebounceMsForSize,
    isLargeDocument,
    previewInputDebounceMsForSize,
    selectPreviewTokenWindow,
    previewWindowNeedsRefresh,
    EDITOR_METRICS_DEBOUNCE_MS,
    EDITOR_METRICS_DEBOUNCE_MS_LARGE,
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

    test('editor metrics are always debounced', () => {
        assert.equal(editorMetricsDebounceMsForSize(1000), EDITOR_METRICS_DEBOUNCE_MS);
        assert.equal(
            editorMetricsDebounceMsForSize(LARGE_DOCUMENT_CHAR_THRESHOLD),
            EDITOR_METRICS_DEBOUNCE_MS_LARGE
        );
    });

    test('countWords is whitespace-aware without allocating word arrays', () => {
        assert.equal(countWords(''), 0);
        assert.equal(countWords('   \n\t'), 0);
        assert.equal(countWords('one'), 1);
        assert.equal(countWords('one two  three'), 3);
        assert.equal(countWords('alpha\nbeta\tgamma'), 3);
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

    test('previewWindowNeedsRefresh triggers near spacer edges', () => {
        assert.equal(
            previewWindowNeedsRefresh(50, 0, 100, { linesBefore: 0, linesAfter: 0 }),
            false
        );
        assert.equal(
            previewWindowNeedsRefresh(50, 40, 80, { linesBefore: 40, linesAfter: 200 }),
            false
        );
        assert.equal(
            previewWindowNeedsRefresh(42, 40, 80, { linesBefore: 40, linesAfter: 200 }),
            true
        );
        assert.equal(
            previewWindowNeedsRefresh(78, 40, 80, { linesBefore: 40, linesAfter: 200 }),
            true
        );
        assert.equal(
            previewWindowNeedsRefresh(10, 40, 80, { linesBefore: 40, linesAfter: 200 }),
            true
        );
    });
});
