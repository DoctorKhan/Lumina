import { parse as parseYaml } from 'yaml';

// Pandoc-style YAML frontmatter: opening --- on line 1, closing --- on its own line.
const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?\r?\n)---(?:[ \t]*(?:\r?\n|$))/;

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function countLines(text) {
    if (!text) return 0;
    let count = 1;
    for (let i = 0; i < text.length; i += 1) {
        if (text[i] === '\n') count += 1;
    }
    return count;
}

function formatAuthor(author) {
    if (author == null) return '';
    if (typeof author === 'string') return author.trim();
    if (Array.isArray(author)) {
        return author
            .map((entry) => formatAuthor(entry))
            .filter(Boolean)
            .join(', ');
    }
    if (typeof author === 'object') {
        if (typeof author.name === 'string') return author.name.trim();
        if (typeof author.literal === 'string') return author.literal.trim();
    }
    return '';
}

function formatMetaValue(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value).trim();
    }
    if (Array.isArray(value)) {
        return value
            .map((entry) => formatMetaValue(entry))
            .filter(Boolean)
            .join(', ');
    }
    if (typeof value === 'object') {
        if (typeof value.name === 'string') return value.name.trim();
        if (typeof value.literal === 'string') return value.literal.trim();
    }
    return '';
}

export function splitYamlFrontmatter(source) {
    const input = source ?? '';
    const match = input.match(FRONTMATTER_PATTERN);
    if (!match) {
        return { metadata: null, body: input, frontmatterLineCount: 0 };
    }

    let metadata;
    try {
        metadata = parseYaml(match[1]);
    } catch {
        return { metadata: null, body: input, frontmatterLineCount: 0 };
    }

    if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return { metadata: null, body: input, frontmatterLineCount: 0 };
    }

    const body = input.slice(match[0].length).replace(/^\r?\n/, '');
    return {
        metadata,
        body,
        frontmatterLineCount: countLines(match[0])
    };
}

export function renderFrontmatterHtml(metadata) {
    if (!metadata || typeof metadata !== 'object') return '';

    const title = formatMetaValue(metadata.title);
    const subtitle = formatMetaValue(metadata.subtitle);
    const author = formatAuthor(metadata.author);
    const date = formatMetaValue(metadata.date);
    const metaParts = [author, date].filter(Boolean);

    const parts = ['<header class="document-frontmatter">'];
    if (title) {
        parts.push(`<h1 class="document-frontmatter-title">${escapeHtml(title)}</h1>`);
    }
    if (subtitle) {
        parts.push(`<p class="document-frontmatter-subtitle">${escapeHtml(subtitle)}</p>`);
    }
    if (metaParts.length > 0) {
        parts.push(
            `<p class="document-frontmatter-meta">${metaParts.map((part) => escapeHtml(part)).join(' · ')}</p>`
        );
    }
    parts.push('</header>');
    return parts.join('');
}
