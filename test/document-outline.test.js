import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    collectDocumentHeadings,
    shouldShowDocumentOutline
} from '../src/documentOutline.js';

describe('documentOutline', () => {
    test('collectDocumentHeadings extracts nested heading levels', () => {
        const markdown = '# Title\n\n## Section\n\nBody\n\n### Detail\n';
        const headings = collectDocumentHeadings(markdown);
        assert.equal(headings.length, 3);
        assert.deepEqual(
            headings.map((entry) => [entry.level, entry.title, entry.line]),
            [
                [1, 'Title', 1],
                [2, 'Section', 3],
                [3, 'Detail', 7]
            ]
        );
    });

    test('shouldShowDocumentOutline requires at least two headings', () => {
        assert.equal(shouldShowDocumentOutline([]), false);
        assert.equal(shouldShowDocumentOutline([{ level: 1, title: 'One' }]), false);
        assert.equal(
            shouldShowDocumentOutline([
                { level: 1, title: 'One' },
                { level: 2, title: 'Two' }
            ]),
            true
        );
    });
});
