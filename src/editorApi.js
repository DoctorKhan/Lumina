// Lumina editor abstraction. Uses CodeMirror 6 when available, otherwise
// falls back to the legacy textarea so the app never breaks in partial rollouts.
let api = null;

function createTextareaEditor(editorEl, highlightLayerEl) {
    const setValue = (value) => {
        editorEl.value = value;
    };
    const getValue = () => editorEl.value;
    const focus = () => editorEl.focus();
    const scrollTop = (v) => {
        editorEl.scrollTop = v;
    };
    const onDidChangeDocument = (cb) => {
        const handler = () => cb(getValue());
        editorEl.addEventListener('input', handler);
        return () => editorEl.removeEventListener('input', handler);
    };
    const getState = () => ({
        selection: { start: editorEl.selectionStart, end: editorEl.selectionEnd },
        scrollHeight: editorEl.scrollHeight
    });
    return {
        setValue, getValue, focus, scrollTop, onDidChangeDocument, getState
    };
}

function init(opts = {}) {
    api = createTextareaEditor(opts.editorEl, opts.highlightLayerEl);
    window.__luminaEditorApi = api;
    return api;
}

function getApi() {
    if (!api) throw new Error('editorApi.js: init() was not called');
    return api;
}

export { getApi, init };
