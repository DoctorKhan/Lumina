import assert from 'node:assert/strict';
import test from 'node:test';
import {
    UNTITLED_RECOVERY_PATH,
    autosaveDebounceMs,
    isDocumentDirty,
    recoveryDebounceMs,
    recoveryPathForDocument,
    shouldBlockExternalReload,
    shouldOfferRecovery
} from '../src/documentRecovery.js';

test('dirty tracking compares editor content to last persisted baseline', () => {
    assert.equal(isDocumentDirty('hello', 'hello'), false);
    assert.equal(isDocumentDirty('hello!', 'hello'), true);
});

test('external reload is blocked only when the editor has unsaved edits', () => {
    assert.equal(shouldBlockExternalReload(false, 'disk', 'editor'), false);
    assert.equal(shouldBlockExternalReload(true, 'same', 'same'), false);
    assert.equal(shouldBlockExternalReload(true, 'disk', 'editor'), true);
});

test('recovery is offered when snapshot content differs from disk', () => {
    assert.equal(
        shouldOfferRecovery({ recoveryContent: 'draft', diskContent: 'draft' }),
        false
    );
    assert.equal(
        shouldOfferRecovery({ recoveryContent: 'draft', diskContent: 'saved' }),
        true
    );
});

test('recovery path falls back to the untitled sentinel', () => {
    assert.equal(recoveryPathForDocument('/tmp/a.md'), '/tmp/a.md');
    assert.equal(recoveryPathForDocument(null), UNTITLED_RECOVERY_PATH);
    assert.equal(recoveryPathForDocument(''), UNTITLED_RECOVERY_PATH);
});

test('autosave and recovery debounce intervals are defined', () => {
    assert.ok(autosaveDebounceMs >= recoveryDebounceMs);
    assert.ok(recoveryDebounceMs > 0);
});
