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

    test('collectDocumentHeadings stays linear for many headings', () => {
        const parts = [];
        for (let i = 1; i <= 200; i += 1) {
            parts.push(`## Heading ${i}\n\nparagraph\n`);
        }
        const markdown = parts.join('');
        const headings = collectDocumentHeadings(markdown);
        assert.equal(headings.length, 200);
        assert.equal(headings[0].line, 1);
        assert.equal(headings[199].title, 'Heading 200');
        assert.ok(headings[199].line > headings[0].line);
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
