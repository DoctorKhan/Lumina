const DOCUMENT_EXTENSION_PATTERN = /\.(?:md|markdown|txt)$/i;

function normalizePath(path) {
    const absolute = path.startsWith('/');
    const parts = [];

    for (const part of path.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (parts.length && parts.at(-1) !== '..') {
                parts.pop();
            } else if (!absolute) {
                parts.push(part);
            }
            continue;
        }
        parts.push(part);
    }

    return `${absolute ? '/' : ''}${parts.join('/')}` || (absolute ? '/' : '.');
}

function decodeLinkPart(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
}

/**
 * Resolve a Markdown link to a local document path, if it targets one.
 * Remote URLs, fragments, and unsupported assets return null so the caller
 * can leave their browser behavior unchanged.
 */
export function resolvePreviewDocumentLink(href, currentFilePath = '') {
    if (typeof href !== 'string') return null;
    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;
    if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^file:/i.test(trimmed)) return null;

    const hashIndex = trimmed.indexOf('#');
    const withoutFragment = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
    const fragment = hashIndex === -1 ? '' : trimmed.slice(hashIndex + 1);
    const queryIndex = withoutFragment.indexOf('?');
    const pathPart = queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex);

    let decodedPath = decodeLinkPart(pathPart);
    if (decodedPath == null) return null;

    if (/^file:/i.test(decodedPath)) {
        try {
            const fileUrl = new URL(decodedPath);
            if (fileUrl.hostname && fileUrl.hostname !== 'localhost') return null;
            decodedPath = decodeLinkPart(fileUrl.pathname);
        } catch {
            return null;
        }
        if (decodedPath == null) return null;
    }

    const resolvedPath = decodedPath.startsWith('/')
        ? normalizePath(decodedPath)
        : currentFilePath
          ? normalizePath(`${currentFilePath.slice(0, currentFilePath.lastIndexOf('/'))}/${decodedPath}`)
          : normalizePath(decodedPath);

    if (!DOCUMENT_EXTENSION_PATTERN.test(resolvedPath)) return null;
    return { path: resolvedPath, fragment };
}

/** Parse GitHub-style line fragments such as #L3467 or #L3467-L3470. */
export function lineNumberFromPreviewFragment(fragment) {
    const decoded = decodeLinkPart(String(fragment || ''));
    if (decoded == null) return null;
    const match = decoded.match(/^L(\d+)(?:-L?\d+)?$/i);
    if (!match) return null;
    const line = Number(match[1]);
    return Number.isSafeInteger(line) && line > 0 ? line : null;
}
