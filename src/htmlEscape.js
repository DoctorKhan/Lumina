/** Escape text for HTML body content. */
export function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Escape text for double-quoted HTML attributes. */
export function escapeAttr(text) {
    return escapeHtml(text);
}

/** Reject remote URLs for the dev `?file=` bootstrap parameter. */
export function isAllowedInitialFileParam(fileParam) {
    if (!fileParam || typeof fileParam !== 'string') return false;
    const trimmed = fileParam.trim();
    if (!trimmed) return false;
    if (/^https?:\/\//i.test(trimmed)) return false;
    if (trimmed.startsWith('//')) return false;
    if (/^javascript:/i.test(trimmed)) return false;
    if (/^data:/i.test(trimmed)) return false;
    return true;
}
