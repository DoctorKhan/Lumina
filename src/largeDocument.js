/** Thresholds and helpers for keeping very large markdown files responsive. */

export const LARGE_DOCUMENT_CHAR_THRESHOLD = 80_000;
export const PREVIEW_WINDOW_BLOCK_RADIUS = 30;
export const PREVIEW_INPUT_DEBOUNCE_MS = 500;
export const PREVIEW_INPUT_DEBOUNCE_MS_LARGE = 1800;
export const EDITOR_METRICS_DEBOUNCE_MS_LARGE = 400;
export const EDITOR_HISTORY_LIMIT_LARGE = 50;
export const EDITOR_HISTORY_LIMIT_DEFAULT = 200;
export const PREVIEW_WINDOW_LINE_HEIGHT_PX = 26;

export function isLargeDocument(charCount) {
    return charCount >= LARGE_DOCUMENT_CHAR_THRESHOLD;
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
