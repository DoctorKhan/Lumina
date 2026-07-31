/** Parse ATX markdown headings for in-document navigation. */

export const OUTLINE_MIN_HEADINGS = 2;

export function collectDocumentHeadings(markdown) {
    const headings = [];
    const pattern = /^(#{1,6})\s+(.+)$/gm;
    let match;
    let line = 1;
    let scannedThrough = 0;
    while ((match = pattern.exec(markdown)) !== null) {
        for (let i = scannedThrough; i < match.index; i += 1) {
            if (markdown.charCodeAt(i) === 10) line += 1;
        }
        scannedThrough = match.index;
        headings.push({
            level: match[1].length,
            title: match[2].trim(),
            offset: match.index,
            line
        });
    }
    return headings;
}

export function shouldShowDocumentOutline(headings) {
    return headings.length >= OUTLINE_MIN_HEADINGS;
}

/** Last heading at or above a 1-indexed source line (scroll-spy / caret). */
export function activeOutlineHeadingIndex(headings, sourceLine) {
    if (!headings.length) return -1;
    const line = Math.max(1, Math.floor(sourceLine) || 1);
    let active = 0;
    for (let i = 0; i < headings.length; i += 1) {
        if (headings[i].line <= line) active = i;
        else break;
    }
    return active;
}
