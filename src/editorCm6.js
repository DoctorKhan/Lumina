// CodeMirror 6 view wrapper for Lumina.
// Preferred path; if CM6 fails to load, use editorApi.js textarea fallback.
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, highlightSpecialChars, drawSelection } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { vim } from '@replit/codemirror-vim';

const inputHandlers = [];

const cmVmixin = {
    _view: null,
    _setState(next) {
        const previous = this._view.state;
        const changes = this._view.state.update({ changes: next.changes, selection: next.selection, scrollIntoView: next.scrollIntoView });
        this._view.update([changes]);
        if (next._afterUpdate) next._afterUpdate(previous, this);
    },
    _read() {
        const { from, to } = this._view.state.selection.main;
        return {
            selectionStart: from,
            selectionEnd: to,
            value: this._view.state.doc.toString(),
            scrollHeight: this._view.contentDOM?.scrollHeight ?? 0
        };
    },
    get value() { return this._read().value; },
    set value(v) {
        this._setState({ changes: { from: 0, to: this._view.state.doc.toString().length, insert: v } });
    },
    get selectionStart() { return this._read().selectionStart; },
    get selectionEnd() { return this._read().selectionEnd; },
    focus() { this._view.focus(); },
    get scrollTop() { return this._view.contentDOM?.scrollTop ?? 0; },
    set scrollTop(v) { if (this._view.contentDOM) this._view.contentDOM.scrollTop = v; },
    get scrollHeight() { return this._read().scrollHeight; },
    setSelectionRange(a, b) { this._setState({ selection: { head: b, anchor: a } }); },
    addEventListener(type, handler) {
        if (type === 'input') {
            inputHandlers.push(handler);
            return;
        }
        this._view.contentDOM.addEventListener(type, handler);
    },
    removeEventListener(type, handler) {
        if (type === 'input') {
            const idx = inputHandlers.indexOf(handler);
            if (idx >= 0) inputHandlers.splice(idx, 1);
            return;
        }
        this._view.contentDOM.removeEventListener(type, handler);
    },
    dispatchEvent(event) {
        // fire document 'input' listeners for compatibility/shimming paths.
        for (const handler of inputHandlers) handler(event);
    },
    dispatchUpdateForTest(v) { this.dispatchEvent(v); }
};

const DEFAULT_EXTENSIONS = [
    highlightSpecialChars(),
    drawSelection(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    keymap.of(vim()),
    markdown(),
    highlightSelectionMatches(),
    oneDark,
    EditorView.baseTheme({
        '&': {
            height: '100%'
        },
        '.cm-scroller': {
            overflow: 'auto'
        },
        '.cm-content': {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
        }
    }),
    EditorState.readOnly.of(false),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
        if (update.docChanged) {
            cmVmixin.dispatchEvent({ target: cmVmixin });
        }
    })
];

export function createView(container, doc = '') {
    if (!container) throw new Error('createView requires a container element');

    const state = EditorState.create({
        doc,
        extensions: DEFAULT_EXTENSIONS
    });

    const view = new EditorView({
        state,
        parent: container
    });

    const adapter = Object.create(cmVmixin);
    adapter._view = view;
    return adapter;
}
