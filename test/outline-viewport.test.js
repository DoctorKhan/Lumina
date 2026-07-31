import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    estimateFocusLineFromSpacers,
    initialOutlineState,
    outlinePaneReduce,
    resolveOutlineViewportLine
} from '../src/outlineViewport.js';
import { collectDocumentHeadings } from '../src/documentOutline.js';
import { PREVIEW_WINDOW_LINE_HEIGHT_PX } from '../src/largeDocument.js';

describe('outlineViewport', () => {
    test('estimateFocusLineFromSpacers returns null inside the rendered window', () => {
        const line = estimateFocusLineFromSpacers({
            scrollTop: 500,
            clientHeight: 400,
            topSpacer: { offsetTop: 0, offsetHeight: 200 },
            bottomSpacer: { offsetTop: 2000, offsetHeight: 800 },
            windowStartLine: 40,
            windowEndLine: 120
        });
        assert.equal(line, null);
    });

    test('estimateFocusLineFromSpacers maps scroll into the top spacer', () => {
        const line = estimateFocusLineFromSpacers({
            scrollTop: 26,
            clientHeight: 400,
            topSpacer: { offsetTop: 0, offsetHeight: 400 },
            bottomSpacer: null,
            windowStartLine: 40,
            windowEndLine: 120,
            lineHeightPx: PREVIEW_WINDOW_LINE_HEIGHT_PX
        });
        assert.equal(line, 1);
    });

    test('estimateFocusLineFromSpacers clamps top-spacer estimate to windowStartLine', () => {
        const line = estimateFocusLineFromSpacers({
            scrollTop: 0,
            clientHeight: 400,
            topSpacer: { offsetTop: 0, offsetHeight: 2000 },
            bottomSpacer: null,
            windowStartLine: 40,
            windowEndLine: 120,
            lineHeightPx: 26
        });
        assert.equal(line, 0);
    });

    test('estimateFocusLineFromSpacers maps view bottom into the bottom spacer', () => {
        const line = estimateFocusLineFromSpacers({
            scrollTop: 1800,
            clientHeight: 400,
            topSpacer: { offsetTop: 0, offsetHeight: 100 },
            bottomSpacer: { offsetTop: 2000, offsetHeight: 800 },
            windowStartLine: 40,
            windowEndLine: 120,
            lineHeightPx: 26
        });
        // viewBottom = 2200; y past spacer top = 200 → +7 lines
        assert.equal(line, 120 + Math.floor(200 / 26));
    });

    test('resolveOutlineViewportLine prefers spacer estimate when windowed', () => {
        assert.equal(
            resolveOutlineViewportLine({
                windowed: true,
                spacerEstimate: 55,
                previewLineFromMap: 10,
                editorAnchorLine: 3
            }),
            55
        );
    });

    test('resolveOutlineViewportLine falls through to preview map then editor', () => {
        assert.equal(
            resolveOutlineViewportLine({
                windowed: true,
                spacerEstimate: null,
                previewLineFromMap: 12.5,
                editorAnchorLine: 3
            }),
            12.5
        );
        assert.equal(
            resolveOutlineViewportLine({
                windowed: false,
                spacerEstimate: 99,
                previewLineFromMap: null,
                editorAnchorLine: 7
            }),
            7
        );
        assert.equal(
            resolveOutlineViewportLine({
                windowed: false,
                spacerEstimate: null,
                previewLineFromMap: null,
                editorAnchorLine: undefined
            }),
            0
        );
    });

    test('outlinePaneReduce toggles visibility and derives shown', () => {
        const headings = collectDocumentHeadings('# A\n\n## B\n');
        let state = initialOutlineState({ visible: false, headings });
        assert.equal(state.hasContent, true);
        assert.equal(state.shown, false);

        state = outlinePaneReduce(state, { type: 'Toggle' });
        assert.equal(state.visible, true);
        assert.equal(state.shown, true);

        state = outlinePaneReduce(state, { type: 'SetVisible', visible: false });
        assert.equal(state.shown, false);
        assert.equal(state.activeIndex, -1);
    });

    test('outlinePaneReduce updates activeIndex from viewport line', () => {
        const headings = collectDocumentHeadings('# A\n\n## B\n\nbody\n\n### C\n');
        let state = initialOutlineState({ visible: true, headings });
        state = outlinePaneReduce(state, {
            type: 'ViewportLineChanged',
            viewportLine: 6 // 0-indexed → heading C at line 7
        });
        assert.equal(state.activeIndex, 2);

        state = outlinePaneReduce(state, {
            type: 'HeadingsChanged',
            headings,
            viewportLine: 0
        });
        assert.equal(state.activeIndex, 0);
    });

    test('outlinePaneReduce ignores viewport updates when pane hidden', () => {
        const headings = collectDocumentHeadings('# A\n\n## B\n');
        let state = initialOutlineState({ visible: false, headings });
        state = outlinePaneReduce(state, {
            type: 'ViewportLineChanged',
            viewportLine: 3
        });
        assert.equal(state.activeIndex, -1);
    });
});
