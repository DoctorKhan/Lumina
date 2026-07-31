import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    countNewlines,
    countWords,
    editorHistoryDebounceMsForSize,
    editorHistoryLimitForSize,
    editorMetricsDebounceMsForSize,
    isLargeDocument,
    outlineRefreshDebounceMsForSize,
    previewInputDebounceMsForSize,
    selectPreviewTokenWindow,
    previewWindowNeedsRefresh,
    EDITOR_METRICS_DEBOUNCE_MS,
    EDITOR_METRICS_DEBOUNCE_MS_LARGE,
    LARGE_DOCUMENT_CHAR_THRESHOLD,
    OUTLINE_REFRESH_DEBOUNCE_MS,
    OUTLINE_REFRESH_DEBOUNCE_MS_LARGE
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

    test('outline refresh debounce scales for large documents', () => {
        assert.equal(outlineRefreshDebounceMsForSize(1000), OUTLINE_REFRESH_DEBOUNCE_MS);
        assert.equal(
            outlineRefreshDebounceMsForSize(LARGE_DOCUMENT_CHAR_THRESHOLD),
            OUTLINE_REFRESH_DEBOUNCE_MS_LARGE
        );
    });

    test('selectPreviewTokenWindow handles empty tokens and doc edges', () => {
        assert.deepEqual(selectPreviewTokenWindow([], 0), {
            start: 0,
            end: -1,
            startLine: 0,
            endLine: 0,
            linesBefore: 0,
            linesAfter: 0,
            markdown: ''
        });

        const tokens = [
            { type: 'space', raw: '\n\n' },
            { type: 'heading', raw: '# Start\n\n' },
            { type: 'paragraph', raw: 'Body\n\n' },
            { type: 'space', raw: '\n' },
            { type: 'heading', raw: '# End\n' }
        ];
        const atStart = selectPreviewTokenWindow(tokens, 0, 1);
        assert.equal(atStart.start, 0);
        assert.match(atStart.markdown, /Start/);

        const lastLine =
            countNewlines(tokens.map((t) => t.raw).join(''));
        const atEnd = selectPreviewTokenWindow(tokens, lastLine, 1);
        assert.match(atEnd.markdown, /End/);
        assert.ok(atEnd.linesBefore >= 0);
    });

    test('selectPreviewTokenWindow skips space tokens when counting radius', () => {
        const tokens = [
            { type: 'heading', raw: '# A\n\n' },
            { type: 'space', raw: '\n\n' },
            { type: 'paragraph', raw: 'one\n\n' },
            { type: 'space', raw: '\n\n' },
            { type: 'paragraph', raw: 'two\n\n' },
            { type: 'heading', raw: '# B\n' }
        ];
        // radius 2: focus heading counts as 1, next non-space paragraph as 2; spaces are free
        const window = selectPreviewTokenWindow(tokens, 0, 2);
        assert.ok(window.end >= 2);
        assert.match(window.markdown, /one/);
        assert.ok(window.markdown.includes('\n\n'));
    });
});
