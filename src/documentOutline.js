/** Parse ATX markdown headings for in-document navigation. */

export const OUTLINE_MIN_HEADINGS = 2;

export function collectDocumentHeadings(markdown) {
    const headings = [];
    const pattern = /^(#{1,6})\s+(.+)$/gm;
    let match;
    while ((match = pattern.exec(markdown)) !== null) {
        const before = markdown.slice(0, match.index);
        headings.push({
            level: match[1].length,
            title: match[2].trim(),
            offset: match.index,
            line: before.split('\n').length
        });
    }
    return headings;
}

export function shouldShowDocumentOutline(headings) {
    return headings.length >= OUTLINE_MIN_HEADINGS;
}
