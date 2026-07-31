/** Thresholds and helpers for keeping very large markdown files responsive. */

export const LARGE_DOCUMENT_CHAR_THRESHOLD = 80_000;
export const PREVIEW_WINDOW_BLOCK_RADIUS = 40;
export const PREVIEW_INPUT_DEBOUNCE_MS = 500;
export const PREVIEW_INPUT_DEBOUNCE_MS_LARGE = 1800;
/** Always debounce char/word metrics — full scans must not run on every keystroke. */
export const EDITOR_METRICS_DEBOUNCE_MS = 200;
export const EDITOR_METRICS_DEBOUNCE_MS_LARGE = 400;
export const EDITOR_HISTORY_DEBOUNCE_MS = 250;
export const EDITOR_HISTORY_DEBOUNCE_MS_LARGE = 900;
export const EDITOR_DIRTY_UI_DEBOUNCE_MS_LARGE = 200;
export const OUTLINE_REFRESH_DEBOUNCE_MS = 250;
export const OUTLINE_REFRESH_DEBOUNCE_MS_LARGE = 800;
export const EDITOR_HISTORY_LIMIT_LARGE = 30;
export const EDITOR_HISTORY_LIMIT_DEFAULT = 200;
export const PREVIEW_WINDOW_LINE_HEIGHT_PX = 26;
/** Debounce before re-windowing while still inside rendered content. */
export const PREVIEW_WINDOW_REFRESH_MS = 32;
/** Re-window immediately once the viewport is already on a spacer. */
export const PREVIEW_WINDOW_REFRESH_URGENT_MS = 0;

export function isLargeDocument(charCount) {
    return charCount >= LARGE_DOCUMENT_CHAR_THRESHOLD;
}

export function editorMetricsDebounceMsForSize(charCount) {
    return isLargeDocument(charCount)
        ? EDITOR_METRICS_DEBOUNCE_MS_LARGE
        : EDITOR_METRICS_DEBOUNCE_MS;
}

/** O(n) word count without allocating a per-word array. */
export function countWords(text) {
    if (!text) return 0;
    let count = 0;
    let inWord = false;
    for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        const isSpace =
            code === 32 ||
            code === 9 ||
            code === 10 ||
            code === 13 ||
            code === 12 ||
            code === 160;
        if (isSpace) {
            inWord = false;
        } else if (!inWord) {
            inWord = true;
            count += 1;
        }
    }
    return count;
}

export function previewInputDebounceMsForSize(charCount) {
    if (!isLargeDocument(charCount)) return PREVIEW_INPUT_DEBOUNCE_MS;
    const excess = charCount - LARGE_DOCUMENT_CHAR_THRESHOLD;
    const scale = Math.min(1, excess / LARGE_DOCUMENT_CHAR_THRESHOLD);
    return Math.round(
        PREVIEW_INPUT_DEBOUNCE_MS +
            scale * (PREVIEW_INPUT_DEBOUNCE_MS_LARGE - PREVIEW_INPUT_DEBOUNCE_MS)
    );
}

export function editorHistoryLimitForSize(charCount) {
    return isLargeDocument(charCount) ? EDITOR_HISTORY_LIMIT_LARGE : EDITOR_HISTORY_LIMIT_DEFAULT;
}

export function editorHistoryDebounceMsForSize(charCount) {
    return isLargeDocument(charCount) ? EDITOR_HISTORY_DEBOUNCE_MS_LARGE : EDITOR_HISTORY_DEBOUNCE_MS;
}

export function editorDirtyUiDebounceMsForSize(charCount) {
    return isLargeDocument(charCount) ? EDITOR_DIRTY_UI_DEBOUNCE_MS_LARGE : 0;
}

export function outlineRefreshDebounceMsForSize(charCount) {
    return isLargeDocument(charCount)
        ? OUTLINE_REFRESH_DEBOUNCE_MS_LARGE
        : OUTLINE_REFRESH_DEBOUNCE_MS;
}

export function countNewlines(text) {
    let count = 0;
    for (let i = 0; i < text.length; i += 1) {
        if (text[i] === '\n') count += 1;
    }
    return count;
}

export function tokenStartLines(tokens) {
    const starts = [];
    let line = 0;
    for (let i = 0; i < tokens.length; i += 1) {
        starts.push(line);
        line += countNewlines(tokens[i].raw || '');
    }
    return starts;
}

// Pick a slice of lexer tokens around the block nearest `cursorLine`.
// Returns indices into `tokens` plus line counts for spacer placeholders.
export function selectPreviewTokenWindow(
    tokens,
    cursorLine,
    blockRadius = PREVIEW_WINDOW_BLOCK_RADIUS
) {
    if (!tokens.length) {
        return {
            start: 0,
            end: -1,
            startLine: 0,
            endLine: 0,
            linesBefore: 0,
            linesAfter: 0,
            markdown: ''
        };
    }

    const starts = tokenStartLines(tokens);
    let focusIndex = 0;
    for (let i = 0; i < tokens.length; i += 1) {
        const startLine = starts[i];
        const endLine = startLine + countNewlines(tokens[i].raw || '');
        if (cursorLine >= startLine && cursorLine <= endLine) {
            focusIndex = i;
            break;
        }
        if (startLine <= cursorLine) focusIndex = i;
    }

    let start = focusIndex;
    let blocksBefore = tokens[start].type === 'space' ? 0 : 1;
    while (start > 0 && blocksBefore < blockRadius) {
        start -= 1;
        if (tokens[start].type !== 'space') blocksBefore += 1;
    }

    let end = focusIndex;
    let blocksAfter = tokens[end].type === 'space' ? 0 : 1;
    while (end < tokens.length - 1 && blocksAfter < blockRadius) {
        end += 1;
        if (tokens[end].type !== 'space') blocksAfter += 1;
    }

    const startLine = starts[start] ?? 0;
    let endLine = startLine;
    for (let i = start; i <= end; i += 1) {
        endLine += countNewlines(tokens[i].raw || '');
    }

    const totalLines =
        starts.length > 0
            ? starts[starts.length - 1] + countNewlines(tokens[tokens.length - 1].raw || '')
            : 0;

    return {
        start,
        end,
        startLine,
        endLine,
        linesBefore: startLine,
        linesAfter: Math.max(0, totalLines - endLine),
        markdown: tokens
            .slice(start, end + 1)
            .map((token) => token.raw || '')
            .join('')
    };
}

/** True when the viewport/focus line is near or past the edge of the rendered window. */
export function previewWindowNeedsRefresh(
    focusLine,
    startLine,
    endLine,
    { linesBefore = 0, linesAfter = 0 } = {}
) {
    if (linesBefore <= 0 && linesAfter <= 0) return false;
    const span = Math.max(1, endLine - startLine);
    // Prefetch while still in rendered content, but keep a usable middle so
    // tiny windows are not constantly refreshing.
    const margin = Math.max(8, Math.min(Math.floor(span * 0.35), Math.floor(span / 3)));
    return focusLine < startLine + margin || focusLine > endLine - margin;
}
