export function looksLikeLatexBlock(lines) {
    const body = lines.join('\n').trim();
    if (!body) return false;

    return /\\[a-zA-Z]+/.test(body) ||
        /[_^]/.test(body) ||
        /\{.*\}/.test(body) ||
        /\\begin\{.*\}|\\end\{.*\}/.test(body) ||
        /\\\\/.test(body) ||
        /\b(min|max|sin|cos|log)\b/.test(body);
}

export function normalizeMathBlocks(input) {
    const lines = input.split('\n');
    const output = [];
    let inCodeFence = false;
    let bracketStart = -1;
    let bracketBody = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('```')) {
            if (bracketStart !== -1) {
                output.push('[');
                output.push(...bracketBody);
                bracketStart = -1;
                bracketBody = [];
            }
            inCodeFence = !inCodeFence;
            output.push(line);
            continue;
        }

        if (inCodeFence) {
            output.push(line);
            continue;
        }

        if (bracketStart === -1 && trimmed === '[') {
            bracketStart = output.length;
            bracketBody = [];
            continue;
        }

        if (bracketStart !== -1 && trimmed === ']') {
            if (looksLikeLatexBlock(bracketBody)) {
                output.push('$$');
                output.push(...bracketBody);
                output.push('$$');
            } else {
                output.push('[');
                output.push(...bracketBody);
                output.push(']');
            }
            bracketStart = -1;
            bracketBody = [];
            continue;
        }

        if (bracketStart !== -1) {
            bracketBody.push(line);
            continue;
        }

        output.push(line);
    }

    if (bracketStart !== -1) {
        output.push('[');
        output.push(...bracketBody);
    }

    return output.join('\n');
}

export function normalizeEscapedLatexDelimiters(input) {
    let output = input.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, expr) => {
        return `$$\n${expr.trim()}\n$$`;
    });

    output = output.replace(/\\\((.*?)\\\)/g, (_, expr) => {
        return `$${expr.trim()}$`;
    });

    return output;
}

function isEscaped(input, index) {
    let slashCount = 0;
    for (let i = index - 1; i >= 0 && input[i] === '\\'; i -= 1) {
        slashCount += 1;
    }
    return slashCount % 2 === 1;
}

function findUnescaped(input, needle, start) {
    let index = input.indexOf(needle, start);
    while (index !== -1) {
        if (!isEscaped(input, index)) return index;
        index = input.indexOf(needle, index + needle.length);
    }
    return -1;
}

function looksLikeInlineMath(body) {
    const trimmed = body.trim();
    if (!trimmed || /\n/.test(trimmed)) return false;
    if (/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return false;

    return /\\[a-zA-Z]+/.test(trimmed) ||
        /[_^{}]/.test(trimmed) ||
        /[=+\-*/<>]/.test(trimmed) ||
        /\b[a-zA-Z]\b/.test(trimmed);
}

export function extractMathForMarkdown(input) {
    const math = [];
    let output = '';
    let cursor = 0;
    let inCodeFence = false;
    let lineStart = true;

    function stash(value) {
        const token = `LUMINAMATHPLACEHOLDER${math.length}X`;
        math.push(value);
        output += token;
    }

    while (cursor < input.length) {
        if (lineStart && input.startsWith('```', cursor)) {
            const lineEnd = input.indexOf('\n', cursor);
            const end = lineEnd === -1 ? input.length : lineEnd + 1;
            output += input.slice(cursor, end);
            cursor = end;
            inCodeFence = !inCodeFence;
            lineStart = true;
            continue;
        }

        if (!inCodeFence && input.startsWith('$$', cursor) && !isEscaped(input, cursor)) {
            const end = findUnescaped(input, '$$', cursor + 2);
            if (end !== -1) {
                stash(input.slice(cursor, end + 2));
                cursor = end + 2;
                lineStart = false;
                continue;
            }
        }

        if (!inCodeFence && input[cursor] === '$' && !isEscaped(input, cursor)) {
            const end = findUnescaped(input, '$', cursor + 1);
            if (end !== -1) {
                const body = input.slice(cursor + 1, end);
                if (looksLikeInlineMath(body)) {
                    stash(input.slice(cursor, end + 1));
                    cursor = end + 1;
                    lineStart = false;
                    continue;
                }
            }
        }

        const char = input[cursor];
        output += char;
        cursor += 1;
        lineStart = char === '\n';
    }

    return { markdown: output, math };
}

export function restoreMathFromMarkdownHtml(html, math) {
    return math.reduce((result, value, index) => {
        const escaped = value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
        return result.split(`LUMINAMATHPLACEHOLDER${index}X`).join(escaped);
    }, html);
}
