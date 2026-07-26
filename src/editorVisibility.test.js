import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, statSync } from 'node:fs';

describe('editor source visibility regression', () => {
    it('preserves the source textarea and editor markup in index.html', () => {
        const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

        assert.ok(
            html.includes('id="editor"'),
            'index.html must include the source textarea with id="editor".'
        );

        assert.ok(
            html.includes('editor-input-wrap'),
            'index.html must include the .editor-input-wrap container for the source editor.'
        );

        assert.ok(
            html.includes('editor-highlight-layer'),
            'index.html must include the #editor-highlight-layer highlight mirror.'
        );

        assert.ok(
            !html.includes('id="editor-host"'),
            'Remove any stray #editor-host host containers that replace the textarea.'
        );
    });

    it('keeps editorApi.js focused on toggle wiring, not editor DOM removal', () => {
        const apiSource = readFileSync(new URL('./editorApi.js', import.meta.url), 'utf8');

        assert.ok(
            apiSource.includes('toggleEditorMode'),
            'editorApi.js should expose a toggleEditorMode helper for optional CM6 switching.'
        );

        assert.ok(
            apiSource.includes('getCurrentMode'),
            'editorApi.js should expose the current editor mode for diagnostics.'
        );

        assert.ok(
            apiSource.includes('activeEditorNode'),
            'editorApi.js should expose the active editor node without breaking DOM identity.'
        );

        assert.ok(
            !apiSource.includes('remove()') || !apiSource.includes('originalEditorEl.remove()'),
            'editorApi.js must not remove the legacy editor element.'
        );
    });

    it('does not overwrite the legacy editor reference in main.js', () => {
        const mainSource = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

        const editorDecl = mainSource.match(/const\s+editor\s*=\s*document\.getElementById\(['"]editor['"]\);?/);

        assert.ok(
            editorDecl,
            'main.js must keep the legacy editor reference as document.getElementById("editor").'
        );
    });
});
