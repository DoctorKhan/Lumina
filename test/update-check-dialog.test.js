import test from 'node:test';
import assert from 'node:assert/strict';
import { updateCheckDialog } from '../src/updateCheckDialog.ts';

test('available update offers install and names both versions', () => {
    const d = updateCheckDialog({ kind: 'available', latestTag: 'v0.6.2', currentVersion: '0.6.1' });
    assert.equal(d.offerInstall, true);
    assert.match(d.message, /0\.6\.2 is available/);
    assert.match(d.message, /you have 0\.6\.1/);
});

test('current version says up to date without an install offer', () => {
    const d = updateCheckDialog({ kind: 'current', latestTag: 'v0.6.1', currentVersion: '0.6.1' });
    assert.equal(d.offerInstall, false);
    assert.match(d.title, /Up to Date/);
    assert.match(d.message, /0\.6\.1 is the latest/);
});

test('failures surface the error', () => {
    const d = updateCheckDialog({ kind: 'failed', error: 'GitHub tags returned 403' });
    assert.equal(d.offerInstall, false);
    assert.match(d.message, /403/);
});
