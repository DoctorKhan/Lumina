/** Windowed-preview state machine (pure). */

import {
    isLargeDocument,
    previewWindowNeedsRefresh,
    selectPreviewTokenWindow
} from './largeDocument.js';

export function initialPreviewWindow() {
    return {
        mode: 'full', // 'full' | 'windowed' | 'refreshQueued'
        startLine: 0,
        endLine: 0,
        tokenStart: 0,
        tokenEnd: -1,
        linesBefore: 0,
        linesAfter: 0,
        focusOverride: null,
        pendingFocusLine: null,
        inputRenderPending: false
    };
}

function applyWindowSlice(state, window) {
    return {
        ...state,
        mode: 'windowed',
        startLine: window.startLine,
        endLine: window.endLine,
        tokenStart: window.start,
        tokenEnd: window.end,
        linesBefore: window.linesBefore,
        linesAfter: window.linesAfter,
        focusOverride: null,
        pendingFocusLine: null
    };
}

/**
 * Preview window reducer.
 * Events:
 *   DocumentSized { charCount }
 *   RenderedWindow { window }  — slice from selectPreviewTokenWindow
 *   FocusNearEdge { focusLine, inputRenderPending? }
 *   RenderStarted
 *   RenderFinished
 *   Cleared
 *   SetInputRenderPending { pending }
 *   SetFocusOverride { focusLine }
 */
export function previewWindowReduce(state, event) {
    switch (event.type) {
        case 'DocumentSized': {
            if (!isLargeDocument(event.charCount ?? 0)) {
                return initialPreviewWindow();
            }
            // Large docs stay / become windowed once rendered; sizing alone does not force a slice.
            return state.mode === 'full' ? state : state;
        }
        case 'Cleared':
            return initialPreviewWindow();
        case 'SetInputRenderPending':
            return { ...state, inputRenderPending: Boolean(event.pending) };
        case 'SetFocusOverride':
            return {
                ...state,
                focusOverride:
                    event.focusLine != null && Number.isFinite(event.focusLine)
                        ? Math.max(0, Math.round(event.focusLine))
                        : null
            };
        case 'RenderedWindow': {
            if (!event.window) return state;
            return applyWindowSlice(state, event.window);
        }
        case 'FocusNearEdge': {
            if (state.mode === 'full') return state;
            const inputPending =
                event.inputRenderPending != null
                    ? event.inputRenderPending
                    : state.inputRenderPending;
            if (inputPending) return state;
            const focusLine = event.focusLine;
            if (focusLine == null || !Number.isFinite(focusLine)) return state;
            if (
                !previewWindowNeedsRefresh(focusLine, state.startLine, state.endLine, {
                    linesBefore: state.linesBefore,
                    linesAfter: state.linesAfter
                }, event.policy === 'preview' ? 'preview' : 'editor')
            ) {
                return state;
            }
            return {
                ...state,
                mode: 'refreshQueued',
                pendingFocusLine: Math.max(0, Math.round(focusLine)),
                focusOverride: Math.max(0, Math.round(focusLine))
            };
        }
        case 'RenderStarted':
            return state;
        case 'RenderFinished':
            if (state.mode === 'refreshQueued') {
                return { ...state, mode: 'windowed', pendingFocusLine: null };
            }
            return state;
        default:
            return state;
    }
}

/** Convenience: build a window slice for the current focus (pure). */
export function selectWindowForFocus(tokens, focusLine, blockRadius) {
    return selectPreviewTokenWindow(tokens, focusLine, blockRadius);
}

export function shouldRefreshWindow(state, focusLine, policy = 'editor') {
    if (state.mode === 'full') return false;
    return previewWindowNeedsRefresh(
        focusLine,
        state.startLine,
        state.endLine,
        {
            linesBefore: state.linesBefore,
            linesAfter: state.linesAfter
        },
        policy
    );
}

export function resolvePreviewFocusLine(state, editorAnchorLine) {
    if (state.focusOverride != null && Number.isFinite(state.focusOverride)) {
        return Math.max(0, Math.round(state.focusOverride));
    }
    return Math.max(0, Math.round(editorAnchorLine ?? 0));
}
