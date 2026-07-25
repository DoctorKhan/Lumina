/** Line-based diff helpers for reload / recovery conflict previews. */

export function splitDocumentLines(text) {
    return String(text ?? '').replace(/\r\n/g, '\n').split('\n');
}

function buildLcsTable(oldLines, newLines) {
    const rows = oldLines.length + 1;
    const cols = newLines.length + 1;
    const table = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                table[i][j] = table[i - 1][j - 1] + 1;
            } else {
                table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
            }
        }
    }
    return table;
}

/** Returns grouped line operations: equal, add, del. */
export function computeLineDiffOps(oldText, newText) {
    const oldLines = splitDocumentLines(oldText);
    const newLines = splitDocumentLines(newText);
    const table = buildLcsTable(oldLines, newLines);
    const ops = [];
    let i = oldLines.length;
    let j = newLines.length;

    const pushOp = (type, line) => {
        const last = ops[ops.length - 1];
        if (last && last.type === type) {
            last.lines.push(line);
            return;
        }
        ops.push({ type, lines: [line] });
    };

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            pushOp('equal', oldLines[i - 1]);
            i -= 1;
            j -= 1;
        } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
            pushOp('add', newLines[j - 1]);
            j -= 1;
        } else if (i > 0) {
            pushOp('del', oldLines[i - 1]);
            i -= 1;
        }
    }

    ops.reverse();
    for (const op of ops) {
        op.lines.reverse();
    }
    return ops;
}

export function summarizeLineDiffOps(ops) {
    let added = 0;
    let removed = 0;
    let unchanged = 0;
    for (const op of ops) {
        if (op.type === 'add') added += op.lines.length;
        else if (op.type === 'del') removed += op.lines.length;
        else unchanged += op.lines.length;
    }
    return { added, removed, unchanged };
}

export function flattenDiffPreview(ops, { maxLines = 28, contextLines = 2 } = {}) {
    const flat = [];
    for (const op of ops) {
        for (const line of op.lines) {
            flat.push({ type: op.type, text: line });
        }
    }

    const changedIndexes = flat
        .map((entry, index) => (entry.type === 'equal' ? -1 : index))
        .filter((index) => index >= 0);
    if (!changedIndexes.length) {
        return flat.slice(0, maxLines);
    }

    const first = changedIndexes[0];
    const last = changedIndexes[changedIndexes.length - 1];
    const start = Math.max(0, first - contextLines);
    const end = Math.min(flat.length, last + contextLines + 1);
    const slice = flat.slice(start, end);
    const preview = [];
    if (start > 0) preview.push({ type: 'more', text: `… ${start} unchanged lines above` });
    preview.push(...slice);
    if (end < flat.length) {
        preview.push({ type: 'more', text: `… ${flat.length - end} unchanged lines below` });
    }
    return preview.slice(0, maxLines + 2);
}

export function buildDocumentDiffPreview(oldText, newText, options = {}) {
    const maxChars = options.maxChars ?? 250_000;
    const oldLen = String(oldText ?? '').length;
    const newLen = String(newText ?? '').length;

    if (oldLen > maxChars || newLen > maxChars) {
        return {
            identical: oldText === newText,
            truncated: true,
            summaryText: `Editor ${oldLen.toLocaleString()} chars · Disk ${newLen.toLocaleString()} chars`,
            lines: [
                {
                    type: 'ctx',
                    text: 'Diff preview skipped for large files. Actions below replace the full document.'
                }
            ],
            added: null,
            removed: null
        };
    }

    const ops = computeLineDiffOps(oldText, newText);
    const { added, removed, unchanged } = summarizeLineDiffOps(ops);
    const identical = added === 0 && removed === 0;
    const summaryParts = [];
    if (removed) summaryParts.push(`${removed} line${removed === 1 ? '' : 's'} removed`);
    if (added) summaryParts.push(`${added} line${added === 1 ? '' : 's'} added`);
    if (identical) summaryParts.push(`${unchanged} lines match`);

    return {
        identical,
        truncated: false,
        summaryText: summaryParts.join(', ') || 'No changes',
        lines: identical
            ? [{ type: 'ctx', text: 'Editor matches disk — reload will refresh preview and sync metadata.' }]
            : flattenDiffPreview(ops, options),
        added,
        removed
    };
}

export function describeConflictAction(mode) {
    switch (mode) {
        case 'disk-changed':
            return {
                title: 'File changed on disk',
                primaryLabel: 'Use disk version',
                secondaryLabel: 'Keep my edits',
                leftLabel: 'Your edits',
                rightLabel: 'On disk'
            };
        case 'recovery':
            return {
                title: 'Recovered draft available',
                primaryLabel: 'Use recovered draft',
                secondaryLabel: 'Keep file on disk',
                leftLabel: 'Recovered draft',
                rightLabel: 'On disk'
            };
        case 'reload':
            return {
                title: 'Reload from disk',
                primaryLabel: 'Replace editor with disk',
                secondaryLabel: 'Cancel',
                leftLabel: 'Editor now',
                rightLabel: 'On disk'
            };
        default:
            return {
                title: 'Document conflict',
                primaryLabel: 'Use right side',
                secondaryLabel: 'Keep left side',
                leftLabel: 'Current',
                rightLabel: 'Incoming'
            };
    }
}
