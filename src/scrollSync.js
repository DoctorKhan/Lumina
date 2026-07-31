/** Preview↔editor scroll map interpolation and sync ownership (pure). */

export function initialScrollSync() {
    return {
        owner: null // 'editor' | 'preview' | null
    };
}

/**
 * Scroll sync ownership reducer.
 * Events: EditorScrolled | PreviewScrolled | SyncFromEditorApplied | ReleaseOwner
 */
export function scrollSyncReduce(state, event) {
    switch (event.type) {
        case 'EditorScrolled':
            return { ...state, owner: 'editor' };
        case 'PreviewScrolled':
            // Ignore preview-driven ownership while editor owns the sync frame.
            if (state.owner === 'editor') return state;
            return { ...state, owner: 'preview' };
        case 'SyncFromEditorApplied':
            return { ...state, owner: 'editor' };
        case 'ReleaseOwner':
            return { ...state, owner: null };
        default:
            return state;
    }
}

/** True when preview scroll should not drive re-window / focus override. */
export function shouldIgnorePreviewScroll(state) {
    return state.owner === 'editor';
}

/**
 * Convert a source line into a preview scrollTop by interpolating
 * between the two mapped blocks that bracket it.
 * @param {{ line: number, top: number }[]} map
 * @param {number} anchorLine
 * @returns {number | null}
 */
export function previewTopForLine(map, anchorLine) {
    if (!map?.length) return null;
    if (anchorLine <= map[0].line) return map[0].top;
    const last = map[map.length - 1];
    if (anchorLine >= last.line) return last.top;
    for (let i = 0; i < map.length - 1; i += 1) {
        const a = map[i];
        const b = map[i + 1];
        if (anchorLine >= a.line && anchorLine < b.line) {
            const span = b.line - a.line || 1;
            const fraction = (anchorLine - a.line) / span;
            return a.top + fraction * (b.top - a.top);
        }
    }
    return last.top;
}

/**
 * Inverse of previewTopForLine: fractional source line at preview scrollTop.
 * @param {{ line: number, top: number }[]} map
 * @param {number} scrollTop
 * @returns {number | null}
 */
export function previewLineForTop(map, scrollTop) {
    if (!map?.length) return null;
    const targetTop = Math.max(0, scrollTop);
    if (targetTop <= map[0].top) return map[0].line;
    const last = map[map.length - 1];
    if (targetTop >= last.top) return last.line;

    let low = 0;
    let high = map.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (map[mid].top <= targetTop) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    const before = map[Math.max(0, high)];
    const after = map[Math.min(map.length - 1, high + 1)];
    const span = after.top - before.top;
    if (span <= 0) return before.line;
    return before.line + ((targetTop - before.top) / span) * (after.line - before.line);
}
