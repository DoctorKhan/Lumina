// Minimal CM6 toggle helper.
// Keeps legacy `#editor` intact in main.js; only adds optional mode switching.
let mode = 'textarea';
let view = null;
let cm6Module = null;

const textarea = () => document.getElementById('editor');
const host = () => document.getElementById('editor-cm6-host');

async function loadCm6() {
  if (!cm6Module) {
    cm6Module = await import('./editorCm6.js');
  }
  return cm6Module;
}

export function getCurrentMode() {
  return mode;
}

export function activeEditorNode() {
  if (mode === 'cm6' && view) {
    return view.editorDOM || host();
  }
  return textarea();
}

export function isEditorFocused() {
  if (mode === 'cm6' && view) {
    return Boolean(view.hasFocus?.());
  }
  return document.activeElement === textarea();
}

export async function initEditorToggle() {
  let available = false;
  try {
    await loadCm6();
    available = true;
  } catch {
    available = false;
  }
  const textEl = textarea();
  const hostEl = host();
  if (textEl) textEl.classList.toggle('hidden', false);
  if (hostEl) hostEl.classList.toggle('hidden', true);
  const btn = document.getElementById('toggle-editor-mode-btn');
  if (btn) {
    btn.classList.toggle('hidden', !available);
    btn.textContent = 'Editor: textarea';
    btn.setAttribute('aria-pressed', 'false');
  }
  return available;
}

export async function toggleEditorMode() {
  const next = mode === 'cm6' ? 'textarea' : 'cm6';
  if (next === 'cm6') {
    const mod = await loadCm6();
    const container = host();
    if (!container) {
      console.warn('editorApi: missing #editor-cm6-host; staying in textarea mode.');
      return mode;
    }
    const textEl = textarea();
    const doc = textEl?.value ?? '';
    const scroll = textEl?.scrollTop ?? 0;
    const created = mod.createView(container, {
      doc,
      highlightedValue: '',
      scrollTop: scroll,
      focus: false
    });
    view = created;
    if (textEl) textEl.classList.add('hidden');
    container.classList.remove('hidden');
    mode = 'cm6';
  } else {
    const textEl = textarea();
    if (textEl && view) {
      try {
        textEl.value = view.editorDOM?.textContent ?? textEl.value;
      } catch {
        // ignore
      }
    }
    destroyView();
    if (textEl) textEl.classList.remove('hidden');
    const hostEl = host();
    if (hostEl) hostEl.classList.add('hidden');
    mode = 'textarea';
  }
  const btn = document.getElementById('toggle-editor-mode-btn');
  if (btn) {
    btn.textContent = mode === 'cm6' ? 'Editor: CodeMirror 6' : 'Editor: textarea';
    btn.setAttribute('aria-pressed', String(mode === 'cm6'));
  }
  return mode;
}

function destroyView() {
  if (!view) return;
  try {
    cm6Module?.destroyView?.(view);
  } catch {
    // ignore cleanup errors
  }
  view = null;
}
