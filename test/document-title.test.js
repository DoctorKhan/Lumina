import test from 'node:test';
import assert from 'node:assert/strict';
import { documentWindowTitle } from '../src/documentTitle.ts';

test('file title is the name plus its parent folder', () => {
  assert.equal(documentWindowTitle({ path: '/Users/me/docs/notes.md' }), 'notes.md — docs');
});

test('a file at the root has no parent folder', () => {
  assert.equal(documentWindowTitle({ path: '/notes.md' }), 'notes.md');
});

test('trailing slashes are ignored', () => {
  assert.equal(documentWindowTitle({ path: '/a/b/' }), 'b — a');
});

test('unsaved documents use the fallback name, else Untitled', () => {
  assert.equal(documentWindowTitle({ path: null, fallbackName: 'Lumina Help' }), 'Lumina Help');
  assert.equal(documentWindowTitle({ path: null, fallbackName: '  ' }), 'Untitled');
  assert.equal(documentWindowTitle({ path: null }), 'Untitled');
});
