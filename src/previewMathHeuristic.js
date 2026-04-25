/**
 * Heuristic for whether the document may contain math (used to lazy-load KaTeX).
 * Pure module — safe for Node tests.
 */
export function mayNeedKatex(s) {
    if (!s || !s.trim()) {
        return false;
    }
    if (s.includes('$$')) {
        return true;
    }
    if (/\\\(|\\\[|\\\)|\\\]/.test(s)) {
        return true;
    }
    if (/(^|[^\\])\$\\/.test(s) || /(^|[^\\])\$[a-zA-Z]/m.test(s)) {
        return true;
    }
    if (/(^|[^\\])\$[^$]*[\\^_{}][^$]*\$/m.test(s)) {
        return true;
    }
    if (/(^|[^\\])\$[\d\s+*/=().,~-]+\$/m.test(s)) {
        return true;
    }
    return false;
}
