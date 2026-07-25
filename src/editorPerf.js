/** Ring-buffer performance log for editor hot paths (zero cost when disabled). */

export const DEFAULT_MAX_ENTRIES = 4000;
export const SLOW_EVENT_MS = 16;
export const PERF_STORAGE_KEY = 'lumina-editor-perf';

export function summarizePerfEntries(entries) {
    const byEvent = new Map();
    for (const entry of entries) {
        const bucket = byEvent.get(entry.event) || {
            count: 0,
            totalMs: 0,
            maxMs: 0,
            slowCount: 0
        };
        bucket.count += 1;
        const durationMs = Number(entry.durationMs) || 0;
        bucket.totalMs += durationMs;
        bucket.maxMs = Math.max(bucket.maxMs, durationMs);
        if (entry.slow || durationMs >= SLOW_EVENT_MS) bucket.slowCount += 1;
        byEvent.set(entry.event, bucket);
    }

    return [...byEvent.entries()]
        .map(([event, stats]) => ({
            event,
            count: stats.count,
            avgMs: stats.count ? stats.totalMs / stats.count : 0,
            maxMs: stats.maxMs,
            slowCount: stats.slowCount
        }))
        .sort((a, b) => b.avgMs * b.count - a.avgMs * a.count || b.count - a.count);
}

export function formatPerfEntry(entry) {
    const time = new Date(entry.t).toISOString();
    const duration =
        entry.durationMs != null ? ` ${entry.durationMs.toFixed(2)}ms` : '';
    const slow = entry.slow ? ' SLOW' : '';
    const meta = [];
    if (entry.chars != null) meta.push(`chars=${entry.chars}`);
    if (entry.gen != null) meta.push(`gen=${entry.gen}`);
    if (entry.detail) meta.push(String(entry.detail));
    if (entry.start != null && entry.end != null) {
        meta.push(`range=${entry.start}..${entry.end}`);
    }
    if (entry.clamped) meta.push('clamped');
    if (entry.skipped) meta.push('skipped');
    if (entry.error) meta.push(`error=${entry.error}`);
    const suffix = meta.length ? ` ${meta.join(' ')}` : '';
    return `${time} ${entry.event}${duration}${slow}${suffix}`;
}

export function createEditorPerfLog(options = {}) {
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const entries = [];
    let enabled = Boolean(options.enabled);
    const listeners = new Set();

    function now() {
        return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    function notify() {
        for (const listener of listeners) listener(entries);
    }

    function record(event, detail = {}) {
        if (!enabled) return;
        entries.push({
            t: Date.now(),
            event,
            ...detail
        });
        if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);
        notify();
    }

    function startSpan(event, detail = {}) {
        if (!enabled) return () => {};
        const started = now();
        return (extra = {}) => {
            const durationMs = now() - started;
            record(event, {
                ...detail,
                ...extra,
                durationMs,
                slow: durationMs >= SLOW_EVENT_MS
            });
        };
    }

    function setEnabled(next) {
        enabled = Boolean(next);
        if (enabled) record('perf.enabled');
        notify();
    }

    function clear() {
        entries.length = 0;
        notify();
    }

    function summary() {
        return summarizePerfEntries(entries);
    }

    function exportText({ includeSummary = true } = {}) {
        const lines = entries.map((entry) => formatPerfEntry(entry));
        if (!includeSummary) return lines.join('\n');
        const summaryLines = summary().map(
            (row) =>
                `# ${row.event} count=${row.count} avg=${row.avgMs.toFixed(2)}ms max=${row.maxMs.toFixed(2)}ms slow=${row.slowCount}`
        );
        return [...summaryLines, '', ...lines].join('\n');
    }

    function exportJson() {
        return JSON.stringify(
            {
                exportedAt: new Date().toISOString(),
                summary: summary(),
                entries
            },
            null,
            2
        );
    }

    function onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    return {
        record,
        startSpan,
        setEnabled,
        isEnabled: () => enabled,
        clear,
        summary,
        exportText,
        exportJson,
        get entries() {
            return entries;
        },
        onChange
    };
}
