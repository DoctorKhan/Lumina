import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    initialPreviewWindow,
    previewWindowReduce,
    resolvePreviewFocusLine,
    shouldRefreshWindow
} from '../src/previewWindowState.js';
import {
    LARGE_DOCUMENT_CHAR_THRESHOLD,
    selectPreviewTokenWindow
} from '../src/largeDocument.js';

describe('previewWindowState', () => {
    test('Cleared and small DocumentSized reset to full', () => {
        let state = initialPreviewWindow();
        state = previewWindowReduce(state, {
            type: 'RenderedWindow',
            window: {
                start: 0,
                end: 2,
                startLine: 10,
                endLine: 40,
                linesBefore: 10,
                linesAfter: 200
            }
        });
        assert.equal(state.mode, 'windowed');

        state = previewWindowReduce(state, { type: 'DocumentSized', charCount: 1000 });
        assert.equal(state.mode, 'full');
        assert.equal(state.linesBefore, 0);

        state = previewWindowReduce(
            previewWindowReduce(initialPreviewWindow(), {
                type: 'RenderedWindow',
                window: {
                    start: 0,
                    end: 1,
                    startLine: 0,
                    endLine: 20,
                    linesBefore: 0,
                    linesAfter: 50
                }
            }),
            { type: 'Cleared' }
        );
        assert.equal(state.mode, 'full');
    });

    test('FocusNearEdge queues refresh when near spacer edge', () => {
        let state = previewWindowReduce(initialPreviewWindow(), {
            type: 'RenderedWindow',
            window: {
                start: 5,
                end: 15,
                startLine: 40,
                endLine: 80,
                linesBefore: 40,
                linesAfter: 200
            }
        });
        state = previewWindowReduce(state, {
            type: 'FocusNearEdge',
            focusLine: 42
        });
        assert.equal(state.mode, 'refreshQueued');
        assert.equal(state.pendingFocusLine, 42);
        assert.equal(state.focusOverride, 42);
    });

    test('FocusNearEdge ignores refresh while input debounce pending', () => {
        let state = previewWindowReduce(initialPreviewWindow(), {
            type: 'RenderedWindow',
            window: {
                start: 5,
                end: 15,
                startLine: 40,
                endLine: 80,
                linesBefore: 40,
                linesAfter: 200
            }
        });
        state = previewWindowReduce(state, {
            type: 'SetInputRenderPending',
            pending: true
        });
        const next = previewWindowReduce(state, {
            type: 'FocusNearEdge',
            focusLine: 42
        });
        assert.equal(next.mode, 'windowed');
        assert.equal(next.pendingFocusLine, null);
    });

    test('FocusNearEdge no-ops when still inside safe margin', () => {
        let state = previewWindowReduce(initialPreviewWindow(), {
            type: 'RenderedWindow',
            window: {
                start: 5,
                end: 15,
                startLine: 40,
                endLine: 80,
                linesBefore: 40,
                linesAfter: 200
            }
        });
        state = previewWindowReduce(state, {
            type: 'FocusNearEdge',
            focusLine: 60
        });
        assert.equal(state.mode, 'windowed');
    });

    test('RenderFinished clears refreshQueued', () => {
        let state = previewWindowReduce(initialPreviewWindow(), {
            type: 'RenderedWindow',
            window: {
                start: 0,
                end: 1,
                startLine: 40,
                endLine: 80,
                linesBefore: 40,
                linesAfter: 200
            }
        });
        state = previewWindowReduce(state, { type: 'FocusNearEdge', focusLine: 42 });
        state = previewWindowReduce(state, { type: 'RenderFinished' });
        assert.equal(state.mode, 'windowed');
        assert.equal(state.pendingFocusLine, null);
    });

    test('resolvePreviewFocusLine prefers override', () => {
        const state = {
            ...initialPreviewWindow(),
            focusOverride: 91
        };
        assert.equal(resolvePreviewFocusLine(state, 12), 91);
        assert.equal(resolvePreviewFocusLine(initialPreviewWindow(), 12), 12);
    });

    test('shouldRefreshWindow false in full mode', () => {
        assert.equal(shouldRefreshWindow(initialPreviewWindow(), 0), false);
    });

    test('large DocumentSized leaves windowed state intact', () => {
        let state = previewWindowReduce(initialPreviewWindow(), {
            type: 'RenderedWindow',
            window: {
                start: 0,
                end: 1,
                startLine: 0,
                endLine: 10,
                linesBefore: 0,
                linesAfter: 100
            }
        });
        state = previewWindowReduce(state, {
            type: 'DocumentSized',
            charCount: LARGE_DOCUMENT_CHAR_THRESHOLD
        });
        assert.equal(state.mode, 'windowed');
        assert.equal(state.endLine, 10);
    });

    test('selectPreviewTokenWindow still builds slices used by RenderedWindow', () => {
        const tokens = [
            { type: 'heading', raw: '# One\n\n' },
            { type: 'paragraph', raw: 'Alpha\n\n' },
            { type: 'heading', raw: '# Two\n\n' }
        ];
        const window = selectPreviewTokenWindow(tokens, 0, 1);
        const state = previewWindowReduce(initialPreviewWindow(), {
            type: 'RenderedWindow',
            window
        });
        assert.equal(state.mode, 'windowed');
        assert.ok(state.tokenEnd >= state.tokenStart);
    });
});
