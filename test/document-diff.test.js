import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    buildDocumentDiffPreview,
    computeLineDiffOps,
    describeConflictAction,
    summarizeLineDiffOps
} from '../src/documentDiff.js';

describe('documentDiff', () => {
    test('computeLineDiffOps detects added and removed lines', () => {
        const ops = computeLineDiffOps('alpha\nbeta', 'alpha\ngamma');
        const summary = summarizeLineDiffOps(ops);
        assert.equal(summary.removed, 1);
        assert.equal(summary.added, 1);
        assert.equal(summary.unchanged, 1);
    });

    test('buildDocumentDiffPreview marks identical content', () => {
        const preview = buildDocumentDiffPreview('hello\nworld', 'hello\nworld');
        assert.equal(preview.identical, true);
        assert.match(preview.summaryText, /match/i);
    });

    test('buildDocumentDiffPreview includes changed line preview', () => {
        const preview = buildDocumentDiffPreview(
            '# Title\n\nOld paragraph.\n',
            '# Title\n\nNew paragraph.\n'
        );
        assert.equal(preview.identical, false);
        assert.ok(preview.lines.some((line) => line.type === 'del' || line.type === 'add'));
    });

    test('describeConflictAction explains recovery vs reload', () => {
        assert.match(describeConflictAction('recovery').primaryLabel, /recovered draft/i);
        assert.match(describeConflictAction('reload').primaryLabel, /disk/i);
    });
});
