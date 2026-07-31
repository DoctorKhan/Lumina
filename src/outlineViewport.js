/** Pure scroll-spy / outline pane policy (no DOM). */

import {
    activeOutlineHeadingIndex,
    shouldShowDocumentOutline
} from './documentOutline.js';
import { PREVIEW_WINDOW_LINE_HEIGHT_PX } from './largeDocument.js';

const SPACER_EDGE_PX = 48;

/**
 * Estimate a source line from windowed-preview spacer geometry.
 * @param {object} input
 * @param {number} input.scrollTop
 * @param {number} input.clientHeight
 * @param {{ offsetTop: number, offsetHeight: number } | null} [input.topSpacer]
 * @param {{ offsetTop: number, offsetHeight: number } | null} [input.bottomSpacer]
 * @param {number} input.windowStartLine
 * @param {number} input.windowEndLine
 * @param {number} [input.lineHeightPx]
 * @returns {number | null}
 */
export function estimateFocusLineFromSpacers({
    scrollTop,
    clientHeight,
    topSpacer = null,
    bottomSpacer = null,
    windowStartLine,
    windowEndLine,
    lineHeightPx = PREVIEW_WINDOW_LINE_HEIGHT_PX
}) {
    if (topSpacer) {
        const spacerBottom = topSpacer.offsetTop + topSpacer.offsetHeight;
        if (scrollTop < spacerBottom - SPACER_EDGE_PX) {
            const y = Math.max(0, scrollTop - topSpacer.offsetTop);
            return Math.max(
                0,
                Math.min(windowStartLine, Math.floor(y / lineHeightPx))
            );
        }
    }
    if (bottomSpacer) {
        const viewBottom = scrollTop + clientHeight;
        if (viewBottom > bottomSpacer.offsetTop + SPACER_EDGE_PX) {
            const y = Math.max(0, viewBottom - bottomSpacer.offsetTop);
            return windowEndLine + Math.floor(y / lineHeightPx);
        }
    }
    return null;
}

/**
 * Resolve the outline viewport line (0-indexed source).
 * Priority: spacer estimate → preview line map → editor caret.
 */
export function resolveOutlineViewportLine({
    windowed,
    spacerEstimate,
    previewLineFromMap,
    editorAnchorLine
}) {
    if (windowed && spacerEstimate != null && Number.isFinite(spacerEstimate)) {
        return spacerEstimate;
    }
    if (previewLineFromMap != null && Number.isFinite(previewLineFromMap)) {
        return previewLineFromMap;
    }
    return Math.max(0, editorAnchorLine ?? 0);
}

function withDerived(state) {
    const hasContent = shouldShowDocumentOutline(state.headings);
    const shown = hasContent && state.visible;
    return { ...state, hasContent, shown };
}

export function initialOutlineState({ visible = false, headings = [] } = {}) {
    return withDerived({
        visible: Boolean(visible),
        headings,
        activeIndex: -1
    });
}

/**
 * Outline pane reducer.
 * Events: Toggle | SetVisible | HeadingsChanged | ViewportLineChanged
 */
export function outlinePaneReduce(state, event) {
    switch (event.type) {
        case 'Toggle': {
            const next = withDerived({
                ...state,
                visible: !state.visible
            });
            if (!next.shown) return { ...next, activeIndex: -1 };
            return next;
        }
        case 'SetVisible': {
            const next = withDerived({
                ...state,
                visible: Boolean(event.visible)
            });
            if (!next.shown) return { ...next, activeIndex: -1 };
            return next;
        }
        case 'HeadingsChanged': {
            const headings = event.headings || [];
            const next = withDerived({ ...state, headings });
            if (!next.shown || !headings.length) {
                return { ...next, activeIndex: -1 };
            }
            const line = event.viewportLine;
            if (line == null || !Number.isFinite(line)) {
                return { ...next, activeIndex: activeOutlineHeadingIndex(headings, 1) };
            }
            return {
                ...next,
                activeIndex: activeOutlineHeadingIndex(headings, Math.floor(line) + 1)
            };
        }
        case 'ViewportLineChanged': {
            if (!state.shown || !state.headings.length) {
                return { ...state, activeIndex: -1 };
            }
            const line = event.viewportLine;
            if (line == null || !Number.isFinite(line)) return state;
            return {
                ...state,
                activeIndex: activeOutlineHeadingIndex(
                    state.headings,
                    Math.floor(line) + 1
                )
            };
        }
        default:
            return state;
    }
}
