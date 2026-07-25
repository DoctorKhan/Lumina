import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createEditorPerfLog,
    formatPerfEntry,
    summarizePerfEntries
} from '../src/editorPerf.js';

describe('editorPerf', () => {
    test('createEditorPerfLog is a no-op when disabled', () => {
        const perf = createEditorPerfLog({ enabled: false });
        perf.record('ignored');
        assert.equal(perf.entries.length, 0);
    });

    test('startSpan records duration and slow flag', () => {
        const perf = createEditorPerfLog({ enabled: true });
        const end = perf.startSpan('test.span');
        end();
        assert.equal(perf.entries.length, 1);
        assert.equal(perf.entries[0].event, 'test.span');
        assert.equal(typeof perf.entries[0].durationMs, 'number');
    });

    test('summarizePerfEntries aggregates by event', () => {
        const summary = summarizePerfEntries([
            { event: 'a', durationMs: 10, slow: false },
            { event: 'a', durationMs: 30, slow: true },
            { event: 'b', durationMs: 4, slow: false }
        ]);
        assert.equal(summary[0].event, 'a');
        assert.equal(summary[0].count, 2);
        assert.equal(summary[0].maxMs, 30);
        assert.equal(summary[0].slowCount, 1);
    });

    test('formatPerfEntry renders a readable line', () => {
        const line = formatPerfEntry({
            t: Date.parse('2026-07-25T04:00:00.000Z'),
            event: 'editor.input.batch',
            durationMs: 12.5,
            slow: false,
            chars: 120000,
            gen: 42
        });
        assert.match(line, /editor\.input\.batch 12\.50ms/);
        assert.match(line, /chars=120000 gen=42/);
    });
});
